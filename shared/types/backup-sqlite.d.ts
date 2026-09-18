declare module 'sql.js/dist/sql-wasm-browser.js' {
  import initSqlJs from 'sql.js'

  export default initSqlJs
}

declare module 'sql.js/dist/sql-wasm-browser.wasm?module' {
  const module: WebAssembly.Module
  export default module
}
