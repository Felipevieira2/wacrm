## 2024-05-19 - React.memo with next-intl `t` function
**Learning:** Using `React.memo` on components that receive the `t` translation function (from `next-intl`) requires a custom equality function. The `t` function reference may not be stable and can cause unexpected re-renders, breaking memoization.
**Action:** When memoizing components that receive `t` as a prop, provide a custom equality function that explicitly omits `t` from the comparison. This is safe because localization changes typically trigger full app re-mounts. Always include a comment explaining why `t` is omitted.
