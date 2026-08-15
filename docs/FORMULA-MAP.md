# Workbook → ConstructX formula map

Every financial formula in the three source workbooks, and where it now lives.

The rule throughout: **a figure is computed in exactly one place.** Where the
workbooks repeated a calculation across tabs, ConstructX computes it once in
`src/lib/finance/` and every screen, report and export reads that one result.
That is why the dashboard, the project page and the Excel export cannot disagree.

Source workbooks:

| Key | Workbook |
|---|---|
| **PC** | `ConstructX_Project_Controls_WorkbookXX.xlsx` |
| **MC** | `ConstructX_Master_Company_TrackingX.xlsx` |
| **TB** | `ConstructX_Takeoff_Bid_Template2.xlsx` |

Verification: `src/lib/**/*.test.ts`, 434 tests asserting these formulas
reproduce the workbooks' own cached values, and that the engines added since
hold the identities the workbooks never checked. Beyond them, `verify:figures`
re-checks 761 identities against the live database, `verify:exports` writes and
reparses every workbook and PDF, `verify:backup` round trips every project
through export and restore, `verify:pages` walks every route, and `verify:ui`
drives 94 interactive checks through a real browser. All of it runs on every
push through `.github/workflows/verify.yml`, in three parallel jobs, so a broken
formula is reported in minutes rather than whenever somebody next thinks to
look.

None of the browser checks sleep and hope. Each one waits for the sentence it is
looking for and gives up only when it is really not coming, so a slow moment on
a busy machine is not reported as a broken feature.

---

## 1. Cost control: PC ▸ Financials

Engine: [`src/lib/finance/cost.ts`](../src/lib/finance/cost.ts) · Tests: `cost.test.ts`
Database: `BudgetLine`, `BudgetRevision`, `Commitment`, `CommitmentLine`, `CostTransaction`, `ForecastLine`
Appears: project Budget tab, Job cost tab, company dashboard, budget-vs-actual report, project Excel export

| Cell | Excel formula | Software field | How it is derived now |
|---|---|---|---|
| `G` Current Budget | `=IF($A7="",0,$E7+$F7)` | `CostLine.currentBudget` | `originalBudget + Σ BudgetRevision.amount`: revisions are rows, never an overwrite |
| `H` Committed | manual entry | `CostLine.committed` | Σ `CommitmentLine.amount` + approved commitment changes, pro-rated across the commitment's codes |
| `I` Cost to Date | manual entry | `CostLine.costToDate` | Σ `CostTransaction` where `type = ACTUAL` |
| `J` Accruals | manual entry | `CostLine.accruals` | Σ `CostTransaction` where `type = ACCRUAL` |
| `K` Total Cost to Date | `=IF($A7="",0,$I7+$J7)` | `CostLine.totalCostToDate` | `costToDate + accruals` |
| `L` % Spent | `=IFERROR($K7/$G7,0)` | `CostLine.pctSpent` | `safeDiv(totalCostToDate, currentBudget)` |
| `M` % Complete | manual entry | `CostLine.effectivePctComplete` | From the open `ForecastLine`; **falls back to % spent** when not entered (the sheet implicitly treated a blank as 0%) |
| `N` Earned Value | `=IF($A7="",0,$G7*$M7)` | `CostLine.earnedValue` | `currentBudget × effectivePctComplete` |
| `O` Cost Variance | `=IF($A7="",0,$N7-$K7)` | `CostLine.costVariance` | `earnedValue − totalCostToDate` |
| `P` Remaining Budget | `=IF($A7="",0,$G7-$K7)` | `CostLine.remainingBudget` | `currentBudget − totalCostToDate` |
| `Q` Forecast to Complete | `=IF($M7>=1,0,IFERROR($G7*(1-$M7),$P7))` | `CostLine.forecastToComplete` | Same formula, **plus** an `etcOverride` so a manager can forecast remaining cost directly |
| `R` Forecast at Completion | `=IF($A7="",0,$K7+$Q7)` | `CostLine.forecastAtCompletion` | `totalCostToDate + forecastToComplete` |
| `S` FAC Variance | `=IF($A7="",0,$G7-$R7)` | `CostLine.facVariance` | `currentBudget − forecastAtCompletion` |
| `V6:AA14` Category summary | `=SUMIFS($G$7:$G$126,$C$7:$C$126,$V6)` | `rollupByCategory()` | Grouped in memory; categories with no activity are dropped rather than shown as zeros |

**Improvements over the sheet.** `etcOverride` lets a manager state remaining cost
directly instead of being forced through budget × remaining %. Grouping is generic
(`rollupBy`), so the same rollup drives category, trade, division and vendor views
rather than three separate SUMIFS blocks.

---

## 2. Earned value and estimate at completion: PC ▸ Progress & Forecast

Engine: [`src/lib/finance/forecast.ts`](../src/lib/finance/forecast.ts) · Tests: `forecast.test.ts`
Appears: project Summary, Forecast tab, EAC report

| Cell | Excel formula | Software field | Notes |
|---|---|---|---|
| `C5` Budget at Completion | `=Financials!$W$14` | `EarnedValue.budgetAtCompletion` | Σ current budget |
| `C6` Planned Value | `=$C$5*INDEX($D$23:$D$46,MATCH(EOMONTH(Setup!$C$21,0),...))` | `EarnedValue.plannedValue` | `BAC × planned cumulative %` at the data date, read off `CashFlowPeriod` |
| `C7` Earned Value | `=SUM(Financials!$N$7:$N$126)` | `EarnedValue.earnedValue` | Σ line earned value |
| `C8` Actual Cost | `=Financials!$X$14` | `EarnedValue.actualCost` | Σ total cost to date |
| `C9` CPI | `=IFERROR($C$7/$C$8,0)` | `costPerformanceIndex` | Verified = `0.983057679333171` for job 26-001 |
| `C10` SPI | `=IFERROR($C$7/$C$6,0)` | `schedulePerformanceIndex` | Verified = `1.26706395510363` |
| `F5` EAC method 1 | `=Financials!$Z$14` | `EacResult.bottomUp` | Σ line forecast at completion |
| `F6` EAC method 2 | `=IFERROR($C$5/$C$9,$C$5)` | `EacResult.cpiBased` | Degrades to BAC when CPI is 0 |
| `F7` EAC method 3 | `=$C$8+$C$5-$C$7` | `EacResult.budgetRate` | `AC + BAC − EV` |
| `F9` Selected EAC | `=IF($F$8="1",$F$5,IF($F$8="2",$F$6,$F$7))` | `EacResult.selected` | Method stored per project (`Project.eacMethod`) rather than a cell |
| `I5` Estimate to Complete | `=$F$9-$C$8` | `estimateToComplete` | Clamped at 0: never negative |
| `I6` Variance at Completion | `=$C$5-$F$9` | `varianceAtCompletion` | |
| `I7` Forecast profit | `=Setup!$C$26-$F$9` | `ProjectFinancials.forecastProfit` | Uses `forecastContract`, so pending change orders can be included at management's chosen weighting |
| `I8` Forecast margin | `=IFERROR((Setup!$C$26-$F$9)/Setup!$C$26,0)` | `forecastMargin` | |

**All three EAC methods are shown side by side** on the project summary and the
forecast tab, so the selection can be justified rather than assumed.

---

## 3. Contract and change orders: PC ▸ Setup, Change Orders

Engine: [`src/lib/finance/documents.ts`](../src/lib/finance/documents.ts) and
[`changeOrders.ts`](../src/lib/finance/changeOrders.ts) · Tests: `documents.test.ts`, `workflows.test.ts`
Database: `ChangeOrder`, `ChangeOrderLine`, `DocumentSignature`, `DocumentAttachment`, `BudgetRevision`
Appears: project Change orders tab and each document's own page, project summary, budget, forecast, dashboard, change order report, project export

Change orders, the prime contract, amendments and addendums are one model,
because they are one object: something is priced, reviewed, sent out, signed by
every party, and only then allowed to move money.

### The rule everything else rests on

**A document reaches the project's official figures when, and only when, it
carries a certified approval.** Not because its status says approved, not
because every party has signed, not because somebody typed an amount in.
`isOfficial(document)` is `document.approvedAt !== null`, it is the only place
the question is answered, and every contract value, budget revision, forecast,
dashboard tile and report reads through it.

Setting it is one guarded action: it needs the `approve:contract_documents`
capability, the document must be fully signed with every recorded party signed
off, and the approver has to agree in words to a certification that is stored
verbatim on the record with their name and the moment. `workflows.test.ts`
asserts the trap this closes: a document whose *status* is APPROVED but which
carries no approval counts for nothing.

Withdrawing it needs `unapprove:contract_documents`, which only an owner or an
administrator holds, plus a written reason. Both movements reverse the budget
revisions, and both are in the permanent history.

| Cell | Excel formula | Software field | Notes |
|---|---|---|---|
| `Setup C24` Original Contract | manual entry | `ContractPosition.originalContract` | The sum of **approved** documents of kind CONTRACT where the project has any; otherwise `Project.originalContractSum`. The page says which |
| `Setup C25` Approved COs | `=SUMIFS('Change Orders'!$H:$H,$G:$G,"Approved")` | `approvedChangeOrders` | Σ `ownerAmount` where `approvedAt` is set, over the kinds that move the owner contract |
| `Setup C26` Current Contract | `=C24+C25` | `currentContract` | |
| `Setup C27` Pending COs | `=SUMIFS(...,"Pending")+SUMIFS(...,"Submitted")` | `pendingChangeOrders` | Everything entered, alive and not yet approved |
| `Setup C28` Potential Contract | `=C26+C27` | `potentialContract` | |
|: | *(not in the workbook)* | `weightedPendingChangeOrders` | Pending × probability |
|: | *(not in the workbook)* | `forecastContract` | `current + weighted pending × Project.pendingCoInclusionPct` |
| `CO J` Margin | `=IF($A6="",0,$H6-$I6)` | `DocumentDerived.margin` | Amount less cost |
| `CO K` Margin % | `=IFERROR($J6/$H6,0)` | `marginPct` | |
| `CO N` Days Pending | `=IF($G6="Approved",$M6-$F6,Setup!$C$21-$F6)` | `daysPending` | Approved measures to the approval; anything else ages against the data date |

### The four totals

Shown side by side on the tab, because each answers a different question and
only one of them is money.

| Total | What it is |
|---|---|
| Entered | Every document, whatever its state |
| Approved and signed | Certified, and therefore in the contract value |
| Pending approval | Entered and alive, not yet certified. Exposure, not money |
| Rejected or cancelled | Rejected, cancelled, voided or superseded |

`documents.test.ts` asserts that the three add back to entered exactly, and
that each document falls in precisely one of them.

### Pricing a document

`DocumentDerived` prices its lines through **`deriveEstimateItem`**, the same
function the takeoff uses, and totals them through **`buildBidBuildUp`**, the
same markup chain in the same order. A change order is a small estimate, and
two pricing engines would have parted company by the end of the first job.

| Line field | Derivation |
|---|---|
| Quantity | From the measure and the dimensions, `deriveNetQuantity` |
| Gross quantity | Net × (1 + waste) |
| Labor | Gross × hours per unit × rate × (1 + labor burden), unless the rate came from the classification library and already carries its own |
| Material | Gross × unit cost × (1 + sales tax) |
| Equipment | Gross × unit cost, **plus** gross × machine hours per unit × the hourly rate of the machine named on the line. A line can therefore carry a hired-in lump and a metered machine at once |
| Subcontract | Gross × unit cost |
| Other | Gross × unit cost. The fifth bucket, for a permit or an allowance: a takeoff sends these to its general conditions sheet and a change order has no such sheet |
| Line total | The five added |

Both named rates come from libraries rather than from the line: a labor class
resolves through `laborRateTable` and a machine through `equipmentRateTable`.
The two maps are loaded once and handed to the engine, and **every caller hands
it the same two** - the change orders tab, the document breakdown and the
project bundle behind the contract value, the budget, the forecast and the
reports. `verify:figures` compares the project's price for each document against
its own tab's price, document by document, because a caller pricing against an
empty map would quietly drop the labor and the plant from a document that still
read correctly on its own page.

Then contingency, overhead, profit, general liability, bond and excise tax
compound in the bid summary's order, and the result rounds. `costAmount` is the
**cost subtotal** and `ownerAmount` is the **rounded total**, so the margin
follows from the pricing and cannot be typed in inconsistently.

A document may instead be recorded as a lump sum (`priceFromLines` false), which
is how the source workbook carried every one of its change orders and how a
document taken off paper is entered. The entered amounts are then read directly
and the page says so on its face. Lines can still be added to allocate the cost
to budget lines.

### Where an approved document goes

`syncBudgetForDocument` posts one `BudgetRevision` per cost code from the
**live priced lines**, so the budget cannot be raised by an amount the document
does not display. Withdrawing the approval deletes them, and both the posting
and the reversal are recorded. Everything else follows from the contract
position and the budget: forecast, revenue, billing, schedule of values,
margin, dashboard and reports.

### Status

Eleven values describing where a document is on the way to signature, with
`syncSignatureStatus` moving it between sent, partially signed and fully signed
as parties sign. None of them, on their own, moves any money.

### Time and materials, and the double count it invites

A time and materials ticket is the same kind of document as a change order,
priced through the same engine: `TIME_AND_MATERIALS`, signed on the day for
hours and machines that were actually on site. What makes it different is where
it ends up. A ticket is billed either on its own, or through a change order that
gathers several tickets and presents them as one figure to the owner. Both
counting would bill the same signed work twice.

`rollsUpToId` names the change order that carries a ticket, and everything else
follows from it:

| Figure | Rule |
|---|---|
| `isRolledUp` | The ticket names a parent |
| `countsTowardContract` | A revenue document that is **not** rolled up, and is not the prime contract itself |
| Contract value | Sums `countsTowardContract` only, so a rolled-up ticket adds nothing even when it is approved and signed |
| `timeAndMaterialsSummary` | Splits the tickets into billed on their own and carried elsewhere, and reports the labor and machine hours standing behind them |

A ticket keeps its own approval, its own signatures and its own priced
breakdown either way. Rolling it up changes what it contributes, not whether it
happened. Where a ticket bills is locked once it is approved, on the same
principle as its pricing: withdraw the approval, with a reason, to move it.

A ticket nobody has signed for is flagged rather than blocked. It is worth what
somebody put their name to on the day, and the number to chase is on the tab.

---

## 4. Owner billing: PC ▸ Owner Billings (AIA G702/G703)

Engine: [`src/lib/finance/billing.ts`](../src/lib/finance/billing.ts) · Tests: `billing.test.ts`
Database: `SovLine`, `OwnerBilling`, `OwnerBillingLine`
Appears: project Billing tab, billing-position report, G702 Excel export

| Cell | Excel formula | Software field | Notes |
|---|---|---|---|
| `D` Original Contract | `=Setup!$C$24` | `G702.originalContract` | |
| `E` Net Change by COs | `=Setup!$C$25` | `netChangeByChangeOrders` | |
| `F` Contract Sum to Date | `=$D6+$E6` | `contractSumToDate` | |
| `G` Total Completed & Stored | manual entry | `totalCompletedAndStored` | Now summed from `OwnerBillingLine` per SOV line, so the G703 continuation sheet is real |
| `H` % Complete | `=IFERROR($G6/$F6,0)` | `G702.pctComplete` | |
| `J` Retainage | `=$G6*$I6` | `retainage` | |
| `K` Earned Less Retainage | `=$G6-$J6` | `totalEarnedLessRetainage` | |
| `L` Less Previous Certificates | `=INDEX($K$6:$K$41,MATCH($A6-1,$A$6:$A$41,0))` | `lessPreviousCertificates` | **Recomputed from the full application history** rather than reading the prior row, a corrected back-application now flows forward automatically |
| `M` Current Payment Due | `=$K6-$L6` | `currentPaymentDue` | |
| `N` Balance to Finish | `=$F6-$K6` | `balanceToFinishIncludingRetainage` | |
| `R` AR Outstanding | `=$M6-$Q6` | `arOutstanding` | |
| `S` Days Outstanding | `=IF($P6="",Setup!$C$21-$C6,$P6-$C6)` | `daysOutstanding` | |
| `Roll-Up R6` Billed to Date | `=MAX('Owner Billings'!$G$6:$G$41)` | `BillingPosition.totalCompletedAndStored` | A max, not a sum, each application restates the cumulative figure |

**Validation added:** an application cannot bill a line past its scheduled value,
and the SOV total is checked against the contract sum with a warning when they drift.

---

## 5. Percentage of completion

Engine: `computePercentComplete()` / `computeRevenuePosition()` in `billing.ts` · Tests: `billing.test.ts`
Appears: project % complete tab (all seven methods compared side by side)

| Method | Formula | Source data |
|---|---|---|
| Cost to cost *(default)* | `cost incurred ÷ forecast final cost` | `CostTransaction`, EAC |
| Quantity | `earned hours ÷ budget hours` | `QuantityItem`, `QuantityEntry` |
| Subcontractor progress | value-weighted Σ `contract × % complete` | `Commitment.pctComplete` |
| Schedule | elapsed ÷ total duration | `Project` dates |
| Manual | management's assessment | `Project.manualPctComplete` |
| Earned value | `EV ÷ BAC` | earned-value engine |
| Billing | `billed ÷ contract` | owner billing |

Revenue earned = `contract × % complete`; over/underbilling is the difference against
amount billed. Selected per project via `Project.pocMethod`.

---

## 6. Subcontractors and payments: PC ▸ Subcontractors, Sub Payments

Engine: [`src/lib/finance/commitments.ts`](../src/lib/finance/commitments.ts) · Tests: `workflows.test.ts`
Database: `Commitment`, `CommitmentChange`, `SubInvoice`

| Cell | Excel formula | Software field |
|---|---|---|
| `Subs O` Current Contract | `=$L6+$M6` | `CommitmentDerived.currentValue` |
| `Subs Q` Earned to Date | `=$O6*$P6` | `earnedToDate` |
| `Subs S` Retention Held | `=$Q6*$R6` | `retentionHeld`: summed from the invoices actually issued, which diverges from the sheet whenever a rate changed mid-job |
| `Subs T` Invoiced to Date | `=SUMIFS('Sub Payments'!$F:$F,$B:$B,$B6)` | `invoicedToDate` |
| `Subs U` Paid to Date | `=SUMIFS('Sub Payments'!$M:$M,...)` | `paidToDate` |
| `Subs V` Outstanding | `=SUMIFS('Sub Payments'!$N:$N,...)` | `outstanding` |
| `Subs W` Balance to Complete | `=$O6-$Q6` | `remainingBalance` |
| `Subs AB` COI Status | nested `IF` on `MIN(X:AA)` vs data date | Computed on the subs tab and vendor admin |
| `Pay H` Retention Withheld | `=$F6*$G6` | per-invoice |
| `Pay I` Net Payable | `=$F6-$H6` | `paymentStatus().netPayable` |
| `Pay N` Outstanding | `=$I6-$M6` | `paymentStatus().outstanding` |
| `Pay P` Days Outstanding | `=IF($O6="",Setup!$C$21-$J6,$O6-$J6)` | `daysOutstanding` |
| `Pay S` Payment Status | nested `IF` → PAID / OVERDUE / PARTIAL / UNPAID | `paymentStatus().status` |

**Enter once:** logging a sub invoice posts the matching `CostTransaction` in the
same action, so a pay application never needs entering twice.

---

## 7. Cash flow S-curve: PC ▸ Progress & Forecast B23:R46

Engine: [`src/lib/finance/cashflow.ts`](../src/lib/finance/cashflow.ts) · Tests: `workflows.test.ts`
Database: `CashFlowPeriod`

| Cell | Excel formula | Software field |
|---|---|---|
| `D` Planned Cum % | `=MIN(SUM($C$23:$C23),1)` | `CashFlowRow.plannedCumPct` |
| `E` Planned Value | `=Setup!$C$26*$D23` | `plannedValue` |
| `G` Earned Value | `=Setup!$C$26*$F23` | `earnedValue` |
| `I` Forecast Cost | `=MAX(0,($F$9-$C$8)*$C23/MAX(1-plannedCumAtDataDate,0.0001))` | `forecastCost`: remaining cost spread on the planned curve, normalised by progress still to go |
| `K` Cumulative Cost | `=SUM($J$23:$J23)` | `cumulativeCost` |
| `L` Billings | `MAXIFS`/spread hybrid | `billings`: actuals from the register, forecast spread on the same curve |
| `N` Cash In | deeply nested lag + retention release | `cashIn`: **rewritten**, see below |
| `P` Schedule Variance | `=$G23-$E23` | `scheduleVariance` |
| `Q` Over/(Under) Billed | `=$M23-$G23` | `overUnderBilled` |
| `R` Net Cash | `=$O23-$K23` | `netCash` |

**Bug fixed.** The workbook's cash-in formula re-collected billings at the
actual/forecast boundary that the actual months had already collected. Forecast
months now draw down the receivable outstanding at the data date first, then
collect forecast billings on the lag. Regression test: *"collecting sooner and
spending less always improves the final cash position"*: which failed before
the fix, since the best case read worse than the worst.

Three scenarios (`buildCashFlowScenarios`): best collects a month sooner at 3% under,
worst lags a month at 8% over.

---

## 8. Quantity tracking and productivity: PC ▸ Quantity Tracking

Engine: `deriveQuantityProgress()` in [`project.ts`](../src/lib/finance/project.ts) · Tests: `workflows.test.ts`

| Cell | Excel formula | Software field |
|---|---|---|
| `H` Installed to Date | `=$F6+$G6` | `installedToDate`: Σ `QuantityEntry` |
| `I` % Installed | `=IFERROR($H6/$E6,0)` | `pctInstalled` |
| `M` Budget Hours | `=$E6*$L6` | `budgetHours` |
| `N` Earned Hours | `=$H6*$L6` | `earnedHours` |
| `P` Hours Variance | `=$N6-$O6` | `hoursVariance` |
| `Q` Actual Unit Rate | `=IFERROR($O6/$H6,0)` | `actualUnitRate` |
| `R` Productivity Factor | `=IFERROR($N6/$O6,0)` | `productivityFactor`: above 1.0 beats budget |
| `S` Forecast Hours at Completion | `=IFERROR($M6/$R6,$M6)` | `forecastHoursAtCompletion` |
| `V` Avg Daily Production | `=IFERROR($H6/$U6,0)` | `avgDailyProduction` |
| `W` Days to Complete | `=ROUNDUP($J6/$V6,0)` | `daysToComplete` |
| `AB` Material Overage | `=($AA6-$E6)/$E6` | `materialOveragePct` |

---

## 9. Bid leveling: PC ▸ Bid Leveling, TB ▸ Sub Quotes

Engine: [`src/lib/finance/leveling.ts`](../src/lib/finance/leveling.ts) · Tests: `workflows.test.ts`
Database: `BidPackage`, `BidPackageQuote`

| Cell | Excel formula | Software field |
|---|---|---|
| `F/J/N` Leveled | `=IF($D6>0,$D6+$E6,0)` | `LeveledQuote.leveledAmount` |
| `O` Low Leveled | nested `MIN` with a 1e9 sentinel for blanks | `LeveledPackage.lowLeveled`: plain `Math.min` over received bids |
| `P` Under/(Over) Budget | `=IF($O6=0,0,$B6-$O6)` | `underOverBudget` |
| `T` Buyout Savings | `=IF($S6>0,$B6-$S6,0)` | `buyoutSavings` |
| conditional formatting | green fill on the low bid | `isLow` |

**The exception-highlighting the sheet did with colour is now written out in words** , 
scope gaps against other bidders, missing scope letters, allowances carried, single-bidder
packages, wide spreads, duplicate bidders and over-budget bids, each as a named flag.

---

## 10. Takeoff and bid build-up: TB ▸ Takeoff, General Conditions, Bid Summary

Engine: [`src/lib/finance/estimate.ts`](../src/lib/finance/estimate.ts) · Tests: `estimate.test.ts`
Database: `Estimate`, `EstimateItem`, `EstimateSection`, `GeneralConditionItem`, `LaborRate`

### Takeoff line pricing

| Cell | Excel formula | Software field |
|---|---|---|
| `I` Net Qty | nested `IF` per measure (EA/LF/SF/SY/CY/LS/TON) | `deriveNetQuantity()`: extended with CF, LB, HR, DAY, ALLOWANCE |
| `L` Gross Qty | `=$I7*(1+$K7)` | `grossQty` |
| `O` Rate | `=INDEX('Bid Setup'!$F$5:$F$10,MATCH($M7,...))` | `laborRate`, from `LaborRate`, with a per-line override |
| `P` Labor $ burdened | `=$L7*$N7*$O7*(1+'Bid Setup'!$F$13)` | `laborCost` |
| `R` Material $ taxed | `=$L7*$Q7*(1+'Bid Setup'!$F$14)` | `materialCost` |
| `T` Equipment $ | `=$L7*$S7` | `equipmentCost`, extended: the hired-in lump **plus** machine hours at the equipment list's loaded hourly rate |
| `V` Sub $ | `=$L7*$U7` | `subCost` |
| `W` TOTAL $ | `=$P7+$R7+$T7+$V7` | `totalCost` |
| `X` Check | nested `IF` → `⚠ div` / `⚠ meas` / `⚠ qty` / `⚠ cost` / `⚠ class` | `qaFlags[]`: full sentences, plus new checks for a labor class with no rate, machine hours with no machine, and a machine with no rate |

A takeoff line names its machine the way it names its labor class, and both
resolve against a company library rather than a number typed on the line. A rate
agreed for one bid alone goes in the override box and the line says so.

### Markup chain: TB ▸ Bid Summary G5:G16

Every step verified to the cent against the sample bid B-26-014:

| Cell | Excel formula | Software field | Verified value |
|---|---|---|---|
| `G5` Direct cost | `=$C$19` | `directCost` | 661,341.69 |
| `G6` Small tools | `=Takeoff!$P$181*'Bid Setup'!$F$15` | `smallTools` | 3,376.33 |
| `G7` Contingency | `=($G$5+$G$6)*I$5` | `contingency` | 19,941.54 |
| `G8` Cost subtotal | `=$G$5+$G$6+$G$7` | `costSubtotal` | 684,659.56 |
| `G9` Overhead | `=$G$8*I$6` | `overhead` | 41,079.57 |
| `G10` Profit | `=($G$8+$G$9)*I$7` | `profit` | 72,573.91 |
| `G11` Subtotal | `=$G$8+$G$9+$G$10` | `subtotal` | 798,313.05 |
| `G12` GL insurance | `=$G$11*I$8` | `glInsurance` | 9,579.76 |
| `G13` P&P bond | `=$G$11*I$9` | `bond` | 7,983.13 |
| `G14` B&O / excise | `=$G$11*I$10` | `exciseTax` | 3,991.57 |
| `G15` TOTAL BID | `=$G$11+$G$12+$G$13+$G$14` | `totalBid` | 819,867.50 |
| `G16` Rounded bid | `=MROUND($G$15,500)` | `roundedBid` | 820,000 |
| `G22` Gross margin | `=($G$15-$G$8)/$G$15` | `grossMarginOnBid` | 16.4914% |

`BidBuildUp.steps[]` returns every step with its basis, rate, amount and running
total, which is what the bid summary renders: the final number is always explainable.

### General conditions

| Cell | Excel formula | Software field |
|---|---|---|
| `D` Qty | `='Bid Setup'!$C$14` for weekly items | `followsDuration` flag: changing the duration reprices every weekly line |
| `F` Total | `=$D7*$E7` | `total` |

### QA panel: TB ▸ Bid Summary F27:G32

| Check | Excel | Software |
|---|---|---|
| Flagged takeoff rows | `=COUNTIF(Takeoff!$X:$X,"⚠*")` | `qa.flaggedItems` |
| Section rollup ties | `=SUM($C$6:$C$17)-Takeoff!$W$181` | Structurally impossible to break, both read the same array |
| Quotes still pending | `=COUNTIF('Sub Quotes'!$T:$T,"Pending")` | `qa.pendingQuotes` |
| Selected ≠ carried | `=SUMPRODUCT(...ABS($S$6:$S$65)>0.005)` | `qa.quoteVarianceRows` |
| GC items unpriced | `=COUNTIFS('General Conditions'!$B:$B,"<>",$F:$F,0)` | `qa.unpricedGcItems` |

---

## 11. Company rollups: MC ▸ Executive Dashboard, Financial Dashboard, Project Summary

Engine: [`src/lib/finance/company.ts`](../src/lib/finance/company.ts)
Query: [`src/lib/queries/company.ts`](../src/lib/queries/company.ts)

**The Master workbook's paste-values step is gone.** It required copying
`Roll-Up A6:U6` into `Project Summary` for every job at every month end. ConstructX
computes each project through the same engine and aggregates live, so the company
view is never stale.

| Cell | Excel formula | Software field |
|---|---|---|
| `Exec C8` Active Projects | `=COUNTIF('Project Summary'!$G:$G,"Active")` | `PortfolioTotals.activeCount` |
| `Exec C10` Total Contract Value | `=SUM('Project Summary'!$L:$L)` | `currentContract` |
| `Exec C11` Total Backlog | `=SUM('Project Summary'!$V:$V)` | `backlog` |
| `Exec C12` Weighted Avg % Complete | `=SUMPRODUCT($L:$L,$M:$M)/SUM($L:$L)` | `weightedPctComplete` |
| `Exec C19` Forecast Profit | `=SUM('Project Summary'!$P:$P)` | `forecastProfit` |
| `Exec C20` Forecast Margin | `=SUM($P:$P)/SUM($L:$L)` | `grossMargin` |
| `Exec F8` Projects at HIGH RISK | `=COUNTIF($Z:$Z,"HIGH RISK")` | `projectsAtHighRisk` |
| `Exec F15` Accounts Receivable | `=SUM('Project Summary'!$S:$S)` | `accountsReceivable` |
| `Fin C9` Gross Profit to Date | `=SUM($R:$R)-SUM($N:$N)` | `grossProfitToDate` |
| `PS V` Backlog | `=$L7-$R7` | `ProjectFinancials.backlog` |
| `PS W` Schedule Status | `=IF($K7>=0,"On / Ahead",IF($K7>=-14,"Behind","Critical"))` | `ProjectHealth.scheduleStatus` |
| `PS X` Budget Health | `=IF($Q7<0,"LOSS",IF($Q7<target,"Thin Margin","Healthy"))` | `ProjectHealth.budgetHealth` |
| `PS Y` Risk Score | `=($K7<0)*2+($K7<-14)*1+($Q7<target)*2+($Q7<0)*3+($S7>0.25*$L7)*1+($T7<4)*1+($U7<4)*1` | `ProjectHealth.score` |
| `PS Z` Risk Flag | `=IF($Y7>=5,"HIGH RISK",IF($Y7>=3,"WATCH","OK"))` | `ProjectHealth.flag` |

---

## 12. Bid pipeline: MC ▸ Bid Pipeline

Engine: `rollupPipeline()` / `followUpState()` in `company.ts`
Database: `Bid`

| Cell | Excel formula | Software field |
|---|---|---|
| `K` Days to Due | `=$J7-$D$4` | computed against the as-of date |
| `Q` Weighted | `=IF($M7>0,$M7,$L7)*$P7` | submitted amount once submitted, else estimated value, × probability |
| `T` Follow-Up | nested `IF` → OVERDUE / TODAY / THIS WEEK / SET ONE /: | `followUpState()` |
| `G4` Active bids | `SUMPRODUCT` over six open statuses | `activeBids` |
| `J4` Open pipeline | `SUMPRODUCT` weighted by value | `openPipelineValue` |
| `V4` Win rate | `=COUNTIF("Won")/(COUNTIF("Won")+COUNTIF("Lost"))` | `winRateByCount` |
| `Exec F26` Win rate by value | `=SUMIFS(...,"Won")/(Won+Lost)` | `winRateByValue` |

---

## 13. Prevailing wage rates: COP Wage Rates

Engine: [`src/lib/finance/payroll.ts`](../src/lib/finance/payroll.ts) · Tests: `payroll.test.ts`
Database: `PayrollJurisdiction`, `PayrollCounty`, `WageRateSheet`, `WageRateLine`, and the two federal rates on `Company`
Appears: project Wage rates tab, Settings ▸ Payroll and prevailing wage, project Excel export, project PDF

The certified payroll build-up: the wage and fringe the schedule requires, then
each payroll burden stacked on top, then the fully loaded hourly cost.

| Step | Sheet formula | Software field | How it is derived now |
|---|---|---|---|
| 1 Hourly wage | entered | `WageRateLine.hourlyWage` | Entered from the determination |
| 2 Hourly benefits | entered | `WageRateLine.hourlyBenefits` | Entered; a bona fide fringe paid in cash or into a plan |
| Subtotal | `=1+2` | `WageRateDerived.subtotal` | `hourlyWage + hourlyBenefits` |
| 3 FUTA | `=1*rate` | `WageRateDerived.futa` | `hourlyWage × Company.futaPct`, **on the wage only** |
| 4 FICA | `=1*rate` | `WageRateDerived.fica` | `hourlyWage × Company.ficaPct`, on the wage only |
| 5 SUTA | `=1*rate` | `WageRateDerived.suta` | `hourlyWage ×` the sheet override, else `PayrollJurisdiction.sutaPct` |
| 6 Training and education | entered | `WageRateLine.trainingPerHour` | Dollars per hour worked, entered |
| 7 Workers compensation | entered | `WageRateLine.workersCompPerHour` | Dollars per hour worked. `workersCompPerHour()` converts a rate quoted per 100 of payroll |
| Total | `=subtotal+3+4+5+6+7` | `WageRateDerived.total` | The fully loaded hourly cost |
| Overtime | `=1*multiplier` then burdens | `WageRateDerived.overtime` | The premium applies to the **wage only**; the fringe and the two dollar items are per hour worked and do not take it, and the percentage burdens recompute on the higher wage |

**The one thing that must not move.** The percentage burdens are charged on the
wage, never on the subtotal. A fringe benefit paid into a plan is not wages, so
it attracts no FUTA, FICA or SUTA. Charging them on wage plus fringe inflates
every rate on the page, and it is the most common way one of these sheets comes
out wrong. `payroll.test.ts` asserts the distinction directly: doubling the
fringe must leave all three percentage burdens exactly where they were.

**Where each rate lives, once.** FUTA and FICA are federal and identical in
every state, so they are held on `Company`. The state unemployment rate is held
on `PayrollJurisdiction`, and a sheet stores a rate only when this job genuinely
carries a different one (`sutaPctOverride`, normally null). Correcting a rate in
Settings therefore corrects every sheet built on it.

**The annual notice, entered in one go.** Fifty-one jurisdictions ship with no
rate, which is right, but it meant nobody could load a labor rate until they had
opened fifty-one forms. The notice is now pasted as it is written, one state and
one rate to a line, in whatever order and with whatever punctuation. A line that
cannot be read is quoted back in full rather than dropped, because a rate that
quietly failed to save is a labor cost quietly priced light. A rate entered this
way is unverified, exactly as one typed into the form would be. County lists
paste the same way, and a county already on the state is skipped rather than
reported as an error.

**Nothing is shipped that cannot be true.** All fifty states and the District of
Columbia are seeded, with the facts that belong to the state: its code and name,
whether workers compensation is bought from a state monopoly fund, whether that
fund quotes premium per hour worked rather than per 100 of payroll (Washington),
and the agency that publishes determinations where that is well established. No
unemployment rate is seeded at all, because that rate is issued to each employer
every year. Every jurisdiction starts unverified and every wage sheet says so on
its face until somebody enters the rate from their own annual notice and records
the check, which is what the source form asks for in as many words.

**Counties.** Prevailing wage is determined county by county, so a sheet names
one. Washington's thirty-nine and Colorado's sixty-four ship complete. Other
states ship with none, and counties are added in Settings as work reaches them.

**One simplification, deliberate and inherited.** Unemployment is only owed on
the first few thousand dollars a worker earns in a year, so a crew on the
payroll since January stops attracting it before the job ends. The form charges
it on every hour anyway. That overstates the rate slightly, always in the safe
direction, and it is what the owner is shown on the certified form, so it is
reproduced rather than corrected. `PayrollJurisdiction.sutaWageBase` records the
base so the size of the difference can be worked out when it matters.

**Checking a row against the determination.** `checkAgainstDetermination()` holds
two conditions: wage plus fringe must meet the published total, and the cash wage
alone must not fall below the published base. The two may be traded off against
each other, but a rich fringe cannot prop up a cash wage below the base rate.

---

## 14. Labor cost, project teams and overhead

Engine: [`src/lib/finance/labor.ts`](../src/lib/finance/labor.ts) · Tests: `labor.test.ts`
Database: `LaborClassification`, `ProjectLaborAssignment`, `OverheadCost`
Appears: project Labor and wages tab, Settings ▸ Labor rates and overhead, estimate labor rates, project Excel export and PDF

Not in the workbooks. The takeoff sheet carried a flat table of six labor rates
and a single labor burden percentage; general conditions carried a
superintendent and a project manager as weekly line items. Neither could answer
what a person costs the company, which job is paying for them, or what overhead
percentage the company is actually carrying.

**What a classification costs an hour.**

| Step | Software field | How it is derived |
|---|---|---|
| Hourly wage | `LaborClassDerived.hourlyWage` | Entered directly when paid hourly; `annualSalary ÷ annualHours` when salaried |
| Hourly fringe | `hourlyBenefits` | Same, from the annual cost of benefits |
| FUTA, FICA, SUTA | `futa`, `fica`, `suta` | `hourlyWage ×` each rate, **on the wage alone**, through `burdenOnWage()` in `payroll.ts` |
| Training | `training` | Dollars per hour worked |
| Workers compensation | `workersComp` | `workersCompPerHour()`: the published rate as it stands where the state quotes per hour, else `rate ÷ 100 × wage` |
| Loaded hourly cost | `loadedHourlyCost` | Everything above |
| Weekly, monthly, annual | `loadedWeeklyCost`, `loadedMonthlyCost`, `loadedAnnualCost` | All derived from the hourly figure, so the four cannot disagree |

**`annualHours` is not 2080 by decree.** A superintendent on a salary who works
2400 hours costs less an hour than the same salary spread over 2080. Pricing
general conditions at the wrong one is a quiet way for a bid to come out light,
so the divisor is entered per classification.

**What a person costs a job** (`deriveAssignment`).

| Basis | Formula |
|---|---|
| `HOURS` | `budgetedHours × loadedHourlyCost` |
| `ALLOCATION` | `weeks × (annualHours ÷ 52) × allocationPct × loadedHourlyCost`, where `weeks = (days between the dates, inclusive of both) ÷ 7` |

Allocation is the one that matters for a project team. Half a project manager
from March to November is not a number of hours anybody has worked out; it is a
share of a person across a stretch of the calendar. Both end dates count,
because both are worked.

Nothing costed is stored. A pay rise entered on a classification reprices every
estimate, every project team assignment and the overhead rate, because none of
them holds a copy.

**Overhead, and the rate bids should carry** (`summarizeOverhead`).

| Figure | How it is derived |
|---|---|
| Annual listed overhead | Σ `annualizeOverhead(cost)`: monthly × 12, annual and one-time as they stand |
| Salaried time no job is paying for | `unassignedStaffCost()`: Σ over staff classifications of `(1 − share on jobs today) × loadedAnnualCost`, floored at zero |
| Annual overhead | The two added |
| Annual revenue | Recorded monthly billings over the months that have them, **scaled to a year** |
| Derived recovery rate | `annualOverhead ÷ annualRevenue` |
| Rate gap | Derived rate less `Company.defaultOverheadPct`, stated in money a year |

Salaries are deliberately not entered on the overhead list. They are already on
the classification list, and counting them twice would be the same money twice.
The share of each salaried person that today's allocations do not cover is what
the overhead figure carries.

**The one rule that keeps the library from breaking every bid it touches.** A
rate an estimate takes from the classification library already carries its own
burden, worked out from the real taxes and workers compensation for that class.
The estimate's flat `laborBurdenPct` is therefore **not** applied on top of it
(`LaborRateEntry.burdened`). A rate typed onto the estimate, or onto a single
takeoff line, is a bare wage and still takes the flat burden, exactly as the
workbook did. `estimate.test.ts` asserts both paths and the difference between
them.

---

## 15. Labor compliance and deadlines

Engine: [`src/lib/finance/compliance.ts`](../src/lib/finance/compliance.ts) · Tests: `compliance.test.ts`
Database: `ComplianceRequirement`, `ComplianceSubmission`
Appears: project Labor and wages tab, project alerts, company dashboard, `/api/calendar/compliance.ics`, project export

Not in the workbooks. A job on public work owes a stream of filings, each of
them small and each of them able to stop a payment application when it is late.

| Figure | How it is derived |
|---|---|
| The schedule | `deadlinesThrough()`: counted forward from `firstDueDate` at the stated frequency, bounded by `endsOn` and by a hard step limit |
| Next due | The **earliest deadline nothing has been filed against**, not the last filing plus one period |
| Missed | Every past deadline with no submission recorded against it |
| Status | `OVERDUE`, `DUE_TODAY`, `DUE_SOON` inside `leadDays`, `CURRENT`, or `CLOSED` |
| On-time rate | `(deadlines that have fallen − missed) ÷ deadlines that have fallen` |

**Nothing about the schedule is stored, and that is the point.** A filing made
late does not shift what comes after it. A gap in the middle stays visible as a
gap rather than being papered over by the most recent filing, which is exactly
what a stored "last submitted" date would have done. If three weekly payrolls
were missed in June, the next thing due is the first of those three.

Deadlines reach people three ways: as ordinary project alerts on the summary
page, as a portfolio panel on the company dashboard, and as an iCalendar feed
at `/api/calendar/compliance.ics` that Outlook, Google Calendar and Apple
Calendar subscribe to directly. The feed carries two alarms per deadline, at the
requirement's own lead time and on the morning it is due, and drops a deadline
as soon as a filing is recorded against it. A calendar subscription was chosen
over email because it needs no mail transport and no address list to keep
correct, and it puts the deadline where the person already looks.

---

## 16. Equipment rates, hire and standby

Engine: [`src/lib/finance/equipment.ts`](../src/lib/finance/equipment.ts) · Tests: `equipment.test.ts`
Database: `EquipmentItem`, `ProjectEquipmentAssignment`
Appears: Admin ▸ Equipment, project Labor and equipment tab, takeoff lines, change order and time and materials lines, project budget, project export

Not in the workbooks. Plant is a cost like any other and was being carried in
people's heads.

A machine is entered at **the bases it is actually quoted at** - hourly, daily,
weekly, monthly - and no basis is worked out from another one:

| Figure | How it is derived |
|---|---|
| `quotedBases` | Every basis carrying a rate above zero |
| `effectiveHourlyRate` | The **shortest** quoted basis divided by the hours it covers, because the shortest is closest to an hour and needs the least assuming |
| `hoursPerUnit` | `HOURLY` 1, `DAILY` `hoursPerDay`, `WEEKLY` `hoursPerDay × daysPerWeek`, `MONTHLY` that again × 4 |
| `loadedHourlyCost` | `effectiveHourlyRate + operatingCostPerHour`. This is the rate a priced line reads, because "two hours of the excavator" means two hours of it running |

**A week is never five days.** A weekly rate of 4,500 against a daily rate of
1,200 is a real discount that the machine is really quoted at, and inferring one
figure from the other would either invent a discount or lose it. A basis left
empty prices at nothing and says so, which is a question somebody can answer.

What a machine costs a job is three separate things, kept apart:

| Figure | Formula |
|---|---|
| Hire | rate at the chosen basis × units, or a rate agreed for this job alone |
| Fuel and wear | `operatingHours × operatingCostPerHour` - the hours it **ran**, not the hours it was hired |
| Standby | `standbyHours × standbyRatePerHour` - hired, on site, and not working |
| Cost to the job | The three added |

Adding these up as one number is how plant cost usually goes missing: a machine
hired for a fortnight and run for thirty hours costs the hire either way, and a
job that only records the running hours never sees the difference. Recording
them apart is what makes standby visible, and the project tab reports how much
of its plant cost was paid for machines standing idle.

Two checks run against every entry. A machine recorded as running more hours
than its hire covers is flagged, because that is either a keying slip or an
under-recorded hire and both are worth seeing. A machine owned outright with no
operating cost is flagged, because fuel, wear and maintenance are then being
charged to nothing.

Nothing about the cost is stored. A rate corrected on the equipment list
reprices the estimate line that names the machine, the change order that runs
it, the ticket it was on and the project budget it lands in, and none of them
holds a copy.

**The fleet, as against one job.** `summarizeFleet` rolls the same rows up to the
machine across every live job, and answers a different set of questions:

| Figure | How it is derived |
|---|---|
| Hired hours | Units booked on each job, converted to hours at the basis each was hired on |
| Used | Hours run over hours hired. Below half is a machine sitting; above one is a hire recorded short |
| Standby share | What was paid for the machine to stand, over what the machine cost |
| On no job | Machines still in use with nothing charged against them |

A machine with no use at all is still listed, with zeros. Hiding the idle ones
would answer the wrong question: an excavator nobody has charged to a job for
four months is the most interesting row on the page.

---

## 17. Output, permissions and portability

Nothing in this section computes a figure. It documents where the figures go and
who may see them.

| Concern | How it works | Where |
|---|---|---|
| Report definition | One sheet spec per report, holding the columns, formats and which columns total | `src/lib/queries/report-spec.ts` |
| Project export definition | One sheet spec covering every project tab | `src/lib/queries/project-spec.ts` |
| Estimate export definition | Takeoff, general conditions, leveling, bid build-up | `src/lib/queries/estimate-spec.ts` |
| Excel | Renders the spec through ExcelJS with number formats and a totals row | `src/lib/excel.ts` |
| PDF | Renders the *same* spec, so the two exports cannot diverge | `src/lib/pdf-report.ts` → `src/lib/pdf.ts` |
| AIA G702/G703 PDF | Purpose-built certificate layout with the nine numbered lines and signature blocks | `src/app/api/pdf/billing/[id]/route.ts` |
| Report permissions | One capability map read by the report card, the page and both export routes | `REPORT_REQUIRES` in `report-spec.ts` |
| Saved views | A stored query string, never a stored result: opening one recomputes today's figures | `SavedView` model, `src/lib/queries/views.ts` |
| Dashboard layout | Order and visibility only; role decides which panels exist and the stored layout is reconciled against that set on every load | `src/lib/dashboard-panels.ts` |
| Project backup | Stored values only, shared records keyed by business key rather than id. Carries the budget, commitments, costs, contract documents with their approvals and roll-ups, billings, forecasts, quantities, wage sheets, the project team, the plant and the compliance filings | `src/lib/backup.ts` |

**Why the backup carries no derived figure.** A restored project recalculates its
whole position: percent complete, earned value, EAC, margin, backlog, from the
same engine a live project uses. Writing a computed margin into the file would
create a second source of truth the moment a formula changed.

**The round trip is checked, not assumed.** `npm run verify:backup` exports every
project, restores each one, exports it again and compares the two files field by
field, then compares twenty-one headline figures computed from the engine. Before
it runs it puts one of everything onto a job, a wage sheet, a person, a machine,
a compliance filing and a time and materials ticket billed under a change order,
because a backup that round trips empty arrays proves nothing. Everything it
makes is torn down afterwards.

**What a restore will not invent.** A wage jurisdiction, a labor classification,
a machine on the equipment list and a user account are all company records the
backup names but does not carry. If the receiving company has no such record the
row is skipped and the restore says so. Creating one would mean inventing a tax
rate, an hourly rate or a way in.

**Restores never overwrite.** A restore always creates a new project. If the job
number is taken it takes the next free suffix and says so, because a restore that
could silently replace live budgets and billings is a way to lose a month of work.

---

## Money as a double, checked rather than assumed

Every dollar in the schema is a `Float`, which is a double. That is the ordinary
choice and it deserved an answer rather than an assumption, because this system
decides what a company invoices.

`precision.test.ts` runs the arithmetic a second time in exact decimal, as
integers scaled by twelve places so nothing is ever rounded on the way, and
compares. It checks three things: the markup chain against the exact chain, a
thousand compounded markups against the exact compounding, and five hundred
awkward takeoff lines summed in three different orders. Adding a small number to
a large one is where a double loses the most, so if the order of addition
changed the answer, that would be the drift showing.

It does not. The chain agrees to the cent, the pathological compounding stays
within a tenth of a part per million, and the five hundred lines total the same
forwards, backwards and smallest-first. A double carries fifteen significant
digits and a contract value with cents needs about twelve, so the headroom is
real rather than lucky.

**What would change the answer.** These tests exist to catch the day it stops
being true: a much longer chain, figures an order of magnitude larger, or an
engine that iterates rather than compounds once. If one of them ever fails, the
fix is integer cents throughout, and the failure will say so before a customer
does.

---

## How a figure is written down

Engine: [`src/lib/format.ts`](../src/lib/format.ts) · Tests: `format.test.ts`

The engines carry full precision. Rounding happens once, at the moment a figure
becomes text, and what it rounds to is a decision rather than a default.

| Formatter | Places | Why |
|---|---|---|
| `money` | 0, or 2 on request | A contract value with cents in a summary column is noise. An invoice line without them is wrong |
| `moneyShort` | Narrowing with size | `$2.45M` is no wider than `$2.5M` and does not hide fifty thousand dollars. Places fall away only once they stop meaning anything |
| `percent` | 1 by default | A tenth of a point of margin on a two million dollar job is two thousand dollars. It was `0` in seventeen places and is not any more |
| `hours` | Up to 2, never padded | A quarter hour is a quarter hour. Rounding 7.25 to 7 loses fifteen minutes of a crew, priced |
| `quantity` | Up to 3, never padded | A cubic yard lands on thirds. 33.333 is the measurement; 33.33 is a different one |
| `number` | Exactly what is asked | For counts, where a fixed width lines a column up and a decimal place would be nonsense |

**The distinction that matters.** `number(value, 1)` is wrong in both
directions at once: it writes 7 as "7.0", claiming a precision nobody measured,
and 7.25 as "7.3", throwing away a quarter hour. `decimal` states a *maximum*
instead, so a whole number stays whole and a measured one keeps what it has.
`hours` and `quantity` are that function with the limits this trade uses.

**The exports say the same thing.** A workbook and its PDF render from one sheet
spec, and each column names its precision there rather than taking a default, so
`hours` and `quantity` columns print the same places in both. They did not
always: the PDF wrote `number` columns with no decimals while the workbook wrote
two, which made a quantity of 33.33 read as 33 depending on which button
somebody pressed. `pdf-report.test.ts` asserts the places directly.

---

## The shapes

Engine: [`src/lib/charts/geometry.ts`](../src/lib/charts/geometry.ts) · Tests: `geometry.test.ts`

Every chart's arithmetic, kept out of the components that draw it. This was the
last real calculation in the system with no test, and it is the one whose
failure is quietest: a wrong angle renders cleanly, logs nothing, and sits
beside a figure that is perfectly correct. Only the picture lies.

| Function | What it holds to |
|---|---|
| `donutArcs` | Slices sweep to exactly 2π however many there are; each start is derived from the running total, so no rounding error creeps round the ring; a credit shows at its size rather than eating its neighbour |
| `niceTicks` | Steps of 1, 2, 5 or 10 times a power of ten, bracketing the data, with zero labelled `0` rather than `-0` |
| `extentOf` | Includes zero for bars, because a bar chart that starts elsewhere exaggerates every difference on it. A rate chart living near 1.0 opts out |
| `barWidths` | Proportional and absolute, so a negative variance is as visible as a positive one; shares one scale across a row |
| `sparklinePoints` | Scaled to its own range, because a sparkline carries shape and the figure beside it carries level |
| `coord` | The only rounding, at the very last step, to a hundredth of a pixel so server and browser markup match byte for byte |

---

## Where the data lives

The schema is written once, in `prisma/schema.prisma`, and it says SQLite
because a fresh clone should run with no setup at all. That is not a stopgap: it
is genuinely enough for one office on one machine with a real backup behind it.

Postgres is what a company with more than one person saving at a time should be
on. SQLite takes one writer at a time, so two project managers pressing save
together queue behind each other, and at some size that stops being invisible.

| Concern | How it works |
|---|---|
| The Postgres schema | Generated from the SQLite one by `scripts/postgres-schema.mjs`, so a field added to one is in the other the next time it runs. CI fails if the derived copy is stale |
| Migrations | Separate lineages, because the SQL a migration emits is dialect-specific and one directory cannot honestly serve both |
| The driver | Chosen from the connection string in `src/lib/db-adapter.ts`, by the application, the seed and every verification script alike |
| The generated client | Baked to one engine by Prisma, so `npm run dev` regenerates it when the connection string disagrees rather than failing at the first query |
| The audit guards | The same guarantee said two ways: SQLite raises from inside the trigger, Postgres from a function. Written down once, installed by the migration and again on every boot |

**Both are checked, not one and an assumption.** CI runs the engine identities,
every workbook and PDF, the audit tamper attempts and the backup round trip
against a real Postgres as well as against SQLite. The two produce the same 761
identities and the same 54 export sheets, which is the only evidence worth
having that the move is safe.

---

## Who gets in, and who hears about it

Nothing here computes a figure either. It documents the two doors and the one
way out, all of which are configured by environment and none of which invent
anything when they are not.

| Concern | How it works | Where |
|---|---|---|
| Attached records | Stored and hashed with SHA-256, checked again on every download | `src/lib/storage.ts` |
| Two people, one record | The form carries the timestamp it was opened at; a save onto a record that has moved is refused with an explanation | `refuseIfMovedOn` in the changes actions |
| Two people, one approval | The approval is claimed with a conditional update, so the database decides and the second is told | `approveDocument` |
| Password sign-in | scrypt with a per-password salt, in an httpOnly cookie | `src/lib/auth.ts` |
| Failed attempts | Counted by email and by address, each failure past the fifth doubling the wait to a cap of fifteen minutes | `src/lib/finance/throttle.ts`, `LoginAttempt` |
| Single sign-on | Authorization code flow against GitHub, Google or Microsoft, chosen by `SSO_PROVIDER` | `src/lib/sso.ts` |
| Compliance reminders | Dashboard panel, project alerts, an iCalendar feed, and optionally email | `src/lib/finance/digest.ts`, `src/lib/mail.ts` |
| The daily digest | An endpoint any scheduler can call, behind `CRON_SECRET` | `src/app/api/cron/compliance-digest` |

**Why the throttle doubles rather than locks.** An account locked after five
wrong passwords is an account anybody can lock for somebody else. Doubling the
wait costs a person who has forgotten their password a few seconds and then a
minute, and costs a program working through a list more time than the list is
worth. The cap means no account is ever shut out permanently. A successful
sign-in clears the count, so yesterday's fumbling is not carried into today.

**Why the two counters.** By email alone, an attack spreads itself across many
addresses and stays under the limit. By address alone, a whole office behind one
connection trips it for everybody. Counting both, and stopping when either
trips, is what makes it hold in both directions.

**Why a sign-in never creates an account.** Role is the whole of the access
control in this system, and an account created automatically has to be given
some role. Any role safe enough to grant by default is one that could see
something it should not, so an unrecognised address is turned away and told to
ask an administrator. The provider proves who somebody is; it does not decide
what they may see.

**Why email is optional and says so.** Deliverability means SPF, DKIM, DMARC, a
warmed sending address and a reputation to protect, none of which a contractor's
financial system should own, so it goes through Resend or any SMTP server. With
nothing configured the settings page states plainly that email is off, and
deadlines still reach people through the dashboard and the calendar feed. An
alerting feature that is quietly switched off is worse than one that is
obviously switched off.

**Why an attachment is stored rather than pointed at.** A signed change order is
the evidence behind an approval. An attachment used to be a file name and a path
somebody typed, so a file that was later moved or renamed left the audit trail
pointing at nothing. Now the bytes are held, hashed on the way in, and the hash
checked again on every download: a file that no longer matches is refused rather
than served, because a record that has quietly changed is worse than a missing
one. It looks right. A link to a file held elsewhere is still allowed, and the
page marks it plainly as a reference nothing here can vouch for.

Files go to a directory on the server by default, or to any S3-compatible
service through `FILE_STORAGE=s3`. The requests are signed directly, so there is
no SDK to keep up to date for what amounts to a PUT and a GET. Keys are random
rather than derived from the file name, so a signed contract cannot be found by
guessing.

**Why the digest is skipped when there is nothing to say.** A daily message that
usually reads "all clear" is filtered within a fortnight, and then the one that
matters is filtered with it. Mail arriving from this system always means there
is something to do.

---

## Deliberately not built

The brief scoped these to Procore or another document-management platform, and
the corresponding workbook tabs were not carried across:

| Workbook tab | Decision |
|---|---|
| PC ▸ Schedule | Not built. Schedule *dates* live on the project; activity-level scheduling belongs in the schedule tool. |
| PC ▸ Punch List | Not built: field management. |
| PC ▸ RFI Log | Not built: document management. |
| PC ▸ Submittal Log | Not built: document management. |
| PC ▸ Document Register | Not built: document management. |
| MC ▸ Schedule Dashboard | Not built; schedule health is reduced to the days ahead/behind figure that feeds the risk score. |

Attachments are limited to financial records: invoices, quotes, purchase orders
and billing backup: carried as a filename reference on the transaction or invoice,
not a document library.

---

## Integration readiness

The schema keeps external identifiers and a single source of truth per figure, so
the integrations the brief anticipates can be added without restructuring:

| System | Route in |
|---|---|
| QuickBooks / Sage / Viewpoint | `CostTransaction` import already exists; `importHash` prevents double-posting on repeated syncs |
| Procore | `Project`, `Commitment` and `ChangeOrder` carry the natural keys to match on |
| HeavyJob / HCSS | `QuantityEntry` is the production-and-hours shape those systems export |
| Excel | Import and export are built |
| Power BI | Every report has a stable Excel endpoint under `/api/export/report/[slug]` |
| Anything that reads PDFs | Every report, project, estimate and pay application also has a PDF endpoint under `/api/pdf/...` |
| Another ConstructX instance | `/api/backup/project/[id]` produces a single JSON file that restores into any company |
