import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MockWebSocket, createMockWebSocket } from '../mocks/MockWebSocket';
import { ConflictResolutionProvider } from '../../src/collaboration/ConflictResolutionProvider';
import { DocumentEditor } from '../../src/components/DocumentEditor';
import { createMockDocument } from '../utils/test-helpers';

describe('Conflict Resolution Flow', () => {
  it('should detect and resolve conflicts in real-time', async () => {
    // Setup mock WebSocket connection
    const mockWebSocket = createMockWebSocket();
    
    // Mock document with initial content
    const document = createMockDocument({
      id: 'doc-123',
      content: 'This is a test document for conflict resolution.'
    });
    
    // Render the document editor with conflict resolution
    render(
      <ConflictResolutionProvider websocket={mockWebSocket}>
        <DocumentEditor document={document} />
      </ConflictResolutionProvider>
    );
    
    // Simulate local edit
    fireEvent.input(screen.getByRole('textbox'), { target: { value: 'This is a modified test document for conflict resolution.' } });
    
    // Simulate concurrent remote edit
    mockWebSocket.triggerMessage(JSON.stringify({
      type: 'operation',
      documentId: 'doc-123',
      operation: { position: 8, delete: 10, insert: 'completely different' }
    }));
    
    // Verify conflict detection
    await waitFor(() => {
      expect(screen.getByText(/Conflict detected/i)).toBeInTheDocument();
    });
    
    // Choose to merge changes
    fireEvent.click(screen.getByText(/Merge changes/i));
    
    // Verify merged result
    await waitFor(() => {
      const editor = screen.getByRole('textbox');
      expect(editor.textContent).toContain('completely different');
      expect(editor.textContent).toContain('modified');
    });
  });
});