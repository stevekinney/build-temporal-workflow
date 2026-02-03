# Bundle Signing

Cryptographically sign workflow bundles with Ed25519 to verify they haven't been tampered with between build and deployment.

## Quick Start

```bash
# Generate a key pair
bundle-temporal-workflow keygen

# Sign a bundle
bundle-temporal-workflow sign ./dist/workflow-bundle.js --private-key ./keys/private.key

# Verify programmatically
```

```typescript
import { verifyBundleWithKey } from 'build-temporal-workflow';

const isValid = await verifyBundleWithKey(signedBundle, trustedPublicKey);
if (!isValid) {
  throw new Error('Bundle failed signature verification');
}
```

## API Reference

### Key Generation

#### `generateSigningKeyPair()`

Generate a new Ed25519 key pair for bundle signing. The private key is PKCS#8 encoded and the public key is SPKI encoded, both base64-encoded.

```typescript
function generateSigningKeyPair(): Promise<SigningKeyPair>;
```

```typescript
import { generateSigningKeyPair } from 'build-temporal-workflow';

const keyPair = await generateSigningKeyPair();

// Store privateKey securely (e.g., CI secrets, vault)
console.log('Private key:', keyPair.privateKey);

// Distribute publicKey for verification
console.log('Public key:', keyPair.publicKey);
```

#### `SigningKeyPair`

| Field        | Type     | Description                       |
| ------------ | -------- | --------------------------------- |
| `privateKey` | `string` | Base64-encoded PKCS#8 private key |
| `publicKey`  | `string` | Base64-encoded SPKI public key    |

### Signing

#### `signBundle(bundle, privateKey)`

Sign a workflow bundle with an Ed25519 private key. The signature covers the entire bundle code.

```typescript
function signBundle(bundle: WorkflowBundle, privateKey: string): Promise<SignedBundle>;
```

```typescript
import { signBundle, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
});

const signed = await signBundle(bundle, privateKey);
// signed.signature - base64-encoded Ed25519 signature
// signed.publicKey - base64-encoded public key
// signed.code - unchanged bundle code
```

#### `SignedBundle`

Extends `WorkflowBundle` with:

| Field       | Type     | Description                      |
| ----------- | -------- | -------------------------------- |
| `signature` | `string` | Base64-encoded Ed25519 signature |
| `publicKey` | `string` | Base64-encoded SPKI public key   |

### Verification

#### `verifyBundle(bundle)`

Verify a signed bundle using the public key embedded in the bundle.

```typescript
function verifyBundle(bundle: SignedBundle): Promise<boolean>;
```

Use this when you trust the embedded public key (e.g., the bundle was received from a trusted build system).

#### `verifyBundleWithKey(bundle, trustedPublicKey)`

Verify a signed bundle against a specific trusted public key, ignoring the embedded key.

```typescript
function verifyBundleWithKey(
  bundle: SignedBundle,
  trustedPublicKey: string,
): Promise<boolean>;
```

Use this when you have a known trusted public key and want to verify the bundle was signed by the corresponding private key.

```typescript
import { verifyBundleWithKey } from 'build-temporal-workflow';

// Load the trusted public key (deployed alongside your worker)
const trustedKey = process.env.BUNDLE_SIGNING_PUBLIC_KEY;

const isValid = await verifyBundleWithKey(signedBundle, trustedKey);
if (!isValid) {
  throw new Error('Bundle signature verification failed!');
}
```

## CLI Commands

### `keygen`

Generate a new Ed25519 signing key pair:

```bash
bundle-temporal-workflow keygen

# Output:
# Generated Ed25519 Key Pair
#
# Private Key:
# MC4CAQ... (base64)
#
# Public Key:
# MCowBQ... (base64)
#
# Store the private key securely (e.g., CI secrets).
# Distribute the public key for bundle verification.
```

JSON output:

```bash
bundle-temporal-workflow keygen --json
```

### `sign`

Sign a pre-built bundle file:

```bash
bundle-temporal-workflow sign ./dist/workflow-bundle.js --private-key ./keys/private.key

# Custom output path
bundle-temporal-workflow sign ./dist/workflow-bundle.js \
  --private-key ./keys/private.key \
  -o ./dist/workflow-bundle.signed.json
```

The signed output is a JSON file containing `code`, `signature`, and `publicKey`.

## Examples

### CI pipeline: build, sign, and verify

```bash
# In CI (build stage):
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js --mode production
bundle-temporal-workflow sign ./dist/bundle.js --private-key $SIGNING_PRIVATE_KEY -o ./dist/bundle.signed.json
```

```typescript
// In deployment (worker startup):
import { readFileSync } from 'node:fs';
import { verifyBundleWithKey } from 'build-temporal-workflow';

const signed = JSON.parse(readFileSync('./dist/bundle.signed.json', 'utf-8'));

const isValid = await verifyBundleWithKey(signed, process.env.SIGNING_PUBLIC_KEY);
if (!isValid) {
  throw new Error('Bundle verification failed — refusing to start worker');
}

const worker = await Worker.create({
  workflowBundle: { code: signed.code },
  taskQueue: 'my-queue',
});
```

### Key rotation

```typescript
import { generateSigningKeyPair } from 'build-temporal-workflow';

// Generate a new key pair for rotation
const newKeyPair = await generateSigningKeyPair();

// Store the new private key in your secrets manager
// Update the trusted public key in your deployment config
// Keep the old public key accepted during the transition period

// Verify against either key during rotation
async function verifyWithRotation(bundle) {
  const validWithNew = await verifyBundleWithKey(bundle, newKeyPair.publicKey);
  if (validWithNew) return true;

  const validWithOld = await verifyBundleWithKey(bundle, oldPublicKey);
  return validWithOld;
}
```

## Related

- [CI/CD Integration](./ci-cd-integration.md) — Signing in CI pipelines
- [Bundle Analysis](./bundle-analysis.md) — Analyze bundles before signing
