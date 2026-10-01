## 2024-05-24 - PostgREST Filter Injection

**Vulnerability:** A PostgREST filter injection vulnerability existed in `src/app/(dashboard)/contacts/page.tsx`. The search `term` (derived from user input) was interpolated directly into a `.or()` filter string. Because PostgREST uses commas to delineate multiple conditions in `.or()`, a user could inject commas (and other control characters) to modify the logic of the query.
**Learning:** PostgREST parses raw strings. When passing variables to raw filter strings in Supabase (especially `.or()` or `.and()`), you must escape double quotes by replacing them with two double quotes (`""`) and enclose the interpolated value within double quotes (`"`).
**Prevention:** Always escape user input when building manual PostgREST strings: `const escaped = input.replace(/"/g, '""'); query.or(\`column.ilike."%\${escaped}%"\`)`.
