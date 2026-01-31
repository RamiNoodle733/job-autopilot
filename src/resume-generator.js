const fs = require('fs-extra');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, '../profile.md');
const TEMPLATE_PATH = path.join(__dirname, '../resume-template.tex');

/**
 * Load user profile from markdown
 */
async function loadProfile() {
    const content = await fs.readFile(PROFILE_PATH, 'utf-8');
    
    const profile = {
        name: 'Rami Abdelrazzaq',
        email: 'rami@example.com',
        phone: '(832) 215-8648',
        linkedin: 'ramiabdelrazzaq',
        github: 'RamiNoodle733',
        location: 'Houston, TX'
    };
    
    const emailMatch = content.match(/Email:\s*([^\s]+@[^\s\n]+)/i);
    if (emailMatch) profile.email = emailMatch[1].trim();
    
    const linkedinMatch = content.match(/LinkedIn:\s*linkedin\.com\/in\/(.+?)(?:\n|$)/i);
    if (linkedinMatch) profile.linkedin = linkedinMatch[1].trim();
    
    const githubMatch = content.match(/GitHub:\s*github\.com\/(.+?)(?:\n|$)/i);
    if (githubMatch) profile.github = githubMatch[1].trim();
    
    return profile;
}

/**
 * Extract keywords from job description
 */
function extractKeywords(jobDescription) {
    const text = (jobDescription || '').toLowerCase();
    const keywords = [];
    
    const techTerms = [
        'python', 'javascript', 'typescript', 'java', 'c++', 'sql',
        'react', 'node.js', 'nodejs', 'express', 'flask', 'django',
        'postgresql', 'mongodb', 'aws', 'docker', 'kubernetes',
        'machine learning', 'ai', 'tensorflow', 'pytorch',
        'swift', 'ios', 'android', 'git', 'github'
    ];
    
    techTerms.forEach(term => {
        if (text.includes(term)) keywords.push(term);
    });
    
    return keywords;
}

/**
 * Generate tailored resume for a job
 */
async function generateResume(job, outputDir) {
    const profile = await loadProfile();
    const template = await fs.readFile(TEMPLATE_PATH, 'utf-8');
    const keywords = extractKeywords(job.description);
    
    console.log(`  Keywords matched: ${keywords.slice(0, 5).join(', ')}...`);
    
    // Replace placeholders
    let resume = template
        .replace(/\{\{EMAIL\}\}/g, profile.email)
        .replace(/\{\{LINKEDIN\}\}/g, profile.linkedin)
        .replace(/\{\{GITHUB\}\}/g, profile.github)
        .replace(/\{\{PHONE\}\}/g, profile.phone)
        .replace(/\{\{LOCATION\}\}/g, profile.location);
    
    // Ensure output directory exists
    await fs.ensureDir(outputDir);
    
    // Sanitize filename
    const safeCompany = job.company.replace(/[^a-zA-Z0-9]/g, '-');
    const safeTitle = job.title.replace(/[^a-zA-Z0-9]/g, '-');
    const outputPath = path.join(outputDir, `${safeCompany}-${safeTitle}-resume.tex`);
    
    await fs.writeFile(outputPath, resume);
    console.log(`  Resume saved: ${outputPath}`);
    
    return outputPath;
}

module.exports = { generateResume, extractKeywords };
