import { ContextProvider, DocumentRepository, Document } from '../../src/ai/ContextProvider';
import { getTenantContext } from '../../src/lib/tenant-context';
import { AICommandContextParameters } from './AICommandRegistry';

// Mock dependencies
jest.mock('../../src/lib/tenant-context');

describe('ContextProvider', () => {
  let contextProvider: ContextProvider;
  let documentRepository: jest.Mocked<DocumentRepository>;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up tenant context mock
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: 'test-tenant',
      userId: 'test-user'
    });
    
    // Create mock document repository
    documentRepository = {
      getDocument: jest.fn()
    } as unknown as jest.Mocked<DocumentRepository>;
    
    // Create context provider
    contextProvider = new ContextProvider(documentRepository);
  });
  
  test('should throw error when no tenant context exists', async () => {
    // Mock missing tenant context
    (getTenantContext as jest.Mock).mockReturnValue(undefined);
    
    // Attempt to get context
    await expect(contextProvider.getContext('doc-1')).rejects.toThrow('No tenant context available');
    
    // Verify document was not fetched
    expect(documentRepository.getDocument).not.toHaveBeenCalled();
  });
  
  test('should get document using repository with tenant isolation', async () => {
    // Sample document
    const document: Document = {
      id: 'doc-1',
      content: 'Sample document content',
      metadata: { title: 'Test Document' }
    };
    
    // Mock repository response
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Get context with minimal parameters
    await contextProvider.getContext('doc-1');
    
    // Verify document was fetched with tenant ID
    expect(documentRepository.getDocument).toHaveBeenCalledWith('doc-1', 'test-tenant');
  });
  
  test('should extract preceding text with proper boundaries', async () => {
    // Mock document with paragraphs
    const document: Document = {
      id: 'doc-1',
      content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph with cursor here.\n\nFourth paragraph.',
      metadata: { title: 'Test Document' }
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Position cursor in third paragraph
    const context = await contextProvider.getContext('doc-1', {
      windowSize: 20,
      includePreceding: true,
      includeFollowing: false,
      position: 45 // Position within third paragraph
    });
    
    // Should include at least the third paragraph
    expect(context.precedingText).toContain('Third paragraph');
    
    // Should not include fourth paragraph
    expect(context.precedingText).not.toContain('Fourth paragraph');
  });
  
  test('should extract following text with proper boundaries', async () => {
    // Mock document with paragraphs
    const document: Document = {
      id: 'doc-1',
      content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.',
      metadata: { title: 'Test Document' }
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Position cursor in second paragraph
    const context = await contextProvider.getContext('doc-1', {
      windowSize: 30,
      includePreceding: false,
      includeFollowing: true,
      position: 20 // Position within second paragraph
    });
    
    // Should include text from position onwards
    expect(context.followingText).toContain('paragraph');
    
    // Should expand to paragraph boundaries
    expect(context.followingText).toMatch(/paragraph/);
  });
  
  test('should extract document structure correctly', async () => {
    // Mock document with markdown headings
    const document: Document = {
      id: 'doc-1',
      content: '# Main Heading\n\nIntroduction paragraph.\n\n## Section 1\n\nSection 1 content.\n\n## Section 2\n\nSection 2 content.',
      metadata: { title: 'Test Document' }
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Get context with structure
    const context = await contextProvider.getContext('doc-1', {
      includeMetadata: true
    });
    
    // Verify structure was extracted
    expect(context.documentStructure).toBeDefined();
    expect(context.documentStructure!.headings!.length).toBe(3);
    
    // Verify headings
    expect(context.documentStructure!.headings![0].text).toBe('Main Heading');
    expect(context.documentStructure!.headings![1].text).toBe('Section 1');
    expect(context.documentStructure!.headings![2].text).toBe('Section 2');
    
    // Verify sections
    expect(context.documentStructure!.sections!.length).toBe(3);
    expect(context.documentStructure!.sections![0].heading).toBe('Main Heading');
    expect(context.documentStructure!.sections![1].heading).toBe('Section 1');
    expect(context.documentStructure!.sections![2].heading).toBe('Section 2');
  });
  
  test('should extract active section based on cursor position', async () => {
    // Mock document with markdown headings
    const document: Document = {
      id: 'doc-1',
      content: '# Main Heading\n\nIntroduction paragraph.\n\n## Section 1\n\nSection 1 content.\n\n## Section 2\n\nSection 2 content.',
      metadata: { title: 'Test Document' }
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Position in Section 1
    const context = await contextProvider.getContext('doc-1', {
      includeMetadata: true,
      position: 50 // Somewhere in Section 1
    });
    
    // Should extract Section 1 content
    expect(context.activeSectionContent).toBeDefined();
    expect(context.activeSectionContent).toContain('Section 1 content');
    expect(context.activeSectionContent).not.toContain('Section 2 content');
  });
  
  test('should include document metadata when requested', async () => {
    // Mock document with metadata
    const document: Document = {
      id: 'doc-1',
      content: 'Document content',
      metadata: { 
        title: 'Test Document',
        author: 'Test Author',
        tags: ['test', 'document']
      }
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Get context with metadata
    const context = await contextProvider.getContext('doc-1', {
      includeMetadata: true
    });
    
    // Verify metadata was included
    expect(context.documentMetadata).toEqual({
      title: 'Test Document',
      author: 'Test Author',
      tags: ['test', 'document']
    });
  });
  
  test('should include tenant context in result', async () => {
    // Mock document
    const document: Document = {
      id: 'doc-1',
      content: 'Document content'
    };
    
    documentRepository.getDocument.mockResolvedValue(document);
    
    // Get context
    const context = await contextProvider.getContext('doc-1');
    
    // Verify tenant context was included
    expect(context.tenantContext).toEqual({
      tenantId: 'test-tenant',
      userId: 'test-user'
    });
  });
});