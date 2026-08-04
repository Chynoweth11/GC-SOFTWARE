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
npm run dev                 # http://localhost:3000
```

That is the whole setup. `npm install` generates the Prisma client, and the
first `npm run dev` creates `prisma/dev.db`, applies the migrations and loads all
three workbooks. Later runs find the database and start immediately. No `.env` is
needed — both the app and the Prisma CLI default to `file:./prisma/dev.db`; see
`.env.example` to point elsewhere.

To start over from the workbooks, delete the database and run dev again:

```bash
rm prisma/dev.db && npm run dev   # or: npm run db:reset
```

Sign in as `owner@constructx.com` / `constructx`. Other demo accounts —
`o.reed@constructx.com` (project manager), `estimator@constructx.com`,
`accounting@constructx.com`, `viewer@constructx.com` — use the same password and
show how the permission model changes what is visible.

```bash
npm test          # 142 tests — financial calculations, PDF output, permissions
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

**One definition per report.** The screen, the Excel workbook and the PDF all
render from the same sheet spec, and all four surfaces — including the report
card on the index — read one capability map to decide who may open it. Adding a
column adds it everywhere; there is nowhere else to add it.

**One database.** `prisma/schema.prisma` — 30+ models covering companies, users,
clients, vendors, bids, estimates, projects, budgets and their revisions,
commitments, change orders, cost transactions, owner and subcontractor billing,
forecast periods, cash-flow periods, quantities, snapshots and audit records.
A figure is stored once; everything else derives.

**A figure is visible to a role or it is not.** Roles map to capabilities, and
the same capability governs the page, the workbook and the PDF, so nothing can be
read on screen that would be refused as an export. The dashboard can be reordered
per user, but preference only arranges what a role is already permitted to see.

**Projects are portable.** `/api/backup/project/[id]` writes the whole job as one
JSON file — budgets, commitments, costs, change orders, billings, forecasts,
quantities. It carries stored values only; a restore recomputes every derived
figure from the engine, and always creates a new project rather than overwriting
a live one.

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
| Reports | 13 reports including the WIP schedule, each exportable to Excel and PDF, with saved filter views |
| Exports | Excel workbooks and PDFs for every report, project, estimate and AIA pay application |
| Admin | Company defaults, users and roles, cost codes, trades, CSI divisions, vendors, accounting import, project backup and restore |

## Scope

Deliberately **not** a document-management platform. Drawings, specifications,
RFIs, submittals, daily reports, safety documentation, punch lists and photos
belong in Procore or equivalent. Attachments here are limited to financial
records — invoices, quotes, purchase orders and billing backup.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Prisma · SQLite (Postgres-ready)
· Tailwind v4 · Vitest · ExcelJS. Charts are hand-built SVG so every axis, tooltip
and colour matches the design system and the client bundle stays small.
