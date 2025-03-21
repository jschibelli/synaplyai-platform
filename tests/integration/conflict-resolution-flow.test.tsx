import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictProvider } from '../../src/contexts/ConflictContext';
import { DocumentEditor } from '../../src/components/editor/DocumentEditor';
import { MockWebSocket } from '../mocks/MockWebSocket';
import { createMockDocument, simulateConcurrentEdits } from '../helpers/conflict-helpers';

// Mock WebSocket for testing
jest.mock('../../src/services/WebSocketService', () => {
  return {
    createWebSocket: () => new MockWebSocket()
  };
});

describe('Conflict Resolution Integration Flow', () => {
  test('resolves text conflicts correctly with merge strategy', async () => {
    // Create mock document with initial content
    const document = createMockDocument({
      id: 'doc-123',
      content: 'This is a test document for conflict resolution.'
    });
    
    // Simulate concurrent edits that will cause a conflict
    const { localEdit, remoteEdit, expectedConflict } = simulateConcurrentEdits(
      document,
      { position: 10, delete: 5, insert: 'modified' }, // Local edit
      { position: 8, delete: 10, insert: 'completely different' } // Remote edit
    );
    
    // Render the document editor with conflict context
    render(
      <ConflictProvider>
        <DocumentEditor documentId="doc-123" userId="user-1" />
      </ConflictProvider>
    );
    
    // Wait for the editor to initialize
    await screen.findByText('This is a test document for conflict resolution.');
    
    // Apply local edit
    await act(async () => {
      await localEdit.apply();
    });
    
    // Simulate receiving remote edit via WebSocket
    act(() => {
      MockWebSocket.triggerMessage(JSON.stringify({
        type: 'REMOTE_OPERATION',
        documentId: 'doc-123',
        operation: remoteEdit
      }));
    });
    
    // Verify conflict panel is displayed
    const conflictPanel = await screen.findByText('Conflict Detected');
    expect(conflictPanel).toBeInTheDocument();
    
    // Verify token visualization
    const acceptedTokens = screen.getAllByTestId('token-accepted');
    const rejectedTokens = screen.getAllByTestId('token-rejected');
    const conflictedTokens = screen.getAllByTestId('token-conflicted');
    
    expect(acceptedTokens.length).toBeGreaterThan(0);
    expect(conflictedTokens.length).toBeGreaterThan(0);
    
    // Resolve with MERGE strategy
    const mergeButton = screen.getByText('Merge');
    await userEvent.click(mergeButton);
    
    // Verify conflict is resolved and panel is removed
    expect(screen.queryByText('Conflict Detected')).not.toBeInTheDocument();
    
    // Verify merged content is correct
    const expectedContent = document.content.replace(
      expectedConflict.original,
      expectedConflict.resolved
    );
    
    // Wait for the document to update with merged content
    await screen.findByText(expectedContent);
  });
  
  // Additional test cases for other resolution strategies and scenarios
});