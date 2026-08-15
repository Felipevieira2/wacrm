## 2025-02-18 - Debounce Search Optimization
**Learning:** In `src/app/(dashboard)/contacts/page.tsx`, the search input triggered a Supabase fetch on every single keystroke. This causes massive unnecessary API load and re-renders. A custom `useDebounce` hook resolves this issue.
**Action:** Always verify if search inputs in Next.js applications directly trigger API/DB queries without throttling or debouncing, especially when using standard React state hooks to track the input string.
