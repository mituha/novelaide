import { PanelPlugin } from '../../types/panelPlugin';

/**
 * パネルプラグインレジストリ
 * 左右ペインに配置可能な各種機能パネルを管理する
 */
export class PanelRegistry {
  private plugins: Map<string, PanelPlugin> = new Map();
  private placements: Map<string, 'left' | 'right'> = new Map();

  /**
   * パネルを登録
   */
  register(plugin: PanelPlugin): void {
    this.plugins.set(plugin.id, plugin);
    if (!this.placements.has(plugin.id)) {
      this.placements.set(plugin.id, plugin.defaultPlacement);
    }
  }

  /**
   * パネルの登録を解除
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.placements.delete(pluginId);
  }

  /**
   * パネルの配置サイドを変更
   */
  setPlacement(pluginId: string, side: 'left' | 'right'): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin && (!plugin.allowedPlacements || plugin.allowedPlacements.includes(side))) {
      this.placements.set(pluginId, side);
    }
  }

  /**
   * パネルの現在の配置サイドを取得
   */
  getPlacement(pluginId: string): 'left' | 'right' {
    return this.placements.get(pluginId) || this.plugins.get(pluginId)?.defaultPlacement || 'left';
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
        const placement = this.placements.get(p.id) || p.defaultPlacement;
        return placement === side;
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
