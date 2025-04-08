# Conflict Panel Design Spec

## Overview
This document outlines the design updates for the Conflict Panel to reflect token-level state changes, including color coding, diff visualization, and interaction states.

---

## ✅ 1. **Conflict Panel Structure**
### Layout:
- Add a **"Related Suggestions" section** at the top of the conflict panel:
   - Group suggestions by `CONFLICTED` and `UPDATED` status.
   - Separate dividers between "Conflicts" and "Related Suggestions."

### Example Layout:
```
[CONFLICT PANEL]
---------------------------------------
⚠️ Conflict Detected  
- Original: "world" → Suggested: "planet"  
- Resolve: [Merge] [Keep Local] [Discard]  

---------------------------------------
🔎 Related Suggestions  
- Suggested: "World is round"  
- Accept [✔️] | Reject [❌]  
```

---

## ✅ 2. **Token-Level Color Coding**
### Color Code Tokens Based on State:
| State | Color | Example |
|-------|-------|---------|
| **Accepted** | ✅ Green | Accepted tokens |
| **Rejected** | ❌ Red | Rejected tokens |
| **Conflicted** | ⚠️ Yellow | Conflicted tokens |

### Example CSS for State-Based Coloring:
```css
.token {
  padding: 2px 4px;
  border-radius: 4px;
}

.token-accepted {
  background-color: #d4edda;
  color: #155724;
}

.token-rejected {
  background-color: #f8d7da;
  color: #721c24;
}

.token-conflicted {
  background-color: #fff3cd;
  color: #856404;
}
```

### Example State Update:
```typescript
const colorClass =
  tokenState[tokenId] === "CONFLICTED"
    ? "token-conflicted"
    : tokenState[tokenId] === "PARTIALLY_ACCEPTED"
    ? "token-accepted"
    : "token-rejected";
```

---

## ✅ 3. **Diffing and Inline Highlights**
### Direct Side-by-Side Diffing:
- Original token on the left, suggested token on the right.
- Subtle highlight for conflicts:
   - Red = Rejected
   - Green = Accepted
   - Yellow = Conflicted

### Example Diff Structure:
```
[CONFLICT PANEL]  
- Original: **world**  
- Suggested: **planet**  
- [Merge] [Keep Local] [Discard]  
```

---

## ✅ 4. **Interaction States**
### States:
| State | Behavior |
|-------|----------|
| **Hover State** | Subtle shadow + cursor pointer |
| **Focus State** | Thin outline for accessibility |
| **Disabled State** | Grey out tokens and actions |

### Example CSS for Interaction:
```css
.token {
  transition: background-color 0.2s ease;
}

.token:hover {
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
}

.token:focus {
  outline: 2px solid #007bff;
}
```

---

## 🔥 **Next Steps:**
- Finalize component structure with the Frontend Lead.
- Test diff visualization and state transitions.
- Run conflict panel tests under load for performance benchmarking.

