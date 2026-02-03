/**
 * Indeed Auto-Apply Module
 * 
 * Automates job applications on Indeed.
 * Handles Indeed's "Apply Now" and "Apply on company site" flows.
 * 
 * Features:
 * - Login with cookies/session persistence
 * - Indeed Apply (quick apply)
 * - Redirect to company ATS detection
 * - Form filling for multi-step applications
 * - Resume upload
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { UniversalFormFiller } = require('./universal-form-filler');
const { createLogger } = require('../logger');
const { sendTelegramNotification, TELEGRAM_EMOJIS } = require('../email-sender');

const logger = createLogger();

const COOKIES_PATH = path.join(process.cwd(), '.indeed-cookies.json');

class IndeedAutoApply {
    constructor(profile, options = {}) {
        this.profile = profile;
        this.options = options;
        this.browser = null;
        this.page = null;
        this.formFiller = new UniversalFormFiller(profile);
        this.stats = {
            applied: 0,
            failed: 0,
            skipped: 0,
            redirected: 0
        };
    }

    async init() {
        logger.info('🔧 Initializing Indeed Auto-Apply...');
        
        this.browser = await puppeteer.launch({
            headless: this.options.headless !== false ? 'new' : false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ]
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Load cookies if available
        await this.loadCookies();
    }

    async loadCookies() {
        if (fs.existsSync(COOKIES_PATH)) {
            try {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
                await this.page.setCookie(...cookies);
                logger.info('   Loaded saved cookies');
            } catch (e) {
                logger.warn('   Could not load cookies');
            }
        }
    }

    async saveCookies() {
        try {
            const cookies = await this.page.cookies();
            fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        } catch (e) {
            logger.warn('   Could not save cookies');
        }
    }

    /**
     * Login to Indeed
     */
    async login(email, password) {
        logger.info('🔐 Logging into Indeed...');
        
        await this.page.goto('https://secure.indeed.com/account/login', {
            waitUntil: 'networkidle2'
        });

        // Check if already logged in
        if (await this.isLoggedIn()) {
            logger.info('   Already logged in!');
            return true;
        }

        try {
            // Enter email
            await this.page.waitForSelector('input[name="__email"]', { timeout: 5000 });
            await this.page.type('input[name="__email"]', email);
            
            // Click continue
            const continueBtn = await this.page.$('button[type="submit"]');
            if (continueBtn) await continueBtn.click();
            
            await new Promise(r => setTimeout(r, 2000));

            // Enter password
            await this.page.waitForSelector('input[name="__password"]', { timeout: 5000 });
            await this.page.type('input[name="__password"]', password);
            
            // Click sign in
            const signInBtn = await this.page.$('button[type="submit"]');
            if (signInBtn) await signInBtn.click();

            await this.page.waitForNavigation({ timeout: 30000 });
            await this.saveCookies();

            const loggedIn = await this.isLoggedIn();
            if (loggedIn) {
                logger.info('   ✅ Login successful!');
                await sendTelegramNotification(`${TELEGRAM_EMOJIS.success} Indeed login successful!`);
            }
            return loggedIn;
        } catch (e) {
            logger.error(`   Login failed: ${e.message}`);
            return false;
        }
    }

    async isLoggedIn() {
        try {
            await this.page.goto('https://www.indeed.com/my/inbox', { waitUntil: 'networkidle2' });
            const url = this.page.url();
            return !url.includes('account/login');
        } catch (e) {
            return false;
        }
    }

    /**
     * Search for jobs and apply
     */
    async searchAndApply(query, location, options = {}) {
        const { limit = 25, skipApplied = true, easyApplyOnly = false } = options;
        
        logger.info(`\n🔍 Searching Indeed: "${query}" in "${location}"`);
        await sendTelegramNotification(
            `${TELEGRAM_EMOJIS.search} Starting Indeed job search\n` +
            `📝 Query: ${query}\n` +
            `📍 Location: ${location}\n` +
            `🎯 Target: ${limit} applications`
        );

        const searchUrl = this.buildSearchUrl(query, location, easyApplyOnly);
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Get job listings
        const jobs = await this.extractJobListings();
        logger.info(`   Found ${jobs.length} job listings`);

        let applied = 0;
        for (const job of jobs) {
            if (applied >= limit) break;

            // Skip if already applied
            if (skipApplied && job.alreadyApplied) {
                this.stats.skipped++;
                continue;
            }

            logger.info(`\n📋 Applying to: ${job.title} at ${job.company}`);
            
            try {
                const result = await this.applyToJob(job);
                
                if (result.success) {
                    applied++;
                    this.stats.applied++;
                    await sendTelegramNotification(
                        `${TELEGRAM_EMOJIS.success} Applied on Indeed!\n` +
                        `💼 ${job.title}\n` +
                        `🏢 ${job.company}\n` +
                        `📍 ${job.location}`
                    );
                } else if (result.redirected) {
                    this.stats.redirected++;
                    logger.info(`   ↗️ Redirected to company site`);
                } else {
                    this.stats.failed++;
                }
            } catch (e) {
                logger.error(`   Application failed: ${e.message}`);
                this.stats.failed++;
            }
        }

        await this.logStats();
        return this.stats;
    }

    buildSearchUrl(query, location, easyApplyOnly) {
        const params = new URLSearchParams({
            q: query,
            l: location,
            sort: 'date',  // Most recent first
            fromage: '7'   // Last 7 days
        });

        if (easyApplyOnly) {
            params.append('indeedapply', '1');
        }

        return `https://www.indeed.com/jobs?${params.toString()}`;
    }

    async extractJobListings() {
        return await this.page.evaluate(() => {
            const listings = [];
            const cards = document.querySelectorAll('.job_seen_beacon, .jobsearch-ResultsList > li');

            for (const card of cards) {
                try {
                    const titleEl = card.querySelector('.jobTitle, h2.jobTitle a');
                    const companyEl = card.querySelector('[data-testid="company-name"], .companyName');
                    const locationEl = card.querySelector('[data-testid="text-location"], .companyLocation');
                    const linkEl = card.querySelector('a.jcs-JobTitle, h2.jobTitle a');
                    const appliedEl = card.querySelector('.applied-snippet');
                    const easyApplyEl = card.querySelector('.iaLabel, .indeed-apply-badge');

                    if (titleEl && linkEl) {
                        listings.push({
                            title: titleEl.textContent.trim(),
                            company: companyEl?.textContent.trim() || 'Unknown',
                            location: locationEl?.textContent.trim() || '',
                            url: linkEl.href,
                            alreadyApplied: !!appliedEl,
                            hasEasyApply: !!easyApplyEl
                        });
                    }
                } catch (e) {
                    // Skip malformed card
                }
            }

            return listings;
        });
    }

    async applyToJob(job) {
        // Navigate to job page
        await this.page.goto(job.url, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));

        // Look for apply button
        const applyButton = await this.findApplyButton();
        if (!applyButton) {
            return { success: false, reason: 'No apply button found' };
        }

        // Check if it's Indeed Apply or external
        const buttonText = await this.page.evaluate(el => el.textContent, applyButton);
        const isIndeedApply = buttonText.toLowerCase().includes('apply now') && 
                             !buttonText.toLowerCase().includes('company site');

        await applyButton.click();
        await new Promise(r => setTimeout(r, 3000));

        if (isIndeedApply) {
            return this.handleIndeedApply(job);
        } else {
            return this.handleExternalApply(job);
        }
    }

    async findApplyButton() {
        const selectors = [
            'button[id*="indeedApply"]',
            '#applyButtonLinkContainer button',
            'button[aria-label*="Apply"]',
            '.jobsearch-IndeedApplyButton',
            '#indeedApplyButton',
            'button:has-text("Apply now")'
        ];

        for (const selector of selectors) {
            try {
                const button = await this.page.$(selector);
                if (button) return button;
            } catch (e) {}
        }

        // Fallback: search by text
        return await this.page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, a.ia-IndeedApplyButton'));
            return buttons.find(b => 
                b.textContent.toLowerCase().includes('apply')
            );
        });
    }

    async handleIndeedApply(job) {
        logger.info('   📝 Using Indeed Apply...');

        // Wait for modal/iframe
        await new Promise(r => setTimeout(r, 2000));

        // Check for iframe (Indeed often uses an iframe for the apply form)
        const frames = await this.page.frames();
        let applyFrame = frames.find(f => f.url().includes('indeedapply') || f.url().includes('apply'));
        
        const targetPage = applyFrame || this.page;

        // Fill the application
        let pageNum = 1;
        const maxPages = 10;

        while (pageNum <= maxPages) {
            logger.info(`   Filling page ${pageNum}...`);

            // Fill form fields
            await this.fillIndeedForm(targetPage, job);
            await new Promise(r => setTimeout(r, 1000));

            // Look for continue/submit button
            const { isSubmit, button } = await this.findFormNavButton(targetPage);

            if (!button) {
                break;
            }

            await button.click();
            await new Promise(r => setTimeout(r, 2000));

            if (isSubmit) {
                // Check for success
                const success = await this.checkApplicationSuccess(targetPage);
                return { success, reason: success ? 'Applied via Indeed Apply' : 'Submit may have failed' };
            }

            pageNum++;
        }

        return { success: false, reason: 'Could not complete application' };
    }

    async fillIndeedForm(page, job) {
        // Get all visible inputs
        const fields = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
            return inputs.filter(el => el.offsetParent !== null).map(el => ({
                type: el.type || el.tagName.toLowerCase(),
                name: el.name,
                id: el.id,
                label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ||
                       el.getAttribute('aria-label') || el.placeholder || el.name
            }));
        });

        for (const field of fields) {
            const value = this.getValueForField(field);
            if (value) {
                await this.fillField(page, field, value);
            }
        }

        // Handle resume upload
        await this.uploadResume(page);
    }

    getValueForField(field) {
        const label = (field.label || field.name || '').toLowerCase();
        
        if (label.includes('phone')) return this.profile.phone;
        if (label.includes('email')) return this.profile.email;
        if (label.includes('name') && label.includes('first')) return this.profile.first_name;
        if (label.includes('name') && label.includes('last')) return this.profile.last_name;
        if (label.includes('city')) return this.profile.city;
        if (label.includes('state')) return this.profile.state;
        if (label.includes('zip') || label.includes('postal')) return this.profile.zip;
        if (label.includes('linkedin')) return this.profile.linkedin;
        if (label.includes('github')) return this.profile.github;
        if (label.includes('experience') && label.includes('year')) return this.profile.years_experience || '2';
        
        // Work authorization - typically yes/no
        if (label.includes('authorized') || label.includes('legally')) return 'Yes';
        if (label.includes('sponsor')) return 'No';
        
        return null;
    }

    async fillField(page, field, value) {
        try {
            const selector = field.id ? `#${field.id}` : `[name="${field.name}"]`;
            await page.waitForSelector(selector, { timeout: 2000 });

            if (field.type === 'select' || field.type === 'select-one') {
                // For selects, try to find matching option
                await page.evaluate((sel, val) => {
                    const select = document.querySelector(sel);
                    if (select) {
                        const options = Array.from(select.options);
                        const match = options.find(o => 
                            o.text.toLowerCase().includes(val.toLowerCase()) ||
                            o.value.toLowerCase() === val.toLowerCase()
                        );
                        if (match) select.value = match.value;
                    }
                }, selector, value);
            } else if (field.type === 'radio') {
                // Click radio matching value
                await page.evaluate((name, val) => {
                    const radios = document.querySelectorAll(`input[name="${name}"]`);
                    for (const r of radios) {
                        const label = document.querySelector(`label[for="${r.id}"]`)?.textContent?.toLowerCase() || r.value.toLowerCase();
                        if (label.includes(val.toLowerCase())) {
                            r.click();
                            break;
                        }
                    }
                }, field.name, value);
            } else {
                // Text input
                await page.click(selector, { clickCount: 3 });
                await page.type(selector, String(value));
            }
        } catch (e) {
            // Field not found or not fillable
        }
    }

    async uploadResume(page) {
        try {
            const fileInput = await page.$('input[type="file"]');
            if (fileInput && this.profile.resume_path && fs.existsSync(this.profile.resume_path)) {
                await fileInput.uploadFile(this.profile.resume_path);
                logger.info('   📎 Uploaded resume');
            }
        } catch (e) {
            logger.warn(`   Could not upload resume: ${e.message}`);
        }
    }

    async findFormNavButton(page) {
        // Look for continue or submit button
        const buttons = await page.evaluate(() => {
            const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            return allButtons.map(b => ({
                text: (b.textContent || b.value || '').toLowerCase().trim(),
                id: b.id,
                type: b.type
            }));
        });

        const submitTexts = ['submit', 'apply', 'send', 'finish', 'complete'];
        const continueTexts = ['continue', 'next', 'proceed'];

        for (const btn of buttons) {
            if (submitTexts.some(t => btn.text.includes(t))) {
                const selector = btn.id ? `#${btn.id}` : `button:has-text("${btn.text}")`;
                const element = await page.$(selector);
                if (element) return { isSubmit: true, button: element };
            }
        }

        for (const btn of buttons) {
            if (continueTexts.some(t => btn.text.includes(t))) {
                const selector = btn.id ? `#${btn.id}` : `button:has-text("${btn.text}")`;
                const element = await page.$(selector);
                if (element) return { isSubmit: false, button: element };
            }
        }

        return { isSubmit: false, button: null };
    }

    async checkApplicationSuccess(page) {
        // Look for success indicators
        const successIndicators = [
            'application submitted',
            'application sent',
            'successfully applied',
            'thank you for applying',
            'application complete'
        ];

        const pageText = await page.evaluate(() => document.body.textContent.toLowerCase());
        return successIndicators.some(ind => pageText.includes(ind));
    }

    async handleExternalApply(job) {
        logger.info('   ↗️ External application - redirecting...');
        
        // Wait for new tab/redirect
        await new Promise(r => setTimeout(r, 3000));
        
        const currentUrl = this.page.url();
        
        // Use universal form filler on the external page
        try {
            await this.formFiller.fillForm(this.page, {
                companyName: job.company,
                jobTitle: job.title
            });

            // Try to submit
            const submitButton = await this.formFiller.findSubmitButton(this.page);
            if (submitButton) {
                // Don't auto-submit external - too risky
                logger.info('   ⚠️ External form filled but not submitted (manual review recommended)');
            }
        } catch (e) {
            logger.warn(`   Could not fill external form: ${e.message}`);
        }

        return { success: false, redirected: true, url: currentUrl };
    }

    async logStats() {
        logger.info('\n📊 Indeed Application Stats:');
        logger.info(`   ✅ Applied: ${this.stats.applied}`);
        logger.info(`   ❌ Failed: ${this.stats.failed}`);
        logger.info(`   ⏭️ Skipped: ${this.stats.skipped}`);
        logger.info(`   ↗️ Redirected: ${this.stats.redirected}`);

        await sendTelegramNotification(
            `${TELEGRAM_EMOJIS.stats} Indeed Session Complete\n` +
            `✅ Applied: ${this.stats.applied}\n` +
            `❌ Failed: ${this.stats.failed}\n` +
            `⏭️ Skipped: ${this.stats.skipped}\n` +
            `↗️ External: ${this.stats.redirected}`
        );
    }

    async close() {
        await this.saveCookies();
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = { IndeedAutoApply };
