# HANDOVER

日期：2026-07-17

## 本次完成

- 修复 iPhone 真机完成扫描时 `createJpegPdfFromPaths` 为 `undefined` 的跨包加载问题：扫描页改用同一 `pages/sign` 分包内的 `scanPdf.js`，不再动态调用主包 `core/export/imagePdf.js`。
- 扫描专用 PDF 生成器按顺序读取已裁切 JPEG，生成标准多页 PDF，继续使用受管临时目录与写入前容量检查。
- 文档裁边增加四边形稳定性校验；检测结果过窄、面积过小或长宽比异常时自动回退到完整照片，避免再产生 `184 × 900` 类窄条页面。
- 首页与关于页统一使用 `AppLogo`，关于页增加数据边界和鉴别能力声明，版本号从环境变量读取。
- 帮助与反馈页新增快速上手、手动扫描、实验性签字位识别、本地存储与备份指引；增加联系邮箱和可长按识别的公众号二维码。
- 反馈不再以“保存到本机”假装提交，改为明确告知不自动上传，由用户复制后通过邮箱或公众号发送。
- 隐私说明按实际实现重写数据类型、处理目的、系统权限、本地保留、匿名 ID、加密备份、分享、删除、鉴别声明与联系方式。
- 清理 `.idea`、`tmp`、`output`和历史测试报告；参考 HTML、测试夹具和方案文档保留。
- 新增 GitHub Actions CI、CodeQL 和 Dependabot；CI 执行运行时依赖审计、文案合规检查、敏感能力检查、类型检查、单元测试、微信生产构建和 H5 全流程测试。

## 验证结果

- `npm run audit:ci`：通过，运行时依赖 0 漏洞。
- `npm run ci:check`：文案、敏感能力、类型检查通过；24 个测试文件、96/96 通过。
- `npm run test:e2e`：19/19 通过，包括扫描、三次横屏签字后文件不偏移、模板、备份、鉴别和取消文件选择。
- `npm run build:h5`：通过。
- `npm run build:prod:mp-weixin`：通过，生产包位于 `dist/build/mp-weixin`，AppID 由 `VITE_MP_WEIXIN_APPID` 写入。
- `MP_STATIC_ONLY=1 npm run test:mp-weixin`：通过，扫描页仅引用同分包 `scanPdf.js`，PDF 生成代码和公众号二维码均已进入 dist。
- 微信开发者工具自动化本次在工具启动阶段挂起，未进入 18 页页面循环；已终止任务。上一版 18/18 页、4/4 Tab 已通过，本次改动另由生产产物检查覆盖。
- GitHub CI 首轮发现浏览器任务缺少 H5 构建步骤，已在 Playwright 前增加 `npm run build:h5`，避免静态服务器因目录不存在持续返回 404。
- 修正后的远程 CI 质量任务和浏览器任务均通过，CodeQL 扫描通过；微信生产 dist 已作为 CI 产物保留 14 天。

## 真机复验重点

- 连续扫描两页后点击“完成扫描”，确认正常进入选择与定位页，不再出现 `createJpegPdfFromPaths` 或 `createScanPdfFromPaths` 为 `undefined`。
- 对深色桌面、浅色桌面和文档未充满取景框的照片复验；边沿不可靠时应保留完整照片，不应输出窄条。
- 在帮助与反馈页点击复制邮箱、复制反馈内容，长按二维码确认微信识别菜单可用。

## 已知边界

- 文档裁边是本地像素启发式检测；在不可靠时优先保全文档，可能减少裁切而不是强行拉平。
- uni-app 编译工具链的全量 `npm audit` 仍包含上游开发依赖告警；这些包已正确归类为 `devDependencies`，不进入小程序运行时。CI 对运行时依赖严格阻断，并由 Dependabot 监控工具链更新。
- Sass 构建仍有上游 legacy API 与 `@import` 弃用警告，不影响生产产物。
