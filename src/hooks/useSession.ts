export interface User {
  id: string;
  name: string;
}

export function useSession() {
  return {
    user: { id: 'user-1', name: 'Test User' }
  };
}