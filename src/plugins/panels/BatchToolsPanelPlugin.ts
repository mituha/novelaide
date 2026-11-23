import { PanelPlugin } from '../../types/panelPlugin';
import { Wrench } from 'lucide-react';
import { BatchToolsPanel } from '../../components/Tools/BatchToolsPanel';

export const BatchToolsPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.batch',
  title: 'バッチツール',
  icon: Wrench,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 65,
  component: BatchToolsPanel,
};
