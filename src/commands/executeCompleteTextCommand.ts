import { AICommandRegistry, AICommandContext, CompleteTextCommand } from '../ai/AICommandRegistry';
import { registerAICommands } from '../ai/commands/register-ai-commands';
import { baseCommandRegistry } from '../commands/CommandRegistry';
import { mockAIProvider } from '../ai/providers/mockAIProvider';
import { mockRedisClient } from '../redis/mockRedisClient';
import { mockDocument } from '../documents/mockDocument';
import { documentRepository } from '../documents/documentRepository';
import { getTenantContext } from '../lib/tenant-context';
import { ContextProvider } from '../ai/ContextProvider';
import { AIService } from '../ai/AIService';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { MetricsCollector } from '../metrics/metrics-collector';
import { FeatureFlagService } from '../lib/feature-flags';
import { TokenLimiter } from '../ai/token-limiter';
import { ContentFilterPipeline } from '../compliance/filter-pipeline';
import { TenantAISettings } from '../ai/tenant-ai-settings';

export async function executeCompleteTextCommand(
  command: CompleteTextCommand, 
  context: AICommandContext
) {
  // Mock implementation for tests
  return {
    type: 'TEXT_COMPLETED',
    documentId: command.documentId,
    userId: command.userId,
    position: command.position,
    content: 'Generated text',
    metadata: {
      model: command.analysisParameters.model,
      tokens: 100
    }
  };
}