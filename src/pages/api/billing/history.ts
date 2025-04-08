import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // For beta, return mock data
    res.status(200).json({
      transactions: [
        {
          id: 'txn_123456',
          amount: 29.99,
          status: 'completed',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          description: 'Professional Plan - Monthly'
        }
      ]
    });
  } catch (error) {
    console.error('Error fetching billing history:', error);
    res.status(500).json({ error: 'Failed to fetch billing history' });
  }
}