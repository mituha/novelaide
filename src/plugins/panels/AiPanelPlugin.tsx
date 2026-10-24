import { PanelPlugin } from '../../types/panelPlugin';
import { Sparkles } from 'lucide-react';
import { ChatPanel } from '../../components/AI/ChatPanel';

export const AiPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.ai',
  title: 'AI執筆パートナー',
  icon: Sparkles,
  defaultPlacement: 'right',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 70,
  component: ChatPanel,
};
