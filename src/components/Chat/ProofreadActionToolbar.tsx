import React from 'react';
import { SpellCheck, Feather, Sparkles, MessageSquareQuote } from 'lucide-react';
import './ProofreadActionToolbar.css';

interface ProofreadActionToolbarProps {
  onTriggerAction: (prompt: string) => void;
  disabled?: boolean;
  allowWrite?: boolean;
}

export const ProofreadActionToolbar: React.FC<ProofreadActionToolbarProps> = ({
  onTriggerAction,
  disabled = false,
  allowWrite = false,
}) => {
  const actions = [
    {
      id: 'proofread',
      label: '誤字・文末重複チェック',
      icon: SpellCheck,
      tooltip: '文末の過去形連続（〜た。）や誤字脱字、表記揺れをチェックします',
      prompt: allowWrite
        ? '原稿の誤字脱字、表記揺れ、および文末の「〜た。」「〜だ。」の連続（3回以上）をチェックし、問題があれば edit ツールで修正を適用してください。'
        : '原稿の誤字脱字、表記揺れ、および文末の「〜た。」「〜だ。」の連続（3回以上）をチェックし、修正箇所の候補と理由を具体的に提示してください。',
    },
    {
      id: 'ruby',
      label: 'ルビ提案・抽出',
      icon: Feather,
      tooltip: '難読漢字や固有名詞を抽出し、|親文字《ルビ》記法を提案します',
      prompt: '原稿内の難読漢字、作中独自の固有名詞、または当て字を抽出し、小説用のルビ記法（|親文字《ルビ》）の候補を一覧で提案してください。',
    },
    {
      id: 'polish',
      label: '表現の推敲・情景描写',
      icon: Sparkles,
      tooltip: '五感を使った情景描写やキャラクターの心情表現のブラッシュアップ案を提示します',
      prompt: '現在の原稿の情景描写や登場人物の心理描写をより豊かにするための推敲案を3パターン（叙情的一文、簡潔でキレのある描写、五感に訴える表現）提案してください。',
    },
    {
      id: 'editor_review',
      label: '担当編集者の講評',
      icon: MessageSquareQuote,
      tooltip: '読者・編集者の視点から、物語のテンポ・引き・構成へのフィードバックを行います',
      prompt: '担当編集者の視点から、このエピソードのテンポ感、読者を引き込むフック、キャラクターの魅力について、率直で建設的なフィードバックを述べてください。',
    },
  ];

  return (
    <div className="proofread-action-toolbar">
      <span className="toolbar-title">執筆クイック支援:</span>
      <div className="action-buttons-list">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              className="action-pill-btn"
              disabled={disabled}
              onClick={() => onTriggerAction(act.prompt)}
              title={act.tooltip}
            >
              <Icon size={12} className="pill-icon" />
              <span>{act.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
