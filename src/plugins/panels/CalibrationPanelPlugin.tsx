import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import {
  SpellCheck,
  RefreshCw,
  Check,
  Sparkles,
  BookOpen,
  PieChart,
  AlertCircle,
  FileText,
  Tag,
  ArrowRight,
  LocateFixed,
} from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import { useNotification } from '../../contexts/NotificationContext';
import { fileService } from '../../services/fileService';
import {
  checkText,
  getRubyCandidates,
  CheckTextResult,
  RubyCandidate,
  CalibrationIssue,
  CalibrationRange,
} from 'tauri-plugin-novelaid-calibration-api';
import { formatSmartRuby } from 'tauri-plugin-novelaid-ruby-api';

type TabType = 'issues' | 'metrics' | 'ruby';

export const CalibrationPanel: React.FC = () => {
  const { activeDocument, updateContent } = useDocument();
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<TabType>('issues');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CheckTextResult | null>(null);
  const [rubies, setRubies] = useState<RubyCandidate[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [showAllFreq, setShowAllFreq] = useState<boolean>(false);
  const [includeSingleCharFreq, setIncludeSingleCharFreq] = useState<boolean>(false);
  const activePathRef = useRef<string | null>(activeDocument?.path ?? null);
  const isDictSyncedRef = useRef<boolean>(false);

  useEffect(() => {
    activePathRef.current = activeDocument?.path ?? null;
  }, [activeDocument?.path]);

  const runCalibration = useCallback(async (forceSyncDict: boolean = false) => {
    // novel 形式以外のドキュメント、または本文が空の場合は校正を実行しない
    if (!activeDocument?.content || activeDocument.documentType !== 'novel') {
      setResult(null);
      setRubies([]);
      if (activePathRef.current) {
        window.dispatchEvent(
          new CustomEvent('calibration-issues-update', {
            detail: { path: activePathRef.current, issues: [] },
          })
        );
      }
      return;
    }

    setLoading(true);
    try {
      if (forceSyncDict || !isDictSyncedRef.current) {
        await fileService.syncProjectMetadataToMorphology();
        isDictSyncedRef.current = true;
      }
      const [res, rubyRes] = await Promise.all([
        checkText(activeDocument.content),
        getRubyCandidates(activeDocument.content),
      ]);
      setResult(res);
      setRubies(rubyRes);

      // エディタ側へ波線表示用マーカーイベントを発火
      window.dispatchEvent(
        new CustomEvent('calibration-issues-update', {
          detail: { path: activeDocument.path, issues: res.issues },
        })
      );
    } catch (err) {
      console.error('Calibration error:', err);
      showToast({
        type: 'error',
        message: `校正チェックに失敗しました: ${String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }, [activeDocument?.path, activeDocument?.content, showToast]);

  const handleManualRefresh = useCallback(async () => {
    await runCalibration(true);
  }, [runCalibration]);

  useEffect(() => {
    runCalibration();
  }, [runCalibration]);

  // エディタ上の該当位置へジャンプ
  const handleJumpToRange = (range: CalibrationRange) => {
    if (!activeDocument) return;
    window.dispatchEvent(
      new CustomEvent('editor-jump-to', {
        detail: {
          path: activeDocument.path,
          line: range.startLine,
          column: range.startColumn,
          endLine: range.endLine,
          endColumn: range.endColumn,
        },
      })
    );
  };

  // 指摘修正の適用
  const handleApplyIssue = (issue: CalibrationIssue) => {
    if (!activeDocument || !issue.suggestion) return;

    const lines = activeDocument.content.split('\n');
    const lineIndex = issue.range.startLine - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const targetLine = lines[lineIndex];
    // 簡易置換: 指定列周辺の置換
    // startColumn, endColumn は 1-based (byte/char)
    const startCol = Math.max(0, issue.range.startColumn - 1);
    const endCol = Math.min(targetLine.length, issue.range.endColumn - 1);

    const newLine =
      targetLine.substring(0, startCol) +
      issue.suggestion +
      targetLine.substring(endCol);

    lines[lineIndex] = newLine;
    const newContent = lines.join('\n');
    updateContent(activeDocument.path, newContent);

    showToast({
      type: 'success',
      message: `修正を適用しました（L${issue.range.startLine}）: 「${issue.suggestion}」`,
    });
  };

  // ルビ挿入の適用
  const handleApplyRuby = (ruby: RubyCandidate) => {
    if (!activeDocument) return;

    const rubyFormatted = formatSmartRuby(ruby.surface, ruby.ruby);
    // 最初の出現箇所を置換、または行番号から置換
    const lines = activeDocument.content.split('\n');
    const lineIndex = ruby.range.startLine - 1;

    if (lineIndex >= 0 && lineIndex < lines.length) {
      const targetLine = lines[lineIndex];
      const startCol = Math.max(0, ruby.range.startColumn - 1);
      const endCol = Math.min(targetLine.length, ruby.range.endColumn - 1);
      lines[lineIndex] =
        targetLine.substring(0, startCol) +
        rubyFormatted +
        targetLine.substring(endCol);
    } else {
      lines[0] = lines[0].replace(ruby.surface, rubyFormatted);
    }

    const newContent = lines.join('\n');
    updateContent(activeDocument.path, newContent);

    showToast({
      type: 'success',
      message: `ルビを挿入しました: ${rubyFormatted}`,
    });
  };

  // AIに相談（将来連携用モック）
  const handleConsultAi = (issue: CalibrationIssue) => {
    showToast({
      type: 'info',
      message: `AIパートナー連携（準備中）: 「${issue.message}」に関する言い換え案を推敲します`,
    });
  };

  const getRuleBadgeStyle = (ruleType: string) => {
    switch (ruleType) {
      case 'novel_style':
        return { bg: '#e0f2fe', color: '#0369a1', label: '作法' };
      case 'kanji_open_close':
        return { bg: '#fef3c7', color: '#b45309', label: '開き' };
      case 'particle_repetition':
        return { bg: '#ede9fe', color: '#6d28d9', label: '助詞' };
      default:
        return { bg: '#f1f5f9', color: '#475569', label: '校正' };
    }
  };

  const isNovel = activeDocument?.documentType === 'novel';

  const filteredIssues =
    result?.issues.filter((i) => {
      if (filterType === 'all') return true;
      return i.ruleType === filterType;
    }) || [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-primary, #ffffff)',
        color: 'var(--text-primary, #333333)',
        fontSize: '13px',
      }}
    >
      {/* ツールバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          backgroundColor: 'var(--bg-secondary, #f9fafb)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
          <SpellCheck size={16} color="var(--accent-color, #3b82f6)" />
          <span>校正・解析</span>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={loading || !activeDocument || !isNovel}
          title={!isNovel ? '小説（novel）編集時のみ実行可能' : '再検証を実行'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-color, #d1d5db)',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            cursor: loading || !activeDocument || !isNovel ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            opacity: loading || !activeDocument || !isNovel ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span>{loading ? '検証中...' : '再検証'}</span>
        </button>
      </div>

      {/* ファイル情報 */}
      <div
        style={{
          padding: '6px 12px',
          fontSize: '11px',
          color: 'var(--text-secondary, #6b7280)',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <FileText size={12} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeDocument ? activeDocument.fileTitle || activeDocument.baseName : '開いているファイルがありません'}
        </span>
      </div>

      {!isNovel ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--text-secondary, #6b7280)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Sparkles size={32} color="var(--accent-color, #3b82f6)" style={{ opacity: 0.6 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '4px' }}>
              小説以外のファイルが開かれています
            </div>
            <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
              形式: <code>{activeDocument?.documentType || 'unknown'}</code>
              <br />
              校正・文体解析機能は小説（novel）編集時のみ動作します。
            </div>
            {activeDocument?.documentType === 'markdown' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-secondary, #f3f4f6)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  textAlign: 'left',
                }}
              >
                ※エディター上でのルビ振り（<kbd>Ctrl+R</kbd>）や傍点（<kbd>Ctrl+B</kbd>）は引き続きご利用いただけます。
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* タブバー */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          backgroundColor: 'var(--bg-primary, #ffffff)',
        }}
      >
        <button
          onClick={() => setActiveTab('issues')}
          style={{
            flex: 1,
            padding: '8px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            border: 'none',
            borderBottom: activeTab === 'issues' ? '2px solid var(--accent-color, #3b82f6)' : '2px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'issues' ? 600 : 400,
            color: activeTab === 'issues' ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          <AlertCircle size={13} />
          <span>指摘 ({result?.issues.length ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          style={{
            flex: 1,
            padding: '8px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            border: 'none',
            borderBottom: activeTab === 'metrics' ? '2px solid var(--accent-color, #3b82f6)' : '2px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'metrics' ? 600 : 400,
            color: activeTab === 'metrics' ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          <PieChart size={13} />
          <span>文体・比率</span>
        </button>

        <button
          onClick={() => setActiveTab('ruby')}
          style={{
            flex: 1,
            padding: '8px 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            border: 'none',
            borderBottom: activeTab === 'ruby' ? '2px solid var(--accent-color, #3b82f6)' : '2px solid transparent',
            backgroundColor: 'transparent',
            fontWeight: activeTab === 'ruby' ? 600 : 400,
            color: activeTab === 'ruby' ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          <BookOpen size={13} />
          <span>ルビ支援 ({rubies.length})</span>
        </button>
      </div>

      {/* タブコンテンツ */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
        }}
      >
        {!activeDocument ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary, #9ca3af)',
              gap: '8px',
            }}
          >
            <FileText size={28} opacity={0.4} />
            <span>エディタでファイルを開いてください</span>
          </div>
        ) : activeTab === 'issues' ? (
          <div>
            {/* フィルター */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '10px',
                flexWrap: 'wrap',
              }}
            >
              {[
                { id: 'all', label: 'すべて' },
                { id: 'novel_style', label: '作法' },
                { id: 'kanji_open_close', label: '開き' },
                { id: 'particle_repetition', label: '助詞' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    backgroundColor:
                      filterType === f.id
                        ? 'var(--accent-color, #3b82f6)'
                        : 'var(--bg-secondary, #f3f4f6)',
                    color: filterType === f.id ? '#ffffff' : 'var(--text-secondary, #4b5563)',
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredIssues.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 0',
                  color: 'var(--text-secondary, #9ca3af)',
                  gap: '8px',
                }}
              >
                <Check size={28} color="#10b981" />
                <span>気になる箇所は見つかりませんでした</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredIssues.map((issue) => {
                  const badge = getRuleBadgeStyle(issue.ruleType);
                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleJumpToRange(issue.range)}
                      title="クリックしてエディターの該当箇所へジャンプ"
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #e5e7eb)',
                        backgroundColor: 'var(--bg-secondary, #f9fafb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent-color, #3b82f6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color, #e5e7eb)';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              backgroundColor: badge.bg,
                              color: badge.color,
                            }}
                          >
                            {badge.label}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary, #6b7280)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            <LocateFixed size={11} opacity={0.7} />
                            <span>L{issue.range.startLine}:{issue.range.startColumn}</span>
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConsultAi(issue);
                            }}
                            title="AIパートナーに相談"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              border: '1px solid #c7d2fe',
                              backgroundColor: '#eef2ff',
                              color: '#4f46e5',
                              cursor: 'pointer',
                            }}
                          >
                            <Sparkles size={11} />
                            <span>AI</span>
                          </button>

                          {issue.suggestion && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApplyIssue(issue);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                border: '1px solid #bbf7d0',
                                backgroundColor: '#f0fdf4',
                                color: '#16a34a',
                                cursor: 'pointer',
                                fontWeight: 500,
                              }}
                            >
                              <Check size={11} />
                              <span>適用</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          lineHeight: '1.4',
                          color: 'var(--text-primary, #1f2937)',
                        }}
                      >
                        {issue.message}
                      </div>

                      {issue.suggestion && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            color: 'var(--text-secondary, #4b5563)',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>修正案:</span>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>
                            {issue.suggestion}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'metrics' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 文字比率メーター */}
            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                backgroundColor: 'var(--bg-secondary, #f9fafb)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>漢字・ひらがな比率</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)' }}>
                  総文字数: {result?.totalChars.toLocaleString() ?? 0} 字
                </span>
              </div>

              {/* 比率バー */}
              <div
                style={{
                  height: '14px',
                  width: '100%',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '7px',
                  display: 'flex',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                <div
                  title={`漢字: ${result?.kanjiRatio ?? 0}%`}
                  style={{
                    width: `${result?.kanjiRatio ?? 0}%`,
                    backgroundColor: '#3b82f6',
                  }}
                />
                <div
                  title={`ひらがな: ${result?.hiraganaRatio ?? 0}%`}
                  style={{
                    width: `${result?.hiraganaRatio ?? 0}%`,
                    backgroundColor: '#10b981',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: 'var(--text-secondary, #6b7280)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      backgroundColor: '#3b82f6',
                      borderRadius: '2px',
                    }}
                  />
                  <span>漢字: {result?.kanjiRatio ?? 0}% (目安 20~30%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      backgroundColor: '#10b981',
                      borderRadius: '2px',
                    }}
                  />
                  <span>ひらがな: {result?.hiraganaRatio ?? 0}%</span>
                </div>
              </div>
            </div>

            {/* 頻出語ランキング */}
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Tag size={13} />
                  <span>頻出語ランキング {showAllFreq ? '（全件）' : '（上位15件）'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 'normal',
                      cursor: 'pointer',
                      color: 'var(--text-secondary, #6b7280)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeSingleCharFreq}
                      onChange={(e) => setIncludeSingleCharFreq(e.target.checked)}
                    />
                    <span>1文字を含む</span>
                  </label>
                  <button
                    type="button"
                    style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color, #e5e7eb)',
                      backgroundColor: showAllFreq ? 'var(--accent-color, #3b82f6)' : 'var(--bg-secondary, #f3f4f6)',
                      color: showAllFreq ? '#ffffff' : 'var(--text-secondary, #4b5563)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowAllFreq((prev) => !prev)}
                  >
                    {showAllFreq ? '上位15件へ' : '全件表示'}
                  </button>
                </div>
              </div>

              {(() => {
                const sourceList = (result?.allFrequencies && result.allFrequencies.length > 0)
                  ? result.allFrequencies
                  : (result?.frequencies || []);
                const filtered = sourceList.filter((item) => {
                  if (!includeSingleCharFreq && item.word.length < 2) return false;
                  return true;
                });
                const displayList = showAllFreq ? filtered : filtered.slice(0, 15);

                if (displayList.length === 0) {
                  return (
                    <div
                      style={{
                        padding: '20px 0',
                        textAlign: 'center',
                        color: 'var(--text-secondary, #9ca3af)',
                        fontSize: '12px',
                      }}
                    >
                      頻出語データはありません
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {displayList.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-secondary, #f9fafb)',
                          border: '1px solid var(--border-color, #e5e7eb)',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              color: idx < 3 ? 'var(--accent-color, #3b82f6)' : 'var(--text-secondary, #9ca3af)',
                              width: '20px',
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 500 }}>{item.word}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                            }}
                          >
                            {item.pos}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-secondary, #4b5563)',
                          }}
                        >
                          {item.count} 回
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          /* ルビ支援タブ */
          <div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary, #6b7280)',
                marginBottom: '10px',
                lineHeight: '1.4',
              }}
            >
              本文中の難読語・人名などのルビ付与候補です。「挿入」をクリックすると青空文庫形式（|漢字《ルビ》）でエディタに反映されます。
            </div>

            {rubies.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 0',
                  color: 'var(--text-secondary, #9ca3af)',
                  gap: '8px',
                }}
              >
                <BookOpen size={28} opacity={0.4} />
                <span>ルビ推奨語は見つかりませんでした</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rubies.map((ruby, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleJumpToRange(ruby.range)}
                    title="クリックしてエディターの該当箇所へジャンプ"
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #e5e7eb)',
                      backgroundColor: 'var(--bg-secondary, #f9fafb)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-color, #3b82f6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color, #e5e7eb)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{ruby.surface}</span>
                        <ArrowRight size={12} color="var(--text-secondary, #9ca3af)" />
                        <span style={{ color: 'var(--accent-color, #3b82f6)', fontWeight: 600, fontSize: '12px' }}>
                          {ruby.ruby}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-secondary, #9ca3af)',
                          marginTop: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <LocateFixed size={10} opacity={0.7} />
                        <span>L{ruby.range.startLine}:{ruby.range.startColumn}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyRuby(ruby);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #bfdbfe',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      挿入
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )}
</div>
  );
};

export const CalibrationPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.calibration',
  title: '文章校正・文体解析',
  icon: SpellCheck,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'document',
  supportedDocumentTypes: ['novel'],
  priority: 70,
  component: CalibrationPanel,
};
