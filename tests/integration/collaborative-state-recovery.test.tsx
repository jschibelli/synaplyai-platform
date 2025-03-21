import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { ConflictProvider } from '../../src/contexts/ConflictContext';
import { DocumentEditor } from '../../src/components/editor/DocumentEditor';
import { MockWebSocket } from '../mocks/MockWebSocket';
import { simulateNetworkDisconnection } from '../helpers/network-helpers';

describe('Collaborative State Recovery', () => {
  test('recovers correctly after disconnection with pending conflicts', async () => {
    // Setup and render editor
    render(
      <ConflictProvider>
        <DocumentEditor documentId="doc-123" userId="user-1" />
      </ConflictProvider>
    );
    
    // Simulate conflict detection
    act(() => {
      MockWebSocket.triggerMessage(JSON.stringify({
        type: 'NEW_CONFLICT',
        documentId: 'doc-123',
        conflict: {
          id: 'conflict-1',
          type: 'TEXT_CONFLICT',
          localContent: 'Local content with changes',
          remoteContent: 'Remote content with different changes'
        }
      }));
    });
    
    // Verify conflict panel is displayed
    await screen.findByText('Conflict Detected');
    
    // Simulate network disconnection
    await simulateNetworkDisconnection(MockWebSocket);
    
    // Verify disconnect indication is shown
    await screen.findByText(/reconnecting/i);
    
    // Simulate network reconnection
    act(() => {
      MockWebSocket.simulateReconnection();
    });
    
    // Verify conflict state is recovered
    await screen.findByText('Conflict Detected');
    
    // Complete the test by resolving the conflict and verifying state
  });
});