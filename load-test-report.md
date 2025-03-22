# Load Test Results

Date: 2025-03-21T15:10:31.347Z
Iterations: 3

## Summary

- Average Duration: 4186.89ms
- Average Operations/Second: 1194.27
- Average Conflict Resolution Success: 95.76%
- Overall Validation: ❌ FAILED

## Validation Results

| Metric | Result | Actual | Target |
| ------ | ------ | ------ | ------ |
| conflictResolutionSuccess | ✅ PASSED | 95.76% | 95.00% |
| aiResponseTime | ✅ PASSED | 302.28 | 500 |
| streamingLatency | ❌ FAILED | 420.41ms | 100ms |
| operationsPerSecond | ✅ PASSED | 1194.27 | 1000 |

## Detailed Results

### Iteration 1

- Duration: 4182.45ms
- Operations/Second: 1195.47
- Conflict Resolution Success: 95.51%
- P95 AI Latency: 428.61ms

### Iteration 2

- Duration: 4150.55ms
- Operations/Second: 1204.66
- Conflict Resolution Success: 95.42%
- P95 AI Latency: 409.81ms

### Iteration 3

- Duration: 4227.66ms
- Operations/Second: 1182.69
- Conflict Resolution Success: 96.36%
- P95 AI Latency: 422.82ms
