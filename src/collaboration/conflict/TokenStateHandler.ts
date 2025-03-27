import { ConflictType } from './ConflictDetector';
import { MetricsCollector } from '../../metrics/metrics-collector';

/**
 * Token state types for conflict visualization and resolution
 */
export type TokenState = 'unchanged' | 'added' | 'removed' | 'conflict' | 'accepted' | 'rejected';

/**
 * Represents a text token with state information for conflict visualization
 */
export interface Token {
  id: string;
  text: string;
  state: TokenState;
  metadata?: {
    confidence?: number;
    suggestions?: string[];
    aiGenerated?: boolean;
  };
}

/**
 * Manages token-level state for conflict visualization and resolution
 */
export class TokenStateHandler {
  constructor(
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Tokenizes text with state information for conflict visualization
   */
  tokenizeWithState(
    originalText: string,
    conflictingText: string,
    conflictType: ConflictType
  ): Token[] {
    const startTime = performance.now();
    
    try {
      // Simple word-level tokenization
      const originalTokens = originalText.split(/(\s+)/).filter(t => t.length > 0);
      const conflictTokens = conflictingText.split(/(\s+)/).filter(t => t.length > 0);
      
      // Use diff algorithm to determine token states
      const diff = this.computeDiff(originalTokens, conflictTokens);
      
      // Convert diff to tokens with state
      const tokens: Token[] = diff.map((item, index) => ({
        id: `token-${index}`,
        text: item.value,
        state: this.mapDiffOperationToState(item.operation, conflictType),
        metadata: {}
      }));
      
      // Track metrics
      this.metricsCollector.increment('token.state.processed', tokens.length);
      
      return tokens;
    } finally {
      const duration = performance.now() - startTime;
      this.metricsCollector.recordLatency('token.state.processing.time', duration);
    }
  }
  
  /**
   * Update token states based on user actions
   */
  updateTokenStates(tokens: Token[], acceptedIds: string[], rejectedIds: string[]): Token[] {
    return tokens.map(token => {
      if (acceptedIds.includes(token.id)) {
        return { ...token, state: 'accepted' };
      } else if (rejectedIds.includes(token.id)) {
        return { ...token, state: 'rejected' };
      }
      return token;
    });
  }
  
  // Helper methods for diff computation and state mapping
  // ...
}