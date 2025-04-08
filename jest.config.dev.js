const baseConfig = require('./jest.config.js');

// Create a clean config object without testRegex
const devConfig = { ...baseConfig };

// Remove testRegex if it exists
delete devConfig.testRegex;

// Set our development-specific configuration
// Match both regular tests and dev tests to have something to run
devConfig.testMatch = [
  '**/__tests__/**/*.[jt]s?(x)',
  '**/?(*.)+(spec|test|dev.spec|dev.test).[jt]s?(x)'
];

// Add or update testPathIgnorePatterns
devConfig.testPathIgnorePatterns = [
  ...(baseConfig.testPathIgnorePatterns || []),
  '/node_modules/',
  '/.next/',
  '/tests/integration/'
];

// Add option to pass even with no tests
devConfig.passWithNoTests = true;

module.exports = devConfig;
