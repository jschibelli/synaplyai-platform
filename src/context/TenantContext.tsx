import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Tenant {
  tenantId: string;
  name: string;
  settings?: Record<string, any>;
}

interface TenantContextType {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant | null) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function useTenantContext(): TenantContextType {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenantContext must be used within a TenantProvider');
  }
  return context;
}

interface TenantProviderProps {
  children: ReactNode;
  initialTenant?: Tenant | null;
}

export function TenantProvider({ 
  children, 
  initialTenant = null 
}: TenantProviderProps) {
  const [tenant, setTenant] = useState<Tenant | null>(initialTenant);

  const value = {
    tenant,
    setTenant
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}