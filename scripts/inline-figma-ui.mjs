import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultHtmlPath = path.resolve("dist", "index.html");

const resolveAssetPath = (distDir, assetUrl) => {
  const normalizedUrl = decodeURIComponent(assetUrl).replace(/^\/+/, "");
  return path.join(distDir, normalizedUrl);
};

const escapeInlineScript = (source) => source.replace(/<\/script/gi, "<\\/script");

export const inlineFigmaUiAssets = async (htmlPath = defaultHtmlPath) => {
  const distDir = path.dirname(htmlPath);
  let html = await readFile(htmlPath, "utf8");
  const inlined = { scripts: [], styles: [] };

  html = await replaceAsync(
    html,
    /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+)")[^>]*>/g,
    async (tag, href) => {
      const assetPath = resolveAssetPath(distDir, href);
      const css = await readFile(assetPath, "utf8");
      inlined.styles.push(href);
      return `<style data-motionops-inlined="${href}">\n${css}\n</style>`;
    }
  );

  html = await replaceAsync(
    html,
    /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+)")[^>]*><\/script>/g,
    async (tag, src) => {
      const assetPath = resolveAssetPath(distDir, src);
      const js = await readFile(assetPath, "utf8");
      inlined.scripts.push(src);
      return `<script type="module" data-motionops-inlined="${src}">\n${escapeInlineScript(js)}\n</script>`;
    }
  );

  await writeFile(htmlPath, html, "utf8");
  return inlined;
};

const replaceAsync = async (value, pattern, replacer) => {
  const replacements = await Promise.all(
    [...value.matchAll(pattern)].map((match) => replacer(match[0], ...match.slice(1)))
  );

  let index = 0;
  return value.replace(pattern, () => replacements[index++]);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const htmlPath = process.argv[2] === undefined ? defaultHtmlPath : path.resolve(process.argv[2]);
  const inlined = await inlineFigmaUiAssets(htmlPath);
  const relativeHtmlPath = path.relative(process.cwd(), htmlPath);
  console.log(
    `Inlined Figma UI assets into ${relativeHtmlPath}: ${inlined.scripts.length.toString()} script(s), ${inlined.styles.length.toString()} stylesheet(s).`
  );
}

export const __filename = fileURLToPath(import.meta.url);
