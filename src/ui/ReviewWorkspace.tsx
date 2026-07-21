import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildHandoffReport, renderHandoffJson, renderHandoffMarkdown, type HandoffReport } from "../domain/handoffReport";
import { runMotionQa, type QaIssue, type QaResult } from "../domain/qa";
import type { MotionSnapshot } from "../domain/motion";
import { createDefaultStandards, exportStandardsJson, parseStandardsJson, type MotionStandards, type StandardsException, type StandardsSource } from "../domain/standards";
import type { ScopeScanResult } from "../domain/scopeScan";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";
import { ChangePreview, type ChangePreviewPlan } from "./components/ChangePreview";
import { ContextDrawerShell } from "./components/ContextDrawerShell";
import { useApplicationStateDispatch } from "./applicationStateContext";
import { copyHandoffText, exportHandoffFile } from "./handoffExport";
import { Select } from "./components/ui";
import { Icon } from "./components/Icon";

interface ReviewWorkspaceProps {
  readonly activeScope: ScopeScanResult | null;
  readonly lastMessage: PluginToUiMessage | null;
  readonly sendToPlugin: (message: UiToPluginMessage) => void;
  readonly createRequestId: () => string;
  readonly onContextDrawerChange: (drawer: ReactNode | null) => void;
}

type ReviewTab = "standards" | "qa" | "handoff";
type QaFilter = "all" | "open" | "error" | "warning" | "suggestion" | "information";
type HandoffPreview = "markdown" | "json";

const planIdForLifecycle = (plan: unknown, fallback: string): string => {
  if (typeof plan !== "object" || plan === null || !("planId" in plan)) return fallback;
  const planId = (plan as { readonly planId?: unknown }).planId;
  return typeof planId === "string" && planId.trim().length > 0 ? planId : fallback;
};

export const ReviewWorkspace = ({
  activeScope,
  lastMessage,
  sendToPlugin,
  createRequestId,
  onContextDrawerChange
}: ReviewWorkspaceProps) => {
  const dispatchApplicationEvent = useApplicationStateDispatch();
  const [tab, setTab] = useState<ReviewTab>("standards");
  const [standards, setStandards] = useState<MotionStandards>(createDefaultStandards(Date.now()));
  const [standardSource, setStandardSource] = useState<StandardsSource>("personal");
  const [dirtyJson, setDirtyJson] = useState("");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [qaSnapshots, setQaSnapshots] = useState<readonly MotionSnapshot[]>([]);
  const [qaResult, setQaResult] = useState<QaResult | null>(null);
  const [qaFilter, setQaFilter] = useState<QaFilter>("all");
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<readonly string[]>([]);
  const [reviewedIssueIds, setReviewedIssueIds] = useState<readonly string[]>([]);
  const [exceptions, setExceptions] = useState<readonly StandardsException[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<QaIssue | null>(null);
  const [previewPlan, setPreviewPlan] = useState<ChangePreviewPlan | null>(null);
  const [pluginVersion, setPluginVersion] = useState("0.0.0");
  const [handoffPreview, setHandoffPreview] = useState<HandoffPreview>("markdown");
  const [handoffReport, setHandoffReport] = useState<HandoffReport | null>(null);
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  const activeStorageRequestRef = useRef<string | null>(null);
  const activeInspectRequestRef = useRef<string | null>(null);
  const activePlanRequestRef = useRef<string | null>(null);
  const activeApplyRequestRef = useRef<string | null>(null);

  useEffect(() => {
    const requestId = createRequestId();
    activeStorageRequestRef.current = requestId;
    sendToPlugin({ type: "STANDARDS_STORAGE_REQUEST", requestId, action: { kind: "list-personal" } });
  }, [createRequestId, sendToPlugin]);

  useEffect(() => {
    if (lastMessage === null) return;
    if (lastMessage.type === "PLUGIN_READY") {
      setPluginVersion(lastMessage.pluginVersion);
    }
    if (lastMessage.type === "STANDARDS_STORAGE_RESULT" && lastMessage.requestId === activeStorageRequestRef.current) {
      activeStorageRequestRef.current = null;
      if (lastMessage.result.active !== undefined) {
        setStandards(lastMessage.result.active);
        setDirtyJson(exportStandardsJson(lastMessage.result.active));
        setStandardSource(lastMessage.result.activeSource);
      }
      setStorageMessage(lastMessage.result.errors[0]?.message ?? `${String(lastMessage.result.personal.length)} personal standard(s) available.`);
    }
    if (lastMessage.type === "MOTION_INSPECT_RESULT" && lastMessage.requestId === activeInspectRequestRef.current) {
      activeInspectRequestRef.current = null;
      const snapshots = lastMessage.result.snapshots;
      setQaSnapshots(snapshots);
      setQaResult(runMotionQa({
        snapshots,
        scope: activeScope ?? { roots: [], nodes: [], issues: [] },
        standards,
        exceptions,
        ignoredIssueIds,
        reviewedIssueIds
      }));
      setHandoffReport(null);
    }
    if (lastMessage.type === "MOTION_PLAN_OPERATION_RESULT" && lastMessage.requestId === activePlanRequestRef.current) {
      activePlanRequestRef.current = null;
      if (lastMessage.result.ok) {
        setPreviewPlan(lastMessage.result.plan as ChangePreviewPlan);
        dispatchApplicationEvent({ type: "DRAFT_CHANGED", draftId: planIdForLifecycle(lastMessage.result.plan, "qa-fix") });
      } else {
        setStorageMessage(lastMessage.result.error.message);
      }
    }
  }, [activeScope, dispatchApplicationEvent, exceptions, ignoredIssueIds, lastMessage, reviewedIssueIds, standards]);

  const buildReport = useCallback(() => {
    const report = buildHandoffReport({
      pluginVersion,
      scope: activeScope,
      snapshots: qaSnapshots,
      standards,
      qaResult,
      exceptions
    });
    setHandoffReport(report);
    setHandoffMessage(report.scope.staleState === "current" ? "Handoff report rebuilt from current confirmed Scope and Motion state." : `Handoff report rebuilt with state: ${report.scope.staleState}.`);
    return report;
  }, [activeScope, exceptions, pluginVersion, qaResult, qaSnapshots, standards]);

  const currentReport = handoffReport ?? buildHandoffReport({
    pluginVersion,
    scope: activeScope,
    snapshots: qaSnapshots,
    standards,
    qaResult,
    exceptions
  });

  const markdownPreview = useMemo(() => renderHandoffMarkdown(currentReport), [currentReport]);
  const jsonPreview = useMemo(() => renderHandoffJson(currentReport), [currentReport]);
  const reportBaseName = useMemo(() => `motionops-handoff-${currentReport.metadata.pluginVersion}-${currentReport.metadata.standardsVersion ?? "no-standards"}`, [currentReport]);

  const visibleIssues = useMemo(() => {
    const issues = qaResult?.issues ?? [];
    if (qaFilter === "all") return issues;
    if (qaFilter === "open") return issues.filter((issue) => issue.status === "open");
    return issues.filter((issue) => issue.severity === qaFilter);
  }, [qaFilter, qaResult]);

  const savePersonal = () => {
    const parsed = parseStandardsJson(dirtyJson);
    if (!parsed.ok || parsed.standards === undefined) {
      setStorageMessage(parsed.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
      return;
    }
    setStandards(parsed.standards);
    const requestId = createRequestId();
    activeStorageRequestRef.current = requestId;
    sendToPlugin({ type: "STANDARDS_STORAGE_REQUEST", requestId, action: { kind: "save-personal", standards: parsed.standards, selectActive: true } });
  };

  const saveFile = () => {
    const requestId = createRequestId();
    activeStorageRequestRef.current = requestId;
    sendToPlugin({ type: "STANDARDS_STORAGE_REQUEST", requestId, action: { kind: "save-file", standards } });
    setStandardSource("file");
  };

  const importJson = () => {
    const parsed = parseStandardsJson(dirtyJson);
    if (!parsed.ok || parsed.standards === undefined) {
      setStorageMessage(parsed.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
      return;
    }
    setStandards(parsed.standards);
    setStorageMessage(parsed.migrated ? "Imported with migration; review before saving." : "Imported and validated; review before saving.");
  };

  const runQa = () => {
    if (activeScope === null || activeScope.nodes.length === 0) {
      setStorageMessage("Confirm a Scope before running QA.");
      return;
    }
    const requestId = createRequestId();
    activeInspectRequestRef.current = requestId;
    sendToPlugin({ type: "MOTION_INSPECT_REQUEST", requestId, nodeIds: activeScope.nodes.map((node) => node.id) });
  };

  const copyReport = (format: HandoffPreview) => {
    const text = format === "markdown" ? markdownPreview : jsonPreview;
    void copyHandoffText(text).then((result) => {
      setHandoffMessage(result.message);
    });
  };

  const exportReport = (format: HandoffPreview) => {
    const text = format === "markdown" ? markdownPreview : jsonPreview;
    const result = exportHandoffFile(text, { format, baseName: reportBaseName });
    setHandoffMessage(result.message);
  };

  const requestSafeFix = useCallback((issue: QaIssue) => {
    if (issue.safeFix === undefined) {
      return;
    }
    const requestId = createRequestId();
    activePlanRequestRef.current = requestId;
    sendToPlugin({
      type: "MOTION_PLAN_OPERATION_REQUEST",
      requestId,
      nodeId: issue.safeFix.nodeId,
      targetIds: issue.safeFix.targetIds,
      operation: issue.safeFix.operation
    });
  }, [createRequestId, sendToPlugin]);

  const revealIssue = useCallback((issue: QaIssue) => {
    if (issue.nodeId === undefined) return;
    sendToPlugin({ type: "SCOPE_REVEAL_NODE_REQUEST", requestId: createRequestId(), nodeId: issue.nodeId });
  }, [createRequestId, sendToPlugin]);

  const dismissPreview = useCallback(() => {
    setPreviewPlan(null);
    onContextDrawerChange(null);
    dispatchApplicationEvent({ type: "DRAFT_CLEARED" });
  }, [dispatchApplicationEvent, onContextDrawerChange]);

  const applyPreview = useCallback(() => {
    if (previewPlan === null || activeApplyRequestRef.current !== null) return;
    const requestId = createRequestId();
    activeApplyRequestRef.current = requestId;
    sendToPlugin({ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST", requestId, plan: previewPlan });
    dispatchApplicationEvent({ type: "APPLY_STARTED", operationId: planIdForLifecycle(previewPlan, requestId) });
  }, [createRequestId, dispatchApplicationEvent, previewPlan, sendToPlugin]);

  useEffect(() => {
    if (previewPlan !== null) {
      onContextDrawerChange(
        <ContextDrawerShell
          description="Safe fix preview uses the existing guarded Apply workflow."
          footer={<div className="edit-drawer-actions"><button onClick={dismissPreview} type="button">Dismiss</button><button disabled={previewPlan.mutations.length === 0} onClick={applyPreview} type="button">Apply</button></div>}
          mode="change-preview"
          onClose={dismissPreview}
          open={true}
          title="QA safe-fix preview"
        >
          <ChangePreview plan={previewPlan} />
        </ContextDrawerShell>
      );
      return;
    }
    if (selectedIssue !== null) {
      onContextDrawerChange(
        <ContextDrawerShell description={selectedIssue.detail} mode="context" onClose={() => { setSelectedIssue(null); }} open={true} title={selectedIssue.message}>
          <dl className="sequence-property-list">
            <div><dt>Severity</dt><dd>{selectedIssue.severity}</dd></div>
            <div><dt>Status</dt><dd>{selectedIssue.status}</dd></div>
            <div><dt>Rule</dt><dd>{selectedIssue.ruleId}</dd></div>
            <div><dt>Target</dt><dd>{selectedIssue.nodeId ?? "Global"}</dd></div>
          </dl>
          <div className="review-actions">
            <button onClick={() => { revealIssue(selectedIssue); }} type="button"><Icon name="eye" size={13} /><span>Reveal node</span></button>
            <button onClick={() => { setIgnoredIssueIds((current) => [...current, selectedIssue.id]); }} type="button">Ignore once</button>
            <button onClick={() => { setReviewedIssueIds((current) => [...current, selectedIssue.id]); }} type="button">Mark reviewed</button>
            <button onClick={() => { setExceptions((current) => [...current, { id: `exception-${selectedIssue.id}`, scope: "rule", ruleId: selectedIssue.ruleId, nodeId: selectedIssue.nodeId, property: selectedIssue.property, reason: "Reviewed in QA." }]); }} type="button">Add exception</button>
            <button disabled={selectedIssue.safeFix === undefined} onClick={() => { requestSafeFix(selectedIssue); }} type="button"><Icon name="sparkles" size={13} /><span>Build safe fix</span></button>
          </div>
        </ContextDrawerShell>
      );
      return;
    }
    onContextDrawerChange(null);
  }, [applyPreview, dismissPreview, onContextDrawerChange, previewPlan, requestSafeFix, revealIssue, selectedIssue]);

  return (
    <section aria-label="Review Motion" className="review-workspace">
      <div className="edit-header">
        <div>
          <h2>Review</h2>
          <p>{activeScope === null ? "No confirmed Scope is available." : `${String(activeScope.nodes.length)} scoped target(s) available for Standards and QA.`}</p>
        </div>
        <span className="edit-field-note">Active source: {standardSource}</span>
      </div>
      <div aria-label="Review tabs" className="edit-tabs" role="tablist">
        <button aria-selected={tab === "standards"} onClick={() => { setTab("standards"); }} role="tab" type="button"><Icon name="settings" size={13} /><span>Standards</span></button>
        <button aria-selected={tab === "qa"} onClick={() => { setTab("qa"); }} role="tab" type="button"><Icon name="qa" size={13} /><span>QA</span></button>
        <button aria-selected={tab === "handoff"} onClick={() => { setTab("handoff"); }} role="tab" type="button"><Icon name="handoff" size={13} /><span>Handoff</span></button>
      </div>
      {tab === "standards" ? (
        <section className="review-panel" aria-label="Standards">
          <div className="edit-field-grid">
            <label className="scope-field"><span>Name</span><input value={standards.name} onChange={(event) => { setStandards({ ...standards, name: event.currentTarget.value }); }} /></label>
            <label className="scope-field"><span>Version</span><input value={standards.metadata.version} onChange={(event) => { setStandards({ ...standards, metadata: { ...standards.metadata, version: event.currentTarget.value } }); }} /></label>
          </div>
          <textarea aria-label="Standards JSON" className="review-json" value={dirtyJson || exportStandardsJson(standards)} onChange={(event) => { setDirtyJson(event.currentTarget.value); }} />
          <div className="review-actions">
            <button onClick={importJson} type="button"><Icon name="check" size={13} /><span>Validate import</span></button>
            <button onClick={() => { setDirtyJson(exportStandardsJson(standards)); setStorageMessage("Exported deterministic JSON."); }} type="button"><Icon name="handoff" size={13} /><span>Export JSON</span></button>
            <button onClick={savePersonal} type="button"><Icon name="check" size={13} /><span>Save personal</span></button>
            <button onClick={saveFile} type="button"><Icon name="check" size={13} /><span>Save file standard</span></button>
          </div>
          <div className="review-summary" aria-label="Standards summary">
            <span>{String(standards.tokens.length)} token(s)</span>
            <span>{String(standards.interactionCategories.length)} interaction categor(ies)</span>
            <span>{String(standards.exceptions.length + exceptions.length)} exception(s)</span>
          </div>
        </section>
      ) : tab === "qa" ? (
        <section className="review-panel" aria-label="QA">
          <div className="review-actions">
            <button onClick={runQa} type="button"><Icon name="play" size={13} /><span>Run QA</span></button>
            <label className="scope-field">
              <span>Filter</span>
              <Select
                label="QA filter"
                onChange={setQaFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "error", label: "Error" },
                  { value: "warning", label: "Warning" },
                  { value: "suggestion", label: "Suggestion" },
                  { value: "information", label: "Information" }
                ]}
                value={qaFilter}
              />
            </label>
          </div>
          {qaResult === null ? <div className="scope-state">Run QA to evaluate active Scope Motion against the selected standards.</div> : (
            <>
              <div className="review-summary" aria-label="QA totals">
                <span>Error {String(qaResult.summary.bySeverity.error)}</span>
                <span>Warning {String(qaResult.summary.bySeverity.warning)}</span>
                <span>Suggestion {String(qaResult.summary.bySeverity.suggestion)}</span>
                <span>Information {String(qaResult.summary.bySeverity.information)}</span>
                <span>Not evaluated {String(qaResult.summary.notEvaluated.length)}</span>
              </div>
              <ul className="review-issue-list" aria-label="QA issues">
                {visibleIssues.map((issue) => (
                  <li key={issue.id} data-severity={issue.severity}>
                    <button onClick={() => { setSelectedIssue(issue); }} type="button">
                      <strong>{issue.severity}</strong>
                      <span>{issue.message}</span>
                      <small>{issue.nodeName ?? issue.nodeId ?? "Global"} {issue.property ?? ""}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {qaSnapshots.length === 0 ? <p className="edit-field-note">No readable Motion snapshots were returned.</p> : null}
            </>
          )}
        </section>
      ) : (
        <section className="review-panel review-handoff" aria-label="Handoff">
          <div className="review-summary" aria-label="Handoff summary">
            <span>{String(currentReport.scope.targetCount)} scoped target(s)</span>
            <span>{String(currentReport.targets.length)} Motion target(s)</span>
            <span>{String(currentReport.qa.totals.total)} QA issue(s)</span>
            <span>State: {currentReport.scope.staleState}</span>
            <span>Standards: {currentReport.metadata.standardsVersion ?? "not selected"}</span>
          </div>
          {currentReport.scope.staleState === "current" ? null : <p className="edit-field-note" role="status">Report data is {currentReport.scope.staleState}; rebuild after confirming Scope and running QA for current Motion.</p>}
          <div className="review-actions">
            <button onClick={buildReport} type="button"><Icon name="refresh" size={13} /><span>Refresh report</span></button>
            <button onClick={() => { setHandoffPreview("markdown"); }} aria-pressed={handoffPreview === "markdown"} type="button"><Icon name="eye" size={13} /><span>Markdown preview</span></button>
            <button onClick={() => { setHandoffPreview("json"); }} aria-pressed={handoffPreview === "json"} type="button"><Icon name="eye" size={13} /><span>JSON preview</span></button>
            <button onClick={() => { copyReport("markdown"); }} type="button"><Icon name="copy" size={13} /><span>Copy Markdown</span></button>
            <button onClick={() => { copyReport("json"); }} type="button"><Icon name="copy" size={13} /><span>Copy JSON</span></button>
            <button onClick={() => { exportReport("markdown"); }} type="button"><Icon name="handoff" size={13} /><span>Export Markdown</span></button>
            <button onClick={() => { exportReport("json"); }} type="button"><Icon name="handoff" size={13} /><span>Export JSON</span></button>
          </div>
          <pre className="handoff-preview" aria-label={handoffPreview === "markdown" ? "Markdown handoff preview" : "JSON handoff preview"}>
            {handoffPreview === "markdown" ? markdownPreview : jsonPreview}
          </pre>
          {handoffMessage === null ? null : <p className="edit-field-note" role="status">{handoffMessage}</p>}
        </section>
      )}
      {storageMessage === null ? null : <p className="edit-field-note" role="status">{storageMessage}</p>}
    </section>
  );
};
