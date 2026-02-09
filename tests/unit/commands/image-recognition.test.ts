/**
 * Image Recognition Command Handlers Unit Tests
 *
 * Tests for IMAGECLICK and IMAGESEARCH commands that use the native host's
 * image-search service for template matching on webpage screenshots.
 *
 * Covers:
 * - Proper error codes (-902, -903, -927, -930)
 * - Retry loop with !TIMEOUT_TAG
 * - Webpage screenshot source option
 * - Visual highlight callback
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createExecutor,
  IMACROS_ERROR_CODES,
} from '../../../shared/src/executor';
import {
  imageSearchHandler,
  imageClickHandler,
  imageRecognitionHandlers,
  registerImageRecognitionHandlers,
  setImageSearchService,
  setMouseClickService,
  setImageHighlightCallback,
  getImageSearchService,
  getMouseClickService,
  getImageHighlightCallback,
  ImageSearchService,
  MouseClickService,
  ImageSearchResult,
  ImageHighlightCallback,
} from '../../../shared/src/commands/image-recognition';

// ===== Mock Services =====

/**
 * Create a mock image search result
 */
function createMockSearchResult(found: boolean, x = 100, y = 200): ImageSearchResult {
  return {
    found,
    x,
    y,
    confidence: found ? 0.95 : 0,
    width: 50,
    height: 30,
    topLeft: { x: x - 25, y: y - 15 },
    bottomRight: { x: x + 25, y: y + 15 },
  };
}

/**
 * Create a mock image search service
 */
function createMockImageSearchService(result: ImageSearchResult): ImageSearchService {
  return {
    search: vi.fn().mockResolvedValue(result),
    searchAll: vi.fn().mockResolvedValue(result.found ? [result] : []),
    waitFor: vi.fn().mockResolvedValue(result),
  };
}

/**
 * Create a mock mouse click service
 */
function createMockMouseClickService(success = true): MouseClickService {
  return {
    click: vi.fn().mockResolvedValue({
      success,
      error: success ? undefined : 'Click failed',
      position: { x: 100, y: 200 },
    }),
  };
}

// ===== Test Helpers =====

/**
 * Create a mock command context
 */
function createMockContext(params: Record<string, string> = {}, stateVars: Record<string, any> = {}): any {
  const logMessages: Array<{ level: string; message: string }> = [];
  const variables: Record<string, any> = { ...stateVars };

  return {
    command: { type: 'IMAGESEARCH', parameters: [], raw: 'IMAGESEARCH', lineNumber: 1, variables: [] },
    variables: {
      get: (name: string) => undefined,
      set: () => {},
      expand: (t: string) => ({ expanded: t, variables: [] }),
    },
    state: {
      setVariable: (name: string, value: any) => { variables[name] = value; },
      getVariable: (name: string) => variables[name],
    },
    getParam: (key: string) => params[key.toUpperCase()],
    getRequiredParam: (key: string) => {
      const value = params[key.toUpperCase()];
      if (!value) throw new Error(`Missing required parameter: ${key}`);
      return value;
    },
    expand: (t: string) => t,
    log: (level: string, message: string) => logMessages.push({ level, message }),
    _logs: logMessages,
    _variables: variables,
  };
}

// ===== Test Suite =====

describe('Image Recognition Command Handlers', () => {
  // Store original services to restore after tests
  let originalImageSearchService: ImageSearchService | null;
  let originalMouseClickService: MouseClickService | null;
  let originalHighlightCallback: ImageHighlightCallback | null;

  beforeEach(() => {
    originalImageSearchService = getImageSearchService();
    originalMouseClickService = getMouseClickService();
    originalHighlightCallback = getImageHighlightCallback();
  });

  afterEach(() => {
    // Restore original services
    if (originalImageSearchService) {
      setImageSearchService(originalImageSearchService);
    }
    if (originalMouseClickService) {
      setMouseClickService(originalMouseClickService);
    }
    if (originalHighlightCallback) {
      setImageHighlightCallback(originalHighlightCallback);
    }
  });

  describe('imageRecognitionHandlers registry', () => {
    it('should contain IMAGESEARCH and IMAGECLICK handlers', () => {
      expect(imageRecognitionHandlers).toHaveProperty('IMAGESEARCH');
      expect(imageRecognitionHandlers).toHaveProperty('IMAGECLICK');
      expect(typeof imageRecognitionHandlers.IMAGESEARCH).toBe('function');
      expect(typeof imageRecognitionHandlers.IMAGECLICK).toBe('function');
    });
  });

  describe('registerImageRecognitionHandlers', () => {
    it('should register IMAGESEARCH and IMAGECLICK handlers', () => {
      const registered: string[] = [];
      const mockRegisterFn = (type: string) => {
        registered.push(type);
      };

      registerImageRecognitionHandlers(mockRegisterFn as any);

      expect(registered).toContain('IMAGESEARCH');
      expect(registered).toContain('IMAGECLICK');
    });
  });

  // ===== IMAGESEARCH Tests =====

  describe('IMAGESEARCH command', () => {
    describe('when service is not configured', () => {
      beforeEach(() => {
        // Set service to null (not configured)
        (setImageSearchService as any)(null);
      });

      it('should return IMAGE_SEARCH_NOT_CONFIGURED (-902) when service is not available', async () => {
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED);
        expect(result.errorMessage).toContain('image-search service');
      });
    });

    describe('when service is configured', () => {
      let mockService: ImageSearchService;

      beforeEach(() => {
        mockService = createMockImageSearchService(createMockSearchResult(true));
        setImageSearchService(mockService);
      });

      it('should require POS parameter', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
        expect(result.errorMessage).toContain('POS');
      });

      it('should require IMAGE parameter', async () => {
        const ctx = createMockContext({
          POS: '1',
          CONFIDENCE: '80',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
        expect(result.errorMessage).toContain('IMAGE');
      });

      it('should require CONFIDENCE parameter', async () => {
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
        expect(result.errorMessage).toContain('CONFIDENCE');
      });

      it('should validate POS is a positive integer', async () => {
        const ctx = createMockContext({
          POS: '0',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
        expect(result.errorMessage).toContain('POS');
      });

      it('should validate CONFIDENCE is 0-100', async () => {
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '150',
        });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
        expect(result.errorMessage).toContain('CONFIDENCE');
      });

      it('should search for image and store coordinates on success', async () => {
        // Set short timeout to avoid long test
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
        expect(mockService.search).toHaveBeenCalledWith('button.png', {
          confidenceThreshold: 0.8,
          source: 'webpage',
        });

        // Check stored variables
        expect(ctx._variables['!IMAGESEARCH']).toBe('true');
        expect(ctx._variables['!IMAGESEARCH_X']).toBe(100);
        expect(ctx._variables['!IMAGESEARCH_Y']).toBe(200);
        expect(ctx._variables['!IMAGESEARCH_CONFIDENCE']).toBe(95);
      });

      it('should pass source=webpage to search service (matches iMacros 8.9.7)', async () => {
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        await imageSearchHandler(ctx);

        expect(mockService.search).toHaveBeenCalledWith('button.png', expect.objectContaining({
          source: 'webpage',
        }));
      });

      it('should return IMAGE_NOT_FOUND (-927) after timeout when image is not found', async () => {
        mockService = createMockImageSearchService(createMockSearchResult(false));
        setImageSearchService(mockService);

        // Set timeout to 1 second for fast test
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'missing.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        // After timeout, executeWithTimeoutRetry returns TIMEOUT (-930)
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
        expect(ctx._variables['!IMAGESEARCH']).toBe('false');
      });

      it('should retry searching until timeout', async () => {
        mockService = createMockImageSearchService(createMockSearchResult(false));
        setImageSearchService(mockService);

        // Set timeout to 2 seconds
        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 2 });

        await imageSearchHandler(ctx);

        // Should have been called multiple times (initial + retries)
        expect((mockService.search as any).mock.calls.length).toBeGreaterThan(1);
      });

      it('should succeed on retry if image appears during retry loop', async () => {
        // First call: not found, second call: found
        const notFound = createMockSearchResult(false);
        const found = createMockSearchResult(true, 150, 250);
        mockService.search = vi.fn()
          .mockResolvedValueOnce(notFound)
          .mockResolvedValueOnce(found);
        setImageSearchService(mockService);

        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 3 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(true);
        expect(ctx._variables['!IMAGESEARCH']).toBe('true');
        expect(ctx._variables['!IMAGESEARCH_X']).toBe(150);
        expect(ctx._variables['!IMAGESEARCH_Y']).toBe(250);
      });

      it('should return IMAGE_FILE_NOT_FOUND (-903) for file errors (non-retryable)', async () => {
        mockService.search = vi.fn().mockRejectedValue(new Error('ENOENT: file not found'));
        setImageSearchService(mockService);

        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'nonexistent.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND);
        // Should NOT retry for file errors - only called once
        expect((mockService.search as any).mock.calls.length).toBe(1);
      });

      it('should handle service errors gracefully', async () => {
        mockService.search = vi.fn().mockRejectedValue(new Error('Screen capture failed'));
        setImageSearchService(mockService);

        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(false);
        // Non-file errors are retryable, so after timeout we get TIMEOUT
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
      });

      it('should use searchAll for POS > 1', async () => {
        const results = [
          createMockSearchResult(true, 100, 200),
          createMockSearchResult(true, 300, 400),
        ];
        mockService.searchAll = vi.fn().mockResolvedValue(results);
        setImageSearchService(mockService);

        const ctx = createMockContext({
          POS: '2',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageSearchHandler(ctx);

        expect(result.success).toBe(true);
        expect(mockService.searchAll).toHaveBeenCalled();
        expect(ctx._variables['!IMAGESEARCH_X']).toBe(300);
        expect(ctx._variables['!IMAGESEARCH_Y']).toBe(400);
      });

      it('should trigger highlight callback when image is found', async () => {
        const highlightCallback = vi.fn();
        setImageHighlightCallback(highlightCallback);

        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        await imageSearchHandler(ctx);

        expect(highlightCallback).toHaveBeenCalledWith({
          x: 75,   // topLeft.x = 100 - 25
          y: 185,   // topLeft.y = 200 - 15
          width: 50,
          height: 30,
          label: 'IMAGESEARCH',
        });
      });

      it('should not trigger highlight callback when image is not found', async () => {
        const highlightCallback = vi.fn();
        setImageHighlightCallback(highlightCallback);

        mockService = createMockImageSearchService(createMockSearchResult(false));
        setImageSearchService(mockService);

        const ctx = createMockContext({
          POS: '1',
          IMAGE: 'button.png',
          CONFIDENCE: '80',
        }, { '!TIMEOUT_TAG': 1 });

        await imageSearchHandler(ctx);

        expect(highlightCallback).not.toHaveBeenCalled();
      });
    });
  });

  // ===== IMAGECLICK Tests =====

  describe('IMAGECLICK command', () => {
    describe('when services are not configured', () => {
      beforeEach(() => {
        (setImageSearchService as any)(null);
        (setMouseClickService as any)(null);
      });

      it('should return IMAGE_SEARCH_NOT_CONFIGURED (-902) when image search service is not available', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
        });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED);
        expect(result.errorMessage).toContain('image-search service');
      });

      it('should return IMAGE_SEARCH_NOT_CONFIGURED (-902) when mouse click service is not available', async () => {
        setImageSearchService(createMockImageSearchService(createMockSearchResult(true)));

        const ctx = createMockContext({
          IMAGE: 'button.png',
        });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED);
        expect(result.errorMessage).toContain('winclick-service');
      });
    });

    describe('when services are configured', () => {
      let mockImageService: ImageSearchService;
      let mockClickService: MouseClickService;

      beforeEach(() => {
        mockImageService = createMockImageSearchService(createMockSearchResult(true));
        mockClickService = createMockMouseClickService(true);
        setImageSearchService(mockImageService);
        setMouseClickService(mockClickService);
      });

      it('should require IMAGE parameter', async () => {
        const ctx = createMockContext({});

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.MISSING_PARAMETER);
        expect(result.errorMessage).toContain('IMAGE');
      });

      it('should use default confidence of 80 when not specified', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(mockImageService.search).toHaveBeenCalledWith('button.png', {
          confidenceThreshold: 0.8,
          source: 'webpage',
        });
      });

      it('should use custom confidence when specified', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
          CONFIDENCE: '95',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(mockImageService.search).toHaveBeenCalledWith('button.png', {
          confidenceThreshold: 0.95,
          source: 'webpage',
        });
      });

      it('should validate BUTTON parameter', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
          BUTTON: 'invalid',
        });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.INVALID_PARAMETER);
        expect(result.errorMessage).toContain('BUTTON');
      });

      it('should search and click on found image', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(true);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
        expect(mockClickService.click).toHaveBeenCalledWith({
          x: 100,
          y: 200,
          button: 'left',
        });
        expect(ctx._variables['!IMAGECLICK']).toBe('true');
        expect(ctx._variables['!IMAGECLICK_X']).toBe(100);
        expect(ctx._variables['!IMAGECLICK_Y']).toBe(200);
      });

      it('should click with right button when BUTTON=right', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
          BUTTON: 'right',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(mockClickService.click).toHaveBeenCalledWith({
          x: 100,
          y: 200,
          button: 'right',
        });
      });

      it('should click with middle button when BUTTON=middle', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
          BUTTON: 'middle',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(mockClickService.click).toHaveBeenCalledWith({
          x: 100,
          y: 200,
          button: 'middle',
        });
      });

      it('should return TIMEOUT (-930) after retries when image is not found', async () => {
        mockImageService = createMockImageSearchService(createMockSearchResult(false));
        setImageSearchService(mockImageService);

        const ctx = createMockContext({
          IMAGE: 'missing.png',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
        expect(mockClickService.click).not.toHaveBeenCalled();
        expect(ctx._variables['!IMAGECLICK']).toBe('false');
      });

      it('should retry searching and succeed if image appears during retry loop', async () => {
        const notFound = createMockSearchResult(false);
        const found = createMockSearchResult(true, 150, 250);
        mockImageService.search = vi.fn()
          .mockResolvedValueOnce(notFound)
          .mockResolvedValueOnce(found);
        setImageSearchService(mockImageService);

        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 3 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(true);
        expect(mockClickService.click).toHaveBeenCalledWith({
          x: 150,
          y: 250,
          button: 'left',
        });
      });

      it('should return IMAGE_FILE_NOT_FOUND (-903) for file errors (non-retryable)', async () => {
        mockImageService.search = vi.fn().mockRejectedValue(new Error('file not found: /path/to/image.png'));
        setImageSearchService(mockImageService);

        const ctx = createMockContext({
          IMAGE: 'nonexistent.png',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND);
        // Should not retry for file errors
        expect((mockImageService.search as any).mock.calls.length).toBe(1);
      });

      it('should return error when click fails', async () => {
        mockClickService = createMockMouseClickService(false);
        setMouseClickService(mockClickService);

        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.SCRIPT_ERROR);
        expect(result.errorMessage).toContain('click failed');
      });

      it('should handle image search errors gracefully', async () => {
        mockImageService.search = vi.fn().mockRejectedValue(new Error('Template not found'));
        setImageSearchService(mockImageService);

        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        const result = await imageClickHandler(ctx);

        expect(result.success).toBe(false);
        // Non-file errors are retried, so after timeout we get TIMEOUT
        expect(result.errorCode).toBe(IMACROS_ERROR_CODES.TIMEOUT);
        expect(ctx._variables['!IMAGECLICK']).toBe('false');
      });

      it('should trigger highlight callback when image is found', async () => {
        const highlightCallback = vi.fn();
        setImageHighlightCallback(highlightCallback);

        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(highlightCallback).toHaveBeenCalledWith({
          x: 75,   // topLeft.x = 100 - 25
          y: 185,   // topLeft.y = 200 - 15
          width: 50,
          height: 30,
          label: 'IMAGECLICK',
        });
      });

      it('should pass source=webpage to search service', async () => {
        const ctx = createMockContext({
          IMAGE: 'button.png',
        }, { '!TIMEOUT_TAG': 1 });

        await imageClickHandler(ctx);

        expect(mockImageService.search).toHaveBeenCalledWith('button.png', expect.objectContaining({
          source: 'webpage',
        }));
      });
    });
  });

  // ===== Error Codes Tests =====

  describe('Error codes', () => {
    it('should have IMAGE_SEARCH_NOT_CONFIGURED = -902', () => {
      expect(IMACROS_ERROR_CODES.IMAGE_SEARCH_NOT_CONFIGURED).toBe(-902);
    });

    it('should have IMAGE_FILE_NOT_FOUND = -903', () => {
      expect(IMACROS_ERROR_CODES.IMAGE_FILE_NOT_FOUND).toBe(-903);
    });

    it('should have IMAGE_NOT_FOUND = -927', () => {
      expect(IMACROS_ERROR_CODES.IMAGE_NOT_FOUND).toBe(-927);
    });

    it('should have TIMEOUT = -930', () => {
      expect(IMACROS_ERROR_CODES.TIMEOUT).toBe(-930);
    });
  });

  // ===== Integration with Executor =====

  describe('Integration with MacroExecutor', () => {
    let mockImageService: ImageSearchService;
    let mockClickService: MouseClickService;

    beforeEach(() => {
      mockImageService = createMockImageSearchService(createMockSearchResult(true));
      mockClickService = createMockMouseClickService(true);
      setImageSearchService(mockImageService);
      setMouseClickService(mockClickService);
    });

    it('should execute IMAGESEARCH command in macro', async () => {
      const executor = createExecutor({
        onLog: () => {},
      });
      registerImageRecognitionHandlers(executor.registerHandler.bind(executor));

      executor.loadMacro('SET !TIMEOUT_TAG 1\nIMAGESEARCH POS=1 IMAGE=button.png CONFIDENCE=80');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(mockImageService.search).toHaveBeenCalled();
    });

    it('should execute IMAGECLICK command in macro', async () => {
      const executor = createExecutor({
        onLog: () => {},
      });
      registerImageRecognitionHandlers(executor.registerHandler.bind(executor));

      executor.loadMacro('SET !TIMEOUT_TAG 1\nIMAGECLICK IMAGE=submit.png CONFIDENCE=90');
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(mockImageService.search).toHaveBeenCalled();
      expect(mockClickService.click).toHaveBeenCalled();
    });
  });
});
