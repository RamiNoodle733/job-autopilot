const path = require('path');
const fs = require('fs-extra');
const { generateResume } = require('./resume-generator');
const { compileResume } = require('./pdf-compiler');
const { loadProfile } = require('./profile-parser');

const DEFAULT_COVER_TEMPLATE = path.join(__dirname, '../templates/cover-letter.txt');

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function buildCoverLetter(job, outputDir, profile, templatePath = DEFAULT_COVER_TEMPLATE) {
  const template = await fs.readFile(templatePath, 'utf-8');
  const content = template
    .replace(/\{\{DATE\}\}/g, formatDate())
    .replace(/\{\{COMPANY_NAME\}\}/g, job.company || 'Company')
    .replace(/\{\{COMPANY_LOCATION\}\}/g, job.location || '')
    .replace(/\{\{ROLE_TITLE\}\}/g, job.title || 'Role')
    .replace(/\{\{CANDIDATE_NAME\}\}/g, profile.name || '')
    .replace(/\{\{CANDIDATE_EMAIL\}\}/g, profile.email || '')
    .replace(/\{\{CANDIDATE_PHONE\}\}/g, profile.phone || '');

  await fs.ensureDir(outputDir);
  const filePath = path.join(outputDir, 'cover-letter.txt');
  await fs.writeFile(filePath, content);
  return filePath;
}

async function buildDocuments(job, outputDir, options = {}) {
  const profile = await loadProfile({
    profilePath: options.profilePath,
    profileJsonPath: options.profileJsonPath,
  });

  const resumeTexPath = await generateResume(job, outputDir);
  let resumePdfPath = null;
  try {
    resumePdfPath = await compileResume(resumeTexPath);
  } catch (error) {
    // PDF compilation is optional; continue with .tex
  }

  const coverLetterPath = await buildCoverLetter(job, outputDir, profile, options.coverTemplatePath);

  return {
    resumeTexPath,
    resumePdfPath,
    coverLetterPath,
  };
}

module.exports = { buildDocuments, buildCoverLetter };
