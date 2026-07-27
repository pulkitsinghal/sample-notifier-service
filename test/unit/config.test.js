import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../src/config.js";

const VALID_ENV = {
  SESSION_SECRET: "a-valid-session-secret-with-32-bytes",
  PUBLIC_ORIGIN: "http://localhost:3000",
};

test("loadConfig applies safe tutorial defaults", () => {
  const config = loadConfig(VALID_ENV);

  assert.equal(config.port, 3000);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.redisUrl, "redis://localhost:6379");
  assert.equal(config.workerConcurrency, 4);
  assert.equal(config.isProduction, false);
});

test("loadConfig requires a sufficiently long session secret", () => {
  assert.throws(
    () => loadConfig({ ...VALID_ENV, SESSION_SECRET: "too-short" }),
    /at least 32 bytes/,
  );
});

test("loadConfig rejects origins with paths", () => {
  assert.throws(
    () =>
      loadConfig({
        ...VALID_ENV,
        PUBLIC_ORIGIN: "https://example.com/a/path",
      }),
    /scheme, host, and optional port/,
  );
});

test("loadConfig validates bounded worker settings", () => {
  assert.throws(
    () => loadConfig({ ...VALID_ENV, WORKER_CONCURRENCY: "0" }),
    /between 1 and 64/,
  );
  assert.throws(
    () => loadConfig({ ...VALID_ENV, TASK_DELAY_MS: "30001" }),
    /between 10 and 30000/,
  );
});

test("loadConfig rejects a non-numeric Redis database", () => {
  assert.throws(
    () => loadConfig({ ...VALID_ENV, REDIS_URL: "redis://localhost/not-a-db" }),
    /database path/,
  );
});

test("loadConfig requires HTTPS in production", () => {
  assert.throws(
    () => loadConfig({ ...VALID_ENV, NODE_ENV: "production" }),
    /must use https/,
  );
  assert.equal(
    loadConfig({
      ...VALID_ENV,
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://notifier.example",
    }).isProduction,
    true,
  );
});
