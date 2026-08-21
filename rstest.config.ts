import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  extends: withRslibConfig(),
  testEnvironment: 'node',
  coverage: {
    provider: 'v8',
    include: ['src/**/*.ts'],
    thresholds: {
      statements: 80,
      functions: 85,
      branches: 85,
      lines: 80,
    },
  },
});
