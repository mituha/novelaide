import React from 'react';
import { ExplorerSectionProps } from '../../../types/explorerPlugin';
import { DocumentOutline } from '../../Outline/DocumentOutline';

export const OutlineSection: React.FC<ExplorerSectionProps> = ({ activeDocument }) => {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <DocumentOutline paneSide="left" activeDocument={activeDocument} />
    </div>
  );
};
