import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createEvidenceCollector } from "../scripts/motion-evidence-collector.mjs";

const startCollector = async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "motionops-collector-"));
  const server = createEvidenceCollector({ repoRoot });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    repoRoot,
    baseUrl,
    close: async () => {
      server.close();
      await once(server, "close");
      await rm(repoRoot, { recursive: true, force: true });
    }
  };
};

const validRequest = (overrides = {}) => ({
  testCaseId: "R04",
  command: "READ_MOTION_DATA",
  filename: "R04-multi-property-read-motion-data.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 2,
    runId: "p006-test-abcdef",
    testCaseId: "R04",
    command: "READ_MOTION_DATA",
    raw: { ok: true }
  },
  ...overrides
});

const validP007Request = (overrides = {}) => ({
  testCaseId: "W01",
  command: "TEST_MANUAL_TRACK_WRITE",
  filename: "p007-test-abcdef-W01-noop-round-trip.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p007-test-abcdef",
    caseId: "W01",
    result: { status: "PASS" }
  },
  ...overrides
});

const validP008Request = (overrides = {}) => ({
  testCaseId: "S01",
  command: "TEST_STYLE_UPDATE",
  filename: "p008-test-abcdef-S01-noop-reapply.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p008-test-abcdef",
    caseId: "S01",
    result: { status: "PASS" }
  },
  ...overrides
});

const validP009Request = (overrides = {}) => ({
  testCaseId: "T01",
  command: "TEST_TIMELINE_DURATION",
  filename: "p009-test-abcdef-T01-noop-duration-write.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p009-test-abcdef",
    caseId: "T01",
    result: { status: "PASS" }
  },
  ...overrides
});

const validP010Request = (overrides = {}) => ({
  testCaseId: "U01",
  command: "TEST_UNDO_BOUNDARY",
  filename: "p010-test-abcdef-U01-one-manual-write-one-undo.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p010-test-abcdef",
    caseId: "U01",
    result: { status: "PASS" }
  },
  ...overrides
});

const validP011Request = (overrides = {}) => ({
  testCaseId: "C01",
  command: "TEST_COMPONENT_INSTANCE_MATRIX",
  filename: "p011-test-abcdef-C01-control-frame-baseline.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p011-test-abcdef",
    caseId: "C01",
    result: { status: "PASS" }
  },
  ...overrides
});

const validP012Request = (overrides = {}) => ({
  testCaseId: "CP01",
  command: "TEST_COMPONENT_PROPERTY_TRACK",
  filename: "p012-test-abcdef-CP01-discover-definitions.json",
  overwrite: true,
  payload: {
    evidenceSchemaVersion: 1,
    runId: "p012-test-abcdef",
    caseId: "CP01",
    result: { status: "PASS" }
  },
  ...overrides
});

test("collector health and valid write", async () => {
  const collector = await startCollector();
  try {
    const health = await fetch(`${collector.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequest())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.relativePath, "test-results/R04-multi-property-read-motion-data.json");
    assert.equal(body.sha256.length, 64);
    const saved = JSON.parse(
      await readFile(path.join(collector.repoRoot, body.relativePath), "utf8")
    );
    assert.equal(saved.testCaseId, "R04");
    assert.equal(saved.evidenceSchemaVersion, 2);
  } finally {
    await collector.close();
  }
});

test("collector supports deterministic overwrite and rejects duplicates without overwrite", async () => {
  const collector = await startCollector();
  try {
    const first = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequest({ overwrite: false }))
    });
    assert.equal(first.status, 200);
    const duplicate = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequest({ overwrite: false }))
    });
    assert.equal(duplicate.status, 409);
    const overwrite = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequest({ overwrite: true, payload: { evidenceSchemaVersion: 2, runId: "p006-test-abcdef", testCaseId: "R04", updated: true } }))
    });
    assert.equal(overwrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector rejects invalid filename, traversal, unknown test, invalid json, and oversized body", async () => {
  const collector = await startCollector();
  try {
    for (const request of [
      validRequest({ filename: "manual.json" }),
      validRequest({ filename: "../R04-multi-property-read-motion-data.json" }),
      validRequest({ filename: "C:\\tmp\\R04-multi-property-read-motion-data.json" }),
      validRequest({ testCaseId: "R99" }),
      validRequest({ payload: { testCaseId: "R04" } })
    ]) {
      const response = await fetch(`${collector.baseUrl}/api/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      assert.equal(response.status, 400);
    }

    const invalidJson = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalidJson.status, 400);

    try {
      const oversized = await fetch(`${collector.baseUrl}/api/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(1_000_001)
      });
      assert.equal(oversized.status, 413);
    } catch (error) {
      assert.match(String(error), /fetch failed/);
    }
  } finally {
    await collector.close();
  }
});

test("collector writes run manifests", async () => {
  const collector = await startCollector();
  try {
    const manifest = {
      runId: "p006-test-abcdef",
      evidenceSchemaVersion: 2,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      testIds: ["R01"],
      evidenceFiles: [],
      accepted: false,
      targetPipeline: null
    };
    const response = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p006-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.relativePath, "test-results/p006-test-abcdef.manifest.json");
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-007 replacement evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP007Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p007-test-abcdef-W01-noop-round-trip.json");

    const manifest = {
      runId: "p007-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["W01"],
      evidenceFiles: ["p007-test-abcdef-W01-noop-round-trip.json"],
      accepted: true
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p007-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-008 style evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP008Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p008-test-abcdef-S01-noop-reapply.json");

    const manifest = {
      runId: "p008-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["S01"],
      evidenceFiles: ["p008-test-abcdef-S01-noop-reapply.json"],
      accepted: true,
      classification: "supported"
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p008-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-009 timeline-duration evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP009Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p009-test-abcdef-T01-noop-duration-write.json");

    const manifest = {
      runId: "p009-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["T01"],
      evidenceFiles: ["p009-test-abcdef-T01-noop-duration-write.json"],
      accepted: true,
      classification: "supported"
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p009-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-010 undo-boundary evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP010Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p010-test-abcdef-U01-one-manual-write-one-undo.json");

    const manifest = {
      runId: "p010-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["U01"],
      evidenceFiles: ["p010-test-abcdef-U01-one-manual-write-one-undo.json"],
      accepted: true,
      classification: "supported"
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p010-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-011 component-instance evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP011Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p011-test-abcdef-C01-control-frame-baseline.json");

    const manifest = {
      runId: "p011-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["C01"],
      evidenceFiles: ["p011-test-abcdef-C01-control-frame-baseline.json"],
      accepted: true,
      classification: "supported"
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p011-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector accepts P0-012 component-property evidence and manifests", async () => {
  const collector = await startCollector();
  try {
    const write = await fetch(`${collector.baseUrl}/api/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validP012Request())
    });
    const body = await write.json();
    assert.equal(write.status, 200);
    assert.equal(body.relativePath, "test-results/p012-test-abcdef-CP01-discover-definitions.json");

    const manifest = {
      runId: "p012-test-abcdef",
      evidenceSchemaVersion: 1,
      build: "lab",
      startedAt: "2026-07-13T00:00:00.000Z",
      finishedAt: "2026-07-13T00:00:01.000Z",
      caseIds: ["CP01"],
      evidenceFiles: ["p012-test-abcdef-CP01-discover-definitions.json"],
      accepted: true,
      classification: "mixed"
    };
    const manifestWrite = await fetch(`${collector.baseUrl}/api/run-manifest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: manifest.runId,
        filename: "p012-test-abcdef.manifest.json",
        overwrite: true,
        payload: manifest
      })
    });
    assert.equal(manifestWrite.status, 200);
  } finally {
    await collector.close();
  }
});

test("collector answers CORS preflight", async () => {
  const collector = await startCollector();
  try {
    const response = await fetch(`${collector.baseUrl}/api/evidence`, { method: "OPTIONS" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    await collector.close();
  }
});
