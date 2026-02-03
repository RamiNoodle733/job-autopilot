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

// Telegram notifier (optional - used in GitHub Actions)
let telegramNotifier = null;
try {
    telegramNotifier = require('../telegram-notifier.js');
} catch (e) {
    // Telegram notifier not available
}

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
            autoSubmit: options.autoSubmit ?? false,
            dryRun: options.dryRun ?? false,
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
                '--window-size=1366,768',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ],
            defaultViewport: { width: 1366, height: 768 },
            timeout: 60000
        });
        
        this.page = await this.browser.newPage();
        
        // Set longer default timeout
        this.page.setDefaultTimeout(60000);
        this.page.setDefaultNavigationTimeout(60000);
        
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
        try {
            // First check current URL
            const currentUrl = this.page.url();
            if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
                this.isLoggedIn = false;
                return false;
            }
            
            // If already on feed or jobs, check for login indicators
            if (currentUrl.includes('/feed') || currentUrl.includes('/jobs')) {
                const isLoggedIn = await this.page.evaluate(() => {
                    return !document.querySelector('.sign-in-form') && 
                           !document.querySelector('form[class*="login"]');
                });
                this.isLoggedIn = isLoggedIn;
                return isLoggedIn;
            }
            
            // Navigate to feed to verify login
            await this.page.goto('https://www.linkedin.com/feed/', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for page to settle
            await this.delay(2000);
            
            const finalUrl = this.page.url();
            const isLoggedIn = !finalUrl.includes('/login') && 
                               !finalUrl.includes('/authwall') &&
                               !finalUrl.includes('/checkpoint');
            
            this.isLoggedIn = isLoggedIn;
            return isLoggedIn;
        } catch (error) {
            console.log('  ⚠️  Error checking login status:', error.message);
            this.isLoggedIn = false;
            return false;
        }
    }
    
    /**
     * Login to LinkedIn (requires manual intervention for security)
     */
    async login(email, password) {
        console.log('\n🔐 LinkedIn Login Required');
        
        try {
            await this.page.goto('https://www.linkedin.com/login', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Wait for form
            await this.page.waitForSelector('#username', { timeout: 10000 });
            
            // Clear and fill email
            await this.page.click('#username', { clickCount: 3 });
            await this.page.type('#username', email, { delay: TYPING_DELAY });
            
            // Clear and fill password
            await this.page.click('#password', { clickCount: 3 });
            await this.page.type('#password', password, { delay: TYPING_DELAY });
            
            // Click sign in
            console.log('  📝 Submitting credentials...');
            await Promise.all([
                this.page.click('.login__form_action_container button'),
                this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {})
            ]);
            
            // Wait for potential security challenges
            console.log('  ⏳ Waiting for login response...');
            console.log('  ⚠️  If prompted, complete CAPTCHA or 2FA manually');
            
            await this.delay(5000);
            
            // Check for security checkpoint
            const currentUrl = this.page.url();
            if (currentUrl.includes('/checkpoint')) {
                console.log('  🔒 Security checkpoint detected. Waiting 60s for manual verification...');
                await this.delay(60000);
            }
            
            // Verify login
            const success = await this.checkLoginStatus();
            
            if (success) {
                console.log('  ✅ Login successful!');
                await this.saveCookies();
            } else {
                console.log('  ❌ Login failed. Check credentials or complete verification.');
            }
            
            return success;
        } catch (error) {
            console.log('  ❌ Login error:', error.message);
            return false;
        }
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
        
        try {
            await this.page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
            
            // Wait for job listings to appear
            await this.page.waitForSelector('.job-card-container, .jobs-search-results__list-item, .scaffold-layout__list-container', { 
                timeout: 30000 
            }).catch(() => {
                console.log('  ⚠️  Job listings may be slow to load');
            });
            
            await this.delay(3000);
        } catch (e) {
            console.log('  ⚠️  Search navigation issue:', e.message);
        }
        
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
        try {
            // Use page.evaluate to click directly in browser context
            const clicked = await this.page.evaluate((idx) => {
                const cards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');
                if (cards[idx]) {
                    const clickable = cards[idx].querySelector('a, .job-card-list__title') || cards[idx];
                    clickable.click();
                    return true;
                }
                return false;
            }, index);
            
            if (clicked) {
                await this.delay(2000);
                return true;
            }
            return false;
        } catch (e) {
            console.log('  ⚠️  Could not select job:', e.message);
            return false;
        }
    }
    
    /**
     * Check if Easy Apply is available for current job
     */
    async isEasyApplyAvailable() {
        return this.page.evaluate(() => {
            // Multiple possible selectors for Easy Apply button
            const selectors = [
                '.jobs-apply-button',
                'button[data-control-name="jobdetails_topcard_inapply"]',
                '.jobs-unified-top-card__apply-button',
                '[aria-label*="Easy Apply"]'
            ];
            
            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn && (btn.textContent?.toLowerCase().includes('easy apply') || 
                           btn.getAttribute('aria-label')?.toLowerCase().includes('easy apply'))) {
                    return true;
                }
            }
            return false;
        });
    }
    
    /**
     * Click Easy Apply button
     */
    async clickEasyApply() {
        try {
            const clicked = await this.page.evaluate(() => {
                const selectors = [
                    '.jobs-apply-button',
                    'button[data-control-name="jobdetails_topcard_inapply"]',
                    '.jobs-unified-top-card__apply-button',
                    '[aria-label*="Easy Apply"]'
                ];
                
                for (const selector of selectors) {
                    const btn = document.querySelector(selector);
                    if (btn && (btn.textContent?.toLowerCase().includes('easy apply') || 
                               btn.getAttribute('aria-label')?.toLowerCase().includes('easy apply'))) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (clicked) {
                await this.delay(2000);
                return true;
            }
            return false;
        } catch (e) {
            console.log('    ⚠️  Error clicking Easy Apply:', e.message);
            return false;
        }
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
            // Wait for modal to appear
            console.log('    ⏳ Waiting for Easy Apply modal...');
            
            // First check if we hit a login wall or other blocker
            const pageState = await this.page.evaluate(() => {
                const url = window.location.href;
                const hasLoginWall = url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint');
                const hasModal = !!document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal], .artdeco-modal');
                return { url, hasLoginWall, hasModal };
            });
            
            if (pageState.hasLoginWall) {
                console.log('    ⚠️  Login required - session may have expired');
                return { success: false, error: 'Login wall detected', ...results };
            }
            
            if (!pageState.hasModal) {
                // Wait longer for modal
                try {
                    await this.page.waitForSelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-test-modal], .artdeco-modal', { timeout: 20000 });
                    console.log('    ✓ Modal detected');
                } catch (e) {
                    // Take screenshot for debugging
                    try {
                        await this.page.screenshot({ path: '/workspaces/job-autopilot/debug-no-modal.png' });
                        console.log('    📸 Screenshot saved: debug-no-modal.png');
                    } catch (se) {}
                    return { success: false, error: 'Easy Apply modal did not appear', ...results };
                }
            } else {
                console.log('    ✓ Modal detected');
            }
            
            let attempts = 0;
            const maxAttempts = 10; // Prevent infinite loops
            let lastButtonText = '';
            let sameButtonCount = 0;
            
            while (attempts < maxAttempts) {
                attempts++;
                console.log(`    🔄 Form step ${attempts}...`);
                
                // Check if page is still valid
                try {
                    await this.page.evaluate(() => document.body !== null);
                } catch (e) {
                    return { success: false, error: 'Page context lost', ...results };
                }
                
                // Small delay to let the modal render
                await this.delay(1500);
                
                // Check for error messages (validation errors)
                const errorCheck = await this.page.evaluate(() => {
                    const errors = document.querySelectorAll('.artdeco-inline-feedback--error, .fb-dash-form-element--error, [data-test-form-element-error]');
                    return errors.length > 0 ? Array.from(errors).map(e => e.textContent?.trim()).filter(t => t).slice(0, 3) : [];
                });
                if (errorCheck.length > 0) {
                    console.log(`    ⚠️  Form errors: ${errorCheck.join(', ')}`);
                }
                
                // Upload resume if requested
                try { await this.handleResumeUpload(); } catch (e) { /* ignore */ }
                
                // Fill text inputs
                try { await this.fillTextInputs(results); } catch (e) { results.errors.push('textInputs: ' + e.message); }
                
                // Handle dropdowns/selects
                try { await this.handleDropdowns(results); } catch (e) { results.errors.push('dropdowns: ' + e.message); }
                
                // Handle radio buttons
                try { await this.handleRadioButtons(results); } catch (e) { results.errors.push('radios: ' + e.message); }
                
                // Handle checkboxes
                try { await this.handleCheckboxes(results); } catch (e) { results.errors.push('checkboxes: ' + e.message); }
                
                // Debug: Log what buttons we see
                const buttonsInfo = await this.page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons
                        .filter(b => b.offsetParent !== null) // visible buttons only
                        .map(b => b.textContent?.trim().substring(0, 30))
                        .filter(t => t && t.length > 0)
                        .slice(0, 10);
                });
                console.log(`    🔘 Visible buttons: ${buttonsInfo.join(', ') || 'none'}`);
                
                // Check for Next/Review/Submit button
                let nextBtn = null;
                let submitBtn = null;
                
                try {
                    submitBtn = await this.findButton(['Submit application', 'Submit']);
                    if (!submitBtn) {
                        nextBtn = await this.findButton(['Next', 'Continue', 'Review']);
                    }
                } catch (e) {
                    // Button finding failed
                }
                
                // Detect if we're stuck (same button appearing repeatedly)
                const currentButtonText = submitBtn ? 'submit' : (nextBtn ? buttonsInfo.find(b => ['next', 'review', 'continue'].includes(b.toLowerCase())) : '');
                if (currentButtonText && currentButtonText === lastButtonText) {
                    sameButtonCount++;
                    if (sameButtonCount >= 3) {
                        console.log('    ⚠️  Form appears stuck - required fields may be missing');
                        try {
                            await this.page.screenshot({ path: '/workspaces/job-autopilot/debug-stuck.png' });
                            console.log('    📸 Screenshot saved: debug-stuck.png');
                        } catch (se) {}
                        return { success: false, error: 'Form stuck - likely missing required fields', ...results };
                    }
                } else {
                    sameButtonCount = 0;
                    lastButtonText = currentButtonText || '';
                }
                
                if (submitBtn) {
                    if (!this.options.autoSubmit || this.options.dryRun) {
                        console.log('    🛑 Assisted mode: pausing before final submit.');
                        return { success: false, requiresReview: true, ...results };
                    }
                    // Final step - submit
                    console.log('    📤 Submitting application...');
                    try {
                        // Click using page.evaluate to avoid detached frame issues
                        await this.page.evaluate(() => {
                            const btn = document.querySelector('button[aria-label*="Submit"], button');
                            const buttons = Array.from(document.querySelectorAll('.jobs-easy-apply-modal button, .artdeco-modal button'));
                            const submitBtn = buttons.find(b => b.textContent?.toLowerCase().includes('submit'));
                            if (submitBtn) submitBtn.click();
                        });
                        await this.delay(3000);
                    } catch (e) {
                        return { success: false, error: 'Failed to click submit: ' + e.message, ...results };
                    }
                    
                    // Check for success - look for multiple indicators
                    let success = false;
                    try {
                        success = await this.page.evaluate(() => {
                            const bodyText = document.body.textContent?.toLowerCase() || '';
                            const successIndicators = [
                                'application sent',
                                'application was sent',
                                'your application was sent',
                                'successfully submitted',
                                'applied successfully'
                            ];
                            
                            // Check text content
                            for (const indicator of successIndicators) {
                                if (bodyText.includes(indicator)) return true;
                            }
                            
                            // Check for success modal/screen
                            const successElements = document.querySelectorAll(
                                '.artdeco-inline-feedback--success, ' +
                                '.jobs-apply-success, ' +
                                '[data-test-modal-id="post-apply-modal"], ' +
                                '.post-apply-timeline'
                            );
                            if (successElements.length > 0) return true;
                            
                            // Check if modal closed (may indicate success)
                            const modalStillOpen = document.querySelector('.jobs-easy-apply-modal');
                            if (!modalStillOpen) return true;
                            
                            return false;
                        });
                    } catch (e) {
                        // If page changed, assume success
                        success = true;
                    }
                    
                    // Close any remaining modal
                    try { await this.closeModal(); } catch (e) { /* ignore */ }
                    
                    return { success, ...results };
                } else if (nextBtn) {
                    try {
                        // Use browser context click to avoid detached frame issues
                        const buttonText = await nextBtn.evaluate(btn => btn.textContent?.trim());
                        await this.page.evaluate((btnText) => {
                            const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, .artdeco-modal');
                            const container = modal || document;
                            const buttons = Array.from(container.querySelectorAll('button'));
                            const btn = buttons.find(b => b.textContent?.trim().toLowerCase().includes(btnText.toLowerCase()));
                            if (btn) btn.click();
                        }, buttonText);
                        await this.delay(2000);
                    } catch (e) {
                        // Try direct click as fallback
                        try {
                            await nextBtn.click();
                            await this.delay(2000);
                        } catch (e2) {
                            return { success: false, error: 'Failed to click next: ' + e2.message, ...results };
                        }
                    }
                } else {
                    // No next or submit button found - form may be stuck
                    // Check if there are validation errors
                    const hasErrors = await this.page.evaluate(() => {
                        return !!document.querySelector('.artdeco-inline-feedback--error, .fb-dash-form-element--error');
                    });
                    if (hasErrors) {
                        console.log('    ⚠️  Form has validation errors - required fields may be missing');
                    }
                    return { success: false, error: 'No next or submit button found', ...results };
                }
            }
            
            return { success: false, error: 'Exceeded max form attempts', ...results };
            
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
     * Fill text inputs based on label matching - runs entirely in browser context
     */
    async fillTextInputs(results) {
        const profile = this.options.profile;
        const userAnswers = this.options.userAnswers;
        
        const filledFields = await this.page.evaluate((profile, userAnswers) => {
            const filled = [];
            const modalSelectors = [
                '.jobs-easy-apply-modal',
                '.jobs-easy-apply-content',
                '[data-test-modal-id="easy-apply-modal"]',
                '.artdeco-modal'
            ];
            
            let modal = null;
            for (const sel of modalSelectors) {
                modal = document.querySelector(sel);
                if (modal) break;
            }
            if (!modal) modal = document;
            
            // Include number inputs for experience questions
            const inputs = modal.querySelectorAll('input[type="text"], input[type="number"], textarea, input:not([type])');
            
            for (const input of inputs) {
                if (input.value) continue; // Already filled
                if (input.type === 'hidden' || input.type === 'file') continue;
                
                // Find label - try multiple approaches
                let labelEl = input.closest('.fb-dash-form-element, .artdeco-text-input')?.querySelector('label');
                if (!labelEl) labelEl = document.querySelector(`label[for="${input.id}"]`);
                if (!labelEl) labelEl = input.closest('label');
                if (!labelEl) labelEl = input.parentElement?.querySelector('label');
                if (!labelEl) {
                    // Look for preceding span/label text
                    const parent = input.closest('.fb-dash-form-element, .artdeco-text-input, .jobs-easy-apply-form-element');
                    if (parent) labelEl = parent.querySelector('label, span.visually-hidden, .t-bold');
                }
                
                const label = labelEl?.textContent?.toLowerCase().trim() || '';
                
                let value = '';
                
                // Handle number inputs (years of experience questions)
                if (input.type === 'number') {
                    // Experience questions typically ask for years
                    if (label.includes('year') || label.includes('experience')) {
                        value = '5'; // Default 5 years
                    } else {
                        value = '3'; // Generic number default
                    }
                }
                // Known text fields
                else if (label.includes('phone') || label.includes('mobile')) {
                    value = profile.phone || '8322158648';
                } else if (label.includes('email')) {
                    value = profile.email || '';
                } else if (label.includes('city')) {
                    value = profile.city || 'Katy';
                } else if (label.includes('first name')) {
                    value = profile.firstName || 'Rami';
                } else if (label.includes('last name')) {
                    value = profile.lastName || 'Abdelrazzaq';
                } else if (label.includes('linkedin')) {
                    value = profile.linkedinHandle ? `https://linkedin.com/in/${profile.linkedinHandle}` : '';
                } else if (label.includes('github')) {
                    value = profile.githubHandle ? `https://github.com/${profile.githubHandle}` : '';
                } else if (label.includes('year') || label.includes('experience')) {
                    value = '5'; // Years of experience default
                } else if (label.includes('salary') || label.includes('compensation')) {
                    value = ''; // Leave salary blank
                } else {
                    // Try to find answer from userAnswers
                    for (const [keyword, answer] of Object.entries(userAnswers)) {
                        if (label.includes(keyword.toLowerCase())) {
                            value = answer;
                            break;
                        }
                    }
                }
                
                if (value) {
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    filled.push(label || 'unknown field');
                }
            }
            
            return filled;
        }, profile, userAnswers);
        
        results.filled.push(...filledFields);
    }
    
    /**
     * Handle dropdown/select elements - runs in browser context
     */
    async handleDropdowns(results) {
        const userAnswers = this.options.userAnswers;
        
        const filledDropdowns = await this.page.evaluate((userAnswers) => {
            const filled = [];
            const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content') || document;
            const selects = modal.querySelectorAll('select');
            
            for (const select of selects) {
                const labelEl = select.closest('.fb-dash-form-element, .artdeco-dropdown')?.querySelector('label');
                const label = labelEl?.textContent?.toLowerCase().trim() || '';
                
                // Find answer
                let answer = null;
                for (const [keyword, ans] of Object.entries(userAnswers)) {
                    if (label.includes(keyword.toLowerCase())) {
                        answer = ans;
                        break;
                    }
                }
                
                if (answer) {
                    // Find matching option
                    for (const option of select.options) {
                        if (option.text.toLowerCase().includes(answer.toLowerCase()) ||
                            answer.toLowerCase().includes(option.text.toLowerCase())) {
                            select.value = option.value;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            filled.push(label);
                            break;
                        }
                    }
                } else if (select.options.length > 1 && !select.value) {
                    // Select first non-empty option as fallback
                    for (const option of select.options) {
                        if (option.value && option.text.toLowerCase() !== 'select') {
                            select.value = option.value;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            filled.push(label + ' (fallback)');
                            break;
                        }
                    }
                }
            }
            
            return filled;
        }, userAnswers);
        
        results.filled.push(...filledDropdowns);
    }
    
    /**
     * Handle radio buttons - runs in browser context
     */
    async handleRadioButtons(results) {
        const userAnswers = this.options.userAnswers;
        
        const filledRadios = await this.page.evaluate((userAnswers) => {
            const filled = [];
            const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content') || document;
            const fieldsets = modal.querySelectorAll('fieldset');
            
            for (const fieldset of fieldsets) {
                const legend = fieldset.querySelector('legend, span.visually-hidden, .fb-dash-form-element__label');
                const questionText = legend?.textContent?.toLowerCase().trim() || '';
                
                // Find answer for this question
                let answer = null;
                for (const [keyword, ans] of Object.entries(userAnswers)) {
                    if (questionText.includes(keyword.toLowerCase())) {
                        answer = ans;
                        break;
                    }
                }
                
                if (!answer) continue;
                
                const radios = fieldset.querySelectorAll('input[type="radio"]');
                for (const radio of radios) {
                    const labelEl = radio.nextElementSibling || 
                                   radio.closest('label') || 
                                   document.querySelector(`label[for="${radio.id}"]`);
                    const radioLabel = labelEl?.textContent?.toLowerCase().trim() || '';
                    
                    if (radioLabel.includes(answer.toLowerCase()) || 
                        answer.toLowerCase().includes(radioLabel)) {
                        radio.click();
                        filled.push(questionText.substring(0, 50));
                        break;
                    }
                }
            }
            
            return filled;
        }, userAnswers);
        
        results.filled.push(...filledRadios);
    }
    
    /**
     * Handle checkboxes (agreements, etc.) - runs in browser context
     */
    async handleCheckboxes(results) {
        const checkedBoxes = await this.page.evaluate(() => {
            const filled = [];
            const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content') || document;
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
            
            for (const checkbox of checkboxes) {
                // Check required unchecked checkboxes (typically agreements)
                if (checkbox.required && !checkbox.checked) {
                    checkbox.click();
                    filled.push('agreement checkbox');
                }
                
                // Also check if the label suggests it's an agreement
                const label = checkbox.closest('label')?.textContent?.toLowerCase() || '';
                if (!checkbox.checked && (label.includes('agree') || label.includes('consent') || label.includes('acknowledge'))) {
                    checkbox.click();
                    filled.push('agreement checkbox');
                }
            }
            
            return filled;
        });
        
        results.filled.push(...checkedBoxes);
    }
    
    /**
     * Find a button by text - searches within modal first
     */
    async findButton(texts) {
        for (const text of texts) {
            try {
                // Search within modal for button with matching text
                const handle = await this.page.evaluateHandle((searchText) => {
                    // First check within modal
                    const modal = document.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, .artdeco-modal');
                    const container = modal || document;
                    
                    const buttons = Array.from(container.querySelectorAll('button'));
                    
                    // Find button where text content matches (case insensitive, trimmed)
                    for (const btn of buttons) {
                        const btnText = (btn.textContent || '').trim().toLowerCase();
                        const searchLower = searchText.toLowerCase();
                        
                        // Exact match or starts with
                        if (btnText === searchLower || btnText.startsWith(searchLower)) {
                            // Make sure button is visible
                            if (btn.offsetParent !== null) {
                                return btn;
                            }
                        }
                    }
                    
                    // Fallback: partial match within modal
                    for (const btn of buttons) {
                        const btnText = (btn.textContent || '').trim().toLowerCase();
                        if (btnText.includes(searchText.toLowerCase()) && btn.offsetParent !== null) {
                            return btn;
                        }
                    }
                    
                    return null;
                }, text);

                const el = handle.asElement();
                if (el) {
                    console.log(`    ✓ Found button: "${text}"`);
                    return el;
                }
            } catch (e) {
                // Continue to next text option
            }
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

    async detectFriction() {
        try {
            const content = await this.page.content();
            const lower = content.toLowerCase();
            if (lower.includes('captcha') || lower.includes('recaptcha')) return 'captcha';
            if (lower.includes('two-factor') || lower.includes('2fa') || lower.includes('verification code')) return 'two-factor';
            if (lower.includes('are you human')) return 'bot-check';
        } catch (e) {
            return null;
        }
        return null;
    }
    
    /**
     * Apply to a specific job (main method) - works when job is already selected in view
     */
    async applyToCurrentJob() {
        console.log(`    📝 Attempting to apply...`);
        
        if (this.applicationsThisSession >= this.options.maxApps) {
            return { 
                success: false, 
                error: 'Daily application limit reached',
                rateLimited: true 
            };
        }
        
        try {
            // Wait a moment for job details to fully load
            await this.delay(2000);

            const friction = await this.detectFriction();
            if (friction) {
                return { success: false, error: `Blocked by ${friction}`, blocked: true };
            }
            
            // Debug: log current page state
            const pageInfo = await this.page.evaluate(() => ({
                url: window.location.href,
                hasEasyApplyBtn: !!document.querySelector('.jobs-apply-button, button[aria-label*="Easy Apply"]'),
                buttonText: document.querySelector('.jobs-apply-button')?.textContent?.trim() || 'N/A'
            }));
            console.log(`    📍 Page: ${pageInfo.url.substring(0, 80)}...`);
            console.log(`    🔘 Button found: ${pageInfo.hasEasyApplyBtn}, Text: "${pageInfo.buttonText}"`);
            
            // Check if Easy Apply
            const isEasyApply = await this.isEasyApplyAvailable();
            if (!isEasyApply) {
                console.log('    ⏭️  Not an Easy Apply job');
                return { success: false, error: 'Not an Easy Apply job', skipReason: 'external' };
            }
            
            // Check if already applied
            const alreadyApplied = await this.page.evaluate(() => {
                const appliedIndicator = document.querySelector('.jobs-apply-button--applied, [aria-label*="Applied"]');
                const buttonText = document.querySelector('.jobs-apply-button')?.textContent?.toLowerCase() || '';
                return !!appliedIndicator || buttonText.includes('applied');
            });
            
            if (alreadyApplied) {
                console.log('    ⏭️  Already applied to this job');
                return { success: false, error: 'Already applied', skipReason: 'already_applied' };
            }
            
            // Click Easy Apply
            console.log('    🖱️  Clicking Easy Apply button...');
            const clicked = await this.clickEasyApply();
            if (!clicked) {
                return { success: false, error: 'Could not click Easy Apply button' };
            }
            
            console.log('    📋 Filling application form...');
            
            // Fill form
            const result = await this.fillEasyApplyForm();
            
            if (result.success) {
                this.applicationsThisSession++;
                console.log(`    ✅ Application submitted! (${this.applicationsThisSession}/${this.options.maxApps})`);
                if (result.filled.length > 0) {
                    console.log(`    📝 Filled: ${result.filled.join(', ')}`);
                }
                
                // Send Telegram notification for each successful application
                if (telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
                    const jobInfo = {
                        title: await this.getJobTitle(),
                        company: await this.getCompanyName(),
                        location: await this.getJobLocation(),
                        url: this.page.url()
                    };
                    telegramNotifier.notifyApplicationSubmitted(jobInfo).catch(() => {});
                }
            } else {
                console.log(`    ❌ Application failed: ${result.error}`);
                if (result.errors?.length > 0) {
                    console.log(`    ⚠️  Errors: ${result.errors.join(', ')}`);
                }
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
     * Apply to a specific job by URL (navigates to the job first)
     */
    async applyToJob(jobUrl) {
        console.log(`\n📝 Applying to job: ${jobUrl}`);
        
        try {
            // Navigate to job
            await this.page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.delay(2000);
            
            return await this.applyToCurrentJob();
        } catch (error) {
            console.log(`    ❌ Error navigating: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Mass apply to jobs matching search
     */
    async massApply(query, location, limit = 10) {
        console.log(`\n🚀 Starting mass apply: ${limit} jobs`);
        console.log(`   Query: "${query}" | Location: "${location}"`);
        
        // Send Telegram notification that we're starting
        if (telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
            telegramNotifier.notifyStarting(query, location, limit).catch(() => {});
        }
        
        const results = {
            applied: [],
            skipped: [],
            failed: [],
            total: 0
        };
        
        if (!this.isLoggedIn) {
            if (!(await this.checkLoginStatus())) {
                if (telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
                    telegramNotifier.notifyError('Not logged in to LinkedIn', 'login check').catch(() => {});
                }
                return { error: 'Not logged in. Run login() first.', ...results };
            }
        }
        
        // Notify successful login
        if (telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
            telegramNotifier.notifyLogin(true, 'cookies').catch(() => {});
        }
        
        // Search jobs
        await this.searchJobs(query, location, true);
        await this.delay(3000);
        
        let processed = 0;
        let pageNum = 1;
        
        while (processed < limit && pageNum <= 10) {
            console.log(`\n📃 Processing page ${pageNum}...`);
            
            // Wait for job listings to load
            try {
                await this.page.waitForSelector('.job-card-container, .jobs-search-results__list-item', { timeout: 15000 });
            } catch (e) {
                console.log('   ⚠️  No job listings found on this page');
                break;
            }
            
            const jobs = await this.getJobListings();
            console.log(`   Found ${jobs.length} jobs on this page`);
            
            // Notify jobs found on first page
            if (pageNum === 1 && telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
                telegramNotifier.notifyJobsFound(jobs.length, query).catch(() => {});
            }
            
            if (jobs.length === 0) {
                console.log('   ⚠️  No jobs found. Try different search terms.');
                break;
            }
            
            for (const job of jobs) {
                if (processed >= limit) break;
                
                console.log(`\n[${processed + 1}/${limit}] ${job.title} @ ${job.company}`);
                
                // Apply rate limiting delay
                if (processed > 0) {
                    const delay = this.options.delayBetweenApps + Math.random() * 10000;
                    console.log(`   ⏳ Waiting ${Math.round(delay / 1000)}s (rate limit protection)...`);
                    await this.delay(delay);
                }
                
                try {
                    // Select job (click on it to load details in side panel)
                    const selected = await this.selectJob(job.index);
                    if (!selected) {
                        console.log('   ⚠️  Could not select job');
                        results.failed.push({ ...job, error: 'Could not select' });
                        processed++;
                        continue;
                    }
                    
                    // Wait for job details to load
                    await this.delay(2000);
                    
                    // Try to apply to the currently selected job
                    const result = await this.applyToCurrentJob();
                    
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
                        // Notify skipped
                        if (telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
                            telegramNotifier.notifySkipped(job, result.skipReason).catch(() => {});
                        }
                    } else {
                        results.failed.push({
                            ...job,
                            error: result.error
                        });
                    }
                    
                    processed++;
                    results.total = processed;
                    
                    // Send progress update every 5 applications
                    if (processed % 5 === 0 && telegramNotifier && process.env.TELEGRAM_BOT_TOKEN) {
                        telegramNotifier.notifyProgress(
                            processed, 
                            limit, 
                            results.applied.length, 
                            results.failed.length
                        ).catch(() => {});
                    }
                    
                    // Check rate limit
                    if (result.rateLimited) {
                        console.log('\n⚠️  Rate limit reached. Stopping.');
                        break;
                    }
                } catch (jobError) {
                    console.log(`   ❌ Error processing job: ${jobError.message}`);
                    results.failed.push({ ...job, error: jobError.message });
                    processed++;
                }
            }
            
            // Try next page if we need more jobs
            if (processed < limit) {
                const nextPageClicked = await this.goToNextPage();
                if (nextPageClicked) {
                    pageNum++;
                    await this.delay(3000);
                } else {
                    console.log('\n   No more pages available.');
                    break;
                }
            }
        }
        
        console.log('\n📊 Mass Apply Complete:');
        console.log(`   ✅ Applied: ${results.applied.length}`);
        console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
        console.log(`   ❌ Failed: ${results.failed.length}`);
        
        return results;
    }
    
    /**
     * Navigate to next page of job listings
     */
    async goToNextPage() {
        try {
            // LinkedIn pagination - look for next page button
            const nextButton = await this.page.evaluateHandle(() => {
                // Find the pagination area
                const paginationItems = document.querySelectorAll('.jobs-search-results-list__pagination li button');
                const currentPage = document.querySelector('.jobs-search-results-list__pagination li.active button, .jobs-search-results-list__pagination li[aria-current="page"] button');
                
                if (currentPage && paginationItems.length > 0) {
                    const currentNum = parseInt(currentPage.textContent) || 1;
                    for (const btn of paginationItems) {
                        if (parseInt(btn.textContent) === currentNum + 1) {
                            return btn;
                        }
                    }
                }
                
                // Alternative: look for "Next" or arrow button
                const arrowBtn = document.querySelector('button[aria-label*="next"], button[aria-label*="Next"]');
                return arrowBtn || null;
            });
            
            const element = nextButton.asElement();
            if (element) {
                await element.click();
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Get job title from current page
     */
    async getJobTitle() {
        try {
            return await this.page.evaluate(() => {
                const el = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1');
                return el?.textContent?.trim() || 'Unknown Position';
            });
        } catch (e) {
            return 'Unknown Position';
        }
    }
    
    /**
     * Get company name from current page
     */
    async getCompanyName() {
        try {
            return await this.page.evaluate(() => {
                const el = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, [data-company-name]');
                return el?.textContent?.trim() || 'Unknown Company';
            });
        } catch (e) {
            return 'Unknown Company';
        }
    }
    
    /**
     * Get job location from current page
     */
    async getJobLocation() {
        try {
            return await this.page.evaluate(() => {
                const el = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet');
                return el?.textContent?.trim() || '';
            });
        } catch (e) {
            return '';
        }
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
