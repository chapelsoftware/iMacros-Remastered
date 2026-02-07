/**
 * iMacros Security Module
 *
 * Provides security features including:
 * - Trusted sites list management
 * - Macro origin tracking and validation
 * - Security settings
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Macro origin types
 */
export type MacroOrigin = 'local' | 'url' | 'shared' | 'embedded' | 'unknown';

/**
 * Macro source information
 */
export interface MacroSource {
  /** Origin type of the macro */
  origin: MacroOrigin;
  /** URL or path where the macro came from */
  location: string;
  /** Domain extracted from URL (for url/shared origins) */
  domain?: string;
  /** Whether this source is trusted */
  trusted: boolean;
  /** Timestamp when the macro was loaded */
  loadedAt: number;
}

/**
 * Trusted site entry
 */
export interface TrustedSite {
  /** Domain pattern (e.g., "example.com" or "*.example.com") */
  domain: string;
  /** When the site was trusted */
  trustedAt: number;
  /** Optional note about why it was trusted */
  note?: string;
}

/**
 * Security settings
 */
export interface SecuritySettings {
  /** Whether to show warnings for untrusted macro sources */
  showUntrustedWarnings: boolean;
  /** List of trusted sites/domains */
  trustedSites: TrustedSite[];
  /** Whether to allow macros from URLs */
  allowUrlMacros: boolean;
  /** Whether to allow embedded macros (base64 in URL) */
  allowEmbeddedMacros: boolean;
  /** Whether to automatically trust local macros */
  trustLocalMacros: boolean;
}

/**
 * Default security settings
 */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  showUntrustedWarnings: true,
  trustedSites: [],
  allowUrlMacros: true,
  allowEmbeddedMacros: true,
  trustLocalMacros: true,
};

// ============================================================================
// Domain Extraction and Matching
// ============================================================================

/**
 * Extract domain from a URL
 */
export function extractDomain(url: string): string | null {
  try {
    // Handle imacros:// protocol
    if (url.startsWith('imacros://')) {
      // Extract any URL parameter that might contain a domain
      const match = url.match(/[?&]url=([^&]+)/);
      if (match) {
        return extractDomain(decodeURIComponent(match[1]));
      }
      return null;
    }

    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if a domain matches a pattern
 * Supports wildcard patterns like "*.example.com"
 */
export function domainMatchesPattern(domain: string, pattern: string): boolean {
  if (!domain || !pattern) return false;

  const normalizedDomain = domain.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Exact match
  if (normalizedDomain === normalizedPattern) {
    return true;
  }

  // Wildcard match (*.example.com matches sub.example.com)
  if (normalizedPattern.startsWith('*.')) {
    const baseDomain = normalizedPattern.slice(2);
    // Match the base domain itself or any subdomain
    return normalizedDomain === baseDomain || normalizedDomain.endsWith('.' + baseDomain);
  }

  return false;
}

// ============================================================================
// Macro Origin Detection
// ============================================================================

/**
 * Determine the origin of a macro based on its path or URL
 */
export function detectMacroOrigin(pathOrUrl: string): MacroOrigin {
  if (!pathOrUrl) {
    return 'unknown';
  }

  // Check for embedded content (base64 in URL)
  if (pathOrUrl.includes('content=') && pathOrUrl.startsWith('imacros://')) {
    return 'embedded';
  }

  // Check for URL-based macro
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return 'url';
  }

  // Check for shared macro (imacros:// protocol with URL reference)
  if (pathOrUrl.startsWith('imacros://')) {
    if (pathOrUrl.includes('url=')) {
      return 'shared';
    }
    // Local reference via imacros:// protocol
    return 'local';
  }

  // Check for file:// protocol
  if (pathOrUrl.startsWith('file://')) {
    return 'local';
  }

  // Assume local path (relative or absolute)
  return 'local';
}

/**
 * Create a MacroSource object from a path/URL and security settings
 */
export function createMacroSource(
  pathOrUrl: string,
  settings: SecuritySettings
): MacroSource {
  const origin = detectMacroOrigin(pathOrUrl);
  const domain = extractDomain(pathOrUrl);

  let trusted = false;

  // Determine trust based on origin and settings
  switch (origin) {
    case 'local':
      trusted = settings.trustLocalMacros;
      break;
    case 'url':
    case 'shared':
      if (domain) {
        trusted = isSiteTrusted(domain, settings.trustedSites);
      }
      break;
    case 'embedded':
      // Embedded macros check if the referring domain is trusted
      if (domain) {
        trusted = isSiteTrusted(domain, settings.trustedSites);
      }
      break;
    default:
      trusted = false;
  }

  return {
    origin,
    location: pathOrUrl,
    domain: domain ?? undefined,
    trusted,
    loadedAt: Date.now(),
  };
}

// ============================================================================
// Trusted Sites Management
// ============================================================================

/**
 * Check if a domain is in the trusted sites list
 */
export function isSiteTrusted(domain: string, trustedSites: TrustedSite[]): boolean {
  if (!domain || !trustedSites) return false;

  return trustedSites.some(site => domainMatchesPattern(domain, site.domain));
}

/**
 * Add a site to the trusted sites list
 */
export function addTrustedSite(
  domain: string,
  trustedSites: TrustedSite[],
  note?: string
): TrustedSite[] {
  // Normalize domain
  const normalizedDomain = domain.toLowerCase().trim();

  // Check if already trusted
  if (trustedSites.some(site => site.domain === normalizedDomain)) {
    return trustedSites;
  }

  const newSite: TrustedSite = {
    domain: normalizedDomain,
    trustedAt: Date.now(),
    note,
  };

  return [...trustedSites, newSite];
}

/**
 * Remove a site from the trusted sites list
 */
export function removeTrustedSite(
  domain: string,
  trustedSites: TrustedSite[]
): TrustedSite[] {
  const normalizedDomain = domain.toLowerCase().trim();
  return trustedSites.filter(site => site.domain !== normalizedDomain);
}

/**
 * Update a trusted site entry
 */
export function updateTrustedSite(
  domain: string,
  trustedSites: TrustedSite[],
  updates: Partial<Omit<TrustedSite, 'domain'>>
): TrustedSite[] {
  const normalizedDomain = domain.toLowerCase().trim();
  return trustedSites.map(site => {
    if (site.domain === normalizedDomain) {
      return { ...site, ...updates };
    }
    return site;
  });
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result for macro execution
 */
export interface MacroValidationResult {
  /** Whether the macro is allowed to run */
  allowed: boolean;
  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
  /** Reason for the decision */
  reason: string;
  /** The macro source information */
  source: MacroSource;
}

/**
 * Validate whether a macro should be allowed to run
 */
export function validateMacroSource(
  pathOrUrl: string,
  settings: SecuritySettings
): MacroValidationResult {
  const source = createMacroSource(pathOrUrl, settings);

  // Local macros are allowed if trustLocalMacros is enabled
  if (source.origin === 'local') {
    if (settings.trustLocalMacros) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: 'Local macros are trusted',
        source,
      };
    } else {
      return {
        allowed: true,
        requiresConfirmation: settings.showUntrustedWarnings,
        reason: 'Local macro from untrusted source',
        source,
      };
    }
  }

  // URL macros check
  if (source.origin === 'url') {
    if (!settings.allowUrlMacros) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'URL macros are disabled',
        source,
      };
    }

    if (source.trusted) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: `Trusted site: ${source.domain}`,
        source,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: settings.showUntrustedWarnings,
      reason: `Untrusted URL source: ${source.domain || source.location}`,
      source,
    };
  }

  // Shared macros (imacros:// with URL)
  if (source.origin === 'shared') {
    if (!settings.allowUrlMacros) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Shared macros from URLs are disabled',
        source,
      };
    }

    if (source.trusted) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: `Trusted shared source: ${source.domain}`,
        source,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: settings.showUntrustedWarnings,
      reason: `Untrusted shared source: ${source.domain || source.location}`,
      source,
    };
  }

  // Embedded macros (base64 content in URL)
  if (source.origin === 'embedded') {
    if (!settings.allowEmbeddedMacros) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Embedded macros are disabled',
        source,
      };
    }

    // Embedded macros always require confirmation unless from trusted source
    if (source.trusted) {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: 'Embedded macro from trusted source',
        source,
      };
    }

    return {
      allowed: true,
      requiresConfirmation: settings.showUntrustedWarnings,
      reason: 'Embedded macro from untrusted source',
      source,
    };
  }

  // Unknown origin - be cautious
  return {
    allowed: true,
    requiresConfirmation: settings.showUntrustedWarnings,
    reason: 'Unknown macro origin',
    source,
  };
}

// ============================================================================
// Settings Merge
// ============================================================================

/**
 * Merge partial security settings with defaults
 */
export function mergeSecuritySettings(
  partial: Partial<SecuritySettings>
): SecuritySettings {
  return { ...DEFAULT_SECURITY_SETTINGS, ...partial };
}

/**
 * Validate a domain pattern
 */
export function isValidDomainPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') return false;

  const trimmed = pattern.trim();
  if (trimmed.length === 0) return false;

  // Allow wildcard patterns
  const normalized = trimmed.startsWith('*.') ? trimmed.slice(2) : trimmed;

  // Basic domain validation (simplified)
  // Must contain at least one dot, no spaces, valid characters
  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  return domainRegex.test(normalized);
}
