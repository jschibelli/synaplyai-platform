import '../styles/globals.css';
// Let's make the collaborative-editor.css import conditional in case the file isn't there yet
try {
  require('../styles/collaborative-editor.css');
} catch (e) {
  console.warn('Collaborative editor styles not found - continuing without them');
}

import type { AppProps } from 'next/app';
// Instead of importing the TenantProvider which doesn't exist yet, let's create a simple version
import React, { createContext } from 'react';

// Simple TenantContext implementation for beta
const TenantContext = createContext({
  tenantId: 'default',
  name: 'Default Tenant'
});

const TenantProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <TenantContext.Provider value={{ tenantId: 'default', name: 'Default Tenant' }}>
      {children}
    </TenantContext.Provider>
  );
};

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TenantProvider>
      <Component {...pageProps} />
    </TenantProvider>
  );
}

export default MyApp;