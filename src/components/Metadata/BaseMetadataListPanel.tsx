import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';
import { fileService } from '../../services/fileService';
import './BaseMetadataListPanel.css';

export interface NormalizedMetadataItem {
  path: string;
  fileName: string;
  title: string;
  name?: string;
  role?: string;
  summary?: string;
  tags: string[];
  series: string[];
  books: string[];
  chapters: string[];
  category: 'character' | 'location' | 'plot' | 'term' | 'item' | 'other';
}

export type MetadataCategoryFilter = 'character' | 'location' | 'plot' | 'all';
export type GroupingMode = 'role' | 'category' | 'book' | 'tag' | 'series';

export interface BaseMetadataListPanelProps {
  targetCategory?: MetadataCategoryFilter;
  defaultGrouping?: GroupingMode;
  panelTitle: string;
  headerIcon: React.ReactNode;
}

const CHARACTER_TAGS = ['character', '登場人物', '人名', '人物', 'chara'];
const LOCATION_TAGS = [
  'location',
  'places',
  'place',
  'geo',
  'geography',
  '地名',
  '施設',
  '場所',
  '舞台',
  '世界観',
  '国',
  '都市',
  '拠点',
  'ダンジョン',
];
const PLOT_TAGS = [
  'plot',
  '構成',
  'プロット',
  '案',
  'timeline',
  '時間軸',
  '年表',
  '章',
  'エピソード',
];

/** 配列または文字列から文字列リストを安全に正規化 */
function normalizeStringArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0);
  }
  if (typeof val === 'string') {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

/** カテゴリ判定 */
function resolveCategory(tags: string[]): 'character' | 'location' | 'plot' | 'other' {
  const lowerTags = tags.map((t) => t.toLowerCase());
  if (CHARACTER_TAGS.some((t) => lowerTags.includes(t.toLowerCase()))) {
    return 'character';
  }
  if (LOCATION_TAGS.some((t) => lowerTags.includes(t.toLowerCase()))) {
    return 'location';
  }
  if (PLOT_TAGS.some((t) => lowerTags.includes(t.toLowerCase()))) {
    return 'plot';
  }
  return 'other';
}

export const BaseMetadataListPanel: React.FC<BaseMetadataListPanelProps> = ({
  targetCategory = 'all',
  defaultGrouping = 'category',
  panelTitle,
  headerIcon,
}) => {
  const { openDocument } = useDocument();
  const { projectPath } = useProject();

  const [cache, setCache] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState<boolean>(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const loadCache = useCallback(async () => {
    setIsLoading(true);
    try {
      if (projectPath && !projectPath.startsWith('mock')) {
        await fileService.scanProjectMetadata(projectPath);
      }
      const data = await fileService.getMetadataCache();
      setCache(data || {});
    } catch (e) {
      console.error('Failed to load metadata cache:', e);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadCache();
  }, [loadCache, projectPath]);

  // 全アイテムのパースと正規化（novelaid-editor互換）
  const allItems: NormalizedMetadataItem[] = useMemo(() => {
    return Object.entries(cache).map(([filePath, meta]) => {
      const fileName = filePath.split(/[/\\]/).pop() || '';
      const baseNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

      // tags と tag を両方抽出
      const rawTags = [
        ...normalizeStringArray(meta.tags),
        ...normalizeStringArray(meta.tag),
        ...normalizeStringArray(meta.type),
        ...normalizeStringArray(meta.category),
      ];
      const tags = Array.from(new Set(rawTags));

      // series / books / chapters の抽出
      const series = Array.from(
        new Set([
          ...normalizeStringArray(meta.series),
          ...normalizeStringArray(meta.serieses),
        ])
      );
      const books = Array.from(
        new Set([
          ...normalizeStringArray(meta.books),
          ...normalizeStringArray(meta.book),
          ...normalizeStringArray(meta.volumes),
          ...normalizeStringArray(meta.volume),
        ])
      );
      const chapters = Array.from(
        new Set([
          ...normalizeStringArray(meta.chapters),
          ...normalizeStringArray(meta.chapter),
        ])
      );

      // タイトルフォールバック
      const title =
        meta.name ||
        meta.title ||
        meta.location ||
        meta.place ||
        meta.facility ||
        baseNameWithoutExt;

      const category = resolveCategory(tags);

      return {
        path: filePath,
        fileName,
        title,
        name: meta.name,
        role: meta.role,
        summary: meta.summary || meta.description,
        tags,
        series,
        books,
        chapters,
        category,
      };
    });
  }, [cache]);

  // パネル対象カテゴリでフィルタ
  const categoryFilteredItems = useMemo(() => {
    if (targetCategory === 'all') {
      return allItems;
    }
    return allItems.filter((item) => item.category === targetCategory);
  }, [allItems, targetCategory]);

  // シリーズ・巻・頻出タグ一覧の抽出
  const availableSeries = useMemo(() => {
    const set = new Set<string>();
    categoryFilteredItems.forEach((item) => {
      item.series.forEach((s) => set.add(s));
    });
    return Array.from(set).sort();
  }, [categoryFilteredItems]);

  const availableBooks = useMemo(() => {
    const set = new Set<string>();
    categoryFilteredItems.forEach((item) => {
      if (selectedSeries === 'all' || item.series.includes(selectedSeries)) {
        item.books.forEach((b) => set.add(b));
      }
    });
    return Array.from(set).sort();
  }, [categoryFilteredItems, selectedSeries]);

  const availableTags = useMemo(() => {
    const map = new Map<string, number>();
    categoryFilteredItems.forEach((item) => {
      item.tags.forEach((t) => {
        map.set(t, (map.get(t) || 0) + 1);
      });
    });
    // 出現頻度順にソート（上位20件程度）
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [categoryFilteredItems]);

  // フィルター処理（検索、シリーズ、巻、タグAND）
  const filteredItems = useMemo(() => {
    return categoryFilteredItems.filter((item) => {
      // シリーズ絞り込み
      if (selectedSeries !== 'all' && !item.series.includes(selectedSeries)) {
        return false;
      }
      // 巻絞り込み
      if (selectedBook !== 'all' && !item.books.includes(selectedBook)) {
        return false;
      }
      // タグAND絞り込み（選択されたすべてのタグを含む必要がある）
      if (selectedTags.length > 0) {
        const itemLowerTags = item.tags.map((t) => t.toLowerCase());
        const hasAllTags = selectedTags.every((st) =>
          itemLowerTags.includes(st.toLowerCase())
        );
        if (!hasAllTags) return false;
      }
      // フリーワード検索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = item.title.toLowerCase().includes(q);
        const inSummary = item.summary ? item.summary.toLowerCase().includes(q) : false;
        const inRole = item.role ? item.role.toLowerCase().includes(q) : false;
        const inTags = item.tags.some((t) => t.toLowerCase().includes(q));
        if (!inTitle && !inSummary && !inRole && !inTags) {
          return false;
        }
      }
      return true;
    });
  }, [categoryFilteredItems, selectedSeries, selectedBook, selectedTags, searchQuery]);

  // グルーピング計算
  const grouped = useMemo(() => {
    const groups: Record<string, { title: string; items: NormalizedMetadataItem[] }> = {};

    if (defaultGrouping === 'role' && targetCategory === 'character') {
      // 役割別グループ
      groups['protagonist'] = { title: '主人公・主要人物', items: [] };
      groups['sub'] = { title: 'サブキャラクター', items: [] };
      groups['rival'] = { title: '敵対者・ライバル', items: [] };
      groups['other'] = { title: 'その他の登場人物', items: [] };

      filteredItems.forEach((item) => {
        const r = (item.role || '').toLowerCase();
        if (r.includes('主') || r.includes('main') || r.includes('ヒーロー') || r.includes('ヒロイン')) {
          groups['protagonist'].items.push(item);
        } else if (r.includes('敵') || r.includes('ライバル') || r.includes('boss')) {
          groups['rival'].items.push(item);
        } else if (item.role) {
          groups['sub'].items.push(item);
        } else {
          groups['other'].items.push(item);
        }
      });
    } else if (defaultGrouping === 'category' || targetCategory === 'all') {
      // カテゴリ別グループ
      groups['character'] = { title: '登場人物', items: [] };
      groups['location'] = { title: '地名・施設・世界観', items: [] };
      groups['plot'] = { title: 'プロット・構成', items: [] };
      groups['other'] = { title: 'その他の設定・資料', items: [] };

      filteredItems.forEach((item) => {
        groups[item.category]?.items.push(item);
      });
    } else if (defaultGrouping === 'book') {
      // 巻・本別グループ
      const bookKeys = new Set<string>();
      filteredItems.forEach((item) => {
        if (item.books.length > 0) {
          item.books.forEach((b) => bookKeys.add(b));
        } else {
          bookKeys.add('未指定');
        }
      });

      Array.from(bookKeys)
        .sort()
        .forEach((bk) => {
          groups[bk] = { title: bk === '未指定' ? '巻指定なし' : bk, items: [] };
        });

      filteredItems.forEach((item) => {
        if (item.books.length > 0) {
          item.books.forEach((b) => groups[b]?.items.push(item));
        } else {
          groups['未指定']?.items.push(item);
        }
      });
    } else {
      // デフォルト: 単一フラット一覧
      groups['all'] = { title: '一覧', items: filteredItems };
    }

    return groups;
  }, [filteredItems, defaultGrouping, targetCategory]);

  // グループ初期展開設定
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    Object.keys(grouped).forEach((key) => {
      initial[key] = true;
    });
    setExpandedGroups(initial);
  }, [targetCategory, defaultGrouping]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="base-metadata-panel-root">
      {/* ヘッダー */}
      <div className="base-metadata-header">
        <div className="base-metadata-title">
          {headerIcon}
          <span>{panelTitle}</span>
        </div>
        <div className="base-metadata-actions">
          <button
            type="button"
            className={`base-metadata-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            title={showFilters ? 'フィルターを非表示' : 'フィルターを表示'}
          >
            <Filter size={13} />
          </button>
          <button
            type="button"
            className={`base-metadata-btn ${isLoading ? 'spinning' : ''}`}
            onClick={loadCache}
            title="設定資料を再読み込み"
            disabled={isLoading}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* フィルターバー */}
      {showFilters && (
        <div className="base-metadata-filters">
          {/* 検索ボックス */}
          <div className="base-metadata-search-box">
            <Search size={12} />
            <input
              type="text"
              className="base-metadata-search-input"
              placeholder="検索（名前・読み・メモ・タグ）..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* シリーズ・巻ドロップダウン */}
          {(availableSeries.length > 0 || availableBooks.length > 0) && (
            <div className="base-metadata-selects-row">
              {availableSeries.length > 0 && (
                <select
                  className="base-metadata-select"
                  value={selectedSeries}
                  onChange={(e) => {
                    setSelectedSeries(e.target.value);
                    setSelectedBook('all');
                  }}
                >
                  <option value="all">全シリーズ</option>
                  {availableSeries.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}

              {availableBooks.length > 0 && (
                <select
                  className="base-metadata-select"
                  value={selectedBook}
                  onChange={(e) => setSelectedBook(e.target.value)}
                >
                  <option value="all">全巻・本</option>
                  {availableBooks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* タグチップス（AND絞り込み） */}
          {availableTags.length > 0 && (
            <div className="base-metadata-tags-row">
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`base-metadata-tag-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* リスト本体 */}
      <div className="base-metadata-body">
        {Object.entries(grouped).map(([groupKey, group]) => {
          if (group.items.length === 0 && targetCategory !== 'all') {
            return null;
          }
          const isExpanded = !!expandedGroups[groupKey];

          return (
            <div key={groupKey} className="base-metadata-group">
              <button
                type="button"
                className="base-metadata-group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="base-metadata-group-name">{group.title}</span>
                <span className="base-metadata-badge">{group.items.length}</span>
              </button>

              {isExpanded && (
                <div className="base-metadata-items">
                  {group.items.length === 0 ? (
                    <div className="base-metadata-empty">
                      <span>該当する設定ファイルがありません</span>
                    </div>
                  ) : (
                    group.items.map((item) => (
                      <div
                        key={item.path}
                        className="base-metadata-card"
                        onClick={() => openDocument(item.path)}
                        title={`${item.title} (${item.fileName})\n${item.summary || ''}`}
                      >
                        <div className="base-metadata-card-top">
                          <span className="base-metadata-card-title">{item.title}</span>
                          <div className="base-metadata-card-badges">
                            {item.role && (
                              <span className="base-metadata-role-badge">{item.role}</span>
                            )}
                            {(item.series.length > 0 || item.books.length > 0) && (
                              <div className="base-metadata-hierarchy-badges">
                                {item.series.map((s) => (
                                  <span key={s} className="base-metadata-series-badge">
                                    {s}
                                  </span>
                                ))}
                                {item.books.map((b) => (
                                  <span key={b} className="base-metadata-book-badge">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {item.summary && (
                          <p className="base-metadata-card-summary">{item.summary}</p>
                        )}

                        {item.tags.length > 0 && (
                          <div className="base-metadata-card-tags">
                            {item.tags.map((t) => (
                              <span key={t} className="base-metadata-tag-item">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
