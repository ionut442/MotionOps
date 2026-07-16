import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const releaseRoot = join(process.cwd(), "dist", "release-candidate");
const packageRoot = join(releaseRoot, "motionops-plugin");

const filesUnder = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return filesUnder(full);
      return [full];
    })
  );
  return nested.flat().sort();
};

test("release candidate package contains only production plugin artifacts", async () => {
  const files = (await filesUnder(packageRoot)).map((file) => file.replace(packageRoot, "").replaceAll("\\", "/").replace(/^\//, ""));
  assert.deepEqual(files, ["dist/index.html", "dist/plugin.js", "manifest.json"]);

  const manifest = JSON.parse(await readFile(join(packageRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.main, "dist/plugin.js");
  assert.equal(manifest.ui, "dist/index.html");
  assert.equal(manifest.documentAccess, "dynamic-page");
  assert.deepEqual(manifest.networkAccess.allowedDomains, ["none"]);

  const html = await readFile(join(packageRoot, "dist", "index.html"), "utf8");
  const plugin = await readFile(join(packageRoot, "dist", "plugin.js"), "utf8");
  assert.equal(/src=["']\/assets\//.test(html), false);
  assert.equal(/href=["']\/assets\//.test(html), false);
  assert.equal(html.includes("Run all tests"), false);
  assert.equal(/sourceMappingURL|__MOTIONOPS_P0_|motion-evidence-collector|localhost:3847|127\.0\.0\.1:3847|LIVE_TEST_RUNNER_START|__MOTIONOPS_LIVE_TEST_SANDBOX__/i.test(plugin), false);
});

test("release candidate inventory and checksums describe package files", async () => {
  const inventory = JSON.parse(await readFile(join(releaseRoot, "inventory.json"), "utf8"));
  const checksums = await readFile(join(releaseRoot, "SHA256SUMS.txt"), "utf8");
  assert.equal(inventory.status, "release-candidate");
  assert.equal(inventory.liveFigmaGate, "blocked");
  assert.deepEqual(
    inventory.files.map((file) => file.path).sort(),
    ["dist/index.html", "dist/plugin.js", "manifest.json"]
  );
  for (const file of inventory.files) {
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.equal(file.bytes, (await stat(join(packageRoot, file.path))).size);
    assert.equal(checksums.includes(`motionops-plugin/${file.path}`), true);
  }
});
