# Current State (Repo Reality Check)

## Architecture & Entrypoints
- **Main CLI:** `orchestrator.js` exposes commands for init, scrape, tailor, apply, mass-apply, email, stats, list, and compile. It wires together database setup, scrapers, resume generation, PDF compilation, and LinkedIn auto-apply. 
- **Application tracking:** `application-tracker.js` stores application records in `data/applications.db` with basic status fields and priority scoring.
- **Database layer:** `src/database.js` initializes a separate SQLite DB under `database/applications.db` with `jobs`, `applications`, `email_logs`, and `statistics` tables.
- **Scrapers:** `src/scrapers/` contains LinkedIn, Indeed, and Wellfound scrapers using Axios + Cheerio.
- **Auto-apply:** `src/auto-apply/linkedin.js` automates LinkedIn Easy Apply via Puppeteer with session cookies and rate limiting.
- **Document generation:** `src/resume-generator.js` generates LaTeX resumes from `templates/one-page-resume.tex` and a profile JSON/MD.

## Package scripts and tooling
- `npm start` runs the orchestrator.
- `npm test` runs `node --test` against `src/**/*.test.js`.
- No lint script is defined in `package.json`.

## Known limitations (observed)
- **LinkedIn-only auto-apply:** only LinkedIn Easy Apply has an automation flow; no ATS adapters exist yet.
- **Multiple storage systems:** there are two parallel SQLite DBs (`database/` and `data/`) and mixed tracking responsibilities.
- **Limited pipeline stages:** the workflow is mostly scrape → tailor → apply with no explicit staging for enrichment, document generation, assisted apply, or structured outcomes.
- **No config validation or safety gates:** the current flow does not detect CAPTCHA/2FA or enforce assisted-by-default review.
- **No CLI dedicated to job-URL-driven workflows:** existing commands focus on scraping rather than ingesting known job URLs.
