/**
 * Tests for Credential Storage Service
 * native-host/src/services/credential-storage.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Mock electron module BEFORE importing CredentialStorageService.
// The source code does both `import { app } from 'electron'` and
// `require('electron').safeStorage`. We provide a full mock so the
// module-level code doesn't throw.
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-electron-userdata'),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}));

import {
  CredentialStorageService,
  createCredentialStorage,
} from '../../native-host/src/services/credential-storage';

let tmpDir: string;
let storagePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imacros-cred-test-'));
  storagePath = path.join(tmpDir, 'credentials.enc');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Helper: create a service instance with useSafeStorage disabled.
 * This bypasses the safeStorage check so tests use master-password
 * based encryption, which is what we want to test.
 */
function createService(overrides: Record<string, unknown> = {}) {
  return new CredentialStorageService({
    storagePath,
    useSafeStorage: false,
    ...overrides,
  });
}

describe('Credential Storage Service', () => {
  // =========================================================================
  // 1. Master password
  // =========================================================================
  describe('Master password', () => {
    it('should set a master password and unlock the store', () => {
      const service = createService();
      const result = service.setMasterPassword('secret123');
      expect(result.success).toBe(true);
      expect(service.hasMasterPassword()).toBe(true);
      expect(service.isUnlocked()).toBe(true);
    });

    it('should fail when setting master password twice', () => {
      const service = createService();
      service.setMasterPassword('first');
      const result = service.setMasterPassword('second');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already set');
    });

    it('should unlock with correct password', () => {
      const service = createService();
      service.setMasterPassword('mypass');
      service.lock();
      expect(service.isUnlocked()).toBe(false);

      const result = service.unlock('mypass');
      expect(result.success).toBe(true);
      expect(service.isUnlocked()).toBe(true);
    });

    it('should fail to unlock with wrong password', () => {
      const service = createService();
      service.setMasterPassword('correct');
      service.lock();

      const result = service.unlock('wrong');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid master password');
    });

    it('should fail to unlock when no master password is set', () => {
      const service = createService();
      const result = service.unlock('anything');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No master password set');
    });

    it('should lock and clear session keys', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.createSessionKey('sess1');
      service.lock();

      expect(service.isUnlocked()).toBe(false);
      expect(service.validateSessionKey('sess1', 'anything')).toBe(false);
    });

    it('should change master password successfully', () => {
      const service = createService();
      service.setMasterPassword('oldpass');

      const result = service.changeMasterPassword('oldpass', 'newpass');
      expect(result.success).toBe(true);

      // Lock and unlock with new password
      service.lock();
      const unlockResult = service.unlock('newpass');
      expect(unlockResult.success).toBe(true);
    });

    it('should fail to change master password with wrong current password', () => {
      const service = createService();
      service.setMasterPassword('realpass');
      service.lock();

      const result = service.changeMasterPassword('wrong', 'newpass');
      expect(result.success).toBe(false);
    });

    it('should not report as having master password initially', () => {
      const service = createService();
      expect(service.hasMasterPassword()).toBe(false);
      expect(service.isUnlocked()).toBe(false);
    });
  });

  // =========================================================================
  // 2. Credentials
  // =========================================================================
  describe('Credentials', () => {
    it('should store and retrieve a credential', () => {
      const service = createService();
      service.setMasterPassword('pass');

      const storeResult = service.storeCredential('mysite', 'password123');
      expect(storeResult.success).toBe(true);

      const getResult = service.getCredential('mysite');
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBe('password123');
    });

    it('should store data in encrypted form on disk', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('secret', 'topsecretvalue');

      // Read the raw file and verify the plaintext is NOT present
      const raw = fs.readFileSync(storagePath, 'utf-8');
      expect(raw).not.toContain('topsecretvalue');
    });

    it('should fail to retrieve nonexistent credential', () => {
      const service = createService();
      service.setMasterPassword('pass');

      const result = service.getCredential('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should delete a credential', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('todelete', 'val');

      const deleteResult = service.deleteCredential('todelete');
      expect(deleteResult.success).toBe(true);

      const getResult = service.getCredential('todelete');
      expect(getResult.success).toBe(false);
    });

    it('should fail to delete nonexistent credential', () => {
      const service = createService();
      const result = service.deleteCredential('nope');
      expect(result.success).toBe(false);
    });

    it('should list credential names', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('cred1', 'val1');
      service.storeCredential('cred2', 'val2');

      const list = service.listCredentials();
      expect(list.sort()).toEqual(['cred1', 'cred2']);
    });

    it('should fail to store when locked', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.lock();

      const result = service.storeCredential('x', 'y');
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });

    it('should fail to get when locked', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('site', 'pw');
      service.lock();

      const result = service.getCredential('site');
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });

    it('should persist credentials across instances', () => {
      const service1 = createService();
      service1.setMasterPassword('pass');
      service1.storeCredential('persist-test', 'persistedvalue');

      // Create new instance reading from the same file
      const service2 = createService();
      service2.unlock('pass');

      const result = service2.getCredential('persist-test');
      expect(result.success).toBe(true);
      expect(result.data).toBe('persistedvalue');
    });

    it('should overwrite credential with same name', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('dup', 'first');
      service.storeCredential('dup', 'second');

      const result = service.getCredential('dup');
      expect(result.success).toBe(true);
      expect(result.data).toBe('second');
    });
  });

  // =========================================================================
  // 3. Session keys
  // =========================================================================
  describe('Session keys', () => {
    it('should create and validate a session key', () => {
      const service = createService();
      const key = service.createSessionKey('session1');
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);

      expect(service.validateSessionKey('session1', key)).toBe(true);
    });

    it('should reject wrong session key', () => {
      const service = createService();
      service.createSessionKey('session2');

      expect(service.validateSessionKey('session2', 'wrong-key')).toBe(false);
    });

    it('should reject expired session key', () => {
      const service = createService();
      // Create with 1ms timeout so it expires immediately
      const key = service.createSessionKey('session3', 1);

      // Busy-wait for expiry
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      expect(service.validateSessionKey('session3', key)).toBe(false);
    });

    it('should refresh a session key', () => {
      const service = createService();
      const key = service.createSessionKey('session4', 60000);

      const refreshed = service.refreshSessionKey('session4', 120000);
      expect(refreshed).toBe(true);
      expect(service.validateSessionKey('session4', key)).toBe(true);
    });

    it('should fail to refresh nonexistent session', () => {
      const service = createService();
      expect(service.refreshSessionKey('nope')).toBe(false);
    });

    it('should invalidate a session key', () => {
      const service = createService();
      const key = service.createSessionKey('session5');
      service.invalidateSessionKey('session5');

      expect(service.validateSessionKey('session5', key)).toBe(false);
    });

    it('should return false for unknown session name', () => {
      const service = createService();
      expect(service.validateSessionKey('unknown', 'somekey')).toBe(false);
    });

    it('should create unique keys for different sessions', () => {
      const service = createService();
      const key1 = service.createSessionKey('s1');
      const key2 = service.createSessionKey('s2');
      expect(key1).not.toBe(key2);
    });
  });

  // =========================================================================
  // 4. Encrypted variables
  // =========================================================================
  describe('Encrypted variables', () => {
    it('should encrypt and decrypt a variable', () => {
      const service = createService();
      const encResult = service.encryptVariable('MY_VAR', 'secret-value', 'mypassword');
      expect(encResult.success).toBe(true);

      const decResult = service.decryptVariable('MY_VAR', 'mypassword');
      expect(decResult.success).toBe(true);
      expect(decResult.data).toBe('secret-value');
    });

    it('should fail to decrypt with wrong password', () => {
      const service = createService();
      service.encryptVariable('MY_VAR2', 'value', 'correct');

      const result = service.decryptVariable('MY_VAR2', 'wrong');
      expect(result.success).toBe(false);
    });

    it('should fail to decrypt nonexistent variable', () => {
      const service = createService();
      const result = service.decryptVariable('MISSING', 'pass');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should report hasEncryptedVariable correctly', () => {
      const service = createService();
      expect(service.hasEncryptedVariable('X')).toBe(false);

      service.encryptVariable('X', 'val', 'p');
      expect(service.hasEncryptedVariable('X')).toBe(true);
    });

    it('should delete an encrypted variable', () => {
      const service = createService();
      service.encryptVariable('DEL', 'v', 'p');

      const result = service.deleteEncryptedVariable('DEL');
      expect(result.success).toBe(true);
      expect(service.hasEncryptedVariable('DEL')).toBe(false);
    });

    it('should fail to delete nonexistent encrypted variable', () => {
      const service = createService();
      const result = service.deleteEncryptedVariable('NOPE');
      expect(result.success).toBe(false);
    });

    it('should list encrypted variable names', () => {
      const service = createService();
      service.encryptVariable('VAR_A', 'a', 'p');
      service.encryptVariable('VAR_B', 'b', 'p');

      const list = service.listEncryptedVariables();
      expect(list.sort()).toEqual(['VAR_A', 'VAR_B']);
    });

    it('should store encrypted variable data on disk (not plaintext)', () => {
      const service = createService();
      service.encryptVariable('DISK_VAR', 'plaintext-secret', 'pw');

      const raw = fs.readFileSync(storagePath, 'utf-8');
      expect(raw).not.toContain('plaintext-secret');
      expect(raw).toContain('DISK_VAR');
    });
  });

  // =========================================================================
  // 5. clearAll
  // =========================================================================
  describe('clearAll', () => {
    it('should clear credentials and variables but keep master password', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('c1', 'v1');
      service.encryptVariable('e1', 'val', 'p');

      const result = service.clearAll();
      expect(result.success).toBe(true);
      expect(service.listCredentials()).toEqual([]);
      expect(service.listEncryptedVariables()).toEqual([]);
      expect(service.hasMasterPassword()).toBe(true);
    });

    it('should clear master password when includeMasterPassword is true', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('c2', 'v2');

      const result = service.clearAll(true);
      expect(result.success).toBe(true);
      expect(service.hasMasterPassword()).toBe(false);
      expect(service.isUnlocked()).toBe(false);
    });

    it('should also clear session keys', () => {
      const service = createService();
      service.setMasterPassword('pass');
      const key = service.createSessionKey('mysess');

      service.clearAll();
      expect(service.validateSessionKey('mysess', key)).toBe(false);
    });
  });

  // =========================================================================
  // 6. Export / Import
  // =========================================================================
  describe('Export / Import encrypted variables', () => {
    it('should export and import encrypted variables', () => {
      const service1 = createService();
      service1.encryptVariable('EXP1', 'exportval1', 'pw1');
      service1.encryptVariable('EXP2', 'exportval2', 'pw2');

      const exported = service1.exportEncryptedVariables();
      expect(typeof exported).toBe('string');

      // Import into a new instance
      const storagePath2 = path.join(tmpDir, 'import.enc');
      const service2 = new CredentialStorageService({
        storagePath: storagePath2,
        useSafeStorage: false,
      });

      const importResult = service2.importEncryptedVariables(exported);
      expect(importResult.success).toBe(true);

      // Verify decryption works on the imported data
      const dec1 = service2.decryptVariable('EXP1', 'pw1');
      expect(dec1.success).toBe(true);
      expect(dec1.data).toBe('exportval1');

      const dec2 = service2.decryptVariable('EXP2', 'pw2');
      expect(dec2.success).toBe(true);
      expect(dec2.data).toBe('exportval2');
    });

    it('should fail to import invalid JSON', () => {
      const service = createService();
      const result = service.importEncryptedVariables('not valid json {{{');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to import');
    });

    it('should merge imported variables with existing ones', () => {
      const service = createService();
      service.encryptVariable('EXISTING', 'val', 'p');

      const otherPath = path.join(tmpDir, 'other.enc');
      const otherService = new CredentialStorageService({
        storagePath: otherPath,
        useSafeStorage: false,
      });
      otherService.encryptVariable('NEW', 'newval', 'p2');
      const exported = otherService.exportEncryptedVariables();

      service.importEncryptedVariables(exported);

      expect(service.hasEncryptedVariable('EXISTING')).toBe(true);
      expect(service.hasEncryptedVariable('NEW')).toBe(true);
    });

    it('should return valid JSON from export', () => {
      const service = createService();
      service.encryptVariable('JSONTEST', 'val', 'p');

      const exported = service.exportEncryptedVariables();
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });

  // =========================================================================
  // 7. Credential expiration
  // =========================================================================
  describe('Credential expiration', () => {
    it('should immediately access a credential with expiration', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('expiring', 'val', 60000);

      const result = service.getCredential('expiring');
      expect(result.success).toBe(true);
      expect(result.data).toBe('val');
    });

    it('should reject an expired credential', () => {
      const service = createService();
      service.setMasterPassword('pass');
      // Store with 1ms expiry
      service.storeCredential('shortlived', 'val', 1);

      // Busy-wait for expiry
      const start = Date.now();
      while (Date.now() - start < 5) {
        // wait
      }

      const result = service.getCredential('shortlived');
      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should clean up expired credentials via cleanupExpired', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('exp1', 'v', 1);
      service.storeCredential('permanent', 'v2', 0);

      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 5) {
        // wait
      }

      service.cleanupExpired();
      expect(service.listCredentials()).toEqual(['permanent']);
    });

    it('should not expire credentials with expiresIn=0', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('forever', 'val', 0);

      // Even after some time
      const start = Date.now();
      while (Date.now() - start < 5) {
        // wait
      }

      const result = service.getCredential('forever');
      expect(result.success).toBe(true);
      expect(result.data).toBe('val');
    });
  });

  // =========================================================================
  // 8. Edge cases
  // =========================================================================
  describe('Edge cases', () => {
    it('should handle unicode characters in credentials', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('unicode', '\u00e4\u00f6\u00fc\u00df\u2603\ud83d\ude00');

      const result = service.getCredential('unicode');
      expect(result.success).toBe(true);
      expect(result.data).toBe('\u00e4\u00f6\u00fc\u00df\u2603\ud83d\ude00');
    });

    it('should handle unicode characters in encrypted variables', () => {
      const service = createService();
      service.encryptVariable('UNI', '\u4e16\u754c\u3053\u3093\u306b\u3061\u306f', 'pw');

      const result = service.decryptVariable('UNI', 'pw');
      expect(result.success).toBe(true);
      expect(result.data).toBe('\u4e16\u754c\u3053\u3093\u306b\u3061\u306f');
    });

    it('should handle empty string credential', () => {
      const service = createService();
      service.setMasterPassword('pass');
      service.storeCredential('empty', '');

      const result = service.getCredential('empty');
      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });

    it('should report safeStorage as unavailable when useSafeStorage is false', () => {
      const service = createService();
      expect(service.isSafeStorageAvailable()).toBe(false);
    });

    it('should use factory function createCredentialStorage', () => {
      const service = createCredentialStorage({ storagePath, useSafeStorage: false });
      expect(service).toBeInstanceOf(CredentialStorageService);
      expect(service.hasMasterPassword()).toBe(false);
    });

    it('should handle long password for master password', () => {
      const service = createService();
      const longPass = 'a'.repeat(1000);
      const result = service.setMasterPassword(longPass);
      expect(result.success).toBe(true);

      service.lock();
      const unlockResult = service.unlock(longPass);
      expect(unlockResult.success).toBe(true);
    });

    it('should change master password with no stored credentials', () => {
      const service = createService();
      service.setMasterPassword('oldpw');

      const changeResult = service.changeMasterPassword('oldpw', 'newpw');
      expect(changeResult.success).toBe(true);

      // Lock and unlock with new password
      service.lock();
      expect(service.unlock('newpw').success).toBe(true);
      // Old password should no longer work
      service.lock();
      expect(service.unlock('oldpw').success).toBe(false);
    });

    it('should handle special characters in credential names', () => {
      const service = createService();
      service.setMasterPassword('pass');
      const name = 'my.site/login@user:8080';
      service.storeCredential(name, 'pw');

      const result = service.getCredential(name);
      expect(result.success).toBe(true);
      expect(result.data).toBe('pw');
    });
  });
});
