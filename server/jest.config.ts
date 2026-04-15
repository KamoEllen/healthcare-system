import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { strict: true } }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/migrations/**',
    '!src/seeds/**',
    '!src/types/**',
    '!src/swagger.ts',
  ],
  coverageThresholds: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  setupFiles: ['<rootDir>/tests/helpers/setup.ts'],
  testTimeout: 30000,
};

export default config;
