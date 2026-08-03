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

Verification: `src/lib/finance/*.test.ts` — 109 tests asserting these formulas
reproduce the workbooks' own cached values.

---

## 1. Cost control — PC ▸ Financials

Engine: [`src/lib/finance/cost.ts`](../src/lib/finance/cost.ts) · Tests: `cost.test.ts`
Database: `BudgetLine`, `BudgetRevision`, `Commitment`, `CommitmentLine`, `CostTransaction`, `ForecastLine`
Appears: project Budget tab, Job cost tab, company dashboard, budget-vs-actual report, project Excel export

| Cell | Excel formula | Software field | How it is derived now |
|---|---|---|---|
| `G` Current Budget | `=IF($A7="",0,$E7+$F7)` | `CostLine.currentBudget` | `originalBudget + Σ BudgetRevision.amount` — revisions are rows, never an overwrite |
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

## 2. Earned value and estimate at completion — PC ▸ Progress & Forecast

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
| `I5` Estimate to Complete | `=$F$9-$C$8` | `estimateToComplete` | Clamped at 0 — never negative |
| `I6` Variance at Completion | `=$C$5-$F$9` | `varianceAtCompletion` | |
| `I7` Forecast profit | `=Setup!$C$26-$F$9` | `ProjectFinancials.forecastProfit` | Uses `forecastContract`, so pending change orders can be included at management's chosen weighting |
| `I8` Forecast margin | `=IFERROR((Setup!$C$26-$F$9)/Setup!$C$26,0)` | `forecastMargin` | |

**All three EAC methods are shown side by side** on the project summary and the
forecast tab, so the selection can be justified rather than assumed.

---

## 3. Contract and change orders — PC ▸ Setup, Change Orders

Engine: [`src/lib/finance/changeOrders.ts`](../src/lib/finance/changeOrders.ts) · Tests: `workflows.test.ts`
Database: `ChangeOrder`, `ChangeOrderLine`, `BudgetRevision`

| Cell | Excel formula | Software field | Notes |
|---|---|---|---|
| `Setup C24` Original Contract | manual entry | `Project.originalContractSum` | |
| `Setup C25` Approved COs | `=SUMIFS('Change Orders'!$H:$H,$G:$G,"Approved")` | `ContractPosition.approvedChangeOrders` | `APPROVED` **and** `EXECUTED` both count |
| `Setup C26` Current Contract | `=C24+C25` | `currentContract` | |
| `Setup C27` Pending COs | `=SUMIFS(...,"Pending")+SUMIFS(...,"Submitted")` | `pendingChangeOrders` | Extended to `PENDING`, `SUBMITTED`, `UNDER_REVIEW`, `PRICING` |
| `Setup C28` Potential Contract | `=C26+C27` | `potentialContract` | |
| — | *(not in the workbook)* | `weightedPendingChangeOrders` | Pending × probability |
| — | *(not in the workbook)* | `forecastContract` | `current + weighted pending × Project.pendingCoInclusionPct` |
| `CO J` Margin | `=IF($A6="",0,$H6-$I6)` | `ChangeOrderDerived.margin` | |
| `CO K` Margin % | `=IFERROR($J6/$H6,0)` | `marginPct` | |
| `CO N` Days Pending | `=IF($G6="Approved",$M6-$F6,Setup!$C$21-$F6)` | `daysPending` | Approved measures to approval; pending ages against the data date |

**Approved change orders post to the budget automatically** via
`syncBudgetForChangeOrder()` — and un-approving one reverses that posting, with
both movements recorded in the revision history.

---

## 4. Owner billing — PC ▸ Owner Billings (AIA G702/G703)

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
| `L` Less Previous Certificates | `=INDEX($K$6:$K$41,MATCH($A6-1,$A$6:$A$41,0))` | `lessPreviousCertificates` | **Recomputed from the full application history** rather than reading the prior row — a corrected back-application now flows forward automatically |
| `M` Current Payment Due | `=$K6-$L6` | `currentPaymentDue` | |
| `N` Balance to Finish | `=$F6-$K6` | `balanceToFinishIncludingRetainage` | |
| `R` AR Outstanding | `=$M6-$Q6` | `arOutstanding` | |
| `S` Days Outstanding | `=IF($P6="",Setup!$C$21-$C6,$P6-$C6)` | `daysOutstanding` | |
| `Roll-Up R6` Billed to Date | `=MAX('Owner Billings'!$G$6:$G$41)` | `BillingPosition.totalCompletedAndStored` | A max, not a sum — each application restates the cumulative figure |

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

## 6. Subcontractors and payments — PC ▸ Subcontractors, Sub Payments

Engine: [`src/lib/finance/commitments.ts`](../src/lib/finance/commitments.ts) · Tests: `workflows.test.ts`
Database: `Commitment`, `CommitmentChange`, `SubInvoice`

| Cell | Excel formula | Software field |
|---|---|---|
| `Subs O` Current Contract | `=$L6+$M6` | `CommitmentDerived.currentValue` |
| `Subs Q` Earned to Date | `=$O6*$P6` | `earnedToDate` |
| `Subs S` Retention Held | `=$Q6*$R6` | `retentionHeld` — summed from the invoices actually issued, which diverges from the sheet whenever a rate changed mid-job |
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

## 7. Cash flow S-curve — PC ▸ Progress & Forecast B23:R46

Engine: [`src/lib/finance/cashflow.ts`](../src/lib/finance/cashflow.ts) · Tests: `workflows.test.ts`
Database: `CashFlowPeriod`

| Cell | Excel formula | Software field |
|---|---|---|
| `D` Planned Cum % | `=MIN(SUM($C$23:$C23),1)` | `CashFlowRow.plannedCumPct` |
| `E` Planned Value | `=Setup!$C$26*$D23` | `plannedValue` |
| `G` Earned Value | `=Setup!$C$26*$F23` | `earnedValue` |
| `I` Forecast Cost | `=MAX(0,($F$9-$C$8)*$C23/MAX(1-plannedCumAtDataDate,0.0001))` | `forecastCost` — remaining cost spread on the planned curve, normalised by progress still to go |
| `K` Cumulative Cost | `=SUM($J$23:$J23)` | `cumulativeCost` |
| `L` Billings | `MAXIFS`/spread hybrid | `billings` — actuals from the register, forecast spread on the same curve |
| `N` Cash In | deeply nested lag + retention release | `cashIn` — **rewritten**, see below |
| `P` Schedule Variance | `=$G23-$E23` | `scheduleVariance` |
| `Q` Over/(Under) Billed | `=$M23-$G23` | `overUnderBilled` |
| `R` Net Cash | `=$O23-$K23` | `netCash` |

**Bug fixed.** The workbook's cash-in formula re-collected billings at the
actual/forecast boundary that the actual months had already collected. Forecast
months now draw down the receivable outstanding at the data date first, then
collect forecast billings on the lag. Regression test: *"collecting sooner and
spending less always improves the final cash position"* — which failed before
the fix, since the best case read worse than the worst.

Three scenarios (`buildCashFlowScenarios`): best collects a month sooner at 3% under,
worst lags a month at 8% over.

---

## 8. Quantity tracking and productivity — PC ▸ Quantity Tracking

Engine: `deriveQuantityProgress()` in [`project.ts`](../src/lib/finance/project.ts) · Tests: `workflows.test.ts`

| Cell | Excel formula | Software field |
|---|---|---|
| `H` Installed to Date | `=$F6+$G6` | `installedToDate` — Σ `QuantityEntry` |
| `I` % Installed | `=IFERROR($H6/$E6,0)` | `pctInstalled` |
| `M` Budget Hours | `=$E6*$L6` | `budgetHours` |
| `N` Earned Hours | `=$H6*$L6` | `earnedHours` |
| `P` Hours Variance | `=$N6-$O6` | `hoursVariance` |
| `Q` Actual Unit Rate | `=IFERROR($O6/$H6,0)` | `actualUnitRate` |
| `R` Productivity Factor | `=IFERROR($N6/$O6,0)` | `productivityFactor` — above 1.0 beats budget |
| `S` Forecast Hours at Completion | `=IFERROR($M6/$R6,$M6)` | `forecastHoursAtCompletion` |
| `V` Avg Daily Production | `=IFERROR($H6/$U6,0)` | `avgDailyProduction` |
| `W` Days to Complete | `=ROUNDUP($J6/$V6,0)` | `daysToComplete` |
| `AB` Material Overage | `=($AA6-$E6)/$E6` | `materialOveragePct` |

---

## 9. Bid leveling — PC ▸ Bid Leveling, TB ▸ Sub Quotes

Engine: [`src/lib/finance/leveling.ts`](../src/lib/finance/leveling.ts) · Tests: `workflows.test.ts`
Database: `BidPackage`, `BidPackageQuote`

| Cell | Excel formula | Software field |
|---|---|---|
| `F/J/N` Leveled | `=IF($D6>0,$D6+$E6,0)` | `LeveledQuote.leveledAmount` |
| `O` Low Leveled | nested `MIN` with a 1e9 sentinel for blanks | `LeveledPackage.lowLeveled` — plain `Math.min` over received bids |
| `P` Under/(Over) Budget | `=IF($O6=0,0,$B6-$O6)` | `underOverBudget` |
| `T` Buyout Savings | `=IF($S6>0,$B6-$S6,0)` | `buyoutSavings` |
| conditional formatting | green fill on the low bid | `isLow` |

**The exception-highlighting the sheet did with colour is now written out in words** —
scope gaps against other bidders, missing scope letters, allowances carried, single-bidder
packages, wide spreads, duplicate bidders and over-budget bids, each as a named flag.

---

## 10. Takeoff and bid build-up — TB ▸ Takeoff, General Conditions, Bid Summary

Engine: [`src/lib/finance/estimate.ts`](../src/lib/finance/estimate.ts) · Tests: `estimate.test.ts`
Database: `Estimate`, `EstimateItem`, `EstimateSection`, `GeneralConditionItem`, `LaborRate`

### Takeoff line pricing

| Cell | Excel formula | Software field |
|---|---|---|
| `I` Net Qty | nested `IF` per measure (EA/LF/SF/SY/CY/LS/TON) | `deriveNetQuantity()` — extended with CF, LB, HR, DAY, ALLOWANCE |
| `L` Gross Qty | `=$I7*(1+$K7)` | `grossQty` |
| `O` Rate | `=INDEX('Bid Setup'!$F$5:$F$10,MATCH($M7,...))` | `laborRate` — from `LaborRate`, with a per-line override |
| `P` Labor $ burdened | `=$L7*$N7*$O7*(1+'Bid Setup'!$F$13)` | `laborCost` |
| `R` Material $ taxed | `=$L7*$Q7*(1+'Bid Setup'!$F$14)` | `materialCost` |
| `T` Equipment $ | `=$L7*$S7` | `equipmentCost` |
| `V` Sub $ | `=$L7*$U7` | `subCost` |
| `W` TOTAL $ | `=$P7+$R7+$T7+$V7` | `totalCost` |
| `X` Check | nested `IF` → `⚠ div` / `⚠ meas` / `⚠ qty` / `⚠ cost` / `⚠ class` | `qaFlags[]` — full sentences, plus a new "labor class has no rate" check |

### Markup chain — TB ▸ Bid Summary G5:G16

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
total, which is what the bid summary renders — the final number is always explainable.

### General conditions

| Cell | Excel formula | Software field |
|---|---|---|
| `D` Qty | `='Bid Setup'!$C$14` for weekly items | `followsDuration` flag — changing the duration reprices every weekly line |
| `F` Total | `=$D7*$E7` | `total` |

### QA panel — TB ▸ Bid Summary F27:G32

| Check | Excel | Software |
|---|---|---|
| Flagged takeoff rows | `=COUNTIF(Takeoff!$X:$X,"⚠*")` | `qa.flaggedItems` |
| Section rollup ties | `=SUM($C$6:$C$17)-Takeoff!$W$181` | Structurally impossible to break — both read the same array |
| Quotes still pending | `=COUNTIF('Sub Quotes'!$T:$T,"Pending")` | `qa.pendingQuotes` |
| Selected ≠ carried | `=SUMPRODUCT(...ABS($S$6:$S$65)>0.005)` | `qa.quoteVarianceRows` |
| GC items unpriced | `=COUNTIFS('General Conditions'!$B:$B,"<>",$F:$F,0)` | `qa.unpricedGcItems` |

---

## 11. Company rollups — MC ▸ Executive Dashboard, Financial Dashboard, Project Summary

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

## 12. Bid pipeline — MC ▸ Bid Pipeline

Engine: `rollupPipeline()` / `followUpState()` in `company.ts`
Database: `Bid`

| Cell | Excel formula | Software field |
|---|---|---|
| `K` Days to Due | `=$J7-$D$4` | computed against the as-of date |
| `Q` Weighted | `=IF($M7>0,$M7,$L7)*$P7` | submitted amount once submitted, else estimated value, × probability |
| `T` Follow-Up | nested `IF` → OVERDUE / TODAY / THIS WEEK / SET ONE / — | `followUpState()` |
| `G4` Active bids | `SUMPRODUCT` over six open statuses | `activeBids` |
| `J4` Open pipeline | `SUMPRODUCT` weighted by value | `openPipelineValue` |
| `V4` Win rate | `=COUNTIF("Won")/(COUNTIF("Won")+COUNTIF("Lost"))` | `winRateByCount` |
| `Exec F26` Win rate by value | `=SUMIFS(...,"Won")/(Won+Lost)` | `winRateByValue` |

---

## Deliberately not built

The brief scoped these to Procore or another document-management platform, and
the corresponding workbook tabs were not carried across:

| Workbook tab | Decision |
|---|---|
| PC ▸ Schedule | Not built. Schedule *dates* live on the project; activity-level scheduling belongs in the schedule tool. |
| PC ▸ Punch List | Not built — field management. |
| PC ▸ RFI Log | Not built — document management. |
| PC ▸ Submittal Log | Not built — document management. |
| PC ▸ Document Register | Not built — document management. |
| MC ▸ Schedule Dashboard | Not built; schedule health is reduced to the days ahead/behind figure that feeds the risk score. |

Attachments are limited to financial records — invoices, quotes, purchase orders
and billing backup — carried as a filename reference on the transaction or invoice,
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
