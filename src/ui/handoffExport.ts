export type HandoffExportFormat = "markdown" | "json";

export interface HandoffActionResult {
  readonly ok: boolean;
  readonly message: string;
}

export const copyHandoffText = async (text: string, clipboard: Pick<Clipboard, "writeText"> | null = navigator.clipboard): Promise<HandoffActionResult> => {
  if (clipboard === null) {
    return { ok: false, message: "Clipboard is unavailable in this environment." };
  }
  try {
    await clipboard.writeText(text);
    return { ok: true, message: "Copied report to clipboard." };
  } catch {
    return { ok: false, message: "Clipboard write failed. The report is still available in preview." };
  }
};

export const exportHandoffFile = (
  text: string,
  options: {
    readonly format: HandoffExportFormat;
    readonly baseName: string;
    readonly documentRef?: Document;
    readonly urlRef?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  }
): HandoffActionResult => {
  const documentRef = options.documentRef ?? document;
  const urlRef = options.urlRef ?? URL;
  const extension = options.format === "markdown" ? "md" : "json";
  const mime = options.format === "markdown" ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8";
  const filename = `${sanitizeFilename(options.baseName)}.${extension}`;
  try {
    const blob = new Blob([text], { type: mime });
    const href = urlRef.createObjectURL(blob);
    const link = documentRef.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
    link.href = href;
    link.download = filename;
    link.rel = "noopener";
    link.click();
    urlRef.revokeObjectURL(href);
    return { ok: true, message: `Exported ${filename}.` };
  } catch {
    return { ok: false, message: "File export failed. The report content remains available in preview." };
  }
};

export const sanitizeFilename = (input: string): string => {
  const cleaned = input.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return cleaned.length === 0 ? "motionops-handoff-report" : cleaned.slice(0, 80);
};
