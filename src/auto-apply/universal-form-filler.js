/**
 * Universal Form Filler
 * 
 * AI-powered intelligent form filling that works across any job application.
 * Uses profile data + AI to understand and fill any form field.
 * 
 * Features:
 * - Understands field labels via semantic matching
 * - Handles dropdowns, radio buttons, checkboxes, textareas
 * - Auto-detects required fields
 * - Resume/cover letter upload
 * - Work authorization, salary expectations, start date
 * - Handles multi-page applications
 */

const { createLogger } = require('../logger');
const fs = require('fs');
const path = require('path');

const logger = createLogger();

// Common field mappings (label patterns -> profile paths)
const FIELD_MAPPINGS = {
    // Personal Information
    'first.*name|given.*name|nombre': 'personal.firstName',
    'last.*name|family.*name|surname|apellido': 'personal.lastName',
    'full.*name|your.*name|name$': 'personal.fullName',
    'email|e-mail|correo': 'personal.email',
    'phone|tel|mobile|cell|telefono': 'personal.phone',
    'linkedin|linked.*in': 'personal.linkedin',
    'github|git.*hub': 'personal.github',
    'portfolio|website|personal.*site': 'personal.portfolio',
    'city|ciudad': 'personal.city',
    'state|province|estado': 'personal.state',
    'country|pais': 'personal.country',
    'zip|postal|codigo.*postal': 'personal.zip',
    'address|street|direccion': 'personal.address',
    
    // Work Authorization
    'authorized|legally.*work|work.*auth|eligible.*work': 'workAuth.authorized',
    'visa|sponsorship|sponsor': 'workAuth.needsSponsorship',
    'citizen|citizenship': 'workAuth.citizenship',
    
    // Availability
    'start.*date|when.*start|disponibilidad': 'availability.startDate',
    'notice.*period|notice': 'availability.noticePeriod',
    
    // Experience
    'years.*experience|experience.*years|años.*experiencia': 'experience.yearsTotal',
    'current.*company|employer|empleador': 'experience.currentCompany',
    'current.*title|job.*title|puesto': 'experience.currentTitle',
    
    // Salary
    'salary|compensation|pay|sueldo|expectativa.*salarial': 'salary.expected',
    
    // Education
    'degree|education.*level|nivel.*educacion': 'education.degree',
    'school|university|college|universidad': 'education.school',
    'major|field.*study|carrera': 'education.major',
    'graduation|grad.*year|año.*graduacion': 'education.graduationYear',
    'gpa|grade|promedio': 'education.gpa',
    
    // Cover Letter / Why
    'cover.*letter|carta': 'documents.coverLetter',
    'why.*company|why.*us|por.*que': 'custom.whyCompany',
    'why.*role|why.*position|por.*que.*puesto': 'custom.whyRole',
    
    // Additional
    'referred|referral|referido': 'referral.source',
    'how.*hear|where.*hear|como.*conociste': 'referral.howHeard',
    'veteran|military|veterano': 'demographics.veteran',
    'disability|discapacidad': 'demographics.disability',
    'gender|genero': 'demographics.gender',
    'race|ethnicity|etnicidad': 'demographics.race',
    'pronouns|pronombres': 'demographics.pronouns'
};

// Common dropdown value mappings
const DROPDOWN_MAPPINGS = {
    'yes': ['yes', 'sí', 'si', 'true', '1'],
    'no': ['no', 'false', '0'],
    'authorized': ['yes', 'authorized', 'eligible', 'us citizen', 'permanent resident', 'green card'],
    'not_authorized': ['no', 'not authorized', 'require sponsorship'],
    'immediately': ['immediately', 'now', 'asap', '2 weeks', 'right away', 'inmediatamente'],
    'entry': ['entry', 'junior', '0-2', '0-1', 'new grad', 'entry level', 'associate'],
    'mid': ['mid', 'intermediate', '3-5', '2-5', 'mid-level'],
    'senior': ['senior', '5+', '5-10', 'experienced'],
    'male': ['male', 'm', 'man', 'masculino', 'hombre'],
    'female': ['female', 'f', 'woman', 'femenino', 'mujer'],
    'other': ['other', 'non-binary', 'prefer not to say', 'decline', 'otro'],
    'bachelors': ['bachelor', 'bs', 'ba', 'undergraduate', 'licenciatura'],
    'masters': ['master', 'ms', 'ma', 'mba', 'graduate', 'maestría'],
    'phd': ['phd', 'doctorate', 'doctoral', 'doctorado']
};

class UniversalFormFiller {
    constructor(profile) {
        this.profile = this.normalizeProfile(profile);
        this.filledFields = new Set();
        this.errors = [];
    }

    /**
     * Normalize profile data for easy access
     */
    normalizeProfile(profile) {
        const p = profile || {};
        const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        
        return {
            personal: {
                firstName: p.first_name || p.firstName || '',
                lastName: p.last_name || p.lastName || '',
                fullName: fullName || p.name || '',
                email: p.email || '',
                phone: p.phone || '',
                linkedin: p.linkedin || '',
                github: p.github || '',
                portfolio: p.website || p.portfolio || '',
                city: p.city || '',
                state: p.state || '',
                country: p.country || 'United States',
                zip: p.zip || p.zipcode || '',
                address: p.address || ''
            },
            workAuth: {
                authorized: p.work_authorized !== false,
                needsSponsorship: p.needs_sponsorship || false,
                citizenship: p.citizenship || 'US Citizen'
            },
            availability: {
                startDate: p.start_date || 'Immediately',
                noticePeriod: p.notice_period || '2 weeks'
            },
            experience: {
                yearsTotal: p.years_experience || p.total_years || '0-2',
                currentCompany: p.current_company || p.work?.[0]?.company || '',
                currentTitle: p.current_title || p.work?.[0]?.title || ''
            },
            salary: {
                expected: p.salary_expectation || p.desired_salary || ''
            },
            education: {
                degree: p.degree || p.education?.[0]?.degree || "Bachelor's",
                school: p.school || p.education?.[0]?.school || '',
                major: p.major || p.education?.[0]?.major || '',
                graduationYear: p.graduation_year || p.education?.[0]?.year || '',
                gpa: p.gpa || ''
            },
            documents: {
                resumePath: p.resume_path || '',
                coverLetter: p.cover_letter || ''
            },
            custom: {
                whyCompany: p.why_company || 'I am excited about the innovative work being done at this company and believe my skills align well with the role.',
                whyRole: p.why_role || 'This role matches my career goals and I am eager to contribute my expertise to the team.'
            },
            referral: {
                source: p.referral_source || '',
                howHeard: p.how_heard || 'Online Job Search'
            },
            demographics: {
                veteran: p.veteran || 'No',
                disability: p.disability || 'Decline to answer',
                gender: p.gender || 'Decline to answer',
                race: p.race || 'Decline to answer',
                pronouns: p.pronouns || ''
            }
        };
    }

    /**
     * Fill a form on the page
     */
    async fillForm(page, options = {}) {
        const { companyName = '', jobTitle = '' } = options;
        
        logger.info('🤖 Starting AI form fill...');
        
        // Get all input fields
        const fields = await this.analyzeFormFields(page);
        logger.info(`   Found ${fields.length} fillable fields`);

        let filled = 0;
        let skipped = 0;

        for (const field of fields) {
            try {
                const value = await this.determineFieldValue(field, { companyName, jobTitle });
                
                if (value !== null && value !== undefined) {
                    await this.fillField(page, field, value);
                    filled++;
                    this.filledFields.add(field.id || field.name);
                } else {
                    skipped++;
                }
            } catch (e) {
                logger.error(`   Error filling ${field.name || field.id}: ${e.message}`);
                this.errors.push({ field, error: e.message });
            }
        }

        logger.info(`   Filled: ${filled}, Skipped: ${skipped}`);
        return { filled, skipped, errors: this.errors };
    }

    /**
     * Analyze all form fields on the page
     */
    async analyzeFormFields(page) {
        return await page.evaluate(() => {
            const fields = [];
            
            // Helper to get field label
            const getLabel = (input) => {
                // Check for associated label
                if (input.id) {
                    const label = document.querySelector(`label[for="${input.id}"]`);
                    if (label) return label.textContent.trim();
                }
                
                // Check parent label
                const parentLabel = input.closest('label');
                if (parentLabel) {
                    return parentLabel.textContent.replace(input.value || '', '').trim();
                }
                
                // Check nearby text
                const parent = input.parentElement;
                if (parent) {
                    const prevSibling = parent.previousElementSibling;
                    if (prevSibling) return prevSibling.textContent.trim();
                }
                
                // Use placeholder or aria-label
                return input.placeholder || input.getAttribute('aria-label') || input.name || '';
            };

            // Get input fields
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
            for (const input of inputs) {
                fields.push({
                    type: input.type || 'text',
                    id: input.id,
                    name: input.name,
                    label: getLabel(input),
                    required: input.required || input.getAttribute('aria-required') === 'true',
                    value: input.value,
                    selector: input.id ? `#${input.id}` : `input[name="${input.name}"]`
                });
            }

            // Get textareas
            const textareas = document.querySelectorAll('textarea');
            for (const ta of textareas) {
                fields.push({
                    type: 'textarea',
                    id: ta.id,
                    name: ta.name,
                    label: getLabel(ta),
                    required: ta.required,
                    value: ta.value,
                    selector: ta.id ? `#${ta.id}` : `textarea[name="${ta.name}"]`
                });
            }

            // Get selects
            const selects = document.querySelectorAll('select');
            for (const select of selects) {
                const options = Array.from(select.options).map(o => ({
                    value: o.value,
                    text: o.textContent.trim()
                }));
                fields.push({
                    type: 'select',
                    id: select.id,
                    name: select.name,
                    label: getLabel(select),
                    required: select.required,
                    options,
                    selector: select.id ? `#${select.id}` : `select[name="${select.name}"]`
                });
            }

            return fields;
        });
    }

    /**
     * Determine the value to fill based on field analysis
     */
    async determineFieldValue(field, context = {}) {
        const label = (field.label || field.name || '').toLowerCase();
        
        // Match against our mappings
        for (const [pattern, profilePath] of Object.entries(FIELD_MAPPINGS)) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(label)) {
                const value = this.getProfileValue(profilePath);
                
                // Customize for company/job
                if (profilePath === 'custom.whyCompany' && context.companyName) {
                    return this.customizeWhyCompany(value, context.companyName);
                }
                if (profilePath === 'custom.whyRole' && context.jobTitle) {
                    return this.customizeWhyRole(value, context.jobTitle);
                }
                
                return value;
            }
        }

        // Handle special cases
        if (field.type === 'file') {
            return this.profile.documents.resumePath;
        }

        if (field.type === 'checkbox') {
            // Generally check acknowledgments/terms
            if (label.includes('agree') || label.includes('acknowledge') || label.includes('terms')) {
                return true;
            }
        }

        return null; // Unknown field
    }

    /**
     * Get value from profile by dot path
     */
    getProfileValue(path) {
        return path.split('.').reduce((obj, key) => obj?.[key], this.profile);
    }

    /**
     * Fill a single field
     */
    async fillField(page, field, value) {
        const selector = field.selector;
        if (!selector) return;

        try {
            await page.waitForSelector(selector, { timeout: 3000 });

            switch (field.type) {
                case 'text':
                case 'email':
                case 'tel':
                case 'number':
                case 'url':
                    await page.click(selector, { clickCount: 3 }); // Select all
                    await page.type(selector, String(value));
                    break;

                case 'textarea':
                    await page.click(selector, { clickCount: 3 });
                    await page.type(selector, String(value));
                    break;

                case 'select':
                    await this.selectDropdownValue(page, field, value);
                    break;

                case 'radio':
                    await this.selectRadio(page, field, value);
                    break;

                case 'checkbox':
                    if (value === true) {
                        const isChecked = await page.$eval(selector, el => el.checked);
                        if (!isChecked) await page.click(selector);
                    }
                    break;

                case 'file':
                    if (value && fs.existsSync(value)) {
                        const input = await page.$(selector);
                        await input.uploadFile(value);
                    }
                    break;
            }
        } catch (e) {
            logger.warn(`   Could not fill ${field.name || field.id}: ${e.message}`);
        }
    }

    /**
     * Intelligently select dropdown value
     */
    async selectDropdownValue(page, field, desiredValue) {
        const options = field.options || [];
        const normalizedDesired = String(desiredValue).toLowerCase();

        // Try exact match first
        let matchedOption = options.find(o => 
            o.value.toLowerCase() === normalizedDesired || 
            o.text.toLowerCase() === normalizedDesired
        );

        // Try fuzzy match
        if (!matchedOption) {
            for (const [key, variations] of Object.entries(DROPDOWN_MAPPINGS)) {
                if (variations.some(v => normalizedDesired.includes(v))) {
                    matchedOption = options.find(o =>
                        variations.some(v => 
                            o.value.toLowerCase().includes(v) || 
                            o.text.toLowerCase().includes(v)
                        )
                    );
                    if (matchedOption) break;
                }
            }
        }

        // Fallback: contains match
        if (!matchedOption) {
            matchedOption = options.find(o =>
                o.value.toLowerCase().includes(normalizedDesired) ||
                o.text.toLowerCase().includes(normalizedDesired)
            );
        }

        if (matchedOption) {
            await page.select(field.selector, matchedOption.value);
        }
    }

    /**
     * Select a radio button
     */
    async selectRadio(page, field, value) {
        const normalizedValue = String(value).toLowerCase();
        
        // Find the radio that matches our value
        const radios = await page.$$(`input[type="radio"][name="${field.name}"]`);
        for (const radio of radios) {
            const radioValue = await page.evaluate(el => el.value, radio);
            const labelText = await page.evaluate(el => {
                const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
                return label ? label.textContent.toLowerCase() : el.value.toLowerCase();
            }, radio);

            if (radioValue.toLowerCase() === normalizedValue || 
                labelText.includes(normalizedValue)) {
                await radio.click();
                break;
            }
        }
    }

    /**
     * Customize "why this company" answer
     */
    customizeWhyCompany(template, companyName) {
        return template.replace(/this company|the company/gi, companyName);
    }

    /**
     * Customize "why this role" answer
     */
    customizeWhyRole(template, jobTitle) {
        return template.replace(/this role|the role|this position/gi, jobTitle);
    }

    /**
     * Handle multi-page applications
     */
    async fillMultiPageForm(page, options = {}) {
        let pageNum = 1;
        const maxPages = options.maxPages || 10;
        
        while (pageNum <= maxPages) {
            logger.info(`   Filling page ${pageNum}...`);
            
            // Fill current page
            await this.fillForm(page, options);
            
            // Look for next button
            const nextButton = await this.findNextButton(page);
            if (!nextButton) {
                // Check if we're at the submit page
                const submitButton = await this.findSubmitButton(page);
                if (submitButton) {
                    return { success: true, pagesFilled: pageNum };
                }
                break;
            }
            
            await nextButton.click();
            await page.waitForTimeout(2000); // Wait for page transition
            pageNum++;
        }

        return { success: true, pagesFilled: pageNum };
    }

    async findNextButton(page) {
        const selectors = [
            'button:contains("Next")',
            'button:contains("Continue")',
            'input[type="submit"][value*="Next"]',
            '[data-automation-id="bottom-navigation-next-button"]',
            'button.next',
            '.btn-next'
        ];

        for (const selector of selectors) {
            try {
                const button = await page.$(selector);
                if (button) return button;
            } catch (e) {}
        }

        // Fallback: search by text
        return await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            return buttons.find(b => 
                /^(next|continue|proceed)$/i.test(b.textContent?.trim()) ||
                /^(next|continue)$/i.test(b.value)
            );
        });
    }

    async findSubmitButton(page) {
        return await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            return buttons.find(b => 
                /^(submit|apply|send|finish|complete)$/i.test(b.textContent?.trim()) ||
                /^(submit|apply)$/i.test(b.value)
            );
        });
    }
}

module.exports = { UniversalFormFiller, FIELD_MAPPINGS, DROPDOWN_MAPPINGS };
