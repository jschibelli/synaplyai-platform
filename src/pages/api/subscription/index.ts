import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Handle different HTTP methods
    if (req.method === 'GET') {
      // For beta, return mock data
      res.status(200).json({
        subscription: {
          id: 'sub_123456',
          planId: 'pro',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          features: {
            collaborativeEditing: true,
            tokenLevelStateManagement: true,
            aiTokenGeneration: true
          }
        }
      });
    } else {
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Error with subscription endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}