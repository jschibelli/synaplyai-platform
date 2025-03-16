class UsageAggregator {
  async processBatch() {
    const events = await redisClient.xreadgroup('my-group', 'my-consumer', 'usage-events', 'COUNT', 100);
    const usageData = this.aggregate(events);

    // Write to database
    await metricsRepository.upsert(usageData);
  }

  private aggregate(events: UsageEvent[]) {
    const usageData = {
      totalRequestTokens: 0,
      totalResponseTokens: 0,
    };

    for (const event of events) {
      usageData.totalRequestTokens += event.requestTokens;
      usageData.totalResponseTokens += event.responseTokens;
    }

    return usageData;
  }
}