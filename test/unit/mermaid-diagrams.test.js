import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Every Markdown file we ship diagrams in. GitHub renders ```mermaid``` fences
// with mermaid >= 11; a fence that does not parse degrades to a raw code block
// (or an error box) instead of a diagram, so a broken fence is a visible defect.
async function markdownFiles() {
  const docs = (await readdir(path.join(repositoryRoot, "docs")))
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join("docs", name));
  return ["README.md", "CHANGELOG.md", "SECURITY.md", ...docs];
}

function extractMermaidFences(body) {
  const fences = [];
  const pattern = /```mermaid\r?\n([\s\S]*?)```/g;
  for (const match of body.matchAll(pattern)) {
    const content = match[1];
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    fences.push({ lines });
  }
  return fences;
}

test("every Mermaid fence declares a recognized diagram type", async () => {
  const known = /^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline)\b/;
  for (const file of await markdownFiles()) {
    const body = await readFile(path.join(repositoryRoot, file), "utf8");
    for (const fence of extractMermaidFences(body)) {
      assert.ok(fence.lines.length > 0, `${file}: empty mermaid fence`);
      assert.match(
        fence.lines[0].trim(),
        known,
        `${file}: mermaid fence must open with a known diagram type, got "${fence.lines[0].trim()}"`,
      );
    }
  }
});

test("sequenceDiagram fences contain no statement-separator that breaks the render", async () => {
  // Mermaid treats ';' as a statement separator, so a ';' inside sequence
  // message text (e.g. "Rate limit identity; index and add durable job") is
  // parsed as the start of a new, invalid statement and the whole diagram
  // fails to render on GitHub. Verified against mermaid 11.16.0: the ';' form
  // raises "Parse error on line 9"; the comma form parses cleanly.
  for (const file of await markdownFiles()) {
    const body = await readFile(path.join(repositoryRoot, file), "utf8");
    for (const fence of extractMermaidFences(body)) {
      if (fence.lines[0].trim() !== "sequenceDiagram") {
        continue;
      }
      for (const line of fence.lines) {
        assert.ok(
          !line.includes(";"),
          `${file}: sequenceDiagram line breaks Mermaid rendering — remove the ';' separator from: ${line.trim()}`,
        );
      }
    }
  }
});

test("README architecture diagram keeps the rendered (comma) form, not the broken semicolon form", async () => {
  const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");
  assert.ok(
    readme.includes("A->>Q: Rate limit identity, index and add durable job"),
    "README should carry the comma form that Mermaid renders",
  );
  assert.ok(
    !readme.includes("Rate limit identity; index"),
    "README must not reintroduce the semicolon that breaks the Mermaid render",
  );
});
