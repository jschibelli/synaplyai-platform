import { Redis } from 'ioredis';
import { redisMock } from '../__mocks__/redis.mock';

const isTest = process.env.NODE_ENV === 'test';

let redisClient: Redis;

if (isTest) {
  redisClient = redisMock as unknown as Redis;
} else {
  redisClient = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD
  });
}

export default redisClient;