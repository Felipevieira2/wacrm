## 2024-11-20 - Memoizing list items with translation props
**Learning:** When using `React.memo` on list components that receive a translation function like `t` from `next-intl`, the `t` function is often referentially unstable or causes unnecessary re-renders when compared.
**Action:** Always provide a custom equality function `(prev, next) => boolean` for `React.memo` that explicitly omits `t` and only compares the strictly necessary data objects (using referential equality like `prev.conversation === next.conversation`) and primitive state props (`prev.isActive === next.isActive`).
