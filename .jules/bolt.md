## 2024-05-18 - [Optimization] React.memo on components that receive translation function
**Learning:** React.memo on components that receive a Next-intl translation function as prop need to use custom equality function to exclude it, otherwise memoization breaks.
**Action:** Be mindful to provide custom equality functions when using `React.memo` for components receiving translation functions.
