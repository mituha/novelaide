import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PanelPlugin } from '../../types/panelPlugin';
import {
  Binary,
  Tag,
  BookOpen,
  RefreshCw,
} from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';
import {
  tokenizeText,
  checkText,
  TokenInfo,
  FrequencyItem,
  CalibrationRange,
} from 'tauri-plugin-novelaid-calibration-api';
import {
  getRubyDictionary,
  getEntities,
  ProjectRubyEntry,
  ProjectEntity,
} from 'tauri-plugin-novelaid-metadata-api';
import './DebugPanelPlugin.css';

type DebugTab = 'tokens' | 'frequencies' | 'dictionaries';

export const DebugPanel: React.FC = () => {
  const { activeDocument } = useDocument();
  const { projectPath } = useProject();

  const [activeTab, setActiveTab] = useState<DebugTab>('tokens');
  const [loading, setLoading] = useState<boolean>(false);

  // 1. 形態素トークン
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenSearch, setTokenSearch] = useState<string>('');
  const [posFilter, setPosFilter] = useState<string>('all');

  // 2. 頻出語
  const [allFrequencies, setAllFrequencies] = useState<FrequencyItem[]>([]);
  const [freqSearch, setFreqSearch] = useState<string>('');
  const [includeSingleChar, setIncludeSingleChar] = useState<boolean>(true);
  const [freqSortOrder, setFreqSortOrder] = useState<'count' | 'alpha'>('count');

  // 3. 知識・ルビ辞書
  const [rubies, setRubies] = useState<ProjectRubyEntry[]>([]);
  const [entities, setEntities] = useState<ProjectEntity[]>([]);
  const [dictCategory, setDictCategory] = useState<'rubies' | 'characters' | 'locations'>('rubies');
  const [dictSearch, setDictSearch] = useState<string>('');

  // データ取得
  const loadData = useCallback(async () => {
    if (!activeDocument?.content) {
      setTokens([]);
      setAllFrequencies([]);
      return;
    }

    setLoading(true);
    try {
      const [tokenRes, checkRes] = await Promise.all([
        tokenizeText(activeDocument.content),
        checkText(activeDocument.content),
      ]);
      setTokens(tokenRes);
      setAllFrequencies(checkRes.allFrequencies || checkRes.frequencies || []);

      if (projectPath) {
        try {
          const [rubiesRes, entitiesRes] = await Promise.all([
            getRubyDictionary(),
            getEntities(),
          ]);
          setRubies(rubiesRes || []);
          setEntities(entitiesRes || []);
        } catch (err) {
          console.warn('[DebugPanel] Failed to load metadata dictionaries:', err);
        }
      }
    } catch (err) {
      console.error('[DebugPanel] Failed to load debug data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeDocument?.content, projectPath]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // エディターへのジャンプ
  const handleJumpToRange = (range?: CalibrationRange | null) => {
    if (!activeDocument || !range) return;
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

  // フィルタ済みトークン一覧
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (tokenSearch) {
        const q = tokenSearch.toLowerCase();
        const matchSurface = t.surface.toLowerCase().includes(q);
        const matchReading = t.reading?.toLowerCase().includes(q) ?? false;
        const matchBase = t.baseForm?.toLowerCase().includes(q) ?? false;
        if (!matchSurface && !matchReading && !matchBase) return false;
      }
      if (posFilter !== 'all') {
        return t.pos.startsWith(posFilter);
      }
      return true;
    });
  }, [tokens, tokenSearch, posFilter]);

  // フィルタ済み頻出語一覧
  const filteredFrequencies = useMemo(() => {
    let list = allFrequencies.filter((item) => {
      if (!includeSingleChar && item.word.length < 2) {
        return false;
      }
      if (freqSearch) {
        return item.word.toLowerCase().includes(freqSearch.toLowerCase());
      }
      return true;
    });

    if (freqSortOrder === 'count') {
      list.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    } else {
      list.sort((a, b) => a.word.localeCompare(b.word));
    }
    return list;
  }, [allFrequencies, includeSingleChar, freqSearch, freqSortOrder]);

  // フィルタ済み辞書・エンティティ
  const filteredDictItems = useMemo(() => {
    if (dictCategory === 'rubies') {
      return rubies.filter((r) => {
        if (!dictSearch) return true;
        const q = dictSearch.toLowerCase();
        return (
          r.surface.toLowerCase().includes(q) ||
          r.canonicalRuby.toLowerCase().includes(q)
        );
      });
    } else if (dictCategory === 'characters') {
      return entities
        .filter((e) => e.category === 'character')
        .filter((e) => {
          if (!dictSearch) return true;
          const q = dictSearch.toLowerCase();
          return (
            e.name.toLowerCase().includes(q) ||
            e.reading?.toLowerCase().includes(q) ||
            e.aliases.some((a) => a.toLowerCase().includes(q))
          );
        });
    } else {
      return entities
        .filter((e) => e.category === 'location' || e.category === 'term')
        .filter((e) => {
          if (!dictSearch) return true;
          const q = dictSearch.toLowerCase();
          return (
            e.name.toLowerCase().includes(q) ||
            e.reading?.toLowerCase().includes(q) ||
            e.aliases.some((a) => a.toLowerCase().includes(q))
          );
        });
    }
  }, [rubies, entities, dictCategory, dictSearch]);

  return (
    <div className="debug-panel">
      {/* パネルヘッダー */}
      <div className="debug-panel-header">
        <div className="debug-panel-title-area">
          <Binary size={16} color="var(--accent-color, #3b82f6)" />
          <span className="debug-panel-title">形態素・辞書デバッガー</span>
          <span className="debug-panel-badge">{tokens.length} 語</span>
        </div>
        <button
          type="button"
          className="debug-pill-btn"
          onClick={loadData}
          disabled={loading}
          title="最新の原稿内容で再解析"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* タブナビゲーション */}
      <div className="debug-panel-tabs">
        <button
          type="button"
          className={`debug-tab-btn ${activeTab === 'tokens' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokens')}
        >
          <Binary size={13} />
          <span>形態素トークン</span>
        </button>
        <button
          type="button"
          className={`debug-tab-btn ${activeTab === 'frequencies' ? 'active' : ''}`}
          onClick={() => setActiveTab('frequencies')}
        >
          <Tag size={13} />
          <span>全頻出語 ({filteredFrequencies.length})</span>
        </button>
        <button
          type="button"
          className={`debug-tab-btn ${activeTab === 'dictionaries' ? 'active' : ''}`}
          onClick={() => setActiveTab('dictionaries')}
        >
          <BookOpen size={13} />
          <span>作品辞書</span>
        </button>
      </div>

      {/* タブコンテンツ */}
      <div className="debug-panel-content">
        {/* 1. 形態素トークン一覧 */}
        {activeTab === 'tokens' && (
          <>
            <div className="debug-toolbar">
              <input
                type="text"
                className="debug-search-input"
                placeholder="単語・読み・原形で検索..."
                value={tokenSearch}
                onChange={(e) => setTokenSearch(e.target.value)}
              />
              <div className="debug-filter-pills">
                <button
                  type="button"
                  className={`debug-pill-btn ${posFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setPosFilter('all')}
                >
                  すべて
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${posFilter === '名詞' ? 'active' : ''}`}
                  onClick={() => setPosFilter('名詞')}
                >
                  名詞
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${posFilter === '動詞' ? 'active' : ''}`}
                  onClick={() => setPosFilter('動詞')}
                >
                  動詞
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${posFilter === '形容詞' ? 'active' : ''}`}
                  onClick={() => setPosFilter('形容詞')}
                >
                  形容詞
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${posFilter === '助詞' ? 'active' : ''}`}
                  onClick={() => setPosFilter('助詞')}
                >
                  助詞
                </button>
              </div>
            </div>

            <div className="debug-table-wrapper">
              {filteredTokens.length === 0 ? (
                <div className="debug-empty-state">
                  <span>該当する形態素トークンはありません</span>
                </div>
              ) : (
                <table className="debug-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>表層形</th>
                      <th style={{ width: '25%' }}>品詞詳細</th>
                      <th style={{ width: '20%' }}>読み</th>
                      <th style={{ width: '15%' }}>原形</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map((t, idx) => (
                      <tr
                        key={idx}
                        className={t.range ? 'clickable' : ''}
                        onClick={() => handleJumpToRange(t.range)}
                        title={t.range ? `L${t.range.startLine}:C${t.range.startColumn} へジャンプ` : ''}
                      >
                        <td style={{ fontWeight: 600 }}>{t.surface}</td>
                        <td>
                          <span className="debug-pos-tag">{t.pos}</span>
                        </td>
                        <td className="debug-reading">{t.reading || '-'}</td>
                        <td style={{ color: 'var(--text-secondary, #6b7280)' }}>
                          {t.baseForm || t.surface}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {t.range ? (
                            <span className="debug-jump-link">
                              L{t.range.startLine}:C{t.range.startColumn}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* 2. 全頻出語・語彙分析 */}
        {activeTab === 'frequencies' && (
          <>
            <div className="debug-toolbar">
              <input
                type="text"
                className="debug-search-input"
                placeholder="頻出語を検索..."
                value={freqSearch}
                onChange={(e) => setFreqSearch(e.target.value)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label className="debug-checkbox-label">
                  <input
                    type="checkbox"
                    checked={includeSingleChar}
                    onChange={(e) => setIncludeSingleChar(e.target.checked)}
                  />
                  <span>1文字語句を含める</span>
                </label>
                <div className="debug-filter-pills">
                  <button
                    type="button"
                    className={`debug-pill-btn ${freqSortOrder === 'count' ? 'active' : ''}`}
                    onClick={() => setFreqSortOrder('count')}
                  >
                    回数順
                  </button>
                  <button
                    type="button"
                    className={`debug-pill-btn ${freqSortOrder === 'alpha' ? 'active' : ''}`}
                    onClick={() => setFreqSortOrder('alpha')}
                  >
                    50音順
                  </button>
                </div>
              </div>
            </div>

            <div className="debug-table-wrapper">
              {filteredFrequencies.length === 0 ? (
                <div className="debug-empty-state">
                  <span>頻出語データはありません</span>
                </div>
              ) : (
                <table className="debug-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12%' }}>順位</th>
                      <th style={{ width: '40%' }}>単語</th>
                      <th style={{ width: '28%' }}>品詞詳細</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>出現回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFrequencies.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text-secondary, #6b7280)', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                          {item.word}
                        </td>
                        <td>
                          <span className="debug-pos-tag">{item.pos}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-color, #3b82f6)' }}>
                          {item.count} 回
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* 3. 知識・ルビ辞書一覧 */}
        {activeTab === 'dictionaries' && (
          <>
            <div className="debug-toolbar">
              <input
                type="text"
                className="debug-search-input"
                placeholder="作品辞書・エンティティを検索..."
                value={dictSearch}
                onChange={(e) => setDictSearch(e.target.value)}
              />
              <div className="debug-filter-pills">
                <button
                  type="button"
                  className={`debug-pill-btn ${dictCategory === 'rubies' ? 'active' : ''}`}
                  onClick={() => setDictCategory('rubies')}
                >
                  作品ルビ ({rubies.length})
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${dictCategory === 'characters' ? 'active' : ''}`}
                  onClick={() => setDictCategory('characters')}
                >
                  登場人物 ({entities.filter((e) => e.category === 'character').length})
                </button>
                <button
                  type="button"
                  className={`debug-pill-btn ${dictCategory === 'locations' ? 'active' : ''}`}
                  onClick={() => setDictCategory('locations')}
                >
                  地名・用語 ({entities.filter((e) => e.category !== 'character').length})
                </button>
              </div>
            </div>

            <div className="debug-table-wrapper">
              {filteredDictItems.length === 0 ? (
                <div className="debug-empty-state">
                  <span>登録されている辞書データはありません</span>
                </div>
              ) : dictCategory === 'rubies' ? (
                <table className="debug-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>親文字</th>
                      <th style={{ width: '40%' }}>ルビ（読み）</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>出現回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredDictItems as ProjectRubyEntry[]).map((r, idx) => {
                      const totalCount = r.variants.reduce((acc, v) => acc + v.count, 0);
                      return (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{r.surface}</td>
                          <td className="debug-reading">{r.canonicalRuby}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-secondary, #6b7280)' }}>
                            {totalCount} 回
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="debug-table">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>名前 / 名称</th>
                      <th style={{ width: '25%' }}>読み</th>
                      <th style={{ width: '40%' }}>別名 (Alias) / タグ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredDictItems as ProjectEntity[]).map((e, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{e.name}</td>
                        <td className="debug-reading">{e.reading || '-'}</td>
                        <td style={{ fontSize: '10px', color: 'var(--text-secondary, #6b7280)' }}>
                          {e.aliases.join(', ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const DebugPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.debug',
  title: '形態素・辞書デバッガー',
  icon: Binary,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'document',
  priority: 95,
  component: DebugPanel,
};
