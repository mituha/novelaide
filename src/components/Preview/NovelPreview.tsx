import React, { useState, useMemo } from 'react';
import { transformToHtml } from 'novelaid-ruby';
import { DocumentViewProps } from '../../types/viewPlugin';
import { BookOpen, AlignLeft, ZoomIn, ZoomOut } from 'lucide-react';
import './NovelPreview.css';

interface NovelPreviewProps extends DocumentViewProps {
  initialVertical?: boolean;
}

export const NovelPreview: React.FC<NovelPreviewProps> = ({
  content,
  initialVertical = true,
}) => {
  const [isVertical, setIsVertical] = useState<boolean>(initialVertical);
  const [fontSize, setFontSize] = useState<number>(17);

  // novelaid-ruby によるルビ・傍点HTML変換
  const formattedHtml = useMemo(() => {
    if (!content) return '';
    return transformToHtml(content);
  }, [content]);

  const handleZoomIn = () => {
    setFontSize((prev) => Math.min(prev + 2, 28));
  };

  const handleZoomOut = () => {
    setFontSize((prev) => Math.max(prev - 2, 12));
  };

  return (
    <div className="novel-preview-wrapper">
      {/* プレビュー上部ツールバー */}
      <div className="novel-preview-toolbar">
        <div className="novel-preview-toolbar-group">
          <button
            type="button"
            className={`novel-preview-btn ${isVertical ? 'active' : ''}`}
            onClick={() => setIsVertical(true)}
            title="縦書き表示 (文庫本スタイル)"
          >
            <BookOpen size={14} />
            <span>縦書き</span>
          </button>
          <button
            type="button"
            className={`novel-preview-btn ${!isVertical ? 'active' : ''}`}
            onClick={() => setIsVertical(false)}
            title="横書き表示"
          >
            <AlignLeft size={14} />
            <span>横書き</span>
          </button>
        </div>

        <div className="novel-preview-toolbar-group">
          <button
            type="button"
            className="novel-preview-btn"
            onClick={handleZoomOut}
            title="文字サイズ縮小"
          >
            <ZoomOut size={14} />
          </button>
          <span style={{ fontSize: '11px', minWidth: '36px', textAlign: 'center' }}>
            {fontSize}px
          </span>
          <button
            type="button"
            className="novel-preview-btn"
            onClick={handleZoomIn}
            title="文字サイズ拡大"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      {/* スクロール領域 */}
      <div
        className={`novel-preview-scroll-container ${isVertical ? 'is-vertical' : 'is-horizontal'}`}
      >
        <div
          className={`novel-paper ${isVertical ? 'is-vertical' : 'is-horizontal'}`}
          style={{ fontSize: `${fontSize}px` }}
          dangerouslySetInnerHTML={{ __html: formattedHtml }}
        />
      </div>
    </div>
  );
};
