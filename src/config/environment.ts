/**
 * Environment configuration
 */
export const environment = {
  // WebSocket URL for YJS collaboration
  yjsWebSocketUrl: typeof window !== 'undefined' 
    ? `ws://${window.location.host}/yjs`
    : process.env.YJS_WEBSOCKET_URL || 'ws://localhost:3000/yjs',
    
  // API URL
  apiUrl: typeof window !== 'undefined'
    ? `${window.location.origin}/api`
    : process.env.API_URL || 'http://localhost:3000/api',
  
  // Tenant ID to use when none is provided
  defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
  
  // Flag to enable/disable offline support
  offlineEnabled: process.env.OFFLINE_ENABLED !== 'false',
  
  // Flag to enable/disable metrics collection
  metricsEnabled: process.env.METRICS_ENABLED !== 'false',
  
  // Document garbage collection interval (in ms)
  documentGcInterval: parseInt(process.env.DOCUMENT_GC_INTERVAL || '3600000', 10), // 1 hour
};