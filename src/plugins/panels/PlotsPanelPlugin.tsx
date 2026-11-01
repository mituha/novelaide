import { PanelPlugin } from '../../types/panelPlugin';
import { ScrollText } from 'lucide-react';
import { PlotsPanel } from '../../components/Metadata/PlotsPanel';

export const PlotsPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.plots',
  title: 'プロット・構成',
  icon: ScrollText,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 67,
  component: PlotsPanel,
};
