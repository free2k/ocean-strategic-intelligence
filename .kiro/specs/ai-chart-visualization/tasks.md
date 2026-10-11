# Implementation Plan: AI 图表可视化

## Overview

为 `/charts` 页面实现 AI 驱动的图表可视化功能。用户上传 Excel/CSV 文件后，通过自然语言对话让 AI 生成 ECharts 配置。实现顺序：依赖安装 → 工具函数 → composables → 服务端 API → UI 组件 → 页面集成。

## Tasks

- [x] 1. 安装依赖与扩展服务端工具函数
  - [x] 1.1 安装 xlsx（SheetJS）依赖
    - 执行 `npm install xlsx` 添加文件解析库
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 在 server/utils/embedding.ts 中新增 chatCompletionStream 函数
    - 实现支持多轮消息的流式 chat 函数
    - 签名：`chatCompletionStream(messages: {role: 'system'|'user'|'assistant'; content: string}[], options?: {temperature?: number; maxTokens?: number}): AsyncGenerator<string>`
    - 复用现有 OpenAI 客户端配置
    - _Requirements: 2.1, 3.2_

- [x] 2. 实现前端 composables
  - [x] 2.1 创建 composables/useFileParser.ts
    - 实现 `parseFile(file: File): Promise<ParsedFileResult>` 方法
    - 支持 .xlsx、.xls、.csv 格式解析为 JSON 数组
    - 实现 `getSampleData(data, maxRows=20)` 返回前 N 行数据样本
    - 返回 columns、data、totalRows、preview（前5行）
    - 文件格式校验：不支持的格式抛出明确错误
    - 文件大小校验：超过 10MB 抛出错误
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 2.2 编写 useFileParser 属性测试 - 文件解析产生有效结构化输出
    - **Property 1: 文件解析产生有效结构化输出**
    - 使用 fast-check 生成随机列名数组和数据行，验证解析结果的 columns 非空且 data 中每个对象的键集合等于 columns
    - 测试文件：tests/charts/file-parser.property.test.ts
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 2.3 编写 useFileParser 属性测试 - 数据摘要正确提取
    - **Property 2: 数据摘要正确提取列名和预览行**
    - 生成随机数据数组（长度 >= 1），验证 preview 为前 min(5, totalRows) 行且与原始数据对应行完全一致
    - 测试文件：tests/charts/file-parser.property.test.ts
    - **Validates: Requirements 1.3**

  - [ ]* 2.4 编写 useFileParser 属性测试 - 数据采样遵守 20 行限制
    - **Property 5: 数据采样遵守 20 行限制**
    - 生成随机长度数据数组，验证 getSampleData 返回长度为 min(N, 20) 且为原始数据前 N 行
    - 测试文件：tests/charts/file-parser.property.test.ts
    - **Validates: Requirements 2.5**

  - [x] 2.5 创建 composables/useChartChat.ts
    - 实现 ChatMessage 接口（role, content, chartOption?, timestamp）
    - 实现 `sendMessage(content, data, columns)` 方法：组装请求载荷，发起 SSE 请求到 /api/charts/generate，实时更新消息
    - 实现 `extractChartOption(text): EChartsOption | null`：从 markdown ```json 代码块中提取并解析 ECharts 配置
    - 实现 `reset()` 方法清空对话历史和当前配置
    - 管理 messages、isLoading、currentOption 响应式状态
    - 请求载荷中数据样本限制为前 20 行
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.2, 3.4, 3.5_

  - [ ]* 2.6 编写 extractChartOption 属性测试 - 从 Markdown 代码块中提取配置
    - **Property 4: 从 Markdown 代码块中提取 ECharts 配置**
    - 生成随机有效 JSON 对象，包裹在 ```json ... ``` 中，验证 extractChartOption 提取结果与原始对象等价
    - 测试文件：tests/charts/chart-option-extract.property.test.ts
    - **Validates: Requirements 2.2, 6.1**

  - [ ]* 2.7 编写 ECharts 配置序列化往返一致性属性测试
    - **Property 8: ECharts 配置序列化往返一致性**
    - 生成随机有效 ECharts option 对象，序列化为 JSON 字符串后再解析，验证与原始对象深度相等
    - 测试文件：tests/charts/chart-option-extract.property.test.ts
    - **Validates: Requirements 5.2, 6.2, 6.3, 6.4**

  - [ ]* 2.8 编写对话上下文属性测试 - 请求载荷包含完整上下文
    - **Property 3: 请求载荷包含完整上下文**
    - 生成随机用户消息、数据样本、列名和对话历史，验证构造的请求载荷包含所有字段且消息顺序一致
    - 测试文件：tests/charts/chat-context.property.test.ts
    - **Validates: Requirements 2.1, 3.2**

  - [ ]* 2.9 编写对话历史属性测试 - 对话历史保持完整有序
    - **Property 6: 对话历史保持完整有序**
    - 生成随机消息序列，依次添加后验证历史记录长度和内容顺序一致
    - 测试文件：tests/charts/chat-context.property.test.ts
    - **Validates: Requirements 3.1**

  - [ ]* 2.10 编写数据替换属性测试 - 数据替换完全覆盖旧数据
    - **Property 7: 数据替换完全覆盖旧数据**
    - 生成两组随机文件数据 A 和 B，用 B 替换 A 后验证当前状态与 B 完全一致
    - 测试文件：tests/charts/chat-context.property.test.ts
    - **Validates: Requirements 3.4**

- [ ] 3. Checkpoint - 验证 composables 和属性测试
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 实现服务端 API
  - [x] 4.1 创建 server/api/charts/generate.post.ts
    - 实现 SSE 流式端点，接收 GenerateRequest（messages, dataSample, columns, currentOption）
    - 构造 system prompt，包含数据列名和数据样本（前20行）
    - 调用 chatCompletionStream 获取流式响应
    - 以 SSE 事件格式返回：chunk（流式片段）、done（完整响应）、error（错误信息）
    - 设置 30 秒超时
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.2_

  - [ ]* 4.2 编写 generate API 单元测试
    - 测试请求体校验（缺少必填字段返回 400）
    - 测试 system prompt 构造包含列名和数据样本
    - 测试 SSE 事件格式正确性
    - 测试文件：tests/charts/generate-api.test.ts
    - _Requirements: 2.1, 2.4, 2.5_

- [x] 5. 实现 UI 组件
  - [x] 5.1 创建 components/charts/ChatPanel.vue
    - 文件上传区域：支持 .xlsx/.xls/.csv，显示文件名和数据摘要（列名 + 前5行预览）
    - 消息列表：渲染 user/assistant 消息，支持滚动
    - 输入框：底部固定，支持 Enter 发送，发送时触发 emit('send')
    - 加载状态：AI 响应时显示加载指示器
    - 文件上传成功后触发 emit('fileUploaded') 传递 ParsedFileResult
    - _Requirements: 1.3, 1.4, 3.1, 3.4, 3.5, 4.1_

  - [x] 5.2 创建 components/charts/ChartPanel.vue
    - ECharts 渲染区域：使用 echarts.init 初始化，监听 option prop 变化调用 setOption
    - 空状态：无图表时显示占位提示
    - 导出按钮组：导出 PNG（调用 chart.getDataURL）、导出 JSON（序列化 option 为 .json 文件下载）
    - 按钮禁用逻辑：无图表时禁用导出按钮
    - 响应式：监听容器 resize 调用 chart.resize()
    - _Requirements: 2.3, 4.4, 5.1, 5.2, 5.3_

  - [ ]* 5.3 编写 ChartPanel 单元测试
    - 测试空状态占位显示
    - 测试导出按钮禁用逻辑（无 option 时禁用）
    - 测试文件：tests/charts/chart-export.test.ts
    - _Requirements: 4.4, 5.3_

- [x] 6. 页面集成
  - [x] 6.1 重构 pages/charts.vue
    - 左右分栏布局：左侧 ChatPanel（约40%宽度），右侧 ChartPanel（约60%宽度）
    - 响应式：屏幕宽度 < 768px 时切换为上下堆叠布局
    - 管理页面状态：parsedData、columns、chartOption、messages、isLoading
    - 集成 useFileParser 和 useChartChat composables
    - 连接 ChatPanel 事件到 useChartChat 方法
    - 连接 useChartChat.currentOption 到 ChartPanel 的 option prop
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.2 编写 extractChartOption 单元测试
    - 测试无代码块时返回 null
    - 测试多个代码块时提取第一个有效 JSON
    - 测试嵌套代码块的边界情况
    - 测试无效 JSON 返回 null 并不抛异常
    - 测试文件：tests/charts/chart-option-extract.test.ts
    - _Requirements: 2.2, 2.4, 6.1, 6.2_

- [ ] 7. Final checkpoint - 全部功能验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 使用 TypeScript 实现所有代码
- 复用项目已有的 echarts@5.4.3，无需额外安装图表库
- 属性测试使用 fast-check 库，每个属性至少 100 次迭代
- SSE 流式响应参考项目中已有的 export-summary-stream.post.ts 实现模式
- 所有 UI 组件使用 Nuxt UI 组件库保持一致性
