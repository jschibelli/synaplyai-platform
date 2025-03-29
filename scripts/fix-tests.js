const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Run a specific test file to identify issues
function runTest(testFile) {
  try {
    const output = execSync(`npx jest ${testFile} --verbose`, { encoding: 'utf-8' });
    console.log(`✅ Test passed: ${testFile}`);
    return { success: true, output };
  } catch (error) {
    console.log(`❌ Test failed: ${testFile}`);
    console.log('Error:', error.stdout);
    return { success: false, output: error.stdout };
  }
}

// Main function to fix tests
async function fixTests() {
  console.log('Starting test repair process...');
  
  // First run: identify basic issues
  const basicTestResult = runTest('tests/ai/commands/complete-text-command.test.ts');
  
  // Check for expected types of errors
  if (!basicTestResult.success) {
    if (basicTestResult.output.includes('toBeInTheDocument is not a function')) {
      console.log('Fixing Jest DOM matchers...');
      // Fix code here
    }
    
    if (basicTestResult.output.includes('TypeError: expect(...).toBeInTheDocument is not a function')) {
      console.log('Adding testing-library/jest-dom to Jest setup...');
      // Fix code here
    }
  }
  
  console.log('Test repair process completed.');
}

fixTests().catch(console.error);