import React, { useState, useRef, useCallback } from 'react';
import { explorerRegistry } from '../../core/explorerRegistry';
import { PanelProps } from '../../types/panelPlugin';
import { useProject } from '../../contexts/ProjectContext';
import { FileExplorerProvider } from '../../contexts/FileExplorerContext';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './ExplorerPanel.css';

interface ResizeState {
  sectionAboveId: string;
  sectionBelowId: string;
  initialHeightAbove: number;
  initialHeightBelow: number;
  totalWeight: number;
  startY: number;
}

const ExplorerPanelContent: React.FC<PanelProps> = ({ activeDocument }) => {
  const { projectPath } = useProject();
  const sections = explorerRegistry.getAllSections();

  // 各セクションの開閉状態
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((sec) => {
      initial[sec.id] = sec.defaultExpanded ?? true;
    });
    return initial;
  });

  // 各セクションの高さウェイト (複数展開時のflex-grow比率)
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    sections.forEach((sec) => {
      initial[sec.id] = 1;
    });
    return initial;
  });

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const resizeStateRef = useRef<ResizeState | null>(null);

  const toggleSection = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // ドラッグリサイズ処理
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, sectionAboveId: string, sectionBelowId: string) => {
      e.preventDefault();
      const elAbove = sectionRefs.current[sectionAboveId];
      const elBelow = sectionRefs.current[sectionBelowId];
      if (!elAbove || !elBelow) return;

      const rectAbove = elAbove.getBoundingClientRect();
      const rectBelow = elBelow.getBoundingClientRect();

      const wAbove = weights[sectionAboveId] ?? 1;
      const wBelow = weights[sectionBelowId] ?? 1;
      const totalWeight = wAbove + wBelow;

      resizeStateRef.current = {
        sectionAboveId,
        sectionBelowId,
        initialHeightAbove: rectAbove.height,
        initialHeightBelow: rectBelow.height,
        totalWeight,
        startY: e.clientY,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeStateRef.current) return;
        const {
          sectionAboveId: aboveId,
          sectionBelowId: belowId,
          initialHeightAbove,
          initialHeightBelow,
          totalWeight: totalW,
          startY,
        } = resizeStateRef.current;

        const deltaY = moveEvent.clientY - startY;
        const totalH = initialHeightAbove + initialHeightBelow;
        const minHeight = 48; // セクションの最小高さ (ヘッダー+中身少し)

        // 上下の新しい高さを minHeight 以上の範囲で制限
        const clampedHeightAbove = Math.max(minHeight, Math.min(totalH - minHeight, initialHeightAbove + deltaY));
        const clampedHeightBelow = totalH - clampedHeightAbove;

        const ratioAbove = clampedHeightAbove / totalH;
        const ratioBelow = clampedHeightBelow / totalH;

        setWeights((prev) => ({
          ...prev,
          [aboveId]: ratioAbove * totalW,
          [belowId]: ratioBelow * totalW,
        }));
      };

      const handleMouseUp = () => {
        resizeStateRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.classList.remove('explorer-resizing');
      };

      document.body.classList.add('explorer-resizing');
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [weights]
  );

  // 展開中のセクションID一覧
  const expandedSectionIds = sections.filter((s) => expandedMap[s.id] ?? true).map((s) => s.id);

  return (
    <div className="explorer-panel-container">
      {sections.map((section, index) => {
        const isExpanded = expandedMap[section.id] ?? true;
        const Component = section.component;
        const HeaderActions = section.headerActions;
        const IconComponent = section.icon;
        const badgeValue = section.badge ? section.badge() : null;

        const resolvedTitle =
          typeof section.title === 'function'
            ? section.title({ projectPath })
            : section.title;

        // このセクション以降に展開されているセクションが存在するか
        const remainingExpandedSections = expandedSectionIds.filter(
          (id) => sections.findIndex((s) => s.id === id) > index
        );
        const canResizeBelow = isExpanded && remainingExpandedSections.length > 0;
        const nextExpandedSectionId = remainingExpandedSections[0];

        const sectionWeight = weights[section.id] ?? 1;

        return (
          <React.Fragment key={section.id}>
            <div
              ref={(el) => {
                sectionRefs.current[section.id] = el;
              }}
              className={`explorer-section-wrapper ${isExpanded ? 'expanded' : 'collapsed'}`}
              style={isExpanded ? { flex: `${sectionWeight} 1 0px` } : undefined}
            >
              <div
                className="explorer-section-header"
                onClick={() => toggleSection(section.id)}
              >
                <div className="explorer-section-title-group">
                  <span className="explorer-section-chevron">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  {IconComponent && (
                    <span className="explorer-section-icon">
                      <IconComponent size={14} />
                    </span>
                  )}
                  <span className="explorer-section-title">{resolvedTitle}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {badgeValue !== null && (
                    <span className="explorer-section-badge">{badgeValue}</span>
                  )}
                  {HeaderActions && (
                    <HeaderActions sectionId={section.id} projectPath={projectPath} />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="explorer-section-body expanded">
                  <Component
                    activeDocument={activeDocument}
                    projectPath={projectPath}
                  />
                </div>
              )}
            </div>

            {canResizeBelow && (
              <div
                className="explorer-section-resizer"
                onMouseDown={(e) => handleResizeStart(e, section.id, nextExpandedSectionId)}
                title="セクションの高さを変更"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const ExplorerPanel: React.FC<PanelProps> = (props) => {
  return (
    <FileExplorerProvider>
      <ExplorerPanelContent {...props} />
    </FileExplorerProvider>
  );
};
