# Requirements Document

## Introduction

本需求文档描述对 knowledge-base 项目中微信公众号管理页面的 UI 重构。重构目标是仿照 wechat-article-exporter 的界面布局，将现有的单页面卡片式布局改为左侧导航 + 右侧内容区的 Dashboard 布局，并将登录状态信息移至右上角/侧边栏底部，同时增强公众号管理和文章列表的表格化展示能力。

## Glossary

- **Wechat_Dashboard**: 微信公众号管理的主界面容器，采用左侧导航栏 + 右侧内容区的布局结构
- **Side_Navigation**: 左侧固定导航栏，包含公众号管理、文章下载、代理配置等功能入口
- **Login_Status_Panel**: 登录状态面板，显示当前登录用户的头像、昵称、过期时间倒计时和退出按钮
- **Account_Table**: 公众号管理表格，以表格形式展示已订阅公众号的详细信息和同步状态
- **Article_Table**: 文章列表表格，展示选定公众号的文章列表，支持筛选和批量操作
- **Account_Selector**: 公众号选择器，下拉组件用于在文章下载页面切换当前查看的公众号
- **Date_Range_Picker**: 日期区间选择器，用于筛选文章的同步日期范围
- **Expiry_Countdown**: 登录过期倒计时，实时显示登录凭证剩余有效时间

## Requirements

### Requirement 1: Dashboard 布局重构

**User Story:** As a 知识库管理员, I want 微信公众号管理页面采用左侧导航加右侧内容区的布局, so that 可以在不同功能模块间快速切换，提升操作效率。

#### Acceptance Criteria

1. THE Wechat_Dashboard SHALL 采用左侧固定宽度（250px）导航栏加右侧自适应内容区的两栏布局
2. THE Side_Navigation SHALL 包含以下导航项：公众号管理、文章下载、代理配置
3. WHEN 用户点击 Side_Navigation 中的导航项, THE Wechat_Dashboard SHALL 在右侧内容区切换显示对应的功能页面
4. THE Wechat_Dashboard SHALL 在右侧内容区顶部显示固定高度（60px）的操作栏，包含当前页面标题
5. THE Side_Navigation SHALL 高亮显示当前激活的导航项
6. WHILE 浏览器窗口宽度小于 768px, THE Side_Navigation SHALL 隐藏并提供移动端菜单切换按钮

### Requirement 2: 登录状态右上角展示

**User Story:** As a 知识库管理员, I want 在界面右上角或侧边栏底部看到当前登录状态, so that 可以随时了解登录凭证是否有效。

#### Acceptance Criteria

1. WHEN 用户已登录, THE Login_Status_Panel SHALL 显示当前微信公众号的头像、昵称和退出按钮
2. WHEN 用户已登录, THE Expiry_Countdown SHALL 实时显示登录凭证剩余有效时间（格式如"登录信息过期时间还剩: 4天"）
3. THE Expiry_Countdown SHALL 每秒更新一次倒计时显示
4. WHILE 登录凭证剩余时间少于 1 小时, THE Expiry_Countdown SHALL 以红色文字显示警告状态
5. WHEN 用户未登录, THE Login_Status_Panel SHALL 显示"登录公众号"按钮，点击后触发扫码登录流程
6. WHEN 用户点击退出按钮, THE Login_Status_Panel SHALL 清除登录状态并切换为未登录视图
7. THE Login_Status_Panel SHALL 放置在 Side_Navigation 底部区域

### Requirement 3: 公众号管理表格化展示

**User Story:** As a 知识库管理员, I want 以表格形式查看和管理已订阅的公众号, so that 可以直观地了解每个公众号的同步状态和进度。

#### Acceptance Criteria

1. THE Account_Table SHALL 以表格形式展示已订阅公众号，包含以下列：序号、头像、名称、最后同步时间、文章总数、已同步文章数、同步进度、是否同步完成、操作
2. THE Account_Table SHALL 在同步进度列中显示进度条，进度值为已同步文章数除以文章总数
3. WHEN 用户点击操作列的同步按钮, THE Account_Table SHALL 触发该公众号的文章同步流程并实时更新进度
4. THE Account_Table SHALL 在顶部操作区提供"添加"按钮，点击后弹出公众号搜索对话框
5. THE Account_Table SHALL 在顶部操作区提供"批量导入"按钮，支持通过 JSON 文件批量导入公众号
6. THE Account_Table SHALL 支持行选择，选中后可执行批量同步或批量删除操作
7. WHEN 用户点击操作列的删除按钮, THE Account_Table SHALL 弹出确认对话框，确认后删除该公众号及其关联数据

### Requirement 4: 文章列表页面

**User Story:** As a 知识库管理员, I want 在文章下载页面选择公众号并查看其文章列表, so that 可以筛选和批量下载文章内容。

#### Acceptance Criteria

1. THE Article_Table SHALL 在页面顶部提供 Account_Selector 下拉组件，用于选择要查看的公众号
2. WHEN 用户通过 Account_Selector 选择公众号, THE Article_Table SHALL 加载并显示该公众号的文章列表
3. THE Article_Table SHALL 以表格形式展示文章，包含以下列：序号、标题、发布时间、正文下载状态（是否已下载）
4. THE Article_Table SHALL 在正文下载状态列中以标签形式显示"已下载"或"待下载"状态
5. THE Article_Table SHALL 在顶部操作区提供 Date_Range_Picker，用于按发布日期区间筛选文章
6. THE Article_Table SHALL 支持行选择，选中后可执行批量下载操作
7. WHEN 用户选择文章并点击"批量抓取"按钮, THE Article_Table SHALL 触发选中文章的内容下载流程
8. WHILE 下载任务进行中, THE Article_Table SHALL 在操作区显示下载进度（已完成数/总数）和停止按钮

### Requirement 5: 扫码登录入口

**User Story:** As a 知识库管理员, I want 通过侧边栏底部的登录按钮发起扫码登录, so that 登录入口明确且不占用主内容区空间。

#### Acceptance Criteria

1. WHEN 用户点击 Login_Status_Panel 中的"登录公众号"按钮, THE Wechat_Dashboard SHALL 弹出模态对话框显示二维码
2. WHILE 二维码加载中, THE Wechat_Dashboard SHALL 在模态对话框中显示加载状态
3. WHEN 二维码加载完成, THE Wechat_Dashboard SHALL 在模态对话框中显示二维码图片供用户扫描
4. WHEN 用户扫码确认登录, THE Wechat_Dashboard SHALL 关闭模态对话框并更新 Login_Status_Panel 为已登录状态
5. IF 二维码过期, THEN THE Wechat_Dashboard SHALL 在模态对话框中显示过期提示并提供"重新获取"按钮

### Requirement 6: 代理配置页面

**User Story:** As a 知识库管理员, I want 在独立的代理配置页面管理代理节点, so that 代理设置与公众号管理和文章下载分离，界面更清晰。

#### Acceptance Criteria

1. THE Wechat_Dashboard SHALL 在 Side_Navigation 中提供"代理配置"导航项，点击后在右侧内容区显示代理管理页面
2. THE 代理配置页面 SHALL 提供表单用于添加代理节点，包含 URL、名称和 Authorization 字段
3. THE 代理配置页面 SHALL 以列表形式展示已配置的代理节点，每项包含名称、URL 和操作按钮（编辑、删除）
4. WHEN 用户提交代理节点表单, THE 代理配置页面 SHALL 将代理节点信息持久化到数据库
5. WHEN 用户点击编辑按钮, THE 代理配置页面 SHALL 将该代理节点信息填充到表单中供修改

### Requirement 7: 页面路由结构

**User Story:** As a 知识库管理员, I want 微信管理的各子功能有独立的 URL 路径, so that 可以直接通过 URL 访问特定功能页面。

#### Acceptance Criteria

1. THE Wechat_Dashboard SHALL 使用 Nuxt 嵌套路由，主路径为 /wechat，子路径包含 /wechat/accounts、/wechat/articles、/wechat/proxy
2. WHEN 用户访问 /wechat 路径, THE Wechat_Dashboard SHALL 默认重定向到 /wechat/accounts 页面
3. WHEN 用户直接访问子路径 URL, THE Wechat_Dashboard SHALL 正确渲染对应的子页面并高亮对应的导航项
4. THE Wechat_Dashboard SHALL 保持与 knowledge-base 项目现有的 default 布局兼容，嵌套在全局导航之下

