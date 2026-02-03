class JobSourceAdapter {
  constructor() {
    this.type = 'job-source';
    this.id = 'base-job-source';
  }

  supportsDiscovery() {
    return false;
  }

  supportsEnrichment() {
    return false;
  }

  canHandleUrl() {
    return false;
  }

  async discover() {
    throw new Error('discover() not implemented');
  }

  async enrich() {
    throw new Error('enrich() not implemented');
  }
}

class ApplyAdapter {
  constructor() {
    this.type = 'apply';
    this.id = 'base-apply';
  }

  canHandleUrl() {
    return false;
  }

  async applyAssisted() {
    throw new Error('applyAssisted() not implemented');
  }
}

module.exports = { JobSourceAdapter, ApplyAdapter };
