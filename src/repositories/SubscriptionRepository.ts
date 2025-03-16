class SubscriptionRepository {
  constructor(private db: any) {}

  async save(subscription: Subscription): Promise<void> {
    await this.db.collection('subscriptions').insertOne(subscription);
  }

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    return await this.db.collection('subscriptions').findOne({ tenantId });
  }

  async findById(id: string): Promise<Subscription | null> {
    return await this.db.collection('subscriptions').findOne({ id });
  }

  async update(subscription: Subscription): Promise<void> {
    await this.db.collection('subscriptions').updateOne(
      { id: subscription.id },
      { $set: subscription }
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.db.collection('subscriptions').deleteOne({ id });
  }
}