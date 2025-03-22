module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFiles: ['<rootDir>/jest.setup-env.ts'], // Runs BEFORE Jest environment is set up
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after.ts'], // Runs AFTER Jest is initialized
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  clearMocks: true,
  resetMocks: true,
  testTimeout: 10000
};
