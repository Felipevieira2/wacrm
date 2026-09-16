## 2024-03-24 - React.memo with next-intl
**Learning:** `useTranslations` (from next-intl) breaks `React.memo` by default because it creates a new context reference or function on remounts/renders.
**Action:** Always provide a custom comparison function for `React.memo` that explicitly omits the `t` prop, as localization changes trigger full app re-mounts anyway.
