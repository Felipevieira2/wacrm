## 2024-08-24 - React.memo Optimization on List Items
**Learning:** Found a missing React.memo on a heavily rendered list component (`ConversationItem` inside `ConversationList`).
**Action:** Always check list item components for missing React.memo, especially those whose parent's state changes frequently (e.g., tracking an active item ID), to prevent O(N) re-renders when only one or two items actually change. Ensure that callback props passed to memoized items are stable (using `useCallback`).
