/**
 * Integration Tests for Credential Storage and SET !ENCRYPTION
 *
 * Tests the encryption module's encrypt/decrypt functions, round-trip behavior,
 * key sensitivity, SET !ENCRYPTION modes (STOREDKEY, TMPKEY, NO), and
 * integration between the encryption module and the macro executor.
 */
import { describe, it, expect } from 'vitest';
import {
  encryptString,
  decryptString,
  encryptStringLegacy,
  decryptStringLegacy,
  encryptValue,
  decryptValue,
  validatePassword,
  isEncrypted,
  sha256,
  EncryptionType,
  EncryptionError,
  hexToByteArray,
  byteArrayToHex,
  byteArrayToBase64,
  base64ToByteArray,
  stringToByteArray,
  byteArrayToString,
  utf8Encode,
  utf8Decode,
} from '../../../shared/src/encryption';
import { executeMacro, IMACROS_ERROR_CODES } from '../../../shared/src/executor';

// ===== Encryption Module: encrypt/decrypt functions =====

describe('Encryption Module - Core Functions', () => {
  describe('encryptString / decryptString (new CBC format)', () => {
    it('should encrypt a string and return Base64 output', () => {
      const encrypted = encryptString('hello', 'password123');
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should decrypt an encrypted string back to the original', () => {
      const original = 'hello world';
      const password = 'myPassword';
      const encrypted = encryptString(original, password);
      const decrypted = decryptString(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should handle empty string encryption and decryption', () => {
      const original = '';
      const password = 'testKey';
      const encrypted = encryptString(original, password);
      const decrypted = decryptString(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should handle special characters', () => {
      const original = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';
      const password = 'specialKey!';
      const encrypted = encryptString(original, password);
      const decrypted = decryptString(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should handle unicode/multibyte characters', () => {
      const original = 'Caf\u00e9 \u4e2d\u6587 \u0440\u0443\u0441\u0441\u043a\u0438\u0439';
      const password = 'unicodeKey';
      const encrypted = encryptString(original, password);
      const decrypted = decryptString(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should handle long strings spanning multiple blocks', () => {
      const original = 'A'.repeat(500) + 'B'.repeat(500);
      const password = 'longKey';
      const encrypted = encryptString(original, password);
      const decrypted = decryptString(encrypted, password);
      expect(decrypted).toBe(original);
    });
  });

  describe('encryptStringLegacy / decryptStringLegacy (ECB hex format)', () => {
    it('should encrypt a string and return uppercase hex output', () => {
      const encrypted = encryptStringLegacy('test', 'password');
      expect(encrypted).toMatch(/^[0-9A-F]+$/);
    });

    it('should decrypt a legacy-encrypted string back to the original', () => {
      const original = 'Hello';
      const password = 'testPwd';
      const encrypted = encryptStringLegacy(original, password);
      const decrypted = decryptStringLegacy(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should produce deterministic output in ECB mode', () => {
      const message = 'deterministic test';
      const password = 'ecbKey';
      const encrypted1 = encryptStringLegacy(message, password);
      const encrypted2 = encryptStringLegacy(message, password);
      expect(encrypted1).toBe(encrypted2);
    });
  });

  describe('encryptValue / decryptValue', () => {
    it('should default to new CBC format', () => {
      const original = 'secret data';
      const password = 'valueKey';
      const encrypted = encryptValue(original, password);
      // New format is Base64
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(original);
    });

    it('should use legacy format when useLegacyMethod is true', () => {
      const original = 'secret data';
      const password = 'valueKey';
      const encrypted = encryptValue(original, password, true);
      // Legacy format is uppercase hex
      expect(encrypted).toMatch(/^[0-9A-F]+$/);
      const decrypted = decryptValue(encrypted, password);
      expect(decrypted).toBe(original);
    });
  });
});

// ===== Round-trip: encrypt then decrypt returns original text =====

describe('Encryption Round-Trip Tests', () => {
  const passwords = ['short', 'a-medium-length-password', 'a'.repeat(100)];
  const messages = [
    '',
    'a',
    'Hello, World!',
    'The quick brown fox jumps over the lazy dog.',
    '12345678901234567890',
    'Line1\nLine2\nLine3',
    '\t\ttabbed\tcontent',
    'Caf\u00e9 au lait',
    'X'.repeat(1024),
  ];

  for (const password of passwords) {
    for (const message of messages) {
      const label = message.length > 30
        ? `"${message.substring(0, 27)}..." (len=${message.length})`
        : `"${message}"`;
      const pwdLabel = password.length > 20
        ? `"${password.substring(0, 17)}..." (len=${password.length})`
        : `"${password}"`;

      it(`should round-trip with new format: message=${label}, password=${pwdLabel}`, () => {
        const encrypted = encryptString(message, password);
        const decrypted = decryptString(encrypted, password);
        expect(decrypted).toBe(message);
      });
    }
  }

  it('should round-trip with legacy format for short messages', () => {
    const original = 'legacy test';
    const password = 'legacyPwd';
    const encrypted = encryptStringLegacy(original, password);
    const decrypted = decryptStringLegacy(encrypted, password);
    expect(decrypted).toBe(original);
  });

  it('should round-trip with auto-detection: new format', () => {
    const original = 'auto-detect new';
    const password = 'autoKey';
    const encrypted = encryptString(original, password);
    // decryptString auto-detects format
    const decrypted = decryptString(encrypted, password);
    expect(decrypted).toBe(original);
  });

  it('should round-trip with auto-detection: legacy format', () => {
    const original = 'auto-detect legacy';
    const password = 'autoKey';
    const encrypted = encryptStringLegacy(original, password);
    // decryptString auto-detects hex format and uses legacy decryption
    const decrypted = decryptString(encrypted, password);
    expect(decrypted).toBe(original);
  });
});

// ===== Different keys produce different ciphertext =====

describe('Key Sensitivity Tests', () => {
  it('should produce different ciphertext with different keys (new format)', () => {
    const message = 'same message';
    const encrypted1 = encryptString(message, 'key1');
    const encrypted2 = encryptString(message, 'key2');
    // Both are CBC with random IV, so they will always differ even with same key.
    // But with different keys, the underlying encrypted bytes will differ too.
    // We can verify by checking that neither decrypts with the other's key.
    expect(decryptString(encrypted1, 'key1')).toBe(message);
    expect(decryptString(encrypted2, 'key2')).toBe(message);
    // Attempting cross-key decryption should fail
    expect(() => decryptString(encrypted1, 'key2')).toThrow(EncryptionError);
    expect(() => decryptString(encrypted2, 'key1')).toThrow(EncryptionError);
  });

  it('should produce different ciphertext with different keys (legacy format)', () => {
    const message = 'same message';
    const encrypted1 = encryptStringLegacy(message, 'keyA');
    const encrypted2 = encryptStringLegacy(message, 'keyB');
    // ECB mode is deterministic, so different keys must produce different output
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should produce same ciphertext with same key in ECB/legacy mode', () => {
    const message = 'test';
    const key = 'sameKey';
    const encrypted1 = encryptStringLegacy(message, key);
    const encrypted2 = encryptStringLegacy(message, key);
    expect(encrypted1).toBe(encrypted2);
  });

  it('should produce different ciphertext with same key in CBC/new mode (random IV)', () => {
    const message = 'test';
    const key = 'sameKey';
    const encrypted1 = encryptString(message, key);
    const encrypted2 = encryptString(message, key);
    // Due to random IV, these should differ
    expect(encrypted1).not.toBe(encrypted2);
    // But both should decrypt correctly
    expect(decryptString(encrypted1, key)).toBe(message);
    expect(decryptString(encrypted2, key)).toBe(message);
  });

  it('should derive different SHA-256 keys from different passwords', () => {
    const hash1 = sha256('password1');
    const hash2 = sha256('password2');
    expect(hash1).not.toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ===== Decryption with wrong key fails or produces wrong result =====

describe('Wrong Key Decryption Tests', () => {
  it('should throw EncryptionError when decrypting new format with wrong password', () => {
    const encrypted = encryptString('secret data', 'correctPassword');
    expect(() => decryptString(encrypted, 'wrongPassword')).toThrow(EncryptionError);
  });

  it('should throw EncryptionError with code 942 for wrong password on new format', () => {
    const encrypted = encryptString('test', 'rightKey');
    try {
      decryptString(encrypted, 'wrongKey');
      // Should not reach here
      expect.unreachable('Expected EncryptionError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EncryptionError);
      expect((e as EncryptionError).code).toBe(942);
    }
  });

  it('should throw EncryptionError when decrypting legacy format with wrong password', () => {
    const encrypted = encryptStringLegacy('secret', 'correctPwd');
    expect(() => decryptStringLegacy(encrypted, 'wrongPwd')).toThrow(EncryptionError);
  });

  it('should throw EncryptionError on invalid ciphertext encoding', () => {
    expect(() => decryptString('not!valid@base64#data', 'anyKey')).toThrow(EncryptionError);
  });

  it('should validate correct password with validatePassword()', () => {
    const password = 'testPassword';
    const encrypted = encryptString('some data', password);
    expect(validatePassword(encrypted, password)).toBe(true);
  });

  it('should reject incorrect password with validatePassword()', () => {
    const encrypted = encryptString('some data', 'correctPwd');
    expect(validatePassword(encrypted, 'wrongPwd')).toBe(false);
  });

  it('should detect encrypted values with isEncrypted()', () => {
    const newFormatEncrypted = encryptString('test', 'key');
    const legacyEncrypted = encryptStringLegacy('test', 'key');
    expect(isEncrypted(newFormatEncrypted)).toBe(true);
    expect(isEncrypted(legacyEncrypted)).toBe(true);
    expect(isEncrypted('plain text')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('short')).toBe(false);
  });
});

// ===== SET !ENCRYPTION mode tests via executor =====

describe('SET !ENCRYPTION Integration with Executor', () => {
  describe('SET !ENCRYPTION variable assignment', () => {
    it('should set !ENCRYPTION to NO', async () => {
      const result = await executeMacro('SET !ENCRYPTION NO');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.variables['!ENCRYPTION']).toBe('NO');
    });

    it('should default !ENCRYPTION to empty string', async () => {
      const result = await executeMacro('SET !VAR1 test');
      expect(result.success).toBe(true);
      expect(result.variables['!ENCRYPTION']).toBe('');
    });

    it('should set !ENCRYPTION to STOREDKEY', async () => {
      const result = await executeMacro('SET !ENCRYPTION STOREDKEY');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.variables['!ENCRYPTION']).toBe('STOREDKEY');
    });

    it('should set !ENCRYPTION to TMPKEY', async () => {
      const result = await executeMacro('SET !ENCRYPTION TMPKEY');
      expect(result.success).toBe(true);
      expect(result.errorCode).toBe(IMACROS_ERROR_CODES.OK);
      expect(result.variables['!ENCRYPTION']).toBe('TMPKEY');
    });

    it('should allow changing !ENCRYPTION mode during script execution', async () => {
      const script = [
        'SET !ENCRYPTION NO',
        'SET !VAR1 first',
        'SET !ENCRYPTION STOREDKEY',
        'SET !VAR2 second',
        'SET !ENCRYPTION TMPKEY',
        'SET !VAR3 third',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      // The final value of !ENCRYPTION should be TMPKEY
      expect(result.variables['!ENCRYPTION']).toBe('TMPKEY');
      expect(result.variables['!VAR1']).toBe('first');
      expect(result.variables['!VAR2']).toBe('second');
      expect(result.variables['!VAR3']).toBe('third');
    });

    it('should overwrite !ENCRYPTION mode', async () => {
      const script = [
        'SET !ENCRYPTION STOREDKEY',
        'SET !ENCRYPTION NO',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!ENCRYPTION']).toBe('NO');
    });
  });

  describe('SET !ENCRYPTION STOREDKEY mode behavior', () => {
    it('should store the STOREDKEY value in the variable context', async () => {
      const result = await executeMacro('SET !ENCRYPTION STOREDKEY');
      expect(result.success).toBe(true);
      // The executor stores the value as a string in the variable context
      expect(result.variables['!ENCRYPTION']).toBe('STOREDKEY');
    });

    it('should allow STOREDKEY to be read via variable expansion', async () => {
      const script = [
        'SET !ENCRYPTION STOREDKEY',
        'SET !VAR1 {{!ENCRYPTION}}',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('STOREDKEY');
    });
  });

  describe('SET !ENCRYPTION TMPKEY mode behavior', () => {
    it('should store the TMPKEY value in the variable context', async () => {
      const result = await executeMacro('SET !ENCRYPTION TMPKEY');
      expect(result.success).toBe(true);
      expect(result.variables['!ENCRYPTION']).toBe('TMPKEY');
    });

    it('should allow TMPKEY to be read via variable expansion', async () => {
      const script = [
        'SET !ENCRYPTION TMPKEY',
        'SET !VAR1 {{!ENCRYPTION}}',
      ].join('\n');
      const result = await executeMacro(script);
      expect(result.success).toBe(true);
      expect(result.variables['!VAR1']).toBe('TMPKEY');
    });
  });

  describe('SET !ENCRYPTION combined with encryption module', () => {
    it('should support using encryption functions based on !ENCRYPTION variable', async () => {
      // Simulate the workflow: set encryption mode, then use encryption functions
      // based on the mode stored in the variable
      const result = await executeMacro('SET !ENCRYPTION STOREDKEY');
      expect(result.success).toBe(true);

      const mode = result.variables['!ENCRYPTION'];
      expect(mode).toBe('STOREDKEY');

      // When mode is STOREDKEY, the extension would use a stored master password
      // to encrypt/decrypt values. We verify the encryption module supports this:
      const storedPassword = 'master-password-123';
      const sensitiveData = 'my-secret-value';
      const encrypted = encryptValue(sensitiveData, storedPassword);
      const decrypted = decryptValue(encrypted, storedPassword);
      expect(decrypted).toBe(sensitiveData);
    });

    it('should support TMPKEY mode workflow with session-based encryption', async () => {
      const result = await executeMacro('SET !ENCRYPTION TMPKEY');
      expect(result.success).toBe(true);

      const mode = result.variables['!ENCRYPTION'];
      expect(mode).toBe('TMPKEY');

      // When mode is TMPKEY, the extension prompts for a temporary password
      // that is only valid for the current session. Verify encryption works:
      const tmpPassword = 'temp-session-key-' + Date.now();
      const sensitiveData = 'session-sensitive-value';
      const encrypted = encryptValue(sensitiveData, tmpPassword);
      const decrypted = decryptValue(encrypted, tmpPassword);
      expect(decrypted).toBe(sensitiveData);
    });

    it('should use NO mode to disable encryption', async () => {
      const result = await executeMacro('SET !ENCRYPTION NO');
      expect(result.success).toBe(true);

      const mode = result.variables['!ENCRYPTION'];
      expect(mode).toBe('NO');

      // EncryptionType.NONE = 0 corresponds to no encryption
      expect(EncryptionType.NONE).toBe(0);
    });
  });
});

// ===== EncryptionType enum integration =====

describe('EncryptionType Enum Integration', () => {
  it('should have NONE=0, STORED=1, TEMP=2', () => {
    expect(EncryptionType.NONE).toBe(0);
    expect(EncryptionType.STORED).toBe(1);
    expect(EncryptionType.TEMP).toBe(2);
  });

  it('should map to SET !ENCRYPTION command values', () => {
    // Mapping between SET !ENCRYPTION values and EncryptionType:
    // NO -> EncryptionType.NONE (0)
    // STOREDKEY -> EncryptionType.STORED (1)
    // TMPKEY -> EncryptionType.TEMP (2)
    const modeMap: Record<string, number> = {
      'NO': EncryptionType.NONE,
      'STOREDKEY': EncryptionType.STORED,
      'TMPKEY': EncryptionType.TEMP,
    };

    expect(modeMap['NO']).toBe(0);
    expect(modeMap['STOREDKEY']).toBe(1);
    expect(modeMap['TMPKEY']).toBe(2);
  });

  it('should allow conditional encryption based on EncryptionType', () => {
    const encryptIfNeeded = (
      value: string,
      password: string,
      mode: EncryptionType
    ): string => {
      if (mode === EncryptionType.NONE) {
        return value; // No encryption
      }
      return encryptValue(value, password);
    };

    const decryptIfNeeded = (
      value: string,
      password: string,
      mode: EncryptionType
    ): string => {
      if (mode === EncryptionType.NONE) {
        return value;
      }
      return decryptValue(value, password);
    };

    const password = 'conditional-key';
    const original = 'conditional-data';

    // NONE mode - passthrough
    const noneResult = encryptIfNeeded(original, password, EncryptionType.NONE);
    expect(noneResult).toBe(original);

    // STORED mode - encrypt
    const storedResult = encryptIfNeeded(original, password, EncryptionType.STORED);
    expect(storedResult).not.toBe(original);
    expect(decryptIfNeeded(storedResult, password, EncryptionType.STORED)).toBe(original);

    // TEMP mode - encrypt
    const tempResult = encryptIfNeeded(original, password, EncryptionType.TEMP);
    expect(tempResult).not.toBe(original);
    expect(decryptIfNeeded(tempResult, password, EncryptionType.TEMP)).toBe(original);
  });
});

// ===== EncryptionError integration =====

describe('EncryptionError Integration', () => {
  it('should have correct name and default code', () => {
    const err = new EncryptionError('test');
    expect(err.name).toBe('EncryptionError');
    expect(err.code).toBe(940);
    expect(err.message).toBe('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('should support custom error codes', () => {
    const err = new EncryptionError('bad password', 942);
    expect(err.code).toBe(942);
    expect(err.message).toBe('bad password');
  });

  it('should be catchable and inspectable when decryption fails', () => {
    const encrypted = encryptString('data', 'correctKey');
    let caught = false;
    try {
      decryptString(encrypted, 'wrongKey');
    } catch (e) {
      caught = true;
      expect(e).toBeInstanceOf(EncryptionError);
      if (e instanceof EncryptionError) {
        expect(e.code).toBe(942);
        expect(e.message).toContain('bad password');
      }
    }
    expect(caught).toBe(true);
  });
});

// ===== Utility function integration =====

describe('Encryption Utility Integration', () => {
  it('should round-trip hex encoding', () => {
    const original = [0, 1, 127, 128, 255];
    const hex = byteArrayToHex(original);
    const restored = hexToByteArray(hex);
    expect(restored).toEqual(original);
  });

  it('should round-trip Base64 encoding', () => {
    const original = [72, 101, 108, 108, 111, 0, 255, 128];
    const b64 = byteArrayToBase64(original);
    const restored = base64ToByteArray(b64);
    expect(restored).toEqual(original);
  });

  it('should round-trip string-to-byte-array conversion', () => {
    const original = 'Hello World';
    const bytes = stringToByteArray(original);
    const restored = byteArrayToString(bytes);
    expect(restored).toBe(original);
  });

  it('should round-trip UTF-8 encoding for multibyte characters', () => {
    const original = '\u00e9\u00e8\u00ea \u4e2d\u6587';
    const encoded = utf8Encode(original);
    const decoded = utf8Decode(encoded);
    expect(decoded).toBe(original);
  });

  it('should produce consistent SHA-256 hashes', () => {
    // Known test vectors
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    // Same input should always produce the same hash
    expect(sha256('password')).toBe(sha256('password'));
    // Different inputs should produce different hashes
    expect(sha256('password1')).not.toBe(sha256('password2'));
  });
});
