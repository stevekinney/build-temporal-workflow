/**
 * Bundle signing and verification using Ed25519.
 *
 * Provides cryptographic signing of workflow bundles for deployment
 * verification, ensuring bundles haven't been tampered with.
 */

import type { SignedBundle, WorkflowBundle } from './types';

/**
 * Key pair for Ed25519 signing.
 */
export interface SigningKeyPair {
  /**
   * Base64-encoded private key.
   */
  privateKey: string;

  /**
   * Base64-encoded public key.
   */
  publicKey: string;
}

/**
 * Generate a new Ed25519 key pair for bundle signing.
 *
 * @example
 * ```typescript
 * import { generateSigningKeyPair } from 'bundle-temporal-workflow';
 *
 * const keyPair = await generateSigningKeyPair();
 *
 * // Store privateKey securely (e.g., in CI secrets)
 * // Distribute publicKey for verification
 * console.log('Public key:', keyPair.publicKey);
 * ```
 */
export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ]);

  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);

  return {
    privateKey: bufferToBase64(privateKeyBuffer),
    publicKey: bufferToBase64(publicKeyBuffer),
  };
}

/**
 * Sign a workflow bundle with an Ed25519 private key.
 *
 * The signature covers the entire bundle code, ensuring any modification
 * will invalidate the signature.
 *
 * @example
 * ```typescript
 * import { signBundle } from 'bundle-temporal-workflow';
 *
 * const signed = await signBundle(bundle, privateKey);
 *
 * // The signed bundle includes signature and publicKey
 * console.log('Signature:', signed.signature);
 * ```
 */
export async function signBundle(
  bundle: WorkflowBundle,
  privateKey: string,
): Promise<SignedBundle> {
  const keyData = base64ToBuffer(privateKey);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'Ed25519' },
    true,
    ['sign'],
  );

  // Derive public key from the private key
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey);
  const { d: _privateComponent, ...publicKeyJwk } = jwk;
  const publicCryptoKey = await crypto.subtle.importKey(
    'jwk',
    { ...publicKeyJwk, key_ops: ['verify'] },
    { name: 'Ed25519' },
    true,
    ['verify'],
  );
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', publicCryptoKey);
  const publicKey = bufferToBase64(publicKeyBuffer);

  // Sign the bundle code
  const data = new TextEncoder().encode(bundle.code);
  const signature = await crypto.subtle.sign('Ed25519', cryptoKey, data);

  return {
    ...bundle,
    signature: bufferToBase64(signature),
    publicKey,
  };
}

/**
 * Verify a signed workflow bundle.
 *
 * Checks that the signature is valid for the bundle code using the
 * embedded public key.
 *
 * @example
 * ```typescript
 * import { verifyBundle } from 'bundle-temporal-workflow';
 *
 * const isValid = await verifyBundle(signedBundle);
 *
 * if (!isValid) {
 *   throw new Error('Bundle signature verification failed!');
 * }
 * ```
 */
export async function verifyBundle(bundle: SignedBundle): Promise<boolean> {
  try {
    const publicKeyData = base64ToBuffer(bundle.publicKey);
    const signatureData = base64ToBuffer(bundle.signature);

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyData,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    const data = new TextEncoder().encode(bundle.code);

    return await crypto.subtle.verify('Ed25519', publicKey, signatureData, data);
  } catch {
    return false;
  }
}

/**
 * Verify a bundle against a specific public key (not the embedded one).
 *
 * Use this when you want to verify against a known trusted public key
 * rather than the key embedded in the bundle.
 */
export async function verifyBundleWithKey(
  bundle: SignedBundle,
  trustedPublicKey: string,
): Promise<boolean> {
  try {
    const publicKeyData = base64ToBuffer(trustedPublicKey);
    const signatureData = base64ToBuffer(bundle.signature);

    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyData,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    const data = new TextEncoder().encode(bundle.code);

    return await crypto.subtle.verify('Ed25519', publicKey, signatureData, data);
  } catch {
    return false;
  }
}

/**
 * Convert ArrayBuffer to base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer.
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
