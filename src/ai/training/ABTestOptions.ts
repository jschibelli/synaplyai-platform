export interface ABTestOptions {
  name: string;
  description?: string;
  variants: string[];
  distribution?: Record<string, number>; // weighted distribution
  targetUserGroups?: string[];
  metrics?: string[]; // Make metrics optional (we'll use successMetrics as fallback)
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
  // Add these for compatibility with tests
  tenantId?: string;
  successMetrics?: string[];
  targetUsers?: string;
  minimumSampleSize?: number;
  status?: 'ACTIVE' | 'PAUSED' | 'CONCLUDED';
}