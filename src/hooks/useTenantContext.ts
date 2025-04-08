import { createContext } from 'react';

// Define the context type
export interface TenantContextType {
  tenantId: string;
  organizationName?: string;
  subscription?: {
    plan: string;
    status: string;
  };
}

// Create context with default values
export const TenantContext = createContext<TenantContextType>({
  tenantId: 'demo-tenant-123',
});

// Hook to use the tenant context
export function useTenantContext() {
  // Simple implementation until the full context is ready
  return {
    tenantId: 'default',
    name: 'Default Tenant'
  };
}