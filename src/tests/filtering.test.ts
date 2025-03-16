Sure, here's the contents for the file: /compliance-framework/compliance-framework/src/tests/filtering.test.ts

import { RegexFilterStage } from '../filtering/regex-filter';
import { EmbeddingFilterStage } from '../filtering/embedding-filter';
import { LLMFilterStage } from '../filtering/llm-filter';
import { FilterResult } from '../filtering/interfaces';

describe('Filtering Pipeline', () => {
    let regexFilter: RegexFilterStage;
    let embeddingFilter: EmbeddingFilterStage;
    let llmFilter: LLMFilterStage;

    beforeEach(() => {
        regexFilter = new RegexFilterStage();
        embeddingFilter = new EmbeddingFilterStage();
        llmFilter = new LLMFilterStage();
    });

    test('RegexFilterStage should return allowed result', async () => {
        const content = 'Sample content';
        const result: FilterResult = await regexFilter.process(content);
        expect(result.isAllowed).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    test('EmbeddingFilterStage should return disallowed result', async () => {
        const content = 'Sensitive content';
        const result: FilterResult = await embeddingFilter.process(content);
        expect(result.isAllowed).toBe(false);
        expect(result.reasons).toContain('Content is sensitive');
    });

    test('LLMFilterStage should return allowed result with confidence score', async () => {
        const content = 'General content';
        const result: FilterResult = await llmFilter.process(content);
        expect(result.isAllowed).toBe(true);
        expect(result.confidenceScore).toBeGreaterThan(0.5);
    });

    test('Pipeline should allow early exit', async () => {
        const content = 'Early exit content';
        const result: FilterResult = await regexFilter.process(content);
        if (result.isAllowed) {
            expect(result.reasons).toEqual([]);
        } else {
            const embeddingResult: FilterResult = await embeddingFilter.process(content);
            expect(embeddingResult.isAllowed).toBe(false);
        }
    });
});