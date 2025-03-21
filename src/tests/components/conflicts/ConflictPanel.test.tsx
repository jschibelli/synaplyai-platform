import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import { ConflictPanel } from '../../../src/components/conflicts/ConflictPanel';
import { ConflictResolutionStrategy } from '../../../src/conflicts/ConflictResolver';

// Mock the DiffView component to isolate testing
jest.mock('../../../src/components/conflicts/DiffView', () => ({
  DiffView: ({ original, suggested, tokenStates, onTokenClick }) => (
    <div data-testid="diff-view">
      <div data-testid="original-content">{original}</div>
      <div data-testid="suggested-content">{suggested}</div>
      {/* Simplified token representation for testing */}
      <div data-testid="tokens">
        <span 
          data-testid="token-1" 
          className={`token token-${tokenStates['token-1'] || 'ACCEPTED'}`} 
          onClick={() => onTokenClick('token-1')}
        >
          This
        </span>
        <span 
          data-testid="token-2" 
          className={`token token-${tokenStates['token-2'] || 'ACCEPTED'}`} 
          onClick={() => onTokenClick('token-2')}
        >
          is
        </span>
        <span 
          data-testid="token-3' 
          className={`token token-${tokenStates['token-3'] || 'REJECTED'}`} 
          onClick={() => onTokenClick('token-3')}
        >
          local
        </span>
        <span 
          data-testid="token-4" 
          className={`token token-${tokenStates['token-4'] || 'ACCEPTED'}`} 
          onClick={() => onTokenClick('token-4')}
        >
          content
        </span>
      </div>
    </div>
  )
}));

describe('ConflictPanel', () => {
  const mockConflict = {
    id: 'conflict-1',
    type: 'TEXT_CONFLICT',
    localContent: 'This is local content',
    remoteContent: 'This is remote content',
    tokens: [
      { id: 'token-1', text: 'This', state: 'ACCEPTED' },
      { id: 'token-2', text: 'is', state: 'ACCEPTED' },
      { id: 'token-3', text: 'local', state: 'REJECTED' },
      { id: 'token-4', text: 'content', state: 'ACCEPTED' }
    ]
  };

  const mockResolve = jest.fn();
  
  beforeEach(() => {
    mockResolve.mockClear();
  });

  test('renders conflict panel with correct content', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    expect(screen.getByText('Conflict Detected')).toBeInTheDocument();
    expect(screen.getByTestId('original-content')).toHaveTextContent(mockConflict.localContent);
    expect(screen.getByTestId('suggested-content')).toHaveTextContent(mockConflict.remoteContent);
    expect(screen.getByRole('button', { name: /merge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep local/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  test('calls onResolve with MERGE strategy when merge button is clicked', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    fireEvent.click(screen.getByRole('button', { name: /merge/i }));
    
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: mockConflict.id,
      strategy: ConflictResolutionStrategy.MERGE
    });
  });

  test('calls onResolve with LOCAL_FIRST strategy when keep local button is clicked', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    fireEvent.click(screen.getByRole('button', { name: /keep local/i }));
    
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: mockConflict.id,
      strategy: ConflictResolutionStrategy.LOCAL_FIRST
    });
  });

  test('calls onResolve with REMOTE_FIRST strategy when discard button is clicked', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: mockConflict.id,
      strategy: ConflictResolutionStrategy.REMOTE_FIRST
    });
  });

  test('initializes token states from conflict data', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    const tokens = screen.getByTestId('tokens');
    expect(within(tokens).getByTestId('token-1')).toHaveClass('token-ACCEPTED');
    expect(within(tokens).getByTestId('token-2')).toHaveClass('token-ACCEPTED');
    expect(within(tokens).getByTestId('token-3')).toHaveClass('token-REJECTED');
    expect(within(tokens).getByTestId('token-4')).toHaveClass('token-ACCEPTED');
  });

  test('updates token state when clicked', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    const token3 = screen.getByTestId('token-3');
    
    // Initial state is REJECTED
    expect(token3).toHaveClass('token-REJECTED');
    
    // Click to change state (REJECTED -> CONFLICTED)
    fireEvent.click(token3);
    expect(token3).toHaveClass('token-CONFLICTED');
    
    // Click again (CONFLICTED -> ACCEPTED)
    fireEvent.click(token3);
    expect(token3).toHaveClass('token-ACCEPTED');
    
    // Click again to complete the cycle (ACCEPTED -> REJECTED)
    fireEvent.click(token3);
    expect(token3).toHaveClass('token-REJECTED');
  });

  test('announces state changes to screen readers', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Find and click a token
    const token3 = screen.getByTestId('token-3');
    fireEvent.click(token3);
    
    // Check that the status is announced
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/token marked as conflicted/i);
    
    // Check announcement for resolution actions
    fireEvent.click(screen.getByRole('button', { name: /merge/i }));
    expect(status).toHaveTextContent(/merging both versions/i);
  });

  test('handles related suggestions correctly', () => {
    const relatedSuggestions = [
      { id: 'suggestion-1', content: 'Suggested change', state: 'CONFLICTED' }
    ];
    
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve}
        relatedSuggestions={relatedSuggestions}
      />
    );
    
    // Verify suggestions are displayed
    expect(screen.getByText('Related Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Suggested change')).toBeInTheDocument();
    
    // Spy on console.log to verify action logging
    const consoleSpy = jest.spyOn(console, 'log');
    
    // Find accept button for the suggestion and click it
    const acceptButton = screen.getByLabelText(/Accept suggestion:/i);
    fireEvent.click(acceptButton);
    
    // Verify action was logged and status updated
    expect(consoleSpy).toHaveBeenCalledWith('Suggestion suggestion-1 accepted');
    expect(screen.getByRole('status')).toHaveTextContent(/suggestion accepted/i);
    
    // Find reject button and click it
    const rejectButton = screen.getByLabelText(/Reject suggestion:/i);
    fireEvent.click(rejectButton);
    
    // Verify action was logged
    expect(consoleSpy).toHaveBeenCalledWith('Suggestion suggestion-1 rejected');
    
    // Clean up spy
    consoleSpy.mockRestore();
  });

  test('handles conflicts with operational transforms when available', () => {
    // Create a conflict with operations
    const conflictWithOps = {
      ...mockConflict,
      operations: {
        local: {
          type: 'insert',
          position: 0,
          text: 'This is local content',
          userId: 'user-1',
          timestamp: 100
        },
        remote: {
          type: 'insert',
          position: 0,
          text: 'This is remote content',
          userId: 'user-2',
          timestamp: 101
        }
      }
    };
    
    // Mock OperationalTransform module
    jest.mock('../../../src/collaborative/OperationalTransform', () => ({
      OperationalTransform: {
        transform: jest.fn().mockReturnValue({
          type: 'insert',
          position: 0,
          text: 'transformed',
          userId: 'user-2',
          timestamp: 101
        }),
        apply: jest.fn().mockReturnValue('Merged content')
      }
    }));
    
    render(
      <ConflictPanel 
        conflict={conflictWithOps} 
        onResolve={mockResolve} 
      />
    );
    
    // Click merge to trigger the operational transform code path
    fireEvent.click(screen.getByRole('button', { name: /merge/i }));
    
    // Verify resolution was called
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: conflictWithOps.id,
      strategy: ConflictResolutionStrategy.MERGE
    });
  });

  test('renders accessibility features properly', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Verify proper ARIA roles and attributes
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Conflict Resolution Panel');
    expect(screen.getByRole('status')).toBeInTheDocument();
    
    // Check that the conflict description is available for screen readers
    const conflictDescriptions = screen.getAllByText(/conflict detected between local content/i, { exact: false });
    expect(conflictDescriptions.length).toBeGreaterThan(0);
    
    // Verify buttons have accessible names
    expect(screen.getByRole('button', { name: /merge both versions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep local version/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use remote version/i })).toBeInTheDocument();
  });

  test('handles keyboard navigation', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Focus and trigger action with keyboard
    const mergeButton = screen.getByRole('button', { name: /merge/i });
    mergeButton.focus();
    fireEvent.keyDown(mergeButton, { key: 'Enter', code: 'Enter' });
    
    // Verify the action was triggered
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: mockConflict.id,
      strategy: ConflictResolutionStrategy.MERGE
    });
  });

  test('renders without tokens when not provided', () => {
    // Create conflict without tokens
    const conflictWithoutTokens = {
      id: 'conflict-2',
      type: 'TEXT_CONFLICT',
      localContent: 'Local content only',
      remoteContent: 'Remote content only'
    };
    
    render(
      <ConflictPanel 
        conflict={conflictWithoutTokens} 
        onResolve={mockResolve} 
      />
    );
    
    // Should render without errors
    expect(screen.getByText('Conflict Detected')).toBeInTheDocument();
    expect(screen.getByTestId('original-content')).toHaveTextContent('Local content only');
  });

  test('handles empty related suggestions array', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve}
        relatedSuggestions={[]} // Explicitly empty
      />
    );
    
    // Should not render the suggestions section
    expect(screen.queryByText('Related Suggestions')).not.toBeInTheDocument();
  });

  test('preserves token state between re-renders', () => {
    const { rerender } = render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Change token state
    const token = screen.getByTestId('token-3');
    fireEvent.click(token); // REJECTED -> CONFLICTED
    expect(token).toHaveClass('token-CONFLICTED');
    
    // Re-render with same props
    rerender(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // State should be preserved
    expect(screen.getByTestId('token-3')).toHaveClass('token-CONFLICTED');
  });
});