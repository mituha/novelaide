import * as novelaidFs from "tauri-plugin-novelaid-fs-api";
import { DirEntry, FileDocument } from "../types/document";

// ブラウザ環境やプレビュー撮影用のモックデータ
const MOCK_ENTRIES: DirEntry[] = [
  {
    name: "01_プロローグ.md",
    path: "mock/01_プロローグ.md",
    baseName: "01_プロローグ.md",
    fileTitle: "01_プロローグ",
    isDirectory: false,
    documentType: "novel",
    children: null,
  },
  {
    name: "02_第1章_出会い.md",
    path: "mock/02_第1章_出会い.md",
    baseName: "02_第1章_出会い.md",
    fileTitle: "02_第1章_出会い",
    isDirectory: false,
    documentType: "novel",
    children: null,
  },
  {
    name: "03_第2章_旅立ち.md",
    path: "mock/03_第2章_旅立ち.md",
    baseName: "03_第2章_旅立ち.md",
    fileTitle: "03_第2章_旅立ち",
    isDirectory: false,
    documentType: "novel",
    children: null,
  },
  {
    name: "characters",
    path: "mock/characters",
    baseName: "characters",
    fileTitle: "characters",
    isDirectory: true,
    documentType: "markdown",
    children: [
      {
        name: "主人公_ソラ.md",
        path: "mock/characters/主人公_ソラ.md",
        baseName: "主人公_ソラ.md",
        fileTitle: "主人公_ソラ",
        isDirectory: false,
        documentType: "markdown",
        children: null,
      },
      {
        name: "魔女_ルナ.md",
        path: "mock/characters/魔女_ルナ.md",
        baseName: "魔女_ルナ.md",
        fileTitle: "魔女_ルナ",
        isDirectory: false,
        documentType: "markdown",
        children: null,
      },
    ],
  },
  {
    name: "settings",
    path: "mock/settings",
    baseName: "settings",
    fileTitle: "settings",
    isDirectory: true,
    documentType: "markdown",
    children: [
      {
        name: "世界観_帝国史.md",
        path: "mock/settings/世界観_帝国史.md",
        baseName: "世界観_帝国史.md",
        fileTitle: "世界観_帝国史",
        isDirectory: false,
        documentType: "markdown",
        children: null,
      },
    ],
  },
  {
    name: "assets",
    path: "mock/assets",
    baseName: "assets",
    fileTitle: "assets",
    isDirectory: true,
    documentType: "image",
    children: [
      {
        name: "大陸地図.png",
        path: "mock/assets/大陸地図.png",
        baseName: "大陸地図.png",
        fileTitle: "大陸地図",
        isDirectory: false,
        documentType: "image",
        children: null,
      },
    ],
  },
];

export const fileService = {
  // プロジェクトディレクトリの設定
  async setProjectDirectory(path: string | null): Promise<void> {
    try {
      await novelaidFs.setProjectDirectory(path);
    } catch (err) {
      console.warn("setProjectDirectory fallback:", err);
    }
  },

  // 現在のプロジェクトディレクトリの取得
  async getProjectDirectory(): Promise<string | null> {
    try {
      return await novelaidFs.getProjectDirectory();
    } catch {
      return null;
    }
  },

  // フォルダ内のファイル・フォルダ一覧を再帰取得
  async readDirectory(path: string, recursive: boolean = true): Promise<DirEntry[]> {
    try {
      return await novelaidFs.readDirectory(path, recursive);
    } catch (err) {
      // ブラウザ環境やTauri外での実行時はモックを返却
      console.warn("Tauri IPC未接続のためモックデータを表示します:", err);
      return MOCK_ENTRIES;
    }
  },

  // ファイル読み込み（フロントマター付きMarkdownやテキスト）
  async readFile(path: string): Promise<FileDocument> {
    try {
      return await novelaidFs.readDocument(path);
    } catch {
      const baseName = path.split(/[/\\]/).pop() || "";
      const isMd = baseName.endsWith('.md');

      if (baseName.includes('魔女_ルナ') || baseName.includes('キャラクター')) {
        return {
          path,
          baseName,
          fileTitle: "魔女_ルナ",
          documentType: "markdown",
          metadata: { role: "ヒロイン", age: 17 },
          content: `# キャラクター設定：|魔女《まじょ》ルナ・アルテミス

月光の力を操る《《銀髪の天才少女》》。
主人公|神代玲央《かみしろれお》の幼馴染にして、魔法結社の最年少幹部。

## 能力値ステータス

\`\`\`radar{width=450}
---
title: "ルナ・アルテミス 能力チャート"
color: "#8A2BE2"
max: 100
---
魔力: 98
知力: 90
素早さ: 82
精神力: 75
攻撃力: 50
防御力: 45
運: 88
\`\`\`

## 人物相関図

\`\`\`mermaid
graph TD
    Luna["魔女ルナ<br/>(ヒロイン)"]
    Hero["神代玲央<br/>(主人公)"]
    Master["大賢者ギード<br/>(師匠)"]
    Empire["帝国軍特務隊"]

    Luna -->|"絶対の信頼"| Hero
    Hero -->|"守るべき存在"| Luna
    Master -->|"禁呪の伝承"| Luna
    Empire -.->|"暗殺標的"| Luna
\`\`\`

## 拠点マップ

\`\`\`map
id: luna-hideout
width: 100%
height: 380px
lat: 35.681236
long: 139.767125
defaultZoom: 13
marker:
  - book, 35.681236, 139.767125, 月影の秘密研究所, "古代の禁呪や調合器具が隠された拠点"
  - school, 35.689506, 139.691701, 王立魔導学園, "ルナが通っていたかつての学園"
  - default, 35.676231, 139.752311, 逢魔が時の辻, "主人公玲央と再会した交差点"
\`\`\`
`,
        };
      }

      return {
        path,
        baseName: "01_プロローグ.md",
        fileTitle: "01_プロローグ",
        content: `# プロローグ：運命の邂逅

　青い空の彼方から、一羽の鳥が舞い降りてきた。
　それは|漆黒《しっこく》の羽根を持つ、不思議な鳥だった。

「待っていたぞ、|神代玲央《かみしろれお》」

　鳥は突然、人の言葉を話した。
　少年の日常が、《《音を立てて崩れ去った》》瞬間だった。`,
        metadata: {},
        documentType: isMd ? "novel" : "novel",
      };
    }
  },

  // ファイル保存
  async writeFile(path: string, content: string, metadata: any = {}): Promise<void> {
    try {
      const doc: FileDocument = {
        path,
        baseName: path.split(/[/\\]/).pop() || "",
        fileTitle: (path.split(/[/\\]/).pop() || "").replace(/\.[^/.]+$/, ""),
        content,
        metadata,
        documentType: "novel",
      };
      await novelaidFs.writeDocument(path, doc);
    } catch (err) {
      console.warn("writeDocument fallback:", err);
    }
  },

  // 新規ファイル作成
  async createFile(path: string, content: string = ""): Promise<void> {
    try {
      await novelaidFs.createFile(path, content);
    } catch (err) {
      console.warn("createFile fallback:", err);
    }
  },

  // 新規フォルダ作成
  async createDirectory(path: string): Promise<void> {
    try {
      await novelaidFs.createDirectory(path);
    } catch (err) {
      console.warn("createDirectory fallback:", err);
    }
  },

  // ファイルまたはフォルダ削除
  async remove(path: string): Promise<void> {
    try {
      await novelaidFs.remove(path);
    } catch (err) {
      console.warn("remove fallback:", err);
    }
  },

  // リネーム
  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await novelaidFs.rename(oldPath, newPath);
    } catch (err) {
      console.warn("rename fallback:", err);
    }
  },

  // メタデータキャッシュ取得
  async getMetadataCache(): Promise<Record<string, any>> {
    try {
      return await novelaidFs.getMetadataCache();
    } catch (err) {
      console.warn("getMetadataCache fallback:", err);
      return {
        "mock/characters/主人公_ソラ.md": {
          title: "主人公 ソラ",
          name: "ソラ・アルスター",
          reading: "そら あるすたー",
          role: "主人公",
          gender: "男性",
          age: "17歳",
          tags: ["character", "主人公", "風魔法"],
          summary: "空の彼方から落ちてきた謎の少年。風を操る古代魔法の継承者。",
        },
        "mock/characters/魔女_ルナ.md": {
          title: "星詠みの魔女 ルナ",
          name: "ルナ・シルフィード",
          reading: "るな しるふぃーど",
          role: "ヒロイン / 導き手",
          gender: "女性",
          age: "16歳",
          tags: ["character", "ヒロイン", "星魔法"],
          summary: "星の言葉を聞くことができる静謐な少女。ソラの記憶を探す旅を共にする。",
        },
        "mock/settings/世界観_帝国史.md": {
          title: "アルテリア帝国史",
          tags: ["location", "歴史", "帝国", "世界観"],
          summary: "千年の栄華を誇る軍事大国。近年は禁忌の黒魔術を研究していると噂される。",
        },
        "mock/01_プロローグ.md": {
          title: "01_プロローグ",
          tags: ["plot", "第1章", "プロローグ"],
          summary: "青い空の彼方から漆黒の羽根を持つ鳥が舞い降り、日常が崩壊する導入部。",
        },
      };
    }
  },
};
