# Getting Started with EasyFinance AI

EasyFinance AI is a Next.js application that lets you look up Korean publicly listed companies, visualize their key financial metrics (revenue, operating profit, net income) as a bar chart, and request a GPT-4o-powered investment analysis report — all in Korean.

This guide walks you through everything you need to go from a fresh clone to a running local instance, and covers how to use the application once it is running.

---

## Prerequisites

Before you begin, ensure the following are available on your machine:

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | 18.x | Required for native fetch and ESM support |
| npm | 9.x | Comes with Node.js 18; yarn or pnpm also work |
| OpenDart API key | — | Free registration; see below |
| OpenAI API key | — | Requires an OpenAI account with API access |

### Obtaining an OpenDart API Key

OpenDart (dart.fss.or.kr) is the Korean Financial Supervisory Service's public disclosure platform. API access is free.

1. Visit [https://dart.fss.or.kr](https://dart.fss.or.kr).
2. Create an account (회원가입) using a Korean mobile number or email address.
3. After logging in, navigate to "OpenDART" in the top navigation, then "API Key" (인증키).
4. Register a new key. The key is issued immediately.

### Obtaining an OpenAI API Key

1. Visit [https://platform.openai.com](https://platform.openai.com) and sign in or create an account.
2. Navigate to API Keys in the dashboard and create a new secret key.
3. Ensure your account has access to `gpt-4o` (either through a paid plan or approved access).

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd financial-statements_v2
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs all production and development dependencies declared in `package.json`, including Next.js 16, React 19, Recharts, the OpenAI SDK, fast-xml-parser, and Vitest.

### Step 3: Configure Environment Variables

Create a file named `.env.local` in the project root (the same directory as `package.json`):

```bash
touch .env.local
```

Open `.env.local` and add the following two lines, replacing the placeholder values with your actual keys:

```
OPENDART_API_KEY=your_opendart_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Important notes about `.env.local`:
- This file is listed in `.gitignore` by default in Next.js projects and must never be committed to version control.
- Both keys are used exclusively in server-side API route handlers. They are not accessible to browser code.
- The application will start without these keys, but company financial data retrieval and AI analysis will fail at runtime.

### Step 4: Verify the Company Data File

The application requires `corp.xml` — OpenDart's full registry of registered Korean companies — to be present at the project root (not inside `public/`). Check whether it exists:

```bash
ls -lh corp.xml
```

If the file is already present (approximately 880 KB), you can skip to Step 5.

If the file is missing, download it from OpenDart:

1. Log in to [https://dart.fss.or.kr](https://dart.fss.or.kr).
2. Navigate to OpenDART > 고유번호 (Unique Number) > 전체 회사 고유번호 다운로드.
3. Download the ZIP file, extract it, and place `CORPCODE.xml` in the project root, renaming it to `corp.xml`.

The file contains approximately 3,864 company entries and is parsed once at server startup. It does not need to be inside `public/` — the route handler reads it from the filesystem using Node.js `fs/promises`.

---

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts Next.js in development mode with hot module replacement. Open your browser and navigate to:

```
http://localhost:3000
```

On the first request to the company search API, the server will parse `corp.xml` and build the in-memory cache. This takes a moment on a cold start but is instant for all subsequent requests in the same process.

### Production Mode

To build and run the application as it would run in a production environment:

```bash
npm run build
npm start
```

`npm run build` compiles the application, runs the React Compiler optimizations, and produces an optimized `.next` output directory. `npm start` serves the compiled application. The default port is 3000.

---

## Running the Test Suite

The project uses Vitest for unit testing. There are 77 tests across four test files covering all API route handlers and the metric extraction library.

### Run All Tests Once

```bash
npm test
```

This executes `vitest run`, which runs all tests in the `__tests__/` directory and exits.

### Run Tests in Watch Mode

```bash
npm run test:watch
```

Vitest will watch for file changes and re-run affected tests automatically. Useful during active development.

### Generate a Coverage Report

```bash
npm run test:coverage
```

Coverage is collected for `app/api/**` and `app/lib/**` using V8's built-in instrumentation. The report is printed to the terminal and a full HTML report is written to `coverage/`. Open `coverage/index.html` in a browser to explore coverage by file and line.

---

## Using the Application

Once the development server is running, here is how to use the application:

### 1. Search for a Company

Type a Korean company name into the search field. As you type, an autocomplete dropdown appears with up to 10 suggestions drawn from the OpenDart company registry. The autocomplete performs prefix matching — it finds companies whose names start with the characters you have typed.

Examples to try:
- `삼성전자` — Samsung Electronics
- `현대자동차` — Hyundai Motor
- `카카오` — Kakao
- `SK하이닉스` — SK Hynix
- `LG화학` — LG Chem

Click a suggestion to fill the search field, or type the full company name and proceed without selecting a suggestion.

**Note:** The search prioritizes exchange-listed companies (those with a stock code). If you search for an unlisted entity, the lookup will fall back to the full company registry.

### 2. Select a Year

Use the year dropdown (default: 2023) to select the fiscal year for which you want to retrieve financial data. Available years depend on what OpenDart has indexed for the selected company.

The application currently retrieves annual report data (`사업보고서`). Data for very recent years may not yet be available if the company has not filed its annual report.

### 3. Retrieve Financial Data

Click the search button (or press Enter). The application will:

1. Resolve the company name to an OpenDart `corp_code`.
2. Fetch the financial statements for the selected year from OpenDart's API.
3. Extract the three key metrics from the response.
4. Display the company information and render a bar chart.

If the company name is not found, or if OpenDart has no data for the selected year, an error message will be displayed in Korean.

### 4. Read the Financial Chart

The bar chart displays three metrics side by side:

| Korean Term | English Equivalent | Description |
|---|---|---|
| 매출액 | Revenue | Total net sales for the period |
| 영업이익 | Operating Income | Revenue minus cost of goods sold and operating expenses |
| 당기순이익 | Net Income | Bottom-line profit after interest, taxes, and other items |

Values are in the unit returned by OpenDart, typically millions of Korean Won (백만원). When both consolidated (연결재무제표, CFS) and separate (별도재무제표, OFS) financial statements are available, the consolidated figures are displayed.

### 5. Request an AI Analysis

After the chart is displayed, click the "AI 분석" button. This sends the company name, year, and the three extracted metric values to GPT-4o via the server-side `/api/analyze` endpoint.

The AI analysis will:
- Summarize what the revenue, operating profit, and net income figures indicate about the company's financial health.
- Assess investment attractiveness and highlight positive signals.
- Identify risk factors based on the data.
- Present findings in a professional, readable Korean Markdown report.

The analysis takes up to 55 seconds. A loading state is shown while the model generates the response. Once complete, the report appears below the chart.

---

## Common Issues

**"Company not found" error**
The exact company name must match an entry in `corp.xml`. Use the autocomplete dropdown to confirm the correct name. The search is case-insensitive for autocomplete suggestions but case-sensitive for exact lookups.

**"해당 데이터가 없습니다" (No data available)**
OpenDart may not have filed data for the selected company and year combination. Try an earlier year, or verify that the company files reports with OpenDart.

**AI analysis times out or returns an error**
Ensure `OPENAI_API_KEY` is set correctly in `.env.local` and that your account has access to `gpt-4o`. The analysis endpoint has a 55-second timeout; if OpenAI is under heavy load, the request may fail.

**Autocomplete shows no suggestions**
Verify that `corp.xml` is present at the project root and is approximately 880 KB. A missing or empty file causes the cache to build with zero entries.

---

## Project Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Start development server with hot reload |
| `build` | `next build` | Compile and optimize for production |
| `start` | `next start` | Serve the production build |
| `lint` | `eslint` | Run ESLint on the project |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Run tests in interactive watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests and generate coverage report |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `OPENDART_API_KEY` | Yes | OpenDart API authentication key. Used in `app/api/finance/route.js` to call the OpenDart financial statements API. |
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o. Used in `app/api/analyze/route.js`. |

Both variables must be defined in `.env.local` for local development. In a deployment environment (e.g., Vercel), set them as environment variables in the platform dashboard.
