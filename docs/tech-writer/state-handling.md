# Token State Handling, Partial Acceptance, and Conflict Panel Logic - Architecture Overview

## 1. Overview

This document outlines the technical architecture governing token state handling, partial acceptance, and conflict panel logic within the SynaplyAI platform. These features form a critical part of our collaborative editing system by enabling:
- Fine-grained, token-level state management
- Partial acceptance of AI-generated content
- Interactive conflict resolution via a dedicated UI panel

## 2. Token State Handling

The platform tracks individual text tokens using a dedicated state management system. Key points include:

- **Token States:**  
  Tokens can be in states such as `DEFAULT`, `ACCEPTED`, `REJECTED`, `CONFLICT`, `PENDING`, and `AI_GENERATED`.  
- **Implementation:**  
  - The **TokenStateManager** ([`src/collaboration/tokens/TokenStateManager.ts`](src/collaboration/tokens/TokenStateManager.ts)) oversees token creation, state updates, indexing by position, and persistence.
  - For conflict-specific behavior, the specialized manager in [`src/collaboration/conflict/TokenStateManager.ts`](src/collaboration/conflict/TokenStateManager.ts) handles diffing, merging, and side effects (e.g., rejecting conflicting tokens).
  - The React hook **useTokenState** ([`src/hooks/useTokenState.ts`](src/hooks/useTokenState.ts)) makes token state data and update functions available to UI components.
- **Metrics:**  
  All token state operations are instrumented with performance metrics via the metrics collector, enabling continuous monitoring of state update durations and conflict resolutions.

## 3. Partial Acceptance Logic

Handling partial acceptance allows the system to capture situations where only part of an AI-generated suggestion is accepted:

- **Mechanism:**  
  - When only some tokens within a suggestion are accepted, their state transitions, via calls to `updateTokenState`, reflect a mixed status (e.g. transitioning from `PENDING` to a partially accepted variant if designed).
  - Partial acceptance leverages the same event-sourcing mechanism by dispatching a command event within [`useTokenState.ts`](src/hooks/useTokenState.ts) that records the state change.
- **UI Feedback:**  
  - The UI dynamically updates tokens to reflect their state. For instance, partially accepted tokens might use styles defined under `token-state-pending` in [`src/styles/collaborative-editor.css`](src/styles/collaborative-editor.css).

## 4. Conflict Panel Logic

The conflict panel provides a user interface for reviewing and resolving token-level editing conflicts.

- **Component Structure:**  
  - The conflict panel is implemented in [`src/components/conflicts/ConflictPanel.tsx`](src/components/conflicts/ConflictPanel.tsx). It aggregates conflicting tokens and displays them in a grouped, intuitive layout.
- **Diff Visualization:**  
  - The system computes differences between token arrays using algorithms implemented within [`src/collaboration/conflict/TokenStateManager.ts`](src/collaboration/conflict/TokenStateManager.ts) and [`src/collaboration/conflict/TokenStateHandler.ts`](src/collaboration/conflict/TokenStateHandler.ts).  
  - Tokens are visually differentiated by state using CSS classes (e.g., `.token-accepted`, `.token-rejected`, `.token-conflicted`) as specified in the design spec ([`docs/team-docs/Conflict-panel-spec.md`](docs/team-docs/Conflict-panel-spec.md)).
- **Interactive Resolution:**  
  - Users can click tokens (handled by [`src/components/conflicts/Token.tsx`](src/components/conflicts/Token.tsx)) or use keyboard shortcuts to change token states.  
  - Actions such as "Merge," "Keep Local," and "Discard" are triggered through button clicks in the conflict panel, updating the underlying token state and re-rendering the UI accordingly.
- **Testing and Accessibility:**  
  - Comprehensive tests in [`src/tests/components/conflicts/ConflictPanel.test.tsx`](src/tests/components/conflicts/ConflictPanel.test.tsx) verify that the conflict panel correctly displays conflicts, supports resolution actions, and meets accessibility standards.

## 5. Summary

- **Token State Handling:**  
  Managed by a dedicated TokenStateManager, tokens are tracked with granular states. This infrastructure supports real-time state updates, conflict detection, and performance monitoring.
  
- **Partial Acceptance:**  
  The system supports partial acceptance by updating individual token states within a suggestion. These changes are integrated into the event-sourcing system to ensure consistent propagation.
  
- **Conflict Panel Logic:**  
  The conflict panel aggregates token conflicts and provides an interactive UI for resolution. Through visual diffing, clear color coding, and accessible input methods, it empowers users to resolve conflicts efficiently.

This architecture ensures that SynaplyAI’s collaborative editing system can manage complex document states and conflicts while providing clear visual feedback and robust performance across multi-user environments.