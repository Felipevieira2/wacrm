## 2024-05-19 - [MessageThread Memoization]
**Learning:** In highly updated components like `MessageThread`, expensive computations like looping through all messages to group them by date run on every keystroke in un-debounced inputs or other unrelated state updates if not memoized.
**Action:** Use `useMemo` for O(N) mapping/grouping operations (like `groupMessagesByDate`) in frequent-render views to prevent CPU blocking, especially noticeable in threads with 100+ messages.
