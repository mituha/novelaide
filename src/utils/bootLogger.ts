/**
 * アプリケーション起動プロファイル用ロガー
 * 起動開始（HTMLパース〜各コンテキスト・画面描画完了）までのミリ秒を経過時間付きで記録
 */

const bootStart = (typeof window !== 'undefined' && (window as any).__novelaide_boot_start)
  ? (window as any).__novelaide_boot_start
  : performance.now();

export function bootLog(step: string, extra?: any): void {
  const elapsed = (performance.now() - bootStart).toFixed(1);
  const prefix = `%c[Boot +${elapsed.padStart(6, ' ')}ms]`;
  const style = 'color: #3b82f6; font-weight: bold; background: rgba(59,130,246,0.1); padding: 1px 4px; border-radius: 3px;';

  if (extra !== undefined) {
    console.log(`${prefix} ${step}`, style, extra);
  } else {
    console.log(`${prefix} ${step}`, style);
  }
}

export function bootTimeStart(label: string): () => void {
  const start = performance.now();
  bootLog(`▶ START: ${label}`);
  return () => {
    const duration = (performance.now() - start).toFixed(1);
    bootLog(`✔ END:   ${label} (${duration}ms)`);
  };
}
