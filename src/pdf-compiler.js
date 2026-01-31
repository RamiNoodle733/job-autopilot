/**
 * PDF Auto-Compiler - Job Application Autopilot Pro
 * 
 * Features:
 * - Converts .tex → PDF automatically
 * - Smart formatting: auto-adjust font/size to guarantee 1 page
 * - Correct naming: "Rami Abdelrazzaq - {Title} - Resume.pdf"
 * - Multiple compilation attempts with different sizing
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const os = require('os');

// Size profiles for auto-fitting (from spacious to compact)
const SIZE_PROFILES = [
    // Profile 1: Comfortable spacing (for short content)
    {
        name: 'spacious',
        FONT_SIZE: '11',
        TOP_MARGIN: '0.6',
        BOTTOM_MARGIN: '0.5',
        SIDE_MARGIN: '0.6',
        SECTION_FONT_SIZE: '13',
        SECTION_LINE_HEIGHT: '16',
        SECTION_SPACE_BEFORE: '0.6',
        SECTION_SPACE_AFTER: '0.4',
        LINE_SPACING: '1.08',
        ITEM_SEP: '2',
        LIST_TOP_SEP: '3',
        NAME_FONT_SIZE: '20',
        NAME_LINE_HEIGHT: '24',
        HEADER_SPACE: '0.4',
        SECTION_GAP: '0.3',
        EXP_GAP: '0.25',
        PROJECT_GAP: '0.2'
    },
    // Profile 2: Normal (default)
    {
        name: 'normal',
        FONT_SIZE: '10',
        TOP_MARGIN: '0.5',
        BOTTOM_MARGIN: '0.4',
        SIDE_MARGIN: '0.55',
        SECTION_FONT_SIZE: '12',
        SECTION_LINE_HEIGHT: '14',
        SECTION_SPACE_BEFORE: '0.5',
        SECTION_SPACE_AFTER: '0.3',
        LINE_SPACING: '1.05',
        ITEM_SEP: '1',
        LIST_TOP_SEP: '2',
        NAME_FONT_SIZE: '18',
        NAME_LINE_HEIGHT: '22',
        HEADER_SPACE: '0.3',
        SECTION_GAP: '0.2',
        EXP_GAP: '0.15',
        PROJECT_GAP: '0.12'
    },
    // Profile 3: Compact (for longer content)
    {
        name: 'compact',
        FONT_SIZE: '10',
        TOP_MARGIN: '0.4',
        BOTTOM_MARGIN: '0.35',
        SIDE_MARGIN: '0.5',
        SECTION_FONT_SIZE: '11',
        SECTION_LINE_HEIGHT: '13',
        SECTION_SPACE_BEFORE: '0.4',
        SECTION_SPACE_AFTER: '0.2',
        LINE_SPACING: '1.02',
        ITEM_SEP: '0',
        LIST_TOP_SEP: '1',
        NAME_FONT_SIZE: '17',
        NAME_LINE_HEIGHT: '20',
        HEADER_SPACE: '0.2',
        SECTION_GAP: '0.12',
        EXP_GAP: '0.1',
        PROJECT_GAP: '0.08'
    },
    // Profile 4: Ultra-compact (maximum content)
    {
        name: 'ultra-compact',
        FONT_SIZE: '9',
        TOP_MARGIN: '0.35',
        BOTTOM_MARGIN: '0.3',
        SIDE_MARGIN: '0.45',
        SECTION_FONT_SIZE: '10',
        SECTION_LINE_HEIGHT: '12',
        SECTION_SPACE_BEFORE: '0.3',
        SECTION_SPACE_AFTER: '0.15',
        LINE_SPACING: '1.0',
        ITEM_SEP: '0',
        LIST_TOP_SEP: '0',
        NAME_FONT_SIZE: '16',
        NAME_LINE_HEIGHT: '18',
        HEADER_SPACE: '0.15',
        SECTION_GAP: '0.08',
        EXP_GAP: '0.06',
        PROJECT_GAP: '0.05'
    }
];

/**
 * Check if LaTeX tools are available
 */
function checkLatexAvailable() {
    // Prefer XeLaTeX because the one-page template uses fontspec
    const commands = ['xelatex', 'latexmk', 'pdflatex'];
    for (const cmd of commands) {
        try {
            execSync(`which ${cmd}`, { stdio: 'pipe' });
            return cmd;
        } catch (e) {
            continue;
        }
    }
    return null;
}

/**
 * Get the number of pages in a PDF
 */
function getPdfPageCount(pdfPath) {
    try {
        // Try pdfinfo first
        const output = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep Pages`, { encoding: 'utf8' });
        const match = output.match(/Pages:\s+(\d+)/);
        if (match) return parseInt(match[1], 10);
    } catch (e) {
        // Fallback: check file size heuristic (1 page ~ 20-100KB typically)
        try {
            const stat = fs.statSync(pdfPath);
            // If file is suspiciously large, assume multi-page
            if (stat.size > 200000) return 2; // Likely 2+ pages
        } catch (e2) {}
    }
    return 1; // Default assumption
}

/**
 * Apply sizing profile to template
 */
function applyProfile(templateContent, profile) {
    let result = templateContent;
    for (const [key, value] of Object.entries(profile)) {
        if (key === 'name') continue;
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value);
    }
    return result;
}

/**
 * Compile LaTeX to PDF with xelatex
 */
async function compileToPdf(texPath, outputDir, outputName, timeout = 60000) {
    const latexCmd = checkLatexAvailable();
    if (!latexCmd) {
        throw new Error('No LaTeX compiler found. Install texlive-xetex or use Docker.');
    }
    
    const jobName = outputName.replace(/[^a-zA-Z0-9\s\-]/g, '');
    
    // Use latexmk when available, otherwise fall back to the detected compiler
    const cmd = latexCmd === 'latexmk'
        ? `latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir="${outputDir}" -jobname="${jobName}"`
        : `${latexCmd} -interaction=nonstopmode -halt-on-error -output-directory="${outputDir}" -jobname="${jobName}"`;

    return new Promise((resolve, reject) => {
        const fullCmd = `${cmd} "${texPath}"`;
        
        exec(fullCmd, {
            cwd: outputDir,
            timeout,
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        }, (error, stdout, stderr) => {
            const pdfPath = path.join(outputDir, `${jobName}.pdf`);
            
            if (fs.existsSync(pdfPath)) {
                // Clean up auxiliary files
                const auxFiles = ['.aux', '.log', '.out', '.fls', '.fdb_latexmk', '.xdv'];
                for (const ext of auxFiles) {
                    try {
                        fs.unlinkSync(path.join(outputDir, `${jobName}${ext}`));
                    } catch (e) {}
                }
                resolve(pdfPath);
            } else if (error) {
                reject(new Error(`LaTeX compilation failed: ${stderr || stdout || error.message}`));
            } else {
                reject(new Error('PDF not created'));
            }
        });
    });
}

/**
 * Smart compile with auto-sizing to guarantee 1 page
 * Tries multiple size profiles until PDF fits on 1 page
 */
async function smartCompile(templatePath, outputDir, jobTitle, data = {}) {
    const templateContent = await fs.readFile(templatePath, 'utf8');
    
    // Sanitize job title for filename
    const safeTitle = jobTitle
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50);
    
    const outputName = `Rami Abdelrazzaq - ${safeTitle} - Resume`;
    const tempDir = path.join(os.tmpdir(), `resume-compile-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    let lastPdfPath = null;
    let lastError = null;
    
    // Try each profile from spacious to compact
    for (const profile of SIZE_PROFILES) {
        console.log(`    Trying ${profile.name} profile...`);
        
        try {
            // Apply size profile
            let processedTex = applyProfile(templateContent, profile);
            
            // Apply data substitutions
            for (const [key, value] of Object.entries(data)) {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                processedTex = processedTex.replace(regex, String(value || ''));
            }
            
            // Write temp .tex file
            const tempTexPath = path.join(tempDir, 'resume.tex');
            await fs.writeFile(tempTexPath, processedTex);
            
            // Compile
            const pdfPath = await compileToPdf(tempTexPath, tempDir, outputName);
            const pageCount = getPdfPageCount(pdfPath);
            
            if (pageCount === 1) {
                // Success! Copy to output directory
                const finalPath = path.join(outputDir, `${outputName}.pdf`);
                await fs.copy(pdfPath, finalPath);
                await fs.remove(tempDir);
                
                console.log(`    ✅ 1-page PDF created with ${profile.name} profile`);
                return { success: true, path: finalPath, profile: profile.name };
            } else {
                console.log(`    ⚠️  ${profile.name} produced ${pageCount} pages, trying smaller...`);
                lastPdfPath = pdfPath;
            }
        } catch (error) {
            lastError = error;
            console.log(`    ⚠️  ${profile.name} failed: ${error.message}`);
        }
    }
    
    // If we get here, use the last successful compile even if >1 page
    if (lastPdfPath) {
        const finalPath = path.join(outputDir, `${outputName}.pdf`);
        await fs.copy(lastPdfPath, finalPath);
        await fs.remove(tempDir);
        
        console.log(`    ⚠️  Warning: PDF may exceed 1 page. Manual review needed.`);
        return { success: true, path: finalPath, profile: 'ultra-compact', warning: 'May exceed 1 page' };
    }
    
    await fs.remove(tempDir);
    throw lastError || new Error('All compilation profiles failed');
}

/**
 * Simple compile without auto-sizing
 */
async function compileResume(inputTexPath, company, title) {
    const outputDir = path.dirname(inputTexPath);
    const safeTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 60);
    const outputName = `Rami Abdelrazzaq - ${safeTitle} - Resume`;
    const outputPdf = path.join(outputDir, `${outputName}.pdf`);

    const latexCmd = checkLatexAvailable();
    if (!latexCmd) {
        console.log(`  ⚠️  No LaTeX compiler found. Install texlive-xetex`);
        console.log(`      Ubuntu: sudo apt install texlive-xetex texlive-fonts-extra poppler-utils`);
        console.log(`      Or upload ${inputTexPath} to Overleaf`);
        return null;
    }

    // If the .tex contains sizing placeholders, auto-fit using profiles
    const raw = await fs.readFile(inputTexPath, 'utf8');
    if (raw.includes('{{FONT_SIZE}}') || raw.includes('{{TOP_MARGIN}}')) {
        const tempDir = path.join(os.tmpdir(), `resume-fit-${Date.now()}`);
        await fs.ensureDir(tempDir);

        let lastPdf = null;
        for (const profile of SIZE_PROFILES) {
            try {
                const filled = applyProfile(raw, profile);
                const tempTex = path.join(tempDir, 'resume.tex');
                await fs.writeFile(tempTex, filled);

                const pdfPath = await compileToPdf(tempTex, tempDir, outputName);
                const pages = getPdfPageCount(pdfPath);

                if (pages === 1) {
                    await fs.copy(pdfPath, outputPdf);
                    await fs.remove(tempDir);
                    console.log(`  ✅ 1-page PDF created (${profile.name}): ${outputPdf}`);
                    return outputPdf;
                }

                lastPdf = pdfPath;
            } catch (e) {
                // try next profile
            }
        }

        if (lastPdf) {
            await fs.copy(lastPdf, outputPdf);
            await fs.remove(tempDir);
            console.log(`  ⚠️  PDF generated but may exceed 1 page (review): ${outputPdf}`);
            return outputPdf;
        }

        await fs.remove(tempDir);
        return null;
    }

    // Otherwise, do a standard compile
    try {
        const cmd = `xelatex -interaction=nonstopmode -halt-on-error -output-directory="${outputDir}" -jobname="${outputName}" "${inputTexPath}"`;

        execSync(cmd, {
            cwd: outputDir,
            stdio: 'pipe',
            timeout: 60000
        });

        // Clean up auxiliary files
        const baseName = path.join(outputDir, outputName);
        for (const ext of ['.aux', '.log', '.out', '.xdv']) {
            try { fs.unlinkSync(`${baseName}${ext}`); } catch (e) {}
        }

        console.log(`  ✅ PDF created: ${outputPdf}`);
        return outputPdf;
    } catch (e) {
        console.log(`  ❌ Compilation error. Check LaTeX syntax.`);
        console.log(`     Error: ${e.message}`);
        return null;
    }
}

/**
 * Compile all resumes in a directory
 */
async function compileAllResumes(applicationsDir) {
    const results = {
        success: [],
        failed: []
    };
    
    const folders = await fs.readdir(applicationsDir);
    
    for (const folder of folders) {
        const folderPath = path.join(applicationsDir, folder);
        const stat = await fs.stat(folderPath);
        
        if (!stat.isDirectory()) continue;
        
        const texFiles = (await fs.readdir(folderPath)).filter(f => f.endsWith('.tex'));
        
        for (const texFile of texFiles) {
            const texPath = path.join(folderPath, texFile);
            const parts = folder.split('-');
            const company = parts[0];
            const title = parts.slice(1).join(' ').replace(/-Resume$/i, '');
            
            try {
                const pdf = await compileResume(texPath, company, title);
                if (pdf) {
                    results.success.push({ company, title, path: pdf });
                } else {
                    results.failed.push({ company, title, error: 'No LaTeX compiler' });
                }
            } catch (error) {
                results.failed.push({ company, title, error: error.message });
            }
        }
    }
    
    return results;
}

/**
 * Quick one-off PDF generation from profile data
 */
async function generateQuickPdf(jobTitle, outputDir) {
    const templatePath = path.join(__dirname, '../templates/one-page-resume.tex');
    
    // Load profile data
    const profilePath = path.join(__dirname, '../data/profile.json');
    let profileData = {};
    
    try {
        profileData = await fs.readJson(profilePath);
    } catch (e) {
        console.log('  ⚠️  No profile.json found, using defaults');
    }
    
    return smartCompile(templatePath, outputDir, jobTitle, profileData);
}

module.exports = {
    compileResume,
    compileAllResumes,
    smartCompile,
    generateQuickPdf,
    checkLatexAvailable,
    SIZE_PROFILES
};
