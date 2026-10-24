import { StatusBarItemPlugin } from '../../types/statusBarPlugin';

/**
 * ステータスバーアイテムレジストリ
 * ステータスバーの左右に配置されるプラグインアイテムを管理する
 */
export class StatusBarRegistry {
  private plugins: Map<string, StatusBarItemPlugin> = new Map();

  /**
   * アイテムを登録
   */
  register(plugin: StatusBarItemPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * アイテムの登録を解除
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  /**
   * 指定アライメント（'left' | 'right'）の全アイテムを取得 (priority順)
   */
  getItems(alignment: 'left' | 'right'): StatusBarItemPlugin[] {
    return Array.from(this.plugins.values())
      .filter((p) => p.alignment === alignment)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * 登録されている全アイテムを取得
   */
  getAllItems(): StatusBarItemPlugin[] {
    return Array.from(this.plugins.values());
  }
}
