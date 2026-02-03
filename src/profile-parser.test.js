const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProfileMarkdown } = require('./profile-parser');

const SAMPLE = `# Profile

## Contact Information
- **Name:** Jane Doe
- **Location:** Remote
- **Email:** jane@example.com
- **Phone:** 123-456-7890
- **LinkedIn:** linkedin.com/in/janedoe
- **GitHub:** github.com/janedoe
`;

test('parseProfileMarkdown extracts contact fields', () => {
  const profile = parseProfileMarkdown(SAMPLE);
  assert.equal(profile.name, 'Jane Doe');
  assert.equal(profile.location, 'Remote');
  assert.equal(profile.email, 'jane@example.com');
  assert.equal(profile.phone, '123-456-7890');
  assert.equal(profile.linkedin, 'linkedin.com/in/janedoe');
  assert.equal(profile.github, 'github.com/janedoe');
});
