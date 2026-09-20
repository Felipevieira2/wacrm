## 2024-05-24 - React.memo and next-intl translation function
**Learning:** Using `React.memo` on components that receive the `t` translation function (from `next-intl`) is ineffective because the translation hook returns a new function reference on every render, defeating memoization.
**Action:** When memoizing components with `next-intl`, always provide a custom equality function that explicitly ignores the `t` prop. Document that this is safe because locale changes typically trigger a full app re-mount anyway.
