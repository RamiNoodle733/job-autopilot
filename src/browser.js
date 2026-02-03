const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

async function launchBrowser({ headless = false, slowMo = 20 } = {}) {
  return puppeteer.launch({
    headless,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
      '--disable-gpu',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: { width: 1366, height: 768 },
    timeout: 60000,
  });
}

async function navigateWithRetries(page, url, { retries = 2, delayMs = 2000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      return true;
    } catch (error) {
      if (attempt === retries) throw error;
      await page.waitForTimeout(delayMs * (attempt + 1));
    }
  }
  return false;
}

async function captureArtifacts(page, runDir, label) {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '-');
  await fs.ensureDir(runDir);
  const screenshotPath = path.join(runDir, `${safeLabel}.png`);
  const htmlPath = path.join(runDir, `${safeLabel}.html`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const html = await page.content();
  await fs.writeFile(htmlPath, html);
  return { screenshotPath, htmlPath };
}

async function detectFriction(page) {
  const text = await page.content();
  const lower = text.toLowerCase();
  if (lower.includes('captcha') || lower.includes('recaptcha')) {
    return 'captcha';
  }
  if (lower.includes('two-factor') || lower.includes('2fa') || lower.includes('verification code')) {
    return 'two-factor';
  }
  if (lower.includes('are you human')) {
    return 'bot-check';
  }
  return null;
}

module.exports = { launchBrowser, navigateWithRetries, captureArtifacts, detectFriction };
