/**
 * Company Career Page Crawler
 * 
 * Automatically finds and crawls company career pages to discover jobs.
 * Supports direct application to company websites bypassing job boards.
 * 
 * Features:
 * - Auto-discovers career page URLs (e.g., careers.google.com)
 * - Parses various ATS systems (Greenhouse, Lever, Workday, Taleo, etc.)
 * - Extracts job listings with direct application links
 * - Supports keyword filtering
 */

const puppeteer = require('puppeteer');
const { createLogger } = require('../logger');

const logger = createLogger();

// Known career page patterns for major companies
const KNOWN_CAREER_PAGES = {
    'google': 'https://careers.google.com/jobs/results/',
    'meta': 'https://www.metacareers.com/jobs/',
    'apple': 'https://jobs.apple.com/en-us/search',
    'amazon': 'https://www.amazon.jobs/en/',
    'microsoft': 'https://careers.microsoft.com/us/en/search-results',
    'netflix': 'https://jobs.netflix.com/',
    'nvidia': 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
    'openai': 'https://openai.com/careers/search',
    'anthropic': 'https://www.anthropic.com/careers',
    'stripe': 'https://stripe.com/jobs/search',
    'airbnb': 'https://careers.airbnb.com/',
    'uber': 'https://www.uber.com/us/en/careers/',
    'salesforce': 'https://careers.salesforce.com/en/jobs/',
    'adobe': 'https://careers.adobe.com/us/en/search-results',
    'slack': 'https://slack.com/careers',
    'dropbox': 'https://jobs.dropbox.com/',
    'spotify': 'https://www.lifeatspotify.com/jobs',
    'pinterest': 'https://www.pinterestcareers.com/',
    'snap': 'https://careers.snap.com/',
    'palantir': 'https://www.palantir.com/careers/',
    'databricks': 'https://www.databricks.com/company/careers/open-positions',
    'figma': 'https://www.figma.com/careers/',
    'notion': 'https://www.notion.so/careers',
    'vercel': 'https://vercel.com/careers',
    'supabase': 'https://supabase.com/careers',
    'retool': 'https://retool.com/careers',
    'linear': 'https://linear.app/careers',
    'ramp': 'https://ramp.com/careers',
    'coinbase': 'https://www.coinbase.com/careers/positions',
    'discord': 'https://discord.com/jobs',
    'github': 'https://github.com/about/careers',
    'gitlab': 'https://about.gitlab.com/jobs/',
    'hashicorp': 'https://www.hashicorp.com/jobs',
    'datadog': 'https://careers.datadoghq.com/',
    'cloudflare': 'https://www.cloudflare.com/careers/jobs/',
    'twilio': 'https://www.twilio.com/company/jobs',
    'square': 'https://careers.squareup.com/us/en/jobs',
    'robinhood': 'https://careers.robinhood.com/',
    'instacart': 'https://instacart.careers/',
    'doordash': 'https://careers.doordash.com/',
    'lyft': 'https://www.lyft.com/careers',
    'plaid': 'https://plaid.com/careers/',
    'scale': 'https://scale.com/careers',
    'anduril': 'https://www.anduril.com/careers/',
    'flexport': 'https://www.flexport.com/careers/open-positions',
    'brex': 'https://www.brex.com/careers',
    'rippling': 'https://www.rippling.com/careers',
    'gusto': 'https://gusto.com/company/careers',
    'chime': 'https://www.chime.com/careers/'
};

// ATS detection patterns
const ATS_PATTERNS = {
    greenhouse: /greenhouse\.io|boards\.greenhouse/i,
    lever: /lever\.co|jobs\.lever/i,
    workday: /myworkdayjobs\.com|wd\d+\.myworkday/i,
    taleo: /taleo\.net|taleo\./i,
    icims: /icims\.com|careers-.*\.icims/i,
    smartrecruiters: /smartrecruiters\.com/i,
    ashby: /ashbyhq\.com/i,
    bamboo: /bamboohr\.com/i,
    jobvite: /jobvite\.com/i
};

class CompanyCareerCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init(options = {}) {
        const { headless = true } = options;
        
        logger.info('🔧 Initializing Company Career Crawler...');
        
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
        await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
    }

    /**
     * Find career page URL for a company
     */
    async findCareerPage(company) {
        const normalizedCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Check known career pages first
        if (KNOWN_CAREER_PAGES[normalizedCompany]) {
            return KNOWN_CAREER_PAGES[normalizedCompany];
        }

        // Try common patterns
        const patterns = [
            `https://careers.${company.toLowerCase().replace(/\s+/g, '')}.com`,
            `https://www.${company.toLowerCase().replace(/\s+/g, '')}.com/careers`,
            `https://${company.toLowerCase().replace(/\s+/g, '')}.com/jobs`,
            `https://jobs.${company.toLowerCase().replace(/\s+/g, '')}.com`
        ];

        for (const url of patterns) {
            try {
                const response = await this.page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 10000 
                });
                if (response && response.ok()) {
                    logger.info(`   Found career page: ${url}`);
                    return url;
                }
            } catch (e) {
                // Try next pattern
            }
        }

        // Fall back to Google search
        return this.searchForCareerPage(company);
    }

    /**
     * Search Google for company's career page
     */
    async searchForCareerPage(company) {
        try {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(company + ' careers jobs site')}`;
            await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
            
            // Get first result that looks like a career page
            const careerUrl = await this.page.evaluate(() => {
                const links = document.querySelectorAll('a[href]');
                for (const link of links) {
                    const href = link.href;
                    if (href && (
                        href.includes('/careers') ||
                        href.includes('/jobs') ||
                        href.includes('careers.') ||
                        href.includes('jobs.')
                    ) && !href.includes('google.com')) {
                        return href;
                    }
                }
                return null;
            });

            return careerUrl;
        } catch (e) {
            logger.error(`   Could not find career page for ${company}`);
            return null;
        }
    }

    /**
     * Detect which ATS the company uses
     */
    detectATS(url) {
        for (const [ats, pattern] of Object.entries(ATS_PATTERNS)) {
            if (pattern.test(url)) {
                return ats;
            }
        }
        return 'unknown';
    }

    /**
     * Find jobs on a company's career page
     */
    async findJobs(company, query = '') {
        logger.info(`\n🏢 Crawling ${company} career page...`);
        
        const careerUrl = await this.findCareerPage(company);
        if (!careerUrl) {
            logger.warn(`   No career page found for ${company}`);
            return [];
        }

        const ats = this.detectATS(careerUrl);
        logger.info(`   ATS detected: ${ats}`);

        // Route to appropriate scraper based on ATS
        switch (ats) {
            case 'greenhouse':
                return this.scrapeGreenhouse(careerUrl, company, query);
            case 'lever':
                return this.scrapeLever(careerUrl, company, query);
            case 'workday':
                return this.scrapeWorkday(careerUrl, company, query);
            default:
                return this.scrapeGeneric(careerUrl, company, query);
        }
    }

    /**
     * Scrape Greenhouse-based career pages
     */
    async scrapeGreenhouse(url, company, query) {
        try {
            // Greenhouse typically has JSON API
            let apiUrl = url.replace('boards.greenhouse.io', 'boards-api.greenhouse.io');
            if (!apiUrl.includes('boards-api')) {
                // Try to find the board token
                await this.page.goto(url, { waitUntil: 'networkidle2' });
                const jobLinks = await this.extractJobLinks();
                return this.formatJobs(jobLinks, company, 'greenhouse');
            }

            const response = await fetch(`${apiUrl}/jobs`);
            if (response.ok) {
                const data = await response.json();
                const jobs = (data.jobs || [])
                    .filter(j => !query || j.title?.toLowerCase().includes(query.toLowerCase()))
                    .map(j => ({
                        title: j.title,
                        company: company,
                        location: j.location?.name || 'Remote',
                        application_url: j.absolute_url,
                        source: 'greenhouse'
                    }));
                
                logger.info(`   Found ${jobs.length} jobs on Greenhouse`);
                return jobs;
            }
        } catch (e) {
            logger.error(`   Greenhouse scrape error: ${e.message}`);
        }
        return [];
    }

    /**
     * Scrape Lever-based career pages
     */
    async scrapeLever(url, company, query) {
        try {
            // Navigate to Lever page
            await this.page.goto(url, { waitUntil: 'networkidle2' });
            
            const jobs = await this.page.evaluate((searchQuery) => {
                const jobCards = document.querySelectorAll('.posting');
                return Array.from(jobCards)
                    .filter(card => {
                        if (!searchQuery) return true;
                        const title = card.querySelector('.posting-title h5')?.textContent || '';
                        return title.toLowerCase().includes(searchQuery.toLowerCase());
                    })
                    .map(card => {
                        const title = card.querySelector('.posting-title h5')?.textContent?.trim();
                        const location = card.querySelector('.posting-categories .location')?.textContent?.trim();
                        const link = card.querySelector('a')?.href;
                        return { title, location, application_url: link };
                    });
            }, query);

            logger.info(`   Found ${jobs.length} jobs on Lever`);
            return jobs.map(j => ({ ...j, company, source: 'lever' }));
        } catch (e) {
            logger.error(`   Lever scrape error: ${e.message}`);
            return [];
        }
    }

    /**
     * Scrape Workday-based career pages
     */
    async scrapeWorkday(url, company, query) {
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2' });
            await this.page.waitForSelector('[data-automation-id="jobTitle"]', { timeout: 10000 });

            // If there's a search box and query, use it
            if (query) {
                const searchInput = await this.page.$('[data-automation-id="keywordSearchInput"]');
                if (searchInput) {
                    await searchInput.type(query);
                    await this.page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

            const jobs = await this.page.evaluate(() => {
                const jobItems = document.querySelectorAll('[data-automation-id="jobItem"], .css-1q2dra3');
                return Array.from(jobItems).map(item => {
                    const title = item.querySelector('[data-automation-id="jobTitle"]')?.textContent?.trim();
                    const location = item.querySelector('[data-automation-id="locations"]')?.textContent?.trim();
                    const link = item.querySelector('a')?.href;
                    return { title, location, application_url: link };
                });
            });

            logger.info(`   Found ${jobs.length} jobs on Workday`);
            return jobs.map(j => ({ ...j, company, source: 'workday' }));
        } catch (e) {
            logger.error(`   Workday scrape error: ${e.message}`);
            return [];
        }
    }

    /**
     * Generic career page scraper (for unknown ATS)
     */
    async scrapeGeneric(url, company, query) {
        try {
            await this.page.goto(url, { waitUntil: 'networkidle2' });
            
            // Wait a bit for dynamic content
            await new Promise(r => setTimeout(r, 2000));

            const jobs = await this.page.evaluate((searchQuery) => {
                // Try various common patterns for job listings
                const selectors = [
                    '[class*="job"]',
                    '[class*="position"]',
                    '[class*="opening"]',
                    '[class*="listing"]',
                    '[data-job]',
                    'article',
                    '.card',
                    'li a[href*="job"]',
                    'li a[href*="position"]'
                ];

                const jobs = [];
                const seenUrls = new Set();

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        // Look for job-related text
                        const text = el.textContent?.toLowerCase() || '';
                        const link = el.querySelector('a')?.href || (el.tagName === 'A' ? el.href : null);
                        
                        if (!link || seenUrls.has(link)) continue;
                        
                        // Try to extract title
                        const titleEl = el.querySelector('h1, h2, h3, h4, h5, [class*="title"]') || el;
                        let title = titleEl.textContent?.trim()?.split('\n')[0]?.slice(0, 100);
                        
                        if (!title || title.length < 5) continue;
                        
                        // Filter by search query if provided
                        if (searchQuery && !title.toLowerCase().includes(searchQuery.toLowerCase())) {
                            continue;
                        }

                        // Try to extract location
                        const locEl = el.querySelector('[class*="location"], [class*="place"]');
                        const location = locEl?.textContent?.trim() || '';

                        seenUrls.add(link);
                        jobs.push({ title, location, application_url: link });
                    }
                }

                return jobs;
            }, query);

            // Deduplicate and clean
            const cleanJobs = this.cleanJobResults(jobs);
            logger.info(`   Found ${cleanJobs.length} jobs on career page`);
            return cleanJobs.map(j => ({ ...j, company, source: 'career_page' }));
        } catch (e) {
            logger.error(`   Generic scrape error: ${e.message}`);
            return [];
        }
    }

    /**
     * Extract all job links from current page
     */
    async extractJobLinks() {
        return await this.page.evaluate(() => {
            const links = document.querySelectorAll('a[href*="job"], a[href*="position"], a[href*="opening"]');
            return Array.from(links).map(a => ({
                title: a.textContent?.trim()?.slice(0, 100),
                application_url: a.href,
                location: ''
            })).filter(j => j.title && j.application_url);
        });
    }

    formatJobs(jobs, company, source) {
        return jobs.map(j => ({ ...j, company, source }));
    }

    cleanJobResults(jobs) {
        const seen = new Set();
        return jobs.filter(job => {
            const key = `${job.title}:${job.application_url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return job.title && job.title.length > 5;
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = { CompanyCareerCrawler, KNOWN_CAREER_PAGES, ATS_PATTERNS };
