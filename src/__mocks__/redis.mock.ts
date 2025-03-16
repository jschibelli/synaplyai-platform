export const createRedisMock = () => ({
  multi: jest.fn().mockReturnThis(),
  hincrby: jest.fn().mockReturnThis(),
  xadd: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
  hget: jest.fn().mockResolvedValue('0'),
  on: jest.fn(), // Add mock for event handlers
  quit: jest.fn().mockResolvedValue('OK') // Add mock for cleanup
});

export const redisMock = createRedisMock();