import React, { useState } from 'react';
import { Bot, Save, FileText, Check } from 'lucide-react';
import { PersonaDefinition } from './ChatTypes';
import './ChatHeader.css';

interface ChatHeaderProps {
  title: string;
  onTitleChange?: (newTitle: string) => void;
  selectedPersonaId: string;
  onPersonaChange: (personaId: string) => void;
  personas: PersonaDefinition[];
  onExportToFile?: () => void;
  isExporting?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  onTitleChange,
  selectedPersonaId,
  onPersonaChange,
  personas,
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
