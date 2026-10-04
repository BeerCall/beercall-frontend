import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setupTests.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts'
      ],
      // Objectif à long terme : 80% (ratchet progressif)
      thresholds: {
        statements: 40,
        branches: 25,
        functions: 39,
        lines: 43
      }
    }
  }
}))