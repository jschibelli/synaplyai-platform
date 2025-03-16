export const connectToRedis = async () => {
  const Redis = require('ioredis');
  const config = require('../config/redis.config');

  const redisClient = new Redis({
    host: config.host,
    port: config.port,
    password: config.password,
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  return redisClient;
};

export const setKey = async (client, key, value) => {
  await client.set(key, value);
};

export const getKey = async (client, key) => {
  return await client.get(key);
};

export const incrementKey = async (client, key, incrementBy = 1) => {
  return await client.incrby(key, incrementBy);
};