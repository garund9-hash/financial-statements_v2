# Architecture Decision Records

This document captures the significant architectural decisions made during the development of EasyFinance AI. Each record describes the context that prompted the decision, the decision itself, and the consequences — both beneficial and limiting.

---

## ADR-001: Promise-Based Singleton Cache for corp.xml

**Status:** Accepted

**Date:** 2025

### Context

`corp.xml` is an 880 KB XML file provided by OpenDart containing approximately 3,864 company entries. It must be parsed and indexed on every server cold start. Parsing a file of this size on each incoming request would add hundreds of milliseconds of latency and significant CPU cost, making autocomplete feel sluggish. A naive module-level variable risks a race condition: if two requests arrive simultaneously before the cache is ready, both may attempt to read and parse the file concurrently, duplicating work and potentially corrupting shared state.

### Decision

A single `cachePromise` variable is declared at module scope. The first call to `getCompanyCache()` assigns a self-executing async function to this variable and returns it. All subsequent concurrent or sequential calls return the same promise rather than initiating a new parse. The cache is built in a single pass over the parsed list, producing three data structures:

- `listedByName` — `Map<corp_name, entry>` covering only companies with a `stock_code` (exchange-listed). Provides O(1) exact lookup for the common case.
- `anyByName` — `Map<corp_name, entry>` covering all 3,864 entries. Provides O(1) exact lookup when a listed match is not found.
- `sortedSuggestList` — a frozen array of `{ corp_name, corp_name_lower, stock_code }` objects sorted lexicographically by lowercased name. Used as the input for O(log n) binary-search autocomplete.
- `list` — the original frozen array, retained as a fallback for O(n) substring matching when exact map lookups fail.

### Consequences

**Positive:**
- Concurrent cold-start requests share a single parse operation with zero duplicate work.
- All subsequent requests pay O(1) or O(log n) per query rather than O(n) per parse.
- The three-structure approach separates concerns: exact lookup, listed-only lookup, and prefix search each have an optimal data structure.

**Negative / Limitations:**
- The cache is process-local. In a multi-process deployment (e.g., clustered Node.js or multiple serverless instances), each process holds its own cache. This is acceptable because `corp.xml` is a static file that changes infrequently.
- If `corp.xml` changes on disk, the running process will not pick up the changes without a restart.
- The module-level `cachePromise` variable makes unit testing harder: tests must use `vi.resetModules()` followed by a dynamic re-import to obtain a fresh module scope per test case. See ADR-008.

---

## ADR-002: Strategy Pattern for Financial Metric Extraction

**Status:** Accepted

**Date:** 2025

### Context

OpenDart returns financial statement line items as a flat JSON array. Each item has an `account_id` field (a standardized identifier such as `Revenue` or `OperatingIncomeLoss`) and an `account_nm` field (a Korean display name such as `매출액`). The application needs to extract three specific metrics — revenue (매출액), operating profit (영업이익), and net income (당기순이익) — from this array.

A straightforward implementation would run one `Array.filter()` pass per metric, resulting in O(M × n) complexity where M is the number of metrics and n is the number of line items per financial statement. More importantly, adding a new metric would require modifying the extraction function itself, coupling the metric definitions to the extraction logic.

### Decision

All metric definitions are centralized in a `METRIC_DEFINITIONS` array in `app/lib/metricDefinitions.js`. Each entry specifies a display name and an array of key strings to match against both `account_id` and `account_nm`. A `KEY_TO_METRIC_INDEX` Map is pre-built from this array at module load time, mapping each key string to its metric's index in `METRIC_DEFINITIONS`.

The `extractMetrics()` function performs a single O(n) pass over the financial items array. For each item it checks all keys in `KEY_TO_METRIC_INDEX` and records the first matching item for each metric index, preferring Consolidated Financial Statements (`fs_div === 'CFS'`, i.e., 연결재무제표) over Separate Financial Statements (`OFS`, i.e., 별도재무제표). After the pass, each metric's selected item is resolved to a numeric value by stripping commas from the amount string and parsing it as a float.

### Consequences

**Positive:**
- Adding a new metric requires only appending one entry to `METRIC_DEFINITIONS`. No changes are needed in hooks, components, or API routes.
- Single O(n) pass replaces O(M × n) multi-pass filtering.
- CFS/OFS preference is applied uniformly across all metrics without per-metric logic.
- The separation between definitions and extraction logic makes each independently testable.

**Negative / Limitations:**
- The `KEY_TO_METRIC_INDEX` Map does not support regex or fuzzy matching. Keys must be exact substrings of `account_id` or `account_nm`. Unusual company reporting formats may require additional keys in `METRIC_DEFINITIONS`.
- The single-pass approach records the first matching item per metric. If OpenDart returns duplicate line items for the same account, the first occurrence wins.

---

## ADR-003: O(log n) Binary Search for Company Name Autocomplete

**Status:** Accepted

**Date:** 2025

### Context

The original autocomplete implementation performed an O(n) linear scan over all 3,864 company entries on every keystroke after a 300 ms debounce. While debouncing reduces the number of scans, each scan is still O(n) and runs on the server. With traffic scaling, this becomes a bottleneck. The autocomplete only needs prefix matches (names that start with the typed characters), not arbitrary substring matches.

### Decision

During cache construction (see ADR-001), the suggest list is sorted once in ascending lexicographic order by `corp_name_lower`. On each autocomplete request, a standard binary search locates the leftmost entry whose `corp_name_lower` is greater than or equal to the query string. The search then iterates forward from that position, collecting entries whose `corp_name_lower.startsWith(lowerQuery)` is true, stopping at the first non-match or after collecting 10 results.

The binary search uses the unsigned right-shift mid-point calculation (`(lo + hi) >>> 1`) to avoid integer overflow, and is implemented directly in the route handler without external dependencies.

### Consequences

**Positive:**
- O(log n) entry point (approximately 12 comparisons for 3,864 entries) replaces O(n) linear scan.
- The 10-result cap bounds the forward iteration, making the total cost O(log n + k) where k ≤ 10.
- The sort cost is paid once at startup and amortized across all autocomplete requests.

**Negative / Limitations:**
- Binary search only supports prefix matches. If a user types a string that appears in the middle of a company name (e.g., typing `전자` to find `삼성전자`), the binary search will not find it. The suggest endpoint is documented as prefix-only.
- The sort uses `String.localeCompare` without a `locale` argument, which defers to the JavaScript engine's default locale ordering for Korean characters. This may produce different orderings across environments, though in practice the impact on prefix matching is minimal.

---

## ADR-004: System-Role Prompt Injection Defense for GPT-4o

**Status:** Accepted

**Date:** 2025

### Context

The `/api/analyze` route accepts user-controlled data — a company name and financial figures — and incorporates them into a prompt sent to GPT-4o. Without safeguards, a malicious user could inject instructions into the prompt (prompt injection) or craft a payload that causes the model to produce harmful, off-topic, or misleading output. This is a significant concern for any application that forwards user input to a language model.

### Decision

Defense is applied in three layers:

1. **Role separation.** The system instructions (persona, task scope, output format, and the explicit directive to ignore non-financial instructions) are placed exclusively in the `system` role message. User-supplied data — company name, financial figures in JSON, and year — are placed in the `user` role message. This follows the OpenAI-recommended pattern and makes it structurally harder for injected text in the user message to override system-level instructions.

2. **Input validation before prompt construction.** The route validates all inputs before building the prompt:
   - `companyName` must be a non-empty string, at most 100 characters, and match a regex that permits only Korean Hangul, Latin alphanumeric characters, spaces, and a limited set of punctuation (`.,()&-`).
   - `financeData` must be a non-empty array of at most 10 items, each with a `name` string (≤ 50 characters) and a finite `number` value.
   - `year`, if present, must match `/^\d{4}$/`.

3. **System prompt scope restriction.** The system prompt explicitly instructs the model to perform financial analysis only and to ignore any other instructions or requests in the user turn.

### Consequences

**Positive:**
- A user cannot trivially override system instructions by prepending or appending text to the company name or financial data fields.
- Validation rejects structurally malformed payloads before they reach the model, reducing token consumption and attack surface.
- The 10-item cap on `financeData` prevents prompt-stuffing via an oversized data array.

**Negative / Limitations:**
- No input sanitization is bulletproof against all prompt injection techniques. System-role separation is a mitigation, not a guarantee.
- The regex allowlist for `companyName` may reject legitimate company names that contain characters outside the defined set (e.g., names with Chinese characters).
- These measures do not protect against model jailbreaks that operate within the permitted character set.

---

## ADR-005: AbortController for OpenAI API Timeout

**Status:** Accepted

**Date:** 2025

### Context

Serverless function environments (Vercel, AWS Lambda) enforce a maximum execution duration. A long-running or stalled request to the OpenAI API can cause the serverless function to silently time out at the infrastructure level, leaving the client waiting without a clear error. GPT-4o completions with `max_tokens: 3000` can take anywhere from a few seconds to over a minute under load.

### Decision

An `AbortController` is created before each OpenAI API call. A `setTimeout` fires the `abort()` method after 55 seconds. The controller's `signal` is passed as the second argument to `openai.chat.completions.create()` — the request options object position required by OpenAI SDK v6. A `finally` block unconditionally clears the timeout regardless of whether the request succeeds, fails, or is aborted. If the abort fires, the SDK throws an `AbortError`, which is caught by the outer `catch` block and returned as a 500 response.

55 seconds was chosen to stay safely within typical serverless function limits (commonly 60 seconds) while leaving a small buffer for network overhead.

### Consequences

**Positive:**
- Prevents silent serverless function hangs by enforcing a client-side deadline.
- The `finally`-based timeout cleanup prevents timer leaks on fast successful responses.
- SDK v6 correctly propagates the abort signal through to the underlying HTTP request.

**Negative / Limitations:**
- A 55-second timeout is a blunt instrument. If the OpenAI API consistently takes this long, users receive a generic error rather than a partial response.
- The timeout value is hardcoded. It should be reviewed if the deployment platform changes its function duration limits.

---

## ADR-006: Security Headers via next.config.mjs

**Status:** Accepted

**Date:** 2025

### Context

A web application serving financial data and AI-generated analysis is a target for common web attacks including clickjacking, MIME-type sniffing, and cross-site scripting. Browsers enforce several security policies through HTTP response headers, but Next.js does not enable any of these by default.

### Decision

Security headers are applied globally via the `headers()` async function in `next.config.mjs`. The headers applied to all routes (`source: '/(.*)'`) are:

| Header | Value | Rationale |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking by disallowing the page in any frame. |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing; browsers must respect the declared content type. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for two years, including subdomains, with HSTS preload eligibility. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends the origin only on cross-origin requests; sends full URL on same-origin requests. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables access to camera, microphone, and geolocation browser APIs. |
| `Content-Security-Policy` | See below | Restricts resource loading origins. |

The CSP allows `'unsafe-inline'` for both `script-src` and `style-src`. This is a deliberate trade-off: Next.js App Router injects inline scripts for hydration and runtime initialization that cannot be removed without breaking the framework. A nonce-based CSP would require server-side nonce generation and injection into each response, which adds significant complexity. The current posture is acceptable for the project's threat model but should be revisited if a stricter CSP is required.

### Consequences

**Positive:**
- Mitigates clickjacking, MIME sniffing, and passive XSS vectors with minimal application code.
- HSTS ensures browsers will not downgrade to HTTP after the first secure visit.
- Permissions-Policy prevents API abuse via browser-level hardware access.

**Negative / Limitations:**
- `'unsafe-inline'` in `script-src` weakens the XSS protection provided by CSP. Any injected inline script could execute.
- HSTS with `preload` is irreversible without a long waiting period. It should only be applied to domains that are committed to HTTPS permanently.
- The `connect-src: 'self'` directive will block browser-side calls to any external API if the architecture ever shifts to direct client-to-OpenDart requests.

---

## ADR-007: Differentiated Cache-Control Headers for Company Endpoints

**Status:** Accepted

**Date:** 2025

### Context

The company API has two distinct modes: autocomplete suggestions (`?type=suggest`) and exact company lookup (no type parameter). These two modes have different freshness requirements and different cost profiles.

Suggestions are stateless prefix queries over a static dataset. The underlying `corp.xml` is updated by OpenDart infrequently. Serving stale suggestions for a few minutes is acceptable and significantly reduces redundant processing.

Exact company lookups return a specific `corp_code` and company metadata that downstream code immediately uses to fetch financial statements. Stale data here is also acceptable at moderate TTLs because `corp_code` values are stable identifiers that do not change.

### Decision

Two distinct `Cache-Control` policies are applied:

- **Suggest endpoint:** `public, s-maxage=300, stale-while-revalidate=3600`
  - CDN caches the response for 5 minutes. For the next hour, CDN serves stale while revalidating in the background. This handles burst autocomplete traffic efficiently.

- **Exact lookup endpoint:** `public, s-maxage=3600, stale-while-revalidate=86400`
  - CDN caches the response for 1 hour. For the next 24 hours, CDN serves stale while revalidating. Appropriate for stable company identifiers.

### Consequences

**Positive:**
- Reduces server load for repeated autocomplete queries for popular company name prefixes.
- `stale-while-revalidate` ensures users always receive a fast cached response while the cache refreshes in the background.

**Negative / Limitations:**
- If OpenDart updates `corp.xml` (adding or removing companies), cached suggestions will be stale for up to the `stale-while-revalidate` window. In practice, OpenDart updates are rare enough that this is acceptable.
- Cache-Control headers are only effective when a CDN (e.g., Vercel Edge Network) is in front of the origin. Local `npm run dev` development sees no caching effect.

---

## ADR-008: Vitest over Jest for API Route Testing

**Status:** Accepted

**Date:** 2025

### Context

Next.js App Router uses native ES Modules throughout. Jest historically required Babel transforms or experimental VM-mode flags to handle ESM correctly, creating brittle configurations. The project's API routes and library code use native `import`/`export` syntax without CommonJS interop.

Additionally, the singleton `cachePromise` pattern (ADR-001) requires module-level state to be reset between test cases. Jest's module registry isolation (`jest.resetModules()`) works but has known edge cases with ESM. Vitest, built on Vite, has first-class ESM support.

### Decision

Vitest is used as the test runner. The configuration in `vitest.config.mjs` sets `environment: 'node'` (not jsdom), which is appropriate for API route tests that do not require a DOM. `globals: true` makes Vitest's `describe`, `it`, `expect`, and `vi` available without explicit imports. Coverage is provided by `@vitest/coverage-v8`.

To isolate the singleton cache between test cases, each test that needs a fresh module state calls `vi.resetModules()` followed by a dynamic `import()` of the route module. This pattern guarantees a new module instance with `cachePromise = null` for each test.

The test suite covers:
- `__tests__/api/analyze.test.js` — 21 tests for the GPT-4o analysis endpoint (input validation, prompt construction, error handling)
- `__tests__/api/company.test.js` — 13 tests for company search and autocomplete
- `__tests__/api/finance.test.js` — 25 tests for the OpenDart financial data proxy
- `__tests__/lib/metricDefinitions.test.js` — 18 tests for metric extraction logic

### Consequences

**Positive:**
- Native ESM support eliminates Babel transform configuration for tests.
- `vi.resetModules()` + dynamic import is a clean, supported pattern for testing singleton modules.
- Vitest's API is compatible with Jest idioms, minimizing the learning curve.

**Negative / Limitations:**
- `environment: 'node'` means component-level tests (if added) would require a separate Vitest configuration with `jsdom` environment, or a workspace configuration.
- The dynamic re-import pattern for singleton isolation is verbose. Each test file that tests the company route must repeat the `beforeEach` setup.
- Coverage is scoped to `app/api/**` and `app/lib/**` only. React component coverage requires additional tooling.
