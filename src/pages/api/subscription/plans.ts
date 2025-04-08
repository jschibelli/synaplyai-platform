import type { NextApiRequest, NextApiResponse } from 'next';

// Mock data for beta testing
const SUBSCRIPTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic Plan',
    price: 9.99,
    features: ['Core features', 'Limited usage']
  },
  {
    id: 'pro',
    name: 'Professional Plan',
    price: 29.99,
    features: ['All features', 'Unlimited usage', 'Priority support']
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    price: 99.99,
    features: ['All features', 'Unlimited usage', 'Dedicated support', 'Custom integrations']
  }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // For beta, just return mock data
    res.status(200).json({ plans: SUBSCRIPTION_PLANS });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
}