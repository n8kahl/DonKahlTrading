# SDD — Native ST Model in Tucson Trader

**Status:** implementation + source-parity work in progress  
**Spec version:** 2026-09-15  
**Base:** `main@a0e88387586d813f36adea912126ee444c61fa93`  
**Reference workbook:** `ST_Model (9).xlsx`  
**Reference SHA-256:** `088936d378790ad8633313fb35b1bda36253bbc3e8f0389da8bb50f0150fd27d`

## 1. Purpose

Reproduce Don's Excel ST Model natively inside Tucson Trader from maintainable market data. The first release is a faithful port, not a strategy redesign. It does not place trades, size positions, optimize thresholds, or infer how Don uses the signals.

Runtime flow:

`market data -> deterministic ST engine -> familiar signal table -> source health/provenance -> explanation surfaces`

Excel remains a behavioral reference during parity work, not a runtime dependency.

## 2. Evidence precedence

When labels and formulas disagree:

1. original workbook behavioral formulas;
2. explicit workbook repair/source-audit decisions from 2026-09-15;
3. repaired workbook wiring;
4. labels/headings only when consistent with the above.

`fixtures/workbook-contract.json` is the machine-readable workbook contract. `fixtures/nhnl-workbook-samples.json` banks observed breadth rows. `docs/ST_MODEL_SOURCE_AUDIT.md` records source provenance and provider experiments.

Important repair decisions:

- **FNGG:** FNGG is authoritative; QLD was a broken linked-data binding.
- **NDX helper:** QQQ is the repaired context series.
- **NH/NL:** workbook B:C values were pasted/static, not a connected Excel feed.
- **DBE:** preserve the exact workbook instrument set; missing NYA fails closed.
- **Forward ROI columns:** evaluation outputs only, never live signal inputs.

## 3. Model universe

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

All internal price history is adjusted daily data in ascending chronological order.

## 4. Core calculations

### 4.1 Workbook RSI

The workbook stores offset `4` but averages the current gain/loss plus four prior observations. Native behavior is therefore **five observations**, not Wilder RSI.

- `change[t] = close[t] - close[t-1]`
- `gain[t] = max(change[t], 0)`
- `loss[t] = abs(min(change[t], 0))`
- `avgGain = mean(gain[t-4..t])`
- `avgLoss = mean(loss[t-4..t])`
- if `avgLoss == 0`, RSI = 100
- otherwise `RSI = 100 - 100/(1 + avgGain/avgLoss)`

### 4.2 Eleven-session rise/fall

- `pctRise = low[t] / min(low[t-10..t]) - 1`
- `pctFall = low[t] / max(high[t-10..t]) - 1`

### 4.3 Presidential cycle

`cycle = year % 4`, with modulo zero treated as cycle 4.

Ticker-sheet impact:

- cycle 2 + Oct-Dec -> `PY_Thrust`
- cycle 3 + Jan-Jul -> `PY_Thrust`
- cycle 2 + Jan-Sep -> `PY_Danger`
- otherwise blank

DBE has a separate cycle-3 override through **June**, matching the workbook formula.

## 5. Short-term signals

### Std

For SOXL/TQQQ/FNGG:

1. `pctFall < -20%` AND `RSI == 0` AND `PY_Thrust` -> `EB`
2. otherwise `pctFall < -20%` AND `RSI < 5` -> `B`
3. otherwise blank

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

Bull is eligible only when **SMA + NH/NL + DBE are all Bull**.

Then either branch can emit `B`:

- fast: `pctFall < -10%`, `RSI < 5`, `pctRise < 2.5%`
- fallback: `pctFall < -15%`, `RSI < 50`, `pctRise < 2.5%`

If any required regime is unavailable, Bull remains blank. Missing inputs are never treated as Bull.

## 6. Bear Catchers

### 6.1 SMA

Source: VOO close.

- 180-observation SMA
- compare today's SMA with SMA six rows earlier
- current > lagged => Bull; otherwise Bear
- before both values exist => Unavailable

### 6.2 NH/NL

Raw input is Nasdaq new 52-week highs minus new 52-week lows.

Nine-session weighted average:

`(9*x[t] + 8*x[t-1] + ... + 1*x[t-8]) / 45`

State:

- WMA < -12 => Bear
- WMA > 0 => Bull
- otherwise carry prior state

#### Source proof

The workbook's `NHNL!B:C` cells are static/pasted values. Massive full-universe reconstruction was executed against 3,302 historical XNAS common stocks and **failed exact parity 0/10** across every tested definition, so it is rejected as a drop-in replacement.

Historical fingerprinting then identified the workbook counts as **WSJ / Dow Jones Market Data Nasdaq Market Diary** values. Multiple workbook sessions match the published WSJ/Dow Jones counts exactly.

A clean runtime probe also proved the current WSJ Market Diary JSON surface returns the required Nasdaq `newhighs` / `newlows` rows without credentials. On 2026-09-15 it returned a completed-session timestamp of **2026-09-14** with **72 new highs / 402 new lows**.

The endpoint's `previousClose` and `weekAgo` fields are not used for production seeding because their revision/snapshot semantics have not been proven identical to separately published Dow Jones final diary values. Historical query parameters were tested and ignored by the endpoint, so there is no accepted history API through this route.

#### Runtime contract

`wsj-market-diary-live-v1` is an explicit source variant.

- persist only the source's latest completed-session pair;
- unique identity = `date + variant`;
- require nine **contiguous completed market sessions** from the same variant;
- align history to the QQQ completed-session calendar;
- one missing required trading-session snapshot resets the contiguous suffix;
- fewer than nine contiguous rows => NH/NL unavailable;
- nine rows whose weighted state is still neutral with no prior Bull/Bear => unavailable;
- source/network/schema/database failure => unavailable;
- do not mix Massive reconstruction, ETF proxy breadth, `previousClose`, `weekAgo`, or differently revised Dow Jones rows into this variant.

`breadthMode` becomes `wsj-dow-jones` only when the same-variant history is current and produces a valid regime. Otherwise the UI shows `Gated / warming` with `N/9` progress.

The WSJ JSON surface is a public web endpoint, not a contracted Tucson Trader data API. It is therefore a monitored, replaceable adapter boundary. If unattended use is not acceptable for deployment, replace the provider behind the same contract with a licensed Dow Jones/FactSet/Nasdaq source; do not weaken the model semantics.

### 6.3 DBE

Exact symbol set:

`SPY, ITOT, QQQ, SOXX, VTI, IXF, IWB, NYA, IWV, USFR`

For each symbol, track the rolling 110-observation maximum close. Each state initializes to 1 once enough history exists. When the rolling maximum increases state becomes 1; when it decreases state becomes 0; when unchanged state carries.

Outside presidential override, DBE is Bear only when the fraction of zero states is **greater than 10%**. Exactly 10% remains Bull.

Source audit findings:

- DBE linked-stock history is Refinitiv/LSEG through Microsoft Excel `STOCKHISTORY`;
- `IXF` is the **NASDAQ Financial 100 Index**, resolved natively as Massive `I:IXF`;
- `NYA` is the **NYSE Composite**;
- Massive does not currently return `I:NYA` history.

DBE remains unavailable until an exact NYA source is connected and validated. No substitute index may satisfy NYA.

## 7. Market-data behavior

Use Tucson Trader's Massive layer for exact-covered workbook price instruments. `lib/st-model/workbook-data.ts` owns workbook-specific provider identifiers such as `IXF -> I:IXF` without changing unrelated Tucson Trader symbol semantics.

- fetch at least 600 observations per price source;
- bounded concurrency: five sources at a time;
- while regular market is open, exclude a bar dated today so the model remains completed-daily-bar oriented;
- source failure becomes an empty series and visible health degradation;
- never fill failure with zero, previous close, mock data, or another ticker.

WSJ breadth is fetched separately and cannot answer for any price feed.

## 8. Breadth persistence and automatic collection

Prisma table: `st_breadth_snapshots`.

Stored fields include:

- completed-session date;
- `newHighs` / `newLows`;
- source name;
- source variant;
- source timestamp;
- capture timestamp.

Primary identity is `(date, variant)` so different provider/revision families cannot overwrite or silently combine with one another.

The main `/api/st-model` request opportunistically fetches/upserts the current WSJ snapshot. This is idempotent but is **not** sufficient by itself because Don may not open Tucson Trader every trading day.

`scripts/snapshot-wsj-breadth.mjs` is the standalone collector intended for an after-market Railway cron service. It needs `DATABASE_URL`, no Massive key, and no public domain. Weekends/holidays simply upsert the provider's latest completed session again.

The scheduled service must not be attached to production until the schema/collector branch has passed the repository gate and the PR deployment decision is made.

## 9. Health contract

Health is:

- `current`: all exact/accepted inputs current;
- `degraded`: price data is usable but one or more required source/regime inputs are unavailable or warming;
- `stale`: a populated required price feed lags its peers.

Response exposes:

- `priceDataThrough`
- `breadthDataThrough`
- `breadthMode` (`unavailable`, `legacy-exact`, or `wsj-dow-jones`)
- `staleSymbols[]`
- `unavailableSources[]`
- human-readable provenance/warm-up notes

The UI must not imply the whole model is simply “Live” when degraded.

## 10. Native structure

```text
lib/st-model/
  config.ts
  types.ts
  regimes.ts
  engine.ts
  index.ts
  workbook-data.ts
  wsj-breadth.ts
  breadth-history.ts
  breadth-store.ts
  nhnl-research.ts
  *.test.ts
app/api/st-model/route.ts
app/st-model/page.tsx
components/st-model-table.tsx
prisma/schema.prisma
fixtures/workbook-contract.json
fixtures/nhnl-workbook-samples.json
docs/ST_MODEL_SOURCE_AUDIT.md
scripts/research-nhnl-parity.mjs
scripts/snapshot-wsj-breadth.mjs
e2e/st-model.spec.ts
```

The deterministic signal engine has no React imports, database access, HTTP calls, or implicit current-time dependency. Provider/persistence logic stays outside the calculation engine.

## 11. API

`GET /api/st-model?days=<20..252>`

Default display window is 90 days.

Response contains newest-first display dates, fixed workbook symbol order, deterministic signal rows, `byDate`, health, Tucson response metadata, and methodology identifiers including workbook SHA and DBE/NHNL source state.

No response field is permission to trade.

## 12. UI

Route: `/st-model`

Required surfaces:

- price-data-through date;
- model health;
- market phase;
- Nasdaq breadth source/mode and through-date;
- visible `Gated / warming` status while fewer than nine valid sessions exist;
- human-readable source diagnostics;
- familiar signal table:

`Date | SOXL Std Alt Bull | TQQQ Std Alt Bull | ... | TAN Std Alt Bull | SMA | NH/NL | DBE | PY`

Signal cells expose RSI, fall %, and rise % via tooltip/detail. Unavailable regimes render muted, not as neutral/Bull values.

## 13. Tests and evidence

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
- DBE 110-window initialization/carry and exact `> 10%` Bear boundary;
- workbook-specific IXF provider mapping;
- WSJ response parsing and fail-closed schema handling;
- WSJ timestamp-to-session conversion;
- nine-session contiguous breadth warm-up;
- weekend/holiday non-gap behavior;
- required trading-session gaps force unavailable;
- research NH/NL candidates cannot claim parity without golden-fixture comparison.

Browser smoke tests cover both the breadth warm-up/gated UI and the active `WSJ / Dow Jones` provenance state.

Historical mismatches are classified as implementation defect, source-data difference/revision, repaired workbook defect, unavailable legacy source, or non-comparable workbook corruption/staleness. Non-comparable rows are never counted as successful parity.

## 14. NYA source lane

Candidate order:

1. documented provider with exact NYSE Composite history validated date-for-date against workbook/Refinitiv bars;
2. proof-of-concept Microsoft Graph workbook bridge using delegated Microsoft 365 access and a minimal NYA `STOCKHISTORY` workbook, only if Graph can recalculate and return exact values reliably;
3. direct LSEG/Refinitiv API with an appropriate application entitlement.

No undocumented Microsoft/Bing endpoint and no substitute index may satisfy NYA.

## 15. Release gates

### Core

- TypeScript compiles;
- Vitest ST Model tests pass;
- workbook contract remains hash-bound;
- Prisma client generates with breadth snapshot model.

### API / sources

- missing Massive key returns non-200 for the price model;
- price-source failures surface health, never fabricated values;
- current regular-session daily bar is excluded;
- WSJ malformed/non-200 response fails closed;
- breadth is not active before nine contiguous completed sessions;
- source variant identities cannot be mixed;
- display dates newest-first; calculation arrays oldest-first.

### Scripts

- `node --check scripts/research-nhnl-parity.mjs`;
- `node --check scripts/snapshot-wsj-breadth.mjs`.

### UI

- `/st-model` loads;
- degraded state visible above table;
- breadth source/warm-up visible;
- horizontal scrolling works on small screens;
- no Bull shown while a required regime is unavailable;
- back navigation works.

### Regression

- baseline lint setup state reported explicitly;
- `npm run test:run`;
- `npm run build`;
- ST Model Playwright smoke.

## 16. Rollout

1. **Observation only:** ship beside the existing Tucson dashboard; no alerts or execution.
2. **Breadth collection:** run the WSJ snapshot collector after market close and observe source stability/provenance.
3. **NH/NL readiness:** activate the regime only when the same-variant contiguous-session gate is satisfied.
4. **DBE parity:** resolve exact NYA history; until then DBE and therefore Bull remain gated.
5. **Parity confidence:** compare active dates with Don's workbook interpretation/source records.
6. **Explanation:** connect deterministic outputs to AI and chart/drill surfaces.
7. **Workflow changes:** only after Don explains whether Std/Alt/Bull mean entry, ranking, timing, sizing context, or something else.

## 17. Definition of done for first PR

- SDD, source audit, and workbook evidence fixtures committed;
- deterministic TypeScript engine committed;
- signal/regime/source boundary tests committed;
- `/api/st-model` computes exact-covered price sources and fail-closed source health;
- `/st-model` renders workbook-style signals and provenance;
- workbook IXF semantics repaired to `I:IXF`;
- Massive NH/NL reconstruction rejected with recorded evidence;
- WSJ/Dow Jones source family identified and live adapter implemented behind persistence/contiguity gates;
- standalone breadth collector implemented and syntax-gated;
- real repo unit/build/browser results recorded in PR;
- no trading automation or strategy optimization introduced;
- unresolved NYA/DBE provider coverage disclosed rather than substituted.
