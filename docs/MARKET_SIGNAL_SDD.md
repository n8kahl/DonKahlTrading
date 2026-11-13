# SDD — Native Market Signal in Tucson Trader

**Status:** formula-faithful port, v2  
**Spec version:** 2026-11-13  
**Reference workbook:** `Nasdaq_Tracker_Fixed.xlsx`, sheet `Market Signal`  
**Reference SHA-256:** `af9178de989171f979a433feba2443849a200372f7a02c4cd8d532478501e887`

## 1. Purpose

Reproduce the `Market Signal` sheet of Don's Nasdaq Tracker workbook natively in Tucson Trader, the same way the ST Model was ported (`docs/ST_MODEL_SDD.md`). It does not place trades or tune thresholds.

The table follows a forum author's table of Nasdaq, Nasdaq-100 and PHLX Semiconductor moves. The signal column is a **rules-based reading of that table, not the author's own call**, and signals are descriptive, not buy or sell advice. The page says both.

Runtime flow:

`Massive daily index closes -> deterministic engine -> table with workbook colours -> data health`

| Piece | File |
|---|---|
| Rule constants | `lib/market-signal/config.ts` |
| Engine (pure, no I/O) | `lib/market-signal/engine.ts` |
| Tests + parity | `lib/market-signal/engine.test.ts` |
| Parity fixture | `fixtures/market-signal-workbook.json` |
| API route | `app/api/market-signal/route.ts` |
| Page | `app/market-signal/page.tsx`, `components/market-signal-dashboard.tsx`, `components/market-signal-table.tsx` |

## 2. Evidence

In order of precedence:

1. **The forum author's April 2025 table** (post "Tech Contagion: What I'd like to see" on zeelotes.org, supplied by the user). Recomputed from FRED closes, all 20 rows from 2025-03-28 to 2025-04-25 match on the 10-day net counts and on days since high. Those 20 rows are hard-coded in the tests. The post itself was read in the workbook-repair session, not in this port; the values here are as relayed from it.
2. **The corrected workbook** (`Nasdaq_Tracker_Fixed.xlsx`, SHA above), which implements the same rules for the net count, days since high, the 10%-below-high flag and the signal. `fixtures/market-signal-workbook.json` holds its cached values for every row.

Two rules that were open in the first version of this spec are settled by the author's table:

- **The 10-day count is a net** (up days minus down days), not ups plus downs. It goes negative.
- **The highest close is measured from 2025-01-02.** On 2025-03-28 the author shows 27 / 27 / 46 days since high, which only that start date reproduces for all three indexes.

## 3. Inputs

Three indexes, in sheet order:

| Workbook column | Index | Tucson symbol | Massive ticker | Workbook source (FRED) |
|---|---|---|---|---|
| Nasdaq | Nasdaq Composite | `IXIC` | `I:COMP` | `NASDAQCOM` |
| NDX100 | Nasdaq-100 | `NDX` | `I:NDX` | `NASDAQ100` |
| PHLX SOX | PHLX Semiconductor | `SOX` | `I:SOX` | `NASDAQSOX` |

The page reads daily closes through the existing Massive layer (`fetchDailyBars` in `lib/massive-api.ts`). No FRED client or other provider was added.

Provider hygiene (`normalizeProviderCloses`), applied before the rules and not part of them:

- **Weekend bars are dropped.** Massive returns a bar dated on a Saturday for all three tickers on 2025-10-25, 2026-09-12 and 2026-10-10. Left in, each would count as an extra trading day and shift the 10-day window and days since high. The API response lists what was dropped in `methodology.droppedWeekendBars`.
- **Closes are rounded to cents.** Massive returns unrounded index values (for example 27366.16979…); the rules are defined on published closes.

While the market is open, today's partial bar is excluded. The table starts on `peakStartDate`; earlier closes are ignored.

Checked on 2026-11-13: with those two steps, live Massive data gives the same 468 trading days as the workbook from 2025-01-02 to 2026-11-12, and every close, ROC, net count, up-day count, days since high, below-high flag and signal is identical (8,892 cells, no differences).

## 4. Rules

All constants live in `MARKET_SIGNAL_CONFIG`:

| Name | Value | Meaning |
|---|---:|---|
| `moveThreshold` | 0.025 | a daily move counts at 2.5% or more |
| `windowTradingDays` | 10 | rolling window, including the current day |
| `belowHighDepth` | 0.10 | "10% below high" at 10% or more below the highest close |
| `peakStartDate` | 2025-01-02 | first row and start of the history for the highest close |
| `signalQuorum` | 2 | "at least 2 of the 3 indexes" |
| `troughSwing` | 0.10 | fall and rebound that define a trough date |
| `troughIndexes` | `['SOX']` | indexes whose trough dates are marked |

Per index, per trading day (a day on which that index has a close; market holidays are not rows):

1. **ROC** = close / previous trading day's close - 1. The first row has no ROC. The 2.5% test uses the unrounded value: Nasdaq +2.50% on 2025-04-23 counts as an up day, NDX -2.46% on 2025-04-21 does not count as a down day.
2. **10d net** = number of days with ROC >= +2.5% minus number of days with ROC <= -2.5%, over the last 10 trading days including today. Workbook columns H:J.
3. **10d +2.5% days** = the up-day count alone. Workbook columns R:T, kept for reference; no rule reads it.
4. **Days since high** = trading days since the most recent highest close since `peakStartDate`. A close equal to the running high resets the count to 0.
5. **10% below high** = close <= 90% of that highest close. This is the live state, known on the day. Workbook columns N:P (cell text "TROUGH").

Early rows use however many ROC values exist so far (fewer than 10).

**Trough dates** (SOX only, as the author marks them): a closing-price zigzag. Once the close has fallen 10% or more from the running peak, the lowest close that follows is a trough on the first day the close is 10% or more above it. A trough is therefore **only known in hindsight**, on its confirmation date, and the low still forming at the end of the data is not shown. From 2025-01-02 this gives SOX troughs on 2025-04-08, 2025-04-21, 2025-11-20, 2025-12-17, 2026-03-30, 2026-06-10, 2026-07-29, 2026-09-14 and 2026-11-05; the author names 2025-04-21 and 2025-11-20 and highlights 2025-04-08. Trough dates are display only and feed no rule. The workbook has no equivalent column.

**Daily signal**, evaluated only when all three indexes have a net count for the day (otherwise blank, as in the workbook):

1. **RECOVERY** if at least 2 of the 3 net counts are +1 or more;
2. otherwise **WARNING** if at least 2 of the 3 indexes are 10% below high;
3. otherwise **WATCH**.

RECOVERY is checked first.

Known difference from the author: he called his April 2025 "all go" on 2025-04-23, when the SOX net count alone turned +1. The 2-of-3 rule shows WARNING on 2025-04-21 to 2025-04-24 and RECOVERY on 2025-04-25. In November 2025 the rule and the author agree (RECOVERY on 2025-11-24 with net 1, 1, -1).

## 5. Presentation

Fill colours are the workbook's conditional-format colours:

| Cell | Condition | Fill |
|---|---|---|
| ROC | >= +2.5% | green `#16A34A`, white text |
| ROC | <= -2.5% | red `#DC2626`, white text |
| 10d net | negative | red `#DC2626`, white text |
| 10d net | positive | light green `#C6EFCE`, dark green text |
| 10d net | positive and 0 on the previous trading day | yellow `#FFFF00` |
| 10% below high | flagged | dark green `#15803D`, white bold |
| Signal | RECOVERY / WARNING / WATCH | `#15803D` / `#B91C1C` / `#D97706`, white bold |

Deliberate differences from the sheet, none of which change a value:

- Rows are newest first, and market holidays have no row (the sheet lists every weekday to the end of 2027 and leaves holidays blank).
- The Signal column sits next to the date.
- The 10%-below-high cells read "BELOW" instead of "TROUGH", so the word trough means only the swing-low dates.
- Trough dates are highlighted in the date column (amber, not a workbook colour) and listed under the table with the close, the fall from the peak and the confirmation date.
- The yellow highlight compares with the previous trading day; the sheet compares with the previous row, so it never shows yellow on the day after a holiday.
- Rows 2 to 11 of the sheet use a solid green fill for a positive net count; the page uses the light green of rows 12 onward everywhere.

## 6. Data health

The response carries `health`:

- `stale` when the indexes do not share the same latest date (the newest row then has no signal);
- `degraded` when an index returns no closes, or when its history starts after `peakStartDate`. In the second case the highest close, days since high, the below-high flag and trough dates can no longer be trusted, and the page says so;
- `current` otherwise.

## 7. Verification

- `lib/market-signal/engine.test.ts`:
  - the author's 20 rows (net counts, days since high 27..46 and 46..65, no row for the 2025-04-18 holiday), the threshold cases on 2025-04-21 and 2025-04-23, the signal on 2025-04-21..25, 2025-11-21, 2025-11-24 and 2026-11-12, and the nine SOX trough dates;
  - every row of the workbook fixture (`Market Signal!A2:T487`, 2025-01-02 to 2026-11-12) for ROC, net, up days, days since high, below high and signal, with named cases for the rows around the 2025-01-09 and 2025-01-20 holidays and the last 20 rows with data;
  - weekend-bar and rounding hygiene, and data health.
- `e2e/market-signal.spec.ts` renders the page from the same fixture and checks values, colours, the trough list and the highlighted dates in the browser.
- Live check against Massive: see section 3.
