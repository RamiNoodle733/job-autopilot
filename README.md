# Job Autopilot

Job Autopilot is an assisted job application workflow that supports multiple ATS platforms and keeps a human-in-the-loop by default.

## Setup
1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy environment template and configure credentials:
   ```bash
   cp .env.example .env
   ```
3. Add your profile data in `profile.md` (or `data/profile.json`).

## CLI Usage
```bash
# Discover jobs from a file
job-autopilot discover --input jobs.txt

# Prepare a single job (resume + cover letter)
job-autopilot prepare --job <job-id-or-url>

# Apply in assisted mode (default)
job-autopilot apply --job <job-id> --mode assisted --dry-run

# Apply in auto mode (opt-in)
job-autopilot apply --job <job-id> --mode auto

# Batch apply in assisted mode
job-autopilot apply --batch --mode assisted --limit 10

# Export report
job-autopilot report
```

## Supported Adapters
- LinkedIn Easy Apply (assisted default)
- Greenhouse
- Lever
- Workday
- Generic Form Assist (fallback)

## Sample `jobs.txt`
```
# one URL per line
https://boards.greenhouse.io/example/jobs/123
https://jobs.lever.co/example/abc
https://example.wd5.myworkdayjobs.com/en-US/jobs/job/abc
https://www.linkedin.com/jobs/view/123456789/
```

## Artifacts & Logs
- Application artifacts (screenshots + HTML dumps) are stored under `data/runs/`.
- Prepared documents are stored under `applications/<job-id>/`.
- Reports are exported to `data/reports/`.

## Safety & Compliance
- CAPTCHA / 2FA / bot checks trigger a pause and require manual intervention.
- Assisted apply is the default; auto-submit is opt-in only.
- Use official APIs or user-supplied URLs—no search engine scraping.

## What to do when a site blocks automation
- If a CAPTCHA or verification prompt appears, the run will stop.
- Manually complete the verification in the browser, then re-run the command in assisted mode.
- If automation is repeatedly blocked, use the Generic Form Assist flow and submit manually.
