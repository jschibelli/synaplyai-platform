const fs = require('fs');
const path = require('path');

// Directories
const ROOT_MOCKS_DIR = path.join(__dirname, '__mocks__');
const SRC_MOCKS_DIR = path.join(__dirname, 'src', '__mocks__');

// Ensure directories exist
if (!fs.existsSync(ROOT_MOCKS_DIR)) {
  fs.mkdirSync(ROOT_MOCKS_DIR, { recursive: true });
  console.log(`Created root mocks directory: ${ROOT_MOCKS_DIR}`);
}

if (!fs.existsSync(SRC_MOCKS_DIR)) {
  fs.mkdirSync(SRC_MOCKS_DIR, { recursive: true });
  console.log(`Created src mocks directory: ${SRC_MOCKS_DIR}`);
}

// Template for tenant-context.mock.ts
const tenantContextMock = `import { jest } from '@jest/globals';

/**
 * Tenant context mock implementation
 */

let currentContext = {
  tenantId: 'mock-tenant',
  userId: 'mock-user',
  features: {
    enableAI: true,
    enableCollaboration: true,
    maxDocuments: 100
  }
};

export const getTenantContextMock = jest.fn().mockImplementation(() => {
  return currentContext;
});

export const setTenantContextMock = jest.fn().mockImplementation((context) => {
  currentContext = { ...currentContext, ...context };
  return currentContext;
});

export const clearTenantContextMock = jest.fn().mockImplementation(() => {
  currentContext = {
    tenantId: 'mock-tenant',
    userId: 'mock-user',
    features: {
      enableAI: true,
      enableCollaboration: true,
      maxDocuments: 100
    }
  };
});

export default {
  getTenantContextMock,
  setTenantContextMock, 
  clearTenantContextMock
};`;

// Template for websocket.mock.ts
const websocketMock = `/**
 * Mock WebSocket implementation for testing
 */
export class MockWebSocket {
  listeners: Record<string, Function[]> = {};
  messages: any[] = [];

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string): void {
    delete this.listeners[event];
  }

  emit(event: string, data: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
    this.messages.push({ event, data });
  }

  triggerMessage(message: string): void {
    if (this.listeners['message']) {
      this.listeners['message'].forEach(callback => callback({ data: message }));
    }
  }

  reset(): void {
    this.listeners = {};
    this.messages = [];
  }

  simulateReconnection(): void {
    if (this.listeners['reconnect']) {
      this.listeners['reconnect'].forEach(callback => callback());
    }
  }
}

export default MockWebSocket;`;

// Template for circuit-breaker.mock.ts
const circuitBreakerMock = `import { jest } from '@jest/globals';
import { CircuitState } from '../src/lib/circuit-breaker';

/**
 * Interface for the circuit breaker mock
 */
export interface MockCircuitBreaker {
  execute: ReturnType<typeof jest.fn>;
  getState: ReturnType<typeof jest.fn>;
  setState?: ReturnType<typeof jest.fn>;
  incrementFailures?: ReturnType<typeof jest.fn>;
  incrementSuccesses?: ReturnType<typeof jest.fn>;
  resetCounters?: ReturnType<typeof jest.fn>;
  isOpen?: ReturnType<typeof jest.fn>;
  isClosed?: ReturnType<typeof jest.fn>;
  isHalfOpen?: ReturnType<typeof jest.fn>;
  openCircuit?: ReturnType<typeof jest.fn>;
  closeCircuit?: ReturnType<typeof jest.fn>;
  halfOpenCircuit?: ReturnType<typeof jest.fn>;
  getFailureCount?: ReturnType<typeof jest.fn>;
  getSuccessCount?: ReturnType<typeof jest.fn>;
  transitionState?: ReturnType<typeof jest.fn>;
  recordFailure: ReturnType<typeof jest.fn>;
  recordSuccess: ReturnType<typeof jest.fn>;
  shouldAttemptReset: ReturnType<typeof jest.fn>;
}

/**
 * Creates a mock circuit breaker for testing
 */
export function createCircuitBreakerMock(): MockCircuitBreaker {
  return {
    // Fix: Properly type function parameter
    execute: jest.fn().mockImplementation((fn: () => any) => {
      return Promise.resolve(fn());
    }),
    getState: jest.fn().mockReturnValue(CircuitState.CLOSED),
    setState: jest.fn(),
    incrementFailures: jest.fn(),
    incrementSuccesses: jest.fn(),
    resetCounters: jest.fn(),
    isOpen: jest.fn().mockReturnValue(false),
    isClosed: jest.fn().mockReturnValue(true),
    isHalfOpen: jest.fn().mockReturnValue(false),
    openCircuit: jest.fn(),
    closeCircuit: jest.fn(),
    halfOpenCircuit: jest.fn(),
    getFailureCount: jest.fn().mockReturnValue(0),
    getSuccessCount: jest.fn().mockReturnValue(0),
    transitionState: jest.fn(),
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
    shouldAttemptReset: jest.fn().mockReturnValue(false)
  };
}

// Export a singleton instance
export const circuitBreakerMock = createCircuitBreakerMock();

export default circuitBreakerMock;`;

// Template for metrics-collector.mock.ts
const metricsCollectorMock = `import { jest } from '@jest/globals';

/**
 * Interface for the metrics collector mock
 */
export interface MetricsCollectorMock {
  metrics: any;
  redisClient: any;
  increment: ReturnType<typeof jest.fn>;
  recordLatency: ReturnType<typeof jest.fn>;
  incrementCounter: ReturnType<typeof jest.fn>;
  decrementCounter: ReturnType<typeof jest.fn>;
  getCounter: ReturnType<typeof jest.fn>;
  recordValue: ReturnType<typeof jest.fn>;
  getAverageValue: ReturnType<typeof jest.fn>;
  getCountValue: ReturnType<typeof jest.fn>;
  formatKey: ReturnType<typeof jest.fn>;
  track: ReturnType<typeof jest.fn>;
  setCircuitBreakerState: ReturnType<typeof jest.fn>;
  getCircuitBreakerState: ReturnType<typeof jest.fn>;
  incrementCircuitBreakerFailures: ReturnType<typeof jest.fn>;
  incrementCircuitBreakerRejections: ReturnType<typeof jest.fn>;
  getFilterResultCounts: ReturnType<typeof jest.fn>;
  getPercentileLatency: ReturnType<typeof jest.fn>;
  getPipelineLatency: ReturnType<typeof jest.fn>;
}

/**
 * Creates a mock metrics collector for testing
 */
export function createMetricsCollectorMock(): MetricsCollectorMock {
  return {
    metrics: {},
    redisClient: {} as any,
    increment: jest.fn().mockResolvedValue(undefined),
    recordLatency: jest.fn().mockResolvedValue(undefined),
    incrementCounter: jest.fn().mockResolvedValue(undefined),
    decrementCounter: jest.fn().mockResolvedValue(undefined),
    getCounter: jest.fn().mockResolvedValue(0),
    recordValue: jest.fn().mockResolvedValue(undefined),
    getAverageValue: jest.fn().mockResolvedValue(0),
    getCountValue: jest.fn().mockResolvedValue(0),
    formatKey: jest.fn().mockReturnValue('formatted-key'),
    track: jest.fn().mockResolvedValue(undefined),
    setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
    getCircuitBreakerState: jest.fn().mockResolvedValue('CLOSED'),
    incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
    incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
    getFilterResultCounts: jest.fn().mockResolvedValue({}),
    getPercentileLatency: jest.fn().mockResolvedValue(0),
    getPipelineLatency: jest.fn().mockResolvedValue(0)
  };
}

// Create a singleton instance for direct imports
export const metricsCollectorMock = createMetricsCollectorMock();

export default metricsCollectorMock;`;

// Template for prisma.mock.ts if it doesn't exist
const prismaMock = `/**
 * Mock implementation of Prisma client for testing
 */
const prisma = {
  snapshot: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    update: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    count: jest.fn().mockResolvedValue(0)
  },
  document: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    update: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    count: jest.fn().mockResolvedValue(0)
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    update: jest.fn().mockImplementation(data => Promise.resolve({ id: 'mock-id', ...data.data })),
    delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    count: jest.fn().mockResolvedValue(0)
  },
  $connect: jest.fn(),
  $disconnect: jest.fn()
};

export default prisma;`;

// Template for re-export files
const reExportTemplate = (filename) => `/**
 * Re-export from root __mocks__ directory
 * This file ensures backward compatibility while maintaining a single source of truth
 */
export * from '../../__mocks__/${filename}';
export { default } from '../../__mocks__/${filename}';
`;

// List of mock files to create/update
const mockFiles = [
  { name: 'tenant-context.mock.ts', content: tenantContextMock },
  { name: 'websocket.mock.ts', content: websocketMock },
  { name: 'circuit-breaker.mock.ts', content: circuitBreakerMock },
  { name: 'metrics-collector.mock.ts', content: metricsCollectorMock },
  { name: 'prisma.mock.ts', content: prismaMock }
];

// Create or update root mock files
mockFiles.forEach(file => {
  const filePath = path.join(ROOT_MOCKS_DIR, file.name);
  
  // Check if file already exists
  if (fs.existsSync(filePath)) {
    const existingContent = fs.readFileSync(filePath, 'utf8');
    // Only overwrite if instructed or if it's a new file that doesn't match our template
    if (process.argv.includes('--force')) {
      fs.writeFileSync(filePath, file.content);
      console.log(`Updated existing file: ${filePath}`);
    } else {
      console.log(`Keeping existing file: ${filePath}`);
    }
  } else {
    // Create new file
    fs.writeFileSync(filePath, file.content);
    console.log(`Created new file: ${filePath}`);
  }
  
  // Create re-export file in src/__mocks__
  const srcReExportPath = path.join(SRC_MOCKS_DIR, file.name);
  fs.writeFileSync(srcReExportPath, reExportTemplate(file.name));
  console.log(`Created/updated re-export: ${srcReExportPath}`);
});

// Update jest.setup-mocks.ts to use tenant-context mocks
const jestSetupPath = path.join(__dirname, 'jest.setup-mocks.ts');
if (fs.existsSync(jestSetupPath)) {
  let jestSetupContent = fs.readFileSync(jestSetupPath, 'utf8');
  
  // Check if we need to add exports for tenant context
  if (!jestSetupContent.includes('getTenantContextMock,')) {
    // Add tenant context exports 
    const exportRegex = /export {([^}]*)}/;
    const exportMatch = jestSetupContent.match(exportRegex);
    
    if (exportMatch) {
      const newExports = exportMatch[1] + ',\n  getTenantContextMock,\n  setTenantContextMock,\n  clearTenantContextMock';
      jestSetupContent = jestSetupContent.replace(exportRegex, `export {${newExports}}`);
    }
    
    // Add tenant context globals
    const globalDeclarationRegex = /declare global {([^}]*)}/s;
    const globalMatch = jestSetupContent.match(globalDeclarationRegex);
    
    if (globalMatch) {
      const newGlobals = globalMatch[1] + '\n  var tenantContext: {\n    getTenantContext: typeof getTenantContextMock;\n    setTenantContext: typeof setTenantContextMock;\n    clearTenantContext: typeof clearTenantContextMock;\n  };\n';
      jestSetupContent = jestSetupContent.replace(globalDeclarationRegex, `declare global {${newGlobals}}`);
    }
    
    // Add global assignments for tenant context
    const globalAssignmentRegex = /(global\.MockWebSocket = MockWebSocket;)\s*/;
    const newGlobalAssignment = `$1\n\n// Set up tenant context globals\nglobal.tenantContext = {\n  getTenantContext: getTenantContextMock,\n  setTenantContext: setTenantContextMock,\n  clearTenantContext: clearTenantContextMock\n};\n`;
    jestSetupContent = jestSetupContent.replace(globalAssignmentRegex, newGlobalAssignment);
    
    // Save updated file
    fs.writeFileSync(jestSetupPath, jestSetupContent);
    console.log(`Updated: ${jestSetupPath}`);
  } else {
    console.log(`No changes needed for: ${jestSetupPath}`);
  }
} else {
  console.error(`Error: ${jestSetupPath} not found!`);
}

console.log('\nMock standardization complete!');
console.log('\nNext steps:');
console.log('1. Run your tests to verify the fixes');
console.log('2. Consider deleting duplicate mock implementations in src/__mocks__ (not the re-export files)');
console.log('3. Update other test files to import from the root __mocks__ directory when possible');