# SDD — Native ST Model in Tucson Trader

**Status:** implementation in progress  
**Spec version:** 2026-09-15  
**Base:** `main@a0e88387586d813f36adea912126ee444c61fa93`  
**Reference workbook:** `ST_Model (9).xlsx`  
**Reference SHA-256:** `088936d378790ad8633313fb35b1bda36253bbc3e8f0389da8bb50f0150fd27d`

## 1. Purpose

Reproduce Don's Excel ST Model natively inside Tucson Trader from Massive daily market data. The first release is a faithful port, not a strategy redesign. It does not place trades, size positions, optimize thresholds, or infer how Don uses the signals.

Runtime flow:

`Massive daily bars -> deterministic ST engine -> familiar signal table -> health/provenance -> explanation surfaces`

Excel remains a behavioral reference during parity work, not a runtime dependency.

## 2. Why this exists

The workbook audit found structural reliability issues: `STOCKHISTORY` failures, manual rows inside spill ranges, recent price rows without downstream formulas, stale supporting inputs, an FNGG sheet whose linked entity had drifted to QLD, an NDX helper that was really QQQ context, and legacy Nasdaq New High/New Low history that stopped in 2024.

Tucson Trader already has Massive-backed daily data, market-status handling, data-health concepts, tests, and a trading UI. The model logic belongs in deterministic application code rather than fragile spreadsheet plumbing.

## 3. Evidence precedence

When labels and formulas disagree:

1. original workbook behavioral formulas;
2. explicit workbook repair decisions from the 2026-09-15 audit;
3. repaired workbook wiring;
4. labels/headings only when consistent with the above.

`fixtures/workbook-contract.json` is the machine-readable evidence manifest.

Important repair decisions:

- **FNGG:** FNGG is authoritative; QLD was a broken linked-data binding.
- **NDX helper:** QQQ is the repaired context series.
- **NH/NL:** exact legacy input is only available through 2024-02-15; Tucson proxy breadth must not silently satisfy the old Bull condition.
- **Forward ROI columns:** evaluation outputs only, never live signal inputs.

## 4. Model universe

| Symbol | Workbook sheet | Std EB eligible | Alt fall threshold |
|---|---|---:|---:|
| SOXL | SOXL | yes | -20% |
| TQQQ | TQQQ | yes | -20% |
| FNGG | FNGG | yes | **-13%** |
| TECL | Alt0 | no | -20% |
| TNA | Alt1 | no | -20% |
| MSTR | Alt2 | no | -20% |
| YINN | Alt3 | no | -20% |
| TAN | Alt4 | no | -20% |

All internal history is adjusted daily data in ascending chronological order.

## 5. Core calculations

### 5.1 Workbook RSI

The workbook stores offset `4` but averages the current gain/loss plus four prior observations. Native behavior is therefore **five observations**, not Wilder RSI.

For each date `t`:

- `change[t] = close[t] - close[t-1]`
- `gain[t] = max(change[t], 0)`
- `loss[t] = abs(min(change[t], 0))`
- `avgGain = mean(gain[t-4..t])`
- `avgLoss = mean(loss[t-4..t])`
- if `avgLoss == 0`, RSI = 100
- else `RSI = 100 - 100/(1 + avgGain/avgLoss)`

### 5.2 Eleven-session rise/fall

- `pctRise = low[t] / min(low[t-10..t]) - 1`
- `pctFall = low[t] / max(high[t-10..t]) - 1`

### 5.3 Presidential cycle

`cycle = year % 4`, with modulo zero treated as cycle 4.

Ticker-sheet impact:

- cycle 2 + Oct-Dec -> `PY_Thrust`
- cycle 3 + Jan-Jul -> `PY_Thrust`
- cycle 2 + Jan-Sep -> `PY_Danger`
- otherwise blank

DBE has a separate cycle-3 override through **June**, matching the workbook formula.

## 6. Short-term signals

### Std

For SOXL/TQQQ/FNGG:

1. `pctFall < -20%` AND `RSI == 0` AND `PY_Thrust` -> `EB`
2. else `pctFall < -20%` AND `RSI < 5` -> `B`
3. else blank

For TECL/TNA/MSTR/YINN/TAN:

- `pctFall < -20%` AND `RSI < 5` -> `B`

All comparisons remain strict `<`.

### Alt

Default:

- `pctFall < -20%`
- `pctRise < 2%`
- `RSI < 20`
- => `B`

FNGG exception uses `pctFall < -13%`.

### Bull

Bull is eligible only when **SMA + legacy NH/NL + DBE are all Bull**.

Then either branch can emit `B`:

- fast: `pctFall < -10%`, `RSI < 5`, `pctRise < 2.5%`
- fallback: `pctFall < -15%`, `RSI < 50`, `pctRise < 2.5%`

If any legacy regime is unavailable, Bull remains blank. Missing inputs are never treated as Bull.

## 7. Bear Catchers

### SMA

Source: VOO close.

- 180-observation SMA
- compare today's SMA with SMA six rows earlier
- current > lagged => Bull; else Bear
- before both values exist => Unavailable

### Legacy NH/NL

Raw input is Nasdaq new 52-week highs minus new 52-week lows.

Nine-session weighted average:

`(9*x[t] + 8*x[t-1] + ... + 1*x[t-8]) / 45`

State:

- WMA < -12 => Bear
- WMA > 0 => Bull
- otherwise carry prior state

The exact workbook source is stale after 2024-02-15. Native v1 therefore reports it unavailable and gates Bull rather than substituting Tucson Trader's ETF-proxy breadth.

### DBE

Exact symbol set:

`SPY, ITOT, QQQ, SOXX, VTI, IXF, IWB, NYA, IWV, USFR`

For each symbol, track the rolling 110-observation maximum close. Each state initializes to 1 once enough history exists. When the rolling maximum increases state becomes 1; when it decreases state becomes 0; when unchanged state carries.

Outside presidential override, DBE is Bear only when the fraction of zero states is **greater than 10%**. Exactly 10% remains Bull.

Provider audit note: `I:IXF` exists in Massive's index namespace, but the current shared Tucson normalizer does not yet classify IXF as an index. `NYA` is not currently returned by the provider history/catalog checks performed for this implementation. Therefore v1 treats DBE as unavailable rather than inventing a substitute.

## 8. Market-data behavior

Reuse Tucson Trader's existing `fetchDailyBars`, `fetchMarketStatus`, `buildResponseMeta`, and `DailyBar` semantics.

- fetch at least 600 observations per source;
- bounded concurrency: five sources at a time;
- while regular market is open, exclude a bar dated today so the model remains completed-daily-bar oriented;
- source failure becomes an empty series and visible health degradation;
- never fill failure with zero, previous close, mock data, or another ticker.

## 9. Health contract

Health is:

- `current`: all exact inputs current;
- `degraded`: price data is usable but one or more explicitly gated legacy sources are unavailable;
- `stale`: a required populated price feed lags peer required feeds.

Response exposes:

- `priceDataThrough`
- `breadthDataThrough`
- `breadthMode`
- `staleSymbols[]`
- `unavailableSources[]`
- human-readable notes

The UI must not imply the whole model is simply “Live” when degraded.

## 10. Native structure

```text
lib/st-model/
  config.ts
  types.ts
  regimes.ts
  engine.ts
  index.ts
  engine.test.ts
app/api/st-model/route.ts
app/st-model/page.tsx
components/st-model-table.tsx
fixtures/workbook-contract.json
e2e/st-model.spec.ts
```

The engine has no React imports, database access, HTTP calls, or implicit current-time dependency.

## 11. API

`GET /api/st-model?days=<20..252>`

Default display window is 90 days.

Response contains newest-first display dates, fixed workbook symbol order, deterministic signal rows, `byDate`, health, existing Tucson response metadata, and methodology identifiers including workbook SHA.

No response field is permission to trade.

## 12. UI

Route: `/st-model`

Required surfaces:

- price-data-through date;
- model health;
- market phase;
- legacy breadth mode;
- explicit warning when NH/NL is gated;
- familiar table:

`Date | SOXL Std Alt Bull | TQQQ Std Alt Bull | ... | TAN Std Alt Bull | SMA | NH/NL | DBE | PY`

Signal cells expose RSI, fall %, and rise % via tooltip/detail. Unavailable regimes render muted, not as neutral/bull values.

## 13. Parity tests

Unit tests must prove:

- five-observation RSI semantics;
- inclusive eleven-session rise/fall;
- strict threshold boundaries;
- `EB` eligibility;
- FNGG -13% Alt exception;
- both Bull trigger branches;
- all-three-regime gate;
- PY month boundaries;
- SMA 180 + six-row lag;
- NH/NL weighted-average + state carry;
- DBE 110-window initialization/carry and exact `> 10%` Bear boundary.

Historical mismatches are classified as implementation defect, source-data difference, repaired workbook defect, unavailable legacy source, or non-comparable workbook corruption/staleness. Non-comparable rows are never counted as successful parity.

## 14. Release gates

### Core

- TypeScript compiles
- Vitest ST Model tests pass
- workbook contract remains hash-bound

### API

- missing market-data key returns non-200
- source failures surface health, never fabricated values
- current regular-session daily bar is excluded
- display dates newest-first; calculation arrays oldest-first

### UI

- `/st-model` loads
- degraded state visible above table
- horizontal scrolling works on small screens
- no Bull shown while NH/NL is unavailable
- back navigation works

### Regression

- `npm run lint`
- `npm run test:run`
- `npm run build`
- existing Playwright suite
- new ST Model E2E smoke

## 15. Rollout

1. **Observation only:** ship beside the existing Tucson dashboard; no alerts or execution.
2. **Parity confidence:** compare active dates with Don's workbook interpretation.
3. **Explanation:** connect deterministic outputs to AI and chart/drill surfaces.
4. **Workflow changes:** only after Don explains whether Std/Alt/Bull mean entry, ranking, timing, sizing context, or something else.

## 16. Definition of done for first PR

- SDD and workbook evidence fixture committed;
- deterministic TypeScript engine committed;
- signal/regime boundary tests committed;
- `/api/st-model` computes from Massive daily bars;
- `/st-model` renders workbook-style signals and visible health;
- legacy NH/NL is explicitly gated;
- real repo lint/test/build/E2E results recorded in PR;
- no trading automation or strategy optimization introduced;
- unresolved DBE provider coverage is disclosed rather than substituted.
