import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

// 静的ファイルサーバー
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

  // ディレクトリ作成
  const outDirs = [
    path.join(rootDir, "making/notes/images/02"),
    path.join(rootDir, "docs/manual/images"),
    path.join(rootDir, "docs/dev/images"),
  ];

  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Chrome を起動
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const url = `http://localhost:${port}`;

  // 1. ライトモード
  {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      colorScheme: "light",
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    const lightPath = path.join(rootDir, "making/notes/images/02/02_初期画面_ライトモード.png");
    await page.screenshot({ path: lightPath });
    console.log(`Saved: ${lightPath}`);

    // マニュアルと仕様書にもコピー
    fs.copyFileSync(lightPath, path.join(rootDir, "docs/manual/images/02_初期画面_ライトモード.png"));
    fs.copyFileSync(lightPath, path.join(rootDir, "docs/dev/images/02_初期画面_ライトモード.png"));

    await context.close();
  }

  // 2. ダークモード
  {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      colorScheme: "dark",
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    const darkPath = path.join(rootDir, "making/notes/images/02/02_初期画面_ダークモード.png");
    await page.screenshot({ path: darkPath });
    console.log(`Saved: ${darkPath}`);

    fs.copyFileSync(darkPath, path.join(rootDir, "docs/manual/images/02_初期画面_ダークモード.png"));
    fs.copyFileSync(darkPath, path.join(rootDir, "docs/dev/images/02_初期画面_ダークモード.png"));

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
