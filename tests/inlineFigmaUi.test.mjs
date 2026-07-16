import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inlineFigmaUiAssets } from "../scripts/inline-figma-ui.mjs";

describe("Figma UI asset inliner", () => {
  it("converts Vite asset references into a single HTML payload", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "motionops-inline-"));
    await mkdir(path.join(root, "assets"));
    const htmlPath = path.join(root, "index.html");

    await writeFile(
      htmlPath,
      [
        "<!doctype html>",
        "<html>",
        "<head>",
        '<script type="module" crossorigin src="/assets/app.js"></script>',
        '<link rel="stylesheet" crossorigin href="/assets/app.css">',
        "</head>",
        "<body><div id=\"root\"></div></body>",
        "</html>"
      ].join("\n"),
      "utf8"
    );
    await writeFile(path.join(root, "assets", "app.js"), 'console.log("</script> safe");', "utf8");
    await writeFile(path.join(root, "assets", "app.css"), "body { color: red; }", "utf8");

    const inlined = await inlineFigmaUiAssets(htmlPath);
    const output = await readFile(htmlPath, "utf8");

    expect(inlined).toEqual({ scripts: ["/assets/app.js"], styles: ["/assets/app.css"] });
    expect(output).toContain('data-motionops-inlined="/assets/app.js"');
    expect(output).toContain('data-motionops-inlined="/assets/app.css"');
    expect(output).toContain("<\\/script> safe");
    expect(output).toContain("body { color: red; }");
    expect(output).toContain('<div id="root"></div>');
    expect(output).not.toContain('src="/assets/app.js"');
    expect(output).not.toContain('href="/assets/app.css"');
  });
});
