export interface CalibrationRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export type CalibrationRuleType =
  | 'particle_repetition'
  | 'novel_style'
  | 'kanji_open_close'
  | 'grammar'
  | 'consistency';

export interface CalibrationIssue {
  id: string;
  ruleId: string;
  ruleType: string;
  message: string;
  range: CalibrationRange;
  suggestion?: string | null;
}

export interface TokenInfo {
  surface: string;
  pos: string;
  reading?: string | null;
  baseForm?: string | null;
}

export interface RubyCandidate {
  surface: string;
  ruby: string;
  range: CalibrationRange;
}

export interface FrequencyItem {
  word: string;
  count: number;
  pos: string;
}

export interface CheckTextResult {
  issues: CalibrationIssue[];
  frequencies: FrequencyItem[];
  totalChars: number;
  kanjiRatio: number;
  hiraganaRatio: number;
}

export interface PingRequest {
  value?: string | null;
}

export interface PingResponse {
  value?: string | null;
}
