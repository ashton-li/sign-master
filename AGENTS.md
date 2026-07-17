# AGENTS.md – 签字大师 开发指令

## 项目目标
构建一个具有未来科技感视觉风格的电子签名小程序，使用 uni-app + Vue 3 + Tailwind CSS + Pinia 技术栈，实现文件管理、模板、签名库、设置四个核心页面，注重交互动效与主题切换。

## 技术规范
- 使用 **Vue 3 Composition API** 与 `<script setup>` 语法
- 状态管理统一使用 **Pinia**，按模块划分 store
- 样式使用 **Tailwind CSS** 原子类，自定义玻璃卡片、脉冲按钮等组件类
- 动画使用 CSS `@keyframes`，避免引入第三方动效库（小程序兼容性）
- 主题通过 Pinia 控制，在根容器上动态添加 `theme-light` / `theme-dark` 类
- 底部 TabBar 为**自定义组件**，中间“签署”按钮视觉突出但不超出导航栏
- 图标使用**内联 SVG**，不依赖外部图标库

## 页面路由
- `/pages/home/index` — 首页文件列表
- `/pages/templates/index` — 模板管理
- `/pages/signatures/index` — 签名管理
- `/pages/settings/index` — 我的设置

## 关键实现细节

### 1. 主题切换 (`stores/theme.js`)
- 状态：`mode` (auto | light | dark)，`systemDark` (跟随系统实际值)
- 初始化时读取本地存储 `theme-mode`，监听系统主题变化
- `toggle()` 循环切换：auto → dark → light → auto
- 在 `App.vue` 中根据 `themeClass` 设置根节点类名

### 2. 玻璃卡片 (`components/GlassCard.vue`)
- 默认样式：`bg-white/65 backdrop-blur-[22px] border border-black/5 rounded-card shadow-glass-md`
- 添加 `neon-active` 类时增加霓虹发光边框
- 点击时 `scale-[0.975]` 提供反馈
- 顶部高光线通过 `::after` 伪元素实现

### 3. 脉冲按钮 (`components/PulseButton.vue`)
- 主样式：`bg-brand text-white rounded-btn px-4 py-2 font-bold shadow-pulse-btn`
- 双伪元素实现两层扩散脉冲光环，动画 `halo-pulse`
- 点击缩放至 `0.9`

### 4. 文件卡片 (`components/FileCard.vue`)
- 左侧垂直光条 (3px 宽，`bg-brand`，带发光阴影)
- 缩略图带顶部高光伪元素
- 状态标签含呼吸灯圆点 (`animate-status-breathe`)

### 5. 底部导航 (`components/BottomNav.vue`)
- 使用 `fixed bottom-0` 固定
- 中间签署按钮使用 `PulseButton` 组件
- 点击签署按钮跳转至首页并触发签署流程（当前为 Toast 提示）

### 6. 动态背景 (`components/AmbientBackground.vue`)
- 仅在 H5 环境渲染（通过条件编译 `#ifdef H5`）
- 三个渐变光斑 `orb-1/2/3`，动画 `animate-orb-float`
- 八个上升粒子，动画 `animate-particle-rise`，使用 CSS `animation-delay` 错开

### 7. Toast 提示 (`composables/useToast.js`)
- 使用响应式变量控制显隐，自动 1.8 秒消失
- 在页面组件中调用 `show('消息')`

## 代码风格
- 缩进：2 空格
- 组件命名：PascalCase
- 事件命名：`@click` 直接绑定方法，方法名使用 `handle` 前缀（如 `handleFileClick`）
- 使用 `ref` 管理列表数据，不修改 props

## 待实现功能（后续迭代）
- 签署流程（文件上传 → AI 签名位识别 → 横屏手写 → 位置调整 → 导出）
- 真实 API 对接（文件列表、模板、签名）
- 导出 PDF / 图片功能

## 注意事项
- 小程序中 `backdrop-filter` 无效，需用条件编译降级
- `tailwind.config.js` 中设置 `corePlugins.preflight: false` 避免样式冲突
- 所有动画需测试在小程序中的性能表现，必要时简化
- 自定义 TabBar 组件需在每个页面中引入，并处理 `uni.switchTab` 跳转
- 每次任务完成后需要更新HANDOVER.MD文档，说明本次完成的任务，目前的问题，下次要做的任务，覆盖更新这个文档，不要保留旧版本
