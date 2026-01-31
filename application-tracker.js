const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class ApplicationTracker {
  constructor() {
    const dbDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbPath = path.join(dbDir, 'applications.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.init();
  }

  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT UNIQUE,
        source TEXT,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        salary TEXT,
        description TEXT,
        requirements TEXT,
        url TEXT,
        posted_date TEXT,
        discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'discovered',
        tailored_at DATETIME,
        resume_path TEXT,
        cover_letter_path TEXT,
        sent_at DATETIME,
        email_sent_to TEXT,
        response_received BOOLEAN DEFAULT 0,
        interview_scheduled BOOLEAN DEFAULT 0,
        rejected BOOLEAN DEFAULT 0,
        notes TEXT,
        priority INTEGER DEFAULT 0
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        jobs_discovered INTEGER DEFAULT 0,
        resumes_created INTEGER DEFAULT 0,
        applications_sent INTEGER DEFAULT 0,
        responses_received INTEGER DEFAULT 0
      )
    `);
  }

  addJob(job) {
    return new Promise((resolve, reject) => {
      const jobId = `${job.source}-${Buffer.from(job.url).toString('base64').slice(0, 16)}`;
      
      const sql = `
        INSERT OR IGNORE INTO applications 
        (job_id, source, company, title, location, salary, description, requirements, url, posted_date, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const priority = this.calculatePriority(job);
      
      this.db.run(sql, [
        jobId,
        job.source,
        job.company,
        job.title,
        job.location,
        job.salary,
        job.description,
        JSON.stringify(job.requirements),
        job.url,
        job.posted_date,
        priority
      ], function(err) {
        if (err) reject(err);
        else resolve({ jobId, inserted: this.changes > 0 });
      });
    });
  }

  calculatePriority(job) {
    let priority = 0;
    const loc = (job.location || '').toLowerCase();
    const title = (job.title || '').toLowerCase();
    
    // Dream locations (Saudi/UAE)
    if (loc.includes('saudi') || loc.includes('riyadh') || loc.includes('jeddah')) priority += 100;
    if (loc.includes('uae') || loc.includes('dubai') || loc.includes('abudhabi')) priority += 90;
    if (loc.includes('kuwait')) priority += 80;
    
    // Remote
    if (loc.includes('remote')) priority += 50;
    
    // Preferred locations
    if (loc.includes('houston') || loc.includes('katy')) priority += 40;
    if (loc.includes('boston')) priority += 30;
    
    // Role alignment
    if (title.includes('ai') || title.includes('artificial intelligence')) priority += 20;
    if (title.includes('product manager') || title.includes('program manager')) priority += 15;
    if (title.includes('engineer') && !title.includes('software engineer')) priority += 10;
    
    // Entry-level friendly
    if (title.includes('junior') || title.includes('entry') || title.includes('new grad')) priority += 25;
    
    return priority;
  }

  getJobsByStatus(status, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM applications WHERE status = ? ORDER BY priority DESC, discovered_at DESC LIMIT ?`,
        [status, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  updateStatus(jobId, status, extra = {}) {
    return new Promise((resolve, reject) => {
      const fields = ['status = ?'];
      const values = [status];
      
      if (status === 'tailored') {
        fields.push('tailored_at = CURRENT_TIMESTAMP');
      }
      if (status === 'sent') {
        fields.push('sent_at = CURRENT_TIMESTAMP');
      }
      
      Object.entries(extra).forEach(([key, value]) => {
        fields.push(`${key} = ?`);
        values.push(value);
      });
      
      values.push(jobId);
      
      this.db.run(
        `UPDATE applications SET ${fields.join(', ')} WHERE job_id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ updated: this.changes > 0 });
        }
      );
    });
  }

  getStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(priority) as avg_priority
        FROM applications 
        GROUP BY status
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getTopTargets(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM applications 
         WHERE status = 'discovered' 
         ORDER BY priority DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = ApplicationTracker;
