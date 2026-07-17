# HANDOVER

日期：2026-07-17

## 本次完成

- 修复 iOS 真机完成扫描时 `createScanPdfFromPaths` / `createScanPdfFromPaths` 为 `undefined`：轻量 JPEG-PDF 组装和受管目录保存逻辑直接编译进 `pages/sign/scan.js`，删除运行时 `scanPdf.js` 和 `pdfFileSaver.js` 调用。
- 扫描预览的每页缩略图支持点击调用微信图片预览；继续扫描、删除、排序、后台裁切和完成扫描流程保持不变。
- 自动裁边新增高亮低色差纸张连通域检测，通过纸张主体面积、填充率和四边统计恢复 A4 类纸张四角，再进行透视校正；结果不可信时继续回退完整照片。
- 新增深色背景透视纸张、均匀亮图不误裁两组测试；原有真实回执三签字位 100 次亮度、噪声、平移扰动测试继续通过。
- 关于页改用用户提供的真实小程序 Logo：`src/static/app-logo.png`。
- 帮助与反馈页取消固定高度限制，底部反馈内容和安全区可完整滚动查看。
- “我的”和“关于”页面底部增加 `闽ICP备2026014225号-3X`；H5 打开工信部备案网站，小程序复制备案查询网址。
- 微信生产包静态门禁新增扫描页内联 PDF、无旧模块引用、缩略图预览事件、真实 Logo、备案号和帮助页滚动断言。

## 验证结果

- `npm run ci:check`：文案、敏感能力、类型检查通过；24 个测试文件、98/98 通过。
- `npm run build:h5`：通过。
- `npm run test:e2e`：20/20 通过，新增帮助页底部、真实 Logo 和备案号可见性验收。
- `npm run build:prod:mp-weixin`：通过，生产包位于 `dist/build/mp-weixin`。
- `MP_STATIC_ONLY=1 npm run test:mp-weixin`：通过；编译后的扫描页包含 `PDF-1.4`，不引用 `scanPdf.js`、`imagePdf.js` 或 `pdfFileSaver.js`。

## 真机复验重点

- 连续扫描两页后点击“完成扫描”，确认进入选择与定位页，不出现任何 `createScanPdfFromPaths`、`createJpegPdfFromPaths` 或 `createScanPdfFromPaths` 未定义错误。
- 在深色桌面、浅色桌面、低光和纸张倾斜条件下拍摄，确认预览是有效文档而不是桌面、窄条或未裁原图。
- 点击任意扫描页缩略图，确认可全屏预览并左右查看多页。
- 在帮助与反馈页滚动到底部；在“我的”和“关于”页确认备案号可见。

## 已知边界

- 裁边完全在本地执行，优先避免错误裁切；纸张与背景亮度、颜色几乎相同时可能保留完整照片，由用户重新拍摄可获得更好结果。
- 小程序无法直接打开任意外部备案网页，点击备案号会复制工信部查询网址，这是微信平台能力限制下的明确降级。
- Sass 构建仍有上游 legacy API 与 `@import` 弃用警告，不影响生产产物。
