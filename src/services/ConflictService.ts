import { ConflictResolutionStrategy } from '../conflicts/ConflictResolver';
import { performance } from 'perf_hooks';
import { diffWords } from 'diff';

interface PerformanceTestResult {
  operation: string;
  averageTime: number;
  runs: number;
}

/**
 * Performance test for the conflict panel
 */
async function runConflictPanelPerformanceTests(): Promise<PerformanceTestResult[]> {
  const results: PerformanceTestResult[] = [];
  const runs = 100;
  
  // Test 1: Test diff algorithm performance
  {
    let totalTime = 0;
    
    for (let i = 0; i < runs; i++) {
      const original = generateRandomText(1000);
      const modified = modifyText(original, 20);
      
      const start = performance.now();
      diffWords(original, modified);
      const end = performance.now();
      
      totalTime += (end - start);
    }
    
    results.push({
      operation: 'Diff Algorithm (1000 chars, 20 changes)',
      averageTime: totalTime / runs,
      runs
    });
  }
  
  // Test 2: Test token state updates
  {
    let totalTime = 0;
    const tokenCount = 200;
    const stateOptions = ['ACCEPTED', 'REJECTED', 'CONFLICTED'];
    
    for (let i = 0; i < runs; i++) {
      const tokenStates: Record<string, string> = {};
      
      // Initialize token states
      for (let j = 0; j < tokenCount; j++) {
        tokenStates[`token-${j}`] = stateOptions[Math.floor(Math.random() * stateOptions.length)];
      }
      
      const start = performance.now();
      
      // Simulate state update - in real component this would be setTokenState
      const updatedStates = { ...tokenStates };
      updatedStates[`token-${Math.floor(Math.random() * tokenCount)}`] = stateOptions[Math.floor(Math.random() * stateOptions.length)];
      
      const end = performance.now();
      
      totalTime += (end - start);
    }
    
    results.push({
      operation: `Token State Update (${tokenCount} tokens)`,
      averageTime: totalTime / runs,
      runs
    });
  }
  
  return results;
}

// Helper functions
function generateRandomText(length: number): string {
  const words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'];
  let result = '';
  
  while (result.length < length) {
    result += words[Math.floor(Math.random() * words.length)] + ' ';
  }
  
  return result.substring(0, length);
}

function modifyText(text: string, changes: number): string {
  const words = text.split(' ');
  let modified = [...words];
  
  for (let i = 0; i < changes; i++) {
    const changeType = Math.floor(Math.random() * 3);
    const position = Math.floor(Math.random() * modified.length);
    
    switch (changeType) {
      case 0: // Replace word
        if (modified.length > 0) {
          modified[position] = 'changed';
        }
        break;
      case 1: // Add word
        modified.splice(position, 0, 'added');
        break;
      case 2: // Remove word
        if (modified.length > 1) {
          modified.splice(position, 1);
        }
        break;
    }
  }
  
  return modified.join(' ');
}

// Run the tests
runConflictPanelPerformanceTests().then(results => {
  console.table(results);
  
  // Check if all tests meet the target response time (<150ms)
  const allTestsPassed = results.every(result => result.averageTime < 150);
  console.log(`Performance tests ${allTestsPassed ? 'PASSED' : 'FAILED'}`);
});

class ConflictService {
  private apiUrl = '/api/conflicts';

  async getActiveConflicts(documentId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch conflicts');
    }
    return response.json();
  }
  
  async getRelatedSuggestions(documentId: string, conflictId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}/suggestions/${conflictId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch related suggestions');
    }
    return response.json();
  }
  
  async resolveConflict(
    documentId: string,
    conflictId: string,
    strategy: ConflictResolutionStrategy,
    mergedContent?: string
  ) {
    const response = await fetch(`${this.apiUrl}/${documentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conflictId,
        strategy,
        mergedContent
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to resolve conflict');
    }
    
    return response.json();
  }
  
  async getConflictStatistics(documentId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}/statistics`);
    if (!response.ok) {
      throw new Error('Failed to fetch conflict statistics');
    }
    return response.json();
  }
}

export const conflictService = new ConflictService();