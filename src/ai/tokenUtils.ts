import { createHash } from 'crypto';
import { AIAnalysisParameters } from './AICommandRegistry';
import { DocumentContext } from './ContextProvider';

/**
 * Generate a cache key for a command
 */
export function generateCommandCacheKey(command: any, context?: DocumentContext): string {
  const commandData = {
    type: command.type,
    tenantId: context?.tenantContext?.tenantId || 'unknown',
    userId: command.userId,
    documentId: command.documentId,
    params: command.analysisParameters || {},
    contextHash: generateContextHash(context)
  };
  
  // Create deterministic string representation
  const dataString = JSON.stringify(commandData, (key, value) => {
    if (key === 'position' || key === 'selectionStart' || key === 'selectionEnd') {
      // Exclude position fields from cache key to allow reuse for similar positions
      return undefined;
    }
    return value;
  });
  
  // Hash the string
  return createHash('sha256').update(dataString).digest('hex');
}

/**
 * Determine if a result should be cached
 */
export function shouldCacheResult(parameters?: AIAnalysisParameters): boolean {
  // Don't cache if explicitly disabled
  if (parameters?.cache === false) {
    return false;
  }
  
  // By default, cache most analysis types
  return true;
}

/**
 * Get cache expiry in seconds for command result
 */
export function getCacheExpiry(parameters?: AIAnalysisParameters): number {
  // Default expiry is 1 hour
  const defaultExpiry = 3600;
  
  // Use command-specific expiry if provided
  if (parameters?.cacheExpiry) {
    return parameters.cacheExpiry;
  }
  
  // Use different defaults based on command type
  if (parameters?.type) {
    switch (parameters.type) {
      case 'CHECK_GRAMMAR':
        return 24 * 3600; // 24 hours for grammar checks
      case 'ANALYZE_SENTIMENT':
        return 24 * 3600; // 24 hours for sentiment analysis
      case 'COMPLETE_TEXT':
        return 1800; // 30 minutes for text completion
      case 'REWRITE_SELECTION':
        return 3600; // 1 hour for text rewrites
      default:
        return defaultExpiry;
    }
  }
  
  return defaultExpiry;
}

/**
 * Track token usage
 */
export function trackTokenUsage(
  tokens: number, 
  operationType: string, 
  modelId: string
): void {
  // This function would normally interact with metrics or usage tracking service
  console.log(`Token usage: ${tokens} tokens for ${operationType} using ${modelId}`);
  
  // In a real implementation, you might add:
  // 1. Increment tenant-specific token counters
  // 2. Log usage for billing purposes
  // 3. Emit metrics for monitoring
}

/**
 * Generate a hash for the document context
 */
function generateContextHash(context?: DocumentContext): string {
  if (!context) {
    return 'no-context';
  }
  
  const hashContent = {
    selectedText: context.selectedText,
    // Use limited preceding/following text for the hash
    precedingText: context.precedingText?.slice(-100),
    followingText: context.followingText?.slice(0, 100),
    activeSectionContent: context.activeSectionContent,
    // Include document metadata that might affect the result
    documentMetadata: context.documentMetadata
  };
  
  return createHash('sha256')
    .update(JSON.stringify(hashContent))
    .digest('hex');
}

import { AICommand } from './AICommandRegistry';
import { getTenantContext } from '../lib/tenantContext';

// Simple token estimation function (production implementation would use a proper tokenizer)
export function estimateCommandTokens(command: AICommand): number {
  let tokenEstimate = 0;
  
  // Base token count for all commands
  tokenEstimate += 100;
  
  // Add tokens based on command type and properties
  if ('originalText' in command) {
    // Text length in characters divided by 4 (approximate tokens)
    tokenEstimate += (command as any).originalText.length / 4;
  }
  
  if ('instructions' in command) {
    tokenEstimate += (command as any).instructions.length / 4;
  }
  
  if ('prompt' in command) {
    tokenEstimate += (command as any).prompt.length / 4;
  }
  
  // Context window tokens
  const windowSize = command.contextParameters?.windowSize || 1000;
  tokenEstimate += windowSize / 4;
  
  return Math.ceil(tokenEstimate);
}

// Count tokens in AI command results
export function countResultTokens(result: any): number {
  if (!result) {
    return 0;
  }
  
  // If result is a string
  if (typeof result === 'string') {
    return Math.ceil(result.length / 4);
  }
  
  // If result is an object with text content
  if (typeof result === 'object') {
    if ('text' in result) {
      return Math.ceil(result.text.length / 4);
    }
    
    if ('content' in result) {
      return Math.ceil(result.content.length / 4);
    }
    
    // For arrays of blocks or paragraphs
    if (Array.isArray(result)) {
      return result.reduce((sum, item) => {
        if (typeof item === 'string') {
          return sum + Math.ceil(item.length / 4);
        } else if (typeof item === 'object' && item !== null) {
          if ('text' in item) {
            return sum + Math.ceil((item.text as string).length / 4);
          }
          if ('content' in item) {
            return sum + Math.ceil((item.content as string).length / 4);
          }
        }
        return sum;
      }, 0);
    }
    
    // For structured results, convert to JSON and estimate
    return Math.ceil(JSON.stringify(result).length / 4);
  }
  
  return 0;
}

// Hash a string using SHA-256
function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').substring(0, 16);
}

// Hash an object by converting to JSON first
function hashObject(obj: any): string {
  const json = JSON.stringify(obj);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

// Check if a result should be cached based on command type
export function shouldCacheResult(command: AICommand): boolean {
  // Don't cache commands with low reuse potential
  const noCacheTypes = [
    'GENERATE_UNIQUE_CONTENT',
    'SUMMARIZE_FOR_USER',
    'CREATE_ONE_TIME_RESPONSE'
  ];
  
  if (noCacheTypes.includes(command.type)) {
    return false;
  }
  
  // Don't cache if command explicitly opts out
  if (command.analysisParameters?.cache === false) {
    return false;
  }
  
  return true;
}

// Calculate TTL (time to live) for cached results
export function getCacheExpiry(command: AICommand): number {
  // Default cache time: 1 hour (3600 seconds)
  const DEFAULT_TTL = 3600;
  
  // Command-specific cache times
  const cacheTimes: Record<string, number> = {
    'ANALYZE_SENTIMENT': 86400, // 24 hours
    'EXTRACT_ENTITIES': 86400,  // 24 hours
    'CHECK_GRAMMAR': 7200,      // 2 hours
    'SUGGEST_IMPROVEMENTS': 3600, // 1 hour
    'TRANSLATE_TEXT': 86400,    // 24 hours
  };
  
  // Use command-specific time or default
  return command.analysisParameters?.cacheTTL || 
         cacheTimes[command.type] || 
         DEFAULT_TTL;
}

// Track token usage with relevant metadata
export function trackTokenUsage(
  tokens: number, 
  commandType: string, 
  modelId: string = 'default'
): void {
  const tenantContext = getTenantContext();
  const tenantId = tenantContext?.tenantId || 'unknown';
  
  // This would normally call your usage tracking service
  // For now we'll just log (replace with actual tracking in production)
  console.debug(`[Token Usage] Tenant: ${tenantId}, Command: ${commandType}, Model: ${modelId}, Tokens: ${tokens}`);
  
  // In production, this would call:
  // usageTracker.trackTokenUsage(tenantId, modelId, tokens)
  //   .catch(err => console.error('Failed to track token usage:', err));
}