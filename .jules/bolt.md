## 2025-05-18 - Avoid array allocation via [...arr].reverse().find()
**Learning:** `[...messages].reverse().find(...)` unnecessarily allocates a new array and performs a full array reversal just to find the last matching element. Since ES2023 `Array.prototype.findLast()` is available natively.
**Action:** Replace `[...arr].reverse().find(...)` with `arr.findLast(...)` which works directly on the original array without allocating a copy or reversing it.
