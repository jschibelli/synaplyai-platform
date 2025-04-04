import { render, screen } from '@testing-library/react';
import { DocumentVirtualizer } from './DocumentVirtualizer';
import { useTokenState } from '../../hooks/useTokenState';

// Mock the hooks and services
jest.mock('../../hooks/useTokenState');
jest.mock('../../metrics/metrics-collector', () => ({
  metricsCollector: {
    recordValue: jest.fn(),
    increment: jest.fn()
  }
}));

describe('DocumentVirtualizer', () => {
  // Setup mocks
  beforeEach(() => {
    (useTokenState as jest.Mock).mockReturnValue({
      tokens: [],
      hasConflicts: false,
      addToken: jest.fn(),
      updateTokenState: jest.fn(),
      getTokenStyle: jest.fn(() => ({})),
      isLoading: false
    });
  });
  
  it('renders document content with virtualization', () => {
    // Sample document with many lines
    const content = Array(100).fill('Line content').join('\n');
    
    render(
      <DocumentVirtualizer
        documentId="test-doc-1"
        content={content}
        viewportHeight={300}
      />
    );
    
    // Should render some lines but not all 100
    expect(screen.getAllByText('Line content').length).toBeLessThan(100);
  });
  
  it('renders token states with appropriate styling', () => {
    // Mock token state
    (useTokenState as jest.Mock).mockReturnValue({
      tokens: [
        {
          id: 'token-1',
          text: 'Accepted text',
          position: 0,
          length: 13,
          metadata: { state: 'accepted' }
        },
        {
          id: 'token-2',
          text: 'Rejected text',
          position: 14,
          length: 13,
          metadata: { state: 'rejected' }
        },
        {
          id: 'token-3',
          text: 'Conflict text',
          position: 28,
          length: 13,
          metadata: { state: 'conflict' }
        }
      ],
      hasConflicts: true,
      addToken: jest.fn(),
      updateTokenState: jest.fn(),
      getTokenStyle: jest.fn((id) => {
        if (id === 'token-1') return { backgroundColor: 'rgba(0, 255, 0, 0.2)' };
        if (id === 'token-2') return { backgroundColor: 'rgba(255, 0, 0, 0.2)' };
        if (id === 'token-3') return { backgroundColor: 'rgba(255, 255, 0, 0.2)' };
        return {};
      }),
      isLoading: false
    });
    
    // Content with the three tokens
    const content = 'Accepted text Rejected text Conflict text';
    
    render(
      <DocumentVirtualizer
        documentId="test-doc-1"
        content={content}
        viewportHeight={300}
      />
    );
    
    // Should render the conflict warning
    expect(screen.getByText(/This document has unresolved conflicts/)).toBeInTheDocument();
    
    // Should render all three tokens with their styling
    expect(screen.getByText('Accepted text')).toBeInTheDocument();
    expect(screen.getByText('Rejected text')).toBeInTheDocument();
    expect(screen.getByText('Conflict text')).toBeInTheDocument();
    
    // Check styling is applied through data attributes
    expect(screen.getByText('Accepted text').getAttribute('data-token-id')).toBe('token-1');
    expect(screen.getByText('Rejected text').getAttribute('data-token-id')).toBe('token-2');
    expect(screen.getByText('Conflict text').getAttribute('data-token-id')).toBe('token-3');
  });
  
  it('handles loading state', () => {
    // Mock loading state
    (useTokenState as jest.Mock).mockReturnValue({
      tokens: [],
      hasConflicts: false,
      addToken: jest.fn(),
      updateTokenState: jest.fn(),
      getTokenStyle: jest.fn(() => ({})),
      isLoading: true
    });
    
    render(
      <DocumentVirtualizer
        documentId="test-doc-1"
        content="Sample content"
        viewportHeight={300}
      />
    );
    
    // Should show loading indicator
    expect(screen.getByText('Loading document...')).toBeInTheDocument();
  });
});