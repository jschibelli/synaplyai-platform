# Redis Configuration Guide

## Setup

### 1. Local Development
```bash
# Install Redis
npm install ioredis

# Configure environment variables
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD
});
const redisMock = createRedisMock();
// Mock implementation provided