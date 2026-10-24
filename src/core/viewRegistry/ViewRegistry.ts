import { DocumentViewPlugin } from '../../types/viewPlugin';
import { NovelaidDocumentType, DocumentViewMode } from '../../types/document';

/**
 * ビュープラグインレジストリ
 * 各ドキュメント種別およびビューモードに対応するプラグインの登録・検索を管理する
 */
export class ViewRegistry {
  private plugins: Map<string, DocumentViewPlugin> = new Map();

  /**
   * プラグインを登録
   */
  register(plugin: DocumentViewPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * プラグインの登録を解除
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  /**
   * ドキュメント種別とビューモードから最適なプラグインを検索
   */
  findPlugin(
    documentType: NovelaidDocumentType,
    viewMode: DocumentViewMode
  ): DocumentViewPlugin | undefined {
    const candidates = Array.from(this.plugins.values()).filter(
      (p) => p.viewMode === viewMode && p.supportedDocumentTypes.includes(documentType)
    );

    if (candidates.length === 0) return undefined;

    return candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  }

  /**
   * 特定のドキュメント種別がサポートしている全ビューモードを取得
   */
  getSupportedViewModes(documentType: NovelaidDocumentType): DocumentViewMode[] {
    const modes = new Set<DocumentViewMode>();
    for (const plugin of this.plugins.values()) {
      if (plugin.supportedDocumentTypes.includes(documentType)) {
        modes.add(plugin.viewMode);
      }
    }
    return Array.from(modes);
  }

  /**
   * 特定のドキュメント種別で特定のビューモードがサポートされているか判定
   */
  isViewModeSupported(documentType: NovelaidDocumentType, viewMode: DocumentViewMode): boolean {
    return this.getSupportedViewModes(documentType).includes(viewMode);
  }

  /**
   * 登録されている全プラグインを取得
   */
  getAllPlugins(): DocumentViewPlugin[] {
    return Array.from(this.plugins.values());
  }
}
