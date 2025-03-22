import { TenantContext } from '../tenant/TenantContext';

/**
 * Document structure for AI and processing operations
 */
export interface DocumentStructure {
  title?: string;
  headings?: Array<{
    text: string;
    level: number;
    position: number;
  }>;
  sections?: Array<{
    heading?: string;
    content: string;
    start: number;
    end: number;
  }>;
}

/**
 * Parameters for context extraction
 */
export interface ContextParameters {
  position?: number;
  selectionStart?: number;
  selectionEnd?: number;
  windowSize?: number;
  includePreceding?: boolean;
  includeFollowing?: boolean;
  includeStructure?: boolean;
  includeMetadata?: boolean;
  includeFormatting?: boolean;
}

/**
 * DocumentContext provides accessible context information about a document
 * for AI operations, collaboration, and other document-centric features
 */
export class DocumentContext {
  documentId: string;
  tenantContext: TenantContext;
  precedingText?: string;
  followingText?: string;
  selectedText?: string;
  documentMetadata?: Record<string, any>;
  documentStructure?: DocumentStructure;
  activeSectionContent?: string;
  position?: number;
  fullContent?: string;

  constructor(params: {
    documentId: string;
    tenantContext: TenantContext;
    selectedText?: string;
    precedingText?: string;
    followingText?: string;
    documentMetadata?: Record<string, any>;
    documentStructure?: DocumentStructure;
    activeSectionContent?: string;
    position?: number;
    fullContent?: string;
  }) {
    this.documentId = params.documentId;
    this.tenantContext = params.tenantContext;
    this.selectedText = params.selectedText;
    this.precedingText = params.precedingText;
    this.followingText = params.followingText;
    this.documentMetadata = params.documentMetadata;
    this.documentStructure = params.documentStructure;
    this.activeSectionContent = params.activeSectionContent;
    this.position = params.position;
    this.fullContent = params.fullContent;
  }

  /**
   * Get context information based on specified parameters
   */
  getContext(parameters: {
    windowSize?: number;
    includePreceding?: boolean;
    includeFollowing?: boolean;
    includeDocument?: boolean;
    includeMetadata?: boolean;
    includeStructure?: boolean;
  }): {
    selectedText?: string;
    precedingText?: string;
    followingText?: string;
    documentMetadata?: Record<string, any>;
    documentStructure?: DocumentStructure;
    activeSectionContent?: string;
    documentContent?: string;
  } {
    return {
      selectedText: this.selectedText,
      precedingText: parameters.includePreceding ? this.precedingText : undefined,
      followingText: parameters.includeFollowing ? this.followingText : undefined,
      documentMetadata: parameters.includeMetadata ? this.documentMetadata : undefined,
      documentStructure: parameters.includeStructure ? this.documentStructure : undefined,
      activeSectionContent: parameters.includeStructure ? this.activeSectionContent : undefined,
      documentContent: parameters.includeDocument ? this.fullContent : undefined
    };
  }

  /**
   * Get simplified context information for AI operations
   */
  getAIContext(windowSize: number = 1000): {
    context: string;
    metadata?: Record<string, any>;
  } {
    // Build context with relevant information in a format suitable for AI
    let contextString = '';
    
    if (this.documentMetadata?.title) {
      contextString += `Title: ${this.documentMetadata.title}\n\n`;
    }
    
    if (this.precedingText) {
      contextString += `${this.precedingText}\n`;
    }
    
    if (this.selectedText) {
      contextString += `[SELECTED TEXT START]\n${this.selectedText}\n[SELECTED TEXT END]\n`;
    }
    
    if (this.followingText) {
      contextString += `${this.followingText}\n`;
    }
    
    return {
      context: contextString,
      metadata: this.documentMetadata
    };
  }

  /**
   * Create a simplified JSON representation of the document context
   */
  toJSON(): Record<string, any> {
    return {
      documentId: this.documentId,
      tenantId: this.tenantContext.tenantId,
      userId: this.tenantContext.userId,
      metadata: this.documentMetadata,
      hasSelection: !!this.selectedText,
      contextSummary: {
        precedingTextLength: this.precedingText?.length || 0,
        followingTextLength: this.followingText?.length || 0,
        selectedTextLength: this.selectedText?.length || 0,
        position: this.position
      }
    };
  }
}