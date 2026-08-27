## 2024-05-18 - React.memo with next-intl translation function
**Learning:** The `t` translation function provided by `next-intl` (via `useTranslations`) can break `React.memo` if included in the default shallow equality comparison, as its identity may change.
**Action:** When memoizing a component that takes `t` as a prop, provide a custom comparison function that explicitly ignores `t` while comparing the other props (e.g., `conversation`, `isActive`, etc.).
