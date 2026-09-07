## 2023-11-20 - Memoizing Components Receiving i18n Functions
**Learning:** When using React.memo on components that receive a Next.js `useTranslations` 't' function, the 't' function's identity changes on every render. This breaks standard `memo` behavior because referential equality checks (`prev.t === next.t`) always return false.
**Action:** Always provide a custom comparison function to `memo` that explicitly omits `t` from the check, and only compares the actual data props (like `conversation`, `isActive`).
