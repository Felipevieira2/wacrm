## 2024-05-20 - [React.memo and next-intl 't' prop]
**Learning:** When using `React.memo` on components that receive the 't' translation function (from `next-intl`), passing `t` can break memoization if not handled correctly.
**Action:** Provide a custom equality function that explicitly omits 't' from the comparison, relying on reference equality for the remaining props to maintain robust memoization.
