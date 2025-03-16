// Set environment variables before tests run
Object.defineProperty(process, 'env', {
  value: {
    ...process.env,
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: 'test'
  }
});