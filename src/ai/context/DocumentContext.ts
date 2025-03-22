export class DocumentContext {
  documentId: string;
  userId: string;
  selectedText: string;
  precedingText: string;
  followingText: string;
  documentMetadata: any;
  tenantContext: any;

  constructor(params: {
    documentId: string;
    userId: string;
    selectedText?: string;
    precedingText?: string;
    followingText?: string;
    documentMetadata?: any;
    tenantContext?: any;
  }) {
    this.documentId = params.documentId;
    this.userId = params.userId;
    this.selectedText = params.selectedText || '';
    this.precedingText = params.precedingText || '';
    this.followingText = params.followingText || '';
    this.documentMetadata = params.documentMetadata || {};
    this.tenantContext = params.tenantContext || {};
  }

  async getContext(parameters: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
    includeDocument?: boolean;
  }): Promise<any> {
    return {
      selectedText: this.selectedText,
      precedingText: parameters.includePreceding ? this.precedingText : '',
      followingText: parameters.includeFollowing ? this.followingText : '',
      documentMetadata: this.documentMetadata,
      documentContent: parameters.includeDocument ? `Full document content for ${this.documentId}` : undefined
    };
  }
}