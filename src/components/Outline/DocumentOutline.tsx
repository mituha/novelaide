import React, { useMemo } from 'react';
import { PanelProps } from '../../types/panelPlugin';
import { Hash } from 'lucide-react';
import './DocumentOutline.css';

interface OutlineItem {
  line: number;
  level: number;
  text: string;
}

export const DocumentOutline: React.FC<PanelProps> = ({ activeDocument }) => {
  // ドキュメント内容から見出し（# 見出し または 【〇〇】）を抽出
  const outlineItems = useMemo<OutlineItem[]>(() => {
    if (!activeDocument || !activeDocument.content) return [];

    const lines = activeDocument.content.split('\n');
    const items: OutlineItem[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Markdown 見出し (# , ## , ### )
      const mdMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (mdMatch) {
        items.push({
          line: index + 1,
          level: mdMatch[1].length,
          text: mdMatch[2],
        });
        return;
      }

      // 小説特有の章見出し（【第一話 ...】や 第〇章）
      if (trimmed.startsWith('【') && trimmed.endsWith('】')) {
        items.push({
          line: index + 1,
          level: 1,
          text: trimmed,
        });
      } else if (/^第[0-9一二三四五六七八九十百]+[話章節]/.test(trimmed)) {
        items.push({
          line: index + 1,
          level: 1,
          text: trimmed,
        });
      }
    });

    return items;
  }, [activeDocument]);

  if (!activeDocument) {
    return (
      <div className="document-outline-container">
        <div className="document-outline-empty">ドキュメントが開かれていません</div>
      </div>
    );
  }

  return (
    <div className="document-outline-container">
      <div className="document-outline-header">目次・アウトライン</div>
      {outlineItems.length === 0 ? (
        <div className="document-outline-empty">見出し（# や 章タイトル）が見つかりません</div>
      ) : (
        <ul className="document-outline-list">
          {outlineItems.map((item, idx) => (
            <li
              key={idx}
              className={`document-outline-item level-${item.level}`}
              title={`行 ${item.line}: ${item.text}`}
            >
              <Hash size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
