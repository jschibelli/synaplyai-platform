import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConflictProvider } from '../../src/contexts/ConflictContext';
import { DocumentEditor } from '../../src/components/editor/DocumentEditor';
import { MockWebSocketProvider, MockWebSocket } from '../mocks/MockWebSocket';
import { SessionProvider } from '../../src/contexts/SessionContext';

// Mock WebSocket and Session providers
jest.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: () => MockWebSocket
}));

jest.mock('../../src/hooks/useSession', () => ({
  useSession: () => ({
    user: { id: 'user-1', name: 'Test User' }
  })
}));

describe('ConflictResolution with VectorClock Integration', () => {
  beforeEach(() => {
    // Reset mock WebSocket
    MockWebSocket.reset();
  });

  test('detects and resolves conflicts based on vector clocks', async () => {
    // Render components with necessary providers
    render(
      <SessionProvider>
        <MockWebSocketProvider>
          <ConflictProvider>
            <DocumentEditor documentId="doc-123" />
          </ConflictProvider>
        </MockWebSocketProvider>
      </SessionProvider>
    );

    // Wait for component to initialize
    await screen.findByTestId('document-editor');
    
    // Simulate concurrent edit from another user
    act(() => {
      MockWebSocket.triggerMessage(JSON.stringify({
        type: 'conflict_detected',
        documentId: 'doc-123',
        conflict: {
          id: 'conflict-1',
          type: 'TEXT_CONFLICT',
          localContent: 'Local content version',
          remoteContent: 'Remote content version',
          tokens: [
            { id: 'token-1', text: 'Local', state: 'CONFLICTED' },
            { id: 'token-2', text: 'content', state: 'ACCEPTED' },
            { id: 'token-3', text: 'version', state: 'ACCEPTED' }
          ]
        },
        remoteVectorClock: { 'user-2': 1 }
      }));
    });
    
    // Check if conflict panel appears
    const conflictPanel = await screen.findByText('Conflict Detected');
    expect(conflictPanel).toBeInTheDocument();
    
    // Resolve conflict using the merge strategy
    const mergeButton = screen.getByRole('button', { name: /merge/i });
    fireEvent.click(mergeButton);
    
    // Verify WebSocket message for conflict resolution
    expect(MockWebSocket.messages).toContainEqual(
      expect.objectContaining({
        type: 'conflict_resolved',
        documentId: 'doc-123',
        conflictId: 'conflict-1',
        strategy: 'MERGE'
      })
    );
    
    // Check that the vector clock was included in the resolution message
    const resolutionMessage = MockWebSocket.messages.find(
      msg => msg.type === 'conflict_resolved'
    );
    expect(resolutionMessage.vectorClock).toBeDefined();
    expect(resolutionMessage.vectorClock['user-1']).toBeGreaterThan(0);
    
    // Conflict panel should disappear
    expect(screen.queryByText('Conflict Detected')).not.toBeInTheDocument();
  });
});