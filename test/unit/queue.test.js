import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_JOB_OPTIONS,
  redisConnectionOptions,
} from "../../src/queue.js";

test("jobs use bounded retries and retention", () => {
  assert.deepEqual(DEFAULT_JOB_OPTIONS.backoff, {
    type: "exponential",
    delay: 500,
  });
  assert.equal(DEFAULT_JOB_OPTIONS.attempts, 3);
  assert.equal(DEFAULT_JOB_OPTIONS.removeOnComplete.age, 3600);
});

test("Redis URL parsing preserves credentials without logging them", () => {
  const options = redisConnectionOptions(
    "rediss://queue-user:p%40ss@example.test:6380/2",
  );

  assert.equal(options.host, "example.test");
  assert.equal(options.port, 6380);
  assert.equal(options.username, "queue-user");
  assert.equal(options.password, "p@ss");
  assert.equal(options.db, 2);
  assert.deepEqual(options.tls, {});
  assert.equal(options.maxRetriesPerRequest, null);
});
