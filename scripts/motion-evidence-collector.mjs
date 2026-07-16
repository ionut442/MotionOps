import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const host = "localhost";
const port = 3847;
const maxBodyBytes = 1_000_000;
const validTestIds = new Set([
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
  "R08",
  "R09",
  "R10",
  "W01",
  "W02",
  "W03",
  "W04",
  "W05",
  "W06",
  "W07",
  "W08",
  "S01",
  "S02",
  "S03",
  "S04",
  "S05",
  "S06",
  "T01",
  "T02",
  "T03",
  "T04",
  "T05",
  "T06",
  "U01",
  "U02",
  "U03",
  "U04",
  "U05",
  "U06",
  "U07",
  "U08",
  "U09",
  "U10",
  "C01",
  "C02",
  "C03",
  "C04",
  "C05",
  "C06",
  "C07",
  "C08",
  "C09",
  "C10",
  "C11",
  "C12",
  "CP01",
  "CP02",
  "CP03",
  "CP04",
  "CP05",
  "CP06",
  "CP07",
  "CP08",
  "CP09",
  "CP10"
]);
const validCommands = new Set([
  "GET_ENVIRONMENT",
  "READ_CURRENT_SELECTION",
  "READ_MOTION_DATA",
  "READ_MANUAL_TRACKS",
  "READ_ANIMATION_STYLES",
  "READ_DERIVED_ANIMATIONS",
  "READ_TIMELINES",
  "CREATE_DISPOSABLE_FIXTURE",
  "CLEAR_DISPOSABLE_FIXTURE",
  "EXPORT_LAST_RESULT",
  "TEST_MANUAL_TRACK_WRITE",
  "TEST_STYLE_UPDATE",
  "TEST_TIMELINE_DURATION",
  "TEST_UNDO_BOUNDARY",
  "TEST_COMPONENT_INSTANCE_MATRIX",
  "TEST_COMPONENT_PROPERTY_TRACK"
]);
const filenamePattern = /^(?:R(?:0[1-9]|10)-[a-z0-9-]+-[a-z0-9-]+|p007-[a-z0-9-]+-[a-f0-9]+-W0[1-8]-[a-z0-9-]+|p008-[a-z0-9-]+-[a-f0-9]+-S0[1-6]-[a-z0-9-]+|p009-[a-z0-9-]+-[a-f0-9]+-T0[1-6]-[a-z0-9-]+|p010-[a-z0-9-]+-[a-f0-9]+-U(?:0[1-9]|10)-[a-z0-9-]+|p011-[a-z0-9-]+-[a-f0-9]+-C(?:0[1-9]|1[0-2])-[a-z0-9-]+|p012-[a-z0-9-]+-[a-f0-9]+-CP(?:0[1-9]|10)-[a-z0-9-]+)\.json$/;
const manifestFilenamePattern = /^p0(?:0[6789]|1[0-2])-[a-z0-9-]+-[a-f0-9]+\.manifest\.json$/;

export const createEvidenceCollector = ({ repoRoot = process.cwd() } = {}) => {
  const testResultsDir = path.resolve(repoRoot, "test-results");

  const sendJson = (res, statusCode, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "content-length": Buffer.byteLength(body)
    });
    res.end(body);
  };

  const fail = (res, statusCode, errorCode, message) => {
    sendJson(res, statusCode, { ok: false, errorCode, message });
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBodyBytes) {
          reject(Object.assign(new Error("Request body too large."), { code: "PAYLOAD_TOO_LARGE" }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });

  const validate = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return "Request must be a JSON object.";
    }
    if (!validTestIds.has(value.testCaseId)) {
      return "Unknown testCaseId.";
    }
    if (!validCommands.has(value.command)) {
      return "Unknown diagnostic command.";
    }
    if (typeof value.filename !== "string" || !filenamePattern.test(value.filename)) {
      return "Invalid evidence filename.";
    }
    if (
      value.filename.includes("..") ||
      value.filename.includes("/") ||
      value.filename.includes("\\") ||
      /^[a-zA-Z]:/.test(value.filename)
    ) {
      return "Filename must not contain path traversal or directory separators.";
    }
    if (typeof value.overwrite !== "boolean") {
      return "overwrite must be boolean.";
    }
    if (typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) {
      return "payload must be a JSON object.";
    }
    if (value.payload.evidenceSchemaVersion !== 2 && value.payload.evidenceSchemaVersion !== 1) {
      return "payload.evidenceSchemaVersion must be 1 or 2.";
    }
    if (typeof value.payload.runId !== "string" || value.payload.runId.length === 0) {
      return "payload.runId must be a non-empty string.";
    }
    return null;
  };

  const validateManifest = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return "Request must be a JSON object.";
    }
    if (typeof value.runId !== "string" || value.runId.length === 0) {
      return "runId must be a non-empty string.";
    }
    if (typeof value.filename !== "string" || !manifestFilenamePattern.test(value.filename)) {
      return "Invalid manifest filename.";
    }
    if (typeof value.overwrite !== "boolean") {
      return "overwrite must be boolean.";
    }
    if (typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) {
      return "payload must be a JSON object.";
    }
    if (
      (value.payload.evidenceSchemaVersion !== 2 && value.payload.evidenceSchemaVersion !== 1) ||
      value.payload.runId !== value.runId
    ) {
      return "manifest payload must match runId and schema version.";
    }
    return null;
  };

  const writeJsonFile = async (filename, payload, overwrite) => {
    const finalPath = path.resolve(testResultsDir, filename);
    if (path.dirname(finalPath) !== testResultsDir) {
      throw Object.assign(new Error("Resolved output path escaped test-results."), { code: "PATH_ESCAPE" });
    }

    await mkdir(testResultsDir, { recursive: true });
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const byteLength = Buffer.byteLength(body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const tmpPath = path.join(testResultsDir, `.${filename}.${Date.now().toString()}.tmp`);
    await writeFile(tmpPath, body, { encoding: "utf8", flag: "wx" });
    try {
      if (!overwrite) {
        await writeFile(finalPath, body, { encoding: "utf8", flag: "wx" });
        await rm(tmpPath, { force: true });
      } else {
        await rename(tmpPath, finalPath);
      }
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }

    return {
      relativePath: `test-results/${filename}`,
      byteLength,
      sha256
    };
  };

  const server = createHttpServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, service: "motion-evidence-collector", outputDir: "test-results" });
      return;
    }

    if (req.method !== "POST" || (req.url !== "/api/evidence" && req.url !== "/api/run-manifest")) {
      fail(res, 404, "NOT_FOUND", "Endpoint not found.");
      return;
    }

    try {
      const raw = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        fail(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
        return;
      }

      const validationError = req.url === "/api/run-manifest" ? validateManifest(parsed) : validate(parsed);
      if (validationError !== null) {
        fail(res, 400, "INVALID_REQUEST", validationError);
        return;
      }

      try {
        const output = await writeJsonFile(parsed.filename, parsed.payload, parsed.overwrite);
        sendJson(res, 200, {
          ok: true,
          ...output
        });
      } catch (error) {
        if (error?.code === "PATH_ESCAPE") {
          fail(res, 400, "PATH_ESCAPE", "Resolved output path escaped test-results.");
          return;
        }
        if (error?.code === "EEXIST") {
          fail(res, 409, "FILE_EXISTS", "Evidence file exists and overwrite is false.");
          return;
        }
        throw error;
      }
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") {
        fail(res, 413, "PAYLOAD_TOO_LARGE", "Request body too large.");
        return;
      }
      fail(res, 500, "WRITE_FAILED", error instanceof Error ? error.message : "Evidence write failed.");
    }
  });

  return server;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = createEvidenceCollector();
  server.listen(port, host, () => {
    console.log(`motion-evidence-collector listening on http://${host}:${port}`);
    console.log("writing evidence to test-results/");
  });
}
