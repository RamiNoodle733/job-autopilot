/**
 * Telegram Notifier - Send job application updates to Telegram
 * 
 * Setup:
 * 1. Message @BotFather on Telegram, send /newbot
 * 2. Get your bot token
 * 3. Message your bot, then visit: https://api.telegram.org/bot<TOKEN>/getUpdates
 * 4. Find your chat_id in the response
 * 5. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to GitHub secrets
 */

const https = require('https');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message to Telegram
 */
async function sendMessage(text, parseMode = 'HTML') {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID, skipping notification');
        return false;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: true
    });

    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('[Telegram] Message sent successfully');
                    resolve(true);
                } else {
                    console.error('[Telegram] Failed to send:', data);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Telegram] Error:', err.message);
            resolve(false);
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Notify that job search is starting
 */
async function notifyStarting(query, location, limit) {
    const message = `
🚀 <b>Job Autopilot Starting!</b>

🔍 <b>Search:</b> ${query}
📍 <b>Location:</b> ${location}
🎯 <b>Max applications:</b> ${limit}

<i>I'll notify you as applications are submitted...</i>
    `.trim();
    return sendMessage(message);
}

/**
 * Notify login status
 */
async function notifyLogin(success, method = 'cookies') {
    if (success) {
        return sendMessage(`🔐 Logged into LinkedIn (${method})`);
    } else {
        return sendMessage(`⚠️ LinkedIn login required - check browser`);
    }
}

/**
 * Notify jobs found
 */
async function notifyJobsFound(count, query) {
    return sendMessage(`🔎 Found <b>${count}</b> Easy Apply jobs for "${query}"`);
}

/**
 * Notify progress
 */
async function notifyProgress(current, total, successCount, failCount) {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
    
    return sendMessage(`
📊 <b>Progress: ${current}/${total}</b>

${bar} ${percent}%

✅ Submitted: ${successCount}
❌ Failed: ${failCount}
    `.trim());
}

/**
 * Notify error
 */
async function notifyError(error, context = '') {
    return sendMessage(`
❌ <b>Error${context ? ` in ${context}` : ''}</b>

<code>${error}</code>
    `.trim());
}

/**
 * Notify skipped job
 */
async function notifySkipped(job, reason) {
    const reasons = {
        'already_applied': '⏭️ Already applied',
        'not_easy_apply': '⏭️ Not Easy Apply',
        'external': '⏭️ External application'
    };
    return sendMessage(`${reasons[reason] || '⏭️ Skipped'}: ${job.title} @ ${job.company}`);
}

/**
 * Send job application notification
 */
async function sendTelegramNotification(status, output = '') {
    const timestamp = new Date().toLocaleString('en-US', { 
        timeZone: 'America/Chicago',
        dateStyle: 'short',
        timeStyle: 'short'
    });

    // Parse output for stats
    const appliedMatch = output.match(/Applied to (\d+)/i) || output.match(/Successfully applied.*?(\d+)/i);
    const appliedCount = appliedMatch ? appliedMatch[1] : '?';
    
    const failedMatch = output.match(/Failed.*?(\d+)/i) || output.match(/(\d+).*failed/i);
    const failedCount = failedMatch ? failedMatch[1] : '0';

    let emoji, statusText;
    if (status === 'success') {
        emoji = '✅';
        statusText = 'Completed';
    } else if (status === 'failure') {
        emoji = '❌';
        statusText = 'Failed';
    } else {
        emoji = '⚠️';
        statusText = status;
    }

    const message = `
${emoji} <b>Job Autopilot ${statusText}</b>

📊 <b>Results:</b>
• Applications submitted: ${appliedCount}
• Failed: ${failedCount}

🕐 <i>${timestamp}</i>

<code>${output.slice(-500)}</code>
    `.trim();

    return sendMessage(message);
}

/**
 * Send a simple status update
 */
async function sendStatusUpdate(text) {
    const timestamp = new Date().toLocaleString('en-US', { 
        timeZone: 'America/Chicago',
        timeStyle: 'short'
    });
    return sendMessage(`🤖 <b>Job Autopilot</b>\n\n${text}\n\n<i>${timestamp}</i>`);
}

/**
 * Send notification when a job application is submitted
 */
async function notifyApplicationSubmitted(job) {
    const message = `
🎯 <b>Application Submitted!</b>

<b>${job.title}</b>
🏢 ${job.company}
📍 ${job.location || 'Remote'}
${job.url ? `\n🔗 <a href="${job.url}">View Job</a>` : ''}
    `.trim();
    
    return sendMessage(message);
}

module.exports = {
    sendMessage,
    sendTelegramNotification,
    sendStatusUpdate,
    notifyApplicationSubmitted,
    notifyStarting,
    notifyLogin,
    notifyJobsFound,
    notifyProgress,
    notifyError,
    notifySkipped
};

// If run directly, send test message
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === 'test') {
        sendMessage('🧪 Test message from Job Autopilot!')
            .then(() => console.log('Test complete'))
            .catch(console.error);
    } else {
        // Called from GitHub Actions
        const status = args[0] || 'unknown';
        const output = args[1] || '';
        sendTelegramNotification(status, output);
    }
}
