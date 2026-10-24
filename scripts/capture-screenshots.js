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
    path.join(rootDir, "making/notes/images/14"),
    path.join(rootDir, "making/notes/images/15"),
    path.join(rootDir, "making/notes/images/16"),
    path.join(rootDir, "making/notes/images/17"),
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
      await page.waitForTimeout(1000);

      // 1. 小説「01_プロローグ.md」を開く
      const novelFile = page.locator(".file-row", { hasText: "01_プロローグ.md" });
      await novelFile.waitFor({ timeout: 10000 });
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

      // 1.5 右アクティビティバーのメタデータアイコンをクリックして右ペインに MetadataPanel を展開
      const metaNavBtn = page.locator('.activity-bar.side-right .activity-button[title*="メタデータ"]');
      if (await metaNavBtn.isVisible()) {
        await metaNavBtn.click();
        await page.waitForSelector(".metadata-panel-root", { timeout: 5000 });
        await page.waitForTimeout(600);

        const metaOutPath = path.join(rootDir, `making/notes/images/16/16_メタデータ編集パネル_${t.name}.png`);
        await page.screenshot({ path: metaOutPath });
        console.log(`Saved: ${metaOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(metaOutPath, path.join(rootDir, "docs/dev/images/16_メタデータ編集パネル_ダークモード.png"));
          fs.copyFileSync(metaOutPath, path.join(rootDir, "docs/manual/images/16_メタデータ編集パネル_ダークモード.png"));
        }

        // メタデータパネルを閉じて以降の撮影に影響しないようにする
        await metaNavBtn.click();
        await page.waitForTimeout(300);
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

      // 3. 左アクティビティバーのソース管理（Git）アイコンをクリックして GitPanel を開く
      const gitNavBtn = page.locator('.activity-bar.side-left .activity-button[title*="ソース管理"]');
      if (await gitNavBtn.isVisible()) {
        await gitNavBtn.click();
        await page.waitForSelector(".git-panel-container", { timeout: 5000 });
        await page.waitForTimeout(500);

        // 変更一覧にある「01_プロローグ.md」をクリックして Monaco DiffEditorView を表示
        const diffFileItem = page.locator('.git-file-row:has-text("01_プロローグ.md")');
        if (await diffFileItem.isVisible()) {
          await diffFileItem.click();
          await page.waitForSelector(".diff-editor-view-container", { timeout: 5000 });
          await page.waitForTimeout(1000);
        }

        const gitOutPath = path.join(rootDir, `making/notes/images/15/15_Gitソース管理と差分比較_${t.name}.png`);
        await page.screenshot({ path: gitOutPath });
        console.log(`Saved: ${gitOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(gitOutPath, path.join(rootDir, "docs/dev/images/15_Gitソース管理と差分比較_ダークモード.png"));
          fs.copyFileSync(gitOutPath, path.join(rootDir, "docs/manual/images/15_Gitソース管理と差分比較_ダークモード.png"));
        }
      }

      // 4. 右アクティビティバーの「AI執筆パートナー」をクリックして ChatPanel を展開
      const aiNavBtn = page.locator('.activity-bar.side-right .activity-button[title="AI執筆パートナー"]');
      if (await aiNavBtn.isVisible()) {
        await aiNavBtn.click();
        await page.waitForSelector(".ai-chat-panel", { timeout: 5000 });
        await page.waitForTimeout(600);

        // 「担当編集者」ペルソナを選択
        const editorPersonaBtn = page.locator('.ai-persona-chip:has-text("担当編集者")');
        if (await editorPersonaBtn.isVisible()) {
          await editorPersonaBtn.click();
          await page.waitForTimeout(300);
        }

        const aiOutPath = path.join(rootDir, `making/notes/images/17/17_AI執筆パートナー_${t.name}.png`);
        await page.screenshot({ path: aiOutPath });
        console.log(`Saved: ${aiOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(aiOutPath, path.join(rootDir, "docs/dev/images/17_AI執筆パートナー_ダークモード.png"));
          fs.copyFileSync(aiOutPath, path.join(rootDir, "docs/manual/images/17_AI執筆パートナー_ダークモード.png"));
        }
      }

      // 5. 左アクティビティバー最下部の環境設定（歯車アイコン）をクリックして SettingsModal を開く
      const settingsNavBtn = page.locator('.activity-bar.side-left .activity-button[title="環境設定"]');
      if (await settingsNavBtn.isVisible()) {
        await settingsNavBtn.click();
        await page.waitForSelector(".settings-modal-container", { timeout: 5000 });

        // 「エディター」タブを選択してエディター設定画面を展開
        const editorTabBtn = page.locator('.settings-nav-item:has-text("エディター")');
        if (await editorTabBtn.isVisible()) {
          await editorTabBtn.click();
          await page.waitForTimeout(400);
        }

        const settingsOutPath = path.join(rootDir, `making/notes/images/14/14_環境設定モーダル_${t.name}.png`);
        await page.screenshot({ path: settingsOutPath });
        console.log(`Saved: ${settingsOutPath}`);

        if (t.id === "dark") {
          fs.copyFileSync(settingsOutPath, path.join(rootDir, "docs/dev/images/14_環境設定モーダル_ダークモード.png"));
          fs.copyFileSync(settingsOutPath, path.join(rootDir, "docs/manual/images/14_環境設定モーダル_ダークモード.png"));
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
