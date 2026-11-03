import React, { useState } from 'react';
import { Bot, Save, FileText, Check, Cpu } from 'lucide-react';
import { PersonaDefinition } from './ChatTypes';
import './ChatHeader.css';

interface ChatHeaderProps {
  title: string;
  onTitleChange?: (newTitle: string) => void;
  selectedPersonaId: string;
  onPersonaChange: (personaId: string) => void;
  personas: PersonaDefinition[];
  selectedModelKey?: string;
  onModelChange?: (modelKey: string) => void;
  scopedModels?: string[];
  onExportToFile?: () => void;
  isExporting?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  onTitleChange,
  selectedPersonaId,
  onPersonaChange,
  personas,
  selectedModelKey = 'gemini:gemini-2.5-flash',
  onModelChange,
  scopedModels = [],
  onExportToFile,
  isExporting,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (tempTitle.trim() && tempTitle !== title && onTitleChange) {
      onTitleChange(tempTitle.trim());
    } else {
      setTempTitle(title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
      setTempTitle(title);
    }
  };

  // Scoped Models をプロバイダー別に分類
  const effectiveModels = scopedModels.length > 0 ? scopedModels : [
    'gemini:gemini-2.5-flash',
    'gemini:gemini-2.5-pro',
    'lm-studio:qwen2.5-7b-instruct',
  ];

  const geminiList = effectiveModels.filter((m) => m.startsWith('gemini:'));
  const lmStudioList = effectiveModels.filter((m) => m.startsWith('lm-studio:'));
  const otherList = effectiveModels.filter((m) => !m.startsWith('gemini:') && !m.startsWith('lm-studio:'));

  const formatModelLabel = (key: string): string => {
    const parts = key.split(':');
    return parts.length > 1 ? parts[1] : key;
  };

  return (
    <div className="chat-header-bar">
      <div className="chat-header-left">
        <div className="chat-persona-chips">
          {personas.map((p) => {
            const isSelected = p.id === selectedPersonaId;
            return (
              <button
                key={p.id}
                type="button"
                className={`chat-persona-chip ${isSelected ? 'active' : ''}`}
                onClick={() => onPersonaChange(p.id)}
                title={`${p.name} (${p.role})\n${p.description}`}
              >
                <Bot size={13} className="chip-icon" />
                <span className="chip-label">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="chat-header-center">
        {isEditingTitle && onTitleChange ? (
          <input
            type="text"
            className="chat-title-input"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <span
            className={`chat-title-display ${onTitleChange ? 'clickable' : ''}`}
            onClick={() => onTitleChange && setIsEditingTitle(true)}
            title={onTitleChange ? 'クリックしてタイトルを変更' : title}
          >
            <FileText size={13} className="chat-title-icon" />
            <span className="title-text">{title || '無題のチャット'}</span>
          </span>
        )}
      </div>

      <div className="chat-header-right">
        {onModelChange && (
          <div className="chat-header-model-wrapper" title="使用するAIモデル（プロバイダー別）">
            <Cpu size={13} className="chat-model-icon" />
            <select
              className="chat-header-model-select"
              value={selectedModelKey}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {geminiList.length > 0 && (
                <optgroup label="Google Gemini">
                  {geminiList.map((m) => (
                    <option key={m} value={m}>
                      {formatModelLabel(m)}
                    </option>
                  ))}
                </optgroup>
              )}
              {lmStudioList.length > 0 && (
                <optgroup label="LM Studio (ローカル)">
                  {lmStudioList.map((m) => (
                    <option key={m} value={m}>
                      {formatModelLabel(m)}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherList.length > 0 && (
                <optgroup label="その他">
                  {otherList.map((m) => (
                    <option key={m} value={m}>
                      {formatModelLabel(m)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {onExportToFile && (
          <button
            type="button"
            className="chat-header-export-btn"
            onClick={onExportToFile}
            disabled={isExporting}
            title="このチャットを作品フォルダ内にファイルとして保存"
          >
            {isExporting ? <Check size={13} /> : <Save size={13} />}
            <span>ファイルとして保存</span>
          </button>
        )}
      </div>
    </div>
  );
};
