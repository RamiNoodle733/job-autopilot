#!/usr/bin/env node

/**
 * 🚀 Ultimate Job Autopilot
 * 
 * The most comprehensive automated job application system.
 * Aggregates jobs from multiple sources and applies everywhere.
 * 
 * Features:
 * - Multi-platform job discovery (LinkedIn, Indeed, Google Jobs, Glassdoor)
 * - Direct company career page crawling (50+ major tech companies)
 * - Smart resume tailoring per application
 * - AI-powered universal form filling
 * - Telegram notifications for real-time updates
 * - Application tracking database
 * - GitHub Actions integration for scheduled runs
 * 
 * Usage:
 *   npm run autopilot                    # Full auto mode
 *   npm run autopilot -- --platform linkedin
 *   npm run autopilot -- --company google
 *   npm run autopilot -- --query "software engineer" --limit 50
 */

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

// Import modules
const { JobAggregator, TOP_TECH_COMPANIES } = require('./scrapers/job-aggregator');
const { LinkedInAutoApply } = require('./auto-apply/linkedin');
const { IndeedAutoApply } = require('./auto-apply/indeed');
const { CompanyCareerCrawler, KNOWN_CAREER_PAGES } = require('./scrapers/company-career-crawler');
const { SmartResumeTailor } = require('./resume-tailoring');
const { UniversalFormFiller } = require('./auto-apply/universal-form-filler');
const { sendTelegramNotification, TELEGRAM_EMOJIS } = require('./email-sender');
const { createLogger } = require('./logger');
const db = require('./database');

const logger = createLogger();

// Load profile
function loadProfile() {
    const profilePath = path.join(process.cwd(), 'data', 'profile.json');
    if (fs.existsSync(profilePath)) {
        return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }
    throw new Error('Profile not found at data/profile.json');
}

// Load environment
function loadEnv() {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const env = fs.readFileSync(envPath, 'utf8');
        env.split('\n').forEach(line => {
            const [key, ...values] = line.split('=');
            if (key && values.length) {
                process.env[key.trim()] = values.join('=').trim();
            }
        });
    }
}

class UltimateJobAutopilot {
    constructor(options = {}) {
        this.options = {
            headless: options.headless !== false,
            limit: options.limit || 100,
            platforms: options.platforms || ['linkedin', 'indeed', 'google', 'companies'],
            query: options.query || 'software engineer',
            location: options.location || '',
            targetCompanies: options.targetCompanies || TOP_TECH_COMPANIES.slice(0, 20),
            remoteOnly: options.remoteOnly || false,
            experienceLevel: options.experienceLevel || 'entry',
            skipApplied: options.skipApplied !== false,
            tailorResume: options.tailorResume !== false,
            dryRun: options.dryRun || false
        };

        this.profile = loadProfile();
        this.aggregator = null;
        this.linkedIn = null;
        this.indeed = null;
        this.resumeTailor = null;
        
        this.stats = {
            jobsFound: 0,
            applied: 0,
            failed: 0,
            skipped: 0,
            byPlatform: {}
        };
    }

    async init() {
        logger.info('\n' + '='.repeat(60));
        logger.info('🚀 ULTIMATE JOB AUTOPILOT');
        logger.info('='.repeat(60));
        logger.info(`   Query: ${this.options.query}`);
        logger.info(`   Location: ${this.options.location || 'Anywhere'}`);
        logger.info(`   Platforms: ${this.options.platforms.join(', ')}`);
        logger.info(`   Target: ${this.options.limit} applications`);
        logger.info(`   Remote only: ${this.options.remoteOnly}`);
        logger.info(`   Experience level: ${this.options.experienceLevel}`);
        logger.info('='.repeat(60) + '\n');

        await sendTelegramNotification(
            `${TELEGRAM_EMOJIS.rocket} Ultimate Job Autopilot Starting!\n\n` +
            `📝 Query: ${this.options.query}\n` +
            `📍 Location: ${this.options.location || 'Anywhere'}\n` +
            `🔌 Platforms: ${this.options.platforms.join(', ')}\n` +
            `🎯 Target: ${this.options.limit} applications\n` +
            `🏠 Remote only: ${this.options.remoteOnly}\n` +
            `📊 Experience: ${this.options.experienceLevel}`
        );

        // Initialize components
        this.aggregator = new JobAggregator({
            headless: this.options.headless,
            targetCompanies: this.options.targetCompanies
        });
        await this.aggregator.init();

        // Initialize resume tailor
        const templatePath = path.join(process.cwd(), 'templates', 'resume-template.tex');
        if (fs.existsSync(templatePath)) {
            this.resumeTailor = new SmartResumeTailor(this.profile, templatePath);
        }
    }

    async run() {
        try {
            await this.init();

            // Phase 1: Aggregate jobs from all sources
            logger.info('\n📡 PHASE 1: Job Discovery');
            logger.info('-'.repeat(40));
            
            const jobs = await this.aggregator.aggregateJobs(
                this.options.query,
                this.options.location,
                {
                    limit: this.options.limit * 2, // Get extra for filtering
                    sources: this.options.platforms,
                    targetCompanies: this.options.targetCompanies,
                    remoteOnly: this.options.remoteOnly,
                    experienceLevel: this.options.experienceLevel
                }
            );

            this.stats.jobsFound = jobs.length;
            
            await sendTelegramNotification(
                `${TELEGRAM_EMOJIS.search} Phase 1 Complete: Job Discovery\n\n` +
                `📋 Found ${jobs.length} jobs\n` +
                `🔝 Top companies: ${jobs.slice(0, 5).map(j => j.company).join(', ')}`
            );

            // Phase 2: Apply to jobs by platform
            logger.info('\n📝 PHASE 2: Application Submission');
            logger.info('-'.repeat(40));

            // Group jobs by application method
            const linkedInJobs = jobs.filter(j => 
                j.source === 'linkedin' || j.application_url?.includes('linkedin')
            );
            const indeedJobs = jobs.filter(j => 
                j.source === 'indeed' || j.application_url?.includes('indeed')
            );
            const directJobs = jobs.filter(j =>
                !j.application_url?.includes('linkedin') && 
                !j.application_url?.includes('indeed')
            );

            logger.info(`   LinkedIn jobs: ${linkedInJobs.length}`);
            logger.info(`   Indeed jobs: ${indeedJobs.length}`);
            logger.info(`   Direct/Other: ${directJobs.length}`);

            // Apply via LinkedIn
            if (this.options.platforms.includes('linkedin') && linkedInJobs.length > 0) {
                await this.applyViaLinkedIn(linkedInJobs);
            }

            // Apply via Indeed
            if (this.options.platforms.includes('indeed') && indeedJobs.length > 0) {
                await this.applyViaIndeed(indeedJobs);
            }

            // Apply directly to company sites
            if (directJobs.length > 0 && !this.options.dryRun) {
                await this.applyDirect(directJobs);
            }

            // Phase 3: Report
            await this.generateReport();

        } catch (error) {
            logger.error(`\n❌ Fatal error: ${error.message}`);
            await sendTelegramNotification(
                `${TELEGRAM_EMOJIS.error} Autopilot Error!\n\n` +
                `❌ ${error.message}`
            );
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async applyViaLinkedIn(jobs) {
        logger.info('\n🔗 Applying via LinkedIn...');
        
        this.linkedIn = new LinkedInAutoApply({ 
            headless: this.options.headless,
            profile: this.profile
        });
        await this.linkedIn.init();

        // Login
        const loggedIn = await this.linkedIn.login(
            process.env.LINKEDIN_EMAIL,
            process.env.LINKEDIN_PASSWORD
        );

        if (!loggedIn) {
            logger.error('   LinkedIn login failed');
            return;
        }

        // Apply to jobs
        const limit = Math.min(jobs.length, Math.floor(this.options.limit * 0.5));
        const results = await this.linkedIn.massApply(
            this.options.query,
            this.options.location,
            limit
        );

        // Normalize results (massApply returns arrays, convert to counts)
        this.stats.byPlatform.linkedin = {
            applied: Array.isArray(results.applied) ? results.applied.length : (results.applied || 0),
            failed: Array.isArray(results.failed) ? results.failed.length : (results.failed || 0),
            skipped: Array.isArray(results.skipped) ? results.skipped.length : (results.skipped || 0)
        };
        this.stats.applied += this.stats.byPlatform.linkedin.applied;
        this.stats.failed += this.stats.byPlatform.linkedin.failed;
        this.stats.skipped += this.stats.byPlatform.linkedin.skipped;
    }

    async applyViaIndeed(jobs) {
        logger.info('\n💼 Applying via Indeed...');
        
        this.indeed = new IndeedAutoApply(this.profile, { headless: this.options.headless });
        await this.indeed.init();

        // Login if credentials available
        if (process.env.INDEED_EMAIL && process.env.INDEED_PASSWORD) {
            await this.indeed.login(
                process.env.INDEED_EMAIL,
                process.env.INDEED_PASSWORD
            );
        }

        // Apply to jobs
        const limit = Math.min(jobs.length, Math.floor(this.options.limit * 0.3));
        const results = await this.indeed.searchAndApply(
            this.options.query,
            this.options.location,
            {
                limit,
                skipApplied: this.options.skipApplied,
                easyApplyOnly: true
            }
        );

        this.stats.byPlatform.indeed = results;
        this.stats.applied += results.applied || 0;
        this.stats.failed += results.failed || 0;
        this.stats.skipped += results.skipped || 0;
    }

    async applyDirect(jobs) {
        logger.info('\n🏢 Applying directly to company sites...');
        
        const formFiller = new UniversalFormFiller(this.profile);
        let applied = 0;
        const limit = Math.min(jobs.length, Math.floor(this.options.limit * 0.2));

        for (const job of jobs.slice(0, limit)) {
            if (!job.application_url) continue;

            logger.info(`\n   Applying to ${job.title} at ${job.company}...`);

            try {
                // Navigate to application page
                await this.aggregator.googleScraper.page.goto(job.application_url, {
                    waitUntil: 'networkidle2'
                });

                // Tailor resume if enabled
                if (this.resumeTailor && job.description) {
                    const recommendations = this.resumeTailor.getRecommendations(job);
                    logger.info(`   Match score: ${recommendations.matchScore}%`);
                }

                // Fill form (don't submit - too risky for direct applications)
                const result = await formFiller.fillForm(
                    this.aggregator.googleScraper.page,
                    { companyName: job.company, jobTitle: job.title }
                );

                logger.info(`   Filled ${result.filled} fields (review and submit manually)`);
                applied++;

            } catch (e) {
                logger.error(`   Direct apply failed: ${e.message}`);
            }
        }

        this.stats.byPlatform.direct = { prepared: applied };
    }

    async generateReport() {
        logger.info('\n' + '='.repeat(60));
        logger.info('📊 FINAL REPORT');
        logger.info('='.repeat(60));
        logger.info(`   Jobs discovered: ${this.stats.jobsFound}`);
        logger.info(`   Applications submitted: ${this.stats.applied}`);
        logger.info(`   Failed: ${this.stats.failed}`);
        logger.info(`   Skipped (already applied): ${this.stats.skipped}`);
        logger.info('\n   By Platform:');
        
        for (const [platform, stats] of Object.entries(this.stats.byPlatform)) {
            logger.info(`     ${platform}: ${JSON.stringify(stats)}`);
        }
        
        logger.info('='.repeat(60));

        // Send final notification
        await sendTelegramNotification(
            `${TELEGRAM_EMOJIS.trophy} Autopilot Complete!\n\n` +
            `📊 Final Results:\n` +
            `───────────────\n` +
            `🔍 Jobs Found: ${this.stats.jobsFound}\n` +
            `✅ Applied: ${this.stats.applied}\n` +
            `❌ Failed: ${this.stats.failed}\n` +
            `⏭️ Skipped: ${this.stats.skipped}\n\n` +
            `Good luck! 🍀`
        );

        // Save to database
        this.saveStatsToDb();
    }

    saveStatsToDb() {
        try {
            // Record session stats
            const sessionId = Date.now();
            const logDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            
            fs.writeFileSync(
                path.join(logDir, `session-${sessionId}.json`),
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    options: this.options,
                    stats: this.stats
                }, null, 2)
            );
        } catch (e) {
            logger.warn(`Could not save session stats: ${e.message}`);
        }
    }

    async cleanup() {
        logger.info('\n🧹 Cleaning up...');
        
        try {
            if (this.aggregator) await this.aggregator.close();
            if (this.linkedIn) await this.linkedIn.close();
            if (this.indeed) await this.indeed.close();
        } catch (e) {
            logger.warn(`Cleanup error: ${e.message}`);
        }
    }
}

// CLI
const program = new Command();

program
    .name('autopilot')
    .description('🚀 Ultimate Job Autopilot - Apply to jobs everywhere')
    .version('2.0.0')
    .option('-q, --query <query>', 'Job search query', 'software engineer')
    .option('-l, --location <location>', 'Job location', '')
    .option('--limit <number>', 'Maximum applications', '50')
    .option('--platforms <platforms>', 'Platforms to use (comma-separated)', 'linkedin,indeed,google,companies')
    .option('--companies <companies>', 'Target companies (comma-separated)', '')
    .option('--remote', 'Remote jobs only', false)
    .option('--experience <level>', 'Experience level (entry, mid, senior)', 'entry')
    .option('--no-headless', 'Show browser window')
    .option('--no-tailor', 'Skip resume tailoring')
    .option('--dry-run', 'Discover jobs but do not apply', false)
    .action(async (options) => {
        loadEnv();

        const platforms = options.platforms.split(',').map(p => p.trim());
        const companies = options.companies 
            ? options.companies.split(',').map(c => c.trim())
            : TOP_TECH_COMPANIES.slice(0, 20);

        const autopilot = new UltimateJobAutopilot({
            query: options.query,
            location: options.location,
            limit: parseInt(options.limit),
            platforms,
            targetCompanies: companies,
            remoteOnly: options.remote,
            experienceLevel: options.experience,
            headless: options.headless,
            tailorResume: options.tailor,
            dryRun: options.dryRun
        });

        await autopilot.run();
    });

// Quick commands
program
    .command('linkedin [query]')
    .description('Apply only via LinkedIn. Usage: linkedin "data scientist"')
    .option('-l, --location <location>', 'Location', '')
    .option('--limit <number>', 'Max applications', '25')
    .action(async (query, options) => {
        loadEnv();
        const autopilot = new UltimateJobAutopilot({
            query: query || 'software engineer',
            location: options.location,
            limit: parseInt(options.limit),
            platforms: ['linkedin']
        });
        await autopilot.run();
    });

program
    .command('indeed [query]')
    .description('Apply only via Indeed. Usage: indeed "data scientist"')
    .option('-l, --location <location>', 'Location', '')
    .option('--limit <number>', 'Max applications', '25')
    .action(async (query, options) => {
        loadEnv();
        const autopilot = new UltimateJobAutopilot({
            query: query || 'software engineer',
            location: options.location,
            limit: parseInt(options.limit),
            platforms: ['indeed']
        });
        await autopilot.run();
    });

program
    .command('discover [query]')
    .description('Discover jobs without applying (dry run)')
    .option('-l, --location <location>', 'Location', '')
    .option('--limit <number>', 'Max jobs to find', '100')
    .action(async (query, options) => {
        loadEnv();
        const autopilot = new UltimateJobAutopilot({
            query: query || 'software engineer',
            location: options.location,
            limit: parseInt(options.limit),
            dryRun: true
        });
        await autopilot.run();
    });

program
    .command('companies <companies> [query]')
    .description('Target specific companies. Usage: companies "Google,Meta" "data scientist"')
    .action(async (companies, query) => {
        loadEnv();
        const companyList = companies.split(',').map(c => c.trim());
        const autopilot = new UltimateJobAutopilot({
            query: query || 'software engineer',
            targetCompanies: companyList,
            platforms: ['companies', 'google']
        });
        await autopilot.run();
    });

// Run if executed directly
if (require.main === module) {
    program.parse();
}

module.exports = { UltimateJobAutopilot };
