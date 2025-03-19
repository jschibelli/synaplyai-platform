import { 
  CompleteTextCommand, 
  RewriteSelectionCommand,
  SummarizeSelectionCommand,
  ImproveWritingCommand 
} from './AICommandHandlers';

// Validation result interface
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Complete text command validation
export function validateCompleteTextCommand(command: CompleteTextCommand): ValidationResult {
  const errors: string[] = [];
  
  if (!command.documentId) {
    errors.push('Document ID is required');
  }
  
  if (command.position < 0) {
    errors.push('Position must be a non-negative number');
  }
  
  if (!command.contextParameters) {
    errors.push('Context parameters are required');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

// Rewrite selection command validation
export function validateRewriteSelectionCommand(command: RewriteSelectionCommand): ValidationResult {
  const errors: string[] = [];
  
  if (!command.documentId) {
    errors.push('Document ID is required');
  }
  
  if (command.startPosition < 0) {
    errors.push('Start position must be a non-negative number');
  }
  
  if (command.endPosition <= command.startPosition) {
    errors.push('End position must be greater than start position');
  }
  
  if (!command.originalText || command.originalText.length === 0) {
    errors.push('Original text is required and cannot be empty');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

// Summarize selection command validation
export function validateSummarizeSelectionCommand(command: SummarizeSelectionCommand): ValidationResult {
  const errors: string[] = [];
  
  if (!command.documentId) {
    errors.push('Document ID is required');
  }
  
  if (command.startPosition < 0) {
    errors.push('Start position must be a non-negative number');
  }
  
  if (command.endPosition <= command.startPosition) {
    errors.push('End position must be greater than start position');
  }
  
  if (!command.originalText || command.originalText.length === 0) {
    errors.push('Original text is required and cannot be empty');
  }
  
  // Check if text is long enough to be summarized
  if (command.originalText && command.originalText.length < 100) {
    errors.push('Text is too short to be summarized (minimum 100 characters)');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

// Improve writing command validation
export function validateImproveWritingCommand(command: ImproveWritingCommand): ValidationResult {
  const errors: string[] = [];
  
  if (!command.documentId) {
    errors.push('Document ID is required');
  }
  
  if (command.startPosition < 0) {
    errors.push('Start position must be a non-negative number');
  }
  
  if (command.endPosition <= command.startPosition) {
    errors.push('End position must be greater than start position');
  }
  
  if (!command.originalText || command.originalText.length === 0) {
    errors.push('Original text is required and cannot be empty');
  }
  
  if (!command.aspects || command.aspects.length === 0) {
    errors.push('At least one improvement aspect must be specified');
  }
  
  if (command.intensity !== undefined && (command.intensity < 1 || command.intensity > 10)) {
    errors.push('Intensity must be between 1 and 10');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}