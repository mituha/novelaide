import {
  listenToolCalls,
  ToolCallRequestEvent,
} from 'tauri-plugin-novelaid-mcp-api';
import { fileService } from './fileService';
import { checkText, getRubyCandidates } from 'tauri-plugin-novelaid-calibration-api';
import { getEntities, ProjectEntity } from 'tauri-plugin-novelaid-metadata-api';

export interface OpenDocItem {
  path: string;
  fileTitle: string;
  baseName: string;
  relativePath: string;
  content: string;
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

class ExternalControlService {
  private context: ExternalControlContext | null = null;
  private unlistenMcp: (() => void) | null = null;
  private isListening = false;

  /**
   * React (DocumentContext 等) からの実行コンテキストをバインド
   */
  public bindContext(ctx: ExternalControlContext) {
    this.context = ctx;
  }

  /**
   * MCP サーバー（Rust）からのツール呼び出しリクエストを購読開始
   */
  public async initMcpListener(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;

    try {
      this.unlistenMcp = await listenToolCalls(async (event: ToolCallRequestEvent) => {
        const { toolName, arguments: args } = event;
        console.group(`%c[ExternalControl:MCP] 外部ツール呼び出し受信 🌐: ${toolName}`, 'color: #8b5cf6; font-weight: bold;');
        console.log('▶ Tool:', toolName);
        console.log('▶ Arguments:', args);
        console.groupEnd();

        const res = await this.executeTool(toolName, args, { source: 'external-mcp' });
        return {
          result: res.result,
          isError: res.isError,
        };
      });
      console.log('[ExternalControlService] MCP ツール呼び出しリスナーを登録しました。');
    } catch (e) {
      console.error('[ExternalControlService] MCP リスナーの初期化に失敗しました:', e);
      this.isListening = false;
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
    this.isListening = false;
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

        case 'write':
        case 'write_file': {
          return await this.handleWriteFile(args);
        }

        case 'edit':
        case 'edit_file': {
          return await this.handleEditFile(args);
        }

        case 'list_files': {
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

  private async handleListFiles(args: Record<string, any>): Promise<ToolExecutionResult> {
    const projectFiles = this.context?.projectFiles || [];
    const openDocs = (this.context?.openDocuments || []).map((d) => ({
      path: d.path,
      title: d.fileTitle,
      isDirty: !!d.isDirty,
    }));

    const pathFilter = args.path ? String(args.path).toLowerCase() : '';
    const filteredFiles = pathFilter
      ? projectFiles.filter((f) => f.path.toLowerCase().includes(pathFilter) || f.relativePath.toLowerCase().includes(pathFilter))
      : projectFiles;

    return {
      result: {
        status: 'success',
        totalCount: filteredFiles.length,
        openDocuments: openDocs,
        files: filteredFiles.map((f) => ({
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
    const query = String(args.query || '').trim().toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : undefined;

    try {
      const entities: ProjectEntity[] = await getEntities();
      const matched = entities.filter((e: ProjectEntity) => {
        const nameMatch = e.name.toLowerCase().includes(query) || (e.aliases && e.aliases.some((a: string) => a.toLowerCase().includes(query)));
        const catMatch = category ? e.category.toLowerCase() === category : true;
        return nameMatch && catMatch;
      });

      return {
        result: {
          status: 'success',
          query,
          matchCount: matched.length,
          results: matched.slice(0, 20),
        },
      };
    } catch {
      // フォールバック: 開いている設定ファイルの全文から検索
      const openDocuments = this.context?.openDocuments || [];
      const matched = openDocuments.filter(
        (d) =>
          d.path.includes('setting') ||
          d.path.includes('plot') ||
          d.fileTitle.toLowerCase().includes(query) ||
          d.content.toLowerCase().includes(query)
      );
      const results = matched.slice(0, 5).map((d) => ({
        title: d.fileTitle,
        path: d.path,
        preview: d.content.slice(0, 200).replace(/\n/g, ' ') + '...',
      }));
      return {
        result: {
          status: 'success',
          query,
          matchCount: results.length,
          results,
        },
      };
    }
  }
}

export const externalControlService = new ExternalControlService();
