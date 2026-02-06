/**
 * Extension entry point for Chrome/Firefox extension
 */
import { RequestMessage, ResponseMessage, createMessageId, createTimestamp } from '@shared/index';

/**
 * Send a message to the native host
 */
export function sendMessage(type: 'ping' | 'execute', payload?: unknown): RequestMessage {
  return {
    type,
    id: createMessageId(),
    timestamp: createTimestamp(),
    payload,
  };
}

/**
 * Process response from native host
 */
export function processResponse(response: ResponseMessage): void {
  if (response.type === 'error') {
    console.error('Native host error:', response.error);
    return;
  }

  console.log('Response received:', response.type, response.payload);
}
