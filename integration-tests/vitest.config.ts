import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/relational/mysql.planetscale.test.ts'],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 40000,
		hookTimeout: 40000,
		// deps: {
		// 	inline: true,
		// },
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
