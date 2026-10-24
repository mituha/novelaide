import { SearchProviderPlugin } from '../../types/searchPlugin';

/**
 * 検索プロバイダーレジストリ
 * 汎用SearchPanelで利用可能な検索プロバイダー群を管理する
 */
export class SearchRegistry {
  private providers: Map<string, SearchProviderPlugin> = new Map();

  /**
   * プロバイダーを登録
   */
  register(provider: SearchProviderPlugin): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * プロバイダーの登録を解除
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * 登録されている全プロバイダーを取得 (priority 降順ソート済み)
   */
  getAllProviders(): SearchProviderPlugin[] {
    return Array.from(this.providers.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * 指定したIDのプロバイダーを取得
   */
  findProvider(providerId: string): SearchProviderPlugin | undefined {
    return this.providers.get(providerId);
  }
}
