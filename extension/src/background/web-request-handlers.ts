/**
 * Web Request Handlers for iMacros
 *
 * Implements browser-level request interception:
 * - chrome.webRequest.onAuthRequired for ONLOGIN (HTTP authentication)
 * - chrome.declarativeNetRequest rules for FILTER (content blocking)
 *
 * ONLOGIN: When credentials are set, automatically respond to HTTP auth challenges
 * FILTER: Block images (TYPE=IMAGES) or Flash/media (TYPE=FLASH) content
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Stored HTTP authentication credentials
 */
interface AuthCredentials {
  username: string;
  password: string;
  /** URL pattern to match (optional, defaults to all) */
  urlPattern?: string;
  /** Whether these credentials are active */
  active: boolean;
  /** Timeout in seconds */
  timeout?: number;
}

/**
 * Filter types supported by iMacros FILTER command
 */
type FilterType = 'IMAGES' | 'FLASH' | 'POPUPS';

/**
 * Filter status
 */
type FilterStatus = 'ON' | 'OFF';

/**
 * Current filter state
 */
interface FilterState {
  images: boolean;
  flash: boolean;
  popups: boolean;
}

// ============================================================================
// State
// ============================================================================

/**
 * Queue of HTTP auth credentials (from ONLOGIN commands).
 * Multiple ONLOGIN commands stack, matching original iMacros behavior.
 * Credentials are consumed FIFO when auth is requested.
 */
let credentialsQueue: AuthCredentials[] = [];

/**
 * Current filter state
 */
const filterState: FilterState = {
  images: false,
  flash: false,
  popups: false,
};

/**
 * Rule IDs for declarativeNetRequest
 * Using fixed IDs to allow updating/removing rules
 */
const RULE_IDS = {
  IMAGES_BLOCK: 1000,
  FLASH_BLOCK: 2000,
  MEDIA_BLOCK: 2001,
  OBJECT_BLOCK: 2002,
} as const;

// ============================================================================
// ONLOGIN: HTTP Authentication Handler
// ============================================================================

/**
 * Set credentials for HTTP authentication (called when ONLOGIN command runs).
 * When append=true, pushes to queue so multiple ONLOGIN commands stack.
 * When append=false, replaces the entire queue (backward compatibility).
 */
export function setAuthCredentials(
  username: string,
  password: string,
  urlPattern?: string,
  timeout?: number,
  append: boolean = false
): void {
  const credentials: AuthCredentials = {
    username,
    password,
    urlPattern,
    active: true,
    timeout,
  };

  if (append) {
    credentialsQueue.push(credentials);
  } else {
    credentialsQueue = [credentials];
  }
  console.log('[iMacros] HTTP auth credentials set for user:', username, append ? '(appended to queue)' : '(replaced queue)');
}

/**
 * Clear HTTP authentication credentials (empties the queue)
 */
export function clearAuthCredentials(): void {
  credentialsQueue = [];
  console.log('[iMacros] HTTP auth credentials cleared');
}

/**
 * Get current auth credentials queue (for debugging/status)
 */
export function getAuthCredentials(): { username: string; active: boolean }[] {
  return credentialsQueue.map(c => ({
    username: c.username,
    active: c.active,
  }));
}

/**
 * Handler for chrome.webRequest.onAuthRequired
 * Automatically provides credentials when HTTP auth is requested.
 * Consumes credentials FIFO from the queue (matching original iMacros behavior
 * where multiple ONLOGIN commands stack as an action queue).
 */
function handleAuthRequired(
  details: chrome.webRequest.WebAuthenticationChallengeDetails,
  callback?: (response: chrome.webRequest.BlockingResponse) => void
): chrome.webRequest.BlockingResponse | void {
  console.log('[iMacros] Auth required for:', details.url, 'challenger:', details.challenger);

  // Find the first active credential in the queue
  const credIndex = credentialsQueue.findIndex(c => {
    if (!c.active) return false;
    if (c.urlPattern) {
      try {
        const pattern = new RegExp(c.urlPattern);
        if (!pattern.test(details.url)) return false;
      } catch {
        // Invalid regex, still match
      }
    }
    return true;
  });

  if (credIndex === -1) {
    console.log('[iMacros] No active credentials in queue, skipping auth');
    if (callback) {
      callback({});
    }
    return {};
  }

  // Consume the credential from the queue (FIFO)
  const cred = credentialsQueue.splice(credIndex, 1)[0];
  console.log('[iMacros] Providing credentials for user:', cred.username, `(${credentialsQueue.length} remaining in queue)`);

  const response: chrome.webRequest.BlockingResponse = {
    authCredentials: {
      username: cred.username,
      password: cred.password,
    },
  };

  if (callback) {
    callback(response);
  }
  return response;
}

/**
 * Initialize the onAuthRequired listener
 */
export function initAuthHandler(): void {
  // Check if webRequest API is available
  if (!chrome.webRequest || !chrome.webRequest.onAuthRequired) {
    console.warn('[iMacros] webRequest.onAuthRequired API not available');
    return;
  }

  // In MV3, we must use asyncBlocking instead of blocking
  // This requires returning a Promise or using the callback parameter
  chrome.webRequest.onAuthRequired.addListener(
    (details, asyncCallback) => {
      // Handle auth asynchronously
      const result = handleAuthRequired(details, asyncCallback);
      // If callback was provided, it was already called in handleAuthRequired
      // Otherwise return the result for synchronous handling
      if (!asyncCallback) {
        return result;
      }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
  );

  console.log('[iMacros] HTTP auth handler initialized (asyncBlocking mode)');
}

// ============================================================================
// FILTER: Content Blocking via declarativeNetRequest
// ============================================================================

/**
 * Resource types for image blocking
 */
const IMAGE_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  'image' as chrome.declarativeNetRequest.ResourceType,
];

/**
 * Resource types for Flash/media blocking
 * Flash is deprecated but we block object/embed and media for compatibility
 */
const FLASH_MEDIA_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  'object' as chrome.declarativeNetRequest.ResourceType,
  'media' as chrome.declarativeNetRequest.ResourceType,
];

/**
 * Create a blocking rule for images
 */
function createImageBlockRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: RULE_IDS.IMAGES_BLOCK,
    priority: 1,
    action: {
      type: 'block' as chrome.declarativeNetRequest.RuleActionType,
    },
    condition: {
      resourceTypes: IMAGE_RESOURCE_TYPES,
    },
  };
}

/**
 * Create blocking rules for Flash/media content
 */
function createFlashBlockRules(): chrome.declarativeNetRequest.Rule[] {
  return [
    {
      id: RULE_IDS.MEDIA_BLOCK,
      priority: 1,
      action: {
        type: 'block' as chrome.declarativeNetRequest.RuleActionType,
      },
      condition: {
        resourceTypes: ['media'] as chrome.declarativeNetRequest.ResourceType[],
      },
    },
    {
      id: RULE_IDS.OBJECT_BLOCK,
      priority: 1,
      action: {
        type: 'block' as chrome.declarativeNetRequest.RuleActionType,
      },
      condition: {
        resourceTypes: ['object'] as chrome.declarativeNetRequest.ResourceType[],
      },
    },
  ];
}

/**
 * Update declarativeNetRequest rules based on current filter state
 */
async function updateFilterRules(): Promise<void> {
  // Check if declarativeNetRequest API is available
  if (!chrome.declarativeNetRequest) {
    console.warn('[iMacros] declarativeNetRequest API not available');
    return;
  }

  const rulesToAdd: chrome.declarativeNetRequest.Rule[] = [];
  const rulesToRemove: number[] = [];

  // Handle image filter
  if (filterState.images) {
    rulesToAdd.push(createImageBlockRule());
  } else {
    rulesToRemove.push(RULE_IDS.IMAGES_BLOCK);
  }

  // Handle flash/media filter
  if (filterState.flash) {
    rulesToAdd.push(...createFlashBlockRules());
  } else {
    rulesToRemove.push(RULE_IDS.MEDIA_BLOCK, RULE_IDS.OBJECT_BLOCK);
  }

  try {
    // Update dynamic rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rulesToRemove,
      addRules: rulesToAdd,
    });

    console.log('[iMacros] Filter rules updated:', {
      images: filterState.images,
      flash: filterState.flash,
      added: rulesToAdd.length,
      removed: rulesToRemove.length,
    });
  } catch (error) {
    console.error('[iMacros] Failed to update filter rules:', error);
    throw error;
  }
}

/**
 * Set filter status for a specific type
 */
export async function setFilter(
  filterType: FilterType,
  status: FilterStatus
): Promise<void> {
  const enabled = status === 'ON';

  switch (filterType) {
    case 'IMAGES':
      filterState.images = enabled;
      break;
    case 'FLASH':
      filterState.flash = enabled;
      break;
    case 'POPUPS':
      filterState.popups = enabled;
      // Popup blocking is handled differently via content scripts
      // We don't use declarativeNetRequest for popups
      console.log('[iMacros] Popup filter set to:', enabled);
      return;
  }

  await updateFilterRules();
}

/**
 * Disable all filters
 */
export async function disableAllFilters(): Promise<void> {
  filterState.images = false;
  filterState.flash = false;
  filterState.popups = false;

  await updateFilterRules();
  console.log('[iMacros] All filters disabled');
}

/**
 * Get current filter state
 */
export function getFilterState(): FilterState {
  return { ...filterState };
}

/**
 * Initialize filter rules (clear any existing dynamic rules)
 */
export async function initFilterRules(): Promise<void> {
  // Check if declarativeNetRequest API is available
  if (!chrome.declarativeNetRequest) {
    console.warn('[iMacros] declarativeNetRequest API not available');
    return;
  }

  try {
    // Get existing dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map((rule) => rule.id);

    // Remove all our rules
    const ourRuleIds = Object.values(RULE_IDS);
    const toRemove = existingIds.filter((id) => (ourRuleIds as readonly number[]).includes(id));

    if (toRemove.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: toRemove,
      });
    }

    console.log('[iMacros] Filter rules initialized, cleared', toRemove.length, 'existing rules');
  } catch (error) {
    console.error('[iMacros] Failed to initialize filter rules:', error);
  }
}

// ============================================================================
// Message Handler Integration
// ============================================================================

/**
 * Handle LOGIN_CONFIG message from ONLOGIN command
 */
export function handleLoginConfig(payload: {
  config: {
    user: string;
    password: string;
    active: boolean;
    timeout?: number;
  };
  append?: boolean;
}): { success: boolean; error?: string } {
  try {
    if (payload.config.active) {
      setAuthCredentials(
        payload.config.user,
        payload.config.password,
        undefined,
        payload.config.timeout,
        payload.append ?? false
      );
    } else {
      clearAuthCredentials();
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Handle setFilter message from FILTER command
 */
export async function handleSetFilter(payload: {
  filterType: FilterType;
  status: FilterStatus;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await setFilter(payload.filterType, payload.status);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize all web request handlers
 */
export async function initWebRequestHandlers(): Promise<void> {
  console.log('[iMacros] Initializing web request handlers...');

  // Initialize HTTP auth handler
  initAuthHandler();

  // Initialize filter rules
  await initFilterRules();

  console.log('[iMacros] Web request handlers initialized');
}

// Export types for use in background.ts
export type { AuthCredentials, FilterType, FilterStatus, FilterState };
