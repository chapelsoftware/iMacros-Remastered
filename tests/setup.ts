/**
 * Vitest global test setup
 */
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set up any global test configuration
  console.log('Test suite starting...');
});

afterAll(() => {
  // Clean up after all tests
  console.log('Test suite complete.');
});

afterEach(() => {
  // Reset mocks after each test
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// Global test utilities available in all tests
declare global {
  var testHelpers: {
    delay: (ms: number) => Promise<void>;
    randomString: (length?: number) => string;
  };
}

globalThis.testHelpers = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  randomString: (length = 8) => Math.random().toString(36).substring(2, 2 + length),
};
