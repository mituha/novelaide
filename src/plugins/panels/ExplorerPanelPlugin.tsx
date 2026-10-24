import { PanelPlugin } from '../../types/panelPlugin';
import { Files } from 'lucide-react';
import { ExplorerPanel } from '../../components/Explorer/ExplorerPanel';

export const ExplorerPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.files',
  title: 'エクスプローラー',
  icon: Files,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 100,
  component: ExplorerPanel,
};
