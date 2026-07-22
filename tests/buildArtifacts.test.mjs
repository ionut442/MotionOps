import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("production UI artifact keeps Phase 0 lab controls and collector out of the shell", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const plugin = await readFile("dist/plugin.js", "utf8");
  assert.equal(plugin.includes("http://127.0.0.1:3847/api/evidence"), false);
  assert.equal(plugin.includes("Motion API Lab is disabled in this build."), true);
  assert.equal(html.includes("Motion API Lab"), false);
  assert.equal(html.includes("Run all tests"), false);
  assert.equal(html.includes("Create/Refresh P0-"), false);
  assert.equal(html.includes("http://127.0.0.1:3847/api/evidence"), false);
  assert.equal(plugin.includes("LIVE_TEST_RUNNER_START"), false);
  assert.equal(plugin.includes("__MOTIONOPS_LIVE_TEST_SANDBOX__"), false);
});

test("UI build artifact contains the production shell and resize contract", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const plugin = await readFile("dist/plugin.js", "utf8");
  assert.equal(html.includes("MotionOps"), true);
  assert.equal(html.includes("Choose layers"), true);
  assert.equal(html.includes("Read motion"), true);
  assert.equal(html.includes("Tune & reuse"), true);
  assert.equal(html.includes("Arrange timing"), true);
  assert.equal(html.includes("QA & handoff"), true);
  assert.equal(html.includes("RESIZE_PLUGIN_WINDOW"), true);
  assert.equal(html.includes("Resize plugin window"), true);
  assert.equal(html.includes("Refresh"), true);
  assert.equal(plugin.includes("__html__"), false);
  assert.equal(plugin.includes("Resize plugin window"), true);
  assert.equal(plugin.includes("MotionOps"), true);
  assert.equal(html.includes("Connected"), false);
  assert.equal(html.includes("No plugin message"), false);
  assert.equal(html.includes("No resize request"), false);
  assert.equal(html.includes("No selection"), false);
  assert.equal(html.includes("0 targets"), false);
  assert.equal(html.includes("Context region"), false);
  assert.equal(html.includes("Coming soon"), false);
  assert.equal(html.includes("change plan"), false);
});

test("production artifacts contain no enabled analytics or licensing provider", async () => {
  const html = await readFile("dist/index.html", "utf8");
  const plugin = await readFile("dist/plugin.js", "utf8");
  assert.equal(html.includes("fully verified browser and desktop parity"), false);
  assert.equal(/navigator\.sendBeacon|XMLHttpRequest|localhost:3847|127\.0\.0\.1:3847|\/api\/|analytics are enabled/i.test(html), false);
  assert.equal(/navigator\.sendBeacon|XMLHttpRequest|localhost:3847|127\.0\.0\.1:3847|\/api\/|analytics provider|billing provider|subscription system|payment UI/i.test(plugin), false);
});
