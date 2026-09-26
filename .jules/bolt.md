## 2024-05-18 - Drag and drop performance
**Learning:** During drag and drop operations in the pipeline board, frequent state changes in the parent component (`activeDealId`) caused re-rendering of all columns and cards unnecessarily.
**Action:** Use `React.memo` with custom equality functions on heavy lists / child items (`StageColumn`, `DraggableDealCard`, `DealCard`) in drag-and-drop contexts to ensure only the dragged item updates, avoiding cascading renders.
