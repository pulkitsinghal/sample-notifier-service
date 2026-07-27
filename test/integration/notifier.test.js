import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { io as createSocketClient } from "socket.io-client";

import { createNotifierApi } from "../../src/api.js";
import { createTaskWorker } from "../../src/worker.js";

const redisUrl = process.env.TEST_REDIS_URL;
const integrationTest = redisUrl ? test : test.skip;

const logger = {
  error() {},
  warn() {},
};

function baseUrl(address) {
  return `http://127.0.0.1:${address.port}`;
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function establishSession(url) {
  const response = await fetch(`${url}/api/session`);
  assert.equal(response.status, 204);
  return cookieFrom(response);
}

function waitForSocket(socket, eventName, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 5000);

    function onEvent(value) {
      if (predicate(value)) {
        cleanup();
        resolve(value);
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function cleanup() {
      clearTimeout(timeout);
      socket.off(eventName, onEvent);
      socket.off("connect_error", onError);
    }

    socket.on(eventName, onEvent);
    socket.on("connect_error", onError);
  });
}

async function waitForCompleted(url, cookie, taskId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/api/tasks/${taskId}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    const task = await response.json();
    if (task.status === "completed") {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Task did not complete");
}

integrationTest(
  "cross-instance notifications are fast and missed events are recoverable",
  async (context) => {
    const suffix = randomUUID().replaceAll("-", "");
    const shared = {
      redisUrl,
      queueName: `notifier-${suffix}`,
      eventChannel: `notifier-${suffix}:events`,
      sessionSecret: "integration-test-secret-that-is-at-least-32-bytes",
      publicOrigin: null,
      isProduction: false,
      logger,
    };

    const apiOne = await createNotifierApi({ ...shared, port: 0 });
    const apiTwo = await createNotifierApi({ ...shared, port: 0 });
    const worker = await createTaskWorker({
      ...shared,
      taskDelayMs: 40,
      workerConcurrency: 2,
    });
    const firstUrl = baseUrl(await apiOne.start());
    const secondUrl = baseUrl(await apiTwo.start());

    const sessionCookie = await establishSession(firstUrl);
    const socket = createSocketClient(secondUrl, {
      autoConnect: false,
      extraHeaders: {
        Cookie: sessionCookie,
        Origin: secondUrl,
      },
      transports: ["websocket"],
    });

    context.after(async () => {
      socket.disconnect();
      await apiOne.queue.obliterate({ force: true });
      await Promise.all([
        worker.close(),
        apiOne.close(),
        apiTwo.close(),
      ]);
    });

    const connected = waitForSocket(socket, "connect");
    socket.connect();
    await connected;

    const completionEvent = waitForSocket(
      socket,
      "task:update",
      (event) => event.status === "completed",
    );
    const createResponse = await fetch(`${firstUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        Origin: firstUrl,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "cross-instance task" }),
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json();

    const event = await completionEvent;
    assert.equal(event.taskId, created.taskId);
    assert.equal(event.result.summary, "Finished: cross-instance task");

    const task = await waitForCompleted(
      firstUrl,
      sessionCookie,
      created.taskId,
    );
    assert.equal(task.result.summary, "Finished: cross-instance task");

    const otherSession = await establishSession(firstUrl);
    const unauthorized = await fetch(
      `${firstUrl}/api/tasks/${created.taskId}`,
      { headers: { Cookie: otherSession } },
    );
    assert.equal(unauthorized.status, 404);

    const rejectedOrigin = await fetch(`${firstUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        Origin: "https://attacker.invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "blocked" }),
    });
    assert.equal(rejectedOrigin.status, 403);

    socket.disconnect();
    const missedResponse = await fetch(`${firstUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        Origin: firstUrl,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "finish while disconnected" }),
    });
    assert.equal(missedResponse.status, 202);
    const missed = await missedResponse.json();

    const recovered = await waitForCompleted(
      secondUrl,
      sessionCookie,
      missed.taskId,
    );
    assert.equal(recovered.result.summary, "Finished: finish while disconnected");
  },
);

integrationTest(
  "worker failures use the configured exponential retry policy",
  async (context) => {
    const suffix = randomUUID().replaceAll("-", "");
    const shared = {
      redisUrl,
      queueName: `notifier-retry-${suffix}`,
      eventChannel: `notifier-retry-${suffix}:events`,
      sessionSecret: "retry-test-secret-that-is-at-least-32-bytes",
      publicOrigin: null,
      isProduction: false,
      logger,
    };
    let processorCalls = 0;

    const api = await createNotifierApi({ ...shared, port: 0 });
    const worker = await createTaskWorker({
      ...shared,
      processor: async (job) => {
        processorCalls += 1;
        if (processorCalls < 3) {
          throw new Error("synthetic retryable failure");
        }
        return {
          summary: `Recovered: ${job.data.message}`,
          completedAt: new Date().toISOString(),
        };
      },
      workerConcurrency: 1,
    });
    const url = baseUrl(await api.start());

    context.after(async () => {
      await worker.close();
      await api.queue.obliterate({ force: true });
      await api.close();
    });

    const sessionCookie = await establishSession(url);
    const createResponse = await fetch(`${url}/api/tasks`, {
      method: "POST",
      headers: {
        Cookie: sessionCookie,
        Origin: url,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "retryable task" }),
    });
    assert.equal(createResponse.status, 202);
    const created = await createResponse.json();

    const task = await waitForCompleted(
      url,
      sessionCookie,
      created.taskId,
    );
    assert.equal(processorCalls, 3);
    assert.equal(task.attemptsMade, 3);
    assert.equal(task.result.summary, "Recovered: retryable task");
  },
);
