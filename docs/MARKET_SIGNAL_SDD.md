# SDD — Native Market Signal in Tucson Trader

**Status:** formula-faithful port, v1  
**Spec version:** 2026-11-13  
**Reference workbook:** `Nasdaq_Tracker_Fixed.xlsx`, sheet `Market Signal`  
**Reference SHA-256:** `7e79c4e751a80c0fe4cb51abd1ca0890d9f18604e538200cce8aff1c0cfa6c64`

## 1. Purpose

Reproduce the `Market Signal` sheet of Don's Nasdaq Tracker workbook natively in Tucson Trader, the same way the ST Model was ported (`docs/ST_MODEL_SDD.md`). This is a faithful port of the repaired workbook, not a redesign: it does not place trades, tune thresholds or reinterpret the rules.

The workbook's own Read Me says the rules are *a rules-based adaptation, not a verified reproduction* of the forum author's table, and that *signals are descriptive, not buy/sell advice*. The page repeats both statements.

Runtime flow:

`Massive daily index closes -> deterministic engine -> table with workbook colours -> data health`

| Piece | File |
|---|---|
| Rule constants | `lib/market-signal/config.ts` |
| Engine (pure, no I/O) | `lib/market-signal/engine.ts` |
| Tests + workbook parity | `lib/market-signal/engine.test.ts` |
| Parity fixture | `fixtures/market-signal-workbook.json` |
| API route | `app/api/market-signal/route.ts` |
| Page | `app/market-signal/page.tsx`, `components/market-signal-dashboard.tsx`, `components/market-signal-table.tsx` |

## 2. Inputs

Three indexes, in sheet order:

| Workbook column | Index | Tucson symbol | Massive ticker | Workbook source (FRED) |
|---|---|---|---|---|
| Nasdaq | Nasdaq Composite | `IXIC` | `I:COMP` | `NASDAQCOM` |
| NDX100 | Nasdaq-100 | `NDX` | `I:NDX` | `NASDAQ100` |
| PHLX SOX | PHLX Semiconductor | `SOX` | `I:SOX` | `NASDAQSOX` |

The page reads daily closes through the existing Massive layer (`fetchDailyBars` in `lib/massive-api.ts`). No FRED client or other provider was added. The workbook itself still refreshes from FRED, so a close can differ between the two by provider rounding or revisions; the parity tests therefore run the engine on the workbook's own closes.

The table starts on `peakStartDate` (2025-01-02). Closes before that date are ignored. While the market is open, today's partial bar is excluded.

## 3. Rules

All constants live in `MARKET_SIGNAL_CONFIG`:

| Name | Value | Meaning |
|---|---:|---|
| `moveThreshold` | 0.025 | a daily move counts at 2.5% or more |
| `windowTradingDays` | 10 | rolling count window |
| `troughDepth` | 0.10 | TROUGH at 10% or more below the highest close |
| `peakStartDate` | 2025-01-02 | first row and anchor for the highest close |
| `signalQuorum` | 2 | "at least 2 of the 3 indexes" |

Per index, per trading day (a day on which that index has a close):

1. **ROC** = close / last available prior close - 1. The first row has no ROC. A market holiday has no row; the next trading day's ROC is measured against the last close before the holiday.
2. **+2.5% days (10d)** = number of days with ROC >= +2.5% among the last 10 trading days, including today. Workbook columns R:T.
3. **Moves of 2.5% or more (10d)** = number of days with ROC >= +2.5% **plus** the number with ROC <= -2.5% in the same window. Workbook columns H:J, headed "10d net" (see open question 1).
4. **Days since high** = trading days since the most recent highest close since `peakStartDate`. A close equal to the running high resets the count to 0.
5. **TROUGH** when close <= 90% of that highest close.

Early rows use however many ROC values exist so far (fewer than 10).

Daily signal, evaluated only when all three indexes have a ROC for the day (otherwise blank, as in the workbook):

1. **WARNING** if at least 2 of the 3 indexes are flagged TROUGH;
2. otherwise **RECOVERY** if at least 2 of the 3 have one or more +2.5% days in the last 10 trading days;
3. otherwise **WATCH**.

WARNING takes priority over RECOVERY.

## 4. Presentation

Fill colours are the workbook's conditional-format colours:

| Cell | Condition | Fill |
|---|---|---|
| ROC | >= +2.5% | green `#16A34A`, white text |
| ROC | <= -2.5% | red `#DC2626`, white text |
| 10d moves | count >= 1 | light green `#C6EFCE`, dark green text |
| 10d moves | count >= 1 and 0 on the previous trading day | yellow `#FFFF00` |
| Trough | TROUGH | dark green `#15803D`, white bold |
| Signal | RECOVERY / WARNING / WATCH | `#15803D` / `#B91C1C` / `#D97706`, white bold |

Deliberate differences from the sheet, none of which change a value:

- Rows are newest first, and market holidays have no row (the sheet lists every weekday to the end of 2027 and leaves holidays blank).
- The Signal column sits next to the date instead of after the trough columns.
- The yellow "first day" highlight compares with the previous trading day. The sheet compares with the previous row, so it never shows yellow on the day after a holiday.
- Rows 2 to 11 of the sheet use a solid green fill for a positive count; the page uses the light green of rows 12 onward everywhere.
- The H:J columns are labelled "10d moves >= 2.5%" rather than "10d net", because they count ups plus downs.

## 5. Data health

The response carries `health`:

- `stale` when the indexes do not share the same latest date (the newest row then has no signal);
- `degraded` when an index returns no closes, or when its history starts after `peakStartDate`. In the second case the highest close, days since high and TROUGH can no longer be trusted to match the workbook, and the page says so;
- `current` otherwise.

## 6. Open questions for Don

These are recorded as they stand in the repaired workbook. Neither has been decided, and the port must not guess:

1. **"10d net" (columns H:J): ups minus downs, or ups plus downs?** The workbook's Read Me describes the columns as gains *minus* losses, but the formulas (rows 12 onward in the original, every row after the repair) add them. The port follows the formulas. The signal is not affected either way: it reads the +2.5% day counts (R:T), not H:J. If Don wants minus, change `bigMoves10d` in `computeIndexSeries` and re-take the fixture.
2. **Should the highest close stay anchored at 2025-01-02?** Days since high and TROUGH measure against the highest close since a fixed date, so the lookback grows without limit. A rolling window (for example 252 trading days) would behave differently after a long decline. The port keeps the fixed anchor as `peakStartDate`.

## 7. Verification

- `fixtures/market-signal-workbook.json` holds the cached values of `Market Signal!A2:T487` (2025-01-02 to 2026-11-12, every weekday row, holidays as blank rows), extracted from the reference workbook.
- `lib/market-signal/engine.test.ts` feeds the fixture's closes to the engine and checks ROC, both 10-day counts, days since high, TROUGH and the signal on every row; named cases cover the rows around the 2025-01-09 and 2025-01-20 holidays and the last 20 rows with data.
- `e2e/market-signal.spec.ts` renders the page from the same fixture and checks values and colours in the browser.
