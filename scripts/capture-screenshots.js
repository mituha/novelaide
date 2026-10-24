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
      await page.waitForTimeout(500);

      // プレビューボタンをクリックして縦書きスプリットビューを展開
      const previewBtn = page.locator(".editor-tab-action-btn");
      if (await previewBtn.isVisible()) {
        await previewBtn.click();
        await page.waitForSelector(".editor-split-container", { timeout: 5000 });
        await page.waitForTimeout(600);
      }

      // 2. 右側アクティビティバーの見出しアウトラインボタンをクリックして右ペインを展開
      const rightActivityBtn = page.locator(".activity-bar.side-right .activity-button").first();
      if (await rightActivityBtn.isVisible()) {
        await rightActivityBtn.click();
        await page.waitForSelector(".side-pane-container.pane-right", { timeout: 5000 });
        await page.waitForTimeout(800);

        // 左右ペイン（左: ファイルツリー、中央: スプリットエディター、右: アウトライン）の撮影 (11)
        const uiOutPath = path.join(rootDir, `making/notes/images/11/11_統合UIプラグイン左右対称ペイン_${t.name}.png`);
        await page.screenshot({ path: uiOutPath });
        console.log(`Saved: ${uiOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(uiOutPath, path.join(rootDir, "docs/dev/images/11_統合UIプラグイン左右対称ペイン_ダークモード.png"));
          fs.copyFileSync(uiOutPath, path.join(rootDir, "docs/manual/images/11_統合UIプラグイン左右対称ペイン_ダークモード.png"));
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
