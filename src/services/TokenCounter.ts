class TokenCounter {
  async recordUsage(tenantId: string, modelId: string, requestTokens: number, responseTokens: number) {
    const today = formatDate(new Date());
    const month = formatMonth(new Date());

    await redisClient.multi()
      .hincrby(`usage:daily:${tenantId}:${today}`, `model:${modelId}:request`, requestTokens)
      .hincrby(`usage:daily:${tenantId}:${today}`, `model:${modelId}:response`, responseTokens)
      .hincrby(`usage:monthly:${tenantId}:${month}`, `model:${modelId}:request`, requestTokens)
      .hincrby(`usage:monthly:${tenantId}:${month}`, `model:${modelId}:response`, responseTokens)
      .exec();

    // Publish to event stream
    await redisClient.xadd(
      `usage-events:${tenantId}`,
      '*',
      'timestamp', Date.now(),
      'modelId', modelId,
      'requestTokens', requestTokens,
      'responseTokens', responseTokens
    );
  }
}