import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // Node by default (lib + API route tests); component tests opt into jsdom
    // via a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
