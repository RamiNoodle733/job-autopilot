/**
 * Smart Resume Tailoring
 * 
 * Automatically customizes resume for each job application.
 * Uses job description analysis to highlight relevant skills and experience.
 * 
 * Features:
 * - Keyword extraction from job descriptions
 * - Skill matching with profile
 * - Experience bullet reordering
 * - Summary customization
 * - ATS optimization
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const logger = createLogger();

// Common tech skills categorized
const SKILL_CATEGORIES = {
    programming: [
        'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'golang', 
        'rust', 'php', 'swift', 'kotlin', 'scala', 'perl', 'r', 'matlab', 'lua'
    ],
    frontend: [
        'react', 'vue', 'angular', 'svelte', 'nextjs', 'next.js', 'nuxt', 'gatsby',
        'html', 'css', 'sass', 'scss', 'less', 'tailwind', 'bootstrap', 'material-ui',
        'redux', 'mobx', 'zustand', 'webpack', 'vite', 'rollup', 'babel'
    ],
    backend: [
        'node', 'nodejs', 'express', 'fastify', 'nest', 'nestjs', 'django', 'flask', 
        'fastapi', 'spring', 'rails', 'laravel', 'asp.net', 'graphql', 'rest', 'grpc'
    ],
    database: [
        'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch',
        'dynamodb', 'cassandra', 'sqlite', 'oracle', 'mariadb', 'firebase', 'supabase'
    ],
    cloud: [
        'aws', 'azure', 'gcp', 'google cloud', 'heroku', 'vercel', 'netlify', 'digitalocean',
        'cloudflare', 's3', 'ec2', 'lambda', 'kubernetes', 'k8s', 'docker', 'terraform'
    ],
    ai_ml: [
        'machine learning', 'ml', 'deep learning', 'ai', 'artificial intelligence',
        'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'pandas', 'numpy',
        'nlp', 'computer vision', 'llm', 'gpt', 'bert', 'transformers', 'langchain'
    ],
    devops: [
        'ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis',
        'ansible', 'puppet', 'chef', 'prometheus', 'grafana', 'elk', 'datadog'
    ],
    tools: [
        'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'slack',
        'figma', 'sketch', 'adobe', 'postman', 'swagger', 'linux', 'unix', 'bash'
    ],
    soft_skills: [
        'leadership', 'communication', 'teamwork', 'problem-solving', 'analytical',
        'agile', 'scrum', 'kanban', 'project management', 'mentoring', 'collaboration'
    ]
};

class SmartResumeTailor {
    constructor(profile, templatePath) {
        this.profile = profile;
        this.templatePath = templatePath;
        this.template = this.loadTemplate();
    }

    loadTemplate() {
        if (fs.existsSync(this.templatePath)) {
            return fs.readFileSync(this.templatePath, 'utf8');
        }
        return null;
    }

    /**
     * Analyze job description and extract key requirements
     */
    analyzeJobDescription(jobDescription) {
        const text = jobDescription.toLowerCase();
        const analysis = {
            skills: [],
            experience_years: null,
            education: null,
            keywords: [],
            priorities: []
        };

        // Extract skills from each category
        for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
            for (const skill of skills) {
                // Use word boundaries for better matching
                const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(text)) {
                    analysis.skills.push({ skill, category });
                }
            }
        }

        // Extract experience requirements
        const expMatch = text.match(/(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i);
        if (expMatch) {
            analysis.experience_years = parseInt(expMatch[1]);
        }

        // Detect education requirements
        if (text.includes('phd') || text.includes('doctorate')) {
            analysis.education = 'PhD';
        } else if (text.includes('master') || text.includes("master's") || text.includes('ms ') || text.includes('mba')) {
            analysis.education = 'Masters';
        } else if (text.includes('bachelor') || text.includes("bachelor's") || text.includes('bs ') || text.includes('ba ')) {
            analysis.education = 'Bachelors';
        }

        // Extract additional keywords (unique terms appearing multiple times)
        const words = text.match(/\b[a-z]{4,}\b/g) || [];
        const wordCount = {};
        for (const word of words) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
        
        // Keywords mentioned 3+ times
        analysis.keywords = Object.entries(wordCount)
            .filter(([word, count]) => count >= 3)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);

        // Determine priorities based on order of appearance
        const priorities = [];
        for (const { skill, category } of analysis.skills) {
            const pos = text.indexOf(skill.toLowerCase());
            priorities.push({ skill, category, position: pos });
        }
        analysis.priorities = priorities.sort((a, b) => a.position - b.position).slice(0, 10);

        return analysis;
    }

    /**
     * Match profile skills with job requirements
     */
    matchSkills(profileSkills, jobAnalysis) {
        const profileSkillsLower = (profileSkills || []).map(s => s.toLowerCase());
        const jobSkills = jobAnalysis.skills.map(s => s.skill.toLowerCase());

        const matched = [];
        const missing = [];
        const additional = [];

        for (const skill of jobSkills) {
            if (profileSkillsLower.some(ps => ps.includes(skill) || skill.includes(ps))) {
                matched.push(skill);
            } else {
                missing.push(skill);
            }
        }

        for (const skill of profileSkillsLower) {
            if (!jobSkills.some(js => skill.includes(js) || js.includes(skill))) {
                additional.push(skill);
            }
        }

        return { matched, missing, additional };
    }

    /**
     * Generate tailored resume content
     */
    tailorResume(job) {
        const jobDesc = job.description || '';
        const analysis = this.analyzeJobDescription(jobDesc);
        const skillMatch = this.matchSkills(this.profile.skills, analysis);

        logger.info(`\n📝 Tailoring resume for: ${job.title} at ${job.company}`);
        logger.info(`   Matched skills: ${skillMatch.matched.length}/${analysis.skills.length}`);
        logger.info(`   Top priorities: ${analysis.priorities.slice(0, 5).map(p => p.skill).join(', ')}`);

        // Generate customized sections
        const tailored = {
            summary: this.generateSummary(job, analysis, skillMatch),
            skills: this.reorderSkills(skillMatch, analysis),
            experience: this.reorderExperience(analysis),
            keywords_to_add: analysis.keywords.filter(kw => 
                !this.template?.toLowerCase().includes(kw)
            ).slice(0, 10)
        };

        return tailored;
    }

    /**
     * Generate customized professional summary
     */
    generateSummary(job, analysis, skillMatch) {
        const title = job.title || 'Software Engineer';
        const company = job.company || '';
        const topSkills = analysis.priorities.slice(0, 3).map(p => p.skill);
        const matchedCount = skillMatch.matched.length;

        // Build dynamic summary
        let summary = `Results-driven ${title.replace(/^(Jr\.?|Junior|Senior|Sr\.?|Lead|Staff|Principal)\s*/i, '')} `;
        
        if (this.profile.years_experience) {
            summary += `with ${this.profile.years_experience}+ years of experience `;
        }

        if (topSkills.length > 0) {
            summary += `specializing in ${topSkills.join(', ')}. `;
        }

        summary += `Proven track record of delivering high-quality solutions `;

        // Add relevant experience highlight
        if (analysis.skills.some(s => s.category === 'ai_ml')) {
            summary += `with expertise in AI/ML technologies. `;
        } else if (analysis.skills.some(s => s.category === 'cloud')) {
            summary += `in cloud-native environments. `;
        } else if (analysis.skills.some(s => s.category === 'frontend')) {
            summary += `building responsive, user-centric applications. `;
        } else if (analysis.skills.some(s => s.category === 'backend')) {
            summary += `building scalable backend systems. `;
        }

        // Closing statement
        if (company) {
            summary += `Excited to bring my skills to ${company}'s innovative team.`;
        } else {
            summary += `Seeking to leverage my expertise in a challenging new role.`;
        }

        return summary;
    }

    /**
     * Reorder skills to prioritize matches
     */
    reorderSkills(skillMatch, analysis) {
        // Priority order: matched skills first, then additional relevant skills
        const orderedSkills = [
            ...skillMatch.matched,
            ...skillMatch.additional.filter(s => 
                // Keep additional skills that are in priority categories
                analysis.skills.some(js => js.category === this.getSkillCategory(s))
            )
        ];

        // Capitalize appropriately
        return orderedSkills.map(s => this.capitalizeSkill(s));
    }

    getSkillCategory(skill) {
        const skillLower = skill.toLowerCase();
        for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
            if (skills.includes(skillLower)) {
                return category;
            }
        }
        return 'other';
    }

    capitalizeSkill(skill) {
        // Handle special cases
        const specialCases = {
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'nodejs': 'Node.js',
            'nextjs': 'Next.js',
            'nestjs': 'NestJS',
            'graphql': 'GraphQL',
            'postgresql': 'PostgreSQL',
            'mongodb': 'MongoDB',
            'mysql': 'MySQL',
            'aws': 'AWS',
            'gcp': 'GCP',
            'ci/cd': 'CI/CD',
            'rest': 'REST',
            'grpc': 'gRPC',
            'html': 'HTML',
            'css': 'CSS',
            'sql': 'SQL',
            'nosql': 'NoSQL',
            'api': 'API',
            'apis': 'APIs',
            'kubernetes': 'Kubernetes',
            'docker': 'Docker',
            'react': 'React',
            'vue': 'Vue.js',
            'angular': 'Angular',
            'python': 'Python',
            'java': 'Java',
            'go': 'Go',
            'golang': 'Go',
            'rust': 'Rust',
            'pytorch': 'PyTorch',
            'tensorflow': 'TensorFlow'
        };

        return specialCases[skill.toLowerCase()] || 
               skill.charAt(0).toUpperCase() + skill.slice(1);
    }

    /**
     * Reorder experience bullets to prioritize relevant ones
     */
    reorderExperience(analysis) {
        const experience = this.profile.work || [];
        
        return experience.map(exp => {
            const bullets = exp.bullets || exp.description?.split('\n').filter(Boolean) || [];
            
            // Score each bullet by keyword relevance
            const scoredBullets = bullets.map(bullet => {
                const bulletLower = bullet.toLowerCase();
                let score = 0;
                
                for (const { skill } of analysis.priorities) {
                    if (bulletLower.includes(skill)) {
                        score += 10;
                    }
                }
                
                for (const keyword of analysis.keywords) {
                    if (bulletLower.includes(keyword)) {
                        score += 1;
                    }
                }

                return { bullet, score };
            });

            // Sort by score (highest first)
            scoredBullets.sort((a, b) => b.score - a.score);

            return {
                ...exp,
                bullets: scoredBullets.map(b => b.bullet)
            };
        });
    }

    /**
     * Generate LaTeX resume from template
     */
    generateLatex(job, outputPath) {
        if (!this.template) {
            logger.error('No template loaded');
            return null;
        }

        const tailored = this.tailorResume(job);
        let latex = this.template;

        // Replace placeholders with tailored content
        latex = latex.replace(/\\SUMMARY\{[^}]*\}/g, `\\SUMMARY{${this.escapeLatex(tailored.summary)}}`);
        
        // Replace skills section
        const skillsLatex = tailored.skills.map(s => this.escapeLatex(s)).join(' \\textbullet{} ');
        latex = latex.replace(/\\SKILLS\{[^}]*\}/g, `\\SKILLS{${skillsLatex}}`);

        // Save the tailored resume
        fs.writeFileSync(outputPath, latex);
        logger.info(`   📄 Saved tailored resume to ${outputPath}`);

        return outputPath;
    }

    escapeLatex(text) {
        if (!text) return '';
        return text
            .replace(/\\/g, '\\textbackslash{}')
            .replace(/[&%$#_{}]/g, '\\$&')
            .replace(/~/g, '\\textasciitilde{}')
            .replace(/\^/g, '\\textasciicircum{}');
    }

    /**
     * Get tailoring recommendations
     */
    getRecommendations(job) {
        const analysis = this.analyzeJobDescription(job.description || '');
        const skillMatch = this.matchSkills(this.profile.skills, analysis);

        return {
            matchScore: Math.round((skillMatch.matched.length / Math.max(analysis.skills.length, 1)) * 100),
            strongMatch: skillMatch.matched,
            skillGaps: skillMatch.missing.slice(0, 5),
            keywordsToInclude: analysis.keywords.slice(0, 10),
            prioritySkills: analysis.priorities.slice(0, 5).map(p => p.skill),
            recommendations: this.generateRecommendations(skillMatch, analysis)
        };
    }

    generateRecommendations(skillMatch, analysis) {
        const recs = [];

        if (skillMatch.missing.length > 0) {
            recs.push(`Consider learning: ${skillMatch.missing.slice(0, 3).join(', ')}`);
        }

        if (analysis.experience_years && this.profile.years_experience < analysis.experience_years) {
            recs.push(`Role requires ${analysis.experience_years}+ years, you have ${this.profile.years_experience || '?'}`);
        }

        if (skillMatch.matched.length >= 5) {
            recs.push('Strong skills match - highlight these in your cover letter');
        }

        return recs;
    }
}

module.exports = { SmartResumeTailor, SKILL_CATEGORIES };
