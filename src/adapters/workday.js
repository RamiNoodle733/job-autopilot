const axios = require('axios');
const cheerio = require('cheerio');
const { JobSourceAdapter, ApplyAdapter } = require('./base');
const { GenericFormApplyAdapter } = require('./generic-form');

class WorkdayJobSourceAdapter extends JobSourceAdapter {
  constructor() {
    super();
    this.id = 'workday-source';
  }

  supportsDiscovery() {
    return false;
  }

  supportsEnrichment() {
    return true;
  }

  canHandleUrl(url) {
    return /myworkdayjobs\.com/.test(url);
  }

  async enrich(jobUrl) {
    const html = await axios.get(jobUrl, { timeout: 10000 }).then((res) => res.data);
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim();
    const company = $('meta[property="og:site_name"]').attr('content') || '';
    const location = $('[data-automation-id="location"]').first().text().trim() || $('[class*="location"]').first().text().trim();
    const description = $('[data-automation-id="jobDescription"]').text().trim() || $('[class*="jobDescription"]').text().trim();

    return {
      job_url: jobUrl,
      title,
      company,
      location,
      description,
      platform: 'workday',
    };
  }
}

class WorkdayApplyAdapter extends ApplyAdapter {
  constructor() {
    super();
    this.id = 'workday-apply';
    this.generic = new GenericFormApplyAdapter();
  }

  canHandleUrl(url) {
    return /myworkdayjobs\.com/.test(url);
  }

  async applyAssisted(job, options = {}) {
    return this.generic.applyAssisted(job, options);
  }
}

module.exports = { WorkdayJobSourceAdapter, WorkdayApplyAdapter };
