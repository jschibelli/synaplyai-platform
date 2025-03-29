import { jest } from '@jest/globals';

export const EventStore = jest.fn().mockImplementation(() => ({
  appendEvent: jest.fn(),
  getEvents: jest.fn(),
  getEventCountSinceVersion: jest.fn(),
  getEventsBeforeTime: jest.fn(),
  queryEvents: jest.fn(),
  getEventCount: jest.fn(),
  clearCache: jest.fn(),
  replayEvents: jest.fn()
}));

export default EventStore;