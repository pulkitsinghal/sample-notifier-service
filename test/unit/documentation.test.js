import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const requiredDocuments = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "docs/architecture.md",
  "docs/migration.md",
  "docs/privacy.md",
  "docs/production.md",
  "docs/tutorial.md",
];

async function readDocument(name) {
  return readFile(path.join(repositoryRoot, name), "utf8");
}

test("adoption documentation includes migration, rollback, privacy, and security boundaries", async () => {
  const [readme, migration, privacy, security, changelog] = await Promise.all([
    readDocument("README.md"),
    readDocument("docs/migration.md"),
    readDocument("docs/privacy.md"),
    readDocument("SECURITY.md"),
    readDocument("CHANGELOG.md"),
  ]);

  for (const link of [
    "docs/migration.md",
    "docs/privacy.md",
    "SECURITY.md",
    "CHANGELOG.md",
  ]) {
    assert.match(readme, new RegExp(`\\(${link.replace(".", "\\.")}\\)`));
  }

  assert.match(migration, /^## Compatibility boundary$/m);
  assert.match(migration, /^## Cutover$/m);
  assert.match(migration, /^## Rollback$/m);
  assert.match(migration, /Do \*\*not\*\* roll production traffic back to the 2016 stack/);
  assert.match(privacy, /^## Data inventory$/m);
  assert.match(privacy, /Use synthetic,\s+non-sensitive messages/s);
  assert.match(security, /^## Report a vulnerability$/m);
  assert.match(changelog, /^## 2\.0\.0 - 2026-07-27$/m);
});

test("local links in repository Markdown resolve", async () => {
  const docsDirectory = path.join(repositoryRoot, "docs");
  const documentationFiles = [
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    ...(await readdir(docsDirectory))
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join("docs", name)),
  ];
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  for (const document of documentationFiles) {
    const body = await readDocument(document);
    for (const match of body.matchAll(linkPattern)) {
      const target = match[1];
      if (
        target.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
      ) {
        continue;
      }

      const decodedPath = decodeURIComponent(target.split(/[?#]/, 1)[0]);
      const resolved = decodedPath.startsWith("/")
        ? path.join(repositoryRoot, decodedPath)
        : path.resolve(repositoryRoot, path.dirname(document), decodedPath);
      await assert.doesNotReject(
        access(resolved),
        `${document} links to missing local path ${target}`,
      );
    }
  }

  assert.deepEqual(
    [...new Set(requiredDocuments)].sort(),
    requiredDocuments.slice().sort(),
  );
  await Promise.all(
    requiredDocuments.map((document) =>
      assert.doesNotReject(
        access(path.join(repositoryRoot, document)),
        `required document is missing: ${document}`,
      ),
    ),
  );
});
