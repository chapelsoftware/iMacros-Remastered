/**
 * Tests for native-host/src/services/print-service.ts
 *
 * Tests the PrintService class covering:
 * - ONPRINT configuration (shouldPrint, setOnPrintConfig)
 * - PDF generation from URL and HTML (mocked Puppeteer)
 * - PDF buffer generation
 * - Printer integration (mocked system commands)
 * - Header/footer template generation
 * - Singleton management (getPrintService, closePrintService)
 * - toPuppeteerOptions conversion
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ──── Puppeteer mock ──────────────────────────────────────────────────────────

const mockPdf = vi.fn();
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockSetContent = vi.fn().mockResolvedValue(undefined);
const mockPageClose = vi.fn().mockResolvedValue(undefined);
const mockNewPage = vi.fn().mockResolvedValue({
  goto: mockGoto,
  setContent: mockSetContent,
  pdf: mockPdf,
  close: mockPageClose,
});
const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
const mockLaunch = vi.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockBrowserClose,
});

vi.mock('puppeteer', () => ({
  default: { launch: (...args: any[]) => mockLaunch(...args) },
  launch: (...args: any[]) => mockLaunch(...args),
}));

import {
  PrintService,
  getPrintService,
  closePrintService,
} from '../../native-host/src/services/print-service';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imacros-print-test-'));
  vi.clearAllMocks();
  // Make pdf mock write the file when path is set
  mockPdf.mockImplementation(async (opts: any) => {
    const buf = Buffer.from('%PDF-1.4 mock content');
    if (opts?.path) {
      const dir = path.dirname(opts.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(opts.path, buf);
    }
    return buf;
  });
});

afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  await closePrintService();
});

// =====================================================================
// ONPRINT Configuration
// =====================================================================
describe('PrintService - ONPRINT configuration', () => {
  it('should default to printing allowed (shouldPrint=true)', () => {
    const service = new PrintService();
    expect(service.shouldPrint()).toBe(true);
  });

  it('should return default config', () => {
    const service = new PrintService();
    const config = service.getOnPrintConfig();
    expect(config.button).toBe('OK');
    expect(config.active).toBe(false);
  });

  it('should allow printing when ONPRINT button=OK', () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'OK', active: true });
    expect(service.shouldPrint()).toBe(true);
  });

  it('should block printing when ONPRINT button=CANCEL', () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    expect(service.shouldPrint()).toBe(false);
  });

  it('should allow printing when config is inactive regardless of button', () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: false });
    expect(service.shouldPrint()).toBe(true);
  });
});

// =====================================================================
// PDF Generation from URL
// =====================================================================
describe('PrintService - generatePdfFromUrl', () => {
  it('should generate PDF from URL', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'output.pdf');
    const result = await service.generatePdfFromUrl('https://example.com', outputPath);

    expect(result.success).toBe(true);
    expect(result.pdfPath).toBe(outputPath);
    expect(result.pdfSize).toBeGreaterThan(0);
    expect(mockGoto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
  });

  it('should pass waitForNetworkIdle option', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'network.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      waitForNetworkIdle: true,
    });

    expect(mockGoto).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        waitUntil: ['load', 'networkidle0'],
      }),
    );
  });

  it('should create output directory if it does not exist', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'newdir', 'deep', 'output.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath);

    expect(fs.existsSync(path.dirname(outputPath))).toBe(true);
  });

  it('should cancel when ONPRINT button=CANCEL', async () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    const result = await service.generatePdfFromUrl('https://example.com', path.join(tmpDir, 'x.pdf'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('CANCEL');
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it('should handle navigation errors gracefully', async () => {
    const service = new PrintService();
    mockGoto.mockRejectedValueOnce(new Error('navigation failed'));
    const result = await service.generatePdfFromUrl('https://bad.url', path.join(tmpDir, 'err.pdf'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('navigation failed');
  });

  it('should pass format and orientation options', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'opts.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      format: 'A4',
      orientation: 'landscape',
      printBackground: true,
      scale: 0.8,
    });

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'A4',
        landscape: true,
        printBackground: true,
        scale: 0.8,
      }),
    );
  });

  it('should pass margin options', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'margin.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      margin: { top: '1in', right: '0.5in', bottom: '1in', left: '0.5in' },
    });

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        margin: {
          top: '1in',
          right: '0.5in',
          bottom: '1in',
          left: '0.5in',
        },
      }),
    );
  });

  it('should pass page ranges', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'pages.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      pageRanges: '1-3',
    });

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ pageRanges: '1-3' }),
    );
  });

  it('should pass header/footer options', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'headers.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      headerFooter: {
        displayHeaderFooter: true,
        headerTemplate: '<h1>Header</h1>',
        footerTemplate: '<p>Footer</p>',
      },
    });

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        displayHeaderFooter: true,
        headerTemplate: '<h1>Header</h1>',
        footerTemplate: '<p>Footer</p>',
      }),
    );
  });

  it('should pass custom width/height options', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'custom.pdf');
    await service.generatePdfFromUrl('https://example.com', outputPath, {
      width: '800px',
      height: '600px',
    });

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        width: '800px',
        height: '600px',
      }),
    );
  });
});

// =====================================================================
// PDF Generation from HTML
// =====================================================================
describe('PrintService - generatePdfFromHtml', () => {
  it('should generate PDF from HTML content', async () => {
    const service = new PrintService();
    const outputPath = path.join(tmpDir, 'html.pdf');
    const result = await service.generatePdfFromHtml(
      '<html><body><h1>Test</h1></body></html>',
      outputPath,
    );

    expect(result.success).toBe(true);
    expect(result.pdfPath).toBe(outputPath);
    expect(mockSetContent).toHaveBeenCalledWith(
      '<html><body><h1>Test</h1></body></html>',
      expect.any(Object),
    );
  });

  it('should cancel when ONPRINT button=CANCEL', async () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    const result = await service.generatePdfFromHtml('<html></html>', path.join(tmpDir, 'x.pdf'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('CANCEL');
  });

  it('should handle setContent errors', async () => {
    const service = new PrintService();
    mockSetContent.mockRejectedValueOnce(new Error('invalid html'));
    const result = await service.generatePdfFromHtml('bad', path.join(tmpDir, 'e.pdf'));

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid html');
  });
});

// =====================================================================
// PDF Buffer Generation
// =====================================================================
describe('PrintService - generatePdfBufferFromUrl', () => {
  it('should return a buffer', async () => {
    const service = new PrintService();
    const result = await service.generatePdfBufferFromUrl('https://example.com');
    expect(result.buffer).not.toBeNull();
    expect(Buffer.isBuffer(result.buffer!)).toBe(true);
  });

  it('should cancel when ONPRINT CANCEL', async () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    const result = await service.generatePdfBufferFromUrl('https://example.com');
    expect(result.buffer).toBeNull();
    expect(result.error).toContain('CANCEL');
  });

  it('should handle navigation errors', async () => {
    const service = new PrintService();
    mockGoto.mockRejectedValueOnce(new Error('timeout'));
    const result = await service.generatePdfBufferFromUrl('https://slow.site');
    expect(result.buffer).toBeNull();
    expect(result.error).toContain('timeout');
  });
});

describe('PrintService - generatePdfBufferFromHtml', () => {
  it('should return a buffer from HTML', async () => {
    const service = new PrintService();
    const result = await service.generatePdfBufferFromHtml('<h1>Hello</h1>');
    expect(result.buffer).not.toBeNull();
    expect(Buffer.isBuffer(result.buffer!)).toBe(true);
  });

  it('should cancel when ONPRINT CANCEL', async () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    const result = await service.generatePdfBufferFromHtml('<h1>Hello</h1>');
    expect(result.buffer).toBeNull();
  });
});

// =====================================================================
// Print to Printer
// =====================================================================
describe('PrintService - printToPrinter', () => {
  it('should cancel when ONPRINT CANCEL', async () => {
    const service = new PrintService();
    service.setOnPrintConfig({ button: 'CANCEL', active: true });
    const result = await service.printToPrinter('<html></html>', true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('CANCEL');
  });
});

// =====================================================================
// Static Template Helpers
// =====================================================================
describe('PrintService - createHeaderTemplate', () => {
  it('should create header with defaults', () => {
    const html = PrintService.createHeaderTemplate();
    expect(html).toContain('date');
    expect(html).toContain('title');
  });

  it('should show URL when requested', () => {
    const html = PrintService.createHeaderTemplate({ showUrl: true });
    expect(html).toContain('url');
  });

  it('should exclude date when showDate=false', () => {
    const html = PrintService.createHeaderTemplate({ showDate: false });
    expect(html).not.toContain('class="date"');
  });

  it('should exclude title when showTitle=false', () => {
    const html = PrintService.createHeaderTemplate({ showTitle: false });
    expect(html).not.toContain('class="title"');
  });

  it('should use custom fontSize', () => {
    const html = PrintService.createHeaderTemplate({ fontSize: '14px' });
    expect(html).toContain('14px');
  });
});

describe('PrintService - createFooterTemplate', () => {
  it('should create footer with page numbers by default', () => {
    const html = PrintService.createFooterTemplate();
    expect(html).toContain('pageNumber');
    expect(html).toContain('totalPages');
  });

  it('should exclude page numbers when showPageNumbers=false', () => {
    const html = PrintService.createFooterTemplate({ showPageNumbers: false });
    expect(html).not.toContain('pageNumber');
  });

  it('should show date when requested', () => {
    const html = PrintService.createFooterTemplate({ showDate: true });
    expect(html).toContain('date');
  });

  it('should show URL when requested', () => {
    const html = PrintService.createFooterTemplate({ showUrl: true });
    expect(html).toContain('url');
  });

  it('should use custom fontSize', () => {
    const html = PrintService.createFooterTemplate({ fontSize: '8px' });
    expect(html).toContain('8px');
  });
});

// =====================================================================
// Singleton Management
// =====================================================================
describe('PrintService - singleton', () => {
  it('should return same instance from getPrintService', () => {
    const a = getPrintService();
    const b = getPrintService();
    expect(a).toBe(b);
  });

  it('should close and clear singleton', async () => {
    const instance = getPrintService();
    await closePrintService();
    // After closing, a new call should create a new instance
    const newInstance = getPrintService();
    expect(newInstance).not.toBe(instance);
  });

  it('should handle closePrintService when no instance exists', async () => {
    await closePrintService(); // Should not throw
    await closePrintService(); // Double close should also not throw
  });
});

// =====================================================================
// Browser lifecycle
// =====================================================================
describe('PrintService - close', () => {
  it('should close browser and reset', async () => {
    const service = new PrintService();
    // Generate a PDF to ensure browser is launched
    await service.generatePdfFromUrl('https://example.com', path.join(tmpDir, 'close.pdf'));
    expect(mockLaunch).toHaveBeenCalledTimes(1);

    await service.close();
    expect(mockBrowserClose).toHaveBeenCalledTimes(1);

    // Generating another PDF should launch a new browser
    await service.generatePdfFromUrl('https://example.com', path.join(tmpDir, 'close2.pdf'));
    expect(mockLaunch).toHaveBeenCalledTimes(2);
  });

  it('should not throw when closing without browser', async () => {
    const service = new PrintService();
    await service.close(); // No browser launched
  });
});
