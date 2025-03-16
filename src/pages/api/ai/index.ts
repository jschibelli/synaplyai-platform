import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { OpenAIService } from '@/services/ai/openai';
import { AnthropicService } from '@/services/ai/anthropic';
import { UsageTracker } from '@/services/usage/tracker';
import { withTenantContext } from '@/middleware/tenantContext';

const usageTracker = new UsageTracker();

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, content, options } = req.body;
    
    // Select appropriate service based on model prefix
    let service;
    if (model.startsWith('gpt')) {
      service = new OpenAIService(model);
    } else if (model.startsWith('claude')) {
      service = new AnthropicService(model);
    } else {
      return res.status(400).json({ error: 'Invalid model specified' });
    }
    
    // Check token limits before processing
    const userId = session.user.id;
    const modelInfo = service.getModelInfo();
    
    // Estimate token count (implement more sophisticated estimation in production)
    const estimatedTokens = content.length / 4;
    
    // Track usage and check if it exceeds limits
    const canProceed = await usageTracker.trackTokenUsage(
      userId, 
      model, 
      estimatedTokens
    );
    
    if (!canProceed) {
      return res.status(403).json({ 
        error: 'Usage limit exceeded',
        subscription: 'Please upgrade your subscription for more tokens'
      });
    }
    
    try {
      // Generate content
      const generatedContent = await service.generateContent(content, options);
      
      // Track actual usage after generation (more accurate)
      // In a real implementation, use the token count from the API response
      const actualTokens = generatedContent.length / 4;
      await usageTracker.trackTokenUsage(userId, model, actualTokens - estimatedTokens);
      
      return res.status(200).json({ content: generatedContent });
    } catch (error: any) {
      if (error.message.includes('Content not allowed')) {
        return res.status(400).json({
          error: 'Content filtered',
          message: error.message
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('AI request error:', error);
    return res.status(500).json({ 
      error: 'Failed to process AI request',
      message: error.message
    });
  }
}

export default withTenantContext(handler);