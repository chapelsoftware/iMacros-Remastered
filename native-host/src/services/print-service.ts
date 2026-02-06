/**
 * Print Service for iMacros Native Host
 *
 * Uses Puppeteer to render pages and generate PDFs or print to physical printers.
 * Integrates with the ONPRINT command configuration for print settings.
 */
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Paper format options matching standard paper sizes
 */
export type PaperFormat =
  | 'Letter'
  | 'Legal'
  | 'Tabloid'
  | 'Ledger'
  | 'A0'
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6';

/**
 * Page orientation
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * Margin configuration
 */
export interface MarginOptions {
  /** Top margin (e.g., '1in', '25mm', '100px') */
  top?: string;
  /** Right margin */
  right?: string;
  /** Bottom margin */
  bottom?: string;
  /** Left margin */
  left?: string;
}

/**
 * Header/Footer template configuration
 */
export interface HeaderFooterOptions {
  /** Display header and footer */
  displayHeaderFooter?: boolean;
  /** HTML template for the header. Supports: date, title, url, pageNumber, totalPages */
  headerTemplate?: string;
  /** HTML template for the footer. Supports: date, title, url, pageNumber, totalPages */
  footerTemplate?: string;
}

/**
 * Print configuration options
 */
export interface PrintOptions {
  /** Paper format (default: 'Letter') */
  format?: PaperFormat;
  /** Custom page width (overrides format) */
  width?: string | number;
  /** Custom page height (overrides format) */
  height?: string | number;
  /** Page orientation (default: 'portrait') */
  orientation?: Orientation;
  /** Page margins */
  margin?: MarginOptions;
  /** Print background graphics (default: true) */
  printBackground?: boolean;
  /** Scale of the webpage rendering (default: 1) */
  scale?: number;
  /** Page ranges to print (e.g., '1-5, 8, 11-13') */
  pageRanges?: string;
  /** Header/footer configuration */
  headerFooter?: HeaderFooterOptions;
  /** Prefer CSS page size (default: false) */
  preferCSSPageSize?: boolean;
  /** Wait for network idle before printing */
  waitForNetworkIdle?: boolean;
  /** Additional wait time in ms after page load */
  waitAfterLoad?: number;
}

/**
 * Options for printing to a physical printer
 */
export interface PrinterOptions extends PrintOptions {
  /** Printer name (system default if not specified) */
  printerName?: string;
  /** Number of copies (default: 1) */
  copies?: number;
  /** Collate copies (default: true) */
  collate?: boolean;
  /** Print in color or grayscale */
  color?: boolean;
  /** Duplex printing mode */
  duplex?: 'simplex' | 'long-edge' | 'short-edge';
}

/**
 * Result of a print operation
 */
export interface PrintResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Path to generated PDF (for PDF operations) */
  pdfPath?: string;
  /** Size of generated PDF in bytes */
  pdfSize?: number;
  /** Number of pages */
  pageCount?: number;
}

/**
 * ONPRINT configuration from macro state
 */
export interface OnPrintConfig {
  /** Button action (OK to print, CANCEL to abort) */
  button: 'OK' | 'CANCEL';
  /** Whether the config is active */
  active: boolean;
}

/**
 * PrintService class providing PDF generation and printing capabilities
 */
export class PrintService {
  private browser: puppeteer.Browser | null = null;
  private onPrintConfig: OnPrintConfig = { button: 'OK', active: false };

  /**
   * Initialize the Puppeteer browser instance
   */
  private async ensureBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Close the browser instance and clean up resources
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Configure ONPRINT settings from macro state
   */
  setOnPrintConfig(config: OnPrintConfig): void {
    this.onPrintConfig = config;
  }

  /**
   * Get current ONPRINT configuration
   */
  getOnPrintConfig(): OnPrintConfig {
    return this.onPrintConfig;
  }

  /**
   * Check if printing should proceed based on ONPRINT config
   */
  shouldPrint(): boolean {
    if (!this.onPrintConfig.active) {
      return true; // If no config, default to printing
    }
    return this.onPrintConfig.button === 'OK';
  }

  /**
   * Convert PrintOptions to Puppeteer PDFOptions
   */
  private toPuppeteerOptions(options: PrintOptions): puppeteer.PDFOptions {
    const pdfOptions: puppeteer.PDFOptions = {
      format: options.format || 'Letter',
      printBackground: options.printBackground !== false,
      scale: options.scale || 1,
      preferCSSPageSize: options.preferCSSPageSize || false,
      landscape: options.orientation === 'landscape',
    };

    // Custom dimensions override format
    if (options.width) {
      pdfOptions.width = options.width;
    }
    if (options.height) {
      pdfOptions.height = options.height;
    }

    // Margins
    if (options.margin) {
      pdfOptions.margin = {
        top: options.margin.top || '0',
        right: options.margin.right || '0',
        bottom: options.margin.bottom || '0',
        left: options.margin.left || '0',
      };
    }

    // Page ranges
    if (options.pageRanges) {
      pdfOptions.pageRanges = options.pageRanges;
    }

    // Header/Footer
    if (options.headerFooter) {
      pdfOptions.displayHeaderFooter = options.headerFooter.displayHeaderFooter || false;
      if (options.headerFooter.headerTemplate) {
        pdfOptions.headerTemplate = options.headerFooter.headerTemplate;
      }
      if (options.headerFooter.footerTemplate) {
        pdfOptions.footerTemplate = options.headerFooter.footerTemplate;
      }
    }

    return pdfOptions;
  }

  /**
   * Generate PDF from a URL
   *
   * @param url - URL to render and convert to PDF
   * @param outputPath - Path to save the PDF file
   * @param options - Print configuration options
   * @returns PrintResult with operation status
   */
  async generatePdfFromUrl(
    url: string,
    outputPath: string,
    options: PrintOptions = {}
  ): Promise<PrintResult> {
    // Check ONPRINT configuration
    if (!this.shouldPrint()) {
      return {
        success: false,
        error: 'Print cancelled by ONPRINT configuration (BUTTON=CANCEL)',
      };
    }

    try {
      const browser = await this.ensureBrowser();
      const page = await browser.newPage();

      try {
        // Navigate to URL
        const waitUntil: puppeteer.PuppeteerLifeCycleEvent[] = options.waitForNetworkIdle
          ? ['load', 'networkidle0']
          : ['load'];

        await page.goto(url, {
          waitUntil,
          timeout: 60000,
        });

        // Additional wait if specified
        if (options.waitAfterLoad && options.waitAfterLoad > 0) {
          await new Promise(resolve => setTimeout(resolve, options.waitAfterLoad));
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate PDF
        const pdfOptions = this.toPuppeteerOptions(options);
        pdfOptions.path = outputPath;

        await page.pdf(pdfOptions);

        // Get file stats
        const stats = fs.statSync(outputPath);

        return {
          success: true,
          pdfPath: outputPath,
          pdfSize: stats.size,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate PDF from HTML content
   *
   * @param html - HTML content to render and convert to PDF
   * @param outputPath - Path to save the PDF file
   * @param options - Print configuration options
   * @returns PrintResult with operation status
   */
  async generatePdfFromHtml(
    html: string,
    outputPath: string,
    options: PrintOptions = {}
  ): Promise<PrintResult> {
    // Check ONPRINT configuration
    if (!this.shouldPrint()) {
      return {
        success: false,
        error: 'Print cancelled by ONPRINT configuration (BUTTON=CANCEL)',
      };
    }

    try {
      const browser = await this.ensureBrowser();
      const page = await browser.newPage();

      try {
        // Set HTML content
        await page.setContent(html, {
          waitUntil: options.waitForNetworkIdle ? ['load', 'networkidle0'] : ['load'],
          timeout: 60000,
        });

        // Additional wait if specified
        if (options.waitAfterLoad && options.waitAfterLoad > 0) {
          await new Promise(resolve => setTimeout(resolve, options.waitAfterLoad));
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate PDF
        const pdfOptions = this.toPuppeteerOptions(options);
        pdfOptions.path = outputPath;

        await page.pdf(pdfOptions);

        // Get file stats
        const stats = fs.statSync(outputPath);

        return {
          success: true,
          pdfPath: outputPath,
          pdfSize: stats.size,
        };
      } finally {
        await page.close();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate PDF buffer from URL (without saving to file)
   *
   * @param url - URL to render and convert to PDF
   * @param options - Print configuration options
   * @returns PDF buffer or null on error
   */
  async generatePdfBufferFromUrl(
    url: string,
    options: PrintOptions = {}
  ): Promise<{ buffer: Buffer | null; error?: string }> {
    // Check ONPRINT configuration
    if (!this.shouldPrint()) {
      return {
        buffer: null,
        error: 'Print cancelled by ONPRINT configuration (BUTTON=CANCEL)',
      };
    }

    try {
      const browser = await this.ensureBrowser();
      const page = await browser.newPage();

      try {
        const waitUntil: puppeteer.PuppeteerLifeCycleEvent[] = options.waitForNetworkIdle
          ? ['load', 'networkidle0']
          : ['load'];

        await page.goto(url, {
          waitUntil,
          timeout: 60000,
        });

        if (options.waitAfterLoad && options.waitAfterLoad > 0) {
          await new Promise(resolve => setTimeout(resolve, options.waitAfterLoad));
        }

        const pdfOptions = this.toPuppeteerOptions(options);
        const buffer = await page.pdf(pdfOptions);

        return { buffer: Buffer.from(buffer) };
      } finally {
        await page.close();
      }
    } catch (error) {
      return {
        buffer: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate PDF buffer from HTML content (without saving to file)
   *
   * @param html - HTML content to render and convert to PDF
   * @param options - Print configuration options
   * @returns PDF buffer or null on error
   */
  async generatePdfBufferFromHtml(
    html: string,
    options: PrintOptions = {}
  ): Promise<{ buffer: Buffer | null; error?: string }> {
    // Check ONPRINT configuration
    if (!this.shouldPrint()) {
      return {
        buffer: null,
        error: 'Print cancelled by ONPRINT configuration (BUTTON=CANCEL)',
      };
    }

    try {
      const browser = await this.ensureBrowser();
      const page = await browser.newPage();

      try {
        await page.setContent(html, {
          waitUntil: options.waitForNetworkIdle ? ['load', 'networkidle0'] : ['load'],
          timeout: 60000,
        });

        if (options.waitAfterLoad && options.waitAfterLoad > 0) {
          await new Promise(resolve => setTimeout(resolve, options.waitAfterLoad));
        }

        const pdfOptions = this.toPuppeteerOptions(options);
        const buffer = await page.pdf(pdfOptions);

        return { buffer: Buffer.from(buffer) };
      } finally {
        await page.close();
      }
    } catch (error) {
      return {
        buffer: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Print to a physical printer
   *
   * This generates a PDF and sends it to the system print command.
   * Supports Windows (print), macOS (lpr), and Linux (lpr).
   *
   * @param source - URL or HTML content to print
   * @param isHtml - Whether source is HTML content (false for URL)
   * @param options - Printer configuration options
   * @returns PrintResult with operation status
   */
  async printToPrinter(
    source: string,
    isHtml: boolean,
    options: PrinterOptions = {}
  ): Promise<PrintResult> {
    // Check ONPRINT configuration
    if (!this.shouldPrint()) {
      return {
        success: false,
        error: 'Print cancelled by ONPRINT configuration (BUTTON=CANCEL)',
      };
    }

    try {
      // Generate temporary PDF
      const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
      const tempPdfPath = path.join(tempDir, `imacros_print_${Date.now()}.pdf`);

      let result: PrintResult;
      if (isHtml) {
        result = await this.generatePdfFromHtml(source, tempPdfPath, options);
      } else {
        result = await this.generatePdfFromUrl(source, tempPdfPath, options);
      }

      if (!result.success) {
        return result;
      }

      try {
        // Send to printer using system command
        await this.sendToPrinter(tempPdfPath, options);

        return {
          success: true,
          pdfPath: tempPdfPath,
        };
      } finally {
        // Clean up temp file after a delay to allow printing to start
        setTimeout(() => {
          try {
            if (fs.existsSync(tempPdfPath)) {
              fs.unlinkSync(tempPdfPath);
            }
          } catch {
            // Ignore cleanup errors
          }
        }, 30000); // 30 second delay
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a PDF file to the system printer
   *
   * @param pdfPath - Path to the PDF file to print
   * @param options - Printer options
   */
  private async sendToPrinter(pdfPath: string, options: PrinterOptions): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      // Windows: Use PowerShell Start-Process with -Verb Print or SumatraPDF
      // Fall back to direct print command
      const printerArg = options.printerName
        ? `-PrinterName "${options.printerName}"`
        : '';
      const copiesArg = options.copies && options.copies > 1
        ? `-Copies ${options.copies}`
        : '';

      // Try using PowerShell's Out-Printer or direct print
      command = `powershell -Command "Start-Process -FilePath '${pdfPath}' -Verb Print ${printerArg} -Wait"`;

      // Alternative: Use Windows print command
      if (options.printerName) {
        command = `print /D:"${options.printerName}" "${pdfPath}"`;
      } else {
        // Use associated application for printing
        command = `cmd /c start /min "" "${pdfPath}" /p`;
      }
    } else if (platform === 'darwin') {
      // macOS: Use lpr command
      const printerArg = options.printerName ? `-P "${options.printerName}"` : '';
      const copiesArg = options.copies ? `-# ${options.copies}` : '';
      const colorArg = options.color === false ? '-o ColorModel=Gray' : '';
      const duplexArg = this.getLprDuplexArg(options.duplex);

      command = `lpr ${printerArg} ${copiesArg} ${colorArg} ${duplexArg} "${pdfPath}"`;
    } else {
      // Linux: Use lpr command
      const printerArg = options.printerName ? `-P "${options.printerName}"` : '';
      const copiesArg = options.copies ? `-# ${options.copies}` : '';
      const colorArg = options.color === false ? '-o ColorModel=Gray' : '';
      const duplexArg = this.getLprDuplexArg(options.duplex);

      command = `lpr ${printerArg} ${copiesArg} ${colorArg} ${duplexArg} "${pdfPath}"`;
    }

    await execAsync(command.trim().replace(/\s+/g, ' '));
  }

  /**
   * Get lpr duplex argument based on duplex option
   */
  private getLprDuplexArg(duplex?: 'simplex' | 'long-edge' | 'short-edge'): string {
    switch (duplex) {
      case 'simplex':
        return '-o sides=one-sided';
      case 'long-edge':
        return '-o sides=two-sided-long-edge';
      case 'short-edge':
        return '-o sides=two-sided-short-edge';
      default:
        return '';
    }
  }

  /**
   * Get list of available printers on the system
   *
   * @returns Array of printer names
   */
  async getAvailablePrinters(): Promise<string[]> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        // Windows: Use wmic or PowerShell
        const { stdout } = await execAsync(
          'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"'
        );
        return stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
      } else if (platform === 'darwin') {
        // macOS: Use lpstat
        const { stdout } = await execAsync('lpstat -a');
        return stdout
          .split('\n')
          .map(line => line.split(' ')[0])
          .filter(name => name.length > 0);
      } else {
        // Linux: Use lpstat
        const { stdout } = await execAsync('lpstat -a');
        return stdout
          .split('\n')
          .map(line => line.split(' ')[0])
          .filter(name => name.length > 0);
      }
    } catch {
      return [];
    }
  }

  /**
   * Get the default system printer name
   *
   * @returns Default printer name or null if none set
   */
  async getDefaultPrinter(): Promise<string | null> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        const { stdout } = await execAsync(
          'powershell -Command "(Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Default = TRUE\\").Name"'
        );
        const name = stdout.trim();
        return name.length > 0 ? name : null;
      } else if (platform === 'darwin') {
        const { stdout } = await execAsync('lpstat -d');
        const match = stdout.match(/system default destination: (.+)/);
        return match ? match[1].trim() : null;
      } else {
        const { stdout } = await execAsync('lpstat -d');
        const match = stdout.match(/system default destination: (.+)/);
        return match ? match[1].trim() : null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Create default header template for PDF
   */
  static createHeaderTemplate(options?: {
    showDate?: boolean;
    showTitle?: boolean;
    showUrl?: boolean;
    fontSize?: string;
  }): string {
    const fontSize = options?.fontSize || '10px';
    const parts: string[] = [];

    if (options?.showDate !== false) {
      parts.push('<span class="date"></span>');
    }
    if (options?.showTitle !== false) {
      parts.push('<span class="title"></span>');
    }
    if (options?.showUrl) {
      parts.push('<span class="url"></span>');
    }

    return `
      <div style="font-size: ${fontSize}; width: 100%; display: flex; justify-content: space-between; padding: 0 20px;">
        ${parts.join(' - ')}
      </div>
    `;
  }

  /**
   * Create default footer template for PDF
   */
  static createFooterTemplate(options?: {
    showPageNumbers?: boolean;
    showDate?: boolean;
    showUrl?: boolean;
    fontSize?: string;
  }): string {
    const fontSize = options?.fontSize || '10px';
    const parts: string[] = [];

    if (options?.showDate) {
      parts.push('<span class="date"></span>');
    }
    if (options?.showUrl) {
      parts.push('<span class="url"></span>');
    }
    if (options?.showPageNumbers !== false) {
      parts.push('<span class="pageNumber"></span> / <span class="totalPages"></span>');
    }

    return `
      <div style="font-size: ${fontSize}; width: 100%; display: flex; justify-content: center; padding: 0 20px;">
        ${parts.join(' - ')}
      </div>
    `;
  }
}

// Singleton instance for convenience
let printServiceInstance: PrintService | null = null;

/**
 * Get or create the singleton PrintService instance
 */
export function getPrintService(): PrintService {
  if (!printServiceInstance) {
    printServiceInstance = new PrintService();
  }
  return printServiceInstance;
}

/**
 * Close the singleton PrintService instance
 */
export async function closePrintService(): Promise<void> {
  if (printServiceInstance) {
    await printServiceInstance.close();
    printServiceInstance = null;
  }
}

export default PrintService;
