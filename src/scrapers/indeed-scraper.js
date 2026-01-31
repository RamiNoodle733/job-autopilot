const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Scrape Indeed jobs
 */
async function scrapeIndeed(searchQuery, location = 'United States', limit = 10) {
    console.log(`Scraping Indeed for "${searchQuery}"...`);
    const jobs = [];
    
    try {
        const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(searchQuery)}&l=${encodeURIComponent(location)}`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        
        // Indeed uses data-testid attributes
        $('[data-testid="jobTitle"]').each((i, elem) => {
            if (jobs.length >= limit) return false;
            
            const card = $(elem).closest('td') || $(elem).closest('div');
            const title = $(elem).text().trim();
            const company = card.find('[data-testid="company-name"]').text().trim() || 
                           card.find('.companyName').text().trim() || 'Unknown';
            const location = card.find('[data-testid="job-location"]').text().trim() || 'Remote';
            const link = 'https://indeed.com' + ($(elem).closest('a').attr('href') || '');
            
            if (title && company) {
                jobs.push({
                    job_id: `indeed-${Date.now()}-${i}`,
                    title,
                    company,
                    location,
                    application_url: link,
                    description: title,
                    source: 'Indeed',
                    posted_date: new Date().toISOString()
                });
            }
        });
        
        console.log(`  Found ${jobs.length} jobs on Indeed`);
    } catch (error) {
        console.error('  Indeed scrape failed:', error.message);
    }
    
    return jobs;
}

module.exports = { scrapeIndeed };
