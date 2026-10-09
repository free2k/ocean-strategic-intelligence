// Deployment loads the existing protected environment; never expose it to clients.
process.env.INTEL_DATABASE_URL ||= process.env.DATABASE_URL;
process.env.INTEL_ENABLE_AI ||= 'false';
await import('./server.mjs');
