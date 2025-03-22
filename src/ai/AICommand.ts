export interface AICommand {
  type: string;
  documentId: string;
  userId: string;
  requiresAIAnalysis: boolean;
  parameters?: any;
}