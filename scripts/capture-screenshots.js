import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

function createServer() {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
  };

  return http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === "/" ? "index.html" : req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end("Error loading file");
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      }
    });
  });
}

async function capture() {
  const server = createServer();
  const port = 4173;
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Preview server listening on http://localhost:${port}`);

  const outDirs = [
    path.join(rootDir, "making/notes/images/05"),
    path.join(rootDir, "making/notes/images/07"),
    path.join(rootDir, "docs/manual/images"),
    path.join(rootDir, "docs/dev/images"),
  ];

  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const url = `http://localhost:${port}`;

  const themes = [
    { name: "ダークモード", id: "dark" },
    { name: "ライトモード", id: "light" },
    { name: "セピアモード", id: "sepia" },
  ];

  // 1. ファイルエクスプローラー（05）の撮影
  for (const t of themes) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    await page.evaluate(({ themeId }) => {
      localStorage.setItem("novelaide-theme", themeId);
      localStorage.setItem("novelaide-current-project", "D:\\Novels\\猫と魔法使いの旅路");
      document.documentElement.setAttribute("data-theme", themeId);
    }, { themeId: t.id });

    await page.reload({ waitUntil: "networkidle" });

    try {
      const folder = page.locator(".folder-row", { hasText: "characters" });
      await folder.click();
      await page.waitForTimeout(300);
    } catch {}

    const outPath = path.join(rootDir, `making/notes/images/05/05_ファイルエクスプローラー_${t.name}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);

    // 2. 本文エディター（07）の撮影: ファイルをクリックしてエディターを開く
    try {
      const fileItem = page.locator(".file-row", { hasText: "01_プロローグ.md" });
      await fileItem.waitFor({ timeout: 5000 });
      await fileItem.click();

      // Monaco Editor のレンダリング完了を待機
      await page.waitForSelector(".monaco-editor", { timeout: 10000 });
      await page.waitForTimeout(1500);

      const editorOutPath = path.join(rootDir, `making/notes/images/07/07_小説エディター_${t.name}.png`);
      await page.screenshot({ path: editorOutPath });
      console.log(`Saved: ${editorOutPath}`);

      // docs/manual, docs/dev へもコピー
      if (t.id === "dark") {
        fs.copyFileSync(editorOutPath, path.join(rootDir, "docs/dev/images/07_小説エディター_ダークモード.png"));
        fs.copyFileSync(editorOutPath, path.join(rootDir, "docs/manual/images/07_小説エディター_ダークモード.png"));
      }
    } catch (e) {
      console.warn("エディター撮影スキップ:", e);
    }

    await context.close();
  }

  await browser.close();
  server.close();
  console.log("Capture completed successfully!");
}

capture().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
