const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class ApplicationTracker {
  constructor({ dbPath } = {}) {
    const dbDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.dbPath = dbPath || path.join(dbDir, 'applications.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.ready = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT UNIQUE,
            job_url TEXT,
            platform TEXT,
            company TEXT,
            title TEXT,
            location TEXT,
            status TEXT DEFAULT 'discovered',
            status_detail TEXT,
            failure_category TEXT,
            notes TEXT,
            discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            enriched_at DATETIME,
            prepared_at DATETIME,
            applied_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resume_path TEXT,
            cover_letter_path TEXT,
            artifact_paths TEXT,
            metadata TEXT
          );

          CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT PRIMARY KEY,
            jobs_discovered INTEGER DEFAULT 0,
            resumes_created INTEGER DEFAULT 0,
            applications_sent INTEGER DEFAULT 0,
            responses_received INTEGER DEFAULT 0
          );
        `, (error) => {
          if (error) return reject(error);

          this.ensureColumns([
            'job_url',
            'platform',
            'status_detail',
            'failure_category',
            'enriched_at',
            'prepared_at',
            'applied_at',
            'updated_at',
            'resume_path',
            'cover_letter_path',
            'artifact_paths',
            'metadata'
          ]).then(resolve).catch(reject);
        });
      });
    });
  }

  ensureColumns(columns) {
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA table_info(applications)`, (err, rows) => {
        if (err) return reject(err);
        const existing = new Set(rows.map((row) => row.name));
        const missing = columns.filter((column) => !existing.has(column));
        if (missing.length === 0) return resolve();

        this.db.serialize(() => {
          missing.forEach((column) => {
            this.db.run(`ALTER TABLE applications ADD COLUMN ${column} TEXT`);
          });
          resolve();
        });
      });
    });
  }

  async ensureReady() {
    await this.ready;
  }

  async addJob(job) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const jobId = job.job_id || `${job.platform || 'job'}-${Buffer.from(job.job_url || job.url || '').toString('base64').slice(0, 16)}`;
      const sql = `
        INSERT OR IGNORE INTO applications 
        (job_id, job_url, platform, company, title, location, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        jobId,
        job.job_url || job.url,
        job.platform || job.source,
        job.company,
        job.title,
        job.location,
        job.status || 'discovered',
        JSON.stringify(job.metadata || {})
      ], function(err) {
        if (err) reject(err);
        else resolve({ jobId, inserted: this.changes > 0 });
      });
    });
  }

  async updateJob(jobId, updates = {}) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.entries(updates).forEach(([key, value]) => {
        fields.push(`${key} = ?`);
        values.push(Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : value);
      });

      fields.push('updated_at = CURRENT_TIMESTAMP');
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

  async getJob(jobId) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT * FROM applications WHERE job_id = ?`, [jobId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getJobsByStatus(status, limit = 50) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM applications WHERE status = ? ORDER BY discovered_at DESC LIMIT ?`,
        [status, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async listJobs(limit = 100) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM applications ORDER BY discovered_at DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async exportJson() {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM applications ORDER BY discovered_at DESC`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async exportCsv() {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM applications ORDER BY discovered_at DESC`, (err, rows) => {
        if (err) reject(err);
        if (!rows.length) return resolve('');
        const headers = Object.keys(rows[0]);
        const csvRows = [headers.join(',')];
        rows.forEach((row) => {
          const values = headers.map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            return `"${String(value).replace(/"/g, '""')}"`;
          });
          csvRows.push(values.join(','));
        });
        resolve(csvRows.join('\n'));
      });
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = ApplicationTracker;
