/**
 * Credential Storage Service for iMacros Native Host
 *
 * Provides secure credential storage using AES-256-GCM encryption with
 * PBKDF2 key derivation. Supports master password, session keys, and
 * encrypted variable storage for the !ENCRYPTION commands in iMacros.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Encryption algorithm constants
 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Stored credential structure
 */
export interface StoredCredential {
  /** Encrypted credential data */
  encryptedData: string;
  /** Salt used for key derivation (base64) */
  salt: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64) */
  authTag: string;
  /** Timestamp when the credential was stored */
  createdAt: number;
  /** Timestamp when the credential expires (0 for never) */
  expiresAt: number;
}

/**
 * Session key structure
 */
export interface SessionKey {
  /** The session key value */
  key: string;
  /** Timestamp when the session was created */
  createdAt: number;
  /** Timestamp when the session expires */
  expiresAt: number;
}

/**
 * Encrypted variable structure for !ENCRYPTION commands
 */
export interface EncryptedVariable {
  /** Variable name */
  name: string;
  /** Encrypted value */
  encryptedValue: string;
  /** Salt for key derivation (base64) */
  salt: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Authentication tag (base64) */
  authTag: string;
}

/**
 * Credential storage data structure
 */
interface CredentialStore {
  /** Version of the storage format */
  version: number;
  /** Master password hash for verification */
  masterPasswordHash?: string;
  /** Salt for master password (base64) */
  masterPasswordSalt?: string;
  /** Stored credentials by name */
  credentials: Record<string, StoredCredential>;
  /** Encrypted variables for !ENCRYPTION */
  encryptedVariables: Record<string, EncryptedVariable>;
}

/**
 * Configuration for credential storage
 */
export interface CredentialStorageConfig {
  /** Path to store credential file */
  storagePath?: string;
  /** Default session timeout in milliseconds (default: 30 minutes) */
  sessionTimeout?: number;
}

/**
 * Result of credential operations
 */
export interface CredentialResult {
  success: boolean;
  error?: string;
  data?: string;
}

/**
 * Derive an encryption key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    KEY_DERIVATION_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Hash a password for verification
 */
function hashPassword(password: string, salt: Buffer): string {
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    KEY_DERIVATION_ITERATIONS,
    64,
    'sha512'
  );
  return hash.toString('base64');
}

/**
 * Encrypt data using AES-256-GCM
 */
function encrypt(
  data: string,
  key: Buffer
): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
function decrypt(
  encryptedData: string,
  key: Buffer,
  iv: string,
  authTag: string
): string {
  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTag, 'base64');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Credential Storage Service
 *
 * Provides secure storage for passwords and sensitive data using
 * AES-256-GCM encryption with PBKDF2 key derivation.
 */
export class CredentialStorageService {
  private config: Required<CredentialStorageConfig>;
  private store: CredentialStore;
  private sessionKeys: Map<string, SessionKey> = new Map();
  private masterKey: Buffer | null = null;
  private unlocked: boolean = false;

  /**
   * Create a new Credential Storage Service
   *
   * @param config - Configuration options
   */
  constructor(config: CredentialStorageConfig = {}) {
    this.config = {
      storagePath: config.storagePath ?? this.getDefaultStoragePath(),
      sessionTimeout: config.sessionTimeout ?? 30 * 60 * 1000, // 30 minutes
    };

    this.store = this.loadStore();
  }

  /**
   * Get the default storage path
   */
  private getDefaultStoragePath(): string {
    return path.join(os.homedir(), '.imacros', 'credentials.enc');
  }

  /**
   * Load the credential store from disk
   */
  private loadStore(): CredentialStore {
    try {
      if (fs.existsSync(this.config.storagePath)) {
        const data = fs.readFileSync(this.config.storagePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[CredentialStorage] Failed to load store:', error);
    }

    return {
      version: 1,
      credentials: {},
      encryptedVariables: {},
    };
  }

  /**
   * Save the credential store to disk
   */
  private saveStore(): void {
    try {
      const dir = path.dirname(this.config.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.config.storagePath,
        JSON.stringify(this.store, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('[CredentialStorage] Failed to save store:', error);
    }
  }

  /**
   * Check if a master password is set
   */
  hasMasterPassword(): boolean {
    return !!this.store.masterPasswordHash;
  }

  /**
   * Check if the storage is currently unlocked
   */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Set the master password for the credential store
   *
   * @param password - The master password to set
   * @returns Result indicating success or failure
   */
  setMasterPassword(password: string): CredentialResult {
    if (this.store.masterPasswordHash) {
      return {
        success: false,
        error: 'Master password already set. Use changeMasterPassword() instead.',
      };
    }

    const salt = crypto.randomBytes(SALT_LENGTH);
    const hash = hashPassword(password, salt);

    this.store.masterPasswordHash = hash;
    this.store.masterPasswordSalt = salt.toString('base64');
    this.masterKey = deriveKey(password, salt);
    this.unlocked = true;

    this.saveStore();

    return { success: true };
  }

  /**
   * Change the master password
   *
   * @param currentPassword - The current master password
   * @param newPassword - The new master password
   * @returns Result indicating success or failure
   */
  changeMasterPassword(
    currentPassword: string,
    newPassword: string
  ): CredentialResult {
    // Verify current password
    const unlockResult = this.unlock(currentPassword);
    if (!unlockResult.success) {
      return unlockResult;
    }

    // Re-encrypt all credentials with the new key
    const newSalt = crypto.randomBytes(SALT_LENGTH);
    const newKey = deriveKey(newPassword, newSalt);

    // Re-encrypt each credential
    for (const name of Object.keys(this.store.credentials)) {
      const credential = this.store.credentials[name];
      const oldKey = deriveKey(
        currentPassword,
        Buffer.from(credential.salt, 'base64')
      );

      try {
        // Decrypt with old key
        const decrypted = decrypt(
          credential.encryptedData,
          oldKey,
          credential.iv,
          credential.authTag
        );

        // Encrypt with new key
        const credentialSalt = crypto.randomBytes(SALT_LENGTH);
        const credentialKey = deriveKey(newPassword, credentialSalt);
        const { encrypted, iv, authTag } = encrypt(decrypted, credentialKey);

        this.store.credentials[name] = {
          ...credential,
          encryptedData: encrypted,
          salt: credentialSalt.toString('base64'),
          iv,
          authTag,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to re-encrypt credential: ${name}`,
        };
      }
    }

    // Re-encrypt encrypted variables
    for (const name of Object.keys(this.store.encryptedVariables)) {
      const variable = this.store.encryptedVariables[name];
      const oldKey = deriveKey(
        currentPassword,
        Buffer.from(variable.salt, 'base64')
      );

      try {
        const decrypted = decrypt(
          variable.encryptedValue,
          oldKey,
          variable.iv,
          variable.authTag
        );

        const varSalt = crypto.randomBytes(SALT_LENGTH);
        const varKey = deriveKey(newPassword, varSalt);
        const { encrypted, iv, authTag } = encrypt(decrypted, varKey);

        this.store.encryptedVariables[name] = {
          ...variable,
          encryptedValue: encrypted,
          salt: varSalt.toString('base64'),
          iv,
          authTag,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to re-encrypt variable: ${name}`,
        };
      }
    }

    // Update master password hash
    this.store.masterPasswordHash = hashPassword(newPassword, newSalt);
    this.store.masterPasswordSalt = newSalt.toString('base64');
    this.masterKey = newKey;

    this.saveStore();

    return { success: true };
  }

  /**
   * Unlock the credential store with the master password
   *
   * @param password - The master password
   * @returns Result indicating success or failure
   */
  unlock(password: string): CredentialResult {
    if (!this.store.masterPasswordHash || !this.store.masterPasswordSalt) {
      return {
        success: false,
        error: 'No master password set. Use setMasterPassword() first.',
      };
    }

    const salt = Buffer.from(this.store.masterPasswordSalt, 'base64');
    const hash = hashPassword(password, salt);

    if (hash !== this.store.masterPasswordHash) {
      return {
        success: false,
        error: 'Invalid master password',
      };
    }

    this.masterKey = deriveKey(password, salt);
    this.unlocked = true;

    return { success: true };
  }

  /**
   * Lock the credential store
   */
  lock(): void {
    this.masterKey = null;
    this.unlocked = false;
    this.sessionKeys.clear();
  }

  /**
   * Store a credential securely
   *
   * @param name - Name/identifier for the credential
   * @param value - The credential value to store
   * @param expiresIn - Optional expiration time in milliseconds (0 for never)
   * @returns Result indicating success or failure
   */
  storeCredential(
    name: string,
    value: string,
    expiresIn: number = 0
  ): CredentialResult {
    if (!this.unlocked || !this.masterKey) {
      return {
        success: false,
        error: 'Storage is locked. Call unlock() first.',
      };
    }

    try {
      const salt = crypto.randomBytes(SALT_LENGTH);
      const key = deriveKey(
        this.masterKey.toString('hex'),
        salt
      );
      const { encrypted, iv, authTag } = encrypt(value, key);
      const now = Date.now();

      this.store.credentials[name] = {
        encryptedData: encrypted,
        salt: salt.toString('base64'),
        iv,
        authTag,
        createdAt: now,
        expiresAt: expiresIn > 0 ? now + expiresIn : 0,
      };

      this.saveStore();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to store credential: ${error}`,
      };
    }
  }

  /**
   * Retrieve a credential
   *
   * @param name - Name/identifier of the credential
   * @returns Result with the credential value or error
   */
  getCredential(name: string): CredentialResult {
    const credential = this.store.credentials[name];

    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${name}`,
      };
    }

    // Check expiration
    if (credential.expiresAt > 0 && Date.now() > credential.expiresAt) {
      delete this.store.credentials[name];
      this.saveStore();
      return {
        success: false,
        error: `Credential expired: ${name}`,
      };
    }

    if (!this.unlocked || !this.masterKey) {
      return {
        success: false,
        error: 'Storage is locked. Call unlock() first.',
      };
    }

    try {
      const salt = Buffer.from(credential.salt, 'base64');
      const key = deriveKey(
        this.masterKey.toString('hex'),
        salt
      );
      const decrypted = decrypt(
        credential.encryptedData,
        key,
        credential.iv,
        credential.authTag
      );

      return { success: true, data: decrypted };
    } catch (error) {
      return {
        success: false,
        error: `Failed to retrieve credential: ${error}`,
      };
    }
  }

  /**
   * Delete a credential
   *
   * @param name - Name/identifier of the credential
   * @returns Result indicating success or failure
   */
  deleteCredential(name: string): CredentialResult {
    if (!this.store.credentials[name]) {
      return {
        success: false,
        error: `Credential not found: ${name}`,
      };
    }

    delete this.store.credentials[name];
    this.saveStore();

    return { success: true };
  }

  /**
   * List all stored credential names
   *
   * @returns Array of credential names
   */
  listCredentials(): string[] {
    return Object.keys(this.store.credentials);
  }

  /**
   * Create a session key that expires after a timeout
   *
   * @param name - Name/identifier for the session
   * @param timeoutMs - Session timeout in milliseconds (default: config.sessionTimeout)
   * @returns The generated session key
   */
  createSessionKey(name: string, timeoutMs?: number): string {
    const timeout = timeoutMs ?? this.config.sessionTimeout;
    const key = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    this.sessionKeys.set(name, {
      key,
      createdAt: now,
      expiresAt: now + timeout,
    });

    return key;
  }

  /**
   * Validate a session key
   *
   * @param name - Name/identifier of the session
   * @param key - The session key to validate
   * @returns True if the session key is valid and not expired
   */
  validateSessionKey(name: string, key: string): boolean {
    const session = this.sessionKeys.get(name);

    if (!session) {
      return false;
    }

    if (Date.now() > session.expiresAt) {
      this.sessionKeys.delete(name);
      return false;
    }

    return session.key === key;
  }

  /**
   * Refresh a session key's expiration
   *
   * @param name - Name/identifier of the session
   * @param timeoutMs - New timeout in milliseconds
   * @returns True if the session was refreshed
   */
  refreshSessionKey(name: string, timeoutMs?: number): boolean {
    const session = this.sessionKeys.get(name);

    if (!session || Date.now() > session.expiresAt) {
      return false;
    }

    const timeout = timeoutMs ?? this.config.sessionTimeout;
    session.expiresAt = Date.now() + timeout;

    return true;
  }

  /**
   * Invalidate a session key
   *
   * @param name - Name/identifier of the session
   */
  invalidateSessionKey(name: string): void {
    this.sessionKeys.delete(name);
  }

  /**
   * Store an encrypted variable (!ENCRYPTION command support)
   *
   * @param name - Variable name
   * @param value - Variable value to encrypt
   * @param password - Password to use for encryption
   * @returns Result indicating success or failure
   */
  encryptVariable(
    name: string,
    value: string,
    password: string
  ): CredentialResult {
    try {
      const salt = crypto.randomBytes(SALT_LENGTH);
      const key = deriveKey(password, salt);
      const { encrypted, iv, authTag } = encrypt(value, key);

      this.store.encryptedVariables[name] = {
        name,
        encryptedValue: encrypted,
        salt: salt.toString('base64'),
        iv,
        authTag,
      };

      this.saveStore();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to encrypt variable: ${error}`,
      };
    }
  }

  /**
   * Decrypt an encrypted variable (!ENCRYPTION command support)
   *
   * @param name - Variable name
   * @param password - Password used for encryption
   * @returns Result with decrypted value or error
   */
  decryptVariable(name: string, password: string): CredentialResult {
    const variable = this.store.encryptedVariables[name];

    if (!variable) {
      return {
        success: false,
        error: `Encrypted variable not found: ${name}`,
      };
    }

    try {
      const salt = Buffer.from(variable.salt, 'base64');
      const key = deriveKey(password, salt);
      const decrypted = decrypt(
        variable.encryptedValue,
        key,
        variable.iv,
        variable.authTag
      );

      return { success: true, data: decrypted };
    } catch (error) {
      return {
        success: false,
        error: `Failed to decrypt variable: ${error}`,
      };
    }
  }

  /**
   * Check if an encrypted variable exists
   *
   * @param name - Variable name
   * @returns True if the variable exists
   */
  hasEncryptedVariable(name: string): boolean {
    return !!this.store.encryptedVariables[name];
  }

  /**
   * Delete an encrypted variable
   *
   * @param name - Variable name
   * @returns Result indicating success or failure
   */
  deleteEncryptedVariable(name: string): CredentialResult {
    if (!this.store.encryptedVariables[name]) {
      return {
        success: false,
        error: `Encrypted variable not found: ${name}`,
      };
    }

    delete this.store.encryptedVariables[name];
    this.saveStore();

    return { success: true };
  }

  /**
   * List all encrypted variable names
   *
   * @returns Array of encrypted variable names
   */
  listEncryptedVariables(): string[] {
    return Object.keys(this.store.encryptedVariables);
  }

  /**
   * Clear all stored credentials
   *
   * @param includeMasterPassword - Whether to also clear the master password (default: false)
   * @returns Result indicating success or failure
   */
  clearAll(includeMasterPassword: boolean = false): CredentialResult {
    this.store.credentials = {};
    this.store.encryptedVariables = {};
    this.sessionKeys.clear();

    if (includeMasterPassword) {
      delete this.store.masterPasswordHash;
      delete this.store.masterPasswordSalt;
      this.masterKey = null;
      this.unlocked = false;
    }

    this.saveStore();

    return { success: true };
  }

  /**
   * Export encrypted variables for backup (returns encrypted data)
   *
   * @returns JSON string of encrypted variables
   */
  exportEncryptedVariables(): string {
    return JSON.stringify(this.store.encryptedVariables);
  }

  /**
   * Import encrypted variables from backup
   *
   * @param data - JSON string of encrypted variables
   * @returns Result indicating success or failure
   */
  importEncryptedVariables(data: string): CredentialResult {
    try {
      const imported = JSON.parse(data) as Record<string, EncryptedVariable>;

      for (const [name, variable] of Object.entries(imported)) {
        this.store.encryptedVariables[name] = variable;
      }

      this.saveStore();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import encrypted variables: ${error}`,
      };
    }
  }

  /**
   * Clean up expired credentials and sessions
   */
  cleanupExpired(): void {
    const now = Date.now();

    // Clean up expired credentials
    for (const [name, credential] of Object.entries(this.store.credentials)) {
      if (credential.expiresAt > 0 && now > credential.expiresAt) {
        delete this.store.credentials[name];
      }
    }

    // Clean up expired sessions
    const sessionEntries = Array.from(this.sessionKeys.entries());
    for (const [name, session] of sessionEntries) {
      if (now > session.expiresAt) {
        this.sessionKeys.delete(name);
      }
    }

    this.saveStore();
  }
}

/**
 * Create a new Credential Storage Service instance
 *
 * @param config - Configuration options
 * @returns CredentialStorageService instance
 *
 * @example
 * ```typescript
 * const credentialStorage = createCredentialStorage();
 *
 * // Set master password (first time)
 * credentialStorage.setMasterPassword('my-secure-password');
 *
 * // Store a credential
 * credentialStorage.storeCredential('website-password', 'secret123');
 *
 * // Retrieve a credential
 * const result = credentialStorage.getCredential('website-password');
 * if (result.success) {
 *   console.log('Password:', result.data);
 * }
 *
 * // Create a session key
 * const sessionKey = credentialStorage.createSessionKey('user-session');
 *
 * // Encrypt a variable for !ENCRYPTION commands
 * credentialStorage.encryptVariable('MY_VAR', 'sensitive-value', 'encryption-password');
 * ```
 */
export function createCredentialStorage(
  config?: CredentialStorageConfig
): CredentialStorageService {
  return new CredentialStorageService(config);
}

export default CredentialStorageService;
