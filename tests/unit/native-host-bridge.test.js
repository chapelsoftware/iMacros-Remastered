/**
 * Unit tests for the native host browser bridge and command handlers
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
// Mock the modules since they're written in JavaScript
const mockSendMessage = vi.fn();
const mockCreateMessageId = vi.fn(() => 'test-id-123');
// Import the actual modules
const { createBrowserBridge } = require('../../native-host/src/browser-bridge');
const { createBrowserHandlers, ERROR_CODES } = require('../../native-host/src/command-handlers');
describe('BrowserBridge', () => {
    let bridge;
    beforeEach(() => {
        vi.clearAllMocks();
        bridge = createBrowserBridge(mockSendMessage, mockCreateMessageId);
    });
    describe('Navigation', () => {
        test('navigate sends correct message', async () => {
            // Set up to capture the sent message
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            // Don't await since there's no response yet
            const navigatePromise = bridge.navigate('https://example.com');
            // Verify message was sent
            expect(sentMessage).toBeDefined();
            expect(sentMessage.type).toBe('browser_command');
            expect(sentMessage.payload.commandType).toBe('navigate');
            expect(sentMessage.payload.url).toBe('https://example.com');
            // Simulate response
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(navigatePromise).resolves.toEqual({ success: true });
        });
        test('getCurrentUrl sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const urlPromise = bridge.getCurrentUrl();
            expect(sentMessage.payload.commandType).toBe('getCurrentUrl');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { url: 'https://example.com/page' },
            });
            await expect(urlPromise).resolves.toBe('https://example.com/page');
        });
        test('goBack sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const backPromise = bridge.goBack();
            expect(sentMessage.payload.commandType).toBe('goBack');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(backPromise).resolves.toEqual({ success: true });
        });
        test('refresh sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const refreshPromise = bridge.refresh();
            expect(sentMessage.payload.commandType).toBe('refresh');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(refreshPromise).resolves.toEqual({ success: true });
        });
    });
    describe('Tab Management', () => {
        test('openTab sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const openPromise = bridge.openTab('https://google.com');
            expect(sentMessage.payload.commandType).toBe('openTab');
            expect(sentMessage.payload.url).toBe('https://google.com');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true, tabId: 42 },
            });
            await expect(openPromise).resolves.toEqual({ success: true, tabId: 42 });
            expect(bridge.getActiveTab()).toBe(42);
        });
        test('switchTab sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const switchPromise = bridge.switchTab(2);
            expect(sentMessage.payload.commandType).toBe('switchTab');
            // Tab index is converted from 1-based to 0-based
            expect(sentMessage.payload.tabIndex).toBe(1);
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true, tabId: 2 },
            });
            await expect(switchPromise).resolves.toEqual({ success: true, tabId: 2 });
        });
        test('closeTab sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const closePromise = bridge.closeTab();
            expect(sentMessage.payload.commandType).toBe('closeTab');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(closePromise).resolves.toEqual({ success: true });
        });
    });
    describe('Frame Management', () => {
        test('selectFrame sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const framePromise = bridge.selectFrame(1);
            expect(sentMessage.payload.commandType).toBe('selectFrame');
            expect(sentMessage.payload.frameIndex).toBe(1);
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(framePromise).resolves.toEqual({ success: true });
            expect(bridge.getCurrentFrame()).toBe(1);
        });
    });
    describe('Interaction Commands', () => {
        test('executeTag sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const tagPromise = bridge.executeTag({
                pos: 1,
                type: 'INPUT',
                attr: 'NAME:username',
                content: 'testuser',
            });
            expect(sentMessage.payload.commandType).toBe('TAG_COMMAND');
            expect(sentMessage.payload.selector.pos).toBe(1);
            expect(sentMessage.payload.selector.type).toBe('INPUT');
            expect(sentMessage.payload.action.content).toBe('testuser');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(tagPromise).resolves.toEqual({ success: true });
        });
        test('executeClick sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const clickPromise = bridge.executeClick({ x: 100, y: 200 });
            expect(sentMessage.payload.commandType).toBe('CLICK_COMMAND');
            expect(sentMessage.payload.x).toBe(100);
            expect(sentMessage.payload.y).toBe(200);
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(clickPromise).resolves.toEqual({ success: true });
        });
        test('executeEvent sends correct message', async () => {
            let sentMessage;
            mockSendMessage.mockImplementation((msg) => {
                sentMessage = msg;
            });
            const eventPromise = bridge.executeEvent({
                eventType: 'click',
                selector: { css: '.my-button' },
            });
            expect(sentMessage.payload.commandType).toBe('EVENT_COMMAND');
            expect(sentMessage.payload.eventType).toBe('click');
            expect(sentMessage.payload.selector.css).toBe('.my-button');
            bridge.handleResponse({
                id: 'test-id-123',
                payload: { success: true },
            });
            await expect(eventPromise).resolves.toEqual({ success: true });
        });
    });
    describe('Error Handling', () => {
        test('handles error responses', async () => {
            mockSendMessage.mockImplementation(() => { });
            const navigatePromise = bridge.navigate('https://example.com');
            bridge.handleResponse({
                id: 'test-id-123',
                error: 'Navigation failed',
            });
            await expect(navigatePromise).rejects.toThrow('Navigation failed');
        });
        test('times out on no response', async () => {
            vi.useFakeTimers();
            mockSendMessage.mockImplementation(() => { });
            // Create bridge with short timeout for testing
            const shortTimeoutBridge = createBrowserBridge(mockSendMessage, mockCreateMessageId);
            const navigatePromise = shortTimeoutBridge.sendBrowserCommand('navigate', { url: 'https://example.com' }, 1000);
            // Fast-forward time
            vi.advanceTimersByTime(1500);
            await expect(navigatePromise).rejects.toThrow('Browser command timeout');
            vi.useRealTimers();
        });
    });
});
describe('CommandHandlers', () => {
    let mockBridge;
    let handlers;
    beforeEach(() => {
        mockBridge = {
            navigate: vi.fn().mockResolvedValue({ success: true }),
            getCurrentUrl: vi.fn().mockResolvedValue('https://example.com'),
            goBack: vi.fn().mockResolvedValue({ success: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
            openTab: vi.fn().mockResolvedValue({ success: true }),
            switchTab: vi.fn().mockResolvedValue({ success: true }),
            closeTab: vi.fn().mockResolvedValue({ success: true }),
            closeOtherTabs: vi.fn().mockResolvedValue({ success: true }),
            selectFrame: vi.fn().mockResolvedValue({ success: true }),
            selectFrameByName: vi.fn().mockResolvedValue({ success: true }),
            executeTag: vi.fn().mockResolvedValue({ success: true }),
            executeClick: vi.fn().mockResolvedValue({ success: true }),
            executeEvent: vi.fn().mockResolvedValue({ success: true }),
        };
        handlers = createBrowserHandlers(mockBridge);
    });
    // Create a mock command context
    function createMockContext(params) {
        const variables = {
            expand: (text) => text,
        };
        const state = {
            setVariable: vi.fn(),
            getVariable: vi.fn().mockReturnValue(30),
            addExtract: vi.fn(),
        };
        const command = {
            type: 'TEST',
            parameters: Object.entries(params).map(([key, value]) => ({ key, value })),
        };
        return {
            command,
            variables,
            state,
            getParam: (key) => params[key.toUpperCase()],
            getRequiredParam: (key) => {
                const val = params[key.toUpperCase()];
                if (!val)
                    throw new Error(`Missing required parameter: ${key}`);
                return val;
            },
            expand: (text) => text,
            log: vi.fn(),
        };
    }
    describe('URL handler', () => {
        test('URL GOTO navigates to URL', async () => {
            const ctx = createMockContext({ GOTO: 'https://example.com' });
            const result = await handlers.URL(ctx);
            expect(mockBridge.navigate).toHaveBeenCalledWith('https://example.com');
            expect(result.success).toBe(true);
            expect(result.errorCode).toBe(ERROR_CODES.OK);
            expect(ctx.state.setVariable).toHaveBeenCalledWith('!URLCURRENT', 'https://example.com');
        });
        test('URL CURRENT gets current URL', async () => {
            const ctx = createMockContext({ CURRENT: '' });
            ctx.command.parameters = [{ key: 'CURRENT', value: '' }];
            const result = await handlers.URL(ctx);
            expect(mockBridge.getCurrentUrl).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(ctx.state.setVariable).toHaveBeenCalledWith('!URLCURRENT', 'https://example.com');
        });
        test('URL without params returns error', async () => {
            const ctx = createMockContext({});
            const result = await handlers.URL(ctx);
            expect(result.success).toBe(false);
            expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
        });
    });
    describe('BACK handler', () => {
        test('BACK navigates back', async () => {
            const ctx = createMockContext({});
            const result = await handlers.BACK(ctx);
            expect(mockBridge.goBack).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });
    describe('REFRESH handler', () => {
        test('REFRESH refreshes page', async () => {
            const ctx = createMockContext({});
            const result = await handlers.REFRESH(ctx);
            expect(mockBridge.refresh).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });
    describe('TAB handler', () => {
        test('TAB T=n switches tab', async () => {
            const ctx = createMockContext({ T: '2' });
            const result = await handlers.TAB(ctx);
            expect(mockBridge.switchTab).toHaveBeenCalledWith(2);
            expect(result.success).toBe(true);
        });
        test('TAB OPEN opens new tab', async () => {
            const ctx = createMockContext({ OPEN: '', URL: 'https://google.com' });
            ctx.command.parameters = [
                { key: 'OPEN', value: '' },
                { key: 'URL', value: 'https://google.com' },
            ];
            const result = await handlers.TAB(ctx);
            expect(mockBridge.openTab).toHaveBeenCalledWith('https://google.com');
            expect(result.success).toBe(true);
        });
        test('TAB CLOSE closes tab', async () => {
            const ctx = createMockContext({ CLOSE: '' });
            ctx.command.parameters = [{ key: 'CLOSE', value: '' }];
            const result = await handlers.TAB(ctx);
            expect(mockBridge.closeTab).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
        test('TAB CLOSEALLOTHERS closes other tabs', async () => {
            const ctx = createMockContext({ CLOSEALLOTHERS: '' });
            ctx.command.parameters = [{ key: 'CLOSEALLOTHERS', value: '' }];
            const result = await handlers.TAB(ctx);
            expect(mockBridge.closeOtherTabs).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });
    describe('FRAME handler', () => {
        test('FRAME F=n selects frame', async () => {
            const ctx = createMockContext({ F: '1' });
            const result = await handlers.FRAME(ctx);
            expect(mockBridge.selectFrame).toHaveBeenCalledWith(1);
            expect(result.success).toBe(true);
        });
        test('FRAME NAME=name selects frame by name', async () => {
            const ctx = createMockContext({ NAME: 'myframe' });
            const result = await handlers.FRAME(ctx);
            expect(mockBridge.selectFrameByName).toHaveBeenCalledWith('myframe');
            expect(result.success).toBe(true);
        });
    });
    describe('TAG handler', () => {
        test('TAG executes with all params', async () => {
            const ctx = createMockContext({
                POS: '1',
                TYPE: 'INPUT',
                ATTR: 'NAME:username',
                CONTENT: 'testuser',
            });
            const result = await handlers.TAG(ctx);
            expect(mockBridge.executeTag).toHaveBeenCalledWith(expect.objectContaining({
                pos: 1,
                type: 'INPUT',
                attr: 'NAME:username',
                content: 'testuser',
            }));
            expect(result.success).toBe(true);
        });
        test('TAG handles EXTRACT', async () => {
            mockBridge.executeTag.mockResolvedValue({ success: true, extractedData: 'Hello World' });
            const ctx = createMockContext({
                POS: '1',
                TYPE: 'DIV',
                EXTRACT: 'TXT',
            });
            const result = await handlers.TAG(ctx);
            expect(result.success).toBe(true);
            expect(ctx.state.addExtract).toHaveBeenCalledWith('Hello World');
        });
    });
    describe('CLICK handler', () => {
        test('CLICK X=n Y=n clicks at coordinates', async () => {
            const ctx = createMockContext({ X: '100', Y: '200' });
            const result = await handlers.CLICK(ctx);
            expect(mockBridge.executeClick).toHaveBeenCalledWith({
                x: 100,
                y: 200,
                button: 'left',
            });
            expect(result.success).toBe(true);
        });
        test('CLICK with CONTENT=right clicks right button', async () => {
            const ctx = createMockContext({ X: '100', Y: '200', CONTENT: 'right' });
            const result = await handlers.CLICK(ctx);
            expect(mockBridge.executeClick).toHaveBeenCalledWith({
                x: 100,
                y: 200,
                button: 'right',
            });
            expect(result.success).toBe(true);
        });
        test('CLICK without coords returns error', async () => {
            const ctx = createMockContext({});
            const result = await handlers.CLICK(ctx);
            expect(result.success).toBe(false);
            expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
        });
    });
    describe('EVENT handler', () => {
        test('EVENT TYPE=click dispatches event', async () => {
            const ctx = createMockContext({ TYPE: 'click', CSS: '.my-button' });
            const result = await handlers.EVENT(ctx);
            expect(mockBridge.executeEvent).toHaveBeenCalledWith(expect.objectContaining({
                eventType: 'click',
                selector: { css: '.my-button' },
            }));
            expect(result.success).toBe(true);
        });
        test('EVENT without TYPE returns error', async () => {
            const ctx = createMockContext({});
            const result = await handlers.EVENT(ctx);
            expect(result.success).toBe(false);
            expect(result.errorCode).toBe(ERROR_CODES.MISSING_PARAMETER);
        });
    });
});
//# sourceMappingURL=native-host-bridge.test.js.map