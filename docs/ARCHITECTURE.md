# Architecture

## Adapter System
Adapters live under `src/adapters/` and implement one of two interfaces defined in `src/adapters/base.js`:

- **JobSourceAdapter**: handles discovery and/or enrichment for a given platform.
  - `supportsDiscovery()` and `supportsEnrichment()` flags.
  - `discover()` returns a list of job URLs + metadata.
  - `enrich()` returns normalized job details from a URL.
- **ApplyAdapter**: handles assisted apply per platform.
  - `applyAssisted()` opens a browser, prefills fields, and stops for review by default.

`src/adapters/index.js` registers the default adapters:
- Greenhouse (job board API + assisted apply)
- Lever (posting API + assisted apply)
- Workday (HTML enrichment + assisted apply)
- LinkedIn (Easy Apply preserved)
- Generic form fallback for unknown pages

## Pipeline Stages
`src/pipeline.js` defines the stage orchestration:
1. **Discover**: ingest job URLs (e.g., file input) and write them to the tracker.
2. **Enrich**: adapter-based enrichment of job metadata from the URL.
3. **Prepare**: generate resume + cover letter for the job.
4. **Apply (assisted)**: prefill and stop for review; auto-submit is opt-in.
5. **Track**: persist status, failure category, timestamps, and artifacts.

## Tracking Data Model
`application-tracker.js` stores structured records:
- `job_id`, `job_url`, `platform`, `company`, `title`, `location`
- `status`, `status_detail`, `failure_category`, `notes`
- `discovered_at`, `enriched_at`, `prepared_at`, `applied_at`, `updated_at`
- `resume_path`, `cover_letter_path`, `artifact_paths` (JSON array)
- `metadata` (JSON blob for description/salary/etc.)

## CLI
`src/cli.js` provides user-facing commands:
- `job-autopilot discover --input jobs.txt`
- `job-autopilot prepare --job <url-or-id>`
- `job-autopilot apply --job <id> --mode assisted|auto --dry-run`
- `job-autopilot apply --batch --mode assisted --limit 10`
- `job-autopilot report`

## Reliability & Safety
- Standard timeouts, optional headless mode.
- Screenshot + HTML capture on failures or assisted-review handoff.
- CAPTCHA / 2FA / bot-check detection triggers manual intervention (no evasion).

## Cloudflare Worker (optional)
`cloudflare-worker.js` remains focused on Telegram → GitHub Actions triggers. It is not integrated with the new pipeline because it assumes a LinkedIn auto-apply workflow; it can be adapted later to post job URLs into the new discovery queue if desired.
