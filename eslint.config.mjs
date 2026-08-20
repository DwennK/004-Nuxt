// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      'vue/no-multiple-template-root': 'off',
      'vue/max-attributes-per-line': ['error', { singleline: 3 }]
    }
  },
  {
    name: 'project/server-import-boundaries',
    files: ['server/**/*.{js,mjs,cjs,ts,mts,cts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['~/**', '@/**'],
          message: 'Server code must not import from app/. Move shared contracts or pure utilities to shared/.'
        }]
      }]
    }
  }
)
