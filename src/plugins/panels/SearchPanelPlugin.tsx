import { PanelPlugin } from '../../types/panelPlugin';
import { Search } from 'lucide-react';
import { SearchPanel } from '../../components/Search/SearchPanel';

export const SearchPanelPlugin: PanelPlugin = {
  id: 'novelaid.panel.search',
  title: '作品内検索',
  icon: Search,
  defaultPlacement: 'left',
  allowedPlacements: ['left', 'right'],
  scope: 'project',
  priority: 90,
  component: SearchPanel,
};
