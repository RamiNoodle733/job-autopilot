/**
 * LinkedIn Auto-Apply Module - Job Application Autopilot Pro
 * 
 * Features:
 * - Puppeteer automation for LinkedIn Easy Apply
 * - Fill forms: name, email, phone, resume upload
 * - Answer common questions (experience level, sponsorship, etc.)
 * - Handle "Apply" vs "Easy Apply" buttons
 * - Rate limiting to avoid bans
 * - Session persistence for avoiding re-login
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

// Configuration
const LINKEDIN_COOKIES_PATH = path.join(__dirname, '../../data/linkedin-cookies.json');
const DEFAULT_DELAY_MS = 2000 + Math.random() * 3000; // 2-5 seconds between actions
const MAX_APPLICATIONS_PER_SESSION = 25; // LinkedIn rate limit protection
const TYPING_DELAY = 50 + Math.random() * 100; // Human-like typing

// Common Easy Apply Questions & Answers (customize these)
const DEFAULT_ANSWERS = {
    // Experience questions
    'years of experience': '5',
    'experience with': 'Yes',
    'proficient': 'Yes',
    'familiar': 'Yes',
    
    // Authorization questions
    'authorized to work': 'Yes',
    'legally authorized': 'Yes',
    'work authorization': 'Yes',
    'right to work': 'Yes',
    
    // Sponsorship questions
    'require sponsorship': 'No',
    'need sponsorship': 'No',
    'visa sponsorship': 'No',
    'immigration sponsorship': 'No',
    
    // Location questions
    'willing to relocate': 'Yes',
    'relocate': 'Yes',
    'work remotely': 'Yes',
    'remote work': 'Yes',
    'hybrid': 'Yes',
    'on-site': 'Yes',
    
    // Education
    'bachelor': 'Yes',
    'master': 'No',
    'degree': 'Yes',
    
    // Salary (leave blank or put range)
    'salary expectation': '',
    'desired salary': '',
    
    // Availability
    'start date': 'Immediately',
    'notice period': '2 weeks',
    'available': 'Yes',
    
    // Other
    'referred': 'No',
    'previously applied': 'No',
    'criminal': 'No',
    'background check': 'Yes',
    'drug test': 'Yes',
    'veteran': 'No',
    'disability': 'Prefer not to answer',
    'gender': 'Prefer not to answer',
    'race': 'Prefer not to answer',
    'ethnicity': 'Prefer not to answer'
};

class LinkedInAutoApply {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.applicationsThisSession = 0;
        this.options = {
            headless: options.headless ?? false, // Run with UI by default for debugging
            slowMo: options.slowMo ?? 50,
            resumePath: options.resumePath,
            userAnswers: { ...DEFAULT_ANSWERS, ...options.userAnswers },
            profile: options.profile || {
                firstName: 'Rami',
                lastName: 'Abdelrazzaq',
                email: 'ramiabdelrazzaq@gmail.com',
                phone: '',
                city: 'Katy',
                state: 'TX'
            },
            maxApps: options.maxApps || MAX_APPLICATIONS_PER_SESSION,
            delayBetweenApps: options.delayBetweenApps || 30000, // 30 seconds minimum
        };
    }
    
    /**
     * Initialize browser with persistent session
     */
    async init() {
        console.log('🌐 Initializing LinkedIn automation...');
        
        this.browser = await puppeteer.launch({
            headless: this.options.headless,
            slowMo: this.options.slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1366,768'
            ],
            defaultViewport: { width: 1366, height: 768 }
        });
        
        this.page = await this.browser.newPage();
        
        // Set user agent to avoid detection
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        
        // Load saved cookies if available
        await this.loadCookies();
        
        return this;
    }
    
    /**
     * Save cookies for session persistence
     */
    async saveCookies() {
        const cookies = await this.page.cookies();
        await fs.ensureDir(path.dirname(LINKEDIN_COOKIES_PATH));
        await fs.writeJson(LINKEDIN_COOKIES_PATH, cookies);
        console.log('  ✓ Session cookies saved');
    }
    
    /**
     * Load saved cookies
     */
    async loadCookies() {
        try {
            if (await fs.pathExists(LINKEDIN_COOKIES_PATH)) {
                const cookies = await fs.readJson(LINKEDIN_COOKIES_PATH);
                await this.page.setCookie(...cookies);
                console.log('  ✓ Loaded saved session');
                return true;
            }
        } catch (e) {
            console.log('  ℹ️  No saved session found');
        }
        return false;
    }
    
    /**
     * Check if currently logged in
     */
    async checkLoginStatus() {
        await this.page.goto('https://www.linkedin.com/feed/', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        const isLoggedIn = await this.page.evaluate(() => {
            return !document.querySelector('.sign-in-form') && 
                   !window.location.href.includes('/login') &&
                   !window.location.href.includes('/authwall');
        });
        
        this.isLoggedIn = isLoggedIn;
        return isLoggedIn;
    }
    
    /**
     * Login to LinkedIn (requires manual intervention for security)
     */
    async login(email, password) {
        console.log('\n🔐 LinkedIn Login Required');
        
        await this.page.goto('https://www.linkedin.com/login', {
            waitUntil: 'networkidle2'
        });
        
        // Fill email
        await this.page.waitForSelector('#username');
        await this.page.type('#username', email, { delay: TYPING_DELAY });
        
        // Fill password
        await this.page.type('#password', password, { delay: TYPING_DELAY });
        
        // Click sign in
        await this.page.click('.login__form_action_container button');
        
        // Wait for navigation or challenge
        console.log('  ⏳ Waiting for login...');
        console.log('  ⚠️  If prompted, complete CAPTCHA or 2FA manually');
        
        try {
            await this.page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 120000 // 2 minutes for manual verification
            });
        } catch (e) {
            // May have navigated already
        }
        
        // Check if login successful
        const success = await this.checkLoginStatus();
        
        if (success) {
            console.log('  ✅ Login successful!');
            await this.saveCookies();
        } else {
            console.log('  ❌ Login failed. Check credentials or complete verification.');
        }
        
        return success;
    }
    
    /**
     * Navigate to job search with filters
     */
    async searchJobs(query, location, easyApplyOnly = true) {
        console.log(`\n🔍 Searching: "${query}" in "${location}"`);
        
        let url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
        
        if (easyApplyOnly) {
            url += '&f_AL=true'; // Easy Apply filter
        }
        
        // Additional filters for recency
        url += '&f_TPR=r604800'; // Past week
        
        await this.page.goto(url, { waitUntil: 'networkidle2' });
        await this.delay(2000);
        
        return url;
    }
    
    /**
     * Get list of jobs on current page
     */
    async getJobListings() {
        return this.page.evaluate(() => {
            const jobs = [];
            const cards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');
            
            cards.forEach((card, index) => {
                const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link');
                const companyEl = card.querySelector('.job-card-container__company-name, .job-card-container__primary-description');
                const locationEl = card.querySelector('.job-card-container__metadata-item');
                const easyApply = card.querySelector('.job-card-container__apply-method') !== null;
                const jobId = card.getAttribute('data-job-id') || card.getAttribute('data-occludable-job-id');
                
                if (titleEl) {
                    jobs.push({
                        index,
                        title: titleEl.textContent?.trim() || 'Unknown',
                        company: companyEl?.textContent?.trim() || 'Unknown',
                        location: locationEl?.textContent?.trim() || 'Unknown',
                        easyApply,
                        jobId,
                        url: titleEl.href || null
                    });
                }
            });
            
            return jobs;
        });
    }
    
    /**
     * Click on a job to view details
     */
    async selectJob(index) {
        const jobCards = await this.page.$$('.job-card-container, .jobs-search-results__list-item');
        if (jobCards[index]) {
            await jobCards[index].click();
            await this.delay(2000);
            return true;
        }
        return false;
    }
    
    /**
     * Check if Easy Apply is available for current job
     */
    async isEasyApplyAvailable() {
        return this.page.evaluate(() => {
            const applyBtn = document.querySelector('.jobs-apply-button');
            if (!applyBtn) return false;
            return applyBtn.textContent?.includes('Easy Apply') ?? false;
        });
    }
    
    /**
     * Click Easy Apply button
     */
    async clickEasyApply() {
        const button = await this.page.$('.jobs-apply-button');
        if (button) {
            await button.click();
            await this.delay(2000);
            return true;
        }
        return false;
    }
    
    /**
     * Fill out the Easy Apply form
     */
    async fillEasyApplyForm() {
        const results = {
            filled: [],
            skipped: [],
            errors: []
        };
        
        try {
            // Wait for modal
            await this.page.waitForSelector('.jobs-easy-apply-modal, .jobs-easy-apply-content', { timeout: 10000 });
            
            let hasNextButton = true;
            let attempts = 0;
            const maxAttempts = 10; // Prevent infinite loops
            
            while (hasNextButton && attempts < maxAttempts) {
                attempts++;
                
                // Upload resume if requested
                await this.handleResumeUpload();
                
                // Fill text inputs
                await this.fillTextInputs(results);
                
                // Handle dropdowns/selects
                await this.handleDropdowns(results);
                
                // Handle radio buttons
                await this.handleRadioButtons(results);
                
                // Handle checkboxes
                await this.handleCheckboxes(results);
                
                // Check for Next/Review/Submit button
                const nextBtn = await this.findButton(['Next', 'Continue', 'Review']);
                const submitBtn = await this.findButton(['Submit application', 'Submit']);
                
                if (submitBtn) {
                    // Final step - submit
                    await submitBtn.click();
                    await this.delay(3000);
                    
                    // Check for success
                    const success = await this.page.evaluate(() => {
                        return document.body.textContent?.includes('Application sent') ||
                               document.body.textContent?.includes('application was sent') ||
                               document.querySelector('.artdeco-modal__dismiss');
                    });
                    
                    return { success, ...results };
                } else if (nextBtn) {
                    await nextBtn.click();
                    await this.delay(2000);
                } else {
                    hasNextButton = false;
                }
            }
            
            return { success: false, error: 'Could not complete form', ...results };
            
        } catch (error) {
            return { success: false, error: error.message, ...results };
        }
    }
    
    /**
     * Handle resume upload
     */
    async handleResumeUpload() {
        if (!this.options.resumePath) return;
        
        try {
            const uploadInput = await this.page.$('input[type="file"]');
            if (uploadInput) {
                await uploadInput.uploadFile(this.options.resumePath);
                console.log('    📄 Resume uploaded');
                await this.delay(2000);
            }
        } catch (e) {
            // Resume may already be selected from profile
        }
    }
    
    /**
     * Fill text inputs based on label matching
     */
    async fillTextInputs(results) {
        const inputs = await this.page.$$('.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal textarea');
        
        for (const input of inputs) {
            try {
                const label = await input.evaluate(el => {
                    const labelEl = el.closest('.fb-dash-form-element')?.querySelector('label') ||
                                   document.querySelector(`label[for="${el.id}"]`);
                    return labelEl?.textContent?.toLowerCase() || '';
                });
                
                const currentValue = await input.evaluate(el => el.value);
                if (currentValue) continue; // Already filled
                
                let value = this.findAnswer(label);
                
                // Special handling for known fields
                if (label.includes('phone') || label.includes('mobile')) {
                    value = this.options.profile.phone;
                } else if (label.includes('email')) {
                    value = this.options.profile.email;
                } else if (label.includes('city')) {
                    value = this.options.profile.city;
                } else if (label.includes('first name')) {
                    value = this.options.profile.firstName;
                } else if (label.includes('last name')) {
                    value = this.options.profile.lastName;
                }
                
                if (value) {
                    await input.click({ clickCount: 3 }); // Select all
                    await input.type(value, { delay: TYPING_DELAY });
                    results.filled.push(label);
                }
            } catch (e) {
                results.errors.push(e.message);
            }
        }
    }
    
    /**
     * Handle dropdown/select elements
     */
    async handleDropdowns(results) {
        const selects = await this.page.$$('.jobs-easy-apply-modal select');
        
        for (const select of selects) {
            try {
                const label = await select.evaluate(el => {
                    const labelEl = el.closest('.fb-dash-form-element')?.querySelector('label');
                    return labelEl?.textContent?.toLowerCase() || '';
                });
                
                const options = await select.evaluate(el => 
                    Array.from(el.options).map(o => ({ value: o.value, text: o.text.toLowerCase() }))
                );
                
                // Find best matching option
                let answer = this.findAnswer(label);
                
                // Try to match answer to option
                const matchingOption = options.find(o => 
                    o.text.includes(answer?.toLowerCase() || '') ||
                    answer?.toLowerCase().includes(o.text)
                );
                
                if (matchingOption) {
                    await select.select(matchingOption.value);
                    results.filled.push(label);
                } else if (options.length > 1) {
                    // Select first non-empty option as fallback
                    const firstValid = options.find(o => o.value && o.text !== 'select');
                    if (firstValid) {
                        await select.select(firstValid.value);
                        results.filled.push(label + ' (fallback)');
                    }
                }
            } catch (e) {
                results.errors.push(e.message);
            }
        }
    }
    
    /**
     * Handle radio buttons
     */
    async handleRadioButtons(results) {
        const radioGroups = await this.page.$$('.jobs-easy-apply-modal fieldset');
        
        for (const group of radioGroups) {
            try {
                const legend = await group.evaluate(el => 
                    el.querySelector('legend, span.visually-hidden')?.textContent?.toLowerCase() || ''
                );
                
                const answer = this.findAnswer(legend);
                
                const radios = await group.$$('input[type="radio"]');
                for (const radio of radios) {
                    const radioLabel = await radio.evaluate(el => {
                        const label = el.nextElementSibling || el.closest('label');
                        return label?.textContent?.toLowerCase() || '';
                    });
                    
                    if (radioLabel.includes(answer?.toLowerCase() || '')) {
                        await radio.click();
                        results.filled.push(legend);
                        break;
                    }
                }
            } catch (e) {
                results.errors.push(e.message);
            }
        }
    }
    
    /**
     * Handle checkboxes (agreements, etc.)
     */
    async handleCheckboxes(results) {
        const checkboxes = await this.page.$$('.jobs-easy-apply-modal input[type="checkbox"]');
        
        for (const checkbox of checkboxes) {
            try {
                const isRequired = await checkbox.evaluate(el => el.required);
                const isChecked = await checkbox.evaluate(el => el.checked);
                
                if (isRequired && !isChecked) {
                    await checkbox.click();
                    results.filled.push('agreement checkbox');
                }
            } catch (e) {
                // Checkbox may be hidden or disabled
            }
        }
    }
    
    /**
     * Find a button by text
     */
    async findButton(texts) {
        for (const text of texts) {
            // Prefer aria-label contains
            const ariaBtn = await this.page.$(`button[aria-label*="${text}"]`);
            if (ariaBtn) return ariaBtn;

            // Fallback: search visible button text (Puppeteer does not support :has-text)
            const handle = await this.page.evaluateHandle((searchText) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => (b.textContent || '').trim().includes(searchText)) || null;
            }, text);

            const el = handle.asElement();
            if (el) return el;
        }
        return null;
    }
    
    /**
     * Find answer for a question based on keywords
     */
    findAnswer(questionText) {
        const q = questionText.toLowerCase();
        
        for (const [keyword, answer] of Object.entries(this.options.userAnswers)) {
            if (q.includes(keyword.toLowerCase())) {
                return answer;
            }
        }
        
        return null;
    }
    
    /**
     * Close Easy Apply modal if open
     */
    async closeModal() {
        try {
            const closeBtn = await this.page.$('.artdeco-modal__dismiss, [aria-label="Dismiss"]');
            if (closeBtn) {
                await closeBtn.click();
                await this.delay(1000);
                
                // Handle discard confirmation
                const discardBtn = await this.page.$('[data-control-name="discard_application_confirm_btn"]');
                if (discardBtn) {
                    await discardBtn.click();
                    await this.delay(1000);
                }
            }
        } catch (e) {
            // Modal may already be closed
        }
    }
    
    /**
     * Apply to a specific job (main method)
     */
    async applyToJob(jobUrl) {
        console.log(`\n📝 Applying to job...`);
        
        if (this.applicationsThisSession >= this.options.maxApps) {
            return { 
                success: false, 
                error: 'Daily application limit reached',
                rateLimited: true 
            };
        }
        
        try {
            // Navigate to job
            await this.page.goto(jobUrl, { waitUntil: 'networkidle2' });
            await this.delay(2000);
            
            // Check if Easy Apply
            const isEasyApply = await this.isEasyApplyAvailable();
            if (!isEasyApply) {
                return { success: false, error: 'Not an Easy Apply job', skipReason: 'external' };
            }
            
            // Click Easy Apply
            await this.clickEasyApply();
            
            // Fill form
            const result = await this.fillEasyApplyForm();
            
            if (result.success) {
                this.applicationsThisSession++;
                console.log(`    ✅ Application submitted! (${this.applicationsThisSession}/${this.options.maxApps})`);
            } else {
                console.log(`    ❌ Application failed: ${result.error}`);
                await this.closeModal();
            }
            
            return result;
            
        } catch (error) {
            console.log(`    ❌ Error: ${error.message}`);
            await this.closeModal();
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Mass apply to jobs matching search
     */
    async massApply(query, location, limit = 10) {
        console.log(`\n🚀 Starting mass apply: ${limit} jobs`);
        console.log(`   Query: "${query}" | Location: "${location}"`);
        
        const results = {
            applied: [],
            skipped: [],
            failed: [],
            total: 0
        };
        
        if (!this.isLoggedIn) {
            if (!(await this.checkLoginStatus())) {
                return { error: 'Not logged in. Run login() first.', ...results };
            }
        }
        
        // Search jobs
        await this.searchJobs(query, location, true);
        
        let processed = 0;
        let pageNum = 1;
        
        while (processed < limit && pageNum <= 10) {
            console.log(`\n📃 Processing page ${pageNum}...`);
            
            const jobs = await this.getJobListings();
            console.log(`   Found ${jobs.length} jobs on this page`);
            
            for (const job of jobs) {
                if (processed >= limit) break;
                
                console.log(`\n[${processed + 1}/${limit}] ${job.title} @ ${job.company}`);
                
                // Apply rate limiting delay
                if (processed > 0) {
                    const delay = this.options.delayBetweenApps + Math.random() * 10000;
                    console.log(`   ⏳ Waiting ${Math.round(delay / 1000)}s (rate limit protection)...`);
                    await this.delay(delay);
                }
                
                // Select job
                await this.selectJob(job.index);
                
                // Try to apply
                const result = await this.applyToJob(this.page.url());
                
                if (result.success) {
                    results.applied.push({
                        title: job.title,
                        company: job.company,
                        location: job.location,
                        jobId: job.jobId
                    });
                } else if (result.skipReason) {
                    results.skipped.push({
                        ...job,
                        reason: result.skipReason
                    });
                } else {
                    results.failed.push({
                        ...job,
                        error: result.error
                    });
                }
                
                processed++;
                results.total = processed;
                
                // Check rate limit
                if (result.rateLimited) {
                    console.log('\n⚠️  Rate limit reached. Stopping.');
                    break;
                }
            }
            
            // Try next page
            const nextButton = await this.page.$('[aria-label="Page \\d+"], button[aria-label*="next"]');
            if (nextButton) {
                await nextButton.click();
                await this.delay(3000);
                pageNum++;
            } else {
                break;
            }
        }
        
        console.log('\n📊 Mass Apply Complete:');
        console.log(`   ✅ Applied: ${results.applied.length}`);
        console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
        console.log(`   ❌ Failed: ${results.failed.length}`);
        
        return results;
    }
    
    /**
     * Helper delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Close browser
     */
    async close() {
        if (this.browser) {
            await this.saveCookies();
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

// Export for use in orchestrator
module.exports = { LinkedInAutoApply, DEFAULT_ANSWERS };
