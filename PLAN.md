# Financial Data Visualization Service Plan

## Summary of Changes
- Building a Next.js (App Router) web application.
- Integrating OpenDart API for fetching company financial statements.
- Integrating OpenAI API to analyze and summarize the financial data into easy-to-understand text.
- Creating a robust UI using vanilla CSS and Recharts to visualize the data.
- Creating server-side API routes to secure API keys and parse data without exposing it to the client.

## Implementation Checklist
- [x] Plan First: Proposed technical plan and approved.
- [x] Initialize Next.js project
- [x] Set up environment variables (.env.local) securely
- [x] Set up project directory and CSS styling (Vanilla CSS, no Tailwind per choice)
- [x] Parse `corp.xml` on the server and create company search API `/api/company`
- [x] Integrate OpenDart API inside `/api/finance` and parse major accounts
- [x] Integrate OpenAI API inside `/api/analyze` for financial summary
- [x] Build Frontend UI: Search Bar, Dashboard, and Loading States
- [x] Implement Data Visualization using Recharts
- [x] Polish styling for a premium look
- [x] Verify Vercel deployment constraints
- [x] Create README.md

## Potential Side Effects
- Moving all data fetching and parsing to server-side routes will abstract complexities from the frontend but will increase initial server response time slightly when generating analysis via OpenAI.
- Loading the 90MB `corp.xml` file into memory (or using a streaming parser) could use significant memory on the server side unless optimized carefully.

_(Do not expose API keys to clients, manage exclusively in `.env.local`)_
