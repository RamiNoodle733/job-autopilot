const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../database', 'applications.db');

async function initDatabase() {
    await fs.ensureDir(path.dirname(DB_PATH));
    const db = new Database(DB_PATH);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT,
            salary TEXT,
            description TEXT,
            requirements TEXT,
            application_url TEXT,
            posted_date TEXT,
            source TEXT,
            status TEXT DEFAULT 'discovered',
            priority_score INTEGER DEFAULT 0,
            discovered_date TEXT DEFAULT CURRENT_TIMESTAMP,
            last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
            keywords_matched TEXT,
            notes TEXT
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            company TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'discovered',
            date_applied TEXT,
            resume_path TEXT,
            cover_letter_path TEXT,
            email_sent_to TEXT,
            email_subject TEXT,
            follow_up_date TEXT,
            follow_up_sent INTEGER DEFAULT 0,
            response_received INTEGER DEFAULT 0,
            interview_date TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(job_id)
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            email_type TEXT NOT NULL,
            sent_to TEXT NOT NULL,
            subject TEXT,
            sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
            success INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY (application_id) REFERENCES applications(id)
        )
    `);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL,
            jobs_discovered INTEGER DEFAULT 0,
            jobs_tailored INTEGER DEFAULT 0,
            applications_sent INTEGER DEFAULT 0,
            interviews_scheduled INTEGER DEFAULT 0,
            rejections_received INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`);
    
    console.log('Database initialized!');
    db.close();
}

if (require.main === module) {
    initDatabase().catch(console.error);
}

module.exports = { initDatabase, DB_PATH };
