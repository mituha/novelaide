import React, { useState, useCallback, useMemo } from 'react';
import { PanelProps } from '../../types/panelPlugin';
import { SearchMatch, SearchQuery } from '../../types/searchPlugin';
import { searchRegistry } from '../../core/searchRegistry';
import { useProject } from '../../contexts/ProjectContext';
import { useDocument } from '../../contexts/DocumentContext';
import { Search, FileText } from 'lucide-react';
import './SearchPanel.css';

export const SearchPanel: React.FC<PanelProps> = () => {
  const { projectPath } = useProject();
  const { openDocument } = useDocument();

  const providers = searchRegistry.getAllProviders();
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    providers[0]?.id || 'novelaid.search.fulltext'
  );

  const [searchText, setSearchText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // ファイル別にグループ化した結果
  const groupedResults = useMemo(() => {
    const groups: Record<string, { fileTitle: string; matches: SearchMatch[] }> = {};
    for (const match of results) {
      if (!groups[match.filePath]) {
        groups[match.filePath] = {
          fileTitle: match.fileTitle,
          matches: [],
        };
      }
      groups[match.filePath].matches.push(match);
    }
    return groups;
  }, [results]);

  // 検索実行
  const handleSearch = useCallback(async () => {
    if (!searchText.trim() || !projectPath) return;

    setIsSearching(true);
    setHasSearched(true);

    const provider = searchRegistry.findProvider(selectedProviderId);
    if (!provider) {
      setIsSearching(false);
      return;
    }

    const query: SearchQuery = {
      text: searchText,
      caseSensitive,
      wholeWord,
      useRegex,
    };

    try {
      const matches = await provider.search(query, projectPath);
      setResults(matches);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchText, selectedProviderId, caseSensitive, wholeWord, useRegex, projectPath]);

  // 該当箇所クリックでドキュメントを開き、マッチ行へジャンプ＆フォーカス
  const handleMatchClick = async (match: SearchMatch) => {
    const jumpDetail = {
      path: match.filePath,
      line: match.lineNumber,
      column: match.column,
      endLine: match.lineNumber,
      endColumn: match.column + (match.matchLength || 0),
    };

    // 1. 未マウント時用の保留ジャンプ情報をセット
    (window as any).__novelaid_pending_jump = jumpDetail;

    // 2. ドキュメントを開く (アクティブ化)
    await openDocument(match.filePath);

    // 3. 既にマウント済みのエディター向けにイベント発行
    window.dispatchEvent(
      new CustomEvent('editor-jump-to', {
        detail: jumpDetail,
      })
    );

    // 4. タブ切り替え・DOM更新直後のフォールバック通知
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('editor-jump-to', {
          detail: jumpDetail,
        })
      );
    }, 100);
  };

  // ファイルヘッダーのクリックハンドラ（最初のマッチ項目へジャンプ）
  const handleGroupHeaderClick = (filePath: string, firstMatch?: SearchMatch) => {
    if (firstMatch) {
      handleMatchClick(firstMatch);
    } else {
      openDocument(filePath);
    }
  };

  const fileCount = Object.keys(groupedResults).length;
  const matchCount = results.length;

  return (
    <div className="search-panel-container">
      {/* 検索入力フォーム */}
      <div className="search-form-area">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder="作品内を検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />

          <div className="search-options-group">
            <button
              type="button"
              className={`search-opt-btn ${caseSensitive ? 'active' : ''}`}
              onClick={() => setCaseSensitive((prev) => !prev)}
              title="大文字・小文字を区別 (Match Case)"
            >
              Aa
            </button>
            <button
              type="button"
              className={`search-opt-btn ${wholeWord ? 'active' : ''}`}
              onClick={() => setWholeWord((prev) => !prev)}
              title="単語単位で検索 (Match Whole Word)"
            >
              Ab
            </button>
            <button
              type="button"
              className={`search-opt-btn ${useRegex ? 'active' : ''}`}
              onClick={() => setUseRegex((prev) => !prev)}
              title="正規表現を使用 (Use Regular Expression)"
            >
              .*
            </button>
          </div>
        </div>

        {/* 検索プロバイダー選択 */}
        <div className="search-provider-bar">
          <select
            className="search-provider-select"
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            title="検索対象プロバイダーを選択"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="search-submit-btn"
            onClick={handleSearch}
            disabled={isSearching}
          >
            {isSearching ? '検索中...' : '検索'}
          </button>
        </div>
      </div>

      {/* 結果サマリー */}
      {hasSearched && (
        <div className="search-summary-bar">
          {matchCount > 0 ? (
            <span>
              {fileCount} 個のファイルで {matchCount} 件の一致
            </span>
          ) : (
            <span>一致する結果は見つかりませんでした</span>
          )}
        </div>
      )}

      {/* 検索結果リスト */}
      <div className="search-results-list">
        {matchCount === 0 && !hasSearched && (
          <div className="search-empty-state">
            <Search size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p>キーワードを入力して Enter または「検索」を押してください</p>
          </div>
        )}

        {Object.entries(groupedResults).map(([filePath, group]) => (
          <div key={filePath} className="search-file-group">
            <div
              className="search-file-header"
              onClick={() => handleGroupHeaderClick(filePath, group.matches[0])}
            >
              <FileText size={13} style={{ opacity: 0.7 }} />
              <span>{group.fileTitle}</span>
              <span className="search-file-match-badge">{group.matches.length}</span>
            </div>

            <div className="search-file-matches">
              {group.matches.map((m, idx) => (
                <div
                  key={idx}
                  className="search-match-item"
                  onClick={() => handleMatchClick(m)}
                  title={`行 ${m.lineNumber}: ${m.previewLine}`}
                >
                  <span className="search-match-line-num">{m.lineNumber}:</span>
                  <span className="search-match-preview">{m.previewLine}</span>
                  {m.extraInfo && (
                    <span className="search-match-extra">{m.extraInfo}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
