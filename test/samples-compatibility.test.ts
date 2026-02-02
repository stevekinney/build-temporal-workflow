import { describe, expect, it } from 'bun:test';

import { runAllSamples } from '../scripts/test-samples';

describe('samples-typescript compatibility', () => {
	it(
		'bundles all discovered samples without unexpected failures',
		async () => {
			const results = await runAllSamples();

			const unexpected = results.filter((r) => r.status === 'fail');

			if (unexpected.length > 0) {
				const details = unexpected.map((r) => `${r.name}: ${r.error}`).join('\n');
				expect(unexpected).toEqual(
					expect.objectContaining({
						length: 0,
						message: `Unexpected failures:\n${details}`,
					}),
				);
			}

			expect(unexpected).toHaveLength(0);
		},
		{ timeout: 300_000 },
	);
});
