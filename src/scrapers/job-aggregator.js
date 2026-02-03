/**
 * Multi-Source Job Aggregator
 * 
 * Aggregates jobs from multiple sources:
 * - Google Jobs (aggregates LinkedIn, Indeed, Glassdoor, company sites)
 * - LinkedIn (direct)
 * - Indeed (direct)
 * - Glassdoor
 * - Company career pages
 * - AngelList/Wellfound
 * 
 * Deduplicates and ranks jobs by match quality.
 */

const { GoogleJobsScraper } = require('./google-jobs-scraper');
const { scrapeIndeed } = require('./indeed-scraper');
const { CompanyCareerCrawler } = require('./company-career-crawler');
const { createLogger } = require('../logger');

const logger = createLogger();

class JobAggregator {
    constructor(options = {}) {
        this.options = options;
        this.googleScraper = null;
        this.careerCrawler = null;
        this.allJobs = [];
        this.targetCompanies = options.targetCompanies || [];
    }

    async init() {
        logger.info('🚀 Initializing Job Aggregator...');
        
        this.googleScraper = new GoogleJobsScraper();
        await this.googleScraper.init({ headless: this.options.headless !== false });

        this.careerCrawler = new CompanyCareerCrawler();
        await this.careerCrawler.init({ headless: this.options.headless !== false });
    }

    /**
     * Aggregate jobs from all sources
     */
    async aggregateJobs(query, location = '', options = {}) {
        const { 
            limit = 100,
            sources = ['google', 'indeed', 'companies'],
            targetCompanies = this.targetCompanies,
            remoteOnly = false,
            experienceLevel = 'entry'  // entry, mid, senior
        } = options;

        logger.info(`\n🔎 Aggregating jobs: "${query}" in "${location || 'anywhere'}"`);
        logger.info(`   Sources: ${sources.join(', ')}`);
        logger.info(`   Target limit: ${limit} jobs`);

        const results = {
            google: [],
            indeed: [],
            companies: [],
            total: 0,
            deduplicated: 0
        };

        // 1. Scrape Google Jobs (best source - aggregates many sites)
        if (sources.includes('google')) {
            try {
                results.google = await this.googleScraper.scrapeJobs(query, location, {
                    limit: Math.ceil(limit * 0.5),
                    remoteOnly,
                    experienceLevel
                });
            } catch (e) {
                logger.error(`   Google Jobs scrape failed: ${e.message}`);
            }
        }

        // 2. Scrape Indeed directly
        if (sources.includes('indeed')) {
            try {
                results.indeed = await scrapeIndeed(query, location, Math.ceil(limit * 0.3));
            } catch (e) {
                logger.error(`   Indeed scrape failed: ${e.message}`);
            }
        }

        // 3. Crawl target company career pages directly
        if (sources.includes('companies') && targetCompanies.length > 0) {
            try {
                for (const company of targetCompanies) {
                    const companyJobs = await this.careerCrawler.findJobs(company, query);
                    results.companies.push(...companyJobs);
                }
            } catch (e) {
                logger.error(`   Company crawl failed: ${e.message}`);
            }
        }

        // Combine and deduplicate
        const allJobs = [
            ...results.google,
            ...results.indeed,
            ...results.companies
        ];

        results.total = allJobs.length;

        // Deduplicate by title + company similarity
        const dedupedJobs = this.deduplicateJobs(allJobs);
        results.deduplicated = dedupedJobs.length;

        // Rank by relevance
        const rankedJobs = this.rankJobs(dedupedJobs, query, {
            preferredCompanies: targetCompanies,
            preferRemote: remoteOnly,
            experienceLevel
        });

        this.allJobs = rankedJobs.slice(0, limit);

        logger.info(`\n📊 Aggregation Results:`);
        logger.info(`   Google Jobs: ${results.google.length}`);
        logger.info(`   Indeed: ${results.indeed.length}`);
        logger.info(`   Company Pages: ${results.companies.length}`);
        logger.info(`   Total: ${results.total} → Deduplicated: ${results.deduplicated}`);
        logger.info(`   Final: ${this.allJobs.length} jobs ready`);

        return this.allJobs;
    }

    /**
     * Deduplicate jobs by title + company similarity
     */
    deduplicateJobs(jobs) {
        const seen = new Map();
        const deduped = [];

        for (const job of jobs) {
            const key = this.normalizeForDedup(job.title, job.company);
            
            if (!seen.has(key)) {
                seen.set(key, job);
                deduped.push(job);
            } else {
                // Keep the one with more info (longer description, has apply URL)
                const existing = seen.get(key);
                if (this.hasMoreInfo(job, existing)) {
                    const idx = deduped.findIndex(j => j === existing);
                    if (idx !== -1) {
                        deduped[idx] = job;
                        seen.set(key, job);
                    }
                }
            }
        }

        return deduped;
    }

    normalizeForDedup(title, company) {
        const normTitle = (title || '').toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/(sr|senior|jr|junior|lead|staff|principal)/g, '')
            .slice(0, 30);
        const normCompany = (company || '').toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .replace(/(inc|llc|corp|ltd|co)/g, '')
            .slice(0, 20);
        return `${normTitle}:${normCompany}`;
    }

    hasMoreInfo(jobA, jobB) {
        let scoreA = 0, scoreB = 0;
        
        if (jobA.application_url) scoreA += 2;
        if (jobB.application_url) scoreB += 2;
        if (jobA.description?.length > 100) scoreA += 1;
        if (jobB.description?.length > 100) scoreB += 1;
        if (jobA.salary) scoreA += 1;
        if (jobB.salary) scoreB += 1;
        
        return scoreA > scoreB;
    }

    /**
     * Rank jobs by relevance to user's criteria
     */
    rankJobs(jobs, query, criteria = {}) {
        const { preferredCompanies = [], preferRemote = false, experienceLevel = '' } = criteria;
        const queryTerms = query.toLowerCase().split(/\s+/);

        return jobs
            .map(job => {
                let score = 0;
                const title = (job.title || '').toLowerCase();
                const company = (job.company || '').toLowerCase();
                const location = (job.location || '').toLowerCase();
                const description = (job.description || '').toLowerCase();

                // Title match
                queryTerms.forEach(term => {
                    if (title.includes(term)) score += 10;
                    if (description.includes(term)) score += 2;
                });

                // Preferred company match
                for (const prefCompany of preferredCompanies) {
                    if (company.includes(prefCompany.toLowerCase())) {
                        score += 20;
                        break;
                    }
                }

                // Top tech companies bonus
                const topCompanies = ['google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'nvidia', 'openai', 'anthropic'];
                if (topCompanies.some(c => company.includes(c))) {
                    score += 15;
                }

                // Remote preference
                if (preferRemote && (location.includes('remote') || location.includes('anywhere'))) {
                    score += 10;
                }

                // Experience level match
                if (experienceLevel === 'entry' && (title.includes('entry') || title.includes('junior') || title.includes('associate'))) {
                    score += 5;
                }

                // Has easy apply or direct link
                if (job.application_url) score += 5;
                if (job.application_url?.includes('easy') || job.source?.includes('Easy Apply')) {
                    score += 10;
                }

                // Recently posted
                if (job.posted_date?.includes('day') || job.posted_date?.includes('hour')) {
                    score += 3;
                }

                return { ...job, relevanceScore: score };
            })
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Get jobs filtered by criteria
     */
    getJobs(filter = {}) {
        let jobs = [...this.allJobs];

        if (filter.hasApplyUrl) {
            jobs = jobs.filter(j => j.application_url);
        }
        if (filter.company) {
            jobs = jobs.filter(j => j.company?.toLowerCase().includes(filter.company.toLowerCase()));
        }
        if (filter.minScore) {
            jobs = jobs.filter(j => (j.relevanceScore || 0) >= filter.minScore);
        }

        return jobs;
    }

    async close() {
        if (this.googleScraper) await this.googleScraper.close();
        if (this.careerCrawler) await this.careerCrawler.close();
    }
}

// Top companies to target
const TOP_TECH_COMPANIES = [
    'Google', 'Meta', 'Apple', 'Amazon', 'Microsoft', 'Netflix',
    'Nvidia', 'OpenAI', 'Anthropic', 'Stripe', 'Airbnb', 'Uber',
    'Salesforce', 'Adobe', 'Slack', 'Dropbox', 'Twitter/X', 'LinkedIn',
    'Spotify', 'Pinterest', 'Snap', 'Palantir', 'Databricks', 'Figma',
    'Notion', 'Vercel', 'Supabase', 'Retool', 'Linear', 'Ramp'
];

module.exports = { JobAggregator, TOP_TECH_COMPANIES };
