import React from 'react';
import './ConflictPanel.css';

interface TokenProps {
  id: string;
  text: string;
  state: 'ACCEPTED' | 'REJECTED' | 'CONFLICTED';
  onClick?: () => void;
}

export const Token: React.FC<TokenProps> = ({ id, text, state, onClick }) => {
  const getTokenClass = () => {
    switch (state) {
      case 'ACCEPTED':
        return 'token-accepted';
      case 'REJECTED':
        return 'token-rejected';
      case 'CONFLICTED':
        return 'token-conflicted';
      default:
        return '';
    }
  };

  const getStateDescription = () => {
    switch (state) {
      case 'ACCEPTED':
        return 'accepted text';
      case 'REJECTED':
        return 'rejected text';
      case 'CONFLICTED':
        return 'conflicted text';
      default:
        return '';
    }
  };

  return (
    <span
      id={`token-${id}`}
      className={`token ${getTokenClass()}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${text} (${getStateDescription()})`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
    >
      {text}
    </span>
  );
};