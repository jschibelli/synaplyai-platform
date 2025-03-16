import { TenantAwareCircuitBreaker } from '../circuit-breaker/tenant-breaker';

describe('TenantAwareCircuitBreaker', () => {
    let circuitBreaker: TenantAwareCircuitBreaker;

    beforeEach(() => {
        circuitBreaker = new TenantAwareCircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 30000,
            fallback: jest.fn(),
        });
    });

    test('should trip the circuit breaker after exceeding failure threshold', async () => {
        for (let i = 0; i < 3; i++) {
            await circuitBreaker.execute(() => {
                throw new Error('Failure');
            });
        }

        expect(circuitBreaker.isOpen()).toBe(true);
    });

    test('should reset the circuit breaker after the reset timeout', async () => {
        for (let i = 0; i < 3; i++) {
            await circuitBreaker.execute(() => {
                throw new Error('Failure');
            });
        }

        expect(circuitBreaker.isOpen()).toBe(true);

        jest.advanceTimersByTime(30000); // Fast-forward time

        expect(circuitBreaker.isOpen()).toBe(false);
    });

    test('should call fallback function when circuit breaker is open', async () => {
        for (let i = 0; i < 3; i++) {
            await circuitBreaker.execute(() => {
                throw new Error('Failure');
            });
        }

        await circuitBreaker.execute(() => {
            return 'Should not reach here';
        });

        expect(circuitBreaker.fallback).toHaveBeenCalled();
    });
});