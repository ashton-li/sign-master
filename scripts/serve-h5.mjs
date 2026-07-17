import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const root = resolve(process.cwd(), 'dist/build/h5')
const port = Number(process.env.PORT || 5178)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

function safePath(url) {
  const pathname = decodeURIComponent(url.split('?')[0])
  const filePath = resolve(join(root, pathname === '/' ? 'index.html' : pathname))
  return filePath.startsWith(root) ? filePath : join(root, 'index.html')
}

const server = createServer(async (request, response) => {
  let filePath = safePath(request.url || '/')

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = join(root, 'index.html')
  } catch {
    filePath = join(root, 'index.html')
  }

  try {
    const body = await readFile(filePath)
    response.writeHead(200, {
      'Content-Type': types[extname(filePath)] || 'application/octet-stream'
    })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end('not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`serving H5 build at http://127.0.0.1:${port}`)
})
