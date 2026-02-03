const axios = require('axios');
const cheerio = require('cheerio');
const { JobSourceAdapter, ApplyAdapter } = require('./base');
const { GenericFormApplyAdapter } = require('./generic-form');

function parseLeverUrl(url) {
  const match = url.match(/jobs\.lever\.co\/([^/]+)\/([\w-]+)/i);
  if (!match) return null;
  return { company: match[1], postingId: match[2] };
}

class LeverJobSourceAdapter extends JobSourceAdapter {
  constructor() {
    super();
    this.id = 'lever-source';
  }

  supportsDiscovery() {
    return true;
  }

  supportsEnrichment() {
    return true;
  }

  canHandleUrl(url) {
    return /jobs\.lever\.co/.test(url);
  }

  async discover({ company, limit = 25 } = {}) {
    if (!company) throw new Error('Lever company is required.');
    const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data.slice(0, limit).map((job) => ({
      job_url: job.hostedUrl,
      title: job.text,
      company,
      location: job.categories?.location,
      platform: 'lever',
      metadata: { lever_id: job.id },
    }));
  }

  async enrich(jobUrl) {
    const parsed = parseLeverUrl(jobUrl);
    if (parsed) {
      const url = `https://api.lever.co/v0/postings/${parsed.company}/${parsed.postingId}?mode=json`;
      const response = await axios.get(url, { timeout: 10000 });
      const job = response.data;
      return {
        job_url: jobUrl,
        title: job.text,
        company: job.categories?.team || parsed.company,
        location: job.categories?.location,
        description: job.descriptionPlain || job.description,
        platform: 'lever',
      };
    }

    const html = await axios.get(jobUrl, { timeout: 10000 }).then((res) => res.data);
    const $ = cheerio.load(html);
    return {
      job_url: jobUrl,
      title: $('h2').first().text().trim() || $('h1').first().text().trim(),
      company: parsed?.company || '',
      location: $('[class*="location"]').first().text().trim(),
      description: $('.section').text().trim(),
      platform: 'lever',
    };
  }
}

class LeverApplyAdapter extends ApplyAdapter {
  constructor() {
    super();
    this.id = 'lever-apply';
    this.generic = new GenericFormApplyAdapter();
  }

  canHandleUrl(url) {
    return /jobs\.lever\.co/.test(url);
  }

  async applyAssisted(job, options = {}) {
    return this.generic.applyAssisted(job, options);
  }
}

module.exports = { LeverJobSourceAdapter, LeverApplyAdapter };
