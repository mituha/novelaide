import { stripRubyWithMap } from 'tauri-plugin-novelaid-ruby-api';

export interface RubyEntityPart {
  /** 親文字（例: '勝魚'） */
  surface: string;
  /** ルビ（例: 'かつお'） */
  ruby: string;
  /** ルビ付き表記（例: '勝魚《かつお》'） */
  rubyText: string;
}

export interface ExtractedEntityRubies {
  /** ルビが含まれているか */
  hasRuby: boolean;
  /** 親文字全体（例: '勝魚武市'） */
  surfaceFull: string;
  /** ルビ付き表記全体（例: '勝魚《かつお》武市《ぶし》'） */
  rubyTextFull: string;
  /** 読み全体（例: 'かつおぶし'） */
  readingFull: string;
  /** 分割パーツ一覧（2つ以上のルビがある場合など） */
  parts: RubyEntityPart[];
}

/**
 * 本文の最初の非空行（見出し行）を抽出します。
 * 行頭の見出し記号（#+ ）は自動的に除去されます。
 */
export function extractFirstNonEmptyLine(content: string): string {
  if (!content) return '';
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      // 見出し記号 (#+ ) を除去
      return trimmed.replace(/^#+\s*/, '').trim();
    }
  }
  return '';
}

/**
 * 正規表現を用いて同期的にルビを抽出するフォールバック関数
 */
export function parseRubiesSync(text: string): { cleanText: string; rubies: Array<{ surface: string; ruby: string }> } {
  if (!text) {
    return { cleanText: '', rubies: [] };
  }

  const rubies: Array<{ surface: string; ruby: string }> = [];
  
  // パイプありルビ: |親文字《ルビ》 または ｜親文字《ルビ》
  // 漢字ルビ: 漢字《ルビ》
  const regex = new RegExp(
    `(?:[|｜]([^|｜\\n《》]+)《([^《》\\n]+)》|([々〇\\u4e00-\\u9fcf\\u3400-\\u4dbfA-Za-z0-9]+)《([^《》\\n]+)》)`,
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && match[2]) {
      rubies.push({ surface: match[1].trim(), ruby: match[2].trim() });
    } else if (match[3] && match[4]) {
      rubies.push({ surface: match[3].trim(), ruby: match[4].trim() });
    }
  }

  // ルビ記法を除去してクリーンテキストを作成
  const cleanText = text
    .replace(/[|｜]([^|｜\n《》]+)《[^《》\n]+》/g, '$1')
    .replace(/([々〇\u4e00-\u9fcf\u3400-\u4dbfA-Za-z0-9]+)《[^《》\n]+》/g, '$1')
    .replace(/《《[^《》\n]+》》/g, '') // 傍点除去
    .trim();

  return { cleanText, rubies };
}

/**
 * 本文（content）の最初の非空行からルビ付きの登場人物・地名情報を抽出します。
 * tauri-plugin-novelaid-ruby の stripRubyWithMap を使用し、利用できない場合は同期フォールバックを使用します。
 */
export async function parseFirstLineRubies(content: string): Promise<ExtractedEntityRubies | null> {
  const firstLine = extractFirstNonEmptyLine(content);
  if (!firstLine) return null;

  let cleanText = '';
  let rubies: Array<{ surface: string; ruby: string }> = [];

  try {
    const result = await stripRubyWithMap(firstLine);
    cleanText = result.cleanText.trim();
    rubies = (result.existingRubies || []).map((r) => ({
      surface: r.surface.trim(),
      ruby: r.ruby.trim(),
    }));
  } catch (_e) {
    // Tauri環境外やAPI未疎通時のフォールバック
    const fallback = parseRubiesSync(firstLine);
    cleanText = fallback.cleanText;
    rubies = fallback.rubies;
  }

  const hasRuby = rubies.length > 0;
  const parts: RubyEntityPart[] = rubies.map((r) => ({
    surface: r.surface,
    ruby: r.ruby,
    rubyText: `${r.surface}《${r.ruby}》`,
  }));

  const readingFull = rubies.map((r) => r.ruby).join('');

  return {
    hasRuby,
    surfaceFull: cleanText || firstLine,
    rubyTextFull: firstLine,
    readingFull,
    parts,
  };
}
