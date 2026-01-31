#!/usr/bin/env node
/**
 * Job Application Autopilot - Main Orchestrator
 * 
 * Usage:
 *   node orchestrator.js init                     Initialize database
 *   node orchestrator.js scrape [source] --limit N   Scrape jobs
 *   node orchestrator.js tailor <job-id>          Generate tailored resume
 *   node orchestrator.js apply <job-id>           Mark applied + push to GitHub
 *   node orchestrator.js list --status STATUS     List jobs by status
 *   node orchestrator.js report                   Show application stats
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

// Modules
const { initDatabase, DB_PATH } = require('./src/database');
const { generateResume } = require('./src/resume-generator');
const { pushApplication } = require('./src/github-pusher');
const { scrapeLinkedIn } = require('./src/scrapers/linkedin-scraper');
const { scrapeIndeed } = require('./src/scrapers/indeed-scraper');
const { scrapeWellfound } = require('./src/scrapers/wellfound-scraper');

// Default search parameters (customize in profile.md)
const DEFAULT_SEARCH = 'software engineer';
const DEFAULT_LOCATION = 'Houston, TX';
const APPLICATIONS_DIR = path.join(__dirname, 'applications');

// ============================================
// Helper Functions
// ============================================

function getDb() {
    return new Database(DB_PATH);
}

function parseArgs(args) {
    const parsed = { _: [], limit: 10, status: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            parsed.limit = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--status' && args[i + 1]) {
            parsed.status = args[i + 1];
            i++;
        } else if (!args[i].startsWith('--')) {
            parsed._.push(args[i]);
        }
    }
    return parsed;
}

// ============================================
// Commands
// ============================================

async function cmdInit() {
    console.log('🚀 Initializing Job Application Autopilot...\n');
    await initDatabase();
    await fs.ensureDir(APPLICATIONS_DIR);
    console.log(`✓ Applications folder: ${APPLICATIONS_DIR}`);
    console.log('\n✅ System ready! Run: node orchestrator.js scrape linkedin --limit 5');
}

async function cmdScrape(source = 'all', limit = 10) {
    console.log(`\n🔍 Scraping jobs (source: ${source}, limit: ${limit})...\n`);
    
    const db = getDb();
    let allJobs = [];
    
    // Scrape based on source
    if (source === 'linkedin' || source === 'all') {
        const jobs = await scrapeLinkedIn(DEFAULT_SEARCH, DEFAULT_LOCATION, limit);
        allJobs = allJobs.concat(jobs);
    }
    if (source === 'indeed' || source === 'all') {
        const jobs = await scrapeIndeed(DEFAULT_SEARCH, DEFAULT_LOCATION, limit);
        allJobs = allJobs.concat(jobs);
    }
    if (source === 'wellfound' || source === 'all') {
        const jobs = await scrapeWellfound(DEFAULT_SEARCH, 'remote', limit);
        allJobs = allJobs.concat(jobs);
    }
    
    // Insert into database
    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO jobs (job_id, title, company, location, salary, description, application_url, source, posted_date, status)
        VALUES (@job_id, @title, @company, @location, @salary, @description, @application_url, @source, @posted_date, 'discovered')
    `);
    
    let inserted = 0;
    for (const job of allJobs) {
        try {
            const result = insertStmt.run({
                job_id: job.job_id,
                title: job.title,
                company: job.company,
                location: job.location || 'Remote',
                salary: job.salary || null,
                description: job.description || '',
                application_url: job.application_url || '',
                source: job.source,
                posted_date: job.posted_date
            });
            if (result.changes > 0) inserted++;
        } catch (e) {
            // Duplicate, skip
        }
    }
    
    db.close();
    
    console.log(`\n✅ Scraping complete!`);
    console.log(`   Total found: ${allJobs.length}`);
    console.log(`   New jobs added: ${inserted}`);
}

async function cmdTailor(jobId) {
    if (!jobId) {
        console.error('❌ Error: Please provide a job ID');
        console.log('   Usage: node orchestrator.js tailor <job-id>');
        process.exit(1);
    }
    
    console.log(`\n📝 Tailoring resume for job ${jobId}...\n`);
    
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? OR job_id = ?').get(jobId, jobId);
    
    if (!job) {
        console.error(`❌ Job not found: ${jobId}`);
        db.close();
        process.exit(1);
    }
    
    console.log(`  Company: ${job.company}`);
    console.log(`  Title: ${job.title}`);
    console.log(`  Location: ${job.location}`);
    
    // Create application folder
    const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, '-');
    const safeTitle = job.title.replace(/[^a-zA-Z0-9]/g, '-');
    const appDir = path.join(APPLICATIONS_DIR, `${safeCompany}-${safeTitle}`);
    await fs.ensureDir(appDir);
    
    // Generate resume
    const resumePath = await generateResume(job, appDir);
    
    // Update job status
    db.prepare(`
        UPDATE jobs SET status = 'tailored', last_updated = CURRENT_TIMESTAMP WHERE id = ?
    `).run(job.id);
    
    // Create application record
    db.prepare(`
        INSERT OR REPLACE INTO applications (job_id, company, title, status, resume_path)
        VALUES (?, ?, ?, 'tailored', ?)
    `).run(job.job_id, job.company, job.title, resumePath);
    
    db.close();
    
    console.log(`\n✅ Resume tailored!`);
    console.log(`   Folder: ${appDir}`);
    console.log(`   Next: Review resume, then run: node orchestrator.js apply ${job.id}`);
}

async function cmdApply(jobId) {
    if (!jobId) {
        console.error('❌ Error: Please provide a job ID');
        process.exit(1);
    }
    
    console.log(`\n🚀 Marking job ${jobId} as applied...\n`);
    
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? OR job_id = ?').get(jobId, jobId);
    
    if (!job) {
        console.error(`❌ Job not found: ${jobId}`);
        db.close();
        process.exit(1);
    }
    
    // Update status
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE jobs SET status = 'applied', last_updated = ? WHERE id = ?
    `).run(now, job.id);
    
    db.prepare(`
        UPDATE applications SET status = 'applied', date_applied = ?, updated_at = ? WHERE job_id = ?
    `).run(now, now, job.job_id);
    
    console.log(`  ✓ Status updated to 'applied'`);
    
    // Push to GitHub
    const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, '-');
    const safeTitle = job.title.replace(/[^a-zA-Z0-9]/g, '-');
    const appDir = path.join(APPLICATIONS_DIR, `${safeCompany}-${safeTitle}`);
    
    const result = await pushApplication(job.company, job.title, appDir);
    
    db.close();
    
    if (result.success) {
        console.log(`\n✅ Application recorded!`);
        console.log(`   Company: ${job.company}`);
        console.log(`   Title: ${job.title}`);
        if (job.application_url) {
            console.log(`   Apply here: ${job.application_url}`);
        }
    } else {
        console.log(`\n⚠️  Status updated but Git push failed`);
    }
}

async function cmdList(status = null) {
    console.log('\n📋 Job Listings\n');
    
    const db = getDb();
    
    let query = 'SELECT id, job_id, title, company, location, source, status, discovered_date FROM jobs';
    let jobs;
    
    if (status) {
        query += ' WHERE status = ?';
        jobs = db.prepare(query + ' ORDER BY discovered_date DESC').all(status);
    } else {
        jobs = db.prepare(query + ' ORDER BY discovered_date DESC').all();
    }
    
    if (jobs.length === 0) {
        console.log('  No jobs found.' + (status ? ` (status: ${status})` : ''));
        db.close();
        return;
    }
    
    // Group by status
    const grouped = {};
    for (const job of jobs) {
        if (!grouped[job.status]) grouped[job.status] = [];
        grouped[job.status].push(job);
    }
    
    for (const [s, list] of Object.entries(grouped)) {
        const emoji = s === 'discovered' ? '🔵' : s === 'tailored' ? '🟡' : s === 'applied' ? '🟢' : '⚪';
        console.log(`${emoji} ${s.toUpperCase()} (${list.length})`);
        console.log('─'.repeat(60));
        
        for (const job of list.slice(0, 20)) {
            console.log(`  [${job.id}] ${job.title}`);
            console.log(`      ${job.company} | ${job.location} | ${job.source}`);
        }
        if (list.length > 20) {
            console.log(`      ... and ${list.length - 20} more`);
        }
        console.log('');
    }
    
    db.close();
}

async function cmdReport() {
    console.log('\n📊 Application Report\n');
    console.log('═'.repeat(50));
    
    const db = getDb();
    
    // Status counts
    const statusCounts = db.prepare(`
        SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all();
    
    let total = 0;
    const stats = { discovered: 0, tailored: 0, applied: 0 };
    
    for (const row of statusCounts) {
        stats[row.status] = row.count;
        total += row.count;
    }
    
    console.log('  Status Breakdown:');
    console.log(`    🔵 Discovered:  ${stats.discovered}`);
    console.log(`    🟡 Tailored:    ${stats.tailored}`);
    console.log(`    🟢 Applied:     ${stats.applied}`);
    console.log(`    ─────────────────`);
    console.log(`    📊 Total:       ${total}`);
    
    // By source
    console.log('\n  Jobs by Source:');
    const sourceCounts = db.prepare(`
        SELECT source, COUNT(*) as count FROM jobs GROUP BY source
    `).all();
    
    for (const row of sourceCounts) {
        console.log(`    • ${row.source || 'Unknown'}: ${row.count}`);
    }
    
    // Recent applications
    console.log('\n  Recent Applications:');
    const recentApps = db.prepare(`
        SELECT company, title, date_applied 
        FROM applications 
        WHERE status = 'applied' 
        ORDER BY date_applied DESC 
        LIMIT 5
    `).all();
    
    if (recentApps.length === 0) {
        console.log('    (none yet)');
    } else {
        for (const app of recentApps) {
            const date = app.date_applied ? app.date_applied.split('T')[0] : 'unknown';
            console.log(`    • ${app.company} - ${app.title} (${date})`);
        }
    }
    
    console.log('\n' + '═'.repeat(50));
    
    // Conversion funnel
    if (total > 0) {
        const tailorRate = ((stats.tailored + stats.applied) / total * 100).toFixed(1);
        const applyRate = (stats.applied / total * 100).toFixed(1);
        console.log(`  Conversion: ${tailorRate}% tailored → ${applyRate}% applied`);
    }
    
    db.close();
}

// ============================================
// Main Entry Point
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const parsed = parseArgs(args);
    const command = parsed._[0];
    
    try {
        switch (command) {
            case 'init':
                await cmdInit();
                break;
                
            case 'scrape':
                const source = parsed._[1] || 'all';
                await cmdScrape(source, parsed.limit);
                break;
                
            case 'tailor':
                await cmdTailor(parsed._[1]);
                break;
                
            case 'apply':
                await cmdApply(parsed._[1]);
                break;
                
            case 'list':
                await cmdList(parsed.status);
                break;
                
            case 'report':
                await cmdReport();
                break;
                
            default:
                console.log(`
Job Application Autopilot 🚀

Usage:
  node orchestrator.js <command> [options]

Commands:
  init                     Initialize database and folders
  scrape [source]          Scrape jobs (linkedin|indeed|wellfound|all)
    --limit N              Number of jobs per source (default: 10)
  tailor <job-id>          Generate tailored resume for a job
  apply <job-id>           Mark job as applied + push to GitHub
  list                     List all jobs
    --status STATUS        Filter by status (discovered|tailored|applied)
  report                   Show application statistics

Examples:
  node orchestrator.js init
  node orchestrator.js scrape linkedin --limit 5
  node orchestrator.js list --status discovered
  node orchestrator.js tailor 1
  node orchestrator.js apply 1
  node orchestrator.js report
`);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
