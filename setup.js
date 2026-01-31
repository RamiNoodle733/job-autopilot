#!/usr/bin/env node
/**
 * Job Application Autopilot Pro - Interactive Setup Script
 * 
 * Run: node setup.js
 * 
 * This script will:
 * - Install dependencies
 * - Configure Gmail credentials
 * - Configure LinkedIn auth
 * - Set up preferences
 * - Initialize the database
 */

const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

const ENV_PATH = path.join(__dirname, '.env');
const PROFILE_PATH = path.join(__dirname, 'data', 'profile.json');

console.log(`
╔═══════════════════════════════════════════════════════════╗
║     🚀 Job Application Autopilot Pro - Setup Wizard       ║
╚═══════════════════════════════════════════════════════════╝

This wizard will help you configure your job autopilot system.
Press Enter to accept defaults shown in [brackets].
`);

async function main() {
    const config = {
        // Gmail
        GMAIL_USER: '',
        GMAIL_APP_PASSWORD: '',
        
        // LinkedIn
        LINKEDIN_EMAIL: '',
        LINKEDIN_PASSWORD: '',
        
        // Personal
        PHONE: '',
        
        // Job search
        JOB_SEARCH_QUERY: 'AI Product Manager',
        JOB_SEARCH_LOCATION: 'Houston, TX',
        
        // Schedule
        CRON_TIME: '0 5 * * *'
    };
    
    const profile = {
        firstName: 'Rami',
        lastName: 'Abdelrazzaq',
        email: '',
        phone: '',
        location: 'Katy, TX',
        linkedinHandle: 'ramiabdelrazzaq',
        githubHandle: 'RamiNoodle733',
        portfolioUrl: '',
        summary: '',
        skills: {
            languages: '',
            tools: '',
            ai: '',
            methodologies: ''
        },
        targetRoles: [],
        targetLocations: []
    };
    
    // ==================
    // Step 1: Personal Info
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Step 1: Personal Information');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    profile.firstName = await question(`First name [${profile.firstName}]: `) || profile.firstName;
    profile.lastName = await question(`Last name [${profile.lastName}]: `) || profile.lastName;
    profile.email = await question('Email [ramiabdelrazzaq@gmail.com]: ') || 'ramiabdelrazzaq@gmail.com';
    profile.phone = await question('Phone (for applications): ') || '';
    profile.location = await question(`Location [${profile.location}]: `) || profile.location;
    profile.linkedinHandle = await question(`LinkedIn username [${profile.linkedinHandle}]: `) || profile.linkedinHandle;
    profile.githubHandle = await question(`GitHub username [${profile.githubHandle}]: `) || profile.githubHandle;
    
    config.GMAIL_USER = profile.email;
    config.PHONE = profile.phone;
    
    // ==================
    // Step 2: Gmail Setup
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Step 2: Gmail Setup (for follow-up emails)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('To send automated emails, you need a Gmail App Password.');
    console.log('');
    console.log('How to get one:');
    console.log('  1. Enable 2-Factor Authentication on your Google account');
    console.log('  2. Go to: https://myaccount.google.com/apppasswords');
    console.log('  3. Generate a new app password for "Mail"');
    console.log('  4. Copy the 16-character password');
    console.log('');
    
    const setupEmail = await question('Set up email now? (y/n) [n]: ');
    if (setupEmail.toLowerCase() === 'y') {
        config.GMAIL_APP_PASSWORD = await question('Gmail App Password (16 chars): ');
    }
    
    // ==================
    // Step 3: LinkedIn Setup
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 Step 3: LinkedIn Setup (for auto-apply)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('LinkedIn credentials are used for automated Easy Apply.');
    console.log('⚠️  Warning: Use at your own risk. LinkedIn may flag automation.');
    console.log('');
    
    const setupLinkedIn = await question('Set up LinkedIn auto-apply? (y/n) [n]: ');
    if (setupLinkedIn.toLowerCase() === 'y') {
        config.LINKEDIN_EMAIL = await question('LinkedIn email: ');
        config.LINKEDIN_PASSWORD = await question('LinkedIn password: ');
    }
    
    // ==================
    // Step 4: Job Search Preferences
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Step 4: Job Search Preferences');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    config.JOB_SEARCH_QUERY = await question(`Default job search [${config.JOB_SEARCH_QUERY}]: `) || config.JOB_SEARCH_QUERY;
    config.JOB_SEARCH_LOCATION = await question(`Default location [${config.JOB_SEARCH_LOCATION}]: `) || config.JOB_SEARCH_LOCATION;
    
    // Target roles
    console.log('\nTarget roles (comma-separated):');
    const rolesInput = await question('[AI Product Manager, Technical Program Manager]: ') || 'AI Product Manager, Technical Program Manager';
    profile.targetRoles = rolesInput.split(',').map(r => r.trim());
    
    // Target locations
    console.log('\nTarget locations (comma-separated):');
    const locsInput = await question('[Katy TX, Houston TX, Remote, Saudi Arabia, UAE]: ') || 'Katy TX, Houston TX, Remote, Saudi Arabia, UAE';
    profile.targetLocations = locsInput.split(',').map(l => l.trim());
    
    // ==================
    // Step 5: Skills
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💼 Step 5: Your Skills (for resume generation)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    profile.skills.languages = await question('Languages/Scripting [Python, JavaScript, SQL]: ') || 'Python, JavaScript, SQL';
    profile.skills.tools = await question('Tools/Platforms [Jira, Notion, Git, AWS]: ') || 'Jira, Notion, Git, AWS';
    profile.skills.ai = await question('AI/ML [ChatGPT, Claude, Prompt Engineering]: ') || 'ChatGPT, Claude, Prompt Engineering';
    profile.skills.methodologies = await question('Methodologies [Agile, Scrum, OKRs]: ') || 'Agile, Scrum, OKRs';
    
    // Professional summary
    console.log('\nProfessional summary (1-2 sentences):');
    profile.summary = await question('[AI Product Manager with automation expertise]: ') || 
        'AI Product Manager and Technical Program Manager with experience in automation, no-code solutions, and cross-functional leadership.';
    
    // ==================
    // Step 6: Schedule
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ Step 6: Automation Schedule');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Daily scraping keeps you ahead of new job postings.');
    console.log('Default: 5:00 AM daily (cron: 0 5 * * *)');
    console.log('');
    
    const cronInput = await question('Cron schedule [0 5 * * *]: ');
    config.CRON_TIME = cronInput || config.CRON_TIME;
    
    // ==================
    // Save Configuration
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💾 Saving Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Create .env file
    const envContent = `# Job Application Autopilot Pro - Configuration
# Generated: ${new Date().toISOString()}

# Gmail credentials (use App Password, not regular password)
GMAIL_USER=${config.GMAIL_USER}
GMAIL_APP_PASSWORD=${config.GMAIL_APP_PASSWORD}

# LinkedIn credentials (for auto-apply)
LINKEDIN_EMAIL=${config.LINKEDIN_EMAIL}
LINKEDIN_PASSWORD=${config.LINKEDIN_PASSWORD}

# Your contact info
PHONE=${config.PHONE}

# Job search defaults
JOB_SEARCH_QUERY=${config.JOB_SEARCH_QUERY}
JOB_SEARCH_LOCATION=${config.JOB_SEARCH_LOCATION}

# Cron schedule
CRON_TIME=${config.CRON_TIME}

# Optional: GitHub token for pushing applications
GITHUB_TOKEN=
GITHUB_REPO=RamiNoodle733/job-autopilot
`;
    
    await fs.writeFile(ENV_PATH, envContent);
    console.log('  ✓ Created .env file');
    
    // Create profile.json
    await fs.ensureDir(path.dirname(PROFILE_PATH));
    await fs.writeJson(PROFILE_PATH, profile, { spaces: 2 });
    console.log('  ✓ Created data/profile.json');
    
    // ==================
    // Install Dependencies
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Installing Dependencies');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const installDeps = await question('Install/update npm dependencies? (y/n) [y]: ');
    if (installDeps.toLowerCase() !== 'n') {
        try {
            console.log('  Running npm install...');
            execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
            console.log('  ✓ Dependencies installed');
        } catch (error) {
            console.log('  ⚠️  npm install failed. Run manually: npm install');
        }
    }
    
    // ==================
    // Initialize Database
    // ==================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗃️  Initializing Database');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    try {
        execSync('node orchestrator.js init', { cwd: __dirname, stdio: 'inherit' });
    } catch (error) {
        console.log('  ⚠️  Database init failed. Run manually: node orchestrator.js init');
    }
    
    // ==================
    // Done!
    // ==================
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   🎉 Setup Complete!                      ║
╚═══════════════════════════════════════════════════════════╝

Your Job Application Autopilot Pro is ready!

Quick Start:
  node orchestrator.js scrape --limit 10     Scrape jobs from all sources
  node orchestrator.js list                  View discovered jobs
  node orchestrator.js tailor 1              Create resume for job #1
  node orchestrator.js mass-apply --limit 5  Auto-apply to 5 LinkedIn jobs
  node orchestrator.js stats                 View statistics

Files created:
  .env                  - Your credentials (keep private!)
  data/profile.json     - Your profile for resume generation

${config.GMAIL_APP_PASSWORD ? '✅ Email configured' : '⚠️  Email not configured - run setup again or edit .env'}
${config.LINKEDIN_PASSWORD ? '✅ LinkedIn configured' : '⚠️  LinkedIn not configured - auto-apply will prompt for login'}

Happy job hunting! 🎯
`);
    
    rl.close();
}

main().catch(error => {
    console.error('Setup error:', error.message);
    rl.close();
    process.exit(1);
});
