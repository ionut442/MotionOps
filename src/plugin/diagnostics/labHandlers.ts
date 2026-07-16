import { runMotionDiagnostic } from "./diagnosticRunner";
import {
  createOrRefreshP006Fixtures,
  clearP006Fixtures,
  runP006Test,
  verifyP006TargetPipeline,
  createP006RunManifest,
  createP006RunId
} from "./p006Fixtures";
import {
  clearP007Fixtures,
  createOrRefreshP007Fixtures,
  createP007RunManifest,
  runAllP007Cases,
  runP007Case,
  verifyP007TargetPipeline
} from "./p007Fixtures";
import {
  clearP008Fixtures,
  createOrRefreshP008Fixtures,
  createP008RunManifest,
  markP008ResponsePosted,
  runAllP008Cases,
  runP008Case,
  verifyP008TargetPipeline
} from "./p008Fixtures";
import {
  clearP009Fixtures,
  createOrRefreshP009Fixtures,
  createP009RunManifest,
  runAllP009Cases,
  runP009Case,
  verifyP009TargetPipeline
} from "./p009Fixtures";
import {
  clearP010Fixtures,
  createOrRefreshP010Fixtures,
  runP010Action,
  verifyP010TargetPipeline
} from "./p010Fixtures";
import {
  clearP011Fixtures,
  createOrRefreshP011Fixtures,
  createP011RunManifest,
  runAllP011Cases,
  runP011Case,
  verifyP011TargetPipeline
} from "./p011Fixtures";
import {
  clearP012Fixtures,
  createOrRefreshP012Fixtures,
  createP012RunManifest,
  runAllP012Cases,
  runP012Case,
  verifyP012TargetPipeline
} from "./p012Fixtures";
import { resolveDiagnosticTargets } from "./targetResolver";
import { p006TestDefinitions } from "../../shared/p006Registry";
import type { P006TargetPipelineResult } from "../../shared/diagnostics";
import { isMotionApiLabEnabled } from "../../shared/labConfig";
import { makeInvalidMessageError, type PluginToUiMessage, type UiToPluginMessage } from "../../shared/messages";

export interface MotionApiLabHandlerContext {
  readonly postToUi: (message: PluginToUiMessage) => void;
  readonly postPluginError: (requestId: string, error: unknown) => void;
}

let lastTargetPipelineResult: P006TargetPipelineResult | null = null;

export const handleMotionApiLabMessage = (
  message: UiToPluginMessage,
  { postToUi, postPluginError }: MotionApiLabHandlerContext
): void => {
  if (message.type === "MOTION_DIAGNOSTIC_REQUEST") {
    if (!isMotionApiLabEnabled()) {
      postToUi(
        makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId)
      );
      return;
    }

    void (async () => {
      const targets = await resolveDiagnosticTargets(message.target);
      return runMotionDiagnostic(message.command, targets, message.testContext);
    })().then((diagnosticResult) => {
      postToUi({
        type: "MOTION_DIAGNOSTIC_RESULT",
        requestId: message.requestId,
        result: diagnosticResult
      });
    });
    return;
  }

  if (message.type === "P006_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(
        makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId)
      );
      return;
    }

    void verifyP006TargetPipeline().then((result) => {
      lastTargetPipelineResult = result;
      postToUi({
        type: "P006_TARGET_PIPELINE_RESULT",
        requestId: message.requestId,
        result
      });
    });
    return;
  }

  if (message.type === "P006_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(
        makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId)
      );
      return;
    }

    const action =
      message.command === "CREATE_OR_REFRESH_ALL" ? createOrRefreshP006Fixtures : clearP006Fixtures;
    void action().then((fixtureResult) => {
      postToUi({
        type: "P006_FIXTURE_RESULT",
        requestId: message.requestId,
        result: fixtureResult
      });
    });
    return;
  }

  if (message.type === "P006_RUN_TEST") {
    if (!isMotionApiLabEnabled()) {
      postToUi(
        makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId)
      );
      return;
    }

    void runP006Test(message.testId).then((testResult) => {
      postToUi({
        type: "P006_TEST_RUN_RESULT",
        requestId: message.requestId,
        result: testResult
      });
    });
    return;
  }

  if (message.type === "P006_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(
        makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId)
      );
      return;
    }

    void (async () => {
      const startedAt = new Date().toISOString();
      const runId = createP006RunId();
      const results = [];
      for (const definition of p006TestDefinitions) {
        results.push(await runP006Test(definition.id, runId));
      }
      const finishedAt = new Date().toISOString();
      postToUi({
        type: "P006_RUN_ALL_RESULT",
        requestId: message.requestId,
        results,
        manifest: createP006RunManifest(runId, startedAt, finishedAt, results, lastTargetPipelineResult)
      });
    })();
    return;
  }

  if (message.type === "P007_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CREATE_OR_REFRESH_ALL" ? createOrRefreshP007Fixtures : clearP007Fixtures;
    void action().then((fixtureResult) => {
      postToUi({ type: "P007_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
    });
    return;
  }

  if (message.type === "P007_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP007TargetPipeline().then((result) => {
      postToUi({ type: "P007_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
    });
    return;
  }

  if (message.type === "P007_RUN_CASE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP007Case(message.caseId).then((result) => {
      postToUi({
        type: "P007_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP007RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P007_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runAllP007Cases().then((result) => {
      postToUi({
        type: "P007_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP007RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P008_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CREATE_OR_REFRESH_ALL" ? createOrRefreshP008Fixtures : clearP008Fixtures;
    void action().then((fixtureResult) => {
      postToUi({ type: "P008_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
    });
    return;
  }

  if (message.type === "P008_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP008TargetPipeline().then((result) => {
      postToUi({ type: "P008_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
    });
    return;
  }

  if (message.type === "P008_RUN_CASE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP008Case(message.caseId, undefined, { requestId: message.requestId, message: "P008_RUN_CASE" }).then((result) => {
      markP008ResponsePosted(result);
      postToUi({
        type: "P008_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP008RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P008_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runAllP008Cases(undefined, { requestId: message.requestId, message: "P008_RUN_ALL" }).then((result) => {
      markP008ResponsePosted(result);
      postToUi({
        type: "P008_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP008RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P009_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CREATE_OR_REFRESH_ALL" ? createOrRefreshP009Fixtures : clearP009Fixtures;
    void action().then((fixtureResult) => {
      postToUi({ type: "P009_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
    });
    return;
  }

  if (message.type === "P009_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP009TargetPipeline().then((result) => {
      postToUi({ type: "P009_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
    });
    return;
  }

  if (message.type === "P009_RUN_CASE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP009Case(message.caseId, undefined, { requestId: message.requestId, message: "P009_RUN_CASE" }).then((result) => {
      postToUi({
        type: "P009_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP009RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P009_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runAllP009Cases(undefined, { requestId: message.requestId, message: "P009_RUN_ALL" }).then((result) => {
      postToUi({
        type: "P009_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest: createP009RunManifest(result)
      });
    });
    return;
  }

  if (message.type === "P010_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CREATE_OR_REFRESH_ALL" ? createOrRefreshP010Fixtures : clearP010Fixtures;
    void action().then((fixtureResult) => {
      postToUi({ type: "P010_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
    });
    return;
  }

  if (message.type === "P010_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP010TargetPipeline().then((result) => {
      postToUi({ type: "P010_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
    });
    return;
  }

  if (message.type === "P010_RUN_ACTION") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP010Action(message.caseId, message.action, undefined, message.strategyId).then(({ result, manifest }) => {
      postToUi({
        type: "P010_RUN_RESULT",
        requestId: message.requestId,
        result,
        manifest
      });
    });
    return;
  }

  if (message.type === "P011_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CLEAR_GENERATED" ? clearP011Fixtures : createOrRefreshP011Fixtures;
    void action()
      .then((fixtureResult) => {
        postToUi({ type: "P011_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P011_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP011TargetPipeline()
      .then((result) => {
        postToUi({ type: "P011_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P011_RUN_CASE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP011Case(message.caseId)
      .then((result) => {
        postToUi({
          type: "P011_RUN_RESULT",
          requestId: message.requestId,
          result,
          manifest: createP011RunManifest(result)
        });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P011_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runAllP011Cases()
      .then((result) => {
        postToUi({
          type: "P011_RUN_RESULT",
          requestId: message.requestId,
          result,
          manifest: createP011RunManifest(result)
        });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P012_FIXTURE_COMMAND") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    const action =
      message.command === "CLEAR_GENERATED" ? clearP012Fixtures : createOrRefreshP012Fixtures;
    void action()
      .then((fixtureResult) => {
        postToUi({ type: "P012_FIXTURE_RESULT", requestId: message.requestId, result: fixtureResult });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P012_VERIFY_TARGET_PIPELINE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void verifyP012TargetPipeline()
      .then((result) => {
        postToUi({ type: "P012_TARGET_PIPELINE_RESULT", requestId: message.requestId, result });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P012_RUN_CASE") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runP012Case(message.caseId)
      .then((result) => {
        postToUi({
          type: "P012_RUN_RESULT",
          requestId: message.requestId,
          result,
          manifest: createP012RunManifest(result)
        });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "P012_RUN_ALL") {
    if (!isMotionApiLabEnabled()) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void runAllP012Cases()
      .then((result) => {
        postToUi({
          type: "P012_RUN_RESULT",
          requestId: message.requestId,
          result,
          manifest: createP012RunManifest(result)
        });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }


};
