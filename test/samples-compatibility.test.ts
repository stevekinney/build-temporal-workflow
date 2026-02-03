import { expect, it } from 'bun:test';

import { runAllSamples } from '../scripts/test-samples';
import { describeBundlerModes } from './bundler-modes';

describeBundlerModes('samples-typescript compatibility', (bundler) => {
	it(
		'bundles all discovered samples without unexpected failures',
		async () => {
			const results = await runAllSamples(bundler);

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
