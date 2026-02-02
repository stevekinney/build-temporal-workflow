/**
 * Helper module that imports a forbidden module (dns).
 * This tests that the bundler correctly detects forbidden modules
 * imported through transitive dependencies.
 */
import * as dns from 'node:dns';

export function getHostInfo(): string {
  // This won't actually run, but the import should be detected
  const servers = dns.getServers();
  return `DNS servers: ${servers.join(', ')}`;
}
