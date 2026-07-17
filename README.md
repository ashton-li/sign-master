# 签字大师 1.0

签字大师是一个纯前端、离线优先的电子签署小程序，基于 uni-app、Vue 3、Pinia 和 Tailwind CSS 构建。业务数据不经过服务器，文件导入、扫描、手写、位置调整、模板/签名复用和导出均在本机完成。

## 技术栈

- uni-app 3 / Vue 3 Composition API / `<script setup>`
- Pinia 模块化状态管理
- Tailwind CSS 3 + SCSS 设计令牌
- Vitest 单元测试
- Playwright H5 冒烟测试
- 微信端本地能力：相机/相册、`chooseMessageFile`、持久文件、本地存储、`openDocument`
- pdf-lib 原 PDF/图片与矢量笔迹合成
- 原生相机手动拍照、文档边沿识别、四点透视校正和多页排序
- 多页图片、完整模板应用及统一图层手势
- `USER_DATA_PATH` 分层文件仓库与 Storage 索引恢复
- 128 维签字行为特征、HMAC-SHA256 溯源签章和 DCT 盲水印

## 快速开始

```bash
npm install
cp .env.example .env.local
npm run dev:h5
npm run dev:mp-weixin
```

Windows PowerShell 可使用 `Copy-Item .env.example .env.local`。请在本机环境文件中填写 `VITE_MP_WEIXIN_APPID`；除 `.env.example` 外，所有 `.env` 文件均被 Git 忽略。

## 构建

```bash
npm run build:h5
npm run build:prod:mp-weixin
```

微信小程序生产包输出在：

```text
dist/build/mp-weixin
```

用微信开发者工具导入该目录即可预览。`build:prod:mp-weixin` 从进程环境、`.env.local` 或 `.env.production` 读取 `VITE_MP_WEIXIN_APPID`，构建前临时写入 AppID，构建结束后自动将 `src/manifest.json` 还原为占位值。远程 CI 从 GitHub Actions Secret 读取 AppID。

## 测试

```bash
npm run test:unit
npm run ci:check
npm run build:h5
npm run test:e2e
npm run test:mp-weixin
npm run build:prod:mp-weixin
```

单元测试覆盖主题、连续笔迹、橡皮擦、扫描 CV、四点拉平、手势变换、签字位检测、图层历史、持久化、文件来源和导出。E2E 使用用户提供的 JPG/PNG 表单验证三处签字位，并完成真实签署、模板/签名保存、扫描、文件管理和导出；微信自动化测试通过本机开发者工具加载全部主包/分包页面并检查四个 Tab 的选中态。

## 目录结构

```text
src/
  components/       文件卡、模板卡、真实笔迹画布、底部导航等组件
  composables/      主题组合逻辑
  core/             文件导入、扫描 CV、签名路径、图层、持久化和导出
  pages/            四个 Tab 主包页和签署分包
  subpackages/      模板应用、帮助、隐私等独立分包页
  stores/           Pinia 模块：主题、文件、模板、签名、签署流程
  App.vue
  main.js
  manifest.json
  pages.json
  uni.scss
```

## 说明

- 项目没有业务后端，也没有网络 API 请求。
- 扫描使用本地边缘检测和透视校正；拍照后先返回预览页，裁切在后台串行处理，不阻塞继续扫描。
- 签字位识别是实验性功能。微信生产流程默认优先进入手写，用户可手动添加位置或在文件上长按应用签字。
- PDF 导出会将真实笔迹作为矢量路径叠加到原 PDF，图片文档会先生成 PDF 页面。
- 微信文件支持 PDF、PNG、JPG、JPEG、WEBP、BMP；WEBP/BMP 在 PDF 导出前由本地画布转换。
- H5 会隐藏 uni 默认 tabbar，使用项目自定义底部导航；微信端 `pages.json` 已启用 `tabBar.custom`。
- “设置 -> 签字鉴别”支持来源签章、现场复签、签署图片水印和本机溯源记录校验；结果仅供一致性参考，不具备法律身份认证效力。
- 默认使用随机生成的本机匿名 ID，不获取 OpenID、不调用云函数，AppSecret 不进入小程序代码。
