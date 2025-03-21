import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { ConflictPanel } from '../../../src/components/conflicts/ConflictPanel';
import { ConflictResolutionStrategy } from '../../../src/conflicts/ConflictResolver';

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
    expect(screen.getByText('Original:')).toBeInTheDocument();
    expect(screen.getByText('Suggested:')).toBeInTheDocument();
  });

  test('calls onResolve with MERGE strategy when merge button is clicked', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    fireEvent.click(screen.getByText('Merge'));
    
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
    
    fireEvent.click(screen.getByText('Keep Local'));
    
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
    
    fireEvent.click(screen.getByText('Discard'));
    
    expect(mockResolve).toHaveBeenCalledWith({
      conflictId: mockConflict.id,
      strategy: ConflictResolutionStrategy.REMOTE_FIRST
    });
  });

  test('displays tokens with correct styling based on their state', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // You'll need to adjust these selectors based on your actual implementation
    const acceptedTokens = screen.getAllByText('This'); // First token is ACCEPTED
    const rejectedTokens = screen.getAllByText('local'); // Third token is REJECTED
    
    // Check that tokens have the right classes
    expect(acceptedTokens[0].closest('.token')).toHaveClass('token-accepted');
    expect(rejectedTokens[0].closest('.token')).toHaveClass('token-rejected');
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
  });

  test('updates token state when clicked', () => {
    const { container } = render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Find a token and check its initial state
    const token = screen.getAllByText('local')[0].closest('.token');
    expect(token).toHaveClass('token-rejected');
    
    // Click to change state
    fireEvent.click(token);
    
    // After click, state should change from REJECTED to CONFLICTED
    expect(token).toHaveClass('token-conflicted');
    
    // Click again to test the full cycle
    fireEvent.click(token);
    
    // After second click, state should change from CONFLICTED to ACCEPTED
    expect(token).toHaveClass('token-accepted');
    
    // Complete the cycle with one more click
    fireEvent.click(token);
    
    // After third click, state should change from ACCEPTED to REJECTED
    expect(token).toHaveClass('token-rejected');
  });

  test('supports accessibility features', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Check for appropriate ARIA roles
    expect(screen.getByRole('region')).toBeInTheDocument();
    
    // Check that buttons have accessible names
    expect(screen.getByRole('button', { name: /merge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep local/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  test('announces state changes to screen readers', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Find a token and click it
    const token = screen.getAllByText('local')[0].closest('.token');
    fireEvent.click(token);
    
    // Check that status message is updated for screen readers
    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveTextContent(/token marked as/i);
  });

  test('handles keyboard navigation for accessibility', () => {
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Find a token and trigger keyboard event
    const token = screen.getAllByText('local')[0].closest('.token');
    
    // Simulate pressing Enter key
    fireEvent.keyDown(token, { key: 'Enter', code: 'Enter' });
    
    // Token state should change as if clicked
    expect(token).toHaveClass('token-conflicted');
  });

  test('handles suggestion actions correctly', () => {
    const relatedSuggestions = [
      { id: 'suggestion-1', content: 'Suggested change', state: 'CONFLICTED' }
    ];
    
    // Create a spy on console.log to verify action logging
    const consoleSpy = jest.spyOn(console, 'log');
    
    render(
      <ConflictPanel 
        conflict={mockConflict} 
        onResolve={mockResolve}
        relatedSuggestions={relatedSuggestions}
      />
    );
    
    // Find accept button for the suggestion and click it
    const acceptButton = screen.getByLabelText(/accept suggestion/i);
    fireEvent.click(acceptButton);
    
    // Verify action was logged
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('suggestion-1 accepted'));
    
    // Find reject button and click it
    const rejectButton = screen.getByLabelText(/reject suggestion/i);
    fireEvent.click(rejectButton);
    
    // Verify action was logged
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('suggestion-1 rejected'));
    
    // Clean up spy
    consoleSpy.mockRestore();
  });

  test('initializes token states correctly from props', () => {
    // Custom conflict with different token states
    const customConflict = {
      ...mockConflict,
      tokens: [
        { id: 'custom-1', text: 'Custom', state: 'ACCEPTED' },
        { id: 'custom-2', text: 'Token', state: 'CONFLICTED' }
      ]
    };
    
    render(
      <ConflictPanel 
        conflict={customConflict} 
        onResolve={mockResolve} 
      />
    );
    
    // Find tokens and check their classes
    const acceptedToken = screen.getByText('Custom').closest('.token');
    const conflictedToken = screen.getByText('Token').closest('.token');
    
    expect(acceptedToken).toHaveClass('token-accepted');
    expect(conflictedToken).toHaveClass('token-conflicted');
  });
});