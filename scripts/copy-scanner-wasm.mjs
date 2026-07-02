import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const source = resolve('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')
const destination = resolve('public/vendor/zxing/zxing_reader.wasm')

await mkdir(dirname(destination), { recursive: true })
await copyFile(source, destination)
