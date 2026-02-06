/**
 * Tests for shared types and utilities
 */
import { describe, it, expect } from 'vitest';
import { createMessageId, createTimestamp, Message } from '@shared/index';

describe('Shared utilities', () => {
  it('should create unique message IDs', () => {
    const id1 = createMessageId();
    const id2 = createMessageId();
    expect(id1).not.toBe(id2);
  });

  it('should create valid timestamps', () => {
    const before = Date.now();
    const timestamp = createTimestamp();
    const after = Date.now();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('should type check messages correctly', () => {
    const message: Message = {
      type: 'ping',
      id: createMessageId(),
      timestamp: createTimestamp(),
    };
    expect(message.type).toBe('ping');
  });
});
