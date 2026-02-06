/**
 * iMacros Rijndael/AES Encryption Module
 *
 * This module provides encryption/decryption compatible with the original
 * iMacros Firefox extension. It implements the Rijndael algorithm with
 * 256-bit key and 256-bit block size, supporting both the legacy (hex)
 * format and the newer Base64/CBC format.
 *
 * The original iMacros uses:
 * - Key size: 256 bits (32 bytes)
 * - Block size: 256 bits (32 bytes)
 * - Mode: ECB for legacy, CBC for new format
 * - Key derivation: SHA-256 hash of password (new format) or direct padding (legacy)
 */

// Configuration constants
const KEY_SIZE_BITS = 256;
const BLOCK_SIZE_BITS = 256;
const KEY_SIZE_BYTES = KEY_SIZE_BITS / 8;
const BLOCK_SIZE_BYTES = BLOCK_SIZE_BITS / 8;

// Rijndael constants
const Nk = KEY_SIZE_BITS / 32; // Key length in 32-bit words
const Nb = BLOCK_SIZE_BITS / 32; // Block length in 32-bit words

// Rounds array: indexed by [Nk][Nb]
const roundsArray: (number | undefined)[][] = [
  [],
  [],
  [],
  [],
  [undefined, undefined, undefined, undefined, 10, undefined, 12, undefined, 14],
  [],
  [undefined, undefined, undefined, undefined, 12, undefined, 12, undefined, 14],
  [],
  [undefined, undefined, undefined, undefined, 14, undefined, 14, undefined, 14],
];

// Shift offsets for each block size
const shiftOffsets: (number | undefined)[][] = [
  [],
  [],
  [],
  [],
  [undefined, 1, 2, 3],
  [],
  [undefined, 1, 2, 3],
  [],
  [undefined, 1, 3, 4],
];

const Nr = roundsArray[Nk]?.[Nb] ?? 14;

// Round constants
const Rcon = [
  0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab,
  0x4d, 0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d,
  0xfa, 0xef, 0xc5, 0x91,
];

// S-Box for SubBytes transformation
const SBox = [
  99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
  202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
  183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21, 4,
  199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117, 9, 131, 44,
  26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209, 0, 237, 32,
  252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77,
  51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56,
  245, 188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23,
  196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136, 70,
  238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172,
  98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244,
  234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31,
  75, 189, 139, 138, 112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134,
  193, 29, 158, 225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206,
  85, 40, 223, 140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84,
  187, 22,
];

// Inverse S-Box for InvSubBytes transformation
const SBoxInverse = [
  82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124,
  227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123,
  148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8, 46, 161,
  102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37, 114, 248, 246,
  100, 134, 104, 152, 22, 212, 164, 92, 204, 93, 101, 182, 146, 108, 112, 72,
  80, 253, 237, 185, 218, 94, 21, 70, 87, 167, 141, 157, 132, 144, 216, 171, 0,
  140, 188, 211, 10, 247, 228, 88, 5, 184, 179, 69, 6, 208, 44, 30, 143, 202,
  63, 15, 2, 193, 175, 189, 3, 1, 19, 138, 107, 58, 145, 17, 65, 79, 103, 220,
  234, 151, 242, 207, 206, 240, 180, 230, 115, 150, 172, 116, 34, 231, 173, 53,
  133, 226, 249, 55, 232, 28, 117, 223, 110, 71, 241, 26, 113, 29, 41, 197, 137,
  111, 183, 98, 14, 170, 24, 190, 27, 252, 86, 62, 75, 198, 210, 121, 32, 154,
  219, 192, 254, 120, 205, 90, 244, 31, 221, 168, 51, 136, 7, 199, 49, 177, 18,
  16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122,
  159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187,
  60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85,
  33, 12, 125,
];

/**
 * Error class for encryption failures
 */
export class EncryptionError extends Error {
  public readonly code: number;

  constructor(message: string, code: number = 940) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
  }
}

/**
 * Cyclic shift array elements to the left
 */
function cyclicShiftLeft(arr: number[], positions: number): number[] {
  const temp = arr.slice(0, positions);
  return arr.slice(positions).concat(temp);
}

/**
 * xtime operation for GF(2^8) multiplication
 */
function xtime(poly: number): number {
  poly <<= 1;
  return poly & 0x100 ? poly ^ 0x11b : poly;
}

/**
 * Multiply in GF(256) field
 */
function multGF256(x: number, y: number): number {
  let result = 0;
  for (let bit = 1; bit < 256; bit *= 2, y = xtime(y)) {
    if (x & bit) {
      result ^= y;
    }
  }
  return result;
}

/**
 * SubBytes transformation (encryption/decryption)
 */
function byteSub(state: number[][], direction: 'encrypt' | 'decrypt'): void {
  const S = direction === 'encrypt' ? SBox : SBoxInverse;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < Nb; j++) {
      state[i][j] = S[state[i][j]];
    }
  }
}

/**
 * ShiftRows transformation
 */
function shiftRow(state: number[][], direction: 'encrypt' | 'decrypt'): void {
  for (let i = 1; i < 4; i++) {
    const offset = shiftOffsets[Nb]?.[i] ?? 0;
    if (direction === 'encrypt') {
      state[i] = cyclicShiftLeft(state[i], offset);
    } else {
      state[i] = cyclicShiftLeft(state[i], Nb - offset);
    }
  }
}

/**
 * MixColumns transformation
 */
function mixColumn(state: number[][], direction: 'encrypt' | 'decrypt'): void {
  const b: number[] = [];
  for (let j = 0; j < Nb; j++) {
    for (let i = 0; i < 4; i++) {
      if (direction === 'encrypt') {
        b[i] =
          multGF256(state[i][j], 2) ^
          multGF256(state[(i + 1) % 4][j], 3) ^
          state[(i + 2) % 4][j] ^
          state[(i + 3) % 4][j];
      } else {
        b[i] =
          multGF256(state[i][j], 0xe) ^
          multGF256(state[(i + 1) % 4][j], 0xb) ^
          multGF256(state[(i + 2) % 4][j], 0xd) ^
          multGF256(state[(i + 3) % 4][j], 9);
      }
    }
    for (let i = 0; i < 4; i++) {
      state[i][j] = b[i];
    }
  }
}

/**
 * AddRoundKey transformation
 */
function addRoundKey(state: number[][], roundKey: number[]): void {
  for (let j = 0; j < Nb; j++) {
    state[0][j] ^= roundKey[j] & 0xff;
    state[1][j] ^= (roundKey[j] >> 8) & 0xff;
    state[2][j] ^= (roundKey[j] >> 16) & 0xff;
    state[3][j] ^= (roundKey[j] >> 24) & 0xff;
  }
}

/**
 * Key expansion for AES
 */
function keyExpansion(key: number[]): number[] {
  const expandedKey: number[] = [];

  // Copy key into expanded key
  for (let j = 0; j < Nk; j++) {
    expandedKey[j] =
      key[4 * j] |
      (key[4 * j + 1] << 8) |
      (key[4 * j + 2] << 16) |
      (key[4 * j + 3] << 24);
  }

  // Expand key
  for (let j = Nk; j < Nb * (Nr + 1); j++) {
    let temp = expandedKey[j - 1];
    if (j % Nk === 0) {
      temp =
        (SBox[(temp >> 8) & 0xff] |
          (SBox[(temp >> 16) & 0xff] << 8) |
          (SBox[(temp >> 24) & 0xff] << 16) |
          (SBox[temp & 0xff] << 24)) ^
        Rcon[Math.floor(j / Nk) - 1];
    } else if (Nk > 6 && j % Nk === 4) {
      temp =
        (SBox[(temp >> 24) & 0xff] << 24) |
        (SBox[(temp >> 16) & 0xff] << 16) |
        (SBox[(temp >> 8) & 0xff] << 8) |
        SBox[temp & 0xff];
    }
    expandedKey[j] = expandedKey[j - Nk] ^ temp;
  }

  return expandedKey;
}

/**
 * Pack bytes into state matrix
 */
function packBytes(octets: number[]): number[][] {
  const state: number[][] = [[], [], [], []];
  for (let j = 0; j < octets.length; j += 4) {
    state[0][j / 4] = octets[j];
    state[1][j / 4] = octets[j + 1];
    state[2][j / 4] = octets[j + 2];
    state[3][j / 4] = octets[j + 3];
  }
  return state;
}

/**
 * Unpack state matrix to bytes
 */
function unpackBytes(packed: number[][]): number[] {
  const result: number[] = [];
  for (let j = 0; j < packed[0].length; j++) {
    result.push(packed[0][j], packed[1][j], packed[2][j], packed[3][j]);
  }
  return result;
}

/**
 * Single round encryption
 */
function encryptRound(state: number[][], roundKey: number[]): void {
  byteSub(state, 'encrypt');
  shiftRow(state, 'encrypt');
  mixColumn(state, 'encrypt');
  addRoundKey(state, roundKey);
}

/**
 * Inverse round for decryption
 */
function inverseRound(state: number[][], roundKey: number[]): void {
  addRoundKey(state, roundKey);
  mixColumn(state, 'decrypt');
  shiftRow(state, 'decrypt');
  byteSub(state, 'decrypt');
}

/**
 * Final round encryption (no MixColumns)
 */
function finalRound(state: number[][], roundKey: number[]): void {
  byteSub(state, 'encrypt');
  shiftRow(state, 'encrypt');
  addRoundKey(state, roundKey);
}

/**
 * Inverse final round for decryption
 */
function inverseFinalRound(state: number[][], roundKey: number[]): void {
  addRoundKey(state, roundKey);
  shiftRow(state, 'decrypt');
  byteSub(state, 'decrypt');
}

/**
 * Encrypt a single block
 */
function encryptBlock(block: number[], expandedKey: number[]): number[] {
  if (!block || (block.length * 8) !== BLOCK_SIZE_BITS) {
    throw new EncryptionError('Invalid block size');
  }

  const state = packBytes(block);
  addRoundKey(state, expandedKey);

  for (let i = 1; i < Nr; i++) {
    encryptRound(state, expandedKey.slice(Nb * i, Nb * (i + 1)));
  }
  finalRound(state, expandedKey.slice(Nb * Nr));

  return unpackBytes(state);
}

/**
 * Decrypt a single block
 */
function decryptBlock(block: number[], expandedKey: number[]): number[] {
  if (!block || (block.length * 8) !== BLOCK_SIZE_BITS) {
    throw new EncryptionError('Invalid block size');
  }

  const state = packBytes(block);
  inverseFinalRound(state, expandedKey.slice(Nb * Nr));

  for (let i = Nr - 1; i > 0; i--) {
    inverseRound(state, expandedKey.slice(Nb * i, Nb * (i + 1)));
  }
  addRoundKey(state, expandedKey);

  return unpackBytes(state);
}

/**
 * Generate random bytes for IV
 */
function getRandomBytes(count: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < count; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Rijndael encryption with mode (ECB or CBC)
 */
function rijndaelEncrypt(
  plaintext: number[],
  key: number[],
  mode: 'ECB' | 'CBC' = 'ECB'
): number[] {
  if (!plaintext || !key) {
    throw new EncryptionError('Missing plaintext or key');
  }
  if (key.length * 8 !== KEY_SIZE_BITS) {
    throw new EncryptionError('Invalid key size');
  }

  // Pad plaintext to block boundary
  const bpb = BLOCK_SIZE_BYTES;
  const paddedPlaintext = [...plaintext];
  while (paddedPlaintext.length % bpb !== 0) {
    paddedPlaintext.push(0);
  }

  let ct: number[];
  if (mode === 'CBC') {
    ct = getRandomBytes(bpb); // IV
  } else {
    ct = [];
  }

  const expandedKey = keyExpansion(key);

  for (let block = 0; block < paddedPlaintext.length / bpb; block++) {
    const aBlock = paddedPlaintext.slice(block * bpb, (block + 1) * bpb);

    if (mode === 'CBC') {
      // XOR with previous ciphertext block (or IV for first block)
      for (let i = 0; i < bpb; i++) {
        aBlock[i] ^= ct[block * bpb + i];
      }
    }

    const encryptedBlock = encryptBlock(aBlock, expandedKey);
    ct = ct.concat(encryptedBlock);
  }

  return ct;
}

/**
 * Rijndael decryption with mode (ECB or CBC)
 */
function rijndaelDecrypt(
  ciphertext: number[],
  key: number[],
  mode: 'ECB' | 'CBC' = 'ECB'
): number[] {
  if (!ciphertext || !key) {
    throw new EncryptionError('Missing ciphertext or key');
  }
  if (key.length * 8 !== KEY_SIZE_BITS) {
    throw new EncryptionError('Invalid key size');
  }

  const expandedKey = keyExpansion(key);
  const bpb = BLOCK_SIZE_BYTES;
  const pt: number[] = [];

  // Process blocks in reverse for CBC
  for (let block = ciphertext.length / bpb - 1; block > 0; block--) {
    const aBlock = decryptBlock(
      ciphertext.slice(block * bpb, (block + 1) * bpb),
      expandedKey
    );

    if (mode === 'CBC') {
      // XOR with previous ciphertext block
      for (let i = 0; i < bpb; i++) {
        pt[(block - 1) * bpb + i] = aBlock[i] ^ ciphertext[(block - 1) * bpb + i];
      }
    } else {
      // ECB mode - just prepend
      pt.unshift(...aBlock);
    }
  }

  // Process first block for ECB mode
  if (mode === 'ECB') {
    const firstBlock = decryptBlock(ciphertext.slice(0, bpb), expandedKey);
    pt.unshift(...firstBlock);
  }

  return pt;
}

// ==================== Utility Functions ====================

/**
 * Convert byte array to hex string
 */
export function byteArrayToHex(bytes: number[]): string {
  return bytes.map((b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
}

/**
 * Convert hex string to byte array
 */
export function hexToByteArray(hex: string): number[] {
  if (hex.length % 2 !== 0) {
    throw new EncryptionError('Invalid hex string length');
  }
  let h = hex;
  if (h.startsWith('0x') || h.startsWith('0X')) {
    h = h.substring(2);
  }
  const bytes: number[] = [];
  for (let i = 0; i < h.length; i += 2) {
    bytes.push(parseInt(h.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Convert byte array to string
 */
export function byteArrayToString(bytes: number[]): string {
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

/**
 * Convert string to byte array
 */
export function stringToByteArray(str: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < str.length; i++) {
    result.push(str.charCodeAt(i));
  }
  return result;
}

/**
 * Encode string to UTF-8
 */
export function utf8Encode(str: string): string {
  let utftext = '';
  const s = str.replace(/\r\n/g, '\n');

  for (let n = 0; n < s.length; n++) {
    const c = s.charCodeAt(n);

    if (c < 128) {
      utftext += String.fromCharCode(c);
    } else if (c > 127 && c < 2048) {
      utftext += String.fromCharCode((c >> 6) | 192);
      utftext += String.fromCharCode((c & 63) | 128);
    } else {
      utftext += String.fromCharCode((c >> 12) | 224);
      utftext += String.fromCharCode(((c >> 6) & 63) | 128);
      utftext += String.fromCharCode((c & 63) | 128);
    }
  }

  return utftext;
}

/**
 * Decode UTF-8 string
 */
export function utf8Decode(utftext: string): string {
  let result = '';
  let i = 0;

  while (i < utftext.length) {
    const c = utftext.charCodeAt(i);

    if (c < 128) {
      result += String.fromCharCode(c);
      i++;
    } else if (c > 191 && c < 224) {
      const c2 = utftext.charCodeAt(i + 1);
      result += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
      i += 2;
    } else {
      const c2 = utftext.charCodeAt(i + 1);
      const c3 = utftext.charCodeAt(i + 2);
      result += String.fromCharCode(
        ((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63)
      );
      i += 3;
    }
  }

  return result;
}

// Base64 encoding table
const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

/**
 * Convert byte array to Base64
 */
export function byteArrayToBase64(input: number[]): string {
  let output = '';
  let i = 0;

  while (i < input.length) {
    const chr1 = input[i++];
    const chr2 = input[i++];
    const chr3 = input[i++];

    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    let enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }

    output +=
      BASE64_CHARS.charAt(enc1) +
      BASE64_CHARS.charAt(enc2) +
      BASE64_CHARS.charAt(enc3) +
      BASE64_CHARS.charAt(enc4);
  }

  return output;
}

/**
 * Convert Base64 to byte array
 */
export function base64ToByteArray(input: string): number[] {
  const output: number[] = [];
  let i = 0;
  const cleanInput = input.replace(/[^A-Za-z0-9+/=]/g, '');

  while (i < cleanInput.length) {
    const enc1 = BASE64_CHARS.indexOf(cleanInput.charAt(i++));
    const enc2 = BASE64_CHARS.indexOf(cleanInput.charAt(i++));
    const enc3 = BASE64_CHARS.indexOf(cleanInput.charAt(i++));
    const enc4 = BASE64_CHARS.indexOf(cleanInput.charAt(i++));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output.push(chr1);

    if (enc3 !== 64) {
      output.push(chr2);
    }
    if (enc4 !== 64) {
      output.push(chr3);
    }
  }

  return output;
}

// ==================== SHA-256 Implementation ====================

/**
 * SHA-256 hash function
 */
export function sha256(str: string): string {
  const chrsz = 8;

  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function S(X: number, n: number): number {
    return (X >>> n) | (X << (32 - n));
  }

  function R(X: number, n: number): number {
    return X >>> n;
  }

  function Ch(x: number, y: number, z: number): number {
    return (x & y) ^ (~x & z);
  }

  function Maj(x: number, y: number, z: number): number {
    return (x & y) ^ (x & z) ^ (y & z);
  }

  function Sigma0256(x: number): number {
    return S(x, 2) ^ S(x, 13) ^ S(x, 22);
  }

  function Sigma1256(x: number): number {
    return S(x, 6) ^ S(x, 11) ^ S(x, 25);
  }

  function Gamma0256(x: number): number {
    return S(x, 7) ^ S(x, 18) ^ R(x, 3);
  }

  function Gamma1256(x: number): number {
    return S(x, 17) ^ S(x, 19) ^ R(x, 10);
  }

  function coreSha256(m: number[], l: number): number[] {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    const HASH = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19,
    ];

    const W: number[] = new Array(64);

    m[l >> 5] |= 0x80 << (24 - (l % 32));
    m[((((l + 64) >> 9) << 4) + 15)] = l;

    for (let i = 0; i < m.length; i += 16) {
      let a = HASH[0];
      let b = HASH[1];
      let c = HASH[2];
      let d = HASH[3];
      let e = HASH[4];
      let f = HASH[5];
      let g = HASH[6];
      let h = HASH[7];

      for (let j = 0; j < 64; j++) {
        if (j < 16) {
          W[j] = m[j + i] || 0;
        } else {
          W[j] = safeAdd(
            safeAdd(safeAdd(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])),
            W[j - 16]
          );
        }

        const T1 = safeAdd(
          safeAdd(safeAdd(safeAdd(h, Sigma1256(e)), Ch(e, f, g)), K[j]),
          W[j]
        );
        const T2 = safeAdd(Sigma0256(a), Maj(a, b, c));

        h = g;
        g = f;
        f = e;
        e = safeAdd(d, T1);
        d = c;
        c = b;
        b = a;
        a = safeAdd(T1, T2);
      }

      HASH[0] = safeAdd(a, HASH[0]);
      HASH[1] = safeAdd(b, HASH[1]);
      HASH[2] = safeAdd(c, HASH[2]);
      HASH[3] = safeAdd(d, HASH[3]);
      HASH[4] = safeAdd(e, HASH[4]);
      HASH[5] = safeAdd(f, HASH[5]);
      HASH[6] = safeAdd(g, HASH[6]);
      HASH[7] = safeAdd(h, HASH[7]);
    }

    return HASH;
  }

  function str2binb(s: string): number[] {
    const bin: number[] = [];
    const mask = (1 << chrsz) - 1;
    for (let i = 0; i < s.length * chrsz; i += chrsz) {
      bin[i >> 5] |= (s.charCodeAt(i / chrsz) & mask) << (24 - (i % 32));
    }
    return bin;
  }

  function binb2hex(binarray: number[]): string {
    const hexTab = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < binarray.length * 4; i++) {
      result +=
        hexTab.charAt((binarray[i >> 2] >> ((3 - (i % 4)) * 8 + 4)) & 0xf) +
        hexTab.charAt((binarray[i >> 2] >> ((3 - (i % 4)) * 8)) & 0xf);
    }
    return result;
  }

  const encoded = utf8Encode(str);
  return binb2hex(coreSha256(str2binb(encoded), encoded.length * chrsz));
}

// ==================== Main Encryption API ====================

/**
 * Encrypt a string using the new method (Base64/CBC with SHA-256 key derivation)
 * This is the default encryption method used by iMacros.
 */
export function encryptString(message: string, password: string): string {
  const MAGIC = 'length@:';
  const prefixedMessage = MAGIC.replace('length', message.length.toString()) + message;

  // Derive key from password using SHA-256
  const keyHash = sha256(password);
  const key = hexToByteArray(keyHash);

  // Convert message to UTF-8 byte array
  const plaintext = stringToByteArray(utf8Encode(prefixedMessage));

  // Encrypt using CBC mode
  const ciphertext = rijndaelEncrypt(plaintext, key, 'CBC');

  // Return as Base64
  return byteArrayToBase64(ciphertext);
}

/**
 * Encrypt a string using the legacy method (hex encoding, ECB mode, direct key)
 * This method is compatible with older iMacros versions.
 */
export function encryptStringLegacy(plaintext: string, password: string): string {
  const strToHex = (str: string): string => {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      let hex = str.charCodeAt(i).toString(16);
      while (hex.length < 4) {
        hex = '0' + hex;
      }
      result += hex.charAt(2) + hex.charAt(3) + hex.charAt(0) + hex.charAt(1);
    }
    return result;
  };

  const len = plaintext.length * 2;
  let plaindata = '';

  // Length header
  plaindata += (len < 16 ? '0' : '') + len.toString(16);
  plaindata += '000000';
  plaindata += strToHex(plaintext);

  // Pad to block size
  while (plaindata.length < 64) {
    plaindata += '00';
  }

  // Prepare key (direct from password, padded or truncated to 32 bytes)
  let keyHex = strToHex(password);
  if (keyHex.length < 64) {
    while (keyHex.length < 64) {
      keyHex += '0000';
    }
  } else {
    keyHex = keyHex.substr(0, 64);
  }
  const key = hexToByteArray(keyHex);

  // Handle multi-block messages
  let sdata: string;
  if (plaindata.length > 64) {
    const part1 = plaindata.substring(0, 64);
    let part2 = plaindata.substring(64);
    let part3 = '';

    if (part2.length > 64) {
      part3 = part2.substring(0, 64);
      part2 = part2.substring(64);
    }

    while (part2.length < 64) {
      part2 += '00';
    }
    if (part3.length > 0) {
      while (part3.length < 64) {
        part3 += '00';
      }
    }

    const sdata1 = byteArrayToHex(rijndaelEncrypt(hexToByteArray(part1), key, 'ECB'));
    const sdata2 = byteArrayToHex(rijndaelEncrypt(hexToByteArray(part2), key, 'ECB'));
    let sdata3 = '';
    if (part3.length) {
      sdata3 = byteArrayToHex(rijndaelEncrypt(hexToByteArray(part3), key, 'ECB'));
    }
    sdata = sdata1 + sdata2 + sdata3;
  } else {
    sdata = byteArrayToHex(rijndaelEncrypt(hexToByteArray(plaindata), key, 'ECB'));
  }

  return sdata.toUpperCase();
}

/**
 * Decrypt a string - automatically detects format (legacy hex or new Base64)
 */
export function decryptString(ciphertext: string, password: string): string {
  // Detect format: legacy uses hex, new uses Base64
  if (/^[0-9a-f]+$/i.test(ciphertext) && ciphertext.length % 2 === 0) {
    return decryptStringLegacy(ciphertext, password);
  }

  // New format (Base64/CBC)
  if (!/^[A-Za-z0-9+/=]+$/.test(ciphertext)) {
    throw new EncryptionError('Decryption failed, wrong data encoding', 943);
  }

  // Derive key from password using SHA-256
  const keyHash = sha256(password);
  const key = hexToByteArray(keyHash);

  // Decode Base64 to ciphertext bytes
  const ciphertextBytes = base64ToByteArray(ciphertext);

  // Decrypt using CBC mode
  const plaintext = rijndaelDecrypt(ciphertextBytes, key, 'CBC');

  // Convert to string and remove null padding
  let result = byteArrayToString(plaintext);
  result = result.replace(/\0+$/, '');

  // Check for embedded nulls (indicates wrong password)
  if (/\0/.test(result)) {
    throw new EncryptionError('Decryption failed, bad password', 942);
  }

  // Decode UTF-8
  result = utf8Decode(result);

  // Verify and strip magic prefix
  const match = result.match(/^(\d+)@:/);
  if (!match) {
    throw new EncryptionError('Decryption failed, bad password', 942);
  }

  const length = parseInt(match[1], 10);
  result = result.replace(/^(\d+)@:/, '');

  if (length !== result.length) {
    throw new EncryptionError('Decryption failed, bad password', 942);
  }

  return result;
}

/**
 * Decrypt a string using the legacy method (hex encoding, ECB mode)
 */
export function decryptStringLegacy(ciphertext: string, password: string): string {
  const strToHex = (str: string): string => {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      let hex = str.charCodeAt(i).toString(16);
      while (hex.length < 4) {
        hex = '0' + hex;
      }
      result += hex.charAt(2) + hex.charAt(3) + hex.charAt(0) + hex.charAt(1);
    }
    return result;
  };

  // Prepare key
  let keyHex = strToHex(password);
  if (keyHex.length < 64) {
    while (keyHex.length < 64) {
      keyHex += '0000';
    }
  } else {
    keyHex = keyHex.substr(0, 64);
  }
  const key = hexToByteArray(keyHex);

  // Handle multi-block ciphertext
  const ct = ciphertext.toLowerCase();
  let data: number[];
  let data2: number[] = [];
  let data3: number[] = [];

  if (ct.length > 64) {
    const part1 = ct.substring(0, 64);
    let part2 = ct.substring(64);
    let part3 = '';

    if (part2.length > 64) {
      part3 = part2.substring(0, 64);
      part2 = part2.substring(64);
    }

    data = rijndaelDecrypt(hexToByteArray(part1), key, 'ECB');
    data2 = rijndaelDecrypt(hexToByteArray(part2), key, 'ECB');
    if (part3.length) {
      data3 = rijndaelDecrypt(hexToByteArray(part3), key, 'ECB');
    }
  } else {
    data = rijndaelDecrypt(hexToByteArray(ct), key, 'ECB');
  }

  // Extract length from header
  const len = data[0] / 2;

  // Convert to string, skipping nulls and header
  let result = '';
  for (let i = 4; i < data.length; i++) {
    if (data[i] !== 0) {
      result += String.fromCharCode(data[i]);
    }
  }
  for (let i = 0; i < data2.length; i++) {
    if (data2[i] !== 0) {
      result += String.fromCharCode(data2[i]);
    }
  }
  for (let i = 0; i < data3.length; i++) {
    if (data3[i] !== 0) {
      result += String.fromCharCode(data3[i]);
    }
  }

  if (result.length !== len) {
    throw new EncryptionError('Decryption failed, bad password', 942);
  }

  return result;
}

// ==================== Password-based Encryption Helpers ====================

/**
 * Encryption type used by iMacros password manager
 */
export enum EncryptionType {
  /** No encryption */
  NONE = 0,
  /** Use stored master password */
  STORED = 1,
  /** Use temporary session password */
  TEMP = 2,
}

/**
 * Encrypt a value for storage (e.g., in macro files or variables)
 * Uses the new Base64/CBC format by default
 */
export function encryptValue(
  value: string,
  password: string,
  useLegacyMethod: boolean = false
): string {
  if (useLegacyMethod) {
    return encryptStringLegacy(value, password);
  }
  return encryptString(value, password);
}

/**
 * Decrypt a stored value
 * Automatically detects the encryption format
 */
export function decryptValue(encryptedValue: string, password: string): string {
  return decryptString(encryptedValue, password);
}

/**
 * Check if a string appears to be encrypted
 * (either hex or Base64 format)
 */
export function isEncrypted(value: string): boolean {
  // Check for legacy hex format (uppercase hex string)
  if (/^[0-9A-F]+$/.test(value) && value.length >= 64 && value.length % 64 === 0) {
    return true;
  }
  // Check for new Base64 format
  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 40) {
    return true;
  }
  return false;
}

/**
 * Validate a password by attempting to decrypt a test value
 */
export function validatePassword(
  encryptedValue: string,
  password: string
): boolean {
  try {
    decryptString(encryptedValue, password);
    return true;
  } catch {
    return false;
  }
}
