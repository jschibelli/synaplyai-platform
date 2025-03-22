// Fix streaming latency issues by improving token batching
interface StreamingOptions {
  // Define properties based on your requirements
  flushImmediately?: boolean;
  priority?: number;
}

class StreamingTokenBatch {
  private tokens: string[] = [];
  
  get size(): number {
    return this.tokens.length;
  }
  
  addTokens(newTokens: string[]): void {
    this.tokens.push(...newTokens);
  }
  
  getTokens(): string[] {
    return [...this.tokens];
  }
  
  clear(): void {
    this.tokens = [];
  }
}

export class AIStreamingService {
  // Existing code...
  
  private batchSize = 3; // Previous value was 1 - increase to reduce overhead
  private flushInterval = 10; // Previous value was 50ms - reduce to 10ms
  private streamingQueue: Map<string, StreamingTokenBatch> = new Map();
  
  async streamTokens(sessionId: string, tokens: string[], options?: StreamingOptions): Promise<void> {
    // Use more efficient batching algorithm
    const batch = this.getOrCreateBatch(sessionId);
    batch.addTokens(tokens);
    
    if (batch.size >= this.batchSize) {
      await this.flushBatch(sessionId);
    }
  }
  
  private getOrCreateBatch(sessionId: string): StreamingTokenBatch {
    if (!this.streamingQueue.has(sessionId)) {
      const batch = new StreamingTokenBatch();
      this.streamingQueue.set(sessionId, batch);
      
      // Set up auto-flush timer - reduced from 50ms to 10ms
      setTimeout(() => this.flushBatch(sessionId), this.flushInterval);
    }
    return this.streamingQueue.get(sessionId)!;
  }
  
  private async flushBatch(sessionId: string): Promise<void> {
    const batch = this.streamingQueue.get(sessionId);
    if (!batch) return;
    
    const tokens = batch.getTokens();
    batch.clear();
    
    // Implement actual streaming logic here
    // For example: await this.sendTokensToClient(sessionId, tokens);
  }
}