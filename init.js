#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure required directories exist
const dirs = [
  'data',
  'jobs',
  'applications',
  'logs'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Check for LaTeX
let latexAvailable = false;
try {
  execSync('which pdflatex', { stdio: 'ignore' });
  latexAvailable = true;
  console.log('✓ LaTeX (pdflatex) found');
} catch {
  console.log('✗ LaTeX not found. Install with: sudo apt-get install texlive-full');
}

// Check for Chrome/Chromium for Puppeteer
let chromeAvailable = false;
try {
  execSync('which google-chrome || which chromium-browser || which chromium', { stdio: 'ignore' });
  chromeAvailable = true;
  console.log('✓ Chrome/Chromium found');
} catch {
  console.log('⚠ Chrome/Chromium not found. Puppeteer will download Chromium automatically.');
}

console.log('\n✅ Job Application Autopilot initialized!');
console.log('\nUsage:');
console.log('  node orchestrator.js scrape     - Scrape new job listings');
console.log('  node orchestrator.js tailor     - Generate tailored resumes');
console.log('  node orchestrator.js send       - Send applications (requires approval)');
console.log('  node orchestrator.js report     - View application statistics');
