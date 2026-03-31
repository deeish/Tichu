/**
 * Generates solid-color PNG icons for the PWA (no extra deps).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../public/icons')

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1 | 0))
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = t.length + data.length
  const forCrc = Buffer.allocUnsafe(crcBuf)
  t.copy(forCrc, 0)
  data.copy(forCrc, t.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(forCrc), 0)
  return Buffer.concat([len, t, data, crc])
}

/** @param {{ r: number, g: number, b: number }} rgb */
function pngRgbSquare(size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rawLen = size * (1 + size * 3)
  const raw = Buffer.allocUnsafe(rawLen)
  let o = 0
  const { r, g, b } = rgb
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 })

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BRAND = { r: 0x1a, g: 0x3d, b: 0x2e }

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const file = path.join(OUT_DIR, name)
  fs.writeFileSync(file, pngRgbSquare(size, BRAND))
  console.log('wrote', path.relative(process.cwd(), file))
}
