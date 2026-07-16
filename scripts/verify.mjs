import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : npmExecutable;
const npmArgs = (...args) => (npmExecPath ? [npmExecPath, ...args] : args);

export const requiredStages = Object.freeze([
  Object.freeze({
    id: "typecheck",
    label: "Static type validation",
    command: npmCommand,
    args: npmArgs("run", "typecheck"),
    interactive: false,
    network: false,
    liveFigma: false,
    ui: false
  }),
  Object.freeze({
    id: "lint",
    label: "Linting",
    command: npmCommand,
    args: npmArgs("run", "lint"),
    interactive: false,
    network: false,
    liveFigma: false,
    ui: false
  }),
  Object.freeze({
    id: "test",
    label: "Automated tests",
    command: npmCommand,
    args: npmArgs("run", "test"),
    interactive: false,
    network: false,
    liveFigma: false,
    ui: false
  }),
  Object.freeze({
    id: "build",
    label: "Production build",
    command: npmCommand,
    args: npmArgs("run", "build"),
    interactive: false,
    network: false,
    liveFigma: false,
    ui: false
  }),
  Object.freeze({
    id: "build-artifacts",
    label: "Build artifact validation",
    command: npmCommand,
    args: npmArgs("run", "test:build-artifacts"),
    interactive: false,
    network: false,
    liveFigma: false,
    ui: false
  })
]);

export const excludedGates = Object.freeze([
  Object.freeze({
    id: "coverage",
    command: "npm run test:coverage",
    reason: "Coverage reporting exists, but no accepted coverage thresholds are configured yet."
  }),
  Object.freeze({
    id: "ui",
    command: "npm run test:ui",
    reason: "Playwright UI smoke tests are not a current non-manual Phase 1 Motion foundation gate."
  }),
  Object.freeze({
    id: "lab-collector",
    command: "npm run lab:collector:test",
    reason: "Collector validation is Phase 0 lab infrastructure, not a production Motion foundation gate."
  })
]);

export const commandDisplay = (stage) => [stage.command, ...stage.args].join(" ");

export const hasCoverageThresholdGate = (coverageConfig) => {
  if (!coverageConfig || typeof coverageConfig !== "object") {
    return false;
  }
  const thresholds = coverageConfig.thresholds;
  return Boolean(thresholds && typeof thresholds === "object" && Object.keys(thresholds).length > 0);
};

export const validateStages = (stages) => {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new Error("Verification requires at least one stage.");
  }

  const seen = new Set();
  for (const stage of stages) {
    if (!stage || typeof stage !== "object") {
      throw new Error("Verification stage must be an object.");
    }
    if (!stage.id || seen.has(stage.id)) {
      throw new Error(`Duplicate or missing verification stage id: ${String(stage.id)}`);
    }
    seen.add(stage.id);
    if (!stage.label || !stage.command || !Array.isArray(stage.args)) {
      throw new Error(`Malformed verification stage: ${stage.id}`);
    }
    if (stage.interactive || stage.network || stage.liveFigma || stage.ui) {
      throw new Error(`Stage is not allowed in the Phase 1 verifier: ${stage.id}`);
    }
    if ([stage.command, ...stage.args].some((part) => typeof part !== "string" || part.length === 0 || /[;&|]/.test(part))) {
      throw new Error(`Stage uses unsafe or shell-specific command syntax: ${stage.id}`);
    }
  }
};

export const selectStages = (stages, fromId) => {
  if (!fromId) {
    return stages;
  }
  const index = stages.findIndex((stage) => stage.id === fromId);
  if (index === -1) {
    throw new Error(`Unknown verification stage for --from: ${fromId}`);
  }
  return stages.slice(index);
};

const elapsedSeconds = (startedAt, now) => `${((now - startedAt) / 1000).toFixed(2)}s`;

const safeWrite = (writer, text) => {
  try {
    writer(text);
  } catch {
    // Reporting must never convert a failed verification into success.
  }
};

export const runStage = async (stage, context) => {
  const startedAt = context.now();
  safeWrite(context.stdout, `[verify] start ${stage.id}: ${stage.label} (${commandDisplay(stage)})\n`);
  const result = await context.exec(stage);
  const elapsed = elapsedSeconds(startedAt, context.now());
  if (result.stdout) {
    safeWrite(context.stdout, result.stdout);
  }
  if (result.stderr) {
    safeWrite(context.stderr, result.stderr);
  }
  if (result.exitCode === 0) {
    safeWrite(context.stdout, `[verify] pass ${stage.id} in ${elapsed}\n`);
    return { ok: true, stageId: stage.id, elapsed };
  }

  const exitCode = typeof result.exitCode === "number" ? result.exitCode : 1;
  safeWrite(
    context.stderr,
    `[verify] fail ${stage.id} in ${elapsed}: ${commandDisplay(stage)} exited ${exitCode}\n[verify] complete verification did not pass\n`
  );
  return { ok: false, stageId: stage.id, exitCode, elapsed };
};

export const runVerification = async ({ stages = requiredStages, from, exec, stdout, stderr, now } = {}) => {
  validateStages(stages);
  const selectedStages = selectStages(stages, from);
  const context = {
    exec,
    stdout: stdout ?? ((text) => process.stdout.write(text)),
    stderr: stderr ?? ((text) => process.stderr.write(text)),
    now: now ?? (() => performance.now())
  };
  if (!context.exec) {
    throw new Error("Verification requires a process executor.");
  }

  const completed = [];
  for (const stage of selectedStages) {
    const result = await runStage(stage, context);
    completed.push(result);
    if (!result.ok) {
      return { ok: false, exitCode: result.exitCode, failedStageId: result.stageId, completed };
    }
  }

  safeWrite(context.stdout, `[verify] all ${selectedStages.length} stages passed\n`);
  return { ok: true, exitCode: 0, completed };
};

export const spawnExec = (stage) =>
  new Promise((resolve) => {
    const child = spawn(stage.command, stage.args, {
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}\n` });
    });
    child.on("close", (code, signal) => {
      resolve({ exitCode: typeof code === "number" ? code : 1, signal, stdout, stderr });
    });
  });

const parseArgs = (argv) => {
  const parsed = { list: false, from: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      parsed.list = true;
    } else if (arg === "--from") {
      parsed.from = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--from=")) {
      parsed.from = arg.slice("--from=".length);
    } else {
      throw new Error(`Unknown verifier argument: ${arg}`);
    }
  }
  return parsed;
};

export const main = async (argv = process.argv.slice(2)) => {
  let parsed;
  try {
    parsed = parseArgs(argv);
    validateStages(requiredStages);
    const selectedStages = selectStages(requiredStages, parsed.from);
    if (parsed.list) {
      for (const stage of selectedStages) {
        process.stdout.write(`${stage.id}\t${commandDisplay(stage)}\n`);
      }
      return 0;
    }
    const result = await runVerification({ stages: requiredStages, from: parsed.from, exec: spawnExec });
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[verify] ${message}\n`);
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
