export default defineNuxtConfig({
  compatibilityDate: '2025-10-30',
  devtools: { enabled: true },
  modules: ['@vueuse/nuxt', '@nuxt/ui'],
  ssr: true,
  colorMode: {
    preference: 'dark', // 默认暗色，不跟随系统
    fallback: 'dark',
  },
  icon: {
    // 使用本地打包的图标，避免 SSR 时远程拉取超时
    serverBundle: 'local',
  },
  nitro: {
    noExternals: false,
  },
  vite: {
    ssr: {
      external: ['xlsx'],
    },
  },
  runtimeConfig: {
    // 服务端私有配置
    databaseUrl: process.env.DATABASE_URL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
    embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536'),
    // SMTP 邮件配置
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT || '465'),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || '',
    // 站点访问密码
    sitePassword: process.env.SITE_PASSWORD || '',
    public: {
      appName: '海洋能源资源情报分析',
    },
  },
  app: {
    head: {
      title: '海洋能源资源情报分析 - 文章管理与智能问答',
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
      ],
      meta: [
        { name: 'description', content: '基于向量检索的文章知识库，支持多渠道文章管理和智能问答' },
        { name: 'referrer', content: 'no-referrer' },
      ],
    },
  },
});
