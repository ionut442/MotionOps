import { createHash } from "node:crypto";
import { mkdir, rm, writeFile, copyFile, readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const root = process.cwd();
const releaseRoot = join(root, "dist", "release-candidate");
const packageRoot = join(releaseRoot, "motionops-plugin");
const inventoryPath = join(releaseRoot, "inventory.json");
const checksumPath = join(releaseRoot, "SHA256SUMS.txt");

const requiredFiles = ["manifest.json", "dist/plugin.js", "dist/index.html"];
const packageFiles = [
  { from: "manifest.json", to: "manifest.json" },
  { from: "dist/plugin.js", to: "dist/plugin.js" },
  { from: "dist/index.html", to: "dist/index.html" }
];

const forbiddenPatterns = [
  /\.map$/,
  /(^|\/)(src|tests|test-results|docs|scripts|node_modules)(\/|$)/,
  /(^|\/)\.env/,
  /live-figma/i,
  /playwright/i,
  /fixture/i,
  /collector/i
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const readRequired = async (path) => {
  try {
    return await readFile(join(root, path));
  } catch {
    throw new Error(`Release package missing required input: ${path}`);
  }
};

const listFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(full);
      return [full];
    })
  );
  return nested.flat().sort();
};

const validateInputs = async () => {
  const manifest = JSON.parse((await readRequired("manifest.json")).toString("utf8"));
  if (manifest.main !== "dist/plugin.js" || manifest.ui !== "dist/index.html") {
    throw new Error("Manifest entry points must target dist/plugin.js and dist/index.html.");
  }
  if (manifest.documentAccess !== "dynamic-page") {
    throw new Error("Manifest must keep documentAccess dynamic-page.");
  }
  if (manifest.networkAccess?.allowedDomains?.[0] !== "none") {
    throw new Error("Production manifest must disable network access.");
  }

  const html = (await readRequired("dist/index.html")).toString("utf8");
  const plugin = (await readRequired("dist/plugin.js")).toString("utf8");
  if (/src=["']\/assets\//.test(html) || /href=["']\/assets\//.test(html)) {
    throw new Error("UI bundle must be inlined for Figma import.");
  }
  if (/localhost:3847|127\.0\.0\.1:3847|motion-evidence-collector|__MOTIONOPS_P0_|LIVE_TEST_RUNNER_START|__MOTIONOPS_LIVE_TEST_SANDBOX__/i.test(plugin)) {
    throw new Error("Production plugin bundle contains lab or collector references.");
  }
  if (html.includes("Run all tests")) {
    throw new Error("Production UI bundle contains the live-test runner button.");
  }
};

const build = async () => {
  for (const file of requiredFiles) {
    await readRequired(file);
  }
  await validateInputs();

  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(join(packageRoot, "dist"), { recursive: true });

  for (const file of packageFiles) {
    await copyFile(join(root, file.from), join(packageRoot, file.to));
  }

  const files = await listFiles(packageRoot);
  const inventory = [];
  const checksums = [];
  for (const file of files) {
    const relativePath = relative(packageRoot, file).replaceAll("\\", "/");
    if (forbiddenPatterns.some((pattern) => pattern.test(relativePath))) {
      throw new Error(`Forbidden release artifact: ${relativePath}`);
    }
    const content = await readFile(file);
    const info = await stat(file);
    const digest = sha256(content);
    inventory.push({
      path: relativePath,
      bytes: info.size,
      sha256: digest
    });
    checksums.push(`${digest}  motionops-plugin/${relativePath}`);
  }

  const record = {
    packageName: basename(packageRoot),
    generatedAt: new Date().toISOString(),
    status: "release-candidate",
    liveFigmaGate: "blocked",
    files: inventory
  };
  await writeFile(inventoryPath, `${JSON.stringify(record, null, 2)}\n`);
  await writeFile(checksumPath, `${checksums.join("\n")}\n`);
  process.stdout.write(`[release-package] wrote ${relative(root, packageRoot)} with ${inventory.length} files\n`);
};

await build();
