import { PanelRegistry } from './PanelRegistry';
import { ExplorerPanelPlugin } from '../../plugins/panels/ExplorerPanelPlugin';
import { SearchPanelPlugin } from '../../plugins/panels/SearchPanelPlugin';
import { GitPanelPlugin } from '../../plugins/panels/GitPanelPlugin';
import { OutlinePanelPlugin } from '../../plugins/panels/OutlinePanelPlugin';

export const panelRegistry = new PanelRegistry();

// 組み込みパネルの登録
panelRegistry.register(ExplorerPanelPlugin);
panelRegistry.register(SearchPanelPlugin);
panelRegistry.register(GitPanelPlugin);
panelRegistry.register(OutlinePanelPlugin);

export { PanelRegistry };
