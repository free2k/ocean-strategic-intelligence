export default defineNuxtConfig({
  compatibilityDate: '2025-10-30',
  devtools: { enabled: true },
  modules: ['@vueuse/nuxt', '@nuxt/ui'],
  ssr: true,
  runtimeConfig: {
    // 服务端私有配置
    databaseUrl: process.env.DATABASE_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
    embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536'),
    public: {
      appName: '海洋能源资源宏观知识库',
    },
  },
  app: {
    head: {
      title: '海洋能源资源宏观知识库 - 文章管理与智能问答',
      meta: [
        { name: 'description', content: '基于向量检索的文章知识库，支持多渠道文章管理和智能问答' },
      ],
    },
  },
});
