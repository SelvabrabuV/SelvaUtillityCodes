import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" rx="48" fill="#1f4e5a"/>
  <rect x="48" y="40" width="160" height="176" rx="12" fill="#f3efe6"/>
  <path d="M78 92h100M78 124h100M78 156h64" stroke="#0f6e6b" stroke-width="12" stroke-linecap="round"/>
</svg>`

await mkdir('resources', { recursive: true })
await sharp(Buffer.from(svg)).png().toFile('resources/icon.png')
