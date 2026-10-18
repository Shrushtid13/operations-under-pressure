// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    fileParallelism: false, // Prevent concurrent test files from truncating the shared database
    sequence: {
      concurrent: false
    }
  }
});
