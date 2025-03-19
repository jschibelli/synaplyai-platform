import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Repository for tenant settings
 */
export interface TenantSettingsRepository {
  getAISettings(tenantId: string): Promise<TenantAISettingsData>;
}

/**
 * Interface for tenant AI settings
 */
export interface TenantAISettingsData {
  defaultModel?: string;
  modelPreferences?: Record<string, string>;
  promptTemplates?: Record<string, string>;
  defaultTemperature?: number;
  defaultTokenLimit?: number;
}

/**
 * Default settings
 */
const DEFAULT_SETTINGS: TenantAISettingsData = {
  defaultModel: 'gpt-4',
  modelPreferences: {
    'CHECK_GRAMMAR': 'gpt-3.5-turbo',
    'ANALYZE_SENTIMENT': 'gpt-3.5-turbo',
    'SUGGEST_IMPROVEMENTS': 'gpt-4',
    'COMPLETE_TEXT': 'gpt-4',
    'REWRITE_SELECTION': 'gpt-4'
  },
  promptTemplates: {
    'check_grammar-template': 'You are a professional editor helping to improve text. Check the grammar, spelling, and style of the provided text. Suggest corrections where needed.',
    'analyze_sentiment-template': 'You are an expert in sentiment analysis. Analyze the sentiment of the provided text and explain your reasoning.',
    'suggest_improvements-template': 'You are a writing coach. Suggest improvements to the provided text to make it more clear, concise, and engaging.',
    'complete_text-template': 'You are a collaborative writing assistant. Complete the text in a way that matches the style, tone, and context of the existing content.',
    'rewrite_selection-template': 'You are a revision specialist. Rewrite the selected text according to the provided instructions, maintaining the original meaning but improving the expression.'
  },
  defaultTemperature: 0.7,
  defaultTokenLimit: 1000
};

/**
 * TenantAISettings class provides tenant-specific AI preferences
 */
export class TenantAISettings {
  constructor(
    private settingsRepository: TenantSettingsRepository,
    private metricsCollector: MetricsCollector,
    private defaultSettings: TenantAISettingsData = DEFAULT_SETTINGS
  ) {}
  
  /**
   * Get tenant's model preference for a specific operation
   */
  async getModelPreference(
    tenantId: string,
    operationType: string,
    requestedModel?: string
  ): Promise<string> {
    // If a specific model is requested and it's not the default, use that
    if (requestedModel && requestedModel !== 'default') {
      return requestedModel;
    }
    
    try {
      const settings = await this.settingsRepository.getAISettings(tenantId);
      
      // Check for operation-specific model preference
      if (settings.modelPreferences?.[operationType]) {
        return settings.modelPreferences[operationType];
      }
      
      // Fall back to tenant default model
      if (settings.defaultModel) {
        return settings.defaultModel;
      }
    } catch (error) {
      this.metricsCollector.incrementCounter('ai.settings.error', {
        tenantId,
        errorType: 'model_preference_fetch'
      });
      console.warn(`Error fetching tenant model preference: ${error.message}`);
      // Continue with default
    }
    
    // System default
    return this.defaultSettings.modelPreferences?.[operationType] || 
           this.defaultSettings.defaultModel || 
           'gpt-4';
  }
  
  /**
   * Get tenant's prompt template
   */
  async getPromptTemplate(tenantId: string, templateName: string): Promise<string> {
    try {
      const settings = await this.settingsRepository.getAISettings(tenantId);
      
      // Check for tenant-specific template
      if (settings.promptTemplates?.[templateName]) {
        return settings.promptTemplates[templateName];
      }
    } catch (error) {
      this.metricsCollector.incrementCounter('ai.settings.error', {
        tenantId,
        errorType: 'prompt_template_fetch'
      });
      console.warn(`Error fetching tenant prompt template: ${error.message}`);
      // Continue with default
    }
    
    // Fall back to system default
    if (this.defaultSettings.promptTemplates?.[templateName]) {
      return this.defaultSettings.promptTemplates[templateName];
    }
    
    throw new Error(`No prompt template found for: ${templateName}`);
  }
  
  /**
   * Get tenant's temperature preference
   */
  async getTemperature(tenantId: string, operationType: string): Promise<number> {
    try {
      const settings = await this.settingsRepository.getAISettings(tenantId);
      
      if (settings.defaultTemperature !== undefined) {
        return settings.defaultTemperature;
      }
    } catch (error) {
      this.metricsCollector.incrementCounter('ai.settings.error', {
        tenantId,
        errorType: 'temperature_fetch'
      });
      console.warn(`Error fetching tenant temperature preference: ${error.message}`);
      // Continue with default
    }
    
    return this.defaultSettings.defaultTemperature || 0.7;
  }
  
  /**
   * Get tenant's token limit preference
   */
  async getTokenLimit(tenantId: string, operationType: string): Promise<number> {
    try {
      const settings = await this.settingsRepository.getAISettings(tenantId);
      
      if (settings.defaultTokenLimit !== undefined) {
        return settings.defaultTokenLimit;
      }
    } catch (error) {
      this.metricsCollector.incrementCounter('ai.settings.error', {
        tenantId,
        errorType: 'token_limit_fetch'
      });
      console.warn(`Error fetching tenant token limit preference: ${error.message}`);
      // Continue with default
    }
    
    return this.defaultSettings.defaultTokenLimit || 1000;
  }
}