## 2024-05-24 - [React.memo and next-intl translation function]
**Learning:** `next-intl`'s `t` function breaks `React.memo` by changing identity on re-renders, causing components that rely on it to re-render unnecessarily despite memoization.
**Action:** When memoizing components that receive `t` as a prop or rely on it, explicitly omit `t` from the custom equality function. Document in code that this is safe because localization changes typically trigger full app re-mounts.
