// 生成扩展图标：纯 Node 无依赖手写 PNG。
// 图案：深蓝底 + 白色横条（表单行的意象）。
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function drawIcon(size) {
  const px = new Uint8Array(size * size * 4)
  const bg = [37, 78, 199, 255]
  const fg = [255, 255, 255, 255]
  const accent = [120, 210, 255, 255]
  const r = Math.round(size * 0.19) // 圆角半径
  const set = (x, y, c) => {
    const i = (y * size + x) * 4
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]
  }
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - 1 - r)
    const cy = Math.min(Math.max(y, r), size - 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= size - 1 - r) || (y >= r && y <= size - 1 - r)
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRounded(x, y)) set(x, y, bg)
    }
  }
  // 三条"表单行"：短条 + 长条交替，底部一条高亮（表示填充完成）
  const lines = [
    { y: 0.28, x0: 0.22, x1: 0.78, c: fg },
    { y: 0.5, x0: 0.22, x1: 0.6, c: fg },
    { y: 0.72, x0: 0.22, x1: 0.78, c: accent }
  ]
  const barH = Math.max(1, Math.round(size * 0.08))
  for (const l of lines) {
    const y0 = Math.round(l.y * size - barH / 2)
    for (let y = y0; y < y0 + barH; y++) {
      for (let x = Math.round(l.x0 * size); x < Math.round(l.x1 * size); x++) {
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, l.c)
      }
    }
  }
  return Buffer.from(px.buffer)
}

mkdirSync(resolve(root, 'public/icons'), { recursive: true })
for (const size of [16, 48, 128]) {
  writeFileSync(resolve(root, `public/icons/icon${size}.png`), encodePng(drawIcon(size), size, size))
  console.log(`icons/icon${size}.png written`)
}
