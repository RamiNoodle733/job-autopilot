const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const REPO_PATH = path.join(__dirname, '..');

/**
 * Push application to GitHub
 * @param {string} company - Company name
 * @param {string} title - Job title
 * @param {string} applicationPath - Path to application folder
 */
async function pushApplication(company, title, applicationPath) {
    try {
        const relativePath = path.relative(REPO_PATH, applicationPath);
        
        // Git add
        execSync('git add -A', { cwd: REPO_PATH, stdio: 'pipe' });
        
        // Git commit
        const commitMsg = `Apply to ${company} - ${title}`;
        try {
            execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_PATH, stdio: 'pipe' });
        } catch (e) {
            // No changes to commit
            console.log('  No changes to commit');
            return { success: true, message: 'No changes' };
        }
        
        // Git push
        execSync('git push origin main', { cwd: REPO_PATH, stdio: 'pipe' });
        
        console.log(`  Pushed to GitHub: ${commitMsg}`);
        return { success: true, message: commitMsg };
    } catch (error) {
        console.error('  Git push failed:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { pushApplication };
