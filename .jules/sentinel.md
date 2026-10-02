
## 2024-05-18 - PostgREST Filter Injection in Supabase `.or()` queries
**Vulnerability:** User input was directly interpolated into Supabase's `.or()` filter strings (e.g. `query.or(\`name.ilike.%${term}%,phone.ilike.%${term}%\`)`), allowing attackers to potentially break out of the string context and inject arbitrary PostgREST filter expressions using double quotes.
**Learning:** Supabase uses PostgREST syntax for `.or()` strings. If an attacker inputs `",phone.ilike.a`, the resulting query string becomes `name.ilike.%",phone.ilike.a%,...`, which alters the query's semantics and could bypass data visibility boundaries or leak data.
**Prevention:** Always escape double quotes inside user input using `replace(/"/g, '""')` and wrap the entire interpolated string in double quotes: `query.or(\`name.ilike."%${escapedTerm}%"\`)`.
