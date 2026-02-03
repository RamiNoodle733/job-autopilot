const { createLogger } = require('../logger');
const logger = createLogger();

class AdapterRegistry {
  constructor() {
    this.jobSources = [];
    this.applyAdapters = [];
  }

  register(adapter) {
    if (!adapter) return;
    if (adapter.type === 'job-source') {
      this.jobSources.push(adapter);
      logger.debug(`Registered job source adapter: ${adapter.id}`);
    }
    if (adapter.type === 'apply') {
      this.applyAdapters.push(adapter);
      logger.debug(`Registered apply adapter: ${adapter.id}`);
    }
  }

  getJobSourceForUrl(url) {
    return this.jobSources.find((adapter) => adapter.canHandleUrl(url));
  }

  getApplyAdapterForUrl(url) {
    return this.applyAdapters.find((adapter) => adapter.canHandleUrl(url));
  }

  listAdapters() {
    return {
      jobSources: this.jobSources.map((adapter) => adapter.id),
      applyAdapters: this.applyAdapters.map((adapter) => adapter.id),
    };
  }
}

module.exports = { AdapterRegistry };
