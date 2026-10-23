import { invoke } from "@tauri-apps/api/core";
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
  },
  {
    name: "02_第1章_出会い.md",
    path: "mock/02_第1章_出会い.md",
    baseName: "02_第1章_出会い.md",
    fileTitle: "02_第1章_出会い",
    isDirectory: false,
    documentType: "novel",
  },
  {
    name: "03_第2章_旅立ち.md",
    path: "mock/03_第2章_旅立ち.md",
    baseName: "03_第2章_旅立ち.md",
    fileTitle: "03_第2章_旅立ち",
    isDirectory: false,
    documentType: "novel",
  },
  {
    name: "characters",
    path: "mock/characters",
    baseName: "characters",
    fileTitle: "characters",
    isDirectory: true,
    documentType: "directory",
    children: [
      {
        name: "主人公_ソラ.md",
        path: "mock/characters/主人公_ソラ.md",
        baseName: "主人公_ソラ.md",
        fileTitle: "主人公_ソラ",
        isDirectory: false,
        documentType: "markdown",
      },
      {
        name: "魔女_ルナ.md",
        path: "mock/characters/魔女_ルナ.md",
        baseName: "魔女_ルナ.md",
        fileTitle: "魔女_ルナ",
        isDirectory: false,
        documentType: "markdown",
      },
    ],
  },
  {
    name: "settings",
    path: "mock/settings",
    baseName: "settings",
    fileTitle: "settings",
    isDirectory: true,
    documentType: "directory",
    children: [
      {
        name: "世界観_帝国史.md",
        path: "mock/settings/世界観_帝国史.md",
        baseName: "世界観_帝国史.md",
        fileTitle: "世界観_帝国史",
        isDirectory: false,
        documentType: "markdown",
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
      },
    ],
  },
];

export const fileService = {
  // フォルダ内のファイル・フォルダ一覧を再帰取得
  async readDirectory(path: string, recursive: boolean = true): Promise<DirEntry[]> {
    try {
      return await invoke<DirEntry[]>("fs_read_dir", { path, recursive });
    } catch (err) {
      // ブラウザ環境やTauri外での実行時はモックを返却
      console.warn("Tauri IPC未接続のためモックデータを表示します:", err);
      return MOCK_ENTRIES;
    }
  },

  // ファイル読み込み
  async readFile(path: string): Promise<FileDocument> {
    try {
      return await invoke<FileDocument>("fs_read_file", { path });
    } catch {
      return {
        path,
        baseName: "01_プロローグ.md",
        fileTitle: "01_プロローグ",
        content: "# プロローグ\n\n青い空の彼方から、一羽の鳥が舞い降りてきた。",
        documentType: "novel",
      };
    }
  },

  // ファイル保存
  async writeFile(path: string, content: string): Promise<void> {
    try {
      await invoke("fs_write_file", { path, content });
    } catch (err) {
      console.warn("fs_write_file fallback:", err);
    }
  },

  // 新規ファイル作成
  async createFile(path: string): Promise<void> {
    try {
      await invoke("fs_create_file", { path });
    } catch (err) {
      console.warn("fs_create_file fallback:", err);
    }
  },

  // 新規フォルダ作成
  async createDirectory(path: string): Promise<void> {
    try {
      await invoke("fs_create_dir", { path });
    } catch (err) {
      console.warn("fs_create_dir fallback:", err);
    }
  },

  // ファイルまたはフォルダ削除
  async remove(path: string): Promise<void> {
    try {
      await invoke("fs_remove", { path });
    } catch (err) {
      console.warn("fs_remove fallback:", err);
    }
  },

  // リネーム
  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await invoke("fs_rename", { oldPath, newPath });
    } catch (err) {
      console.warn("fs_rename fallback:", err);
    }
  },
};
