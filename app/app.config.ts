export default defineAppConfig({
  ui: {
    colors: {
      primary: 'outlook',
      neutral: 'slate'
    },
    table: {
      slots: {
        tr: 'data-[selectable=true]:cursor-pointer'
      }
    }
  }
})
