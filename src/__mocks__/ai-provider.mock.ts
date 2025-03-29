import { createTypedMock } from './jest-mock-extensions';

/**
 * Provides a properly typed mock for the AI provider service
 * with full Jest mock functionality (mockResolvedValue, etc.)
 */
const mockAIProvider = {
  getCompletion: createTypedMock().mockResolvedValue({
    text: 'Mocked completion',
    totalTokens: 100,
    promptTokens: 50,
    completionTokens: 50,
    modelId: 'gpt-4'
  }),
  
  analyze: createTypedMock().mockResolvedValue({
    content: 'Analyzed content',
    modelId: 'gpt-4',
    totalTokens: 150,
    promptTokens: 100,
    completionTokens: 50,
    metadata: {}
  }),
  
  streamCompletion: createTypedMock().mockImplementation(async function* () {
    yield {
      text: 'Streamed ',
      isComplete: false
    };
    yield {
      text: 'completion',
      isComplete: true
    };
  }),
  
  getEmbeddings: createTypedMock().mockResolvedValue({
    embeddings: [new Float32Array(1536)],
    totalTokens: 10
  })
};

export default mockAIProvider;