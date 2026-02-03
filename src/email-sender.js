/**
 * Email Automation Module - Job Application Autopilot Pro
 * 
 * Features:
 * - Gmail SMTP integration via nodemailer
 * - Follow-up emails after applications
 * - Customizable templates
 * - Track sent emails in database
 * - Rate limiting to avoid spam flags
 */

const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');
const fs = require('fs-extra');
const path = require('path');

const { DB_PATH } = require('./database');

// Email Templates
const TEMPLATES = {
    followUp: {
        subject: 'Following Up: {{JOB_TITLE}} Application - Rami Abdelrazzaq',
        body: `Dear Hiring Team,

I hope this email finds you well. I recently submitted my application for the {{JOB_TITLE}} position at {{COMPANY}}, and I wanted to follow up to express my continued interest in the opportunity.

With my background in AI product strategy, technical program management, and automation systems, I am excited about the possibility of contributing to {{COMPANY}}'s mission. I believe my experience in building no-code/low-code solutions and leading cross-functional initiatives would make me a valuable addition to your team.

I would welcome the opportunity to discuss how my skills align with your needs. Please feel free to reach out at your convenience.

Thank you for considering my application. I look forward to hearing from you.

Best regards,
Rami Abdelrazzaq
{{PHONE}}
{{LINKEDIN_URL}}
`,
    },
    
    thankYou: {
        subject: 'Thank You - {{JOB_TITLE}} Interview',
        body: `Dear {{INTERVIEWER_NAME}},

Thank you so much for taking the time to speak with me today about the {{JOB_TITLE}} position at {{COMPANY}}. I truly enjoyed learning more about the role and the team.

Our conversation reinforced my enthusiasm for this opportunity. I was particularly excited to hear about {{DISCUSSION_POINT}}, and I believe my experience in {{RELEVANT_SKILL}} would allow me to contribute meaningfully from day one.

Please don't hesitate to reach out if you need any additional information from me. I look forward to the next steps in the process.

Best regards,
Rami Abdelrazzaq
`,
    },
    
    networkingRequest: {
        subject: 'Connecting About Opportunities at {{COMPANY}}',
        body: `Hi {{CONTACT_NAME}},

I hope this message finds you well. I came across your profile and noticed your work at {{COMPANY}}. I'm currently exploring opportunities in {{ROLE_TYPE}} roles and would love to learn more about your experience there.

A bit about me: I'm an AI Product Manager and Technical Program Manager with experience in automation, no-code solutions, and cross-functional team leadership. I'm particularly interested in {{COMPANY}} because of {{COMPANY_INTEREST}}.

Would you be open to a brief 15-minute chat sometime? I'd greatly appreciate any insights you could share about the culture and opportunities.

Thank you for your time!

Best regards,
Rami Abdelrazzaq
LinkedIn: linkedin.com/in/ramiabdelrazzaq
`,
    },
    
    recruiterOutreach: {
        subject: '{{JOB_TITLE}} Opportunity - Rami Abdelrazzaq',
        body: `Hi {{RECRUITER_NAME}},

I noticed that {{COMPANY}} is hiring for the {{JOB_TITLE}} position, and I wanted to reach out directly to express my strong interest.

Quick highlights about my background:
• AI/ML Product Management with hands-on prompt engineering
• Technical Program Management for 100+ person teams
• Automation specialist - built systems processing 50+ daily job applications
• Based in Houston, open to remote/hybrid opportunities

I'd love to learn more about this role and discuss how I can contribute to {{COMPANY}}'s goals. Do you have a few minutes for a quick call this week?

My resume is attached for your review.

Best regards,
Rami Abdelrazzaq
{{PHONE}}
`,
    }
};

class EmailSender {
    constructor(config = {}) {
        this.config = {
            user: config.user || process.env.GMAIL_USER,
            pass: config.pass || process.env.GMAIL_APP_PASSWORD,
            fromName: config.fromName || 'Rami Abdelrazzaq',
            phone: config.phone || process.env.PHONE || '',
            linkedinUrl: config.linkedinUrl || 'https://linkedin.com/in/ramiabdelrazzaq',
            maxDailyEmails: config.maxDailyEmails || 50,
            delayBetweenEmails: config.delayBetweenEmails || 60000, // 1 minute
        };
        
        this.transporter = null;
        this.db = null;
    }
    
    /**
     * Initialize email transporter and database
     */
    async init() {
        // Set up Gmail SMTP
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: this.config.user,
                pass: this.config.pass // Use App Password, not regular password
            }
        });
        
        // Verify connection
        try {
            await this.transporter.verify();
            console.log('✅ Email server connection verified');
        } catch (error) {
            console.error('❌ Email connection failed:', error.message);
            console.log('   Make sure you have set up a Gmail App Password:');
            console.log('   1. Enable 2FA on your Google account');
            console.log('   2. Go to: myaccount.google.com/apppasswords');
            console.log('   3. Generate a new app password for "Mail"');
            console.log('   4. Add to .env: GMAIL_APP_PASSWORD=your_app_password');
            throw error;
        }
        
        // Initialize database
        await this.initDatabase();
        
        return this;
    }
    
    /**
     * Initialize email tracking table
     */
    async initDatabase() {
        this.db = new Database(DB_PATH);
        
        // Create emails table if it doesn't exist
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sent_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT,
                recipient TEXT NOT NULL,
                subject TEXT NOT NULL,
                template TEXT,
                sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'sent',
                message_id TEXT,
                opened_at TEXT,
                replied_at TEXT,
                FOREIGN KEY (job_id) REFERENCES jobs(job_id)
            );
            
            CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON sent_emails(sent_at);
            CREATE INDEX IF NOT EXISTS idx_emails_recipient ON sent_emails(recipient);
        `);
    }
    
    /**
     * Replace template variables
     */
    parseTemplate(template, variables) {
        let result = template;
        
        // Add default variables
        const allVars = {
            PHONE: this.config.phone,
            LINKEDIN_URL: this.config.linkedinUrl,
            ...variables
        };
        
        for (const [key, value] of Object.entries(allVars)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, value || '');
        }
        
        return result;
    }
    
    /**
     * Check daily email limit
     */
    getDailyEmailCount() {
        const today = new Date().toISOString().split('T')[0];
        const result = this.db.prepare(`
            SELECT COUNT(*) as count FROM sent_emails 
            WHERE sent_at >= date(?)
        `).get(today);
        
        return result?.count || 0;
    }
    
    /**
     * Send a single email
     */
    async sendEmail(to, subject, body, options = {}) {
        // Check rate limit
        const dailyCount = this.getDailyEmailCount();
        if (dailyCount >= this.config.maxDailyEmails) {
            throw new Error(`Daily email limit reached (${this.config.maxDailyEmails}). Try again tomorrow.`);
        }
        
        const mailOptions = {
            from: `"${this.config.fromName}" <${this.config.user}>`,
            to,
            subject,
            text: body,
            html: options.html || body.replace(/\n/g, '<br>'),
            attachments: options.attachments || []
        };
        
        // Add resume if specified
        if (options.resumePath && await fs.pathExists(options.resumePath)) {
            mailOptions.attachments.push({
                filename: path.basename(options.resumePath),
                path: options.resumePath
            });
        }
        
        try {
            const info = await this.transporter.sendMail(mailOptions);
            
            // Log to database
            this.db.prepare(`
                INSERT INTO sent_emails (job_id, recipient, subject, template, message_id)
                VALUES (?, ?, ?, ?, ?)
            `).run(options.jobId || null, to, subject, options.template || 'custom', info.messageId);
            
            console.log(`✅ Email sent to ${to}`);
            return { success: true, messageId: info.messageId };
            
        } catch (error) {
            console.error(`❌ Failed to send email to ${to}:`, error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Send follow-up email for a job application
     */
    async sendFollowUp(jobId, recipientEmail, options = {}) {
        // Get job details from database
        const job = this.db.prepare('SELECT * FROM jobs WHERE job_id = ? OR id = ?').get(jobId, jobId);
        
        if (!job) {
            throw new Error(`Job not found: ${jobId}`);
        }
        
        // Check if follow-up already sent
        const existingEmail = this.db.prepare(`
            SELECT * FROM sent_emails 
            WHERE job_id = ? AND template = 'followUp'
        `).get(job.job_id);
        
        if (existingEmail && !options.force) {
            console.log(`⚠️  Follow-up already sent for this job on ${existingEmail.sent_at}`);
            return { success: false, error: 'Follow-up already sent', existingEmail };
        }
        
        const variables = {
            JOB_TITLE: job.title,
            COMPANY: job.company,
            LOCATION: job.location,
            ...options.variables
        };
        
        const template = TEMPLATES.followUp;
        const subject = this.parseTemplate(template.subject, variables);
        const body = this.parseTemplate(template.body, variables);
        
        return this.sendEmail(recipientEmail, subject, body, {
            jobId: job.job_id,
            template: 'followUp',
            resumePath: options.resumePath
        });
    }
    
    /**
     * Send thank you email after interview
     */
    async sendThankYou(recipientEmail, variables, options = {}) {
        const template = TEMPLATES.thankYou;
        const subject = this.parseTemplate(template.subject, variables);
        const body = this.parseTemplate(template.body, variables);
        
        return this.sendEmail(recipientEmail, subject, body, {
            jobId: options.jobId,
            template: 'thankYou'
        });
    }
    
    /**
     * Send networking request
     */
    async sendNetworkingRequest(recipientEmail, variables, options = {}) {
        const template = TEMPLATES.networkingRequest;
        const subject = this.parseTemplate(template.subject, variables);
        const body = this.parseTemplate(template.body, variables);
        
        return this.sendEmail(recipientEmail, subject, body, {
            template: 'networkingRequest'
        });
    }
    
    /**
     * Send recruiter outreach
     */
    async sendRecruiterOutreach(recipientEmail, variables, options = {}) {
        const template = TEMPLATES.recruiterOutreach;
        const subject = this.parseTemplate(template.subject, variables);
        const body = this.parseTemplate(template.body, variables);
        
        return this.sendEmail(recipientEmail, subject, body, {
            template: 'recruiterOutreach',
            resumePath: options.resumePath
        });
    }
    
    /**
     * Batch send follow-ups (with rate limiting)
     */
    async batchSendFollowUps(applications, options = {}) {
        const results = {
            sent: [],
            failed: [],
            skipped: []
        };
        
        for (const app of applications) {
            // Check if we have an email
            if (!app.email) {
                results.skipped.push({ ...app, reason: 'No email' });
                continue;
            }
            
            try {
                const result = await this.sendFollowUp(app.jobId, app.email, options);
                
                if (result.success) {
                    results.sent.push(app);
                    
                    // Rate limiting delay
                    if (applications.indexOf(app) < applications.length - 1) {
                        console.log(`   ⏳ Waiting ${this.config.delayBetweenEmails / 1000}s...`);
                        await this.delay(this.config.delayBetweenEmails);
                    }
                } else {
                    results.skipped.push({ ...app, reason: result.error });
                }
            } catch (error) {
                results.failed.push({ ...app, error: error.message });
            }
        }
        
        return results;
    }
    
    /**
     * Get sent emails report
     */
    getEmailReport(days = 7) {
        const report = {
            total: 0,
            byTemplate: {},
            byStatus: {},
            recentEmails: []
        };
        
        const since = new Date();
        since.setDate(since.getDate() - days);
        
        // Total count
        report.total = this.db.prepare(`
            SELECT COUNT(*) as count FROM sent_emails 
            WHERE sent_at >= ?
        `).get(since.toISOString())?.count || 0;
        
        // By template
        const templateCounts = this.db.prepare(`
            SELECT template, COUNT(*) as count FROM sent_emails 
            WHERE sent_at >= ?
            GROUP BY template
        `).all(since.toISOString());
        
        for (const row of templateCounts) {
            report.byTemplate[row.template] = row.count;
        }
        
        // Recent emails
        report.recentEmails = this.db.prepare(`
            SELECT recipient, subject, template, sent_at, status
            FROM sent_emails 
            ORDER BY sent_at DESC 
            LIMIT 10
        `).all();
        
        return report;
    }
    
    /**
     * Find jobs that need follow-up (applied 3+ days ago, no follow-up sent)
     */
    getJobsNeedingFollowUp(daysAgo = 3) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        
        return this.db.prepare(`
            SELECT j.*, a.date_applied
            FROM jobs j
            JOIN applications a ON j.job_id = a.job_id
            WHERE j.status = 'applied'
              AND a.date_applied <= ?
              AND j.job_id NOT IN (
                  SELECT job_id FROM sent_emails WHERE template = 'followUp' AND job_id IS NOT NULL
              )
            ORDER BY a.date_applied ASC
        `).all(cutoffDate.toISOString());
    }
    
    /**
     * Helper delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Export class and templates for customization
// Also re-export Telegram functions for convenience
const telegram = require('./telegram-notifier');

// Emoji constants for Telegram messages
const TELEGRAM_EMOJIS = {
    rocket: '🚀',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    search: '🔍',
    job: '💼',
    company: '🏢',
    location: '📍',
    stats: '📊',
    trophy: '🏆',
    clock: '🕐',
    target: '🎯',
    progress: '📈',
    info: 'ℹ️',
    star: '⭐'
};

module.exports = { 
    EmailSender, 
    TEMPLATES,
    // Re-export Telegram functions
    sendTelegramNotification: telegram.sendMessage,
    sendMessage: telegram.sendMessage,
    TELEGRAM_EMOJIS,
    ...telegram
};

