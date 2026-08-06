## 2024-05-18 - [List Item Re-renders]
**Learning:** Large lists rendered dynamically in React components re-render all items on any state change in the parent, unless specifically memoized. In the inbox, this means switching a conversation triggered a full re-render of hundreds of `ConversationItem`s.
**Action:** When working with dynamic long lists where items maintain mostly static props, wrap the item component in `React.memo` to skip unnecessary renders during parent state updates.
