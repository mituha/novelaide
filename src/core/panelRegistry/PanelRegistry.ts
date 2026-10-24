import { PanelPlugin } from '../../types/panelPlugin';

/**
 * パネルプラグインレジストリ
 * 左右ペインに配置可能な各種機能パネルを管理する
 */
export class PanelRegistry {
  private plugins: Map<string, PanelPlugin> = new Map();

  /**
   * パネルを登録
   */
  register(plugin: PanelPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * パネルの登録を解除
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  /**
   * パネルを取得
   */
  findPanel(pluginId: string): PanelPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * 指定したペイン（'left' | 'right'）に属する全パネルを取得 (priority順)
   */
  getPanelsForSide(side: 'left' | 'right'): PanelPlugin[] {
    return Array.from(this.plugins.values())
      .filter((p) => {
        if (p.allowedPlacements) {
          return p.allowedPlacements.includes(side);
        }
        return p.defaultPlacement === side;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * 登録されている全パネルを取得
   */
  getAllPanels(): PanelPlugin[] {
    return Array.from(this.plugins.values());
  }
}
