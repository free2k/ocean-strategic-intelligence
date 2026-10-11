# 需求文档

## 简介

为现有的 Nuxt 3 知识库应用的 `/charts` 页面添加 AI 驱动的图表可视化功能。用户可以通过上传 Excel/CSV 数据文件，结合自然语言对话与 AI 交互，自动生成和迭代修改 ECharts 图表配置，实现智能化的数据可视化体验。

## 术语表

- **Chart_Page**: `/charts` 路由对应的图表可视化页面
- **Chat_Panel**: 页面左侧的对话交互面板，用户通过该面板与 AI 进行自然语言交互
- **Chart_Panel**: 页面右侧的图表渲染面板，用于展示 ECharts 生成的图表
- **File_Parser**: 前端文件解析模块，负责将上传的 Excel/CSV 文件转换为 JSON 数据
- **Chart_Generator**: 服务端 API，接收用户请求和数据，调用 LLM 生成 ECharts 配置
- **ECharts_Renderer**: 前端图表渲染组件，接收 ECharts option JSON 并渲染图表
- **Conversation_Context**: 多轮对话的上下文信息，包含历史消息和当前图表配置

## 需求

### 需求 1：文件上传与解析

**用户故事：** 作为用户，我希望能上传 Excel 或 CSV 数据文件，以便系统自动解析数据用于图表生成。

#### 验收标准

1. WHEN 用户选择一个 Excel 文件（.xlsx, .xls），THE File_Parser SHALL 使用 xlsx（SheetJS）库将文件内容解析为 JSON 数组格式
2. WHEN 用户选择一个 CSV 文件（.csv），THE File_Parser SHALL 将文件内容解析为 JSON 数组格式
3. WHEN 文件解析完成，THE Chat_Panel SHALL 显示解析后的数据摘要信息，包括列名列表和前 5 行数据预览
4. IF 上传的文件格式不受支持或解析失败，THEN THE File_Parser SHALL 向用户显示明确的错误提示信息
5. THE File_Parser SHALL 在前端完成所有文件解析操作，不将原始文件上传至服务端

### 需求 2：AI 图表生成

**用户故事：** 作为用户，我希望通过自然语言描述我想要的图表，AI 能自动生成对应的 ECharts 配置。

#### 验收标准

1. WHEN 用户输入自然语言描述并提交，THE Chart_Generator SHALL 将用户描述、数据样本和对话上下文发送至 LLM
2. WHEN LLM 返回响应，THE Chart_Generator SHALL 从响应中提取有效的 ECharts option JSON 配置
3. WHEN 有效的 ECharts 配置生成完成，THE ECharts_Renderer SHALL 在 Chart_Panel 中渲染对应的图表
4. IF LLM 返回的内容无法解析为有效的 ECharts 配置，THEN THE Chart_Generator SHALL 向用户返回错误信息并建议重新描述需求
5. THE Chart_Generator SHALL 在发送给 LLM 的数据样本中仅包含前 20 行数据，以控制 token 消耗

### 需求 3：多轮对话交互

**用户故事：** 作为用户，我希望能通过多轮对话迭代修改图表，例如"改为折线图"、"添加数据标签"等。

#### 验收标准

1. THE Chat_Panel SHALL 维护完整的对话历史记录，包括用户消息和 AI 响应
2. WHEN 用户发送后续修改请求，THE Chart_Generator SHALL 将当前 ECharts 配置和对话历史一并发送给 LLM 作为上下文
3. WHEN AI 返回修改后的图表配置，THE ECharts_Renderer SHALL 更新 Chart_Panel 中的图表渲染
4. THE Chat_Panel SHALL 支持用户在对话中随时上传新的数据文件替换当前数据源
5. WHEN 用户发送新消息时，THE Chat_Panel SHALL 显示加载状态指示器，直到 AI 响应完成

### 需求 4：页面布局

**用户故事：** 作为用户，我希望页面采用左右分栏布局，左侧为对话区域，右侧为图表展示区域，便于同时查看对话和图表。

#### 验收标准

1. THE Chart_Page SHALL 采用左右分栏布局，左侧为 Chat_Panel，右侧为 Chart_Panel
2. WHILE 屏幕宽度小于 768px，THE Chart_Page SHALL 切换为上下堆叠布局，Chat_Panel 在上，Chart_Panel 在下
3. THE Chat_Panel SHALL 占据页面宽度的约 40%，Chart_Panel 占据约 60%
4. THE Chart_Panel SHALL 在无图表数据时显示空状态占位提示

### 需求 5：图表导出

**用户故事：** 作为用户，我希望能将生成的图表导出为图片或导出 ECharts 配置 JSON，便于在其他场景使用。

#### 验收标准

1. WHEN 用户点击"导出图片"按钮，THE ECharts_Renderer SHALL 将当前图表导出为 PNG 格式图片并触发浏览器下载
2. WHEN 用户点击"导出配置"按钮，THE Chart_Panel SHALL 将当前 ECharts option JSON 导出为 .json 文件并触发浏览器下载
3. WHILE 当前无已渲染的图表，THE Chart_Panel SHALL 禁用导出按钮

### 需求 6：ECharts 配置解析与序列化

**用户故事：** 作为开发者，我需要可靠地解析 LLM 返回的 ECharts 配置文本，并能将配置对象序列化为 JSON 字符串。

#### 验收标准

1. WHEN LLM 返回包含 JSON 代码块的文本，THE Chart_Generator SHALL 从 markdown 代码块（```json ... ```）中提取 JSON 内容
2. WHEN 提取的 JSON 字符串被解析，THE Chart_Generator SHALL 将其转换为有效的 ECharts option 对象
3. THE Chart_Generator SHALL 将 ECharts option 对象序列化为格式化的 JSON 字符串用于导出
4. FOR ALL 有效的 ECharts option 对象，解析序列化后的 JSON 字符串 SHALL 产生与原始对象等价的结果（往返一致性）
