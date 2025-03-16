import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId, getCurrentUserId } from '@/lib/tenantContext';

const prisma = new PrismaClient();

export class ContentFilter {
  // Default disallowed terms - in a real app, these would be loaded from DB or config
  private static readonly DEFAULT_DISALLOWED_TERMS = [
    'hate speech',
    'illegal content',
    'violence',
    'explicit sexual content'
    // Add more disallowed terms as needed
  ];
  
  private disallowedTerms: string[];
  private customTerms: Map<string, string[]> = new Map();
  
  constructor(disallowedTerms: string[] = ContentFilter.DEFAULT_DISALLOWED_TERMS) {
    this.disallowedTerms = disallowedTerms;
    this.loadCustomTermsForTenant();
  }
  
  /**
   * Load tenant-specific disallowed terms
   * In a real app, these would come from a database
   */
  private async loadCustomTermsForTenant() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    
    // In a real application, this would fetch from database
    // For now, we're just simulating tenant-specific terms
    this.customTerms.set('tenant-1', ['proprietary', 'confidential', 'internal-only']);
    this.customTerms.set('tenant-2', ['competitor-x', 'competitor-y', 'secret-project']);
  }
  
  /**
   * Check if content contains disallowed terms
   * @returns Object with isAllowed flag and reasons for filtering if applicable
   */
  async filterContent(content: string): Promise<{
    isAllowed: boolean;
    reasons: string[];
    filteredContent?: string;
  }> {
    const tenantId = getCurrentTenantId() || 'default-tenant';
    const userId = getCurrentUserId() || 'anonymous';
    let lowerContent = content.toLowerCase();
    const reasons: string[] = [];
    let isContentModified = false;
    
    // Check against global disallowed terms
    for (const term of this.disallowedTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        reasons.push(`Contains disallowed term: ${term}`);
      }
    }
    
    // Check against tenant-specific terms
    const tenantTerms = this.customTerms.get(tenantId) || [];
    for (const term of tenantTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        reasons.push(`Contains tenant-specific disallowed term: ${term}`);
      }
    }
    
    // Log the filtering event
    if (reasons.length > 0) {
      try {
        // In a real app, you would log to a database or monitoring system
        console.log(`[CONTENT-FILTER] Blocked content from tenant: ${tenantId}, user: ${userId}, reasons: ${reasons.join(', ')}`);
      } catch (error) {
        console.error('Failed to log content filtering:', error);
      }
    }
    
    return {
      isAllowed: reasons.length === 0,
      reasons,
      filteredContent: isContentModified ? lowerContent : undefined
    };
  }
}