import {
  listenToolCalls,
  ToolCallRequestEvent,
} from 'tauri-plugin-novelaid-mcp-api';
import { fileService } from './fileService';
import type { DirEntry } from '../types/document';
import { checkText, getRubyCandidates } from 'tauri-plugin-novelaid-calibration-api';
import { getEntities, ProjectEntity } from 'tauri-plugin-novelaid-metadata-api';

export interface OpenDocItem {
  path: string;
  fileTitle: string;
  baseName: string;
  relativePath: string;
  content: string;
  metadata?: Record<string, any>;
  isDirty?: boolean;
}

export interface ExternalControlContext {
  openDocuments: OpenDocItem[];
  activeDocument: OpenDocItem | null;
  openDocument: (path: string) => Promise<void>;
  updateContent: (path: string, content: string) => void;
  projectPath?: string | null;
  projectFiles?: Array<{ path: string; relativePath: string; name: string; stem: string }>;
}

export interface ToolExecutionOptions {
  allowWrite?: boolean;
  source?: 'internal-chat' | 'external-mcp';
}

export interface ToolExecutionResult {
  result: any;
  isError?: boolean;
}

export interface McpLogItem {
  id: string;
  timestamp: string;
  toolName: string;
  arguments: Record<string, any>;
  result?: any;
  isError?: boolean;
  durationMs: number;
}

class ExternalControlService {
  private context: ExternalControlContext | null = null;
  private unlistenMcp: (() => void) | null = null;
  private hasInitialized = false;
  private handledCallIds = new Set<string>();
  private logs: McpLogItem[] = [];
  private logListeners = new Set<(logs: McpLogItem[]) => void>();
  private hasScannedProject = false;

  /**
   * 通信ログの取得
   */
  public getLogs(): McpLogItem[] {
    return [...this.logs];
  }

  /**
   * 通信ログのクリア
   */
  public clearLogs(): void {
    this.logs = [];
    this.notifyLogListeners();
  }

  /**
   * 通信ログ購読
   */
  public subscribeLogs(listener: (logs: McpLogItem[]) => void): () => void {
    this.logListeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  private notifyLogListeners(): void {
    const copy = [...this.logs];
    this.logListeners.forEach((l) => {
      try {
        l(copy);
      } catch (e) {
        console.warn('[ExternalControlService] Error in log listener:', e);
      }
    });
  }

  private addLog(item: McpLogItem): void {
    this.logs.unshift(item);
    if (this.logs.length > 50) {
      this.logs.pop();
    }
    this.notifyLogListeners();
  }

  /**
   * React (DocumentContext 等) からの実行コンテキストをバインド
   */
  public bindContext(ctx: ExternalControlContext) {
    this.context = ctx;
    // プロジェクトパスが変わった場合はスキャンフラグをリセット
    if (ctx.projectPath && !this.hasScannedProject) {
      this.hasScannedProject = true;
      fileService.scanProjectMetadata(ctx.projectPath).catch((e) => {
        console.warn('[ExternalControlService] Initial metadata scan failed:', e);
      });
    }
  }

  /**
   * MCP サーバー（Rust）からのツール呼び出しリクエストを購読開始
   */
  public async initMcpListener(): Promise<void> {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    try {
      if (this.unlistenMcp) {
        this.unlistenMcp();
        this.unlistenMcp = null;
      }

      const unlisten = await listenToolCalls(async (event: ToolCallRequestEvent) => {
        const { callId, toolName, arguments: args } = event;

        // 同一 callId の二重処理ガード
        if (this.handledCallIds.has(callId)) {
          return { result: { status: 'skipped', message: 'Duplicate call skipped' } };
        }
        this.handledCallIds.add(callId);
        // メモリ肥大化防止（直近200件保持）
        if (this.handledCallIds.size > 200) {
          const first = this.handledCallIds.values().next().value;
          if (first) this.handledCallIds.delete(first);
        }

        console.group(`%c[ExternalControl:MCP] 外部ツール呼び出し受信 🌐: ${toolName}`, 'color: #8b5cf6; font-weight: bold;');
        console.log('▶ Tool:', toolName);
        console.log('▶ CallId:', callId);
        console.log('▶ Arguments:', args);
        console.groupEnd();

        const startTime = performance.now();
        const nowStr = new Date().toLocaleTimeString('ja-JP', { hour12: false });

        const res = await this.executeTool(toolName, args, { source: 'external-mcp' });
        const durationMs = Math.round(performance.now() - startTime);

        this.addLog({
          id: callId,
          timestamp: nowStr,
          toolName,
          arguments: args,
          result: res.result,
          isError: res.isError,
          durationMs,
        });

        return {
          result: res.result,
          isError: res.isError,
        };
      });

      this.unlistenMcp = unlisten;
      console.log('[ExternalControlService] MCP ツール呼び出しリスナーを登録しました。');
    } catch (e) {
      console.error('[ExternalControlService] MCP リスナーの初期化に失敗しました:', e);
      this.hasInitialized = false;
    }
  }

  /**
   * リスナーの破棄
   */
  public destroy() {
    if (this.unlistenMcp) {
      this.unlistenMcp();
      this.unlistenMcp = null;
    }
    this.hasInitialized = false;
  }

  /**
   * 文字列正規化ヘルパー（空白・記号差異を吸収）
   */
  private normalizeString(s: string): string {
    return (s || '').toLowerCase().replace(/[\s_\-・　]/g, '');
  }

  /**
   * ドキュメントまたはプロジェクトファイルの安全な検索解決
   */
  private resolveFile(rawPath: string) {
    if (!rawPath || !rawPath.trim()) {
      return { found: false, candidates: [] as string[] };
    }
    const target = rawPath.trim();
    const targetBase = fileService.basename(target);
    const targetStem = fileService.stem(target);
    const targetNorm = this.normalizeString(target);
    const targetBaseNorm = this.normalizeString(targetBase);
    const targetStemNorm = this.normalizeString(targetStem);

    const openDocuments = this.context?.openDocuments || [];

    // 1. openDocuments（未保存バッファ最優先）
    let doc = openDocuments.find(
      (d) =>
        d.path === target ||
        d.relativePath === target ||
        fileService.basename(d.path) === targetBase ||
        fileService.stem(d.path) === targetStem ||
        d.fileTitle === target
    );
    if (doc) {
      return { found: true, doc, resolvedPath: doc.path, candidates: [] as string[] };
    }

    doc = openDocuments.find((d) => {
      const normTitle = this.normalizeString(d.fileTitle);
      const normBase = this.normalizeString(d.baseName);
      const normStem = this.normalizeString(fileService.stem(d.path));
      return (
        normTitle === targetNorm ||
        normTitle === targetStemNorm ||
        normBase === targetBaseNorm ||
        normStem === targetStemNorm ||
        (targetNorm.length >= 3 && normTitle.includes(targetNorm)) ||
        (targetNorm.length >= 3 && targetNorm.includes(normTitle))
      );
    });
    if (doc) {
      return { found: true, doc, resolvedPath: doc.path, isNormalized: true, candidates: [] as string[] };
    }

    // 2. プロジェクト内の実在ファイル群
    const files = this.context?.projectFiles || [];
    const exactMatch = files.find(
      (f) =>
        f.path === target ||
        f.relativePath === target ||
        f.name.toLowerCase() === targetBase.toLowerCase() ||
        f.stem.toLowerCase() === targetStem.toLowerCase()
    );
    if (exactMatch) {
      return { found: true, resolvedPath: exactMatch.path, candidates: [] as string[] };
    }

    const extMatch = files.find(
      (f) =>
        f.relativePath === `${target}.txt` ||
        f.relativePath === `${target}.md` ||
        f.name === `${targetBase}.txt` ||
        f.name === `${targetBase}.md`
    );
    if (extMatch) {
      return { found: true, resolvedPath: extMatch.path, isNormalized: true, candidates: [] as string[] };
    }

    const normMatches = files.filter((f) => {
      const fnNorm = this.normalizeString(f.name);
      const fsNorm = this.normalizeString(f.stem);
      return (
        fnNorm === targetNorm ||
        fsNorm === targetNorm ||
        fnNorm === targetBaseNorm ||
        fsNorm === targetStemNorm
      );
    });
    if (normMatches.length === 1) {
      return { found: true, resolvedPath: normMatches[0].path, isNormalized: true, candidates: [] as string[] };
    }

    const partialMatches = files.filter((f) => {
      const fnNorm = this.normalizeString(f.name);
      const fsNorm = this.normalizeString(f.stem);
      return (
        (targetNorm.length >= 3 && fnNorm.includes(targetNorm)) ||
        (targetNorm.length >= 3 && fsNorm.includes(targetNorm)) ||
        (targetStemNorm.length >= 3 && fnNorm.includes(targetStemNorm)) ||
        (targetStemNorm.length >= 3 && fsNorm.includes(targetStemNorm)) ||
        (fsNorm.length >= 3 && targetNorm.includes(fsNorm))
      );
    });

    if (partialMatches.length === 1) {
      return { found: true, resolvedPath: partialMatches[0].path, isNormalized: true, candidates: [] as string[] };
    }

    const candidates = (partialMatches.length > 0 ? partialMatches : files)
      .filter((f) => {
        const fnNorm = this.normalizeString(f.name);
        return targetNorm.length >= 2 && fnNorm.includes(targetNorm.slice(0, 3));
      })
      .slice(0, 5)
      .map((f) => f.relativePath || f.name);

    return { found: false, candidates };
  }

  /**
   * 統一ツール実行ディスパッチャー
   */
  public async executeTool(
    toolName: string,
    args: Record<string, any> = {},
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult> {
    const isWrite = ['write', 'write_file', 'edit', 'edit_file'].includes(toolName);

    // 書き込み権限チェック
    if (isWrite && options.allowWrite === false) {
      return {
        result: {
          status: 'error',
          message: '書き込み権限がありません（読み取り専用モードです）。',
        },
        isError: true,
      };
    }

    try {
      switch (toolName) {
        case 'read':
        case 'read_file': {
          return await this.handleReadFile(args);
        }

        case 'get_active_document': {
          return await this.handleGetActiveDocument(args);
        }

        case 'write':
        case 'write_file': {
          return await this.handleWriteFile(args);
        }

        case 'edit':
        case 'edit_file': {
          return await this.handleEditFile(args);
        }

        case 'list_files':
        case 'get_project_structure':
        case 'get_open_documents': {
          return await this.handleListFiles(args);
        }

        case 'scan_proofread': {
          return await this.handleScanProofread(args);
        }

        case 'extract_ruby': {
          return await this.handleExtractRuby(args);
        }

        case 'search_metadata': {
          return await this.handleSearchMetadata(args);
        }

        case 'search_text':
        case 'grep': {
          return await this.handleSearchText(args);
        }

        case 'find_files':
        case 'glob': {
          return await this.handleFindFiles(args);
        }

        case 'get_project_outline':
        case 'outline': {
          return await this.handleGetProjectOutline(args);
        }

        default:
          return {
            result: {
              status: 'error',
              message: `未対応のツールです: ${toolName}`,
            },
            isError: true,
          };
      }
    } catch (err: any) {
      return {
        result: {
          status: 'error',
          message: err?.message || String(err),
        },
        isError: true,
      };
    }
  }

  // --- 各ツールの実装 ---

  private async handleReadFile(args: Record<string, any>): Promise<ToolExecutionResult> {
    const rawPath = args.path;
    if (!rawPath) {
      return {
        result: { status: 'error', message: 'path パラメータが指定されていません。' },
        isError: true,
      };
    }

    const resolved = this.resolveFile(rawPath);
    let fullContent = '';
    let targetPath = rawPath;

    if (resolved.found && resolved.doc) {
      // 開いているドキュメントのバッファから取得
      fullContent = resolved.doc.content;
      targetPath = resolved.doc.path;
    } else if (resolved.found && resolved.resolvedPath) {
      targetPath = resolved.resolvedPath;
      try {
        const fileDoc = await fileService.readFile(targetPath);
        fullContent = fileDoc.content;
      } catch (e: any) {
        return {
          result: { status: 'error', message: `ファイルの読み込みに失敗しました: ${e.message}` },
          isError: true,
        };
      }
    } else {
      // ファイルシステム直接読み込みを試行
      try {
        const fileDoc = await fileService.readFile(rawPath);
        fullContent = fileDoc.content;
        targetPath = rawPath;
      } catch {
        const candidatesMsg =
          resolved.candidates.length > 0
            ? `\n【もしかして以下のファイルですか？】\n${resolved.candidates.map((c) => `- ${c}`).join('\n')}`
            : '';
        return {
          result: {
            status: 'error',
            message: `指定されたファイル [${rawPath}] が見つかりませんでした。${candidatesMsg}`,
            candidates: resolved.candidates.length > 0 ? resolved.candidates : undefined,
          },
          isError: true,
        };
      }
    }

    const lines = fullContent.split('\n');
    const offset = typeof args.offset === 'number' && args.offset > 0 ? args.offset - 1 : 0;
    const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : lines.length;
    const sliced = lines.slice(offset, offset + limit).join('\n');

    return {
      result: {
        status: 'success',
        path: targetPath,
        totalLines: lines.length,
        returnedLines: Math.min(limit, lines.length - offset),
        content: sliced,
        ...(resolved.isNormalized
          ? { note: `ファイル名表記の揺れを補正して [${targetPath}] を読み込みました。` }
          : {}),
      },
    };
  }

  private async handleWriteFile(args: Record<string, any>): Promise<ToolExecutionResult> {
    const rawPath = args.path;
    const content = args.content ?? '';

    if (!rawPath) {
      return {
        result: { status: 'error', message: 'path パラメータが指定されていません。' },
        isError: true,
      };
    }

    const resolved = this.resolveFile(rawPath);
    const targetPath = resolved.found && resolved.resolvedPath ? resolved.resolvedPath : rawPath;

    // 1. ファイルシステムへ書き込み
    try {
      await fileService.writeFile(targetPath, content);
    } catch (e: any) {
      return {
        result: { status: 'error', message: `ファイルの保存に失敗しました: ${e.message}` },
        isError: true,
      };
    }

    // 2. 開いているドキュメントであればエディターバッファも同期
    if (this.context?.updateContent) {
      this.context.updateContent(targetPath, content);
    }

    return {
      result: {
        status: 'success',
        path: targetPath,
        message: `ファイル [${targetPath}] を保存し、エディター状態を同期しました。`,
      },
    };
  }

  private async handleEditFile(args: Record<string, any>): Promise<ToolExecutionResult> {
    const rawPath = args.path;
    if (!rawPath) {
      return {
        result: { status: 'error', message: 'path パラメータが指定されていません。' },
        isError: true,
      };
    }

    const resolved = this.resolveFile(rawPath);
    let currentText = '';
    let targetPath = rawPath;
    let isOpen = false;

    if (resolved.found && resolved.doc) {
      currentText = resolved.doc.content;
      targetPath = resolved.doc.path;
      isOpen = true;
    } else if (resolved.found && resolved.resolvedPath) {
      targetPath = resolved.resolvedPath;
      try {
        const fileDoc = await fileService.readFile(targetPath);
        currentText = fileDoc.content;
      } catch (e: any) {
        return {
          result: { status: 'error', message: `ファイルの読み取りに失敗しました: ${e.message}` },
          isError: true,
        };
      }
    } else {
      try {
        const fileDoc = await fileService.readFile(rawPath);
        currentText = fileDoc.content;
        targetPath = rawPath;
      } catch {
        return {
          result: { status: 'error', message: `編集対象ファイル [${rawPath}] が見つかりませんでした。` },
          isError: true,
        };
      }
    }

    let appliedCount = 0;

    // 単一置換（old_string, new_string）または一括置換（edits配列）
    if (args.old_string !== undefined) {
      const oldStr = String(args.old_string);
      const newStr = String(args.new_string ?? '');
      if (!currentText.includes(oldStr)) {
        return {
          result: {
            status: 'error',
            message: `差分置換エラー: 原稿内に指定されたテキスト [${oldStr.slice(0, 30)}...] が見つかりませんでした。`,
          },
          isError: true,
        };
      }
      currentText = currentText.replace(oldStr, newStr);
      appliedCount = 1;
    } else if (Array.isArray(args.edits)) {
      for (const edit of args.edits) {
        if (!edit.oldText) continue;
        if (!currentText.includes(edit.oldText)) {
          return {
            result: {
              status: 'error',
              message: `差分置換エラー: 原稿内に指定されたテキスト [${edit.oldText.slice(0, 30)}...] が見つかりませんでした。`,
              appliedEdits: appliedCount,
            },
            isError: true,
          };
        }
        currentText = currentText.replace(edit.oldText, edit.newText || '');
        appliedCount++;
      }
    } else {
      return {
        result: { status: 'error', message: 'old_string または edits が指定されていません。' },
        isError: true,
      };
    }

    // 保存と同期
    try {
      await fileService.writeFile(targetPath, currentText);
    } catch (e: any) {
      return {
        result: { status: 'error', message: `編集結果の保存に失敗しました: ${e.message}` },
        isError: true,
      };
    }

    if (isOpen && this.context?.updateContent) {
      this.context.updateContent(targetPath, currentText);
    }

    return {
      result: {
        status: 'success',
        path: targetPath,
        appliedEdits: appliedCount,
        message: `${appliedCount} 件の差分編集を適用し、保存・同期しました。`,
      },
    };
  }

  private async handleGetActiveDocument(_args: Record<string, any>): Promise<ToolExecutionResult> {
    const activeDoc = this.context?.activeDocument;
    if (!activeDoc) {
      const firstDoc = this.context?.openDocuments?.[0];
      if (firstDoc) {
        return {
          result: {
            status: 'success',
            path: firstDoc.path,
            fileTitle: firstDoc.fileTitle,
            baseName: firstDoc.baseName,
            content: firstDoc.content,
            isDirty: !!firstDoc.isDirty,
            totalCharacters: firstDoc.content.length,
          },
        };
      }
      return {
        result: {
          status: 'error',
          message: '現在開かれているアクティブなドキュメントがありません。',
        },
        isError: true,
      };
    }

    return {
      result: {
        status: 'success',
        path: activeDoc.path,
        fileTitle: activeDoc.fileTitle,
        baseName: activeDoc.baseName,
        content: activeDoc.content,
        isDirty: !!activeDoc.isDirty,
        totalCharacters: activeDoc.content.length,
      },
    };
  }

  private async handleListFiles(args: Record<string, any>): Promise<ToolExecutionResult> {
    let projectFiles = this.context?.projectFiles || [];
    const projectPath = this.context?.projectPath;

    // projectFiles が未ロードの場合、または直接要求された場合は実ディレクトリを走査
    if (projectFiles.length === 0 && projectPath) {
      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const allFiles: Array<{ path: string; relativePath: string; name: string; stem: string }> = [];

        const collect = (items: DirEntry[]) => {
          for (const item of items) {
            if (!item.isDirectory) {
              allFiles.push({
                path: item.path,
                relativePath: item.relativePath || item.name,
                name: item.name,
                stem: item.fileTitle || fileService.stem(item.name),
              });
            }
            if (item.children) {
              collect(item.children);
            }
          }
        };

        collect(entries);
        projectFiles = allFiles;
        if (this.context) {
          this.context.projectFiles = allFiles;
        }
      } catch (e) {
        console.warn('[ExternalControlService] readDirectory failed in handleListFiles:', e);
      }
    }

    const openDocs = (this.context?.openDocuments || []).map((d) => ({
      path: d.path,
      title: d.fileTitle,
      baseName: d.baseName,
      isDirty: !!d.isDirty,
    }));

    const pathFilter = args.path ? String(args.path).toLowerCase() : '';
    const filteredFiles = pathFilter
      ? projectFiles.filter((f) => f.path.toLowerCase().includes(pathFilter) || f.relativePath.toLowerCase().includes(pathFilter))
      : projectFiles;

    // AI（LLM）が即座に理解できる要約ツリーテキスト（summaryText）を生成
    const openDocsSummary = openDocs.length > 0
      ? `【現在開いているタブ (${openDocs.length}件)】\n` + openDocs.map((d) => `- ${d.title} (${d.baseName}, 未保存: ${d.isDirty ? 'あり' : 'なし'})`).join('\n')
      : '【現在開いているタブ】なし';

    // 優先フォルダ（設定資料・プロット・原稿）を上位に整列
    const sorted = [...filteredFiles].sort((a, b) => {
      const aIsSetting = /00_|settings|plot|character|world|wiki/i.test(a.relativePath) ? 1 : 0;
      const bIsSetting = /00_|settings|plot|character|world|wiki/i.test(b.relativePath) ? 1 : 0;
      if (aIsSetting !== bIsSetting) return bIsSetting - aIsSetting;
      return a.relativePath.localeCompare(b.relativePath, 'ja');
    });

    const fileListSample = sorted.slice(0, 40).map((f) => `- ${f.relativePath}`);
    const remainingCount = sorted.length - fileListSample.length;

    const summaryText = [
      `【プロジェクト構成】全 ${filteredFiles.length} ファイル (プロジェクトルート: ${projectPath || '未定'})`,
      openDocsSummary,
      `【プロジェクト内ファイル一覧 (抜粋 ${fileListSample.length}件)】`,
      ...fileListSample,
      remainingCount > 0 ? `...他 ${remainingCount} 件` : '',
    ].filter(Boolean).join('\n');

    return {
      result: {
        status: 'success',
        projectPath: projectPath || '',
        totalFiles: filteredFiles.length,
        summaryText,
        openDocuments: openDocs,
        files: filteredFiles.slice(0, 100).map((f) => ({
          path: f.path,
          relativePath: f.relativePath,
          name: f.name,
        })),
      },
    };
  }

  private async handleScanProofread(args: Record<string, any>): Promise<ToolExecutionResult> {
    let targetText = args.text;

    if (!targetText && args.path) {
      const readRes = await this.handleReadFile({ path: args.path });
      if (readRes.isError) return readRes;
      targetText = readRes.result.content;
    }

    if (!targetText && this.context?.activeDocument) {
      targetText = this.context.activeDocument.content;
    }

    if (!targetText) {
      return {
        result: { status: 'error', message: '校正対象のテキストが指定されていません。' },
        isError: true,
      };
    }

    try {
      // 純Rust製 Lindera 校正エンジンを実行
      const checkResult = await checkText(targetText);
      return {
        result: {
          status: 'success',
          issues: checkResult.issues,
          totalIssues: checkResult.issues.length,
          totalChars: checkResult.totalChars,
          kanjiRatio: checkResult.kanjiRatio,
          hiraganaRatio: checkResult.hiraganaRatio,
        },
      };
    } catch (err: any) {
      // フォールバック: 単純な過去形連続チェック
      const lines = targetText.split('\n');
      const issues: any[] = [];
      let taStreak = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.endsWith('た。') || line.endsWith('だ。')) {
          taStreak++;
          if (taStreak >= 3) {
            issues.push({
              line: i + 1,
              type: 'consecutive_past_tense',
              message: `文末の過去形（〜た。/〜だ。）が ${taStreak} 回連続しています。`,
              snippet: line,
            });
          }
        } else if (line.length > 0) {
          taStreak = 0;
        }
      }
      return {
        result: {
          status: 'success',
          issues,
          totalIssues: issues.length,
          note: `Lindera実行エラー（${err.message}）のためフォールバック簡易検査を実施しました。`,
        },
      };
    }
  }

  private async handleExtractRuby(args: Record<string, any>): Promise<ToolExecutionResult> {
    let targetText = args.text;

    if (!targetText && args.path) {
      const readRes = await this.handleReadFile({ path: args.path });
      if (readRes.isError) return readRes;
      targetText = readRes.result.content;
    }

    if (!targetText && this.context?.activeDocument) {
      targetText = this.context.activeDocument.content;
    }

    if (!targetText) {
      return {
        result: { status: 'error', message: 'ルビ抽出対象のテキストが指定されていません。' },
        isError: true,
      };
    }

    try {
      const candidates = await getRubyCandidates(targetText);
      return {
        result: {
          status: 'success',
          candidates,
          totalCandidates: candidates.length,
        },
      };
    } catch (e: any) {
      return {
        result: {
          status: 'error',
          message: `ルビ抽出に失敗しました: ${e.message}`,
        },
        isError: true,
      };
    }
  }

  private async handleSearchMetadata(args: Record<string, any>): Promise<ToolExecutionResult> {
    const query = String(args.query || args.keyword || args.text || '').trim().toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : undefined;

    const allResults: any[] = [];

    // 1. プロジェクトエンティティ（Frontmatter 等から抽出された人物・用語・世界設定）
    try {
      if (this.context?.projectPath && !this.hasScannedProject) {
        this.hasScannedProject = true;
        await fileService.scanProjectMetadata(this.context.projectPath);
      }
      const entities: ProjectEntity[] = await getEntities();
      const matchedEntities = entities.filter((e: ProjectEntity) => {
        const nameMatch = !query || e.name.toLowerCase().includes(query) || (e.aliases && e.aliases.some((a: string) => a.toLowerCase().includes(query)));
        const catMatch = category ? e.category.toLowerCase() === category : true;
        return nameMatch && catMatch;
      });

      for (const ent of matchedEntities) {
        allResults.push({
          type: 'entity',
          category: ent.category,
          name: ent.name,
          aliases: ent.aliases,
          sourcePath: ent.sourcePath,
          preview: ent.summary || ent.role || `${ent.category}: ${ent.name}`,
        });
      }
    } catch (e) {
      console.warn('[ExternalControlService] getEntities failed:', e);
    }

    // 2. プロジェクト内の設定・プロット・原稿ファイルのテキスト全文検索
    try {
      const openDocs = this.context?.openDocuments || [];
      const projectFiles = this.context?.projectFiles || [];

      // 設定・プロット資料系ファイルを優先して探索
      const isPriorityFile = (p: string) => /settings|plot|wiki|character|world|00_|10_/i.test(p);
      const sortedFiles = [...projectFiles].sort((a, b) => {
        const aPri = isPriorityFile(a.path || a.relativePath) ? 1 : 0;
        const bPri = isPriorityFile(b.path || b.relativePath) ? 1 : 0;
        return bPri - aPri;
      });

      // 最大15ファイルを精査
      const targetFiles = sortedFiles.slice(0, 30);

      for (const fileItem of targetFiles) {
        if (allResults.length >= 25) break;

        let content = '';
        const openDoc = openDocs.find((d) => d.path === fileItem.path);
        if (openDoc) {
          content = openDoc.content;
        } else {
          try {
            const f = await fileService.readFile(fileItem.path);
            content = f.content;
          } catch {
            continue;
          }
        }

        const lowerContent = content.toLowerCase();
        const lowerName = fileItem.name.toLowerCase();

        if (lowerName.includes(query) || lowerContent.includes(query)) {
          // マッチ箇所のスニペット抽出
          let snippet = '';
          const matchIdx = lowerContent.indexOf(query);
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 60);
            const end = Math.min(content.length, matchIdx + query.length + 80);
            snippet = (start > 0 ? '...' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '...' : '');
          } else {
            snippet = content.slice(0, 150).replace(/\n/g, ' ') + '...';
          }

          allResults.push({
            type: 'file_match',
            path: fileItem.path,
            relativePath: fileItem.relativePath,
            title: fileItem.stem || fileItem.name,
            snippet,
          });
        }
      }
    } catch (e) {
      console.warn('[ExternalControlService] Fulltext search fallback failed:', e);
    }

    // 3. 開いているドキュメントのフォールバック探索
    if (allResults.length === 0) {
      const openDocuments = this.context?.openDocuments || [];
      for (const doc of openDocuments) {
        const lower = doc.content.toLowerCase();
        if (doc.fileTitle.toLowerCase().includes(query) || lower.includes(query)) {
          allResults.push({
            type: 'open_document',
            path: doc.path,
            title: doc.fileTitle,
            snippet: doc.content.slice(0, 150).replace(/\n/g, ' ') + '...',
          });
        }
      }
    }

    const summaryLines = allResults.slice(0, 15).map((r, i) => {
      if (r.type === 'entity') {
        return `${i + 1}. [設定] ${r.name} (${r.category}): ${r.preview || ''}`;
      }
      return `${i + 1}. [ファイル] ${r.title} (${r.relativePath || r.path}): ${r.snippet || ''}`;
    });

    const summaryText = allResults.length > 0
      ? `【キーワード「${query}」の検索結果: ${allResults.length}件】\n` + summaryLines.join('\n')
      : `キーワード「${query}」に一致する設定資料・エンティティ・原稿は見つかりませんでした。`;

    return {
      result: {
        status: 'success',
        query,
        matchCount: allResults.length,
        summaryText,
        results: allResults.slice(0, 20),
      },
    };
  }

  private async handleSearchText(args: Record<string, any>): Promise<ToolExecutionResult> {
    const rawQuery = String(args.query || args.keyword || args.text || '').trim();
    if (!rawQuery) {
      return {
        result: { status: 'error', message: '検索キーワード (query) が指定されていません。' },
        isError: true,
      };
    }

    const caseSensitive = !!args.case_sensitive;
    const query = caseSensitive ? rawQuery : rawQuery.toLowerCase();
    const pathFilter = args.path_filter ? String(args.path_filter).toLowerCase() : '';

    // プロジェクトファイル一覧の準備（未ロード時は走査）
    let projectFiles = this.context?.projectFiles || [];
    const projectPath = this.context?.projectPath;
    if (projectFiles.length === 0 && projectPath) {
      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const allFiles: Array<{ path: string; relativePath: string; name: string; stem: string }> = [];
        const collect = (items: DirEntry[]) => {
          for (const item of items) {
            if (!item.isDirectory) {
              allFiles.push({
                path: item.path,
                relativePath: item.relativePath || item.name,
                name: item.name,
                stem: item.fileTitle || fileService.stem(item.name),
              });
            }
            if (item.children) collect(item.children);
          }
        };
        collect(entries);
        projectFiles = allFiles;
        if (this.context) this.context.projectFiles = allFiles;
      } catch (e) {
        console.warn('[ExternalControlService] readDirectory failed in handleSearchText:', e);
      }
    }

    const openDocs = this.context?.openDocuments || [];

    // 対象ファイルの絞り込み（テキスト・原稿・設定系ファイル）
    const targetFiles = projectFiles.filter((f) => {
      const p = (f.relativePath || f.path).toLowerCase();
      // パスフィルター適用
      if (pathFilter && !p.includes(pathFilter)) return false;
      // テキスト系拡張子に限定（画像やバイナリ等を除外）
      const ext = p.split('.').pop() || '';
      return ['md', 'txt', 'novel', 'ch', 'json', 'yaml', 'yml'].includes(ext);
    });

    interface MatchItem {
      filePath: string;
      relativePath: string;
      fileName: string;
      lineNumber: number;
      lineText: string;
      snippet: string;
    }

    const matches: MatchItem[] = [];
    const MAX_TOTAL_MATCHES = 100;

    for (const fileItem of targetFiles) {
      if (matches.length >= MAX_TOTAL_MATCHES) break;

      let content = '';
      const openDoc = openDocs.find((d) => fileService.isSamePath(d.path, fileItem.path));
      if (openDoc) {
        content = openDoc.content;
      } else {
        try {
          const f = await fileService.readFile(fileItem.path);
          content = f.content;
        } catch {
          continue;
        }
      }

      if (!content) continue;

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= MAX_TOTAL_MATCHES) break;

        const currentLine = lines[i];
        const matchFound = caseSensitive
          ? currentLine.includes(query)
          : currentLine.toLowerCase().includes(query);

        if (matchFound) {
          // 前後1行を含めたスニペット生成
          const prevLine = i > 0 ? lines[i - 1] : '';
          const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
          const snippetParts = [
            prevLine ? `  ${i}: ${prevLine}` : null,
            `▶ ${i + 1}: ${currentLine}`,
            nextLine ? `  ${i + 2}: ${nextLine}` : null,
          ].filter(Boolean);

          matches.push({
            filePath: fileItem.path,
            relativePath: fileItem.relativePath || fileItem.name,
            fileName: fileItem.name,
            lineNumber: i + 1,
            lineText: currentLine.trim(),
            snippet: snippetParts.join('\n'),
          });
        }
      }
    }

    // AI（LLM）向け要約テキストの生成
    const summaryLines = [
      `【全文検索結果】キーワード「${rawQuery}」: 合計 ${matches.length} 件マッチ${matches.length >= MAX_TOTAL_MATCHES ? ' (上限100件に到達)' : ''}`,
    ];

    if (matches.length === 0) {
      summaryLines.push('該当するテキストは見つかりませんでした。');
    } else {
      // ファイルごとにグループ化して要約
      const fileGroupMap = new Map<string, MatchItem[]>();
      for (const m of matches) {
        const list = fileGroupMap.get(m.relativePath) || [];
        list.push(m);
        fileGroupMap.set(m.relativePath, list);
      }

      for (const [relPath, items] of fileGroupMap.entries()) {
        summaryLines.push(`\n📄 ${relPath} (${items.length}件):`);
        for (const item of items.slice(0, 5)) {
          summaryLines.push(`  - L${item.lineNumber}: ${item.lineText}`);
        }
        if (items.length > 5) {
          summaryLines.push(`  ...他 ${items.length - 5} 件`);
        }
      }
    }

    const summaryText = summaryLines.join('\n');

    return {
      result: {
        status: 'success',
        query: rawQuery,
        totalMatches: matches.length,
        summaryText,
        matches,
      },
    };
  }

  private async handleFindFiles(args: Record<string, any>): Promise<ToolExecutionResult> {
    const rawPattern = String(args.pattern || args.query || '').trim();
    if (!rawPattern) {
      return {
        result: { status: 'error', message: '探索パターン (pattern) が指定されていません。' },
        isError: true,
      };
    }

    const typeFilter = args.type ? String(args.type).toLowerCase() : 'all';

    // プロジェクトファイル一覧の準備
    let projectFiles = this.context?.projectFiles || [];
    const projectPath = this.context?.projectPath;
    if (projectFiles.length === 0 && projectPath) {
      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const allFiles: Array<{ path: string; relativePath: string; name: string; stem: string }> = [];
        const collect = (items: DirEntry[]) => {
          for (const item of items) {
            if (!item.isDirectory) {
              allFiles.push({
                path: item.path,
                relativePath: item.relativePath || item.name,
                name: item.name,
                stem: item.fileTitle || fileService.stem(item.name),
              });
            }
            if (item.children) collect(item.children);
          }
        };
        collect(entries);
        projectFiles = allFiles;
        if (this.context) this.context.projectFiles = allFiles;
      } catch (e) {
        console.warn('[ExternalControlService] readDirectory failed in handleFindFiles:', e);
      }
    }

    // グロブ風パターンを正規表現へ変換
    const regexPattern = rawPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(regexPattern, 'i');

    const matchedFiles = projectFiles.filter((f) => {
      // パスパターンまたはファイル名にマッチするか
      const p = (f.relativePath || f.path).replace(/\\/g, '/');
      const name = f.name;
      const match = regex.test(p) || regex.test(name);
      if (!match) return false;

      // 種別フィルター
      if (typeFilter !== 'all') {
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (typeFilter === 'novel' && !['md', 'txt', 'novel'].includes(ext)) return false;
        if (typeFilter === 'markdown' && ext !== 'md') return false;
        if (typeFilter === 'chat' && ext !== 'ch') return false;
      }

      return true;
    });

    const summaryLines = [
      `【ファイル探索結果】パターン「${rawPattern}」: 合計 ${matchedFiles.length} 件ヒット`,
    ];

    if (matchedFiles.length === 0) {
      summaryLines.push('条件に一致するファイルは見つかりませんでした。');
    } else {
      for (const f of matchedFiles.slice(0, 30)) {
        summaryLines.push(`- ${f.relativePath}`);
      }
      if (matchedFiles.length > 30) {
        summaryLines.push(`...他 ${matchedFiles.length - 30} 件`);
      }
    }

    return {
      result: {
        status: 'success',
        pattern: rawPattern,
        totalFiles: matchedFiles.length,
        summaryText: summaryLines.join('\n'),
        files: matchedFiles.map((f) => ({
          path: f.path,
          relativePath: f.relativePath,
          name: f.name,
        })),
      },
    };
  }

  private async handleGetProjectOutline(args: Record<string, any>): Promise<ToolExecutionResult> {
    const includeSummary = args.include_summary !== false;
    const includeHeadings = !!args.include_headings;

    let projectFiles = this.context?.projectFiles || [];
    const projectPath = this.context?.projectPath;
    if (projectFiles.length === 0 && projectPath) {
      try {
        const entries = await fileService.readDirectory(projectPath, true);
        const allFiles: Array<{ path: string; relativePath: string; name: string; stem: string }> = [];
        const collect = (items: DirEntry[]) => {
          for (const item of items) {
            if (!item.isDirectory) {
              allFiles.push({
                path: item.path,
                relativePath: item.relativePath || item.name,
                name: item.name,
                stem: item.fileTitle || fileService.stem(item.name),
              });
            }
            if (item.children) collect(item.children);
          }
        };
        collect(entries);
        projectFiles = allFiles;
        if (this.context) this.context.projectFiles = allFiles;
      } catch (e) {
        console.warn('[ExternalControlService] readDirectory failed in handleGetProjectOutline:', e);
      }
    }

    const openDocs = this.context?.openDocuments || [];

    // 原稿ファイル（.md, .txt）およびプロットファイルを抽出
    const episodeFiles = projectFiles.filter((f) => {
      const p = (f.relativePath || f.path).toLowerCase();
      const ext = p.split('.').pop() || '';
      return ['md', 'txt', 'novel'].includes(ext) && !p.includes('character') && !p.includes('setting') && !p.includes('.git');
    });

    // 自然順序（Natural Sort）でエピソードをソート
    episodeFiles.sort((a, b) =>
      (a.relativePath || a.name).localeCompare(b.relativePath || b.name, 'ja', {
        numeric: true,
        sensitivity: 'base',
      })
    );

    interface OutlineItem {
      order: number;
      relativePath: string;
      fileName: string;
      title: string;
      description?: string;
      charCount: number;
      tags?: string[];
      headings?: string[];
    }

    const outlineItems: OutlineItem[] = [];

    for (let i = 0; i < episodeFiles.length; i++) {
      const fileItem = episodeFiles[i];
      let content = '';
      let metadata: Record<string, any> = {};

      const openDoc = openDocs.find((d) => fileService.isSamePath(d.path, fileItem.path));
      if (openDoc) {
        content = openDoc.content;
        metadata = openDoc.metadata || {};
      } else {
        try {
          const f = await fileService.readFile(fileItem.path);
          content = f.content;
          metadata = f.metadata || {};
        } catch {
          continue;
        }
      }

      const title = String(metadata.title || fileItem.stem || fileItem.name);
      const description = includeSummary ? String(metadata.description || metadata.summary || '') : undefined;
      const tags = Array.isArray(metadata.tags) ? metadata.tags : undefined;

      const headings: string[] = [];
      if (includeHeadings && content) {
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          if (/^#{1,3}\s+/.test(line)) {
            headings.push(line.trim());
          }
        }
      }

      outlineItems.push({
        order: i + 1,
        relativePath: fileItem.relativePath || fileItem.name,
        fileName: fileItem.name,
        title,
        description: description || undefined,
        charCount: content.length,
        tags,
        headings: headings.length > 0 ? headings : undefined,
      });
    }

    // AI（LLM）向け要約テキストの生成
    const summaryLines = [
      `【作品目次・構成サマリー】全 ${outlineItems.length} エピソード (プロジェクトルート: ${projectPath || '未定'})`,
    ];

    if (outlineItems.length === 0) {
      summaryLines.push('原稿ファイルが見つかりませんでした。');
    } else {
      for (const item of outlineItems) {
        const descStr = item.description ? `\n     概要: ${item.description}` : '';
        const tagsStr = item.tags && item.tags.length > 0 ? ` [タグ: ${item.tags.join(', ')}]` : '';
        summaryLines.push(
          `${item.order}. ${item.relativePath} (タイトル: ${item.title}, 約${item.charCount.toLocaleString()}字)${tagsStr}${descStr}`
        );
        if (item.headings && item.headings.length > 0) {
          for (const h of item.headings.slice(0, 3)) {
            summaryLines.push(`     ${h}`);
          }
        }
      }
    }

    return {
      result: {
        status: 'success',
        projectPath: projectPath || '',
        totalEpisodes: outlineItems.length,
        summaryText: summaryLines.join('\n'),
        outline: outlineItems,
      },
    };
  }
}

export const externalControlService = new ExternalControlService();
