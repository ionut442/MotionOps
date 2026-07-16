export type CancelableOperationKind =
  | "scope-scan"
  | "motion-inspect"
  | "motion-plan"
  | "motion-clipboard"
  | "motion-paste-plan"
  | "standards-storage"
  | "handoff-report";

export interface CancelableRequestHandle {
  readonly kind: CancelableOperationKind;
  readonly requestId: string;
  readonly isCancelled: () => boolean;
  readonly cancel: () => void;
}

export interface CancellationRegistry {
  readonly start: (kind: CancelableOperationKind, requestId: string) => CancelableRequestHandle;
  readonly cancel: (kind: CancelableOperationKind, requestId: string) => boolean;
  readonly cancelKind: (kind: CancelableOperationKind) => number;
  readonly isCurrent: (kind: CancelableOperationKind, requestId: string) => boolean;
  readonly isCancelled: (kind: CancelableOperationKind, requestId: string) => boolean;
  readonly complete: (kind: CancelableOperationKind, requestId: string) => boolean;
  readonly activeRequestIds: (kind: CancelableOperationKind) => readonly string[];
}

interface MutableHandle {
  readonly kind: CancelableOperationKind;
  readonly requestId: string;
  cancelled: boolean;
}

export const createCancellationRegistry = (): CancellationRegistry => {
  const active = new Map<CancelableOperationKind, MutableHandle>();

  const publicHandle = (handle: MutableHandle): CancelableRequestHandle => ({
    kind: handle.kind,
    requestId: handle.requestId,
    isCancelled: () => handle.cancelled,
    cancel: () => {
      handle.cancelled = true;
    }
  });

  return {
    start: (kind, requestId) => {
      const previous = active.get(kind);
      if (previous !== undefined) {
        previous.cancelled = true;
      }
      const handle: MutableHandle = { kind, requestId, cancelled: false };
      active.set(kind, handle);
      return publicHandle(handle);
    },
    cancel: (kind, requestId) => {
      const handle = active.get(kind);
      if (handle?.requestId !== requestId) {
        return false;
      }
      handle.cancelled = true;
      return true;
    },
    cancelKind: (kind) => {
      const handle = active.get(kind);
      if (handle === undefined) {
        return 0;
      }
      handle.cancelled = true;
      return 1;
    },
    isCurrent: (kind, requestId) => {
      const handle = active.get(kind);
      return handle?.requestId === requestId && !handle.cancelled;
    },
    isCancelled: (kind, requestId) => {
      const handle = active.get(kind);
      return handle?.requestId === requestId ? handle.cancelled : true;
    },
    complete: (kind, requestId) => {
      const handle = active.get(kind);
      if (handle?.requestId !== requestId) {
        return false;
      }
      active.delete(kind);
      return !handle.cancelled;
    },
    activeRequestIds: (kind) => {
      const handle = active.get(kind);
      return handle === undefined || handle.cancelled ? [] : [handle.requestId];
    }
  };
};
