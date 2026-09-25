## 2024-05-24 - React.memo custom comparison with translations
**Learning:** When using React.memo on components that receive the 't' translation function (from next-intl), we must provide a custom equality function that explicitly omits 't' from the comparison to prevent memoization breakage. Passing a new reference of a translation function from a parent would otherwise break the memoization.
**Action:** Provide a custom equality function that explicitly omits the translation prop 't' for React.memo in next-intl based components, and comment about full app re-mounts on localization changes.
