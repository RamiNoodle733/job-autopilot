const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const ApplicationTracker = require('../application-tracker');

const tempDb = path.join(os.tmpdir(), `applications-${Date.now()}.db`);

test('application tracker records and updates jobs', async () => {
  const tracker = new ApplicationTracker({ dbPath: tempDb });
  const result = await tracker.addJob({
    job_url: 'https://boards.greenhouse.io/example/jobs/123',
    platform: 'greenhouse',
    company: 'Example',
    title: 'Engineer',
    location: 'Remote',
  });

  assert.ok(result.jobId);
  await tracker.updateJob(result.jobId, { status: 'prepared', notes: 'Ready' });
  const job = await tracker.getJob(result.jobId);
  assert.equal(job.status, 'prepared');
  tracker.close();
});
