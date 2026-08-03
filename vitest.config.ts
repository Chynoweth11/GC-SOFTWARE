import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // The `server-only` guard exists to stop a bundler pulling these modules
      // into the client. Under Node it has nothing to protect, so point it at
      // the no-op the package itself ships for React Server Components.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
})
