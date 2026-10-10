import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    // Éviter la contention des environnements jsdom sans assouplir les timeouts.
    maxWorkers: 2,
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
      // Mesure C07 : 60.74 / 50.83 / 59.25 / 63.93 ; objectif à long terme : 80%.
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 59,
        lines: 63
      }
    }
  }
}))
