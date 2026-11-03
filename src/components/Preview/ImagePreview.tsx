import React, { useState, useRef, useCallback, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, AlertCircle } from 'lucide-react';
import { DocumentViewProps } from '../../types/viewPlugin';
import { fileService } from '../../services/fileService';
import './ImagePreview.css';

function getMimeType(extension?: string): string {
  const ext = extension?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'ico':
      return 'image/x-icon';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return 'image/png';
  }
}

export const ImagePreview: React.FC<DocumentViewProps> = ({
  path,
  baseName,
  extension,
  absolutePath,
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [hasError, setHasError] = useState<boolean>(false);
  const blobUrlRef = useRef<string | null>(null);

  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const targetPath = absolutePath || path;

  // パス変更時のリセットおよび画像ソース初期化
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setHasError(false);

    // 古いBlob URLの解放
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    try {
      const src = convertFileSrc(targetPath);
      setImageSrc(src);
    } catch {
      // convertFileSrc失敗時は最初からバイナリBlob読み込みを試みる
      loadAsBlob();
    }

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [targetPath]);

  // バイナリ読み込みによるBlob URLフォールバック
  const loadAsBlob = useCallback(async () => {
    try {
      const bytes = await fileService.readFileBinary(targetPath);
      if (!bytes || bytes.length === 0) {
        setHasError(true);
        return;
      }
      const mime = getMimeType(extension || fileService.extname(targetPath));
      const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = url;
      setImageSrc(url);
    } catch (e) {
      console.error("Failed to load image as blob:", e);
      setHasError(true);
    }
  }, [targetPath, extension]);

  // 画像読み込みエラー時のフォールバック処理
  const handleImageError = useCallback(() => {
    // 既にBlob URLでの試行済みなら真のエラーとする
    if (blobUrlRef.current && imageSrc === blobUrlRef.current) {
      setHasError(true);
      return;
    }
    // convertFileSrcで失敗した場合はバイナリBlobフォールバックを試みる
    loadAsBlob();
  }, [imageSrc, loadAsBlob]);

  // マウスホイールによるズーム
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale((prev) => {
      const next = Math.max(0.1, Math.min(10, prev * zoomFactor));
      return Math.round(next * 100) / 100;
    });
  }, []);

  // マウスドラッグによる移動（パン）開始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 左クリックのみ
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  // ドラッグ中
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  // ドラッグ終了
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ズームリセット (等倍 100%)
  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // 全体表示 (コンテナに合わせる Fit)
  const handleFit = () => {
    if (!containerRef.current || !imageRef.current) return;
    const containerW = containerRef.current.clientWidth - 40;
    const containerH = containerRef.current.clientHeight - 40;
    const imgW = imageRef.current.naturalWidth || 800;
    const imgH = imageRef.current.naturalHeight || 600;

    const scaleW = containerW / imgW;
    const scaleH = containerH / imgH;
    const fitScale = Math.min(scaleW, scaleH, 1);

    setScale(Math.round(fitScale * 100) / 100);
    setPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(10, Math.round(prev * 1.25 * 100) / 100));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.1, Math.round(prev * 0.8 * 100) / 100));
  };

  const fileName = baseName || (path ? fileService.basename(path) : '');

  if (hasError) {
    return (
      <div className="image-preview-container image-preview-error">
        <div className="unsupported-file-content">
          <AlertCircle size={40} className="unsupported-icon" />
          <h3 className="unsupported-title">画像の読み込みに失敗しました</h3>
          <p className="unsupported-desc">
            ファイル形式が破損しているか、アクセスできません。<br />
            <code>{fileName}</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`image-preview-container ${isDragging ? 'is-dragging' : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="image-preview-canvas"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        }}
      >
        {imageSrc && (
          <img
            ref={imageRef}
            src={imageSrc}
            alt={fileName}
            className="image-preview-element"
            draggable={false}
            onError={handleImageError}
            onLoad={(e) => {
              // 初回ロード時に大きすぎる画像はウィンドウにフィット
              const target = e.currentTarget;
              if (containerRef.current) {
                const cW = containerRef.current.clientWidth - 60;
                const cH = containerRef.current.clientHeight - 60;
                if (target.naturalWidth > cW || target.naturalHeight > cH) {
                  const sW = cW / target.naturalWidth;
                  const sH = cH / target.naturalHeight;
                  setScale(Math.min(sW, sH, 1));
                }
              }
            }}
          />
        )}
      </div>

      {/* フローティングツールバー */}
      <div className="image-preview-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="image-tool-btn"
          onClick={handleZoomOut}
          title="縮小 (マウスホイール下でも可)"
        >
          <ZoomOut size={14} />
        </button>

        <span
          className="image-zoom-indicator"
          onClick={handleResetZoom}
          title="クリックで100%にリセット"
        >
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          className="image-tool-btn"
          onClick={handleZoomIn}
          title="拡大 (マウスホイール上でも可)"
        >
          <ZoomIn size={14} />
        </button>

        <div className="image-toolbar-separator" />

        <button
          type="button"
          className="image-tool-btn"
          onClick={handleFit}
          title="画面サイズに合わせる (Fit)"
        >
          <Maximize2 size={14} />
        </button>

        <button
          type="button"
          className="image-tool-btn"
          onClick={handleResetZoom}
          title="原寸サイズ (100%) と位置をリセット"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
};
