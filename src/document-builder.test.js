const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const { buildCoverLetter } = require('./document-builder');

const job = {
  company: 'Example Co',
  location: 'Remote',
  title: 'Engineer',
};

const profile = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '123-456-7890',
};

test('buildCoverLetter writes file with placeholders replaced', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-'));
  const file = await buildCoverLetter(job, dir, profile);
  const content = await fs.readFile(file, 'utf-8');
  assert.ok(content.includes('Example Co'));
  assert.ok(content.includes('Engineer'));
  assert.ok(content.includes('Jane Doe'));
});
