const { ApplyAdapter } = require('./base');
const { LinkedInAutoApply } = require('../auto-apply/linkedin');

class LinkedInApplyAdapter extends ApplyAdapter {
  constructor() {
    super();
    this.id = 'linkedin-apply';
  }

  canHandleUrl(url) {
    return /linkedin\.com\/jobs/.test(url);
  }

  async applyAssisted(job, options = {}) {
    const autoApply = new LinkedInAutoApply({
      headless: options.headless ?? false,
      slowMo: options.slowMo ?? 50,
      resumePath: options.resumePath,
      profile: options.profile,
      userAnswers: options.userAnswers,
      maxApps: options.maxApps || 1,
      autoSubmit: options.mode === 'auto',
      dryRun: options.dryRun ?? false,
    });

    await autoApply.init();

    let loggedIn = await autoApply.checkLoginStatus();
    if (!loggedIn && process.env.LINKEDIN_EMAIL && process.env.LINKEDIN_PASSWORD) {
      loggedIn = await autoApply.login(process.env.LINKEDIN_EMAIL, process.env.LINKEDIN_PASSWORD);
    }

    if (!loggedIn) {
      await autoApply.close();
      return { status: 'blocked', reason: 'login-required' };
    }

    const result = await autoApply.applyToJob(job.job_url || job.url);
    await autoApply.close();

    if (result.requiresReview) {
      return { status: 'needs_review', notes: 'LinkedIn Easy Apply paused before submit.' };
    }

    return { status: result.success ? 'submitted' : 'failed', reason: result.error };
  }
}

module.exports = { LinkedInApplyAdapter };
