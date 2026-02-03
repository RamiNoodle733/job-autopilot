const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultRegistry } = require('./index');

test('registry selects adapter for known URLs', () => {
  const registry = createDefaultRegistry();
  const greenhouse = registry.getJobSourceForUrl('https://boards.greenhouse.io/example/jobs/123');
  const lever = registry.getJobSourceForUrl('https://jobs.lever.co/example/abc');
  const workday = registry.getJobSourceForUrl('https://example.wd5.myworkdayjobs.com/en-US/jobs/job/abc');

  assert.ok(greenhouse);
  assert.ok(lever);
  assert.ok(workday);
});
