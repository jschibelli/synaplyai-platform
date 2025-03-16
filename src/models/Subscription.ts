export interface Subscription {
  id: string;
  tenantId: string;
  tier: string;
  maxDailyTokens: number;
  maxMonthlyTokens: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  overspillPolicy: 'HARD_CUTOFF' | 'SOFT_LIMIT' | 'AUTO_UPGRADE';
}