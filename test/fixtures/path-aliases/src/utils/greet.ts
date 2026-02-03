/**
 * Greeting utility function.
 */
import { formatName } from '@utils/format';

export function greet(name: string): string {
  return `Hello, ${formatName(name)}!`;
}
