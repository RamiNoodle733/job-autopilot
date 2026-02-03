const fs = require('fs-extra');
const path = require('path');
const ApplicationTracker = require('../application-tracker');
const { createDefaultRegistry } = require('./adapters');
const { buildDocuments } = require('./document-builder');
const { loadProfile } = require('./profile-parser');
const { getConfig, ensureDirectories } = require('./config');
const { createLogger } = require('./logger');

const logger = createLogger();

async function discoverFromFile(inputPath, { registry, tracker }) {
  const content = await fs.readFile(inputPath, 'utf-8');
  const urls = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const results = [];
  for (const url of urls) {
    const source = registry.getJobSourceForUrl(url);
    const platform = source?.id?.replace('-source', '') || 'generic';
    const job = {
      job_url: url,
      platform,
      status: 'discovered',
    };
    const record = await tracker.addJob(job);
    results.push({ url, jobId: record.jobId, inserted: record.inserted });
  }

  return results;
}

async function enrichJob(jobIdOrUrl, { registry, tracker }) {
  const job = jobIdOrUrl.includes('http')
    ? await findJobByUrl(jobIdOrUrl, tracker)
    : await tracker.getJob(jobIdOrUrl);

  if (!job) throw new Error('Job not found');
  const adapter = registry.getJobSourceForUrl(job.job_url);
  if (!adapter || !adapter.supportsEnrichment()) {
    return job;
  }

  const enriched = await adapter.enrich(job.job_url);
  await tracker.updateJob(job.job_id, {
    company: enriched.company || job.company,
    title: enriched.title || job.title,
    location: enriched.location || job.location,
    metadata: { ...(job.metadata ? JSON.parse(job.metadata) : {}), description: enriched.description },
    status: 'enriched',
    enriched_at: new Date().toISOString(),
  });

  return { ...job, ...enriched };
}

async function prepareJob(jobIdOrUrl, { registry, tracker, config }) {
  const job = jobIdOrUrl.includes('http')
    ? await findJobByUrl(jobIdOrUrl, tracker)
    : await tracker.getJob(jobIdOrUrl);
  if (!job) throw new Error('Job not found');

  const enriched = await enrichJob(job.job_id, { registry, tracker });
  const outputDir = path.join(config.applicationsDir, job.job_id);
  const docs = await buildDocuments(enriched, outputDir, {
    profilePath: config.profilePath,
    profileJsonPath: config.profileJsonPath,
  });

  await tracker.updateJob(job.job_id, {
    resume_path: docs.resumePdfPath || docs.resumeTexPath,
    cover_letter_path: docs.coverLetterPath,
    status: 'prepared',
    prepared_at: new Date().toISOString(),
  });

  return { job: enriched, docs };
}

async function applyJob(jobIdOrUrl, { registry, tracker, config, mode = 'assisted', dryRun = true } = {}) {
  const job = jobIdOrUrl.includes('http')
    ? await findJobByUrl(jobIdOrUrl, tracker)
    : await tracker.getJob(jobIdOrUrl);
  if (!job) throw new Error('Job not found');

  const outputDir = path.join(config.applicationsDir, job.job_id);
  const docs = await buildDocuments(job, outputDir, {
    profilePath: config.profilePath,
    profileJsonPath: config.profileJsonPath,
  });

  const adapter = registry.getApplyAdapterForUrl(job.job_url) || registry.applyAdapters?.find((item) => item.id === 'generic-form');
  if (!adapter) throw new Error('No apply adapter found.');
  const profile = await loadProfile({ profilePath: config.profilePath, profileJsonPath: config.profileJsonPath });
  const runDir = path.join(config.runsDir, `${job.job_id}-${Date.now()}`);

  const result = await adapter.applyAssisted(job, {
    profile,
    resumePath: docs.resumePdfPath || docs.resumeTexPath,
    mode,
    dryRun,
    runDir,
  });

  await tracker.updateJob(job.job_id, {
    status: result.status || 'failed',
    status_detail: result.notes || '',
    failure_category: result.reason || '',
    applied_at: new Date().toISOString(),
    resume_path: docs.resumePdfPath || docs.resumeTexPath,
    cover_letter_path: docs.coverLetterPath,
    artifact_paths: result.artifacts || [],
  });

  return { job, result };
}

async function report({ tracker }) {
  const data = await tracker.exportJson();
  return data;
}

async function findJobByUrl(url, tracker) {
  const jobs = await tracker.listJobs(2000);
  return jobs.find((row) => row.job_url === url);
}

async function createPipeline() {
  const config = getConfig();
  await ensureDirectories(config);
  const registry = createDefaultRegistry();
  const tracker = new ApplicationTracker();
  return { config, registry, tracker };
}

module.exports = {
  createPipeline,
  discoverFromFile,
  enrichJob,
  prepareJob,
  applyJob,
  report,
};
