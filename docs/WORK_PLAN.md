# Work Plan

## Planned modules/files to add or change
- **New core modules:** `src/cli.js`, `src/config.js`, `src/logger.js`, `src/pipeline.js`, `src/profile-parser.js`, `src/document-builder.js`.
- **Adapters:** `src/adapters/base.js`, `src/adapters/registry.js`, `src/adapters/linkedin.js`, `src/adapters/greenhouse.js`, `src/adapters/lever.js`, `src/adapters/workday.js`, `src/adapters/generic-form.js`.
- **Tracking:** upgrade `application-tracker.js` to structured application records + JSON/CSV export.
- **Docs:** `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, README updates, `.env.example`, `.gitignore`.
- **Tests:** add unit + lightweight integration tests under `src/**/*.test.js` for adapters, profile parsing, document builder, and tracker.

## Tracking data model (fields)
- `job_id`, `job_url`, `platform`, `company`, `title`, `location`.
- `status`, `status_detail`, `failure_category`, `notes`.
- `discovered_at`, `enriched_at`, `prepared_at`, `applied_at`, `updated_at`.
- `resume_path`, `cover_letter_path`, `artifact_paths` (JSON array).
- `metadata` (JSON for extra fields, e.g., salary, description).

## CLI commands
- `job-autopilot discover --input jobs.txt`
- `job-autopilot prepare --job <url-or-id>`
- `job-autopilot apply --job <id> --mode assisted|auto --dry-run`
- `job-autopilot apply --batch --mode assisted --limit 10`
- `job-autopilot report`
