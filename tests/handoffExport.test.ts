import { describe, expect, it, vi } from "vitest";
import { copyHandoffText, exportHandoffFile, sanitizeFilename } from "../src/ui/handoffExport";

describe("Phase 9 handoff export helpers", () => {
  it("copies only through explicit user actions and reports clipboard failures safely", async () => {
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    await expect(copyHandoffText("report", { writeText })).resolves.toMatchObject({ ok: true });
    expect(writeText).toHaveBeenCalledWith("report");

    const failing = vi.fn<Clipboard["writeText"]>().mockRejectedValue(new Error("denied"));
    await expect(copyHandoffText("report", { writeText: failing })).resolves.toMatchObject({ ok: false });
    await expect(copyHandoffText("report", null)).resolves.toMatchObject({ ok: false });
  });

  it("exports deterministic safe filenames with MIME-specific blobs", () => {
    const click = vi.fn();
    const link = { href: "", download: "", rel: "", click } as unknown as HTMLAnchorElement;
    const createElementNS = vi.fn<Document["createElementNS"]>().mockReturnValue(link);
    const createObjectURL = vi.fn<typeof URL.createObjectURL>().mockReturnValue("blob:report");
    const revokeObjectURL = vi.fn<typeof URL.revokeObjectURL>();
    const result = exportHandoffFile("{}", {
      format: "json",
      baseName: "MotionOps: Handoff / Layer * Name",
      documentRef: { createElementNS } as unknown as Document,
      urlRef: { createObjectURL, revokeObjectURL }
    });

    expect(result.ok).toBe(true);
    expect(link.download).toBe("motionops-handoff-layer-name.json");
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    expect(sanitizeFilename("")).toBe("motionops-handoff-report");
  });
});
