/**
 * Glassdoor Scraper & Auto-Apply
 * 
 * Scrapes job listings from Glassdoor and handles applications.
 * Glassdoor often redirects to company sites - handles both flows.
 */

const puppeteer = require('puppeteer');
const { createLogger } = require('../logger');

const logger = createLogger();

class GlassdoorScraper {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init(options = {}) {
        const { headless = true } = options;
        
        logger.info('🔧 Initializing Glassdoor Scraper...');
        
        this.browser = await puppeteer.launch({
            headless: headless ? 'new' : false,
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
    }

    async scrapeJobs(query, location, limit = 50) {
        logger.info(`\n🔍 Scraping Glassdoor: "${query}" in "${location}"`);
        
        const searchUrl = this.buildSearchUrl(query, location);
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
        
        // Handle any modals/popups
        await this.dismissPopups();
        
        const jobs = [];
        let page = 1;
        const maxPages = Math.ceil(limit / 30);

        while (jobs.length < limit && page <= maxPages) {
            const pageJobs = await this.extractJobsFromPage();
            jobs.push(...pageJobs);
            
            logger.info(`   Page ${page}: Found ${pageJobs.length} jobs (total: ${jobs.length})`);
            
            // Try to go to next page
            const hasNext = await this.goToNextPage();
            if (!hasNext) break;
            
            page++;
            await new Promise(r => setTimeout(r, 2000));
        }

        return jobs.slice(0, limit);
    }

    buildSearchUrl(query, location) {
        // Glassdoor URL format
        const encodedQuery = encodeURIComponent(query);
        const encodedLocation = encodeURIComponent(location);
        return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodedQuery}&locT=C&locKeyword=${encodedLocation}`;
    }

    async dismissPopups() {
        try {
            // Close email signup modal
            const closeButton = await this.page.$('[data-test="modal-close"], .modal_closeIcon, button[aria-label="Close"]');
            if (closeButton) await closeButton.click();
        } catch (e) {}

        try {
            // Close cookie banner
            const acceptCookies = await this.page.$('#onetrust-accept-btn-handler, [data-test="cookie-banner-close"]');
            if (acceptCookies) await acceptCookies.click();
        } catch (e) {}
    }

    async extractJobsFromPage() {
        return await this.page.evaluate(() => {
            const jobs = [];
            const jobCards = document.querySelectorAll('[data-test="jobListing"], .JobCard_jobCard__bMkUV, li[data-id]');

            for (const card of jobCards) {
                try {
                    const titleEl = card.querySelector('[data-test="job-title"], .JobCard_jobTitle__GLyJ1, a[data-test="job-link"]');
                    const companyEl = card.querySelector('[data-test="employer-name"], .EmployerProfile_employerName__twEvi, .jobLink');
                    const locationEl = card.querySelector('[data-test="emp-location"], .JobCard_location__N_iYE');
                    const salaryEl = card.querySelector('[data-test="detailSalary"], .JobCard_salaryEstimate___m5HV');
                    const linkEl = card.querySelector('a[data-test="job-link"], a.JobCard_jobTitle__GLyJ1');

                    if (titleEl && linkEl) {
                        jobs.push({
                            title: titleEl.textContent?.trim(),
                            company: companyEl?.textContent?.trim() || 'Unknown',
                            location: locationEl?.textContent?.trim() || '',
                            salary: salaryEl?.textContent?.trim() || '',
                            url: linkEl.href,
                            source: 'glassdoor'
                        });
                    }
                } catch (e) {}
            }

            return jobs;
        });
    }

    async goToNextPage() {
        try {
            const nextButton = await this.page.$('[data-test="pagination-next"], button[aria-label="Next"]');
            if (nextButton) {
                const isDisabled = await this.page.evaluate(el => el.disabled, nextButton);
                if (!isDisabled) {
                    await nextButton.click();
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    async getJobDetails(jobUrl) {
        try {
            await this.page.goto(jobUrl, { waitUntil: 'networkidle2' });
            await this.dismissPopups();

            return await this.page.evaluate(() => {
                const description = document.querySelector('[data-test="jobDescription"], .JobDetails_jobDescription__vW9IV')?.textContent?.trim();
                const applyButton = document.querySelector('[data-test="apply-button"], button[data-test="apply-now"]');
                const applyUrl = applyButton?.href || null;
                
                // Check if easy apply
                const isEasyApply = !!document.querySelector('[data-test="easy-apply-button"]');

                return {
                    description,
                    application_url: applyUrl,
                    easy_apply: isEasyApply
                };
            });
        } catch (e) {
            return { description: '', application_url: null };
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = { GlassdoorScraper };
