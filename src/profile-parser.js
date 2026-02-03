const fs = require('fs-extra');

function parseContactSection(lines) {
  const contact = {};
  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s+/, '');
    const match = normalized.match(/\*\*([^*]+)\*\*\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().replace(/:$/, '').toLowerCase();
    const value = match[2].trim();
    if (key === 'name') contact.name = value;
    if (key === 'location') contact.location = value;
    if (key === 'email') contact.email = value;
    if (key === 'phone') contact.phone = value;
    if (key === 'linkedin') contact.linkedin = value;
    if (key === 'github') contact.github = value;
  }
  return contact;
}

function parseProfileMarkdown(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const contactStart = lines.findIndex((line) => line.toLowerCase().includes('contact information'));
  const nextHeader = lines.slice(contactStart + 1).findIndex((line) => line.startsWith('## '));
  const contactLines = contactStart >= 0
    ? lines.slice(contactStart + 1, nextHeader === -1 ? undefined : contactStart + 1 + nextHeader)
    : [];

  const contact = parseContactSection(contactLines);

  return {
    name: contact.name || 'Unknown',
    location: contact.location || '',
    email: contact.email || '',
    phone: contact.phone || '',
    linkedin: contact.linkedin || '',
    github: contact.github || '',
    raw: content,
  };
}

async function loadProfile({ profilePath, profileJsonPath } = {}) {
  if (profileJsonPath && await fs.pathExists(profileJsonPath)) {
    const json = await fs.readJson(profileJsonPath);
    return {
      name: `${json.firstName || ''} ${json.lastName || ''}`.trim() || json.name || 'Unknown',
      location: json.location || '',
      email: json.email || '',
      phone: json.phone || '',
      linkedin: json.linkedinHandle || json.linkedin || '',
      github: json.githubHandle || json.github || '',
      raw: json,
    };
  }

  if (!profilePath) {
    throw new Error('profilePath is required when profileJsonPath is unavailable.');
  }

  const content = await fs.readFile(profilePath, 'utf-8');
  return parseProfileMarkdown(content);
}

module.exports = { parseProfileMarkdown, loadProfile };
