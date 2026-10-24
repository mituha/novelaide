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
    path.join(rootDir, "making/notes/images/08"),
    path.join(rootDir, "making/notes/images/09"),
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

    // ファイル「01_プロローグ.md」をクリックしてエディターを開く
    try {
      const fileItem = page.locator(".file-row", { hasText: "01_プロローグ.md" });
      await fileItem.waitFor({ timeout: 5000 });
      await fileItem.click();

      // Monaco Editor のレンダリング完了を待機
      await page.waitForSelector(".monaco-editor", { timeout: 10000 });
      await page.waitForTimeout(1000);

      // 1. エディター画面全体の撮影 (07)
      const editorOutPath = path.join(rootDir, `making/notes/images/07/07_小説エディター_${t.name}.png`);
      await page.screenshot({ path: editorOutPath });
      console.log(`Saved: ${editorOutPath}`);

      // 2. 文字数トリガーをクリックして詳細分析ポップアップを展開 (08)
      const charTrigger = page.locator(".status-char-count-trigger");
      await charTrigger.waitFor({ timeout: 5000 });
      await charTrigger.click();
      await page.waitForSelector(".char-count-popup", { timeout: 3000 });
      await page.waitForTimeout(500);

      const statusOutPath = path.join(rootDir, `making/notes/images/08/08_文字数カウント詳細分析_${t.name}.png`);
      await page.screenshot({ path: statusOutPath });
      console.log(`Saved: ${statusOutPath}`);

      // ポップアップを閉じるために背景をクリック
      await page.mouse.click(300, 300);
      await page.waitForTimeout(300);

      // 3. プレビューボタンをクリックして左右スプリットビューを展開 (09)
      const previewBtn = page.locator(".editor-tab-action-btn");
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        // プレビューコンテナまたはスプリットペインの出現を待機
        await page.waitForSelector(".editor-split-container", { timeout: 5000 });
        await page.waitForTimeout(1000);

        const splitOutPath = path.join(rootDir, `making/notes/images/09/09_スプリットビュー縦書きプレビュー_${t.name}.png`);
        await page.screenshot({ path: splitOutPath });
        console.log(`Saved: ${splitOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(splitOutPath, path.join(rootDir, "docs/dev/images/09_スプリットビュー縦書きプレビュー_ダークモード.png"));
          fs.copyFileSync(splitOutPath, path.join(rootDir, "docs/manual/images/09_スプリットビュー縦書きプレビュー_ダークモード.png"));
        }
      }
    } catch (e) {
      console.warn("撮影スキップ:", e);
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
