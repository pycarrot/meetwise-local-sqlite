import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'server/**/*.test.ts',
      'packages/**/*.test.ts',
      'extension/**/*.test.js',
      'src/**/*.test.tsx'
    ],
    setupFiles: ['./src/test/setup.ts']
  }
});
