# 🚀 Ultimate Job Autopilot

**Mass apply to jobs everywhere - LinkedIn, Indeed, Google Jobs, and direct company career pages.**

The most comprehensive automated job application system. Aggregates jobs from multiple sources, intelligently fills forms, tailors your resume, and applies on your behalf while keeping you updated via Telegram.

## ✨ Features

### Multi-Platform Job Discovery
- 🔗 **LinkedIn** - Easy Apply automation
- 💼 **Indeed** - Indeed Apply automation  
- 🔍 **Google Jobs** - Aggregates from multiple sources
- 🌐 **Glassdoor** - Job scraping
- 🏢 **50+ Company Career Pages** - Direct crawling (Google, Meta, Apple, Amazon, Microsoft, Netflix, Nvidia, OpenAI, Anthropic, Stripe, and many more)

### Smart Application Features
- 📝 **Universal Form Filler** - AI-powered form detection and filling
- 📄 **Resume Tailoring** - Automatically emphasizes relevant skills per job
- 🎯 **Job Ranking** - Prioritizes best-match jobs
- 🔄 **Deduplication** - Removes duplicates across platforms
- 📊 **ATS Detection** - Identifies Greenhouse, Lever, Workday, etc.

### Monitoring & Control
- 📱 **Telegram Notifications** - Real-time updates on your phone
- 🤖 **GitHub Actions** - Scheduled runs (9 AM weekdays)
- 🌐 **Cloudflare Worker** - Control via Telegram commands
- 💾 **SQLite Database** - Track all applications

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/job-autopilot.git
cd job-autopilot

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials
```

## ⚙️ Configuration

### Environment Variables (.env)

```env
# LinkedIn Credentials
LINKEDIN_EMAIL=your-email@example.com
LINKEDIN_PASSWORD=your-password

# Indeed Credentials (optional)
INDEED_EMAIL=your-email@example.com
INDEED_PASSWORD=your-password

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### Profile (data/profile.json)

```json
{
  "first_name": "Your",
  "last_name": "Name",
  "email": "your-email@example.com",
  "phone": "123-456-7890",
  "linkedin": "https://linkedin.com/in/yourprofile",
  "github": "https://github.com/yourusername",
  "city": "Your City",
  "state": "TX",
  "work_authorized": true,
  "needs_sponsorship": false,
  "years_experience": 3,
  "skills": ["JavaScript", "Python", "React", "Node.js", "AWS"]
}
```

## 🚀 Usage

### Quick Start - Full Auto Mode

```bash
# Apply to 50 software engineer jobs everywhere
npm run autopilot

# Customize search
npm run autopilot -- --query "full stack developer" --location "Remote" --limit 100

# Remote jobs only  
npm run autopilot -- --query "software engineer" --remote

# Target specific companies
npm run autopilot -- companies "Google,Meta,Apple,Amazon"
```

### Platform-Specific

```bash
# LinkedIn only
npm run linkedin
npm run autopilot -- linkedin --query "frontend developer" --limit 25

# Indeed only
npm run indeed
npm run autopilot -- indeed --query "backend engineer" --limit 25

# Just discover jobs (don't apply)
npm run discover
npm run autopilot -- discover --query "ML engineer" --limit 200
```

### CLI Options

```
Options:
  -q, --query <query>         Job search query (default: "software engineer")
  -l, --location <location>   Job location (default: "")
  --limit <number>            Maximum applications (default: "50")
  --platforms <platforms>     Platforms: linkedin,indeed,google,companies
  --companies <companies>     Target companies (comma-separated)
  --remote                    Remote jobs only
  --experience <level>        Experience level: entry, mid, senior
  --no-headless               Show browser window (for debugging)
  --dry-run                   Discover jobs without applying

Commands:
  linkedin                    Apply only via LinkedIn
  indeed                      Apply only via Indeed
  discover                    Discover jobs without applying
  companies <companies>       Target specific companies
```

## 📱 Telegram Control

Control the autopilot remotely via Telegram bot commands.

## ⏰ Scheduled Runs (GitHub Actions)

Runs automatically weekdays at 9:00 AM CST via GitHub Actions.

## 🎯 Supported Companies (Direct Crawling)

50+ major tech companies including: Google, Meta, Apple, Amazon, Microsoft, Netflix, OpenAI, Anthropic, Nvidia, Stripe, Airbnb, Uber, Coinbase, Discord, Figma, Notion, Cloudflare, Vercel, and many more.

## 🛡️ Safety Features

- Rate limiting to prevent bans
- Human-like delays
- Cookie persistence
- Error recovery
- Dry run mode

---

## Legacy CLI (Assisted Mode)
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
