## 2024-09-08 - React.memo with next-intl translation functions
**Learning:** When using React.memo on components that receive the 't' translation function (from next-intl), provide a custom equality function that explicitly omits 't' from the comparison to prevent memoization breakage.
**Action:** Always implement a custom `(prevProps, nextProps)` equality function that checks reference equality of data objects and callbacks, but skips comparing `t` for components receiving translations.
