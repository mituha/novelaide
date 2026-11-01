import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tag,
  User,
  MapPin,
  ScrollText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Info,
  Sparkles,
} from 'lucide-react';
import { useDocument } from '../../contexts/DocumentContext';
import './MetadataPanel.css';

interface TagGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  tags: string[];
  primary: string;
}

const TAG_GROUPS: TagGroup[] = [
  {
    id: 'character',
    label: '登場人物',
    icon: <User size={13} />,
    tags: ['character', '登場人物', '人名', '人物', 'chara'],
    primary: 'character',
  },
  {
    id: 'location',
    label: '地名・舞台',
    icon: <MapPin size={13} />,
    tags: ['location', 'places', '地名', '施設', '場所', 'place', 'geo'],
    primary: 'location',
  },
  {
    id: 'plot',
    label: 'プロット・年表',
    icon: <ScrollText size={13} />,
    tags: ['plot', '構成', 'プロット', '案', 'timeline', '時間軸', '年表'],
    primary: 'plot',
  },
];

export const MetadataPanel: React.FC = () => {
  const { activeDocument, updateMetadata } = useDocument();

  // ドキュメントのメタデータをローカルステートで保持
  const [metadata, setLocalMetadata] = useState<Record<string, any>>({});
  const [expandedDetails, setExpandedDetails] = useState<boolean>(true);
  const [expandedCustom, setExpandedCustom] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');

  useEffect(() => {
    if (activeDocument) {
      setLocalMetadata(activeDocument.metadata || {});
    } else {
      setLocalMetadata({});
    }
  }, [activeDocument]);

  const handleChange = useCallback(
    (key: string, value: any) => {
      if (!activeDocument) return;
      const updated = { ...metadata, [key]: value };
      setLocalMetadata(updated);
      updateMetadata(activeDocument.path, updated);
    },
    [activeDocument, metadata, updateMetadata]
  );

  const handleDeleteKey = useCallback(
    (key: string) => {
      if (!activeDocument) return;
      const updated = { ...metadata };
      delete updated[key];
      setLocalMetadata(updated);
      updateMetadata(activeDocument.path, updated);
    },
    [activeDocument, metadata, updateMetadata]
  );

  // 現在のタグ配列
  const currentTags: string[] = useMemo(() => {
    const t = metadata.tags;
    if (Array.isArray(t)) return t;
    if (typeof t === 'string') {
      return t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }, [metadata.tags]);

  // クイックタグトグル
  const handleToggleTagGroup = useCallback(
    (group: TagGroup) => {
      const hasAny = group.tags.some((t) =>
        currentTags.some((ct) => ct.toLowerCase() === t.toLowerCase())
      );
      let nextTags: string[];
      if (hasAny) {
        const groupLower = group.tags.map((t) => t.toLowerCase());
        nextTags = currentTags.filter((ct) => !groupLower.includes(ct.toLowerCase()));
      } else {
        nextTags = [...currentTags, group.primary];
      }
      handleChange('tags', nextTags);
    },
    [currentTags, handleChange]
  );

  // タグ文字列の直接編集
  const handleTagsInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const splitted = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    handleChange('tags', splitted);
  };

  // カスタムフィールドの追加
  const handleAddCustomField = () => {
    const trimmed = newKey.trim();
    if (!trimmed || metadata[trimmed] !== undefined) return;
    handleChange(trimmed, '');
    setNewKey('');
    setExpandedCustom(true);
  };

  if (!activeDocument) {
    return (
      <div className="metadata-panel-empty">
        <Info size={32} className="metadata-empty-icon" />
        <p>ドキュメントを開くとメタデータ（Frontmatter）の確認・編集が行えます。</p>
      </div>
    );
  }

  // 予約済み標準フィールド一覧
  const standardKeys = new Set([
    'title',
    'tags',
    'summary',
    'description',
    'id',
    'name',
    'reading',
    'gender',
    'age',
    'role',
  ]);

  // カスタムキー一覧
  const customKeys = Object.keys(metadata).filter((k) => !standardKeys.has(k));

  return (
    <div className="metadata-panel-root">
      {/* 1. 基本設定 */}
      <section className="metadata-section">
        <div className="metadata-field">
          <label className="metadata-label" htmlFor="meta-title">
            <BookOpen size={13} />
            <span>タイトル</span>
          </label>
          <input
            id="meta-title"
            type="text"
            className="metadata-input"
            value={metadata.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="例: 第1章 運命の邂逅"
          />
        </div>

        {/* クイック分類タグ */}
        <div className="metadata-field">
          <span className="metadata-label">
            <Tag size={13} />
            <span>クイック分類</span>
          </span>
          <div className="metadata-quick-tags">
            {TAG_GROUPS.map((g) => {
              const isActive = g.tags.some((t) =>
                currentTags.some((ct) => ct.toLowerCase() === t.toLowerCase())
              );
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`metadata-tag-chip ${isActive ? 'active' : ''}`}
                  onClick={() => handleToggleTagGroup(g)}
                  title={`${g.label}タグをトグル`}
                >
                  {g.icon}
                  <span>{g.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* タグ一覧 */}
        <div className="metadata-field">
          <label className="metadata-label" htmlFor="meta-tags">
            <Tag size={13} />
            <span>タグ (カンマ区切り)</span>
          </label>
          <input
            id="meta-tags"
            type="text"
            className="metadata-input"
            value={currentTags.join(', ')}
            onChange={handleTagsInput}
            placeholder="例: character, 主人公, 魔法"
          />
        </div>

        {/* あらすじ / メモ */}
        <div className="metadata-field">
          <label className="metadata-label" htmlFor="meta-summary">
            <ScrollText size={13} />
            <span>あらすじ / 概要メモ</span>
          </label>
          <textarea
            id="meta-summary"
            className="metadata-textarea"
            rows={4}
            value={metadata.summary || metadata.description || ''}
            onChange={(e) => handleChange('summary', e.target.value)}
            placeholder="このファイルに関するプロット、伏線、メモなど..."
          />
        </div>
      </section>

      {/* 2. キャラクター / 設定資料 詳細属性 */}
      <section className="metadata-accordion-section">
        <button
          type="button"
          className="metadata-accordion-header"
          onClick={() => setExpandedDetails((prev) => !prev)}
        >
          {expandedDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Sparkles size={14} />
          <span>キャラクター / 舞台詳細</span>
        </button>

        {expandedDetails && (
          <div className="metadata-accordion-body">
            {/* 作品階層（シリーズ・巻） */}
            <div className="metadata-row">
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-series">
                  <BookOpen size={12} />
                  <span>シリーズ</span>
                </label>
                <input
                  id="meta-series"
                  type="text"
                  className="metadata-input"
                  value={
                    Array.isArray(metadata.series)
                      ? metadata.series.join(', ')
                      : metadata.series || ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange(
                      'series',
                      val.includes(',')
                        ? val.split(',').map((s) => s.trim()).filter(Boolean)
                        : val
                    );
                  }}
                  placeholder="例: 本編, 外伝"
                />
              </div>
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-books">
                  <BookOpen size={12} />
                  <span>登場巻・本 (カンマ区切り)</span>
                </label>
                <input
                  id="meta-books"
                  type="text"
                  className="metadata-input"
                  value={
                    Array.isArray(metadata.books)
                      ? metadata.books.join(', ')
                      : metadata.books || ''
                  }
                  onChange={(e) => {
                    const splitted = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    handleChange('books', splitted);
                  }}
                  placeholder="例: 1巻, 2巻"
                />
              </div>
            </div>

            <div className="metadata-row">
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-id">
                  <span>識別子 (ID)</span>
                </label>
                <input
                  id="meta-id"
                  type="text"
                  className="metadata-input"
                  value={metadata.id || ''}
                  onChange={(e) => handleChange('id', e.target.value)}
                  placeholder="例: chara_reo"
                />
              </div>
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-role">
                  <span>役割・立場</span>
                </label>
                <input
                  id="meta-role"
                  type="text"
                  className="metadata-input"
                  value={metadata.role || ''}
                  onChange={(e) => handleChange('role', e.target.value)}
                  placeholder="例: 主人公, 師匠"
                />
              </div>
            </div>

            <div className="metadata-row">
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-name">
                  <span>表示名 (本名)</span>
                </label>
                <input
                  id="meta-name"
                  type="text"
                  className="metadata-input"
                  value={metadata.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="例: 神代 玲央"
                />
              </div>
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-reading">
                  <span>フリガナ (読み)</span>
                </label>
                <input
                  id="meta-reading"
                  type="text"
                  className="metadata-input"
                  value={metadata.reading || ''}
                  onChange={(e) => handleChange('reading', e.target.value)}
                  placeholder="例: かみしろ れお"
                />
              </div>
            </div>

            <div className="metadata-row">
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-gender">
                  <span>性別</span>
                </label>
                <input
                  id="meta-gender"
                  type="text"
                  className="metadata-input"
                  value={metadata.gender || ''}
                  onChange={(e) => handleChange('gender', e.target.value)}
                  placeholder="例: 男性"
                />
              </div>
              <div className="metadata-field half">
                <label className="metadata-label" htmlFor="meta-age">
                  <span>年齢</span>
                </label>
                <input
                  id="meta-age"
                  type="text"
                  className="metadata-input"
                  value={metadata.age || ''}
                  onChange={(e) => handleChange('age', e.target.value)}
                  placeholder="例: 17歳"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. カスタムフィールド */}
      <section className="metadata-accordion-section">
        <button
          type="button"
          className="metadata-accordion-header"
          onClick={() => setExpandedCustom((prev) => !prev)}
        >
          {expandedCustom ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>カスタム属性 ({customKeys.length})</span>
        </button>

        {expandedCustom && (
          <div className="metadata-accordion-body">
            {customKeys.map((k) => (
              <div key={k} className="metadata-custom-row">
                <span className="metadata-custom-key" title={k}>
                  {k}
                </span>
                <input
                  type="text"
                  className="metadata-input custom"
                  value={
                    typeof metadata[k] === 'object'
                      ? JSON.stringify(metadata[k])
                      : metadata[k] || ''
                  }
                  onChange={(e) => handleChange(k, e.target.value)}
                />
                <button
                  type="button"
                  className="metadata-delete-btn"
                  onClick={() => handleDeleteKey(k)}
                  title={`${k} を削除`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <div className="metadata-add-field-bar">
              <input
                type="text"
                className="metadata-input add-key"
                placeholder="新しいフィールド名..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomField();
                  }
                }}
              />
              <button
                type="button"
                className="metadata-add-btn"
                onClick={handleAddCustomField}
                disabled={!newKey.trim()}
                title="フィールドを追加"
              >
                <Plus size={14} />
                <span>追加</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
