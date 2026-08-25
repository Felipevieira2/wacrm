## 2024-05-24 - React.memo with next-intl hooks
**Learning:** In Next.js apps using `next-intl`, passing the `t` function (returned from `useTranslations`) as a prop will often break `React.memo` because the hook may return a new function reference on every render or context update.
**Action:** When memoizing components that receive `t` as a prop, provide a custom equality function to `React.memo` that explicitly omits `t` from the comparison. Locale changes will cause a remount anyway, so skipping it is safe and ensures the memoization actually works.
