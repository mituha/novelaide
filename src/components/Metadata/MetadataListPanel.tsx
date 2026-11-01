import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User,
  MapPin,
  ScrollText,
  Tag,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import { useProject } from '../../contexts/ProjectContext';
import { fileService } from '../../services/fileService';
import './MetadataListPanel.css';

interface MetadataItem {
  path: string;
  fileName: string;
  title: string;
  summary?: string;
  tags: string[];
  role?: string;
  name?: string;
}

interface CategoryGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  tags: string[];
}

const CATEGORIES: CategoryGroup[] = [
  {
    id: 'character',
    title: '登場人物',
    icon: <User size={14} />,
    tags: ['character', '登場人物', '人名', '人物', 'chara'],
  },
  {
    id: 'location',
    title: '地名・舞台',
    icon: <MapPin size={14} />,
    tags: ['location', 'places', '地名', '施設', '場所', 'place', 'geo'],
  },
  {
    id: 'plot',
    title: 'プロット・年表',
    icon: <ScrollText size={14} />,
    tags: ['plot', '構成', 'プロット', '案', 'timeline', '時間軸', '年表'],
  },
];

export const MetadataListPanel: React.FC = () => {
  const { openDocument } = useDocument();
  const { projectPath } = useProject();

  const [cache, setCache] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    character: true,
    location: true,
    plot: true,
    other: false,
  });

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

  // 全アイテムをパースして正規化
  const allItems: MetadataItem[] = useMemo(() => {
    return Object.entries(cache).map(([filePath, meta]) => {
      const fileName = filePath.split(/[/\\]/).pop() || '';
      let tags: string[] = [];
      if (Array.isArray(meta.tags)) {
        tags = meta.tags;
      } else if (typeof meta.tags === 'string') {
        tags = meta.tags
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      return {
        path: filePath,
        fileName,
        title: meta.title || meta.name || fileName.replace(/\.[^/.]+$/, ''),
        name: meta.name,
        role: meta.role,
        summary: meta.summary || meta.description,
        tags,
      };
    });
  }, [cache]);

  // カテゴリごとに分類
  const categorized = useMemo(() => {
    const result: Record<string, MetadataItem[]> = {
      character: [],
      location: [],
      plot: [],
      other: [],
    };

    allItems.forEach((item) => {
      let matched = false;
      const lowerTags = item.tags.map((t) => t.toLowerCase());

      for (const cat of CATEGORIES) {
        if (cat.tags.some((t) => lowerTags.includes(t.toLowerCase()))) {
          result[cat.id].push(item);
          matched = true;
          break;
        }
      }

      if (!matched && item.tags.length > 0) {
        result.other.push(item);
      }
    });

    return result;
  }, [allItems]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  return (
    <div className="metadata-list-panel-root">
      {/* ヘッダー */}
      <div className="metadata-list-header">
        <div className="metadata-list-title">
          <Sparkles size={14} />
          <span>設定資料・登場人物</span>
        </div>
        <button
          type="button"
          className={`metadata-refresh-btn ${isLoading ? 'spinning' : ''}`}
          onClick={loadCache}
          title="設定資料を再読み込み"
          disabled={isLoading}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* カテゴリ一覧 */}
      <div className="metadata-list-body">
        {CATEGORIES.map((cat) => {
          const items = categorized[cat.id] || [];
          const isExpanded = !!expandedCategories[cat.id];

          return (
            <div key={cat.id} className="metadata-cat-section">
              <button
                type="button"
                className="metadata-cat-header"
                onClick={() => toggleCategory(cat.id)}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {cat.icon}
                <span className="metadata-cat-name">{cat.title}</span>
                <span className="metadata-cat-badge">{items.length}</span>
              </button>

              {isExpanded && (
                <div className="metadata-cat-items">
                  {items.length === 0 ? (
                    <div className="metadata-cat-empty">
                      <span>該当するファイルがありません</span>
                    </div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.path}
                        className="metadata-item-card"
                        onClick={() => openDocument(item.path)}
                        title={`${item.title} (${item.fileName})\n${item.summary || ''}`}
                      >
                        <div className="metadata-item-top">
                          <span className="metadata-item-title">{item.title}</span>
                          {item.role && <span className="metadata-item-role">{item.role}</span>}
                        </div>
                        {item.summary && (
                          <p className="metadata-item-summary">{item.summary}</p>
                        )}
                        {item.tags.length > 0 && (
                          <div className="metadata-item-tags">
                            {item.tags.map((t) => (
                              <span key={t} className="metadata-item-tag">
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

        {/* その他タグ */}
        {categorized.other.length > 0 && (
          <div className="metadata-cat-section">
            <button
              type="button"
              className="metadata-cat-header"
              onClick={() => toggleCategory('other')}
            >
              {expandedCategories.other ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Tag size={14} />
              <span className="metadata-cat-name">その他の設定・メモ</span>
              <span className="metadata-cat-badge">{categorized.other.length}</span>
            </button>

            {expandedCategories.other && (
              <div className="metadata-cat-items">
                {categorized.other.map((item) => (
                  <div
                    key={item.path}
                    className="metadata-item-card"
                    onClick={() => openDocument(item.path)}
                  >
                    <div className="metadata-item-top">
                      <span className="metadata-item-title">{item.title}</span>
                    </div>
                    {item.summary && <p className="metadata-item-summary">{item.summary}</p>}
                    <div className="metadata-item-tags">
                      {item.tags.map((t) => (
                        <span key={t} className="metadata-item-tag">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
