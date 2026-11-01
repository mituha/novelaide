import React, { useState, useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import './FileNameHeader.css';

interface FileNameHeaderProps {
  fileTitle: string;
  activePath: string | null;
  onRename: (newTitle: string) => void | Promise<any>;
  isReadOnly?: boolean;
}

export const FileNameHeader: React.FC<FileNameHeaderProps> = ({
  fileTitle,
  activePath: _activePath,
  onRename,
  isReadOnly = false,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editValue, setEditValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = () => {
    if (isReadOnly || isEditing) return;
    setEditValue(fileTitle);
    setIsEditing(true);
  };

  const handleCommit = () => {
    if (!isEditing) return;
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== fileTitle) {
      onRename(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="file-name-header editing">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="file-name-input"
          aria-label="ファイルタイトル編集"
        />
      </div>
    );
  }

  return (
    <div
      className={`file-name-header ${isReadOnly ? 'readonly' : ''}`}
      onClick={handleStartEditing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartEditing();
        }
      }}
      title={isReadOnly ? '読み取り専用' : 'クリックしてファイル名を変更'}
      role={isReadOnly ? undefined : 'button'}
      tabIndex={isReadOnly ? undefined : 0}
    >
      <div className="file-name-header-left">
        <span className="file-name-text">{fileTitle}</span>
        {!isReadOnly && <Pencil size={13} className="file-name-edit-icon" />}
      </div>
    </div>
  );
};
