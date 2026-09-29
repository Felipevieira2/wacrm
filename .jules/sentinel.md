## 2025-02-14 - Prevent PostgREST filter injection in `or` clauses
**Vulnerability:** User input passed to Supabase `.or()` queries without proper escaping allowed filter injection.
**Learning:** `ilike` and other operators within `.or()` expressions can be broken if the interpolated input contains characters like `,` or `"`. The `.or()` function in `@supabase/supabase-js` accepts a raw PostgREST filter string, so it evaluates the string directly instead of parameterizing it.
**Prevention:** Always escape double quotes by replacing them (`replace(/"/g, '""')`) and wrapping the interpolated user input in double quotes when dynamically building strings for `.or()` clauses (e.g., `"%${safeTerm}%"`).
