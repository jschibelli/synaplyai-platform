import { TokenStateManager, TokenState, Token } from './TokenStateManager';

// Mock the tenant context and metrics collector
jest.mock('../../lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ tenantId: 'test-tenant-1' })
}));

jest.mock('../../metrics/metrics-collector', () => ({
  metricsCollector: {
    increment: jest.fn(),
    recordValue: jest.fn()
  }
}));

describe('TokenStateManager', () => {
  let manager: TokenStateManager;
  const documentId = 'test-doc-1';
  const userId = 'test-user-1';
  
  beforeEach(() => {
    manager = new TokenStateManager({
      documentId,
      userId
    });
  });
  
  it('should add tokens without conflicts', () => {
    // Arrange
    const token1: Token = {
      id: 'token1',
      text: 'Hello',
      position: 0,
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    const token2: Token = {
      id: 'token2',
      text: 'World',
      position: 6,
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    // Act
    manager.addToken(token1);
    manager.addToken(token2);
    
    // Assert
    expect(manager.getAllTokens().length).toBe(2);
    expect(manager.getToken('token1')).toEqual(token1);
    expect(manager.getToken('token2')).toEqual(token2);
    expect(manager.hasUnresolvedConflicts()).toBe(false);
  });
  
  it('should detect conflicts when tokens are added at the same position', () => {
    // Arrange
    const token1: Token = {
      id: 'token1',
      text: 'Hello',
      position: 0,
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    const token2: Token = {
      id: 'token2',
      text: 'World',
      position: 0, // Same position as token1
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    // Add conflicting tokens
    manager.addToken(token1);
    manager.addToken(token2);
    
    // Assert
    expect(manager.hasUnresolvedConflicts()).toBe(true);
    expect(manager.getConflictingTokens().length).toBe(2);
    
    // Check that token states are updated to CONFLICT
    const updatedToken1 = manager.getToken('token1');
    const updatedToken2 = manager.getToken('token2');
    
    expect(updatedToken1?.metadata.state).toBe(TokenState.CONFLICT);
    expect(updatedToken2?.metadata.state).toBe(TokenState.CONFLICT);
    
    // Check that conflict IDs are correctly set
    expect(updatedToken1?.metadata.conflictIds).toContain('token2');
    expect(updatedToken2?.metadata.conflictIds).toContain('token1');
  });
  
  it('should resolve conflicts when accepting a token', () => {
    // Arrange - set up a conflict
    const token1: Token = {
      id: 'token1',
      text: 'Hello',
      position: 0,
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    const token2: Token = {
      id: 'token2',
      text: 'World',
      position: 0,
      length: 5,
      metadata: { state: TokenState.DEFAULT }
    };
    
    manager.addToken(token1);
    manager.addToken(token2);
    
    // Act - resolve by accepting token1
    manager.updateTokenState('token1', TokenState.ACCEPTED);
    
    // Assert
    expect(manager.hasUnresolvedConflicts()).toBe(false);
    
    // Check updated states
    const updatedToken1 = manager.getToken('token1');
    const updatedToken2 = manager.getToken('token2');
    
    expect(updatedToken1?.metadata.state).toBe(TokenState.ACCEPTED);
    expect(updatedToken2?.metadata.state).toBe(TokenState.REJECTED);
    
    // Conflict IDs should be cleared
    expect(updatedToken1?.metadata.conflictIds?.length).toBe(0);
  });
});