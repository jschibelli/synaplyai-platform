import { v4 as uuidv4 } from 'uuid';
import { RedisManager, RedisKeyCategory } from '../../redis/RedisManager';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { ConflictType } from './types';

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
    userId?: string;
    timestamp?: number;
  };
}

/**
 * Manages token-level state for conflict visualization and resolution
 * Implements the features discussed in standup on March 20, 2025
 */
export class TokenStateManager {
  constructor(
    private redisManager: RedisManager,
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
      // Simple word-level tokenization with whitespace preservation
      const originalTokens = this.splitPreservingWhitespace(originalText);
      const conflictTokens = this.splitPreservingWhitespace(conflictingText);
      
      // Calculate diff between tokens
      const diff = this.computeDiff(originalTokens, conflictTokens);
      
      // Convert diff to tokens with state
      const tokens: Token[] = diff.map((item) => ({
        id: `token-${uuidv4()}`,
        text: item.value,
        state: this.mapDiffOperationToState(item.operation, conflictType),
        metadata: {
          confidence: item.operation === 'unchanged' ? 1.0 : 0.8,
          aiGenerated: false,
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
  async updateTokenStates(
    documentId: string, 
    conflictId: string,
    tokens: Token[], 
    acceptedIds: string[], 
    rejectedIds: string[]
  ): Promise<Token[]> {
    const startTime = performance.now();
    
    try {
      const updatedTokens = tokens.map(token => {
        if (acceptedIds.includes(token.id)) {
          return { ...token, state: 'accepted' };
        } else if (rejectedIds.includes(token.id)) {
          return { ...token, state: 'rejected' };
        }
        return token;
      });
      
      // Store token states in Redis for persistence
      await this.storeTokenStates(documentId, conflictId, updatedTokens);
      
      return updatedTokens;
    } finally {
      const duration = performance.now() - startTime;
      this.metricsCollector.recordLatency('token.state.update.time', duration);
    }
  }
  
  /**
   * Store token states in Redis
   */
  async storeTokenStates(
    documentId: string, 
    conflictId: string, 
    tokens: Token[]
  ): Promise<void> {
    const key = `document:${documentId}:conflict:${conflictId}:tokens`;
    
    // Store each token state individually in a hash
    for (const token of tokens) {
      await this.redisManager.hset(
        key,
        token.id,
        JSON.stringify(token),
        RedisKeyCategory.CONFLICT_STATE
      );
    }
  }
  
  /**
   * Retrieve token states from Redis
   */
  async getTokenStates(
    documentId: string, 
    conflictId: string
  ): Promise<Token[]> {
    const key = `document:${documentId}:conflict:${conflictId}:tokens`;
    
    const tokenHash = await this.redisManager.hgetall(key);
    if (!tokenHash) return [];
    
    return Object.values(tokenHash)
      .map(tokenStr => JSON.parse(tokenStr) as Token)
      .sort((a, b) => (a.metadata?.timestamp || 0) - (b.metadata?.timestamp || 0));
  }
  
  /**
   * Integrate AI-generated token states
   */
  async integrateAITokenStates(
    documentId: string,
    conflictId: string,
    aiTokens: Token[]
  ): Promise<Token[]> {
    // Retrieve existing tokens
    const existingTokens = await this.getTokenStates(documentId, conflictId);
    
    // Map of token IDs to existing tokens
    const tokenMap = new Map<string, Token>();
    existingTokens.forEach(token => tokenMap.set(token.id, token));
    
    // Update existing tokens with AI suggestions
    for (const aiToken of aiTokens) {
      if (tokenMap.has(aiToken.id)) {
        const existingToken = tokenMap.get(aiToken.id)!;
        
        // Merge metadata and update state based on AI confidence
        tokenMap.set(aiToken.id, {
          ...existingToken,
          metadata: {
            ...existingToken.metadata,
            suggestions: aiToken.metadata?.suggestions || [],
            confidence: aiToken.metadata?.confidence || existingToken.metadata?.confidence,
            aiGenerated: true
          }
        });
      } else {
        // Add new AI token with proper metadata
        tokenMap.set(aiToken.id, {
          ...aiToken,
          metadata: {
            ...aiToken.metadata,
            aiGenerated: true,
            timestamp: Date.now()
          }
        });
      }
    }
    
    // Store updated tokens
    const updatedTokens = Array.from(tokenMap.values());
    await this.storeTokenStates(documentId, conflictId, updatedTokens);
    
    return updatedTokens;
  }
  
  /**
   * Split text into tokens preserving whitespace
   */
  private splitPreservingWhitespace(text: string): string[] {
    // Regular expression that matches words and whitespace separately
    const result: string[] = [];
    let currentWord = '';
    let currentWhitespace = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (/\s/.test(char)) {
        // If whitespace
        if (currentWord) {
          result.push(currentWord);
          currentWord = '';
        }
        currentWhitespace += char;
      } else {
        // If non-whitespace
        if (currentWhitespace) {
          result.push(currentWhitespace);
          currentWhitespace = '';
        }
        currentWord += char;
      }
    }
    
    // Add remaining parts
    if (currentWord) result.push(currentWord);
    if (currentWhitespace) result.push(currentWhitespace);
    
    return result;
  }
  
  /**
   * Compute diff between two token arrays
   */
  private computeDiff(original: string[], modified: string[]): Array<{value: string, operation: 'added' | 'removed' | 'unchanged'}> {
    // Use dynamic programming to find longest common subsequence
    const lcs = this.longestCommonSubsequence(original, modified);
    
    let originalIndex = 0;
    let modifiedIndex = 0;
    let lcsIndex = 0;
    
    const result: Array<{value: string, operation: 'added' | 'removed' | 'unchanged'}> = [];
    
    while (originalIndex < original.length || modifiedIndex < modified.length) {
      if (originalIndex < original.length && 
          modifiedIndex < modified.length && 
          original[originalIndex] === modified[modifiedIndex] &&
          lcsIndex < lcs.length && 
          original[originalIndex] === lcs[lcsIndex]) {
        // Unchanged token
        result.push({
          value: original[originalIndex],
          operation: 'unchanged'
        });
        originalIndex++;
        modifiedIndex++;
        lcsIndex++;
      } else if (modifiedIndex < modified.length && 
                (lcsIndex >= lcs.length || modified[modifiedIndex] !== lcs[lcsIndex])) {
        // Added token
        result.push({
          value: modified[modifiedIndex],
          operation: 'added'
        });
        modifiedIndex++;
      } else if (originalIndex < original.length) {
        // Removed token
        result.push({
          value: original[originalIndex],
          operation: 'removed'
        });
        originalIndex++;
      }
    }
    
    return result;
  }
  
  /**
   * Find longest common subsequence between two arrays
   */
  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const matrix: number[][] = Array(a.length + 1).fill(0).map(() => Array(b.length + 1).fill(0));
    
    // Fill the matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
        } else {
          matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
        }
      }
    }
    
    // Backtrack to find the sequence
    const result: string[] = [];
    let i = a.length, j = b.length;
    
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else if (matrix[i - 1][j] > matrix[i][j - 1]) {
        i--;
      } else {
        j--;
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
        return conflictType === ConflictType.MOVE_MODIFIED ? 'conflict' : 'added';
      case 'removed':
        return conflictType === ConflictType.DELETE_MODIFIED ? 'conflict' : 'removed';
      default:
        return 'unchanged';
    }
  }
}