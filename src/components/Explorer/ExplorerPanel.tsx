import React, { useState } from 'react';
import { explorerRegistry } from '../../core/explorerRegistry';
import { PanelProps } from '../../types/panelPlugin';
import { useProject } from '../../contexts/ProjectContext';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './ExplorerPanel.css';

export const ExplorerPanel: React.FC<PanelProps> = ({ activeDocument }) => {
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

  const toggleSection = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="explorer-panel-container">
      {sections.map((section) => {
        const isExpanded = expandedMap[section.id] ?? true;
        const Component = section.component;
        const HeaderActions = section.headerActions;
        const badgeValue = section.badge ? section.badge() : null;

        return (
          <div key={section.id} className="explorer-section-wrapper">
            <div
              className="explorer-section-header"
              onClick={() => toggleSection(section.id)}
            >
              <div className="explorer-section-title-group">
                <span className="explorer-section-chevron">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <span className="explorer-section-title">{section.title}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {badgeValue !== null && (
                  <span className="explorer-section-badge">{badgeValue}</span>
                )}
                {HeaderActions && <HeaderActions sectionId={section.id} />}
              </div>
            </div>

            <div
              className={`explorer-section-body ${
                isExpanded ? 'expanded' : 'collapsed'
              }`}
            >
              <Component
                activeDocument={activeDocument}
                projectPath={projectPath}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
