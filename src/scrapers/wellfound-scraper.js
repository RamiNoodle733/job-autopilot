const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Scrape Wellfound (AngelList) jobs
 * Best for startup roles
 */
async function scrapeWellfound(role = 'software engineer', location = 'remote', limit = 10) {
    console.log(`Scraping Wellfound for "${role}"...`);
    const jobs = [];
    
    try {
        // Wellfound API endpoint
        const url = `https://wellfound.com/api/jobs?role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });
        
        // Wellfound returns JSON
        const data = response.data;
        
        if (data.jobs) {
            data.jobs.slice(0, limit).forEach((job, i) => {
                jobs.push({
                    job_id: `wellfound-${job.id || Date.now()}-${i}`,
                    title: job.title || 'Unknown',
                    company: job.organization?.name || 'Unknown',
                    location: job.locations?.map(l => l.name).join(', ') || 'Remote',
                    application_url: job.apply_url || `https://wellfound.com/jobs/${job.id}`,
                    description: job.description?.substring(0, 500) || job.title,
                    salary: job.compensation?.formatted || '',
                    source: 'Wellfound',
                    posted_date: job.created_at || new Date().toISOString()
                });
            });
        }
        
        console.log(`  Found ${jobs.length} jobs on Wellfound`);
    } catch (error) {
        console.error('  Wellfound scrape failed:', error.message);
    }
    
    return jobs;
}

module.exports = { scrapeWellfound };
