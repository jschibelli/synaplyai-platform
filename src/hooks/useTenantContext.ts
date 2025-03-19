import { createContext, useContext } from 'react';

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
export const useTenantContext = () => {
  return useContext(TenantContext);
};