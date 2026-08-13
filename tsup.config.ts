import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts', 'src/preload.ts', 'src/recorder-preload.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
});
