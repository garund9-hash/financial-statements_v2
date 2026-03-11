# System Design and Data Flow Walkthrough

This document provides a comprehensive tour of the EasyFinance AI system: how it is structured, why each layer exists, and exactly how data flows from a user's keystrokes to a rendered financial chart and an AI-generated analysis report. It is intended for developers who are onboarding to the codebase and want to understand the design as a whole before diving into individual files.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Structure and Layer Responsibilities](#2-directory-structure-and-layer-responsibilities)
3. [The Startup Phase: corp.xml Cache Construction](#3-the-startup-phase-corpxml-cache-construction)
4. [Data Flow: Autocomplete](#4-data-flow-autocomplete)
5. [Data Flow: Financial Statement Retrieval](#5-data-flow-financial-statement-retrieval)
6. [Data Flow: AI Analysis](#6-data-flow-ai-analysis)
7. [Metric Extraction in Detail](#7-metric-extraction-in-detail)
8. [Security Architecture](#8-security-architecture)
9. [Testing Architecture](#9-testing-architecture)
10. [Key Data Structures and Formats](#10-key-data-structures-and-formats)

---

## 1. System Overview

EasyFinance AI is a Next.js 16 application with a single-page interface that allows users to look up Korean publicly listed companies, visualize their key financial metrics (revenue, operating profit, net income) for a selected year, and optionally request an AI-generated investment analysis report powered by GPT-4o.

The application sits between two external data sources:

- **OpenDart (dart.fss.or.kr)** — The Korean Financial Supervisory Service's electronic disclosure system. It provides the official list of registered companies via `corp.xml` and financial statement data via a JSON REST API.
- **OpenAI** — Provides GPT-4o for natural language analysis of financial figures. All calls are server-side; API keys are never exposed to the browser.

The browser never calls either external service directly. All external requests are proxied through Next.js API routes, which also perform input validation and error normalization.

```
Browser
  │
  ├── GET /api/company?q=...&type=suggest   (autocomplete)
  ├── GET /api/company?q=...               (exact lookup)
  ├── GET /api/finance?corp_code=...&...   (financial statements)
  └── POST /api/analyze                    (AI analysis)
        │
        ├── corp.xml (local file, parsed at startup)
        ├── OpenDart API (financial data)
        └── OpenAI API (GPT-4o)
```

---

## 2. Directory Structure and Layer Responsibilities

```
app/
├── page.js                  Root client component; owns top-level state and wires hooks to UI
├── components/              Presentational components (no data fetching)
│   ├── SearchForm.jsx       Company name input, year selector, suggestion dropdown
│   ├── CompanyInfo.jsx      Displays resolved company name and stock code
│   ├── FinancialChart.jsx   Recharts bar chart of extracted financial metrics
│   └── AiAnalysisCard.jsx   AI analysis trigger button and rendered report
├── hooks/                   Custom hooks encapsulating all async data logic
│   ├── useCompanySearch.js  Debounced autocomplete with AbortController
│   ├── useFinancialData.js  Orchestrates company lookup + financial statement fetch + metric extraction
│   └── useAiAnalysis.js     POSTs to /api/analyze and manages analysis state
├── api/                     Next.js Route Handlers (server-side only)
│   ├── company/route.js     Serves both autocomplete suggestions and exact company lookup
│   ├── finance/route.js     Proxies OpenDart financialStatementsAll API
│   └── analyze/route.js     Validates inputs and calls GPT-4o
└── lib/
    └── metricDefinitions.js Declares which metrics to extract and how; exports extractMetrics()

__tests__/
├── api/analyze.test.js           21 tests
├── api/company.test.js           13 tests
├── api/finance.test.js           25 tests
└── lib/metricDefinitions.test.js 18 tests

public/
└── corp.xml                 3,864 company entries from OpenDart (880 KB)
```

**Design principle:** The hooks layer owns all asynchronous logic and state. Components are pure renderers that receive data and callbacks as props. API routes own all server-side concerns (validation, external calls, error normalization). `metricDefinitions.js` owns metric configuration and extraction, isolated so it can be tested independently of the HTTP layer.

---

## 3. The Startup Phase: corp.xml Cache Construction

Before any user request can be served, the company data must be available. This section describes what happens the first time `GET /api/company` is called after a server cold start.

### corp.xml Format

The file is an XML document with this structure:

```xml
<result>
  <list>
    <corp_code>00126380</corp_code>
    <corp_name>삼성전자</corp_name>
    <stock_code>005930</stock_code>
    <modify_date>20240102</modify_date>
  </list>
  <list>...</list>
  ...
</result>
```

`fast-xml-parser` parses this into a JavaScript object. A known edge case: when the XML contains only one `<list>` element, `fast-xml-parser` returns the `list` property as a plain object rather than an array. The `buildCache` function guards against this with `Array.isArray(rawList) ? rawList : []`.

### Cache Construction (Single Pass)

`buildCache(rawList)` iterates over the parsed array exactly once, producing three data structures simultaneously:

```
rawList (array of 3,864 objects)
         │
         └── single for-loop
               │
               ├── listedByName Map    — entries with a non-empty stock_code
               │                         Key: corp_name, Value: formatted entry
               │                         First occurrence of each name wins
               │
               ├── anyByName Map       — all entries regardless of listing status
               │                         Key: corp_name, Value: formatted entry
               │                         First occurrence wins
               │
               └── suggestEntries []   — lightweight objects for autocomplete
                                          { corp_name, corp_name_lower, stock_code }
                    │
                    └── .sort() by corp_name_lower
                          → sortedSuggestList (frozen array)
```

Two formatting operations occur during the pass:
- `corp_code` is zero-padded to 8 digits (OpenDart requires 8-digit codes).
- `stock_code` is zero-padded to 6 digits (Korean stock exchange codes are 6 digits).

### Singleton Pattern

```javascript
let cachePromise = null;  // module-level

async function getCompanyCache() {
  if (!cachePromise) {
    cachePromise = (async () => { /* read + parse + build */ })();
  }
  return cachePromise;  // all callers await the same promise
}
```

If two requests arrive before the cache is ready, both await the same `cachePromise`. The second request does not trigger a second file read. This is the core invariant of the design.

---

## 4. Data Flow: Autocomplete

This flow is triggered on every keystroke in the company name search field, subject to a 300 ms debounce.

```
User types character
        │
        ▼
useCompanySearch (hook)
  - Resets debounce timer to 300 ms
  - Aborts any in-flight fetch from previous keystrokes
        │
        ▼ (after 300 ms of inactivity)
GET /api/company?q={prefix}&type=suggest
        │
        ▼
Route Handler: company/route.js
  1. Reads query and type from URL params
  2. Awaits getCompanyCache() (instant if already loaded)
  3. Lowercases query → lowerQuery
  4. Binary search on sortedSuggestList:
     - Finds leftmost index where corp_name_lower >= lowerQuery
     - Iterates forward, collecting entries where corp_name_lower.startsWith(lowerQuery)
     - Stops at first non-matching entry or after 10 results
  5. Returns JSON: { suggestions: [{ corp_name, stock_code }, ...] }
  6. Sets Cache-Control: public, s-maxage=300, stale-while-revalidate=3600
        │
        ▼
useCompanySearch
  - setSuggestions(data.suggestions)
  - setShowSuggestions(true)
        │
        ▼
SearchForm renders dropdown list of up to 10 suggestions
```

**AbortController usage in autocomplete:** Each debounce cycle creates a new `AbortController`. When the cleanup function of the `useEffect` runs (either on unmount or on the next keystroke), it calls `abort()` on the previous controller. This cancels any in-flight fetch for the previous query prefix, preventing a slower response from an earlier query from overwriting the results of a faster response from a later query (a classic race condition in search UIs).

---

## 5. Data Flow: Financial Statement Retrieval

This flow is triggered when the user submits the search form. It involves two sequential API calls: a company lookup followed by a financial statement fetch.

```
User submits search form
        │
        ▼
page.js: handleSearch()
  - Calls reset() (clears any previous AI analysis)
  - Calls search(query, year) from useFinancialData
        │
        ▼
useFinancialData.search(companyName, year)
  - setLoading(true), clears previous state
        │
        ▼
Step 1: GET /api/company?q={companyName}
        │
        ▼
Route Handler: company/route.js (exact lookup mode)
  Lookup priority (all O(1) except fallback):
    1. listedByName.get(query)     — listed company with exact name match
    2. anyByName.get(query)        — any company with exact name match
    3. list.find(substring match)  — O(n) fuzzy fallback for listed companies
        │
        ▼ returns: { corp_code, corp_name, stock_code, modify_date }
        │
        ▼
Step 2: GET /api/finance?corp_code={corp_code}&bsns_year={year}&reprt_code=11011
        │
        ▼
Route Handler: finance/route.js
  1. Validates corp_code (1-8 digits), year (4 digits), reprt_code (allowlist)
  2. Zero-pads corp_code to 8 digits
  3. Constructs OpenDart URL via URLSearchParams (prevents parameter injection)
  4. Fetches: https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?...
  5. Checks apiData.status === '000' (success)
  6. Maps non-success status codes to safe Korean error messages
  7. Returns the full OpenDart JSON response
        │
        ▼ returns: { status: '000', list: [ ...financial line items... ] }
        │
        ▼
useFinancialData
  - items = financeData.list || []
  - chartData = extractMetrics(items)  ← see Section 7
  - setCompany(companyData)
  - setChartData(chartData)
  - setLoading(false)
        │
        ▼
page.js renders:
  <CompanyInfo company={company} />
  <FinancialChart chartData={chartData} year={year} />
  <AiAnalysisCard ... />
```

### OpenDart Report Codes (reprt_code)

The `reprt_code` parameter specifies the report period. The current implementation defaults to the annual report:

| Code | Korean Name | English Name |
|------|-------------|--------------|
| `11011` | 사업보고서 | Annual Report (default) |
| `11012` | 반기보고서 | Semi-Annual Report |
| `11013` | 1분기보고서 | Q1 Report |
| `11014` | 3분기보고서 | Q3 Report |

The finance route validates `reprt_code` against an allowlist Set. Any value not in the Set is rejected with a 400 response, preventing HTTP parameter injection into the OpenDart URL.

---

## 6. Data Flow: AI Analysis

This flow is triggered when the user clicks the "AI 분석" (AI Analysis) button, which is only rendered once financial data has been successfully loaded.

```
User clicks "AI 분석" button
        │
        ▼
page.js: handleAiAnalyze()
  - Guards: if (!company) return
  - Calls analyze(company.corp_name, chartData, year)
        │
        ▼
useAiAnalysis.analyze(companyName, chartData, year)
  - Guards: if (!companyName || chartData.length === 0) return
  - setAiLoading(true), setAnalysis('')
        │
        ▼
POST /api/analyze
  Body: { companyName, financeData: chartData, year }
        │
        ▼
Route Handler: analyze/route.js
  1. Input validation:
     - companyName: string, ≤ 100 chars, matches /^[\p{Script=Hangul}...]+$/u
     - financeData: array, 1–10 items, each { name: string(≤50), value: finite number }
     - year: if present, matches /^\d{4}$/
  2. buildAnalysisPrompt() constructs user message:
       회사명: {companyName}
       연도: {year}년
       재무 데이터(JSON): [{name, value}, ...]
  3. Creates AbortController with 55-second timeout
  4. Calls openai.chat.completions.create({
       model: 'gpt-4o',
       messages: [
         { role: 'system', content: SYSTEM_PROMPT },   ← instructions only
         { role: 'user',   content: analysisPrompt },  ← user data only
       ],
       max_tokens: 3000,
       temperature: 0.7,
     }, { signal: ac.signal })
  5. Returns { analysis: aiCompletion.choices[0].message.content }
        │
        ▼
useAiAnalysis
  - setAnalysis(analysisData.analysis)
  - setAiLoading(false)
        │
        ▼
AiAnalysisCard renders the Korean Markdown analysis report
```

### System Prompt Role

The `SYSTEM_PROMPT` constant instructs GPT-4o to act as a Wall Street investment analyst, produce a professional Korean-language analysis report covering revenue/operating profit/net income implications, investment attractiveness, positive signals, and risk factors. It explicitly instructs the model to ignore any instructions that are not related to financial analysis. This instruction lives in the `system` role message; user-supplied data lives only in the `user` role message.

---

## 7. Metric Extraction in Detail

`extractMetrics(financialItems)` in `app/lib/metricDefinitions.js` is the core algorithm for converting raw OpenDart line items into the `chartData` array that feeds the Recharts bar chart.

### METRIC_DEFINITIONS

```javascript
const METRIC_DEFINITIONS = [
  { name: '매출액',   keys: ['Revenue', '매출액'] },
  { name: '영업이익', keys: ['OperatingIncomeLoss', '영업이익', '영업손실'] },
  { name: '당기순이익', keys: ['ProfitLoss', '당기순이익', '당기순손실'] },
];
```

Each `keys` array contains both the XBRL `account_id` identifiers (English) and the Korean `account_nm` display names used as fallback. The three metrics map to:

- **매출액** (Revenue) — Total net sales
- **영업이익** (Operating Income/Loss) — Revenue minus operating expenses
- **당기순이익** (Net Income/Loss) — Bottom-line profit after tax

### KEY_TO_METRIC_INDEX

At module load time, a Map is built from every key in every definition to its index:

```
'Revenue'              → 0
'매출액'               → 0
'OperatingIncomeLoss'  → 1
'영업이익'             → 1
'영업손실'             → 1
'ProfitLoss'           → 2
'당기순이익'           → 2
'당기순손실'           → 2
```

### Single-Pass Extraction

```
financialItems (array of OpenDart line item objects)
  │
  └── for each item:
        id = item.account_id || ''
        nm = item.account_nm || ''
        │
        └── for each [key, idx] in KEY_TO_METRIC_INDEX:
              if id.includes(key) or nm.includes(key):
                if item.fs_div === 'CFS' and cfsMatches[idx] is null:
                  cfsMatches[idx] = item     ← prefer CFS (연결재무제표)
                if anyMatches[idx] is null:
                  anyMatches[idx] = item     ← fallback to first match
  │
  └── for each metric definition (index i):
        selected = cfsMatches[i] ?? anyMatches[i]
        value = Number(selected.thstrm_amount.replace(/,/g, '')) || 0
        return { name: METRIC_DEFINITIONS[i].name, value }
```

**CFS vs. OFS:** OpenDart returns both Consolidated Financial Statements (`fs_div: 'CFS'`, 연결재무제표) and Separate/Individual Financial Statements (`fs_div: 'OFS'`, 별도재무제표) for most listed companies. CFS consolidates subsidiary financials and is the standard basis for investor analysis. The algorithm always prefers CFS when available for a given metric.

**Amount parsing:** OpenDart stores monetary amounts as comma-formatted strings (e.g., `"1,234,567"`). The `thstrm_amount` field (the current period's amount) is parsed by stripping commas and calling `Number()`. Units are typically Korean Won in millions (백만원).

### Output

The function returns an array of three objects in the order defined by `METRIC_DEFINITIONS`:

```javascript
[
  { name: '매출액',    value: 302231000 },
  { name: '영업이익',  value: 6566900 },
  { name: '당기순이익', value: 15487200 },
]
```

This array is passed directly to `FinancialChart` as `chartData`. Recharts renders a bar chart with Korean metric names on the x-axis and values on the y-axis.

---

## 8. Security Architecture

Security measures are applied at multiple layers. This section summarizes them holistically.

### HTTP Layer (next.config.mjs)

Global security headers prevent clickjacking (`X-Frame-Options: DENY`), MIME sniffing (`X-Content-Type-Options: nosniff`), protocol downgrade attacks (HSTS), and unnecessary hardware API access (Permissions-Policy). The Content Security Policy restricts resource loading to the same origin, with `unsafe-inline` required for Next.js runtime scripts. See ADR-006 for the full header table.

### API Input Validation

Each route handler validates all inputs before performing any downstream operation:

- `company/route.js` — Validates that `q` is present and non-empty.
- `finance/route.js` — Validates `corp_code` format, `bsns_year` format, and `reprt_code` against an allowlist Set. Uses `URLSearchParams` to construct the OpenDart URL, preventing parameter injection.
- `analyze/route.js` — Validates company name character set, length, data array structure, and year format before building any prompt.

### API Key Isolation

Both `OPENDART_API_KEY` and `OPENAI_API_KEY` are environment variables accessed only in server-side route handlers. They are never imported into client components or hooks, and Next.js does not include server-only environment variables in the browser bundle.

The finance route is careful not to log the full error object, which could contain the constructed OpenDart URL (and therefore the API key) in a stack trace.

### OpenDart Error Masking

The finance route maps OpenDart's numeric status codes to safe, user-facing Korean messages. Raw API error messages — which may reveal key status, rate limit details, or internal service state — are never forwarded to the browser.

### Prompt Injection Mitigation

User-supplied data is placed in the `user` role message only. System instructions are in the `system` role. All fields are validated before prompt construction. See ADR-004 for the full defense strategy.

---

## 9. Testing Architecture

The test suite uses Vitest 4 with `environment: 'node'` for all API and library tests.

### Singleton Isolation Pattern

Because `cachePromise` is a module-level variable in `company/route.js`, each test that exercises the company route must ensure it starts with `cachePromise = null`. The pattern used throughout `company.test.js`:

```javascript
beforeEach(async () => {
  vi.resetModules();                         // clears module registry
  // re-import the route module to get a fresh cachePromise = null
  ({ GET } = await import('../../../app/api/company/route.js'));
});
```

This is the same isolation technique described in ADR-008.

### Mock Strategy

- `fs/promises` is mocked to return controlled XML strings, avoiding real file reads.
- `node-fetch` / global `fetch` is mocked to return controlled OpenDart and OpenAI responses.
- OpenAI SDK is mocked to avoid real API calls and costs during testing.

### Coverage Scope

`vitest.config.mjs` restricts coverage collection to `app/api/**` and `app/lib/**`. React component coverage is not currently measured and would require a separate jsdom-environment configuration.

---

## 10. Key Data Structures and Formats

### Company Entry (from corp.xml, post-formatting)

```javascript
{
  corp_code:  "00126380",   // 8-digit string, zero-padded
  corp_name:  "삼성전자",
  stock_code: "005930",     // 6-digit string, zero-padded; empty string if unlisted
  modify_date: "20240102",  // YYYYMMDD
}
```

### Suggest List Entry (sortedSuggestList)

```javascript
{
  corp_name:       "삼성전자",
  corp_name_lower: "삼성전자",  // pre-lowercased for binary search comparison
  stock_code:      "005930",
}
```

### OpenDart Financial Line Item

```javascript
{
  rcept_no:       "20240401004781",
  reprt_code:     "11011",
  bsns_year:      "2023",
  corp_code:      "00126380",
  sj_div:         "IS",              // IS = Income Statement, BS = Balance Sheet
  sj_nm:          "손익계산서",
  account_id:     "Revenue",
  account_nm:     "매출액",
  account_detail: "-",
  thstrm_nm:      "제 55 기",
  thstrm_amount:  "258,935,500",    // current period, comma-formatted string
  frmtrm_nm:      "제 54 기",
  frmtrm_amount:  "302,231,360",    // prior period
  bfefrmtrm_nm:   "제 53 기",
  bfefrmtrm_amount: "279,604,799", // two periods ago
  ord:            "1",
  currency:       "KRW",
  fs_div:         "CFS",            // CFS or OFS
  fs_nm:          "연결재무제표",
}
```

### chartData Array (input to FinancialChart and AI analysis)

```javascript
[
  { name: "매출액",    value: 258935500 },
  { name: "영업이익",  value: 6566900  },
  { name: "당기순이익", value: 15487200 },
]
```

Values are integers (or floats) in the currency unit returned by OpenDart (typically millions of Korean Won). No unit conversion is performed before charting or analysis.

### AI Analysis POST Body

```javascript
{
  companyName: "삼성전자",        // string, ≤ 100 chars, Korean/Latin/digits/punctuation only
  financeData: [                   // array, 1–10 items
    { name: "매출액",    value: 258935500 },
    { name: "영업이익",  value: 6566900  },
    { name: "당기순이익", value: 15487200 },
  ],
  year: "2023",                   // optional, 4-digit string
}
```
