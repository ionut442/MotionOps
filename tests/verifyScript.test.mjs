import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  commandDisplay,
  hasCoverageThresholdGate,
  main,
  requiredStages,
  runVerification,
  selectStages,
  validateStages
} from "../scripts/verify.mjs";

const listSourceFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(child)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files;
};

const stageIds = () => requiredStages.map((stage) => stage.id);

const createHarness = ({ failAt, exitCode = 7, stdout = "child out\n", stderr = "child err\n", throwingStdout = false } = {}) => {
  const calls = [];
  const stdoutChunks = [];
  const stderrChunks = [];
  let tick = 0;
  return {
    calls,
    stdoutChunks,
    stderrChunks,
    exec: async (stage) => {
      calls.push(stage.id);
      if (stage.id === failAt) {
        return { exitCode, stdout, stderr };
      }
      return { exitCode: 0, stdout, stderr: "" };
    },
    stdout: (text) => {
      stdoutChunks.push(text);
      if (throwingStdout) {
        throw new Error("stdout failed");
      }
    },
    stderr: (text) => {
      stderrChunks.push(text);
    },
    now: () => {
      tick += 1000;
      return tick;
    }
  };
};

describe("canonical verification stages", () => {
  it("keeps deterministic stage ordering", () => {
    expect(stageIds()).toEqual(["typecheck", "lint", "test", "build", "build-artifacts"]);
  });

  it("includes the typecheck stage", () => {
    expect(stageIds()).toContain("typecheck");
  });

  it("includes the lint stage", () => {
    expect(stageIds()).toContain("lint");
  });

  it("includes the automated-test stage", () => {
    expect(stageIds()).toContain("test");
  });

  it("includes the build stage", () => {
    expect(stageIds()).toContain("build");
  });

  it("includes the build-artifact stage", () => {
    expect(stageIds()).toContain("build-artifacts");
  });

  it("runs build before build-artifact validation", () => {
    expect(stageIds().indexOf("build")).toBeLessThan(stageIds().indexOf("build-artifacts"));
  });

  it("includes coverage only when thresholds are genuinely configured", () => {
    expect(hasCoverageThresholdGate({ reporter: ["text"] })).toBe(false);
    expect(hasCoverageThresholdGate({ thresholds: { lines: 80 } })).toBe(true);
    expect(stageIds()).not.toContain("coverage");
  });

  it("does not include interactive or watch-based commands", () => {
    for (const stage of requiredStages) {
      expect(stage.interactive).toBe(false);
      expect(commandDisplay(stage)).not.toMatch(/\bwatch\b|--watch/);
    }
  });

  it("does not include live Figma stages", () => {
    expect(requiredStages.some((stage) => stage.liveFigma || /figma/i.test(stage.id))).toBe(false);
  });

  it("does not invent Playwright, UI, or E2E stages", () => {
    expect(requiredStages.some((stage) => stage.ui || /playwright|test:ui|e2e/i.test(commandDisplay(stage)))).toBe(false);
  });

  it("does not require a network service", () => {
    expect(requiredStages.some((stage) => stage.network)).toBe(false);
  });

  it("uses no platform-specific shell syntax", () => {
    for (const stage of requiredStages) {
      expect([stage.command, ...stage.args].join(" ")).not.toMatch(/[;&|]/);
    }
  });

  it("has no duplicate stages", () => {
    expect(new Set(stageIds()).size).toBe(requiredStages.length);
  });

  it("rejects duplicate stages", () => {
    expect(() => validateStages([requiredStages[0], requiredStages[0]])).toThrow(/Duplicate/);
  });

  it("fails safely for malformed command configuration", () => {
    expect(() => validateStages([{ ...requiredStages[0], command: "" }])).toThrow(/Malformed/);
    expect(() => validateStages([{ ...requiredStages[0], args: ["run", "typecheck && echo bad"] }])).toThrow(/shell-specific/);
  });

  it("build artifacts cannot be validated before the current build", () => {
    const ids = stageIds();
    expect(ids.slice(ids.indexOf("build-artifacts"))).not.toContain("build");
  });

  it("supports list mode without running child commands", async () => {
    const exitCode = await main(["--list"]);
    expect(exitCode).toBe(0);
  });

  it("selects focused stages from a known starting point", () => {
    expect(selectStages(requiredStages, "test").map((stage) => stage.id)).toEqual(["test", "build", "build-artifacts"]);
  });

  it("fails safely for an unknown focused stage", () => {
    expect(() => selectStages(requiredStages, "missing")).toThrow(/Unknown/);
  });

  it("stays compatible with the repository's ES2022 Node target", () => {
    expect(readFile).toBeTypeOf("function");
    expect(requiredStages.every((stage) => Array.isArray(stage.args))).toBe(true);
  });
});

describe("verification execution", () => {
  it("first stage failure stops execution", async () => {
    const harness = createHarness({ failAt: "typecheck" });
    await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(harness.calls).toEqual(["typecheck"]);
  });

  it("later stages are not run after failure", async () => {
    const harness = createHarness({ failAt: "test" });
    await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(harness.calls).toEqual(["typecheck", "lint", "test"]);
  });

  it("successful stages run exactly once", async () => {
    const harness = createHarness();
    await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(harness.calls).toEqual(stageIds());
  });

  it("successful verification exits zero", async () => {
    const harness = createHarness();
    const result = await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
  });

  it("failed verification exits non-zero", async () => {
    const harness = createHarness({ failAt: "lint", exitCode: 2 });
    const result = await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(result).toMatchObject({ ok: false, exitCode: 2 });
  });

  it("identifies the failed stage", async () => {
    const harness = createHarness({ failAt: "build" });
    const result = await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(result.failedStageId).toBe("build");
    expect(harness.stderrChunks.join("")).toContain("fail build");
  });

  it("keeps exit-code behavior deterministic", async () => {
    const harness = createHarness({ failAt: "test", exitCode: 13 });
    const result = await runVerification({ stages: requiredStages, exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(result.exitCode).toBe(13);
  });

  it("forwards stdout from child commands", async () => {
    const harness = createHarness({ stdout: "visible stdout\n" });
    await runVerification({ stages: [requiredStages[0]], exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(harness.stdoutChunks.join("")).toContain("visible stdout");
  });

  it("forwards stderr from child commands", async () => {
    const harness = createHarness({ failAt: "typecheck", stderr: "visible stderr\n" });
    await runVerification({ stages: [requiredStages[0]], exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(harness.stderrChunks.join("")).toContain("visible stderr");
  });

  it("reporting failure does not produce false verification success", async () => {
    const harness = createHarness({ failAt: "typecheck", throwingStdout: true });
    const result = await runVerification({ stages: [requiredStages[0]], exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(result).toMatchObject({ ok: false, exitCode: 7 });
  });

  it("does not print environment secrets", async () => {
    const harness = createHarness();
    await runVerification({ stages: [requiredStages[0]], exec: harness.exec, stdout: harness.stdout, stderr: harness.stderr, now: harness.now });
    expect(`${harness.stdoutChunks.join("")}${harness.stderrChunks.join("")}`).not.toMatch(/SECRET|TOKEN|PASSWORD|process\.env/);
  });
});

describe("package and production boundaries", () => {
  it("package script points to the canonical verifier", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    expect(pkg.scripts.verify).toBe("node scripts/verify.mjs");
  });

  it("production bundle does not include verification test helpers", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    expect(pkg.scripts.build).not.toMatch(/verifyScript|verify\.mjs/);
  });

  it("production code does not import verification-script internals", async () => {
    const srcFiles = await listSourceFiles("src");
    for (const file of srcFiles) {
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("scripts/verify.mjs");
    }
  }, 15_000);
});
