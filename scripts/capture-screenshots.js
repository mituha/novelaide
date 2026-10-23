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
    path.join(rootDir, "making/notes/images/04"),
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

  const mockRecentProjects = [
    { name: "猫と魔法使いの旅路", path: "D:\\Novels\\猫と魔法使いの旅路" },
    { name: "雨降る街の喫茶店", path: "D:\\Novels\\雨降る街の喫茶店" },
  ];

  const themes = [
    { name: "ダークモード", id: "dark", file: "04_プロジェクト選択_ダークモード.png" },
    { name: "ライトモード", id: "light", file: "04_プロジェクト選択_ライトモード.png" },
    { name: "セピアモード", id: "sepia", file: "04_プロジェクト選択_セピアモード.png" },
  ];

  for (const t of themes) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });

    // モックデータとテーマを注入
    await page.evaluate(({ themeId, projects }) => {
      localStorage.setItem("novelaide-theme", themeId);
      localStorage.removeItem("novelaide-current-project"); // ランチャーを表示させるため
      localStorage.setItem("novelaide-recent-projects", JSON.stringify(projects));
      document.documentElement.setAttribute("data-theme", themeId);
    }, { themeId: t.id, projects: mockRecentProjects });

    await page.reload({ waitUntil: "networkidle" });

    const outPath = path.join(rootDir, `making/notes/images/04/${t.file}`);
    await page.screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);

    fs.copyFileSync(outPath, path.join(rootDir, `docs/manual/images/${t.file}`));
    fs.copyFileSync(outPath, path.join(rootDir, `docs/dev/images/${t.file}`));

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
