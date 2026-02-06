/**
 * Unit Tests for iMacros Security Module
 *
 * Tests cover:
 * - Macro origin detection
 * - Domain extraction and matching
 * - Trusted sites management
 * - Macro source validation
 * - Security settings
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MacroOrigin,
  MacroSource,
  TrustedSite,
  SecuritySettings,
  DEFAULT_SECURITY_SETTINGS,
  extractDomain,
  domainMatchesPattern,
  detectMacroOrigin,
  createMacroSource,
  isSiteTrusted,
  addTrustedSite,
  removeTrustedSite,
  updateTrustedSite,
  validateMacroSource,
  mergeSecuritySettings,
  isValidDomainPattern,
} from '@shared/security';

describe('Security Module', () => {
  describe('extractDomain', () => {
    it('should extract domain from http URL', () => {
      expect(extractDomain('http://example.com/path')).toBe('example.com');
    });

    it('should extract domain from https URL', () => {
      expect(extractDomain('https://www.example.com/path?query=1')).toBe('www.example.com');
    });

    it('should extract domain from URL with port', () => {
      expect(extractDomain('https://example.com:8080/path')).toBe('example.com');
    });

    it('should lowercase domains', () => {
      expect(extractDomain('https://EXAMPLE.COM/path')).toBe('example.com');
    });

    it('should return null for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractDomain('')).toBeNull();
    });

    it('should return null for imacros:// without URL param', () => {
      expect(extractDomain('imacros://run/macro.iim')).toBeNull();
    });

    it('should extract domain from imacros:// with URL param', () => {
      const url = 'imacros://run?url=' + encodeURIComponent('https://example.com/macro.iim');
      expect(extractDomain(url)).toBe('example.com');
    });
  });

  describe('domainMatchesPattern', () => {
    it('should match exact domain', () => {
      expect(domainMatchesPattern('example.com', 'example.com')).toBe(true);
    });

    it('should match case-insensitively', () => {
      expect(domainMatchesPattern('Example.COM', 'example.com')).toBe(true);
    });

    it('should not match different domains', () => {
      expect(domainMatchesPattern('example.com', 'other.com')).toBe(false);
    });

    it('should match wildcard pattern for subdomains', () => {
      expect(domainMatchesPattern('sub.example.com', '*.example.com')).toBe(true);
    });

    it('should match wildcard pattern for the base domain', () => {
      expect(domainMatchesPattern('example.com', '*.example.com')).toBe(true);
    });

    it('should match deeply nested subdomains with wildcard', () => {
      expect(domainMatchesPattern('a.b.c.example.com', '*.example.com')).toBe(true);
    });

    it('should not match different base domain with wildcard', () => {
      expect(domainMatchesPattern('example.org', '*.example.com')).toBe(false);
    });

    it('should return false for empty domain', () => {
      expect(domainMatchesPattern('', 'example.com')).toBe(false);
    });

    it('should return false for empty pattern', () => {
      expect(domainMatchesPattern('example.com', '')).toBe(false);
    });
  });

  describe('detectMacroOrigin', () => {
    it('should detect local file path', () => {
      expect(detectMacroOrigin('/path/to/macro.iim')).toBe('local');
    });

    it('should detect relative file path', () => {
      expect(detectMacroOrigin('macros/test.iim')).toBe('local');
    });

    it('should detect file:// protocol', () => {
      expect(detectMacroOrigin('file:///path/to/macro.iim')).toBe('local');
    });

    it('should detect http URL', () => {
      expect(detectMacroOrigin('http://example.com/macro.iim')).toBe('url');
    });

    it('should detect https URL', () => {
      expect(detectMacroOrigin('https://example.com/macro.iim')).toBe('url');
    });

    it('should detect imacros:// local reference', () => {
      expect(detectMacroOrigin('imacros://run/macro.iim')).toBe('local');
    });

    it('should detect imacros:// shared URL reference', () => {
      const url = 'imacros://run?url=' + encodeURIComponent('https://example.com/macro.iim');
      expect(detectMacroOrigin(url)).toBe('shared');
    });

    it('should detect embedded macro (base64 content)', () => {
      expect(detectMacroOrigin('imacros://run?name=test&content=BASE64ENCODED')).toBe('embedded');
    });

    it('should return unknown for empty path', () => {
      expect(detectMacroOrigin('')).toBe('unknown');
    });
  });

  describe('createMacroSource', () => {
    let settings: SecuritySettings;

    beforeEach(() => {
      settings = { ...DEFAULT_SECURITY_SETTINGS };
    });

    it('should create source for local macro with trust', () => {
      settings.trustLocalMacros = true;
      const source = createMacroSource('/path/to/macro.iim', settings);

      expect(source.origin).toBe('local');
      expect(source.location).toBe('/path/to/macro.iim');
      expect(source.trusted).toBe(true);
      expect(source.loadedAt).toBeGreaterThan(0);
    });

    it('should create untrusted source for local macro when disabled', () => {
      settings.trustLocalMacros = false;
      const source = createMacroSource('/path/to/macro.iim', settings);

      expect(source.origin).toBe('local');
      expect(source.trusted).toBe(false);
    });

    it('should create source for URL macro with domain', () => {
      const source = createMacroSource('https://example.com/macro.iim', settings);

      expect(source.origin).toBe('url');
      expect(source.domain).toBe('example.com');
      expect(source.trusted).toBe(false);
    });

    it('should trust URL macro from trusted site', () => {
      settings.trustedSites = [{ domain: 'example.com', trustedAt: Date.now() }];
      const source = createMacroSource('https://example.com/macro.iim', settings);

      expect(source.trusted).toBe(true);
    });

    it('should create source for embedded macro', () => {
      const source = createMacroSource('imacros://run?name=test&content=ABC123', settings);

      expect(source.origin).toBe('embedded');
      expect(source.trusted).toBe(false);
    });
  });

  describe('isSiteTrusted', () => {
    const trustedSites: TrustedSite[] = [
      { domain: 'example.com', trustedAt: Date.now() },
      { domain: '*.trusted.org', trustedAt: Date.now() },
    ];

    it('should return true for exact match', () => {
      expect(isSiteTrusted('example.com', trustedSites)).toBe(true);
    });

    it('should return true for wildcard match', () => {
      expect(isSiteTrusted('sub.trusted.org', trustedSites)).toBe(true);
    });

    it('should return false for untrusted domain', () => {
      expect(isSiteTrusted('malicious.com', trustedSites)).toBe(false);
    });

    it('should return false for empty domain', () => {
      expect(isSiteTrusted('', trustedSites)).toBe(false);
    });

    it('should return false for empty trusted sites list', () => {
      expect(isSiteTrusted('example.com', [])).toBe(false);
    });
  });

  describe('addTrustedSite', () => {
    it('should add new trusted site', () => {
      const sites: TrustedSite[] = [];
      const result = addTrustedSite('example.com', sites);

      expect(result.length).toBe(1);
      expect(result[0].domain).toBe('example.com');
      expect(result[0].trustedAt).toBeGreaterThan(0);
    });

    it('should add site with note', () => {
      const sites: TrustedSite[] = [];
      const result = addTrustedSite('example.com', sites, 'Company intranet');

      expect(result[0].note).toBe('Company intranet');
    });

    it('should not add duplicate site', () => {
      const sites: TrustedSite[] = [{ domain: 'example.com', trustedAt: Date.now() }];
      const result = addTrustedSite('example.com', sites);

      expect(result.length).toBe(1);
    });

    it('should normalize domain to lowercase', () => {
      const sites: TrustedSite[] = [];
      const result = addTrustedSite('EXAMPLE.COM', sites);

      expect(result[0].domain).toBe('example.com');
    });

    it('should preserve existing sites', () => {
      const sites: TrustedSite[] = [{ domain: 'existing.com', trustedAt: Date.now() }];
      const result = addTrustedSite('new.com', sites);

      expect(result.length).toBe(2);
      expect(result[0].domain).toBe('existing.com');
      expect(result[1].domain).toBe('new.com');
    });
  });

  describe('removeTrustedSite', () => {
    it('should remove existing site', () => {
      const sites: TrustedSite[] = [
        { domain: 'example.com', trustedAt: Date.now() },
        { domain: 'other.com', trustedAt: Date.now() },
      ];
      const result = removeTrustedSite('example.com', sites);

      expect(result.length).toBe(1);
      expect(result[0].domain).toBe('other.com');
    });

    it('should handle non-existent site', () => {
      const sites: TrustedSite[] = [{ domain: 'example.com', trustedAt: Date.now() }];
      const result = removeTrustedSite('nonexistent.com', sites);

      expect(result.length).toBe(1);
    });

    it('should be case-insensitive', () => {
      const sites: TrustedSite[] = [{ domain: 'example.com', trustedAt: Date.now() }];
      const result = removeTrustedSite('EXAMPLE.COM', sites);

      expect(result.length).toBe(0);
    });
  });

  describe('updateTrustedSite', () => {
    it('should update site note', () => {
      const sites: TrustedSite[] = [{ domain: 'example.com', trustedAt: 1000 }];
      const result = updateTrustedSite('example.com', sites, { note: 'Updated note' });

      expect(result[0].note).toBe('Updated note');
      expect(result[0].trustedAt).toBe(1000); // Unchanged
    });

    it('should not modify non-matching sites', () => {
      const sites: TrustedSite[] = [
        { domain: 'example.com', trustedAt: 1000, note: 'Original' },
        { domain: 'other.com', trustedAt: 2000, note: 'Other' },
      ];
      const result = updateTrustedSite('example.com', sites, { note: 'Updated' });

      expect(result[0].note).toBe('Updated');
      expect(result[1].note).toBe('Other');
    });
  });

  describe('validateMacroSource', () => {
    let settings: SecuritySettings;

    beforeEach(() => {
      settings = { ...DEFAULT_SECURITY_SETTINGS };
    });

    describe('local macros', () => {
      it('should allow local macros when trusted', () => {
        settings.trustLocalMacros = true;
        const result = validateMacroSource('/path/to/macro.iim', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(false);
      });

      it('should require confirmation for untrusted local macros', () => {
        settings.trustLocalMacros = false;
        settings.showUntrustedWarnings = true;
        const result = validateMacroSource('/path/to/macro.iim', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(true);
      });

      it('should not require confirmation if warnings disabled', () => {
        settings.trustLocalMacros = false;
        settings.showUntrustedWarnings = false;
        const result = validateMacroSource('/path/to/macro.iim', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(false);
      });
    });

    describe('URL macros', () => {
      it('should block URL macros when disabled', () => {
        settings.allowUrlMacros = false;
        const result = validateMacroSource('https://example.com/macro.iim', settings);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });

      it('should allow URL macros from trusted sites', () => {
        settings.trustedSites = [{ domain: 'example.com', trustedAt: Date.now() }];
        const result = validateMacroSource('https://example.com/macro.iim', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(false);
      });

      it('should require confirmation for untrusted URL macros', () => {
        settings.showUntrustedWarnings = true;
        const result = validateMacroSource('https://untrusted.com/macro.iim', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(true);
        expect(result.source.domain).toBe('untrusted.com');
      });
    });

    describe('embedded macros', () => {
      it('should block embedded macros when disabled', () => {
        settings.allowEmbeddedMacros = false;
        const result = validateMacroSource('imacros://run?name=test&content=ABC', settings);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });

      it('should require confirmation for untrusted embedded macros', () => {
        settings.showUntrustedWarnings = true;
        const result = validateMacroSource('imacros://run?name=test&content=ABC', settings);

        expect(result.allowed).toBe(true);
        expect(result.requiresConfirmation).toBe(true);
      });
    });

    describe('shared macros', () => {
      it('should treat shared macros like URL macros', () => {
        settings.allowUrlMacros = false;
        const url = 'imacros://run?url=' + encodeURIComponent('https://example.com/macro.iim');
        const result = validateMacroSource(url, settings);

        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('mergeSecuritySettings', () => {
    it('should return defaults for empty object', () => {
      const result = mergeSecuritySettings({});
      expect(result).toEqual(DEFAULT_SECURITY_SETTINGS);
    });

    it('should override specific properties', () => {
      const result = mergeSecuritySettings({
        showUntrustedWarnings: false,
        trustLocalMacros: false,
      });

      expect(result.showUntrustedWarnings).toBe(false);
      expect(result.trustLocalMacros).toBe(false);
      expect(result.allowUrlMacros).toBe(DEFAULT_SECURITY_SETTINGS.allowUrlMacros);
    });

    it('should merge trusted sites', () => {
      const sites: TrustedSite[] = [{ domain: 'test.com', trustedAt: Date.now() }];
      const result = mergeSecuritySettings({ trustedSites: sites });

      expect(result.trustedSites).toEqual(sites);
    });
  });

  describe('isValidDomainPattern', () => {
    it('should validate simple domain', () => {
      expect(isValidDomainPattern('example.com')).toBe(true);
    });

    it('should validate subdomain', () => {
      expect(isValidDomainPattern('sub.example.com')).toBe(true);
    });

    it('should validate wildcard pattern', () => {
      expect(isValidDomainPattern('*.example.com')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidDomainPattern('')).toBe(false);
    });

    it('should reject whitespace only', () => {
      expect(isValidDomainPattern('   ')).toBe(false);
    });

    it('should reject domain without TLD', () => {
      expect(isValidDomainPattern('localhost')).toBe(false);
    });

    it('should reject domain starting with hyphen', () => {
      expect(isValidDomainPattern('-example.com')).toBe(false);
    });

    it('should reject domain ending with hyphen', () => {
      expect(isValidDomainPattern('example-.com')).toBe(false);
    });

    it('should accept domain with hyphens in middle', () => {
      expect(isValidDomainPattern('my-example.com')).toBe(true);
    });

    it('should accept long subdomain chain', () => {
      expect(isValidDomainPattern('a.b.c.d.example.com')).toBe(true);
    });
  });

  describe('DEFAULT_SECURITY_SETTINGS', () => {
    it('should have warnings enabled by default', () => {
      expect(DEFAULT_SECURITY_SETTINGS.showUntrustedWarnings).toBe(true);
    });

    it('should have empty trusted sites by default', () => {
      expect(DEFAULT_SECURITY_SETTINGS.trustedSites).toEqual([]);
    });

    it('should allow URL macros by default', () => {
      expect(DEFAULT_SECURITY_SETTINGS.allowUrlMacros).toBe(true);
    });

    it('should allow embedded macros by default', () => {
      expect(DEFAULT_SECURITY_SETTINGS.allowEmbeddedMacros).toBe(true);
    });

    it('should trust local macros by default', () => {
      expect(DEFAULT_SECURITY_SETTINGS.trustLocalMacros).toBe(true);
    });
  });

  describe('MacroSource interface', () => {
    it('should have all required properties', () => {
      const source: MacroSource = {
        origin: 'local',
        location: '/path/to/macro.iim',
        trusted: true,
        loadedAt: Date.now(),
      };

      expect(source.origin).toBe('local');
      expect(source.location).toBe('/path/to/macro.iim');
      expect(source.trusted).toBe(true);
      expect(source.loadedAt).toBeGreaterThan(0);
    });

    it('should allow optional domain property', () => {
      const source: MacroSource = {
        origin: 'url',
        location: 'https://example.com/macro.iim',
        domain: 'example.com',
        trusted: false,
        loadedAt: Date.now(),
      };

      expect(source.domain).toBe('example.com');
    });
  });

  describe('Edge Cases', () => {
    it('should handle URL with unusual characters', () => {
      const url = 'https://example.com/path/macro%20name.iim?key=value#hash';
      expect(extractDomain(url)).toBe('example.com');
    });

    it('should handle international domains', () => {
      // Punycode domains
      expect(isValidDomainPattern('xn--nxasmq5b.com')).toBe(true);
    });

    it('should handle wildcard matching edge cases', () => {
      // Should not match if pattern is for different TLD
      expect(domainMatchesPattern('example.com', '*.example.org')).toBe(false);

      // Should match base domain with wildcard
      expect(domainMatchesPattern('example.com', '*.example.com')).toBe(true);
    });

    it('should handle validation with undefined domain', () => {
      const settings = { ...DEFAULT_SECURITY_SETTINGS };
      settings.trustedSites = [{ domain: 'example.com', trustedAt: Date.now() }];

      // Local path has no domain (extractDomain returns null for non-URL)
      const result = validateMacroSource('/local/macro.iim', settings);
      expect(result.source.domain).toBeNull();
    });
  });
});
