import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Sample token usage data
  const mockUsage = {
    used: 125000,
    limit: 500000,
    resetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    plan: 'Professional',
    modelBreakdown: [
      {
        modelId: 'gpt-4o',
        promptTokens: 75000,
        completionTokens: 25000
      },
      {
        modelId: 'gpt-3.5-turbo',
        promptTokens: 15000,
        completionTokens: 10000
      }
    ]
  };

  res.status(200).json(mockUsage);
}