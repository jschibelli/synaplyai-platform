export const mockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(1),
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue('OK'),
  hincrby: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  pipeline: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([])
};