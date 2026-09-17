/**
 * POS fields contain customer and business data, not the operator's credentials.
 * Bind to the actual input (or a Nuxt UI component's input/search-input prop).
 * Keep login fields separate. Password managers may override these hints.
 */
export const posInputAttrs = {
  'autocomplete': 'off',
  'data-bwignore': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true'
} as const
