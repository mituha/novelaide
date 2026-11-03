import React from 'react';
import { NovelaidMarkdown } from 'novelaid-markdown';
import './MessageMarkdown.css';

interface MessageMarkdownProps {
  content: string;
  className?: string;
}

export const MessageMarkdown: React.FC<MessageMarkdownProps> = ({ content, className = '' }) => {
  return (
    <div className={`message-markdown-wrapper ${className}`}>
      <NovelaidMarkdown
        content={content}
        className="message-markdown-body"
      />
    </div>
  );
};
