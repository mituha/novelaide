import * as novelaidFs from "tauri-plugin-novelaid-fs-api";
import * as novelaidMetadata from "tauri-plugin-novelaid-metadata-api";
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

  // ファイルステータス取得（軽量mtime確認）
  async getDocumentStat(path: string): Promise<novelaidFs.DocumentStat> {
    try {
      return await novelaidFs.getDocumentStat(path);
    } catch (err) {
      console.warn("getDocumentStat fallback:", err);
      return {
        path,
        exists: true,
        mtimeMs: Date.now(),
        size: 0,
      };
    }
  },

  // ファイル読み込み（フロントマター付きMarkdownやテキスト、画像、非対応ファイル）
  async readFile(path: string): Promise<FileDocument> {
    try {
      return await novelaidFs.readDocument(path);
    } catch {
      const baseName = path.split(/[/\\]/).pop() || "";
      const dotIndex = baseName.lastIndexOf('.');
      const fileTitle = dotIndex > 0 ? baseName.substring(0, dotIndex) : baseName;
      const ext = dotIndex > 0 ? baseName.substring(dotIndex).toLowerCase() : "";

      // ブラウザ環境でのみモックデータを返却
      if (path.startsWith('mock/')) {
        if (baseName.includes('魔女_ルナ') || baseName.includes('キャラクター')) {
          return {
            path,
            baseName,
            fileTitle: "魔女_ルナ",
            documentType: "markdown",
            metadata: { role: "ヒロイン", age: 17 },
            mtimeMs: Date.now(),
            content: `# キャラクター設定：|魔女《まじょ》ルナ・アルテミス...`,
          };
        }
        if (baseName.endsWith('.png') || baseName.endsWith('.jpg')) {
          return {
            path,
            baseName,
            fileTitle,
            documentType: "image",
            metadata: {},
            mtimeMs: Date.now(),
            content: "",
          };
        }
      }

      // 拡張子から簡易判定
      let documentType: FileDocument['documentType'] = "unknown";
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) {
        documentType = "image";
      } else if (ext === '.txt') {
        documentType = "novel";
      } else if (ext === '.md' || ext === '.markdown') {
        documentType = "markdown";
      } else if (ext === '.css') {
        documentType = "css";
      } else if (ext === '.chat' || ext === '.ch') {
        documentType = "chat";
      }

      return {
        path,
        baseName,
        fileTitle,
        mtimeMs: Date.now(),
        content: "",
        metadata: {},
        documentType,
      };
    }
  },

  // ファイルバイナリ読み込み
  async readFileBinary(path: string): Promise<Uint8Array | null> {
    try {
      const data = await novelaidFs.readFileBinary(path);
      return new Uint8Array(data);
    } catch (err) {
      console.warn("readFileBinary failed:", err);
      return null;
    }
  },

  // ファイル保存
  async writeFile(path: string, content: string, metadata: any = {}): Promise<number> {
    try {
      const doc: FileDocument = {
        path,
        baseName: path.split(/[/\\]/).pop() || "",
        fileTitle: (path.split(/[/\\]/).pop() || "").replace(/\.[^/.]+$/, ""),
        content,
        metadata,
        documentType: "novel",
        mtimeMs: Date.now(),
      };
      return await novelaidFs.writeDocument(path, doc);
    } catch (err) {
      console.warn("writeDocument fallback:", err);
      return Date.now();
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

  // 次の新規ファイルを自動推測して作成
  async createNextFile(dirPath: string): Promise<DirEntry> {
    try {
      return await novelaidFs.createNextFile(dirPath);
    } catch (err) {
      console.warn("createNextFile fallback:", err);
      const fileName = "0130_第13話.txt";
      const sep = dirPath.includes("\\") ? "\\" : "/";
      const targetPath = `${dirPath}${sep}${fileName}`;
      return {
        name: fileName,
        path: targetPath,
        baseName: fileName,
        fileTitle: "0130_第13話",
        isDirectory: false,
        documentType: "novel",
        children: null,
      };
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
  async remove(path: string, force: boolean = false): Promise<novelaidFs.RemoveResult> {
    try {
      return await novelaidFs.remove(path, force);
    } catch (err) {
      console.warn("remove fallback:", err);
      return { status: "notFound" };
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

  // コピー
  async copy(sourcePath: string, targetPath: string): Promise<void> {
    try {
      await novelaidFs.copy(sourcePath, targetPath);
    } catch (err) {
      console.warn("copy fallback:", err);
    }
  },

  // メタデータキャッシュ取得
  async getMetadataCache(): Promise<Record<string, any>> {
    try {
      return await novelaidMetadata.getMetadataCache();
    } catch (err) {
      console.warn("getMetadataCache fallback to fs:", err);
      try {
        return await novelaidFs.getMetadataCache();
      } catch (e) {
        console.warn("getMetadataCache fallback to mock:", e);
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
    }
  },

  // プロジェクトメタデータの一括スキャン
  async scanProjectMetadata(projectPath: string) {
    try {
      return await novelaidMetadata.scanProject(projectPath);
    } catch (err) {
      console.warn("scanProjectMetadata failed:", err);
      return null;
    }
  },

  // プロジェクトエンティティ（登場人物・用語）取得
  async getProjectEntities(category?: string) {
    try {
      return await novelaidMetadata.getEntities(category);
    } catch (err) {
      console.warn("getProjectEntities failed:", err);
      return [];
    }
  },

  // 作品固有ルビ辞書取得
  async getProjectRubyDictionary() {
    try {
      return await novelaidMetadata.getRubyDictionary();
    } catch (err) {
      console.warn("getProjectRubyDictionary failed:", err);
      return [];
    }
  },

  // 校正エンジン用プロジェクト知識コンテキスト取得
  async getCalibrationContext() {
    try {
      return await novelaidMetadata.getCalibrationContext();
    } catch (err) {
      console.warn("getCalibrationContext failed:", err);
      return { entities: [], rubyDictionary: [] };
    }
  },
};
