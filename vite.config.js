import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'
import { UnifiedViteWeappTailwindcssPlugin } from 'weapp-tailwindcss/vite'

const uni = typeof uniModule === 'function' ? uniModule : uniModule.default

export default defineConfig({
  plugins: [
    uni(),
    UnifiedViteWeappTailwindcssPlugin({
      rem2rpx: true
    })
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
})
