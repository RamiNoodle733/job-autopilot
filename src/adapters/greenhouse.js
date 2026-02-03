const axios = require('axios');
const cheerio = require('cheerio');
const { JobSourceAdapter, ApplyAdapter } = require('./base');
const { GenericFormApplyAdapter } = require('./generic-form');

function parseGreenhouseUrl(url) {
  const match = url.match(/boards\.greenhouse\.io\/([^/]+)\/?(?:jobs\/)?(\d+)?/i);
  if (!match) return null;
  return { board: match[1], jobId: match[2] };
}

class GreenhouseJobSourceAdapter extends JobSourceAdapter {
  constructor() {
    super();
    this.id = 'greenhouse-source';
  }

  supportsDiscovery() {
    return true;
  }

  supportsEnrichment() {
    return true;
  }

  canHandleUrl(url) {
    return /boards\.greenhouse\.io/.test(url);
  }

  async discover({ board, limit = 25 } = {}) {
    if (!board) throw new Error('Greenhouse board is required.');
    const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data.jobs.slice(0, limit).map((job) => ({
      job_url: job.absolute_url,
      title: job.title,
      company: board,
      location: job.location?.name,
      platform: 'greenhouse',
      metadata: { greenhouse_id: job.id },
    }));
  }

  async enrich(jobUrl) {
    const parsed = parseGreenhouseUrl(jobUrl);
    if (parsed?.board && parsed?.jobId) {
      const url = `https://boards-api.greenhouse.io/v1/boards/${parsed.board}/jobs/${parsed.jobId}`;
      const response = await axios.get(url, { timeout: 10000 });
      const job = response.data;
      return {
        job_url: jobUrl,
        title: job.title,
        company: job.company?.name || parsed.board,
        location: job.location?.name,
        description: job.content,
        platform: 'greenhouse',
      };
    }

    const html = await axios.get(jobUrl, { timeout: 10000 }).then((res) => res.data);
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim();
    const company = $('meta[property="og:site_name"]').attr('content') || parsed?.board || '';
    const location = $('[class*="location"]').first().text().trim();
    const description = $('[id="content"]').text().trim();

    return {
      job_url: jobUrl,
      title,
      company,
      location,
      description,
      platform: 'greenhouse',
    };
  }
}

class GreenhouseApplyAdapter extends ApplyAdapter {
  constructor() {
    super();
    this.id = 'greenhouse-apply';
    this.generic = new GenericFormApplyAdapter();
  }

  canHandleUrl(url) {
    return /boards\.greenhouse\.io/.test(url);
  }

  async applyAssisted(job, options = {}) {
    return this.generic.applyAssisted(job, options);
  }
}

module.exports = { GreenhouseJobSourceAdapter, GreenhouseApplyAdapter };
