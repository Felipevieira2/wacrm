## 2024-05-18 - Brittle Custom Equality Functions in React.memo
**Learning:** When writing custom equality functions for React.memo to ignore props like `t` from next-intl, manually checking deep nested properties (like `prevProps.conversation.contact?.name === nextProps.conversation.contact?.name`) makes the equality function brittle and highly error-prone to future component prop changes.
**Action:** Always rely on reference equality for immutable data objects (e.g., `prevProps.conversation === nextProps.conversation`) instead of cherry-picking fields for comparison in `React.memo`.
