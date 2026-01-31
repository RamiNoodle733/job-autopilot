#!/usr/bin/env node
/**
 * Job Application Autopilot Pro - Main Orchestrator v2
 * 
 * Usage:
 *   node orchestrator.js init                         Initialize system
 *   node orchestrator.js scrape [source] --limit N    Scrape jobs from all sources
 *   node orchestrator.js tailor <job-id>              Generate tailored resume
 *   node orchestrator.js apply <job-id>               Mark applied + push to GitHub
 *   node orchestrator.js mass-apply --limit N         Auto-apply to N jobs via LinkedIn
 *   node orchestrator.js email <command>              Email automation
 *   node orchestrator.js schedule                     Set up cron jobs
 *   node orchestrator.js stats                        Detailed analytics
 *   node orchestrator.js list --status STATUS         List jobs
 *   node orchestrator.js compile                      Compile all pending resumes
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');
const { execSync, exec } = require('child_process');

// Modules
const { initDatabase, DB_PATH } = require('./src/database');
const { generateResume } = require('./src/resume-generator');
const { pushApplication } = require('./src/github-pusher');
const { compileResume, compileAllResumes, smartCompile, checkLatexAvailable } = require('./src/pdf-compiler');
const { scrapeLinkedIn } = require('./src/scrapers/linkedin-scraper');
const { scrapeIndeed } = require('./src/scrapers/indeed-scraper');
const { scrapeWellfound } = require('./src/scrapers/wellfound-scraper');

// Config from environment
const CONFIG = {
    defaultSearch: process.env.JOB_SEARCH_QUERY || 'AI Product Manager',
    defaultLocation: process.env.JOB_SEARCH_LOCATION || 'Houston, TX',
    applicationsDir: path.join(__dirname, 'applications'),
    templatesDir: path.join(__dirname, 'templates'),
    dataDir: path.join(__dirname, 'data'),
    cronTime: process.env.CRON_TIME || '0 5 * * *', // 5 AM daily
};

// ============================================
// Helper Functions
// ============================================

function getDb() {
    return new Database(DB_PATH);
}

function parseArgs(args) {
    const parsed = { 
        _: [], 
        limit: 10, 
        status: null, 
        source: 'all',
        force: false,
        headless: false,
        query: null,
        location: null,
        days: 7
    };
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            parsed.limit = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--status' && args[i + 1]) {
            parsed.status = args[i + 1];
            i++;
        } else if (args[i] === '--query' && args[i + 1]) {
            parsed.query = args[i + 1];
            i++;
        } else if (args[i] === '--location' && args[i + 1]) {
            parsed.location = args[i + 1];
            i++;
        } else if (args[i] === '--days' && args[i + 1]) {
            parsed.days = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--force') {
            parsed.force = true;
        } else if (args[i] === '--headless') {
            parsed.headless = true;
        } else if (!args[i].startsWith('--')) {
            parsed._.push(args[i]);
        }
    }
    return parsed;
}

function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

// ============================================
// Commands
// ============================================

async function cmdInit() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║        Job Application Autopilot Pro - Setup              ║
╚═══════════════════════════════════════════════════════════╝
`);
    
    // Initialize database
    console.log('📦 Initializing database...');
    await initDatabase();
    
    // Create directories
    console.log('📁 Creating directories...');
    await fs.ensureDir(CONFIG.applicationsDir);
    await fs.ensureDir(CONFIG.dataDir);
    await fs.ensureDir(CONFIG.templatesDir);
    
    // Check LaTeX availability
    console.log('🔍 Checking LaTeX compiler...');
    const latexCmd = checkLatexAvailable();
    if (latexCmd) {
        console.log(`   ✓ Found: ${latexCmd}`);
    } else {
        console.log('   ⚠️  LaTeX not found. Install with:');
        console.log('      Ubuntu: sudo apt install texlive-xetex texlive-fonts-extra');
        console.log('      Or use Overleaf for PDF generation');
    }
    
    // Create profile.json if not exists
    const profilePath = path.join(CONFIG.dataDir, 'profile.json');
    if (!await fs.pathExists(profilePath)) {
        console.log('📝 Creating default profile...');
        await fs.writeJson(profilePath, {
            firstName: 'Rami',
            lastName: 'Abdelrazzaq',
            email: process.env.GMAIL_USER || 'ramiabdelrazzaq@gmail.com',
            phone: process.env.PHONE || '',
            location: 'Katy, TX',
            linkedinHandle: 'ramiabdelrazzaq',
            githubHandle: 'RamiNoodle733',
            summary: 'AI Product Manager and Technical Program Manager with experience in automation, no-code solutions, and cross-functional leadership.',
            skills: {
                languages: 'Python, JavaScript/Node.js, SQL, Bash',
                tools: 'Jira, Notion, Asana, Git, Docker, AWS',
                ai: 'ChatGPT, Claude, Prompt Engineering, LangChain',
                methodologies: 'Agile, Scrum, OKRs, Design Thinking'
            },
            targetRoles: ['AI Product Manager', 'Technical Program Manager', 'Product Manager'],
            targetLocations: ['Katy, TX', 'Houston, TX', 'Remote', 'Saudi Arabia', 'UAE']
        }, { spaces: 2 });
    }
    
    // Check .env file
    const envPath = path.join(__dirname, '.env');
    if (!await fs.pathExists(envPath)) {
        console.log('📝 Creating .env template...');
        await fs.writeFile(envPath, `# Job Application Autopilot Pro - Configuration

# Gmail credentials (use App Password, not regular password)
GMAIL_USER=ramiabdelrazzaq@gmail.com
GMAIL_APP_PASSWORD=

# LinkedIn credentials (for auto-apply)
LINKEDIN_EMAIL=
LINKEDIN_PASSWORD=

# Your contact info
PHONE=

# Job search defaults
JOB_SEARCH_QUERY=AI Product Manager
JOB_SEARCH_LOCATION=Houston, TX

# Cron schedule (default: 5 AM daily)
CRON_TIME=0 5 * * *

# GitHub (for pushing applications)
GITHUB_TOKEN=
GITHUB_REPO=RamiNoodle733/job-autopilot
`);
        console.log('   ⚠️  Please edit .env with your credentials');
    }
    
    console.log(`
✅ Initialization complete!

Next steps:
  1. Edit .env with your credentials
  2. Edit data/profile.json with your info
  3. Run: node orchestrator.js scrape --limit 10
  4. Run: node orchestrator.js list
  5. Run: node orchestrator.js stats
`);
}

async function cmdScrape(source = 'all', limit = 10, options = {}) {
    const query = options.query || CONFIG.defaultSearch;
    const location = options.location || CONFIG.defaultLocation;
    
    console.log(`
🔍 Scraping Jobs
   Query: "${query}"
   Location: "${location}"
   Source: ${source}
   Limit: ${limit} per source
`);
    
    const db = getDb();
    let allJobs = [];
    
    // Scrape from each source
    const sources = source === 'all' 
        ? ['linkedin', 'indeed', 'wellfound'] 
        : [source];
    
    for (const src of sources) {
        console.log(`\n📡 Scraping ${src}...`);
        
        try {
            let jobs = [];
            switch (src) {
                case 'linkedin':
                    jobs = await scrapeLinkedIn(query, location, limit);
                    break;
                case 'indeed':
                    jobs = await scrapeIndeed(query, location, limit);
                    break;
                case 'wellfound':
                    jobs = await scrapeWellfound(query, 'remote', limit);
                    break;
            }
            console.log(`   Found ${jobs.length} jobs`);
            allJobs = allJobs.concat(jobs);
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
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
    
    console.log(`
✅ Scraping Complete!
   Total found: ${allJobs.length}
   New jobs added: ${inserted}
   
Next: node orchestrator.js list --status discovered
`);
}

async function cmdTailor(jobId) {
    if (!jobId) {
        console.error('❌ Usage: node orchestrator.js tailor <job-id>');
        process.exit(1);
    }
    
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? OR job_id = ?').get(jobId, jobId);
    
    if (!job) {
        console.error(`❌ Job not found: ${jobId}`);
        db.close();
        process.exit(1);
    }
    
    console.log(`
📝 Tailoring Resume
   Company: ${job.company}
   Title: ${job.title}
   Location: ${job.location}
`);
    
    // Create application folder
    const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const safeTitle = job.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const appDir = path.join(CONFIG.applicationsDir, `${safeCompany}-${safeTitle}`);
    await fs.ensureDir(appDir);
    
    // Generate resume
    const resumePath = await generateResume(job, appDir);
    
    // Try to compile PDF
    const latexAvailable = checkLatexAvailable();
    let pdfPath = null;
    
    if (latexAvailable && resumePath) {
        console.log('\n📄 Compiling PDF...');
        pdfPath = await compileResume(resumePath, job.company, job.title);
    }
    
    // Update job status
    db.prepare(`
        UPDATE jobs SET status = 'tailored', last_updated = CURRENT_TIMESTAMP WHERE id = ?
    `).run(job.id);
    
    // Create/update application record
    db.prepare(`
        INSERT OR REPLACE INTO applications (job_id, company, title, status, resume_path)
        VALUES (?, ?, ?, 'tailored', ?)
    `).run(job.job_id, job.company, job.title, resumePath || appDir);
    
    db.close();
    
    console.log(`
✅ Resume Tailored!
   Folder: ${appDir}
   ${pdfPath ? `PDF: ${pdfPath}` : 'PDF: Use Overleaf to compile .tex file'}
   
Next: Review resume, then run: node orchestrator.js apply ${job.id}
`);
}

async function cmdApply(jobId) {
    if (!jobId) {
        console.error('❌ Usage: node orchestrator.js apply <job-id>');
        process.exit(1);
    }
    
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? OR job_id = ?').get(jobId, jobId);
    
    if (!job) {
        console.error(`❌ Job not found: ${jobId}`);
        db.close();
        process.exit(1);
    }
    
    console.log(`\n🚀 Recording Application: ${job.title} @ ${job.company}\n`);
    
    const now = new Date().toISOString();
    
    // Update status
    db.prepare(`
        UPDATE jobs SET status = 'applied', last_updated = ? WHERE id = ?
    `).run(now, job.id);
    
    db.prepare(`
        UPDATE applications SET status = 'applied', date_applied = ?, updated_at = ? WHERE job_id = ?
    `).run(now, now, job.job_id);
    
    console.log('  ✓ Status updated to "applied"');
    
    // Push to GitHub
    const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const safeTitle = job.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const appDir = path.join(CONFIG.applicationsDir, `${safeCompany}-${safeTitle}`);
    
    try {
        const result = await pushApplication(job.company, job.title, appDir);
        if (result.success) {
            console.log('  ✓ Pushed to GitHub');
        }
    } catch (e) {
        console.log('  ⚠️  GitHub push skipped');
    }
    
    db.close();
    
    console.log(`
✅ Application Recorded!

${job.application_url ? `Apply here: ${job.application_url}` : ''}
`);
}

async function cmdMassApply(limit = 10, options = {}) {
    console.log(`
🤖 LinkedIn Mass Auto-Apply
   Limit: ${limit} applications
   Mode: ${options.headless ? 'headless' : 'visible browser'}
`);
    
    try {
        const { LinkedInAutoApply } = require('./src/auto-apply/linkedin');
        
        const linkedIn = new LinkedInAutoApply({
            headless: options.headless,
            resumePath: options.resumePath,
            maxApps: limit,
            profile: {
                firstName: 'Rami',
                lastName: 'Abdelrazzaq',
                email: process.env.GMAIL_USER || 'ramiabdelrazzaq@gmail.com',
                phone: process.env.PHONE || '',
                city: 'Katy',
                state: 'TX'
            }
        });
        
        await linkedIn.init();
        
        // Check login status
        const loggedIn = await linkedIn.checkLoginStatus();
        
        if (!loggedIn) {
            console.log('\n⚠️  Not logged in to LinkedIn.');
            console.log('   The browser will open. Please log in manually.');
            console.log('   (Your session will be saved for next time)');
            
            if (process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_PASSWORD) {
                await linkedIn.login(process.env.LINKEDIN_EMAIL, process.env.LINKEDIN_PASSWORD);
            } else {
                // Wait for manual login
                console.log('\n   Waiting 60 seconds for manual login...');
                await linkedIn.page.goto('https://www.linkedin.com/login');
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                if (await linkedIn.checkLoginStatus()) {
                    console.log('   ✅ Login detected!');
                    await linkedIn.saveCookies();
                } else {
                    console.log('   ❌ Still not logged in. Exiting.');
                    await linkedIn.close();
                    return;
                }
            }
        }
        
        // Run mass apply
        const query = options.query || CONFIG.defaultSearch;
        const location = options.location || CONFIG.defaultLocation;
        
        const results = await linkedIn.massApply(query, location, limit);
        
        // Save results to database
        const db = getDb();
        
        for (const app of results.applied) {
            db.prepare(`
                INSERT OR IGNORE INTO jobs (job_id, title, company, location, source, status, discovered_date)
                VALUES (?, ?, ?, ?, 'linkedin', 'applied', CURRENT_TIMESTAMP)
            `).run(app.jobId || `linkedin-${Date.now()}`, app.title, app.company, app.location);
        }
        
        db.close();
        await linkedIn.close();
        
        console.log(`
✅ Mass Apply Complete!
   Applied: ${results.applied.length}
   Skipped: ${results.skipped.length}
   Failed: ${results.failed.length}
`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\nMake sure puppeteer is installed: npm install puppeteer');
    }
}

async function cmdEmail(subCommand, options) {
    const { EmailSender } = require('./src/email-sender');
    
    switch (subCommand) {
        case 'test':
            console.log('\n📧 Testing email connection...');
            try {
                const sender = new EmailSender();
                await sender.init();
                console.log('✅ Email configured correctly!');
                sender.close();
            } catch (error) {
                console.error('❌ Email test failed:', error.message);
            }
            break;
            
        case 'followup':
            console.log('\n📧 Sending follow-up emails...');
            try {
                const sender = new EmailSender();
                await sender.init();
                
                const jobs = sender.getJobsNeedingFollowUp(options.days || 3);
                console.log(`   Found ${jobs.length} jobs needing follow-up`);
                
                if (jobs.length === 0) {
                    console.log('   No follow-ups needed.');
                    sender.close();
                    return;
                }
                
                // For now, just list them (emails need recipient addresses)
                for (const job of jobs) {
                    console.log(`   • ${job.company} - ${job.title} (applied ${formatDate(job.date_applied)})`);
                }
                
                console.log('\n   ⚠️  To send follow-ups, you need recruiter email addresses.');
                console.log('   Add emails to the applications table or use: node orchestrator.js email send <job-id> <email>');
                
                sender.close();
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
            break;
            
        case 'send':
            if (!options._[2] || !options._[3]) {
                console.log('Usage: node orchestrator.js email send <job-id> <recipient-email>');
                return;
            }
            try {
                const sender = new EmailSender();
                await sender.init();
                const result = await sender.sendFollowUp(options._[2], options._[3], { force: options.force });
                sender.close();
                
                if (result.success) {
                    console.log('✅ Follow-up email sent!');
                } else {
                    console.log('⚠️ ', result.error);
                }
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
            break;
            
        case 'report':
            try {
                const sender = new EmailSender();
                await sender.init();
                const report = sender.getEmailReport(options.days || 7);
                
                console.log(`\n📧 Email Report (last ${options.days || 7} days)`);
                console.log('═'.repeat(40));
                console.log(`Total sent: ${report.total}`);
                console.log('\nBy type:');
                for (const [type, count] of Object.entries(report.byTemplate)) {
                    console.log(`  • ${type}: ${count}`);
                }
                
                if (report.recentEmails.length > 0) {
                    console.log('\nRecent emails:');
                    for (const email of report.recentEmails.slice(0, 5)) {
                        console.log(`  • ${email.recipient} - ${email.subject.substring(0, 40)}...`);
                    }
                }
                
                sender.close();
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
            break;
            
        default:
            console.log(`
📧 Email Commands:

  node orchestrator.js email test              Test email connection
  node orchestrator.js email followup          List jobs needing follow-up
  node orchestrator.js email send <id> <email> Send follow-up to specific job
  node orchestrator.js email report            Show email statistics
  
Options:
  --days N    Look back N days (default: 7)
  --force     Send even if already sent
`);
    }
}

async function cmdSchedule() {
    console.log(`
📅 Setting Up Scheduled Jobs
`);
    
    const cronTime = CONFIG.cronTime;
    const scriptPath = path.join(__dirname, 'orchestrator.js');
    const logPath = path.join(__dirname, 'logs', 'cron.log');
    
    await fs.ensureDir(path.join(__dirname, 'logs'));
    
    // Create cron job command
    const cronCommand = `${cronTime} cd ${__dirname} && /usr/bin/node ${scriptPath} scrape --limit 20 >> ${logPath} 2>&1`;
    
    console.log('Cron job to add:');
    console.log(`  ${cronCommand}`);
    console.log('\nTo install, run:');
    console.log(`  (crontab -l 2>/dev/null; echo "${cronCommand}") | crontab -`);
    
    // Create a systemd timer alternative
    const systemdService = `[Unit]
Description=Job Application Autopilot Daily Scrape
After=network.target

[Service]
Type=oneshot
WorkingDirectory=${__dirname}
ExecStart=/usr/bin/node ${scriptPath} scrape --limit 20
StandardOutput=append:${logPath}
StandardError=append:${logPath}
User=${process.env.USER || 'root'}

[Install]
WantedBy=multi-user.target
`;

    const systemdTimer = `[Unit]
Description=Run Job Autopilot daily at 5 AM

[Timer]
OnCalendar=*-*-* 05:00:00
Persistent=true

[Install]
WantedBy=timers.target
`;
    
    console.log('\nOr create systemd timer:');
    console.log('  sudo nano /etc/systemd/system/job-autopilot.service');
    console.log('  sudo nano /etc/systemd/system/job-autopilot.timer');
    console.log('  sudo systemctl enable job-autopilot.timer');
    console.log('  sudo systemctl start job-autopilot.timer');
}

async function cmdStats() {
    const db = getDb();
    
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║            📊 Job Application Statistics                  ║
╚═══════════════════════════════════════════════════════════╝
`);
    
    // Overall stats
    const statusCounts = db.prepare(`
        SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all();
    
    let total = 0;
    const stats = { discovered: 0, tailored: 0, applied: 0, interviewing: 0, rejected: 0, offered: 0 };
    
    for (const row of statusCounts) {
        stats[row.status] = row.count;
        total += row.count;
    }
    
    console.log('📈 Pipeline Overview');
    console.log('─'.repeat(50));
    console.log(`  🔵 Discovered    ${String(stats.discovered).padStart(5)}  ${'█'.repeat(Math.min(stats.discovered / 2, 30))}`);
    console.log(`  🟡 Tailored      ${String(stats.tailored).padStart(5)}  ${'█'.repeat(Math.min(stats.tailored, 30))}`);
    console.log(`  🟢 Applied       ${String(stats.applied).padStart(5)}  ${'█'.repeat(Math.min(stats.applied, 30))}`);
    console.log(`  🔷 Interviewing  ${String(stats.interviewing || 0).padStart(5)}  ${'█'.repeat(Math.min(stats.interviewing || 0, 30))}`);
    console.log(`  ❌ Rejected      ${String(stats.rejected || 0).padStart(5)}  ${'█'.repeat(Math.min(stats.rejected || 0, 30))}`);
    console.log(`  🎉 Offered       ${String(stats.offered || 0).padStart(5)}  ${'█'.repeat(Math.min(stats.offered || 0, 30))}`);
    console.log('─'.repeat(50));
    console.log(`     Total         ${String(total).padStart(5)}`);
    
    // By source
    console.log('\n📡 Jobs by Source');
    console.log('─'.repeat(50));
    const sourceCounts = db.prepare(`
        SELECT source, COUNT(*) as count FROM jobs GROUP BY source ORDER BY count DESC
    `).all();
    
    for (const row of sourceCounts) {
        console.log(`  ${(row.source || 'Unknown').padEnd(15)} ${String(row.count).padStart(5)}  ${'█'.repeat(Math.min(row.count / 2, 30))}`);
    }
    
    // Daily applications (last 7 days)
    console.log('\n📆 Daily Applications (Last 7 Days)');
    console.log('─'.repeat(50));
    const dailyApps = db.prepare(`
        SELECT DATE(date_applied) as day, COUNT(*) as count 
        FROM applications 
        WHERE status = 'applied' AND date_applied >= date('now', '-7 days')
        GROUP BY DATE(date_applied)
        ORDER BY day DESC
    `).all();
    
    if (dailyApps.length === 0) {
        console.log('  No applications in the last 7 days');
    } else {
        for (const row of dailyApps) {
            const day = new Date(row.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            console.log(`  ${day.padEnd(15)} ${String(row.count).padStart(3)}  ${'🟢'.repeat(Math.min(row.count, 20))}`);
        }
    }
    
    // Top companies
    console.log('\n🏢 Top Companies Applied To');
    console.log('─'.repeat(50));
    const topCompanies = db.prepare(`
        SELECT company, COUNT(*) as count 
        FROM jobs 
        WHERE status = 'applied'
        GROUP BY company 
        ORDER BY count DESC 
        LIMIT 10
    `).all();
    
    if (topCompanies.length === 0) {
        console.log('  No applications yet');
    } else {
        for (const row of topCompanies) {
            console.log(`  ${row.company.substring(0, 25).padEnd(25)} ${row.count}`);
        }
    }
    
    // Recent applications
    console.log('\n🕐 Recent Applications');
    console.log('─'.repeat(50));
    const recentApps = db.prepare(`
        SELECT company, title, date_applied 
        FROM applications 
        WHERE status = 'applied' 
        ORDER BY date_applied DESC 
        LIMIT 10
    `).all();
    
    if (recentApps.length === 0) {
        console.log('  No applications yet');
    } else {
        for (const app of recentApps) {
            const date = formatDate(app.date_applied);
            console.log(`  ${date.padEnd(12)} ${app.company.substring(0, 20).padEnd(20)} ${app.title.substring(0, 25)}`);
        }
    }
    
    // Conversion rates
    if (total > 0 && stats.applied > 0) {
        console.log('\n📊 Conversion Rates');
        console.log('─'.repeat(50));
        const tailorRate = (((stats.tailored || 0) + (stats.applied || 0)) / total * 100).toFixed(1);
        const applyRate = ((stats.applied || 0) / total * 100).toFixed(1);
        const interviewRate = ((stats.interviewing || 0) / (stats.applied || 1) * 100).toFixed(1);
        
        console.log(`  Discovered → Tailored:    ${tailorRate}%`);
        console.log(`  Discovered → Applied:     ${applyRate}%`);
        console.log(`  Applied → Interview:      ${interviewRate}%`);
    }
    
    db.close();
}

async function cmdList(status = null) {
    const db = getDb();
    
    console.log('\n📋 Job Listings\n');
    
    let query = 'SELECT id, job_id, title, company, location, source, status, discovered_date FROM jobs';
    let jobs;
    
    if (status) {
        query += ' WHERE status = ?';
        jobs = db.prepare(query + ' ORDER BY discovered_date DESC').all(status);
        console.log(`   Filtering by status: ${status}\n`);
    } else {
        jobs = db.prepare(query + ' ORDER BY discovered_date DESC LIMIT 50').all();
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
    
    const emojis = {
        discovered: '🔵',
        tailored: '🟡',
        applied: '🟢',
        interviewing: '🔷',
        rejected: '❌',
        offered: '🎉'
    };
    
    for (const [s, list] of Object.entries(grouped)) {
        const emoji = emojis[s] || '⚪';
        console.log(`${emoji} ${s.toUpperCase()} (${list.length})`);
        console.log('─'.repeat(70));
        
        for (const job of list.slice(0, 20)) {
            console.log(`  [${String(job.id).padStart(3)}] ${job.title.substring(0, 35)}`);
            console.log(`        ${job.company.substring(0, 25)} | ${job.location.substring(0, 20)} | ${job.source}`);
        }
        if (list.length > 20) {
            console.log(`        ... and ${list.length - 20} more`);
        }
        console.log('');
    }
    
    db.close();
}

async function cmdCompile() {
    console.log('\n📄 Compiling Resumes to PDF\n');
    
    const latexCmd = checkLatexAvailable();
    if (!latexCmd) {
        console.log('❌ No LaTeX compiler found.');
        console.log('   Install with: sudo apt install texlive-xetex texlive-fonts-extra');
        return;
    }
    
    const results = await compileAllResumes(CONFIG.applicationsDir);
    
    console.log('\n📊 Compilation Results:');
    console.log(`   ✅ Success: ${results.success.length}`);
    console.log(`   ❌ Failed: ${results.failed.length}`);
    
    if (results.success.length > 0) {
        console.log('\nCompiled PDFs:');
        for (const pdf of results.success) {
            console.log(`   • ${pdf.company} - ${pdf.title}`);
        }
    }
    
    if (results.failed.length > 0) {
        console.log('\nFailed:');
        for (const fail of results.failed) {
            console.log(`   • ${fail.company}: ${fail.error}`);
        }
    }
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
                await cmdScrape(parsed._[1] || 'all', parsed.limit, {
                    query: parsed.query,
                    location: parsed.location
                });
                break;
                
            case 'tailor':
                await cmdTailor(parsed._[1]);
                break;
                
            case 'apply':
                await cmdApply(parsed._[1]);
                break;
                
            case 'mass-apply':
                await cmdMassApply(parsed.limit, {
                    headless: parsed.headless,
                    query: parsed.query,
                    location: parsed.location
                });
                break;
                
            case 'email':
                await cmdEmail(parsed._[1], parsed);
                break;
                
            case 'schedule':
                await cmdSchedule();
                break;
                
            case 'stats':
                await cmdStats();
                break;
                
            case 'list':
                await cmdList(parsed.status);
                break;
                
            case 'compile':
                await cmdCompile();
                break;
                
            case 'report':
                await cmdStats(); // Alias
                break;
                
            default:
                console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Job Application Autopilot Pro 🚀                  ║
╚═══════════════════════════════════════════════════════════╝

Usage: node orchestrator.js <command> [options]

📦 Setup
  init                          Initialize database and config

🔍 Discovery
  scrape [source]               Scrape jobs (linkedin|indeed|wellfound|all)
    --limit N                   Number of jobs per source (default: 10)
    --query "text"              Search query
    --location "place"          Location filter

📝 Application
  tailor <job-id>               Generate tailored resume
  apply <job-id>                Mark job as applied + push
  mass-apply                    Auto-apply via LinkedIn Easy Apply
    --limit N                   Max applications (default: 10)
    --headless                  Run without visible browser
  compile                       Compile all .tex files to PDF

📧 Email
  email test                    Test email connection
  email followup                List jobs needing follow-up
  email send <id> <email>       Send follow-up email
  email report                  Email statistics

📊 Reporting
  list                          List all jobs
    --status STATUS             Filter by status
  stats                         Detailed analytics dashboard

⏰ Automation
  schedule                      Set up cron jobs (5 AM daily)

Examples:
  node orchestrator.js init
  node orchestrator.js scrape linkedin --limit 20
  node orchestrator.js scrape --query "Product Manager" --location "Remote"
  node orchestrator.js list --status discovered
  node orchestrator.js mass-apply --limit 50 --headless
  node orchestrator.js stats
`);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (process.env.DEBUG) console.error(error.stack);
        process.exit(1);
    }
}

main();
