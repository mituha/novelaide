import { PanelPlugin } from '../../types/panelPlugin';
import { GitBranch } from 'lucide-react';
import { GitPanel } from '../../components/Git/GitPanel';

export const GitPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.git',
  title: 'ソース管理 (Git)',
  icon: GitBranch,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 80,
  component: GitPanel,
};
