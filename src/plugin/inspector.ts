import { readMotionSnapshot } from "./motion/read";
import type { MotionInspectFailure, MotionInspectResult } from "../shared/messages";

export const inspectMotionTargets = async (
  nodeIds: readonly string[],
  options: {
    readonly requestId: string;
    readonly isStale?: () => boolean;
  }
): Promise<MotionInspectResult | null> => {
  const snapshots = [];
  const failures: MotionInspectFailure[] = [];

  for (const nodeId of nodeIds) {
    if (options.isStale?.()) {
      return null;
    }

    const result = await readMotionSnapshot(nodeId, { requestId: options.requestId });
    if (result.ok) {
      snapshots.push(result.value);
    } else {
      failures.push({
        nodeId,
        code: result.error.code,
        message: result.error.message
      });
    }
  }

  return {
    requestedNodeIds: [...nodeIds],
    snapshots,
    failures
  };
};
