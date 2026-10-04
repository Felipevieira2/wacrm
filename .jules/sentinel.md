## 2024-05-24 - PostgREST Filter Injection in Supabase `.or()`

**Vulnerability:**
Raw user input was passed directly into a Supabase `.or()` filter string (e.g., `query.or(\`name.ilike.%${term}%\`)`). Because PostgREST filter values are comma/paren-delimited, an attacker could potentially inject arbitrary SQL-like conditions or break the query syntax if the input contains unescaped special characters like double quotes.

**Learning:**
Supabase's `.or()` method constructs a raw string for PostgREST. While `.eq()` and others handle parameterization safely in the backend for simple values, raw string interpolation in `.or()` requires manual escaping of the values to prevent PostgREST filter injection.

**Prevention:**
To prevent PostgREST filter injection in Supabase queries, user input passed to `.or()` must be properly escaped by replacing double quotes (e.g., `replace(/"/g, '""')`) and wrapping the interpolated value in double quotes. For instance:
\`\`\`typescript
const escapedTerm = term.replace(/"/g, '""');
const like = \`"%${escapedTerm}%"\`;
query.or(\`name.ilike.\${like}\`);
\`\`\`
