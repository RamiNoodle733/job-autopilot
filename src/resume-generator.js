const fs = require('fs-extra');
const path = require('path');

const PROFILE_MD_PATH = path.join(__dirname, '../profile.md');
const PROFILE_JSON_PATH = path.join(__dirname, '../data/profile.json');
const TEMPLATE_PATH = path.join(__dirname, '../templates/one-page-resume.tex');

function escLatex(str = '') {
    return String(str)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/&/g, '\\&')
        .replace(/%/g, '\\%')
        .replace(/\$/g, '\\$')
        .replace(/#/g, '\\#')
        .replace(/_/g, '\\_')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/\^/g, '\\textasciicircum{}')
        .replace(/~/g, '\\textasciitilde{}');
}

/**
 * Load profile from data/profile.json (preferred) or profile.md (fallback)
 */
async function loadProfile() {
    // Preferred: profile.json created by setup.js
    try {
        if (await fs.pathExists(PROFILE_JSON_PATH)) {
            const p = await fs.readJson(PROFILE_JSON_PATH);
            return {
                name: `${p.firstName || 'Rami'} ${p.lastName || 'Abdelrazzaq'}`,
                email: p.email || 'ramiabdelrazzaq@gmail.com',
                phone: p.phone || '',
                linkedin: p.linkedinHandle || 'ramiabdelrazzaq',
                github: p.githubHandle || 'RamiNoodle733',
                location: p.location || 'Houston, TX',
                summary: p.summary || 'AI Product Manager and Technical Program Manager with experience in automation, no-code solutions, and cross-functional leadership.',
                skills: {
                    product: p.skills?.methodologies || 'Agile, Scrum, OKRs, Stakeholder Management, Roadmapping',
                    ai: p.skills?.ai || 'Claude/ChatGPT, Prompt Engineering, LLM Workflows, Automation',
                    tools: p.skills?.tools || 'Jira, Notion, Git, SQL, AWS'
                }
            };
        }
    } catch (e) {
        // ignore and fallback
    }

    // Fallback: profile.md (basic extraction)
    const content = await fs.readFile(PROFILE_MD_PATH, 'utf-8');

    const profile = {
        name: 'Rami Abdelrazzaq',
        email: 'ramiabdelrazzaq@gmail.com',
        phone: '',
        linkedin: 'ramiabdelrazzaq',
        github: 'RamiNoodle733',
        location: 'Houston, TX',
        summary: 'AI Product Manager and Technical Program Manager with experience in automation, no-code solutions, and cross-functional leadership.',
        skills: {
            product: 'Agile, Scrum, OKRs, Stakeholder Management, Roadmapping',
            ai: 'Claude/ChatGPT, Prompt Engineering, LLM Workflows, Automation',
            tools: 'Jira, Notion, Git, SQL, AWS'
        }
    };

    const emailMatch = content.match(/Email:\s*([^\s]+@[^\s\n]+)/i);
    if (emailMatch) profile.email = emailMatch[1].trim();

    const phoneMatch = content.match(/Phone:\s*([^\n]+)/i);
    if (phoneMatch) profile.phone = phoneMatch[1].trim();

    const locationMatch = content.match(/Location:\s*([^\n]+)/i);
    if (locationMatch) profile.location = locationMatch[1].trim();

    const linkedinMatch = content.match(/LinkedIn:\s*linkedin\.com\/in\/(.+?)(?:\n|$)/i);
    if (linkedinMatch) profile.linkedin = linkedinMatch[1].trim();

    const githubMatch = content.match(/GitHub:\s*github\.com\/(.+?)(?:\n|$)/i);
    if (githubMatch) profile.github = githubMatch[1].trim();

    return profile;
}

/**
 * Extract keywords from job description (lightweight)
 */
function extractKeywords(jobDescription) {
    const text = (jobDescription || '').toLowerCase();
    const keywords = [];

    const terms = [
        'product', 'program', 'roadmap', 'stakeholder', 'requirements', 'launch',
        'ai', 'ml', 'llm', 'prompt', 'automation', 'workflow',
        'jira', 'notion', 'sql', 'python', 'javascript', 'aws'
    ];

    terms.forEach(term => {
        if (text.includes(term)) keywords.push(term);
    });

    return [...new Set(keywords)];
}

function buildExperienceSection(profile) {
    // Vibe-coder / AI PM + TPM flavored, kept short to preserve 1 page
    return `
\\experienceEntry{AI Product / Program Projects (Vibe-Coding)}{2024 -- Present}{Self-Directed}{Remote}
\\begin{itemize}
  \\resumeItem{Built automation systems to streamline high-volume job applications (50+ per day), tracking outcomes in SQLite.}
  \\resumeItem{Designed prompt-driven workflows for tailoring resumes and outreach messaging to role requirements.}
  \\resumeItem{Led end-to-end delivery: requirements, iteration, QA, and deployment using AI-assisted tooling.}
\\end{itemize}

\\experienceEntry{Teaching Assistant}{Aug 2024 -- May 2025}{University of Houston}{Houston, TX}
\\begin{itemize}
  \\resumeItem{Coordinated office hours and support for 50+ students; communicated technical topics clearly and consistently.}
  \\resumeItem{Managed grading workflows and feedback loops; improved turnaround time and clarity for students.}
\\end{itemize}
`;
}

function buildProjectsSection(profile) {
    return `
\\experienceEntry{Clawdbot Automation System}{2024}{Personal}{ }
\\begin{itemize}
  \\resumeItem{Personal AI assistant for workflow automation: scraping, scheduling, browser automation, and GitHub logging.}
\\end{itemize}

\\experienceEntry{Job Application Autopilot Pro}{2025}{Personal}{ }
\\begin{itemize}
  \\resumeItem{Built a daily pipeline: scrape roles, generate one-page PDFs, auto-apply (Easy Apply), and track follow-ups.}
\\end{itemize}
`;
}

/**
 * Generate tailored resume .tex for a job
 * Output naming is per-application folder (the PDF compiler handles final PDF naming).
 */
async function generateResume(job, outputDir) {
    const profile = await loadProfile();
    const template = await fs.readFile(TEMPLATE_PATH, 'utf-8');

    const keywords = extractKeywords(job.description);
    if (keywords.length) {
        console.log(`  Keywords matched: ${keywords.slice(0, 8).join(', ')}`);
    }

    const data = {
        JOB_TITLE: escLatex(job.title || 'Resume'),
        LOCATION: escLatex(profile.location),
        EMAIL: escLatex(profile.email),
        PHONE: escLatex(profile.phone),
        LINKEDIN: escLatex(profile.linkedin),
        GITHUB: escLatex(profile.github),

        SUMMARY: escLatex(profile.summary),
        SKILL_PRODUCT: escLatex(profile.skills?.product || ''),
        SKILL_AI: escLatex(profile.skills?.ai || ''),
        SKILL_TOOLS: escLatex(profile.skills?.tools || ''),

        EXPERIENCE_SECTION: buildExperienceSection(profile),
        PROJECTS_SECTION: buildProjectsSection(profile),

        EDU_DEGREE: escLatex('B.S. Computer Science'),
        EDU_DATE: escLatex('May 2025'),
        EDU_SCHOOL: escLatex('University of Houston'),
        EDU_LOCATION: escLatex('Houston, TX'),
        EDU_DETAILS: escLatex('Focus: AI, automation, and systems; strong communication and cross-functional collaboration.'),
        CERTIFICATIONS: escLatex('AWS Cloud Practitioner (in progress)')
    };

    let resume = template;
    for (const [key, value] of Object.entries(data)) {
        resume = resume.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
    }

    await fs.ensureDir(outputDir);

    const safeCompany = (job.company || 'Company').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40);
    const safeTitle = (job.title || 'Title').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 40);
    const outputPath = path.join(outputDir, `${safeCompany}-${safeTitle}-resume.tex`);

    await fs.writeFile(outputPath, resume);
    console.log(`  Resume saved: ${outputPath}`);

    return outputPath;
}

module.exports = { generateResume, extractKeywords };
