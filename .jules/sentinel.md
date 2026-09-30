## 2026-09-30 - PostgREST Filter Injection
**Vulnerability:** Unsanitized user input passed directly to Supabase PostgREST `.or()` expressions can alter the query logic if it contains characters like `,` or `.`
**Learning:** PostgREST parses string query filters. When using `.or()` directly, values must be properly quoted and escaped if they originate from user input.
**Prevention:** Always wrap interpolated values in double quotes and escape internal double quotes by replacing them with `""` (e.g. `term.replace(/"/g, '""')`).
