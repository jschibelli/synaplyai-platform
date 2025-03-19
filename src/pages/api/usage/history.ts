import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Generate 30 days of mock historical usage data
  const mockHistory = [];
  const now = new Date();
  
  // Parse query parameters
  const start = req.query.start ? new Date(req.query.start as string) : new Date(now);
  start.setDate(start.getDate() - 30);
  
  const end = req.query.end ? new Date(req.query.end as string) : now;
  
  // Generate daily data points between start and end
  let currentDate = new Date(start);
  const models = ['gpt-4o', 'gpt-3.5-turbo'];
  
  while (currentDate <= end) {
    // Create entries for each model
    for (const model of models) {
      // Generate some random but realistic-looking data
      // More usage on weekdays, less on weekends
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const baseTokens = isWeekend ? 2000 : 5000;
      
      // Add some randomness and a slight upward trend over time
      const daysSinceStart = Math.floor((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const trendFactor = 1 + (daysSinceStart * 0.01);
      const randomFactor = 0.5 + Math.random();
      
      // More tokens for GPT-4 than GPT-3.5
      const modelFactor = model === 'gpt-4o' ? 1.5 : 1;
      
      const totalTokens = Math.floor(baseTokens * trendFactor * randomFactor * modelFactor);
      
      mockHistory.push({
        timestamp: new Date(currentDate).toISOString(),
        totalTokens,
        modelId: model
      });
    }
    
    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  res.status(200).json(mockHistory);
}