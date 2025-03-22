// Recommended Redis key expiration policy implementation
// filepath: src/cache/redis-store.ts
export class RedisStore {
  // Add graduated TTL strategy based on token state
  async setTokenMetadata(
    tokenId: string, 
    metadata: TokenMetadata, 
    options?: { ttl?: number }
  ): Promise<void> {
    // Use different TTLs based on token state
    const ttl = options?.ttl ?? this.getDefaultTtlForState(metadata.state);
    
    await this.redisClient.set(
      `token:${tokenId}:metadata`,
      JSON.stringify(metadata),
      'EX',
      ttl
    );
  }
  
  private getDefaultTtlForState(state: TokenState): number {
    // Active tokens need longer retention
    switch (state) {
      case 'CONFLICTED': 
        return 86400 * 7;  // 7 days for unresolved conflicts
      case 'PARTIALLY_ACCEPTED':
        return 86400 * 3;  // 3 days for partial work
      case 'ACCEPTED':
      case 'REJECTED':
        return 86400;      // 1 day for resolved states
      default:
        return 3600;       // 1 hour for other states
    }
  }
}