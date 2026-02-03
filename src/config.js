const path = require('path');
const fs = require('fs-extra');

function getConfig(overrides = {}) {
  const rootDir = path.resolve(__dirname, '..');
  const dataDir = overrides.dataDir || process.env.DATA_DIR || path.join(rootDir, 'data');
  const runsDir = overrides.runsDir || process.env.RUNS_DIR || path.join(dataDir, 'runs');
  const templatesDir = overrides.templatesDir || process.env.TEMPLATES_DIR || path.join(rootDir, 'templates');
  const applicationsDir = overrides.applicationsDir || process.env.APPLICATIONS_DIR || path.join(rootDir, 'applications');

  return {
    rootDir,
    dataDir,
    runsDir,
    templatesDir,
    applicationsDir,
    profilePath: overrides.profilePath || process.env.PROFILE_PATH || path.join(rootDir, 'profile.md'),
    profileJsonPath: overrides.profileJsonPath || process.env.PROFILE_JSON_PATH || path.join(dataDir, 'profile.json'),
    logLevel: overrides.logLevel || process.env.LOG_LEVEL || 'info',
    defaultMode: overrides.defaultMode || process.env.APPLY_MODE || 'assisted',
    dryRun: overrides.dryRun ?? (process.env.DRY_RUN === 'true'),
    jobSearchQuery: process.env.JOB_SEARCH_QUERY || 'AI Product Manager',
    jobSearchLocation: process.env.JOB_SEARCH_LOCATION || 'United States',
  };
}

async function ensureDirectories(config) {
  await fs.ensureDir(config.dataDir);
  await fs.ensureDir(config.runsDir);
  await fs.ensureDir(config.applicationsDir);
}

function validateConfig(config, { requireLinkedIn = false } = {}) {
  const errors = [];

  if (requireLinkedIn) {
    if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
      errors.push('Missing LINKEDIN_EMAIL or LINKEDIN_PASSWORD in environment.');
    }
  }

  return errors;
}

module.exports = { getConfig, ensureDirectories, validateConfig };
