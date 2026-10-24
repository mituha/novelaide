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
    path.join(rootDir, "making/notes/images/10"),
    path.join(rootDir, "making/notes/images/11"),
    path.join(rootDir, "making/notes/images/12"),
    path.join(rootDir, "making/notes/images/13"),
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
      viewport: { width: 1200, height: 800 },
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
      // 1. 小説「01_プロローグ.md」を開く
      const novelFile = page.locator(".file-row", { hasText: "01_プロローグ.md" });
      await novelFile.waitFor({ timeout: 5000 });
      await novelFile.click();

      await page.waitForSelector(".monaco-editor", { timeout: 10000 });
      await page.waitForTimeout(400);

      // プレビューボタンをクリックして縦書きスプリットビューを展開
      const previewBtn = page.locator(".editor-tab-action-btn");
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        await page.waitForSelector(".editor-split-container", { timeout: 5000 });
        await page.waitForTimeout(500);
      }

      // 2. 左アクティビティバーの検索アイコンをクリックして SearchPanel を開く
      const searchNavBtn = page.locator('.activity-bar.side-left .activity-button[title*="検索"]');
      if (await searchNavBtn.isVisible()) {
        await searchNavBtn.click();
        await page.waitForSelector(".search-panel-container", { timeout: 5000 });

        // 検索ワード「神代玲央」を入力して検索を実行
        const searchInput = page.locator(".search-input");
        await searchInput.fill("神代玲央");
        const submitBtn = page.locator(".search-submit-btn");
        await submitBtn.click();

        // 検索結果の表示を待機
        await page.waitForSelector(".search-file-group", { timeout: 5000 });
        await page.waitForTimeout(600);

        const searchOutPath = path.join(rootDir, `making/notes/images/13/13_汎用検索パネル結果ツリー_${t.name}.png`);
        await page.screenshot({ path: searchOutPath });
        console.log(`Saved: ${searchOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(searchOutPath, path.join(rootDir, "docs/dev/images/13_汎用検索パネル結果ツリー_ダークモード.png"));
          fs.copyFileSync(searchOutPath, path.join(rootDir, "docs/manual/images/13_汎用検索パネル結果ツリー_ダークモード.png"));
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
