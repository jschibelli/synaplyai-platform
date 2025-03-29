module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFiles: ['<rootDir>/jest.setup-env.ts'], // Runs BEFORE Jest environment is set up
  setupFilesAfterEnv: ['<rootDir>/jest.setup-mocks.ts', '<rootDir>/jest.setup-after.ts'], // Run both after files 
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  clearMocks: true,
  resetMocks: true,
  testTimeout: 10000
};
