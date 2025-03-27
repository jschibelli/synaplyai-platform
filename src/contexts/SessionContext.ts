import React, { createContext, useContext } from 'react';

interface SessionContextType {
  user: { id: string; name: string };
  isAuthenticated: boolean;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

const SessionContext = createContext<SessionContextType>({
  user: { id: '', name: '' },
  isAuthenticated: false,
  status: 'loading'
});

export const useSession = () => useContext(SessionContext);

export const SessionProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <SessionContext.Provider value={{
      user: { id: 'test-user', name: 'Test User' },
      isAuthenticated: true,
      status: 'authenticated'
    }}>
      {children}
    </SessionContext.Provider>
  );
};

export class SessionContext {
  sessionId: string;
  userId: string;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }
}