/**
 * Simple HTTP fixture server for E2E tests
 */
import http from 'http';
import path from 'path';
import fs from 'fs';

const FIXTURES_DIR = path.dirname(__filename);

export interface FixtureServerOptions {
  port?: number;
  host?: string;
}

export interface FixtureServer {
  url: string;
  port: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addRoute: (path: string, handler: RouteHandler) => void;
  addFixture: (urlPath: string, filePath: string, contentType?: string) => void;
}

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void | Promise<void>;

/**
 * Create a fixture server for testing
 */
export function createFixtureServer(options: FixtureServerOptions = {}): FixtureServer {
  const { port = 0, host = 'localhost' } = options;

  let server: http.Server | null = null;
  let actualPort = port;
  const routes = new Map<string, RouteHandler>();

  const handleRequest: http.RequestListener = async (req, res) => {
    const urlPath = req.url || '/';
    const handler = routes.get(urlPath);

    if (handler) {
      try {
        await handler(req, res);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  };

  return {
    get url() {
      return `http://${host}:${actualPort}`;
    },
    get port() {
      return actualPort;
    },
    async start() {
      return new Promise((resolve, reject) => {
        server = http.createServer(handleRequest);
        server.listen(port, host, () => {
          const address = server!.address();
          if (address && typeof address === 'object') {
            actualPort = address.port;
          }
          resolve();
        });
        server.on('error', reject);
      });
    },
    async stop() {
      return new Promise((resolve, reject) => {
        if (server) {
          server.close(err => {
            if (err) reject(err);
            else resolve();
          });
          server = null;
        } else {
          resolve();
        }
      });
    },
    addRoute(urlPath: string, handler: RouteHandler) {
      routes.set(urlPath, handler);
    },
    addFixture(urlPath: string, filePath: string, contentType?: string) {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(FIXTURES_DIR, filePath);

      routes.set(urlPath, (_req, res) => {
        try {
          const content = fs.readFileSync(fullPath);
          const type = contentType || getMimeType(filePath);
          res.writeHead(200, { 'Content-Type': type });
          res.end(content);
        } catch (error) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Fixture not found');
        }
      });
    },
  };
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Default test page HTML
 */
export const DEFAULT_TEST_PAGE = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta charset="utf-8">
</head>
<body>
  <h1 id="title">Test Page</h1>
  <form id="test-form">
    <input type="text" id="text-input" name="text" />
    <input type="password" id="password-input" name="password" />
    <select id="select-input" name="select">
      <option value="1">Option 1</option>
      <option value="2">Option 2</option>
      <option value="3">Option 3</option>
    </select>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', function(e) {
      e.preventDefault();
      document.getElementById('result').textContent = 'Form submitted';
    });
  </script>
</body>
</html>`;

/**
 * Create a pre-configured fixture server with default routes
 */
export function createDefaultFixtureServer(port?: number): FixtureServer {
  const server = createFixtureServer({ port });

  // Add default test page
  server.addRoute('/', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DEFAULT_TEST_PAGE);
  });

  // Add echo endpoint for API testing
  server.addRoute('/echo', async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    }));
  });

  // Add delay endpoint for testing timeouts
  server.addRoute('/delay', async (_req, res) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Delayed response');
  });

  return server;
}
