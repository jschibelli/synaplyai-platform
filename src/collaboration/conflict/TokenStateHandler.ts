import { ConflictType } from './ConflictDetector';
import { MetricsCollector } from '../../metrics/metrics-collector';

/**
 * Possible states for tokens during conflict resolution
 */
export type TokenState = 'unchanged' | 'added' | 'removed' | 'conflict' | 'accepted' | 'rejected';

/**
 * Token with state information for conflict visualization
 */
export interface Token {
  id: string;
  text: string;
  state: TokenState;
  metadata?: {
    confidence?: number;
    suggestions?: string[];
    aiGenerated?: boolean;
    userId?: string;
    timestamp?: number;
  };
}

/**
 * Handles token-level state for conflict visualization and resolution
 * Discussed in March 20, 2025 standup as a critical collaborative editing component
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
      // Split into tokens preserving whitespace
      const originalTokens = this.splitPreservingWhitespace(originalText);
      const conflictTokens = this.splitPreservingWhitespace(conflictingText);
      
      // Calculate diff between tokens
      const diff = this.computeDiff(originalTokens, conflictTokens);
      
      // Convert diff to tokens with state
      const tokens: Token[] = diff.map((item, index) => ({
        id: `token-${Date.now()}-${index}`,
        text: item.value,
        state: this.mapDiffOperationToState(item.operation, conflictType),
        metadata: {
          confidence: item.operation === 'unchanged' ? 1.0 : 0.8,
          timestamp: Date.now()
        }
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
  updateTokenStates(
    tokens: Token[], 
    acceptedIds: string[], 
    rejectedIds: string[]
  ): Token[] {
    return tokens.map(token => {
      if (acceptedIds.includes(token.id)) {
        return { ...token, state: 'accepted' };
      } else if (rejectedIds.includes(token.id)) {
        return { ...token, state: 'rejected' };
      }
      return token;
    });
  }
  
  /**
   * Split text into tokens preserving whitespace
   */
  private splitPreservingWhitespace(text: string): string[] {
    return text.split(/(\s+)/).filter(t => t.length > 0);
  }
  
  /**
   * Compute diff between two token arrays
   */
  private computeDiff(original: string[], modified: string[]): Array<{value: string, operation: 'added' | 'removed' | 'unchanged'}> {
    // Simple diff implementation
    const result: Array<{value: string, operation: 'added' | 'removed' | 'unchanged'}> = [];
    
    let i = 0, j = 0;
    
    while (i < original.length || j < modified.length) {
      if (i < original.length && j < modified.length && original[i] === modified[j]) {
        result.push({ value: original[i], operation: 'unchanged' });
        i++;
        j++;
      } else if (j < modified.length) {
        result.push({ value: modified[j], operation: 'added' });
        j++;
      } else if (i < original.length) {
        result.push({ value: original[i], operation: 'removed' });
        i++;
      }
    }
    
    return result;
  }
  
  /**
   * Map diff operation to token state
   */
  private mapDiffOperationToState(
    operation: 'added' | 'removed' | 'unchanged',
    conflictType: ConflictType
  ): TokenState {
    switch (operation) {
      case 'unchanged':
        return 'unchanged';
      case 'added':
        return conflictType === 'MOVE_MODIFIED' ? 'conflict' : 'added';
      case 'removed':
        return conflictType === 'DELETE_MODIFIED' ? 'conflict' : 'removed';
      default:
        return 'unchanged';
    }
  }
}