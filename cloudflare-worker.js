/**
 * Cloudflare Worker - Telegram Bot Webhook Handler
 * 
 * This receives Telegram messages and triggers GitHub Actions.
 * 
 * SETUP:
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste this code
 * 3. Add environment variables (Settings → Variables):
 *    - TELEGRAM_BOT_TOKEN: Your bot token from @BotFather
 *    - GH_PAT: Personal access token with 'repo' scope
 *    - TELEGRAM_CHAT_ID: Your chat ID (for security - only respond to you)
 * 4. Deploy and copy the worker URL
 * 5. Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>
 */

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Job Autopilot Bot 🤖', { status: 200 });
    }

    try {
      const update = await request.json();
      const message = update.message;

      if (!message || !message.text) {
        return new Response('OK', { status: 200 });
      }

      const chatId = message.chat.id.toString();
      const text = message.text.trim();

      // Security: Only respond to your chat ID
      if (env.TELEGRAM_CHAT_ID && chatId !== env.TELEGRAM_CHAT_ID) {
        console.log('Unauthorized chat ID:', chatId);
        return new Response('OK', { status: 200 });
      }

      // Handle commands
      if (text.startsWith('/')) {
        return handleCommand(text, chatId, env);
      }

      // Parse job search: "AI Product Manager, Houston TX" or "AI Product Manager | Houston TX"
      const parts = text.split(/[,|]/).map(s => s.trim());
      
      if (parts.length >= 2) {
        const query = parts[0];
        const location = parts.slice(1).join(', ');
        return triggerJobSearch(query, location, chatId, env, 'linkedin');
      } else if (parts.length === 1 && parts[0].length > 3) {
        // Just a query, use default location
        return triggerJobSearch(parts[0], 'Remote', chatId, env, 'linkedin');
      }

      // Help message
      return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, `
🤖 <b>Ultimate Job Autopilot</b>

<b>Quick Apply (LinkedIn):</b>
<code>Software Engineer, Austin TX</code>

<b>Choose Platform:</b>
/linkedin [query]
/indeed [query]
/all [query] - Apply everywhere!

<b>Commands:</b>
/status - Check running jobs
/stop - Cancel current run
/help - Show all options
      `);

    } catch (error) {
      console.error('Error:', error);
      return new Response('Error', { status: 500 });
    }
  }
};

async function handleCommand(text, chatId, env) {
  const parts = text.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/start':
    case '/help':
      return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, `
🤖 <b>Ultimate Job Autopilot Bot</b>

<b>Quick Apply:</b>
<code>Software Engineer, Austin TX</code>

<b>Choose Platform:</b>
<code>/linkedin Software Engineer</code>
<code>/indeed Frontend Developer, Remote</code>
<code>/all Full Stack, NYC</code>

<b>Commands:</b>
/linkedin [query] - Apply via LinkedIn
/indeed [query] - Apply via Indeed
/all [query] - Apply everywhere!
/status - Check running jobs
/stop - Cancel current run
      `);

    case '/linkedin':
      const linkedinQuery = parts.slice(1).join(' ') || 'software engineer';
      return triggerJobSearch(linkedinQuery, 'Remote', chatId, env, 'linkedin');

    case '/indeed':
      const indeedQuery = parts.slice(1).join(' ') || 'software engineer';
      return triggerJobSearch(indeedQuery, 'Remote', chatId, env, 'indeed');
    
    case '/all':
      const allQuery = parts.slice(1).join(' ') || 'software engineer';
      return triggerJobSearch(allQuery, 'Remote', chatId, env, 'all');

    case '/status':
      return checkWorkflowStatus(chatId, env);

    case '/stop':
      return cancelWorkflow(chatId, env);

    case '/recent':
      return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, 
        '📋 Check recent runs at:\nhttps://github.com/RamiNoodle733/job-autopilot/actions');

    default:
      return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, 
        '❓ Unknown command. Send /help for options.');
  }
}

async function triggerJobSearch(query, location, chatId, env, platform = 'linkedin') {
  const platformEmoji = {
    'linkedin': '🔗',
    'indeed': '💼',
    'all': '🚀'
  }[platform] || '🔍';

  // Send confirmation
  await sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, `
${platformEmoji} <b>Starting Job Search!</b>

🔍 Query: <code>${query}</code>
📍 Location: <code>${location}</code>
📱 Platform: <code>${platform}</code>

I'll notify you when applications are submitted...
  `);

  // Trigger GitHub Actions
  const response = await fetch(
    'https://api.github.com/repos/RamiNoodle733/job-autopilot/dispatches',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Job-Autopilot-Bot'
      },
      body: JSON.stringify({
        event_type: 'telegram_trigger',
        client_payload: {
          query: query,
          location: location,
          chat_id: chatId,
          platform: platform
        }
      })
    }
  );

  if (response.status === 204) {
    return new Response('OK', { status: 200 });
  } else {
    const error = await response.text();
    console.error('GitHub API error:', error);
    await sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, 
      '❌ Failed to start job search. Check GitHub token permissions.');
    return new Response('Error', { status: 500 });
  }
}

async function checkWorkflowStatus(chatId, env) {
  const response = await fetch(
    'https://api.github.com/repos/RamiNoodle733/job-autopilot/actions/runs?per_page=1',
    {
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Job-Autopilot-Bot'
      }
    }
  );

  const data = await response.json();
  const run = data.workflow_runs?.[0];

  if (!run) {
    return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, '📭 No recent runs found.');
  }

  const statusEmoji = {
    'completed': run.conclusion === 'success' ? '✅' : '❌',
    'in_progress': '🔄',
    'queued': '⏳',
    'pending': '⏳'
  }[run.status] || '❓';

  return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, `
${statusEmoji} <b>Latest Run</b>

Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}
Started: ${new Date(run.created_at).toLocaleString()}

🔗 <a href="${run.html_url}">View Details</a>
  `);
}

async function cancelWorkflow(chatId, env) {
  // Get the latest in-progress run
  const response = await fetch(
    'https://api.github.com/repos/RamiNoodle733/job-autopilot/actions/runs?status=in_progress&per_page=1',
    {
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Job-Autopilot-Bot'
      }
    }
  );

  const data = await response.json();
  const run = data.workflow_runs?.[0];

  if (!run) {
    return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, '📭 No running jobs to cancel.');
  }

  // Cancel it
  await fetch(
    `https://api.github.com/repos/RamiNoodle733/job-autopilot/actions/runs/${run.id}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Job-Autopilot-Bot'
      }
    }
  );

  return sendTelegram(chatId, env.TELEGRAM_BOT_TOKEN, '🛑 Cancelling current run...');
}

async function sendTelegram(chatId, token, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  return new Response('OK', { status: 200 });
}
