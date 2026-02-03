/**
 * Google Jobs Scraper - Scrapes jobs from Google's job search
 * 
 * Google aggregates jobs from LinkedIn, Indeed, Glassdoor, company sites, etc.
 * This gives us access to a massive pool of jobs from one source.
 */

const puppeteer = require('puppeteer');
const { createLogger } = require('../logger');

const logger = createLogger();

class GoogleJobsScraper {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init(options = {}) {
        this.browser = await puppeteer.launch({
            headless: options.headless !== false ? 'new' : false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setViewport({ width: 1920, height: 1080 });
    }

    async scrapeJobs(query, location = '', options = {}) {
        const { limit = 50, remoteOnly = false, experienceLevel = '', datePosted = '' } = options;
        
        logger.info(`🔍 Scraping Google Jobs: "${query}" in "${location || 'anywhere'}"`);

        // Build Google Jobs URL
        let searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' jobs')}`;
        if (location) {
            searchUrl += `+${encodeURIComponent(location)}`;
        }
        searchUrl += '&ibp=htl;jobs';

        // Add filters
        if (remoteOnly) searchUrl += '#htivrt=jobs&htilrad=-1&htichips=employment_type:FULLTIME';
        if (datePosted === 'day') searchUrl += '&chips=date_posted:today';
        if (datePosted === 'week') searchUrl += '&chips=date_posted:week';

        await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await this.delay(2000);

        const jobs = [];
        let scrollAttempts = 0;
        const maxScrolls = Math.ceil(limit / 10);

        while (jobs.length < limit && scrollAttempts < maxScrolls) {
            // Extract jobs from current view
            const newJobs = await this.page.evaluate(() => {
                const jobCards = document.querySelectorAll('[data-ved], .PwjeAc, li[data-entityid]');
                const results = [];

                jobCards.forEach((card, index) => {
                    try {
                        // Try multiple selectors for different Google layouts
                        const titleEl = card.querySelector('.BjJfJf, .sH3zFd, [role="heading"], h3');
                        const companyEl = card.querySelector('.vNEEBe, .nJlQNd, [data-company-name]');
                        const locationEl = card.querySelector('.Qk80Jf, .pwO9Dc');
                        const sourceEl = card.querySelector('.Qk80Jf:last-child, .thbb');
                        const postedEl = card.querySelector('.SuWscb, .LL4CDc');
                        const salaryEl = card.querySelector('.pE8vnd, .SuWscb');

                        const title = titleEl?.textContent?.trim();
                        const company = companyEl?.textContent?.trim();
                        
                        if (title && company) {
                            // Get the job link
                            const linkEl = card.querySelector('a[href*="google.com/search"], a[data-ved]');
                            const entityId = card.getAttribute('data-entityid') || `google-${Date.now()}-${index}`;

                            results.push({
                                title,
                                company,
                                location: locationEl?.textContent?.trim() || 'Not specified',
                                source: sourceEl?.textContent?.trim() || 'Google Jobs',
                                posted: postedEl?.textContent?.trim() || '',
                                salary: salaryEl?.textContent?.trim() || '',
                                entityId,
                                index
                            });
                        }
                    } catch (e) {
                        // Skip problematic cards
                    }
                });

                return results;
            });

            // Add unique jobs
            for (const job of newJobs) {
                const isDuplicate = jobs.some(j => j.title === job.title && j.company === job.company);
                if (!isDuplicate && jobs.length < limit) {
                    jobs.push({
                        job_id: `google-${Date.now()}-${jobs.length}`,
                        title: job.title,
                        company: job.company,
                        location: job.location,
                        source: 'Google Jobs',
                        original_source: job.source,
                        posted_date: job.posted,
                        salary: job.salary,
                        platform: 'google',
                        discovered_at: new Date().toISOString()
                    });
                }
            }

            // Click on each job to get the apply URL
            if (jobs.length > 0) {
                for (let i = 0; i < Math.min(jobs.length, 5); i++) {
                    try {
                        const jobCards = await this.page.$$('[data-ved], .PwjeAc, li[data-entityid]');
                        if (jobCards[i]) {
                            await jobCards[i].click();
                            await this.delay(1000);

                            // Get apply links from the detail panel
                            const applyLinks = await this.page.evaluate(() => {
                                const links = [];
                                const applyButtons = document.querySelectorAll('a[href*="apply"], a[href*="linkedin"], a[href*="indeed"], a[href*="greenhouse"], a[href*="lever"], a[href*="workday"], .pMhGee a');
                                applyButtons.forEach(btn => {
                                    const href = btn.getAttribute('href');
                                    if (href && !href.startsWith('javascript')) {
                                        links.push(href);
                                    }
                                });
                                return links;
                            });

                            if (applyLinks.length > 0 && jobs[i]) {
                                jobs[i].application_url = applyLinks[0];
                                jobs[i].all_apply_links = applyLinks;
                            }
                        }
                    } catch (e) {
                        // Continue on error
                    }
                }
            }

            // Scroll to load more jobs
            await this.page.evaluate(() => {
                const container = document.querySelector('[role="list"], .gws-plugins-horizon-jobs__tl-lvc');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                } else {
                    window.scrollBy(0, 500);
                }
            });

            await this.delay(1500);
            scrollAttempts++;
        }

        logger.info(`   Found ${jobs.length} jobs from Google`);
        return jobs;
    }

    /**
     * Get detailed job info including direct apply links
     */
    async getJobDetails(job) {
        if (!job.entityId && !job.application_url) {
            return job;
        }

        try {
            // If we have an application URL, try to get more details
            if (job.application_url) {
                await this.page.goto(job.application_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await this.delay(1500);

                const details = await this.page.evaluate(() => {
                    const description = document.querySelector('[class*="description"], [class*="job-desc"], #job-description, .job-description')?.textContent?.trim();
                    const requirements = Array.from(document.querySelectorAll('li')).map(li => li.textContent?.trim()).filter(t => t && t.length < 200);
                    
                    return {
                        description: description?.slice(0, 5000),
                        requirements: requirements.slice(0, 20)
                    };
                });

                return { ...job, ...details };
            }
        } catch (e) {
            logger.warn(`   Could not get details for ${job.title}: ${e.message}`);
        }

        return job;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { GoogleJobsScraper };
