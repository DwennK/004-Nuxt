import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = fileURLToPath(new URL('./app', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~~': rootDir,
      '@@': rootDir,
      '~': appDir,
      '@': appDir
    }
  },
  test: {
    environment: 'node',
    include: ['tests/{unit,integration}/**/*.{spec,test}.ts'],
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true
  }
})
