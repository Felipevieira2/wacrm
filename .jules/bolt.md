## 2023-10-27 - Performance Investigation
**Learning:** When applying `React.memo` to components passed the Next-Intl `t` translation function, the `t` function fails shallow equality checks and causes unwanted re-renders.
**Action:** Always provide a custom equality function to `React.memo` that explicitly checks only the required props (e.g. data objects, event handlers) and omits checking the `t` function. Ensure reference equality is used for data objects to avoid brittle nested checks.
