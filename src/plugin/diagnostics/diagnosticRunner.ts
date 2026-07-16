import { isMotionApiLabEnabled } from "../../shared/labConfig";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import {
  createNotTestedResult,
  futureMotionDiagnosticCommands,
  type AnyMotionDiagnosticCommand,
  type DiagnosticCapability,
  type DiagnosticEnvironment,
  type DiagnosticResult,
  type DiagnosticStatus,
  type DiagnosticTestContext,
  type DiagnosticValue,
  type DiagnosticWarning,
  type PerNodeDiagnosticResult
} from "../../shared/diagnostics";
import { createDisposableFixture, clearDisposableFixture } from "./fixture";
import { detectNodeMotionFeatures } from "./featureDetection";
import {
  pageIdForNode,
  summarizeResolvedTargets,
  type ResolvedDiagnosticTargets
} from "./targetResolver";

let lastDiagnosticResult: DiagnosticResult | null = null;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const getEnvironment = (): DiagnosticEnvironment => ({
  editorType: figma.editorType,
  figmaMode: figma.mode,
  currentPageId: figma.currentPage.id,
  currentPageName: figma.currentPage.name,
  selectionCount: figma.currentPage.selection.length,
  dynamicPageAccess: "configured",
  apiLabEnabled: isMotionApiLabEnabled(),
  runtimeSignals: {
    hasCommitUndo: typeof figma.commitUndo === "function",
    hasTriggerUndo: typeof figma.triggerUndo === "function",
    hasMotionGlobal: "motion" in figma,
    hasLoadAllPagesAsync: typeof figma.loadAllPagesAsync === "function"
  }
});

const emptyTargets = (): ResolvedDiagnosticTargets => ({
  mode: "CURRENT_SELECTION",
  requestedNodeIds: figma.currentPage.selection.map((node) => node.id),
  resolvedNodes: [...figma.currentPage.selection],
  resolvedNodeIds: figma.currentPage.selection.map((node) => node.id),
  failed: [],
  canvasSelectionNodeIds: figma.currentPage.selection.map((node) => node.id)
});

const nodeSummary = (node: SceneNode): DiagnosticValue => {
  const features = detectNodeMotionFeatures(node);
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    pageId: pageIdForNode(node) ?? "UNKNOWN",
    role: node.getPluginData("motionops.apiLab.role") || "NONE",
    parentType: node.parent?.type ?? "NONE",
    visible: "visible" in node ? node.visible : "unknown",
    locked: "locked" in node ? node.locked : "unknown",
    motionReadProperties: features.readProperties,
    motionWriteMethods: features.writeMethods
  };
};

const perNode = <T extends DiagnosticValue>(
  node: SceneNode,
  requestedIndex: number,
  status: DiagnosticStatus,
  data: T | null,
  warnings: DiagnosticWarning[] = []
): PerNodeDiagnosticResult<T> => ({
  requestedIndex,
  nodeId: node.id,
  nodeName: node.name,
  nodeType: node.type,
  pageId: pageIdForNode(node) ?? "UNKNOWN",
  role: node.getPluginData("motionops.apiLab.role") || undefined,
  status,
  data,
  warnings,
  errors: []
});

const statusForTargets = (
  targets: ResolvedDiagnosticTargets,
  baseStatus: DiagnosticStatus
): DiagnosticStatus => {
  if (targets.mode === "EXPLICIT_NODE_IDS" && targets.resolvedNodes.length === 0 && targets.requestedNodeIds.length > 0) {
    return "ERROR";
  }
  if (targets.failed.length > 0 && targets.resolvedNodes.length > 0) {
    return "PARTIAL";
  }
  return baseStatus;
};

const summarizeCapabilities = (targets: ResolvedDiagnosticTargets): DiagnosticCapability[] => {
  if (targets.resolvedNodes.length === 0) {
    return [
      {
        name: "targets",
        status: targets.requestedNodeIds.length === 0 ? "UNSUPPORTED" : "ERROR",
        summary:
          targets.requestedNodeIds.length === 0
            ? "No explicit targets to inspect."
            : "No requested target nodes resolved."
      }
    ];
  }

  return targets.resolvedNodes.flatMap((node) =>
    detectNodeMotionFeatures(node).capabilities.map((capability) => ({
      ...capability,
      name: `${node.name}.${capability.name}`
    }))
  );
};

const readMotionProperty = (
  targets: ResolvedDiagnosticTargets,
  property: "animationStyles" | "animations" | "manualKeyframeTracks" | "timelines"
): {
  evidence: DiagnosticValue;
  capabilities: DiagnosticCapability[];
  warnings: DiagnosticWarning[];
  status: DiagnosticStatus;
} => {
  const warnings: DiagnosticWarning[] = [];
  const nodeEvidence = targets.resolvedNodes.map((node, requestedIndex) => {
    const record = asRecord(node);
    if (!(property in record)) {
      return perNode(node, requestedIndex, "UNSUPPORTED", {
        __motionOpsType: "missing-property"
      });
    }

    const serialized = serializeDiagnosticValue(record[property]);
    warnings.push(...serialized.warnings);
    return perNode(node, requestedIndex, "UNKNOWN", serialized.value);
  });

  const supportedCount = nodeEvidence.filter((item) => item.status === "UNKNOWN").length;
  const baseStatus: DiagnosticStatus =
    targets.resolvedNodes.length === 0
      ? "UNSUPPORTED"
      : supportedCount === targets.resolvedNodes.length
        ? "UNKNOWN"
        : supportedCount > 0
          ? "PARTIAL"
          : "UNSUPPORTED";

  return {
    evidence: nodeEvidence as unknown as DiagnosticValue,
    capabilities: targets.resolvedNodes.map((node, index) => ({
      name: `${node.name}.${property}`,
      status: nodeEvidence[index]?.status === "UNKNOWN" ? "UNKNOWN" : "UNSUPPORTED",
      summary:
        nodeEvidence[index]?.status === "UNKNOWN"
          ? "Property present and serialized from explicit target."
          : "Property missing on this explicit target."
    })),
    warnings,
    status: statusForTargets(targets, baseStatus)
  };
};

const result = (
  command: AnyMotionDiagnosticCommand,
  startedAt: number,
  targets: ResolvedDiagnosticTargets,
  status: DiagnosticStatus,
  summary: string,
  evidence: DiagnosticValue,
  capabilities: DiagnosticCapability[],
  warnings: DiagnosticWarning[] = []
): DiagnosticResult => ({
  command,
  status,
  timestamp: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  environment: getEnvironment(),
  target: summarizeResolvedTargets(targets),
  nodesReadCount: targets.resolvedNodes.length,
  summary,
  capabilities,
  evidence,
  warnings,
  errors: targets.failed.map((failure) => ({
    code: `TARGET_${failure.reason}`,
    message: failure.message,
    path: failure.nodeId
  }))
});

export const runMotionDiagnostic = async (
  command: AnyMotionDiagnosticCommand,
  targets: ResolvedDiagnosticTargets = emptyTargets(),
  testContext?: DiagnosticTestContext
): Promise<DiagnosticResult> => {
  const startedAt = Date.now();
  const environment = getEnvironment();

  try {
    if ((futureMotionDiagnosticCommands as readonly string[]).includes(command)) {
      lastDiagnosticResult = createNotTestedResult(
        command,
        environment,
        startedAt,
        "Command is reserved for later Phase 0 verification and is not enabled in P0-005."
      );
      return lastDiagnosticResult;
    }

    switch (command) {
      case "GET_ENVIRONMENT":
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          "SUPPORTED",
          "Environment metadata collected.",
          serializeDiagnosticValue({
            environment: environment as unknown as DiagnosticValue,
            target: summarizeResolvedTargets(targets),
            testContext: serializeDiagnosticValue(testContext ?? null).value
          }).value,
          [
            {
              name: "dynamic-page",
              status: "SUPPORTED",
              summary: "Manifest is configured for dynamic-page in source; runtime loaded current page."
            }
          ]
        );
        return lastDiagnosticResult;
      case "VERIFY_EXPLICIT_TARGET_PIPELINE":
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          targets.mode === "EXPLICIT_NODE_IDS" && targets.requestedNodeIds.length === targets.resolvedNodes.length
            ? "SUPPORTED"
            : "ERROR",
          "Explicit target pipeline resolved target nodes without relying on canvas selection.",
          serializeDiagnosticValue({
            requestedNodeIds: targets.requestedNodeIds,
            resolvedNodeIds: targets.resolvedNodeIds,
            nodesReadCount: targets.resolvedNodes.length,
            canvasSelectionNodeIds: targets.canvasSelectionNodeIds,
            nodes: targets.resolvedNodes.map((node, requestedIndex) =>
              perNode(node, requestedIndex, "SUPPORTED", nodeSummary(node))
            )
          }).value,
          [
            {
              name: "explicit-target-pipeline",
              status:
                targets.mode === "EXPLICIT_NODE_IDS" && targets.requestedNodeIds.length === targets.resolvedNodes.length
                  ? "SUPPORTED"
                  : "ERROR",
              summary: "Resolved target nodes directly by ID."
            }
          ]
        );
        return lastDiagnosticResult;
      case "READ_CURRENT_SELECTION": {
        const evidence = targets.resolvedNodes.map((node, requestedIndex) =>
          perNode(node, requestedIndex, "UNKNOWN", nodeSummary(node))
        );
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          statusForTargets(targets, targets.resolvedNodes.length > 0 ? "UNKNOWN" : "UNSUPPORTED"),
          `${targets.resolvedNodes.length.toString()} explicit target node(s) inspected.`,
          evidence as unknown as DiagnosticValue,
          summarizeCapabilities(targets)
        );
        return lastDiagnosticResult;
      }
      case "READ_MOTION_DATA": {
        const sections = ["animationStyles", "animations", "manualKeyframeTracks", "timelines"] as const;
        const reads = sections.map((section) => [section, readMotionProperty(targets, section)] as const);
        const warnings = reads.flatMap(([, read]) => read.warnings);
        const capabilities = reads.flatMap(([, read]) => read.capabilities);
        const status = reads.some(([, read]) => read.status === "ERROR")
          ? "ERROR"
          : reads.some(([, read]) => read.status === "PARTIAL")
            ? "PARTIAL"
            : reads.some(([, read]) => read.status === "UNKNOWN")
              ? "UNKNOWN"
              : "UNSUPPORTED";
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          status,
          "Serialized available Motion read properties for explicit targets.",
          serializeDiagnosticValue(Object.fromEntries(reads.map(([section, read]) => [section, read.evidence]))).value,
          capabilities,
          warnings
        );
        return lastDiagnosticResult;
      }
      case "READ_MANUAL_TRACKS":
      case "READ_ANIMATION_STYLES":
      case "READ_DERIVED_ANIMATIONS":
      case "READ_TIMELINES": {
        const propertyByCommand = {
          READ_MANUAL_TRACKS: "manualKeyframeTracks",
          READ_ANIMATION_STYLES: "animationStyles",
          READ_DERIVED_ANIMATIONS: "animations",
          READ_TIMELINES: "timelines"
        } as const;
        const read = readMotionProperty(targets, propertyByCommand[command]);
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          read.status,
          `Serialized ${propertyByCommand[command]} for explicit targets.`,
          read.evidence,
          read.capabilities,
          read.warnings
        );
        return lastDiagnosticResult;
      }
      case "CREATE_DISPOSABLE_FIXTURE": {
        const fixture = await createDisposableFixture();
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          "SUPPORTED",
          "Disposable fixture created on the current page.",
          {
            rootName: "__MOTIONOPS_API_LAB__",
            registry: serializeDiagnosticValue(fixture.registry).value
          },
          [
            {
              name: "fixture-ownership",
              status: "SUPPORTED",
              summary: "Created node IDs were stored in development-only client storage."
            }
          ],
          fixture.warnings
        );
        return lastDiagnosticResult;
      }
      case "CLEAR_DISPOSABLE_FIXTURE": {
        const cleanup = await clearDisposableFixture();
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          cleanup.removedNodeIds.length > 0 ? "SUPPORTED" : "UNSUPPORTED",
          `Removed ${cleanup.removedNodeIds.length.toString()} registered fixture node(s).`,
          { removedNodeIds: cleanup.removedNodeIds },
          [
            {
              name: "fixture-cleanup",
              status: cleanup.removedNodeIds.length > 0 ? "SUPPORTED" : "UNSUPPORTED",
              summary: "Cleanup uses stored node IDs, not names."
            }
          ],
          cleanup.warnings
        );
        return lastDiagnosticResult;
      }
      case "EXPORT_LAST_RESULT":
        lastDiagnosticResult = result(
          command,
          startedAt,
          targets,
          lastDiagnosticResult === null ? "UNSUPPORTED" : "SUPPORTED",
          lastDiagnosticResult === null ? "No diagnostic result has been produced yet." : "Last result exported.",
          lastDiagnosticResult === null ? {} : (lastDiagnosticResult as unknown as DiagnosticValue),
          []
        );
        return lastDiagnosticResult;
      default:
        lastDiagnosticResult = createNotTestedResult(
          command,
          environment,
          startedAt,
          "Command is not enabled in this harness."
        );
        return lastDiagnosticResult;
    }
  } catch (error) {
    lastDiagnosticResult = {
      command,
      status: "ERROR",
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      environment,
      target: summarizeResolvedTargets(targets),
      nodesReadCount: targets.resolvedNodes.length,
      summary: "Diagnostic command failed.",
      capabilities: [],
      evidence: {},
      warnings: [],
      errors: [
        {
          code: "DIAGNOSTIC_FAILED",
          message: error instanceof Error ? error.message : "Unknown diagnostic error."
        }
      ]
    };
    return lastDiagnosticResult;
  }
};
