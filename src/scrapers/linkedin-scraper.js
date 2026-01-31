const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Scrape LinkedIn jobs
 * Note: LinkedIn heavily rate-limits scraping. Use with delays.
 */
async function scrapeLinkedIn(searchQuery, location = 'United States', limit = 10) {
    console.log(`Scraping LinkedIn for "${searchQuery}"...`);
    const jobs = [];
    
    try {
        // LinkedIn jobs API endpoint (simplified)
        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(location)}&start=0`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        $('.base-card').each((i, elem) => {
            if (jobs.length >= limit) return false;
            
            const title = $(elem).find('.base-search-card__title').text().trim();
            const company = $(elem).find('.base-search-card__subtitle').text().trim();
            const location = $(elem).find('.job-search-card__location').text().trim();
            const link = $(elem).find('a.base-card__full-link').attr('href');
            const jobId = link ? link.match(/\d+/) : null;
            
            if (title && company) {
                jobs.push({
                    job_id: `linkedin-${jobId || Date.now()}-${i}`,
                    title,
                    company,
                    location: location || 'Remote',
                    application_url: link || '',
                    description: `${title} at ${company}`,
                    source: 'LinkedIn',
                    posted_date: new Date().toISOString()
                });
            }
        });
        
        console.log(`  Found ${jobs.length} jobs on LinkedIn`);
    } catch (error) {
        console.error('  LinkedIn scrape failed:', error.message);
    }
    
    return jobs;
}

module.exports = { scrapeLinkedIn };
