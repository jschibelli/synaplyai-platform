// filepath: d:\ai-dev-projects\ai-create-assistant\src\tests\integration\ConflictResolutionIntegration.test.tsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictProvider } from '../../contexts/ConflictContext';
import { DocumentEditor } from '../../components/editor/DocumentEditor';
import { MockWebSocket } from '../mocks/MockWebSocket';

// Mock the WebSocket
jest.mock('../../services/WebSocketService', () => {
  return {
    createWebSocket: () => new MockWebSocket()
  };
});

describe('Conflict Resolution Integration', () => {
  test('resolves conflicts correctly with backend', async () => {
    // Setup mock conflict data
    const mockConflict = {
      id: 'conflict-123',
      type: 'TEXT_CONFLICT',
      localContent: 'Local content with changes',
      remoteContent: 'Remote content with different changes',
      timestamp: Date.now()
    };

    // Render document editor with conflict context
    render(
      <ConflictProvider>
        <DocumentEditor documentId="doc-123" userId="user-1" />
      </ConflictProvider>
    );

    // Simulate conflict notification from WebSocket
    act(() => {
      MockWebSocket.triggerMessage(JSON.stringify({
        type: 'NEW_CONFLICT',
        documentId: 'doc-123',
        conflict: mockConflict
      }));
    });

    // Verify conflict panel is displayed
    expect(await screen.findByText('Conflict Detected')).toBeInTheDocument();

    // Resolve conflict with merge strategy
    const mergeButton = screen.getByText('Merge');
    await userEvent.click(mergeButton);

    // Verify resolution was sent to backend
    expect(MockWebSocket.sentMessages).toContainEqual(
      expect.objectContaining({
        type: 'RESOLVE_CONFLICT',
        conflictId: 'conflict-123',
        strategy: 'MERGE'
      })
    );

    // Verify conflict panel is removed after resolution
    expect(screen.queryByText('Conflict Detected')).not.toBeInTheDocument();
  });
});