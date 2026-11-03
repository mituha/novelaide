import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NovelaidDocumentType, PaneId, DocumentViewMode, DirEntry } from '../../types/document';
import { fileService } from '../../services/fileService';
import { useDocument } from '../../contexts/DocumentContext';
import './EpisodeNavigator.css';

interface EpisodeNavigatorProps {
  activePath: string;
  documentType: NovelaidDocumentType;
  paneId: PaneId;
  viewMode: DocumentViewMode;
  parentDir?: string;
}

export const EpisodeNavigator: React.FC<EpisodeNavigatorProps> = ({
  activePath,
  documentType,
  paneId,
  viewMode,
  parentDir,
}) => {
  const { openDocument, closeTab } = useDocument();
  const [prevEpisode, setPrevEpisode] = useState<DirEntry | null>(null);
  const [nextEpisode, setNextEpisode] = useState<DirEntry | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (documentType !== 'novel') {
      setPrevEpisode(null);
      setNextEpisode(null);
      return;
    }

    const loadEpisodes = async () => {
      const targetParentDir = parentDir || (activePath ? fileService.dirname(activePath) : '');
      if (!targetParentDir) {
        if (isMounted) {
          setPrevEpisode(null);
          setNextEpisode(null);
        }
        return;
      }

      try {
        const entries = await fileService.readDirectory(targetParentDir, false);
        if (!isMounted) return;

        // novel 形式のファイルのみを抽出し、自然順序（数値昇順）でソート
        const novelEntries = entries
          .filter((entry) => !entry.isDirectory && entry.documentType === 'novel')
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          );

        const currentNorm = fileService.normalizePath(activePath);
        const currentIndex = novelEntries.findIndex(
          (entry) => fileService.normalizePath(entry.path) === currentNorm
        );

        if (currentIndex === -1) {
          setPrevEpisode(null);
          setNextEpisode(null);
          return;
        }

        const prev = currentIndex > 0 ? novelEntries[currentIndex - 1] : null;
        const next =
          currentIndex < novelEntries.length - 1 ? novelEntries[currentIndex + 1] : null;

        setPrevEpisode(prev);
        setNextEpisode(next);
      } catch (err) {
        console.warn('エピソード一覧の取得に失敗しました:', err);
        if (isMounted) {
          setPrevEpisode(null);
          setNextEpisode(null);
        }
      }
    };

    loadEpisodes();

    return () => {
      isMounted = false;
    };
  }, [activePath, documentType, parentDir]);

  const handleNavigate = useCallback(
    async (targetPath: string) => {
      if (fileService.normalizePath(targetPath) === fileService.normalizePath(activePath)) {
        return;
      }

      try {
        // タブ数を増やさずに移動するため、現在のタブを閉じてから新ドキュメントを開く
        await closeTab(activePath, paneId);
        await openDocument(targetPath, { paneId, viewMode });
      } catch (err) {
        console.error('エピソード移動に失敗しました:', err);
      }
    },
    [activePath, paneId, viewMode, closeTab, openDocument]
  );

  // novel 形式でない場合、または前後のエピソードがいずれも存在しない場合はフッターを表示しない
  if (documentType !== 'novel' || (!prevEpisode && !nextEpisode)) {
    return null;
  }

  return (
    <footer className="episode-navigator" aria-label="エピソードナビゲーション">
      {prevEpisode ? (
        <button
          type="button"
          className="episode-nav-button episode-nav-prev"
          onClick={() => handleNavigate(prevEpisode.path)}
          title={`前のエピソード: ${prevEpisode.fileTitle || prevEpisode.name}`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="episode-nav-label">前の話</span>
          <span className="episode-nav-title">
            {prevEpisode.fileTitle || prevEpisode.name}
          </span>
        </button>
      ) : (
        <div />
      )}

      {nextEpisode ? (
        <button
          type="button"
          className="episode-nav-button episode-nav-next"
          onClick={() => handleNavigate(nextEpisode.path)}
          title={`次のエピソード: ${nextEpisode.fileTitle || nextEpisode.name}`}
        >
          <span className="episode-nav-title">
            {nextEpisode.fileTitle || nextEpisode.name}
          </span>
          <span className="episode-nav-label">次の話</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ) : (
        <div />
      )}
    </footer>
  );
};
