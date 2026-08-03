# ConstructX

Financial operating system for a general contractor — estimating, bidding, budgets,
job cost, forecasting, billing and company-wide financial control.

Built from three Excel workbooks (`ConstructX_Project_Controls_WorkbookXX.xlsx`,
`ConstructX_Master_Company_TrackingX.xlsx`, `ConstructX_Takeoff_Bid_Template2.xlsx`),
which remain the functional specification. Every formula in them is reproduced,
tested against the workbooks' own outputs, and documented in
[`docs/FORMULA-MAP.md`](docs/FORMULA-MAP.md).

## Running it

```bash
npm install
npx prisma migrate dev      # creates prisma/dev.db
npx tsx prisma/seed.ts      # loads all three workbooks
npm run dev                 # http://localhost:3000
```

Sign in as `owner@constructx.com` / `constructx`. Other demo accounts —
`o.reed@constructx.com` (project manager), `estimator@constructx.com`,
`accounting@constructx.com`, `viewer@constructx.com` — use the same password and
show how the permission model changes what is visible.

```bash
npm test          # 109 financial calculation tests
npm run build     # production build
```

## How it is put together

**One calculation engine.** `src/lib/finance/` holds every financial formula as
pure, tested functions. Nothing else in the codebase computes a financial figure.
The company dashboard, the project pages, the reports and the Excel exports all
read the same engine output, which is what makes them impossible to disagree.

```
src/lib/finance/
  core.ts          safeDiv, rounding, Excel-compatible primitives
  cost.ts          cost control: budget → committed → actual → earned → forecast
  forecast.ts      earned value, CPI/SPI, three EAC methods
  billing.ts       AIA G702/G703, percentage of completion, revenue recognition
  commitments.ts   subcontracts, POs, retention, payment status, buyout
  changeOrders.ts  contract position, margin, pending exposure weighting
  cashflow.ts      the monthly S-curve and three scenarios
  estimate.ts      takeoff pricing, QA flags, the compounded markup chain
  leveling.ts      bid leveling with automatic exception detection
  project.ts       assembles one project's complete position
  company.ts       portfolio rollups, WIP, pipeline, revenue forecast
  alerts.ts        every alert, recomputed live — never stored, never stale
```

**One database.** `prisma/schema.prisma` — 30+ models covering companies, users,
clients, vendors, bids, estimates, projects, budgets and their revisions,
commitments, change orders, cost transactions, owner and subcontractor billing,
forecast periods, cash-flow periods, quantities, snapshots and audit records.
A figure is stored once; everything else derives.

**Financial history is never overwritten.** Budget changes are revision rows,
not edits. Forecast periods lock with a snapshot. Cost transactions soft-delete.
Cost codes and trades retire rather than delete. Every mutation writes an audit
record naming the field, the old value and the new.

## What it does

| Module | |
|---|---|
| Company dashboard | Portfolio position, cash flow, revenue and profit forecast, backlog, billing position, live alerts, filterable by status, manager, client, type, location and financial health |
| Projects | 13 tabs per project: summary, budget, job cost, commitments, change orders, owner billing, subcontractors, forecast, % complete, cash flow, buyout, quantities, settings |
| Estimating | Takeoff with QA flags, general conditions, sub-quote leveling, the bid build-up step by step, and one-click conversion to a live project |
| Bid pipeline | Opportunities with the follow-up engine, win rate by count and by value |
| Reports | 13 reports including the WIP schedule, all exportable to Excel |
| Admin | Company defaults, users and roles, cost codes, trades, CSI divisions, vendors, accounting import |

## Scope

Deliberately **not** a document-management platform. Drawings, specifications,
RFIs, submittals, daily reports, safety documentation, punch lists and photos
belong in Procore or equivalent. Attachments here are limited to financial
records — invoices, quotes, purchase orders and billing backup.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Prisma · SQLite (Postgres-ready)
· Tailwind v4 · Vitest · ExcelJS. Charts are hand-built SVG so every axis, tooltip
and colour matches the design system and the client bundle stays small.
