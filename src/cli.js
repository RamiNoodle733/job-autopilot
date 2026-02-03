#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const {
  createPipeline,
  discoverFromFile,
  prepareJob,
  applyJob,
  report,
} = require('./pipeline');
const { createLogger } = require('./logger');

const logger = createLogger();

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const next = args[i + 1];
      if (!next || next.startsWith('--')) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i += 1;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

async function cmdDiscover(parsed) {
  const inputPath = parsed.input || parsed.i;
  if (!inputPath) throw new Error('Provide --input jobs.txt');

  const pipeline = await createPipeline();
  const results = await discoverFromFile(inputPath, pipeline);
  pipeline.tracker.close();
  logger.info(`Discovered ${results.length} jobs from ${inputPath}`);
}

async function cmdPrepare(parsed) {
  const job = parsed.job || parsed.j;
  if (!job) throw new Error('Provide --job <id-or-url>');
  const pipeline = await createPipeline();
  const result = await prepareJob(job, pipeline);
  pipeline.tracker.close();
  logger.info(`Prepared documents for ${result.job.title || job}`);
}

async function cmdApply(parsed) {
  const pipeline = await createPipeline();
  const mode = parsed.mode || 'assisted';
  const dryRun = parsed['dry-run'] ?? mode === 'assisted';

  if (parsed.batch) {
    const limit = Number(parsed.limit || 10);
    const jobs = await pipeline.tracker.getJobsByStatus('prepared', limit);
    for (const job of jobs) {
      logger.info(`Applying to ${job.job_id}`);
      await applyJob(job.job_id, { ...pipeline, mode, dryRun });
    }
    pipeline.tracker.close();
    return;
  }

  const job = parsed.job || parsed.j;
  if (!job) throw new Error('Provide --job <id-or-url> or --batch');
  await applyJob(job, { ...pipeline, mode, dryRun });
  pipeline.tracker.close();
}

async function cmdReport() {
  const pipeline = await createPipeline();
  const data = await report(pipeline);
  const reportsDir = path.join(pipeline.config.dataDir, 'reports');
  await fs.ensureDir(reportsDir);
  const jsonPath = path.join(reportsDir, `report-${Date.now()}.json`);
  const csvPath = jsonPath.replace('.json', '.csv');
  await fs.writeJson(jsonPath, data, { spaces: 2 });
  const csv = await pipeline.tracker.exportCsv();
  await fs.writeFile(csvPath, csv);
  pipeline.tracker.close();
  logger.info(`Report saved to ${jsonPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  try {
    switch (command) {
      case 'discover':
        await cmdDiscover(args);
        break;
      case 'prepare':
        await cmdPrepare(args);
        break;
      case 'apply':
        await cmdApply(args);
        break;
      case 'report':
        await cmdReport(args);
        break;
      default:
        console.log(`\nJob Autopilot CLI\n\nCommands:\n  discover --input jobs.txt\n  prepare --job <id-or-url>\n  apply --job <id-or-url> --mode assisted|auto --dry-run\n  apply --batch --mode assisted --limit 10\n  report\n`);
    }
  } catch (error) {
    logger.error(error.message);
    process.exit(1);
  }
}

main();
