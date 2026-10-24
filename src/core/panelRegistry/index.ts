import { PanelRegistry } from './PanelRegistry';
import { ExplorerPanelPlugin } from '../../plugins/panels/ExplorerPanelPlugin';
import { OutlinePanelPlugin } from '../../plugins/panels/OutlinePanelPlugin';

export const panelRegistry = new PanelRegistry();

// 組み込みパネルの登録
panelRegistry.register(ExplorerPanelPlugin);
panelRegistry.register(OutlinePanelPlugin);

export { PanelRegistry };
