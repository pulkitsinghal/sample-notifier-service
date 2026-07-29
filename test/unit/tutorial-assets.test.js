import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function readPublicAsset(name) {
  return readFile(path.join(repositoryRoot, "public", name), "utf8");
}

test("tutorial page keeps its durable-notification teaching surface intact", async () => {
  const html = await readPublicAsset("index.html");

  for (const snippet of [
    '<form id="task-form">',
    'id="task-message"',
    'maxlength="120"',
    '<ol id="task-list" class="task-list" aria-live="polite">',
    '<template id="task-template">',
    '<button class="task__ack" type="button"',
  ]) {
    assert.match(html, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(html, /<script src="\/socket\.io\/socket\.io\.js"><\/script>/);
  assert.match(html, /<script src="\/app\.js"><\/script>/);
  assert.match(html, /Start a job\. Leave the page\. Come back to the result\./);
});

test("tutorial client stays same-origin and does not embed production endpoints", async () => {
  const client = await readPublicAsset("app.js");

  assert.doesNotMatch(client, /https?:\/\//i);
  assert.match(client, /fetch\("\/api\/tasks"/);
  assert.match(client, /io\(\{\s*transports: \["websocket"\]/s);
  assert.match(client, /localStorage/);
});
