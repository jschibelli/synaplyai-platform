import { ContentFilter, FilterResponse, ContentFilterResult, FilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { getEmbeddings } from '../services/embedding';

interface CategoryVector {
  category: string;
  result: ContentFilterResult;
  reason: string;
  vector: number[];
}

export class EmbeddingContentFilter implements ContentFilter {
  name = 'EmbeddingContentFilter';
  description = 'Filter content using vector embeddings similarity';
  
  private categories: CategoryVector[] = [];
  private similarityThreshold: number;
  
  constructor(
    categories: { category: string; result: ContentFilterResult; reason: string; vector: number[] }[] = [], 
    similarityThreshold: number = 0.85
  ) {
    this.categories = categories;
    this.similarityThreshold = similarityThreshold;
  }
  
  addCategory(category: string, result: ContentFilterResult, reason: string, vector: number[]): void {
    this.categories.push({ category, result, reason, vector });
  }
  
  // Calculate cosine similarity between two vectors
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  async filter(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    // Default response if nothing matches
    const defaultResponse: FilterResponse = {
      result: ContentFilterResult.ALLOWED,
      confidence: 1.0
    };
    
    try {
      // Get embedding for the content
      const contentVector = await getEmbeddings(content);
      
      // Find the closest category
      let highestSimilarity = -1;
      let closestCategory: CategoryVector | null = null;
      
      for (const category of this.categories) {
        const similarity = this.cosineSimilarity(contentVector, category.vector);
        
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          closestCategory = category;
        }
      }
      
      // If we have a close match above threshold, use that result
      if (closestCategory && highestSimilarity >= this.similarityThreshold) {
        // Log the filter result if it's not ALLOWED
        if (closestCategory.result !== ContentFilterResult.ALLOWED) {
          await ComplianceLogger.log({
            eventType: 'content.filtered',
            description: `Content filtered by ${this.name}`,
            metadata: {
              filterName: this.name,
              result: closestCategory.result,
              reason: closestCategory.reason,
              category: closestCategory.category,
              similarity: highestSimilarity
            }
          });
        }
        
        return {
          result: closestCategory.result,
          confidence: highestSimilarity,
          reason: closestCategory.reason
        };
      }
      
      return defaultResponse;
    } catch (error) {
      // Log the error
      await ComplianceLogger.log({
        eventType: 'content.filter.error',
        description: `Error in ${this.name}`,
        metadata: { error: error.message }
      });
      
      // Return default response on error
      return defaultResponse;
    }
  }
}

export class EmbeddingFilterStage {
  // Simplified implementation for testing
  async process(content: string): Promise<FilterResult> {
    // Check for sensitive keywords in this basic implementation
    const sensitiveKeywords = ['sensitive', 'proprietary', 'confidential'];
    
    for (const keyword of sensitiveKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        return {
          isAllowed: false,
          confidenceScore: 0.85,
          reasons: ['Content is sensitive']
        };
      }
    }

    return {
      isAllowed: true,
      confidenceScore: 0.9,
      reasons: []
    };
  }
}