const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const APPLICATIONS_DIR = path.join(__dirname, '../applications');

/**
 * Convert LaTeX to PDF using pdflatex or docker
 * Names files: "Rami Abdelrazzaq - {Job Title} - Resume.pdf"
 */
async function compileResume(inputTexPath, company, title) {
    const outputDir = path.dirname(inputTexPath);
    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const outputName = `Rami Abdelrazzaq - ${safeTitle} - Resume`;
    const outputPdf = path.join(outputDir, `${outputName}.pdf`);
    
    try {
        // Try pdflatex first
        execSync(`pdflatex -output-directory="${outputDir}" -jobname="${outputName}" "${inputTexPath}"`, {
            cwd: outputDir,
            stdio: 'pipe',
            timeout: 30000
        });
        console.log(`  ✅ PDF created: ${outputPdf}`);
        return outputPdf;
    } catch (e) {
        // Fallback: Create a note that Overleaf is needed
        console.log(`  ⚠️  Install pdflatex or use Overleaf for: ${inputTexPath}`);
        return null;
    }
}

/**
 * Compile all resumes in applications folder
 */
async function compileAllResumes() {
    const folders = await fs.readdir(APPLICATIONS_DIR);
    const results = [];
    
    for (const folder of folders) {
        const folderPath = path.join(APPLICATIONS_DIR, folder);
        const stat = await fs.stat(folderPath);
        
        if (stat.isDirectory()) {
            const texFiles = (await fs.readdir(folderPath)).filter(f => f.endsWith('.tex'));
            
            for (const texFile of texFiles) {
                const texPath = path.join(folderPath, texFile);
                // Extract company/title from folder name
                const parts = folder.split('-');
                const company = parts[0];
                const title = parts.slice(1).join(' ').replace(/-Resume$/, '');
                
                const pdf = await compileResume(texPath, company, title);
                if (pdf) results.push(pdf);
            }
        }
    }
    
    return results;
}

module.exports = { compileResume, compileAllResumes };
