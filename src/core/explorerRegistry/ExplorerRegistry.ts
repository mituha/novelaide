import { ExplorerSectionPlugin } from '../../types/explorerPlugin';

/**
 * エクスプローラーセクションレジストリ
 * 汎用ExplorerPanel内の各折りたたみセクションを管理する
 */
export class ExplorerRegistry {
  private sections: Map<string, ExplorerSectionPlugin> = new Map();

  /**
   * セクションを登録
   */
  register(section: ExplorerSectionPlugin): void {
    this.sections.set(section.id, section);
  }

  /**
   * セクションの登録を解除
   */
  unregister(sectionId: string): void {
    this.sections.delete(sectionId);
  }

  /**
   * 登録されている全セクションを取得 (priority 降順ソート済み)
   */
  getAllSections(): ExplorerSectionPlugin[] {
    return Array.from(this.sections.values()).sort(
      (a, b) => b.priority - a.priority
    );
  }

  /**
   * 指定したIDのセクションを取得
   */
  findSection(sectionId: string): ExplorerSectionPlugin | undefined {
    return this.sections.get(sectionId);
  }
}
