const path = require('path');
const { ApplyAdapter } = require('./base');
const { launchBrowser, navigateWithRetries, captureArtifacts, detectFriction } = require('../browser');
const { createLogger } = require('../logger');

const logger = createLogger();

function matchesKeyword(value, keywords) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

async function fillTextFields(page, profile) {
  const fieldMap = [
    { key: 'firstName', keywords: ['first name', 'first_name', 'given name'], value: profile.firstName || profile.name?.split(' ')[0] },
    { key: 'lastName', keywords: ['last name', 'last_name', 'surname', 'family name'], value: profile.lastName || profile.name?.split(' ').slice(1).join(' ') },
    { key: 'name', keywords: ['full name', 'name'], value: profile.name },
    { key: 'email', keywords: ['email'], value: profile.email },
    { key: 'phone', keywords: ['phone', 'mobile'], value: profile.phone },
    { key: 'location', keywords: ['location', 'city', 'address'], value: profile.location },
    { key: 'linkedin', keywords: ['linkedin'], value: profile.linkedin },
    { key: 'github', keywords: ['github', 'portfolio', 'website'], value: profile.github },
  ];

  await page.evaluate((fieldMap) => {
    const inputs = Array.from(document.querySelectorAll('input, textarea'));
    for (const input of inputs) {
      const type = input.getAttribute('type');
      if (type && ['hidden', 'checkbox', 'radio', 'file', 'submit', 'button'].includes(type)) continue;

      const label = input.getAttribute('aria-label') || '';
      const placeholder = input.getAttribute('placeholder') || '';
      const name = input.getAttribute('name') || '';
      const id = input.getAttribute('id') || '';
      const combined = `${label} ${placeholder} ${name} ${id}`.toLowerCase();

      for (const field of fieldMap) {
        if (!field.value) continue;
        const keywordMatch = field.keywords.some((keyword) => combined.includes(keyword));
        if (keywordMatch && !input.value) {
          input.value = field.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }
  }, fieldMap);
}

async function uploadResume(page, resumePath) {
  if (!resumePath) return false;
  const fileInputs = await page.$$('input[type="file"]');
  for (const input of fileInputs) {
    const name = await input.evaluate((el) => `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase());
    if (matchesKeyword(name, ['resume', 'cv'])) {
      await input.uploadFile(resumePath);
      return true;
    }
  }
  return false;
}

async function clickSubmitIfAllowed(page, { mode, dryRun }) {
  if (mode !== 'auto' || dryRun) return { submitted: false };
  const buttons = await page.$$('button, input[type="submit"]');
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => (el.textContent || el.value || '').toLowerCase());
    if (text.includes('submit') || text.includes('apply')) {
      await btn.click();
      return { submitted: true };
    }
  }
  return { submitted: false };
}

class GenericFormApplyAdapter extends ApplyAdapter {
  constructor() {
    super();
    this.id = 'generic-form';
  }

  canHandleUrl() {
    return true;
  }

  async applyAssisted(job, options = {}) {
    const browser = await launchBrowser({ headless: options.headless ?? false, slowMo: options.slowMo ?? 20 });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    const runDir = options.runDir || path.join(process.cwd(), 'data', 'runs');

    try {
      await navigateWithRetries(page, job.job_url || job.url, { retries: 2, delayMs: 2000 });
      await new Promise(r => setTimeout(r, 1500));
      const friction = await detectFriction(page);
      if (friction) {
        const artifacts = await captureArtifacts(page, runDir, `friction-${Date.now()}`);
        return { status: 'blocked', reason: friction, artifacts: Object.values(artifacts) };
      }

      await fillTextFields(page, options.profile || {});
      const resumeUploaded = await uploadResume(page, options.resumePath);

      const submitResult = await clickSubmitIfAllowed(page, { mode: options.mode || 'assisted', dryRun: options.dryRun ?? true });

      const artifacts = await captureArtifacts(page, runDir, `review-${Date.now()}`);
      return {
        status: submitResult.submitted ? 'submitted' : 'needs_review',
        notes: resumeUploaded ? 'Resume uploaded' : 'Resume not uploaded',
        artifacts: Object.values(artifacts),
      };
    } catch (error) {
      logger.error('Generic form apply failed', error.message);
      const artifacts = await captureArtifacts(page, runDir, `error-${Date.now()}`);
      return { status: 'failed', reason: error.message, artifacts: Object.values(artifacts) };
    } finally {
      await browser.close();
    }
  }
}

module.exports = { GenericFormApplyAdapter };
