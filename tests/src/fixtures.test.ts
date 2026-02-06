/**
 * Tests for the fixture server
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDefaultFixtureServer, type FixtureServer } from '../fixtures';

describe('Fixture Server', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = createDefaultFixtureServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should start and provide a URL', () => {
    expect(server.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(server.port).toBeGreaterThan(0);
  });

  it('should serve default test page', async () => {
    const response = await fetch(server.url);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Test Page</title>');
    expect(html).toContain('id="test-form"');
  });

  it('should handle echo endpoint', async () => {
    const response = await fetch(`${server.url}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.method).toBe('POST');
    expect(data.body).toContain('test');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await fetch(`${server.url}/unknown`);
    expect(response.status).toBe(404);
  });
});
