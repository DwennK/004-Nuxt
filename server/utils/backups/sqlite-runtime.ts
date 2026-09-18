import initSqlJs from 'sql.js/dist/sql-wasm-browser.js'
import module from 'sql.js/dist/sql-wasm-browser.wasm?module'
import { validateSqliteBackup } from './sqlite-validation'

export async function validateNativeBackup(bytes: Uint8Array, runId: string) {
  // Static WASM module: no network download or dynamic code compilation in Workers.
  const sqlite = await initSqlJs({
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(module, imports)
      receive(instance)
      return instance.exports
    },
    printErr() { /* Upstream errors must never log database contents. */ }
  })
  validateSqliteBackup(sqlite, bytes, runId)
}
