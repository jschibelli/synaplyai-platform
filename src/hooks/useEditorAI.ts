// src/hooks/useEditorAI.ts
import { Editor } from '@tiptap/core';
import { useAI } from '@/lib/api/useAI';
import analytics from '@/lib/analytics';
import { useAIStreaming } from 'src/components/editor/ai-bridge/AIStreamingProvider';
import { useCallback } from 'react';

export function useEditorAI(editor: Editor | null, {
  selectedModel, 
  documentId 
}: { 
  selectedModel: string;
  documentId: string;
}) {
  const { generate, isGenerating: isGeneratingBatch, error } = useAI();
  
  // Try to use streaming if available, but don't fail if we're not inside the provider
  let streamingAPI = null;
  try {
    streamingAPI = useAIStreaming();
  } catch (e) {
    // Streaming not available, will fall back to batch generation
  }
  
  const completeText = useCallback(async (prompt: string) => {
    if (!editor) return;
    
    const { from } = editor.state.selection;
    const cursorPosition = editor.view.coordsAtPos(from);
    
    // Show loading indicator
    editor.commands.insertContent('<span class="ai-loading">⋯</span>');
    
    try {
      // Try streaming first if available
      if (streamingAPI && !selectedModel.includes('gpt-4-turbo')) {
        // Delete loading indicator
        editor.commands.deleteSelection();
        
        // Use streaming API
        streamingAPI.requestCompletion(prompt, from);
        
        // Analytics tracking happens on completion in the streaming provider
        return;
      }
      
      // Fall back to batch generation
      const result = await generate(selectedModel, prompt, { 
        temperature: 0.7,
        maxTokens: 500
      });
      
      // Remove loading indicator and insert AI content
      editor.commands.deleteSelection();
      editor.commands.insertContent(result.content);

      // Track usage for analytics
      analytics.track('ai_completion', {
        modelId: selectedModel,
        promptLength: prompt.length,
        resultLength: result.content.length,
        documentId: documentId
      });
    } catch (err) {
      // Handle error state in editor
      editor.commands.deleteSelection();
      editor.commands.insertContent('<span class="ai-error">Generation failed</span>');
      
      // Log error to analytics
      analytics.track('ai_error', {
        modelId: selectedModel,
        prompt,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }, [editor, selectedModel, generate, documentId, streamingAPI]);
  
  const improveSelection = useCallback(async () => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) return; // No selection
    
    const selectedText = editor.state.doc.textBetween(from, to);
    
    try {
      const result = await generate('claude-3-opus-20240229', 
        `Improve this text while maintaining its meaning: ${selectedText}`, 
        { temperature: 0.3 }
      );
      
      editor.commands.deleteSelection();
      editor.commands.insertContent(result.content);
    } catch (err) {
      // Handle error
    }
  }, [editor, generate]);
  
  return {
    completeText,
    improveSelection,
    isGenerating: isGeneratingBatch,
    error
  };
}