# Custom React Hooks Overview

Below is a list of the custom React hooks exposed in the SynaplyAI workspace, along with references and basic usage patterns.

---

## 1. useYjsCollaboration

**File:** `src/hooks/useYjsCollaboration.ts`  
**Purpose:** Provides real-time collaboration using YJS.

```typescript
import { useYjsCollaboration } from '@/hooks/useYjsCollaboration';

function MyEditor() {
  const { isConnected, content, updateContent } = useYjsCollaboration({
    documentId: 'doc-1234',
    initialContent: 'Hello YJS'
  });

  // ...
}
```

---

## 2. useYjsDocument

**File:** `src/hooks/useYjsDocument.ts`  
**Purpose:** Manages YJS documents (tokens, user presence, etc.) for React.

```typescript
import { useYjsDocument } from '@/hooks/useYjsDocument';

function EditorWrapper() {
  const {
    tokens,
    isConnected,
    updateTokenState
  } = useYjsDocument('doc-1234', 'Initial text');

  // ...
}
```

---

## 3. useTokenState

**File:** `src/hooks/useTokenState.ts`  
**Purpose:** Handles token-level state (conflicts, acceptance, etc.).

```typescript
import { useTokenState } from '@/hooks/useTokenState';

function TokenEditor() {
  const {
    tokens,
    conflicts,
    updateTokenState,
    resolveAllConflicts
  } = useTokenState('doc-1234');

  // ...
}
```

---

## 4. useVectorClock

**File:** `src/hooks/useVectorClock.ts`  
**Purpose:** Tracks versioning and concurrency using vector clocks.

```typescript
import { useVectorClock } from '@/hooks/useVectorClock';

function VersionedEditor() {
  const { clock, incrementClock } = useVectorClock('doc-1234', 'user-5678');
  // ...
}
```

---

## 5. useConflictContext

**File:** `src/contexts/ConflictContext.tsx`  
**Purpose:** Provides a React context for managing conflicts and suggestions.

```typescript
import { useConflictContext } from '@/contexts/ConflictContext';

function ConflictPanel() {
  const { activeConflicts, resolveConflict } = useConflictContext();
  // ...
}
```

---

## 6. useEditorAI

**File:** `src/hooks/useEditorAI.ts`  
**Purpose:** Integrates AI generation features into a Tiptap editor (or similar).

```typescript
import { useEditorAI } from '@/hooks/useEditorAI';

function AIEnhancedEditor({ editor }) {
  const { generateText } = useEditorAI(editor, {
    selectedModel: 'gpt-4',
    documentId: 'doc-1234'
  });

  // ...
}
```

---

## Summary

Each hook supports a distinct part of the collaboration and AI workflow:  
- **useYjsCollaboration, useYjsDocument** → Real-time synchronization with YJS  
- **useTokenState** → Token-level conflict detection and resolution  
- **useVectorClock** → Versioning and concurrency tracking  
- **useConflictContext** → Higher-level conflict handling in UI components  
- **useEditorAI** → AI text generation and editorial enhancements  