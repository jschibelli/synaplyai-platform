import { AICommandContextParameters } from './AICommandRegistry';
import { getTenantContext } from '../lib/tenantContext';

/**
 * Document context structure 
 */
export interface DocumentContext {
  precedingText?: string;
  followingText?: string;
  selectedText?: string;
  documentStructure?: DocumentStructure;
  activeSectionContent?: string;
  documentMetadata?: Record<string, any>;
  tenantContext?: {
    tenantId: string;
    userId?: string;
  };
}

/**
 * Document structure for AI understanding
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
 * Interface for document repository
 */
export interface DocumentRepository {
  getDocument(documentId: string, tenantId: string): Promise<Document>;
}

/**
 * Interface for tenant provider
 */
export interface TenantProvider {
  getCurrentContext(): { tenantId: string; userId?: string } | undefined;
}

/**
 * Document interface
 */
export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  formatting?: Record<string, any>;
}

/**
 * Context provider class that extracts relevant document context for AI operations
 */
export class ContextProvider {
  constructor(
    private documentRepository: DocumentRepository
  ) {}

  /**
   * Get context for a document based on parameters
   */
  async getContext(
    documentId: string,
    params?: AICommandContextParameters
  ): Promise<DocumentContext> {
    // Get tenant context
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    // Get document using repository
    const document = await this.documentRepository.getDocument(documentId, tenantContext.tenantId);
    
    // Convert AICommandContextParameters to internal ContextParameters
    const contextParams: ContextParameters = {
      position: params?.windowSize ? Math.floor(document.content.length / 2) : undefined,
      windowSize: params?.windowSize || 1000,
      includePreceding: params?.includePreceding !== false,
      includeFollowing: params?.includeFollowing !== false,
      includeStructure: params?.includeMetadata,
      includeMetadata: params?.includeMetadata,
      includeFormatting: params?.includeFormatting
    };
    
    // Create context based on parameters
    const context: DocumentContext = {
      documentMetadata: contextParams.includeMetadata ? document.metadata : undefined,
      tenantContext: {
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId
      }
    };
    
    // Add preceding text if requested
    if (contextParams.includePreceding) {
      context.precedingText = this.extractPrecedingText(document, contextParams);
    }
    
    // Add following text if requested
    if (contextParams.includeFollowing) {
      context.followingText = this.extractFollowingText(document, contextParams);
    }
    
    // Add selected text if available
    if (contextParams.selectionStart !== undefined && 
        contextParams.selectionEnd !== undefined &&
        contextParams.selectionEnd > contextParams.selectionStart) {
      context.selectedText = document.content.substring(
        contextParams.selectionStart,
        contextParams.selectionEnd
      );
    }
    
    // Add document structure if requested
    if (contextParams.includeStructure) {
      context.documentStructure = this.extractStructure(document);
      context.activeSectionContent = this.extractActiveSection(document, contextParams);
    }
    
    return context;
  }

  /**
   * Extract text before cursor position
   */
  private extractPrecedingText(document: Document, params: ContextParameters): string {
    const position = params.position || document.content.length;
    const windowSize = params.windowSize || 1000;
    
    // Get text before position with intelligent paragraph boundaries
    return this.getSemanticChunk(document, position - windowSize, position);
  }

  /**
   * Extract text after cursor position
   */
  private extractFollowingText(document: Document, params: ContextParameters): string {
    const position = params.position || 0;
    const windowSize = params.windowSize || 1000;
    
    return this.getSemanticChunk(document, position, position + windowSize);
  }

  /**
   * Get a semantic chunk of text, expanded to paragraph boundaries
   */
  private getSemanticChunk(document: Document, start: number, end: number): string {
    // Ensure valid start and end
    start = Math.max(0, start);
    end = Math.min(document.content.length, end);
    
    // Expand to semantic boundaries (paragraphs, sentences)
    const expandedStart = this.findPreviousParagraphBoundary(document, start);
    const expandedEnd = this.findNextParagraphBoundary(document, end);
    
    return document.content.substring(expandedStart, expandedEnd);
  }
  
  /**
   * Find the previous paragraph boundary
   */
  private findPreviousParagraphBoundary(document: Document, position: number): number {
    if (position <= 0) return 0;
    
    const content = document.content;
    let pos = position;
    
    // Look for paragraph break (double newline)
    while (pos > 1) {
      if (content.substring(pos - 2, pos) === '\n\n') {
        return pos;
      }
      pos--;
    }
    
    return 0;
  }
  
  /**
   * Find the next paragraph boundary
   */
  private findNextParagraphBoundary(document: Document, position: number): number {
    const content = document.content;
    const length = content.length;
    
    if (position >= length) return length;
    
    let pos = position;
    
    // Look for paragraph break (double newline)
    while (pos < length - 1) {
      if (content.substring(pos, pos + 2) === '\n\n') {
        return pos + 2;
      }
      pos++;
    }
    
    return length;
  }

  /**
   * Extract document structure for AI context
   */
  private extractStructure(document: Document): DocumentStructure {
    // Extract headings, sections, lists, etc.
    // Create a simplified structural representation
    const structure: DocumentStructure = {
      title: document.metadata?.title,
      headings: [],
      sections: []
    };
    
    // Extract headings using Markdown syntax (basic implementation)
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    
    while ((match = headingRegex.exec(document.content)) !== null) {
      structure.headings?.push({
        text: match[2],
        level: match[1].length,
        position: match.index
      });
    }
    
    // Create sections based on headings
    if (structure.headings && structure.headings.length > 0) {
      for (let i = 0; i < structure.headings.length; i++) {
        const heading = structure.headings[i];
        const nextHeading = i < structure.headings.length - 1 
          ? structure.headings[i + 1] 
          : undefined;
        
        structure.sections?.push({
          heading: heading.text,
          content: document.content.substring(
            heading.position + heading.text.length + heading.level + 1, 
            nextHeading ? nextHeading.position : document.content.length
          ).trim(),
          start: heading.position,
          end: nextHeading ? nextHeading.position : document.content.length
        });
      }
    } else {
      // If no headings, create a single section for the whole document
      structure.sections?.push({
        content: document.content,
        start: 0,
        end: document.content.length
      });
    }
    
    return structure;
  }

  /**
   * Extract the content of the section where cursor is positioned
   */
  private extractActiveSection(document: Document, params: ContextParameters): string {
    if (params.position === undefined) return '';
    
    const position = params.position;
    
    // Get structure with sections
    const structure = this.extractStructure(document);
    
    if (!structure.sections || structure.sections.length === 0) {
      // Fall back to window around cursor if no sections
      return this.getSemanticChunk(document, position - 500, position + 500);
    }
    
    // Find section containing the position
    const section = structure.sections.find(
      s => position >= s.start && position <= s.end
    );
    
    if (section) {
      return section.content;
    }
    
    // Fall back to window around cursor
    return this.getSemanticChunk(document, position - 500, position + 500);
  }
}