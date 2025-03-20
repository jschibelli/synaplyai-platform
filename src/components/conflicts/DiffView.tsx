import React from 'react';
import { diffWords } from 'diff';
import { Token } from './Token';
import './ConflictPanel.css';

interface DiffViewProps {
  original: string;
  suggested: string;
  tokenStates: Record<string, string>;
  onTokenClick?: (tokenId: string) => void;
}

export const DiffView: React.FC<DiffViewProps> = ({ 
  original, 
  suggested, 
  tokenStates,
  onTokenClick
}) => {
  // Generate diff between original and suggested text
  const differences = diffWords(original, suggested);
  
  return (
    <div className="diff-view">
      <div className="diff-original">
        <div className="diff-header">Original:</div>
        <div className="diff-content">
          {differences.map((part, index) => {
            if (!part.added) {
              const tokenId = `orig-${index}`;
              const tokenState = tokenStates[tokenId] || (part.removed ? 'REJECTED' : 'ACCEPTED');
              
              return (
                <Token
                  key={tokenId}
                  id={tokenId}
                  text={part.value}
                  state={tokenState as any}
                  onClick={() => onTokenClick?.(tokenId)}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
      
      <div className="diff-suggested">
        <div className="diff-header">Suggested:</div>
        <div className="diff-content">
          {differences.map((part, index) => {
            if (!part.removed) {
              const tokenId = `sugg-${index}`;
              const tokenState = tokenStates[tokenId] || (part.added ? 'CONFLICTED' : 'ACCEPTED');
              
              return (
                <Token
                  key={tokenId}
                  id={tokenId}
                  text={part.value}
                  state={tokenState as any}
                  onClick={() => onTokenClick?.(tokenId)}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
