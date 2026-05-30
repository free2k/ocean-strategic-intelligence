# Implementation Plan: WeChat UI Redesign

## Overview

将现有 `pages/wechat.vue` 重构为 Nuxt 3 嵌套路由 Dashboard 布局。创建左侧导航 + 右侧内容区结构，拆分公众号管理、文章下载、代理配置为独立子页面，登录状态面板移至侧边栏底部，表格化展示公众号和文章列表。

## Tasks

- [x] 1. 路由结构重构与布局容器
  - [x] 1.1 重构 pages/wechat.vue 为嵌套路由布局容器
    - 将现有 `pages/wechat.vue` 内容清空，改为左右两栏布局容器
    - 左侧 aside（w-64, border-r）放置 WechatSideNav 和 WechatLoginStatus
    - 右侧 main（flex-1, overflow-y-auto）放置 `<NuxtPage />`
    - 整体高度 `h-[calc(100vh-64px)]` 适配全局导航栏
    - _Requirements: 1.1, 1.4, 7.4_

  - [x] 1.2 创建 pages/wechat/index.vue 重定向页
    - 使用 `navigateTo('/wechat/accounts', { replace: true })` 实现默认重定向
    - _Requirements: 7.2_

  - [x] 1.3 创建 pages/wechat/accounts.vue 占位页
    - 创建基础页面结构，后续任务填充表格内容
    - _Requirements: 7.1_

  - [x] 1.4 创建 pages/wechat/articles.vue 占位页
    - 创建基础页面结构，后续任务填充文章列表内容
    - _Requirements: 7.1_

  - [x] 1.5 创建 pages/wechat/proxy.vue 占位页
    - 创建基础页面结构，后续任务填充代理配置内容
    - _Requirements: 7.1_

- [x] 2. 侧边导航组件
  - [x] 2.1 创建 components/wechat/WechatSideNav.vue
    - 定义 navItems 数组：公众号管理(/wechat/accounts)、文章下载(/wechat/articles)、代理配置(/wechat/proxy)
    - 使用 NuxtLink 渲染导航项，配合 heroicons 图标
    - 通过 `useRoute()` 判断当前路径，高亮激活项（active class）
    - 移动端（<768px）隐藏侧边栏，提供汉堡菜单按钮切换显示
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 7.3_

  - [ ]* 2.2 Write property test for route-to-navigation highlight mapping
    - **Property 1: Route-to-navigation highlight mapping**
    - 验证任意有效子路由路径，导航组件恰好标记一个 nav item 为 active，且其 `to` 属性匹配当前路由
    - **Validates: Requirements 1.5, 7.3**

- [x] 3. 登录状态面板与模态框
  - [x] 3.1 扩展 useWechatAuth composable 支持过期时间
    - 在 `composables/useWechatAuth.ts` 中新增模块级 `expiresAt` ref
    - 登录确认时从 API 响应中读取 expiresAt 并存入 localStorage
    - 新增 `getExpiresAt()` 方法返回过期时间戳
    - initFromStorage 时恢复 expiresAt
    - _Requirements: 2.2, 2.3_

  - [x] 3.2 创建倒计时格式化工具函数
    - 在 `utils/wechat-countdown.ts` 中实现 `formatCountdown(expiresAt: number, now: number): string`
    - 输出格式："X天 Y小时 Z分" 或 "X小时 Y分 Z秒"（剩余不足1天时）
    - 实现 `isExpiringSoon(expiresAt: number, now: number): boolean`（剩余 < 1小时）
    - _Requirements: 2.2, 2.4_

  - [ ]* 3.3 Write property test for expiry countdown formatting
    - **Property 2: Expiry countdown formatting**
    - 生成随机 expiresAt 和 now（now < expiresAt），验证格式化输出正确表示剩余时长
    - **Validates: Requirements 2.2**

  - [ ]* 3.4 Write property test for expiry warning threshold
    - **Property 3: Expiry warning threshold**
    - 生成随机剩余时间值，验证 isExpiringSoon 当且仅当剩余时间 < 3600000ms 且 > 0 时返回 true
    - **Validates: Requirements 2.4**

  - [x] 3.5 创建 components/wechat/WechatLoginStatus.vue
    - 使用 useWechatAuth() 获取登录状态
    - 已登录：显示头像（UAvatar）、昵称、过期倒计时文本、退出按钮
    - 未登录：显示"登录公众号"按钮
    - 使用 setInterval 每秒更新倒计时，组件卸载时清除定时器
    - 剩余 < 1小时时倒计时文字变红（text-red-500）
    - 点击登录按钮设置 showLoginModal = true
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.6 创建 components/wechat/WechatLoginModal.vue
    - 使用 UModal 组件，v-model 控制显示
    - 打开时自动调用 useWechatAuth().login() 获取二维码
    - 显示二维码图片（qrCodeUrl）、扫码状态文字
    - 监听 loginStatus 变化：confirmed 时自动关闭，expired 时显示"重新获取"按钮
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 4. Checkpoint - 验证路由与登录流程
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 公众号管理表格页
  - [x] 5.1 创建 components/wechat/WechatAccountTable.vue
    - 使用 UTable 组件渲染公众号列表
    - 定义列：序号、头像（UAvatar）、名称、最后同步时间、文章总数、已同步数、同步进度（UProgress）、同步完成（UBadge）、操作
    - 进度列：进度值 = syncedCount / articleCount，articleCount 为 0 时显示 0
    - 操作列：同步按钮、删除按钮
    - 顶部操作区：添加按钮、批量导入按钮
    - 支持行选择（UTable 的 v-model:selected），选中后显示批量同步/批量删除按钮
    - 删除操作弹出 UModal 确认对话框
    - 通过 $fetch('/api/wechat/accounts') 加载数据
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 5.2 Write property test for sync progress calculation
    - **Property 4: Sync progress calculation**
    - 生成随机 articleCount (>=0) 和 syncedCount (0..articleCount)，验证进度值在 [0,1] 范围内
    - **Validates: Requirements 3.2**

  - [ ]* 5.3 Write property test for row selection enables batch actions
    - **Property 5: Row selection enables batch actions**
    - 生成随机选中行 ID 集合，验证非空时批量按钮启用，空时禁用
    - **Validates: Requirements 3.6, 4.6**

  - [x] 5.4 填充 pages/wechat/accounts.vue 页面内容
    - 页面标题"公众号管理"
    - 引入 WechatAccountTable 组件
    - _Requirements: 3.1, 7.1_

- [x] 6. 文章列表页
  - [x] 6.1 创建 components/wechat/WechatAccountSelector.vue
    - 使用 USelectMenu 组件，支持搜索过滤
    - Props: modelValue (number|null), accounts (WechatAccount[])
    - 显示公众号头像和名称
    - 选择后 emit update:modelValue
    - _Requirements: 4.1_

  - [x] 6.2 创建 components/wechat/WechatArticleTable.vue
    - 使用 UTable 渲染文章列表
    - 列：序号、标题、发布时间、下载状态（UBadge: 已下载/待下载/失败）
    - 顶部：WechatAccountSelector + 日期区间选择器（两个 UInput type=date）
    - 支持行选择，选中后显示"批量抓取"按钮
    - 使用 useWechatDownload() 管理下载状态
    - 下载进行中显示进度（已完成/总数）和停止按钮
    - 通过 $fetch('/api/wechat/articles/list') 加载数据，传入 accountId 和日期区间参数
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 6.3 Write property test for download status label mapping
    - **Property 6: Download status label mapping**
    - 枚举所有 downloadStatus 值，验证映射函数返回对应中文标签且无 undefined
    - **Validates: Requirements 4.4**

  - [ ]* 6.4 Write property test for date range filtering
    - **Property 7: Date range filtering**
    - 生成随机文章列表和日期区间，验证筛选结果仅包含 publishedAt 在区间内的文章，保持原始顺序
    - **Validates: Requirements 4.5**

  - [ ]* 6.5 Write property test for account selection loads correct articles
    - **Property 8: Account selection loads correct articles**
    - 生成随机 accountId 和文章列表，验证筛选后文章的 sourceId 均匹配选中 accountId
    - **Validates: Requirements 4.2**

  - [x] 6.6 填充 pages/wechat/articles.vue 页面内容
    - 页面标题"文章下载"
    - 引入 WechatArticleTable 组件
    - _Requirements: 4.1, 7.1_

- [x] 7. 代理配置页
  - [x] 7.1 创建 components/wechat/WechatProxyForm.vue
    - 表单字段：URL（必填）、名称、Authorization
    - Props: editingProxy (WechatProxy | null)
    - Emits: saved, cancelled
    - 编辑模式时填充已有数据
    - 提交时调用 $fetch POST/PUT 对应 API
    - _Requirements: 6.2, 6.4, 6.5_

  - [ ]* 7.2 Write property test for edit proxy populates form
    - **Property 10: Edit proxy populates form**
    - 生成随机 proxy 对象，验证触发编辑后表单字段值与 proxy 的 url/name/authorization 完全一致
    - **Validates: Requirements 6.5**

  - [x] 7.3 填充 pages/wechat/proxy.vue 页面内容
    - 页面标题"代理配置"
    - 引入 WechatProxyForm 组件
    - 以列表形式展示已配置代理节点（名称、URL、编辑/删除按钮）
    - 通过 $fetch('/api/wechat/proxy') 加载代理列表
    - 点击编辑按钮将 proxy 数据传入 WechatProxyForm
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_

  - [ ]* 7.4 Write property test for proxy list item rendering completeness
    - **Property 9: Proxy list item rendering completeness**
    - 生成随机代理节点列表，验证每项渲染包含名称（或 URL）、URL、编辑和删除按钮
    - **Validates: Requirements 6.3**

- [x] 8. Final checkpoint - 全部功能验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 使用 Nuxt UI 组件（UTable, UModal, UAvatar, UBadge, USelectMenu, UProgress）保持 UI 一致性
- 复用现有 useWechatAuth 和 useWechatDownload composables，仅扩展 expiresAt 支持
- Property tests 使用项目已安装的 fast-check 库
- 所有 API 调用复用已有后端接口，无需新建 API 路由
