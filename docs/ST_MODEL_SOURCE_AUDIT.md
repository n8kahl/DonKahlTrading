# ST Model source audit

**Audit date:** 2026-09-15  
**Reference workbook:** `ST_Model (9).xlsx`  
**Workbook SHA-256:** `088936d378790ad8633313fb35b1bda36253bbc3e8f0389da8bb50f0150fd27d`

## Purpose

Record what the workbook actually uses as market-data inputs so Tucson Trader can preserve instrument and calculation semantics without silently substituting unrelated data.

## DBE

The DBE source cells are Excel linked Stocks data types and the DBE history is retrieved with `STOCKHISTORY`. The workbook's embedded rich-data metadata identifies the finance data as **Powered by Refinitiv**.

The decoded DBE instrument set is:

| Workbook role | Native identifier |
|---|---|
| SPY | SPY |
| NYA | NYSE Composite (`NYA`) |
| NSDQ | QQQ |
| SOXX | SOXX |
| W5000 | VTI |
| NasFin | NASDAQ Financial 100 Index (`IXF`) |
| R1k | IWB |
| NYSE | NYA / NYSE Composite input used by workbook wiring |
| R3k | IWV |
| 13wkTbil | USFR |

The workbook rich-data snapshot identifies `NYA` as **NYSE COMPOSITE** and `IXF` as **NASDAQ Financial 100 Index**. Massive historical aggregates were independently verified to work for `I:IXF`; `I:NYA` did not return historical bars in the provider checks performed for this implementation.

### Runtime decision

- Preserve the same workbook instruments.
- Use Tucson Trader's licensed Massive layer when the exact instrument is available.
- Resolve workbook `IXF` explicitly to Massive `I:IXF`.
- Do **not** use Microsoft's undocumented Bing/Excel refresh URLs as an application API.
- Do **not** substitute another NYSE index for NYA.
- Until an exact NYA history source is available, DBE remains fail-closed / unavailable.

Using Refinitiv itself outside Excel would require a direct LSEG/Refinitiv entitlement/API; the workbook's Microsoft-linked-data entitlement is not a general-purpose application API credential.

A candidate exact-source bridge exists through Microsoft Graph: workbook APIs can calculate `.xlsx` files stored in supported OneDrive/SharePoint business storage and read resulting ranges under delegated user authorization. This could potentially allow a tiny Excel workbook containing the NYA `STOCKHISTORY` formula to act as a Refinitiv-backed bridge using an existing Microsoft 365 entitlement. It is **not accepted yet**: the implementation must first prove that `STOCKHISTORY` recalculates successfully through Graph, that the resulting NYA bars match the workbook values, and that delegated-token operation is acceptable for Tucson Trader. No Graph bridge is currently in the production path.

A documented third-party index API is also acceptable only after exact-date validation against Refinitiv/workbook NYA values. The presence of a `NYA` symbol at another vendor is not sufficient by itself.

## Nasdaq New Highs / New Lows

The workbook does **not** contain a live connection for `NHNL!B:C`.

- Column B is Nasdaq new highs.
- Column C is Nasdaq new lows.
- The values are static/pasted workbook values.
- There are no workbook external links or query connections supplying B:C.
- The last populated source row is labelled **2024-02-15** (`230` new highs, `64` new lows).
- Later dated rows exist but the NH/NL source cells are blank.

The formulas consume the raw counts as:

`x[t] = newHighs[t] - newLows[t]`

and use the nine-session weighted average `(9*x[t] + ... + 1*x[t-8]) / 45`, with Bear below `-12`, Bull above `0`, and otherwise prior-state carry.

## Massive reconstruction result — rejected for parity

`fixtures/nhnl-workbook-samples.json` banks ten known workbook rows from 2024-02-02 through 2024-02-15 as a golden evidence set.

The reproducible `npm run research:nhnl` runner was executed in an isolated Railway service using the existing Massive entitlement. The run used:

- **3,302** active XNAS common stocks at 2024-02-15;
- **3,300** symbols with usable grouped history;
- **305** trading sessions from 2022-11-29 through 2024-02-15.

Four candidate definitions were tested. None reproduced a single golden row exactly:

| Candidate | Exact rows | Total absolute count delta |
|---|---:|---:|
| 252-session close, partial history allowed | 0 / 10 | 733 |
| 252-session intraday high/low, partial history allowed | 0 / 10 | 1058 |
| 252-session close, require 252 observations | 0 / 10 | 1187 |
| 252-session intraday high/low, require 252 observations | 0 / 10 | 1423 |

Therefore a home-grown full-Nasdaq Massive calculation is **not** accepted as the legacy NH/NL source. The research code remains non-production evidence tooling.

## Source identification — WSJ / Dow Jones Market Data

Historical source fingerprinting found multiple exact matches between the workbook's pasted counts and the **Wall Street Journal / Dow Jones Market Data** Nasdaq Market Diary numbers. Examples include:

- workbook `2024-02-05`: **91 new highs / 212 new lows** — exact match to the following WSJ Market Digest for that completed session;
- workbook `2024-02-07`: **237 / 147** — exact match to the following WSJ Market Digest;
- workbook tail value **230 / 64** also appears in the WSJ/Dow Jones series, although the workbook's final manually pasted date appears potentially one session misaligned.

This is stronger evidence than the rejected constituent reconstruction: the workbook was manually maintained, so labels/dates at the tail are not treated as more authoritative than the source-value fingerprint itself.

The currently reachable WSJ Market Diary web JSON endpoint is:

`https://www.wsj.com/market-data/stocks/marketsdiary?id={"application":"WSJ","marketsDiaryType":"diaries"}&type=mdc_marketsdiary`

A clean GitHub-hosted probe on 2026-09-15 returned HTTP 200 JSON without credentials and identified:

- exchange: `NASDAQ`
- latest new highs: **72**
- latest new lows: **402**
- source timestamp: **Monday, September 14, 2026**

The response also carries `previousClose` and `weekAgo`, but those values are **not used to seed production history**. Cross-checks showed that revision/snapshot semantics can differ from separately published Dow Jones final-market-diary values. Mixing those variants would defeat the parity objective.

Historical query experiments (`date=` in several formats, past-calendar-style parameters, and a date inside the endpoint's `id` object) were also tested from a clean runner. Every variant returned the same current snapshot. The web JSON route therefore does not provide an accepted historical backfill mechanism.

### Runtime decision for WSJ breadth

The draft implementation now contains a fail-closed adapter for the current WSJ/Dow Jones Nasdaq Market Diary snapshot and a persistent snapshot table keyed by **date + source variant**.

Rules:

1. persist only the live endpoint's `latestClose` high/low pair for its own source timestamp;
2. never seed history from `previousClose`, `weekAgo`, Massive reconstruction, ETF proxy breadth, or a differently revised Dow Jones series;
3. require **nine contiguous completed market sessions** from the same source variant before the NH/NL regime can become available;
4. a missing trading-session snapshot breaks the contiguous suffix and forces warm-up again;
5. align the breadth through-date to the completed QQQ trading calendar before computing the regime;
6. malformed, unavailable, stale, or gapped source data fails closed and keeps Bull gated.

The UI/API reports the current breadth through-date, source mode, warm-up progress, and missing sessions.

### Operational caveat

The WSJ JSON route is a public web data endpoint, not a contracted Tucson Trader API entitlement. The draft branch therefore treats it as an externally controlled dependency with schema validation, timeouts, persistence, provenance, and fail-closed behavior. It should remain monitored and replaceable. If unattended application use cannot be accepted for the intended deployment, the same adapter boundary must be backed by a licensed Dow Jones/FactSet/Nasdaq source rather than weakening the data contract.

## Automatic collection

`scripts/snapshot-wsj-breadth.mjs` is a standalone after-market collector. It fetches the current WSJ Nasdaq Market Diary pair and upserts one row into `st_breadth_snapshots` using the explicit `wsj-market-diary-live-v1` variant.

The intended deployment is a no-domain Railway scheduled service that shares only the database connection needed for persistence. It does not need the Massive key. The main `/api/st-model` route also opportunistically upserts the current source snapshot when called, so the scheduled collector and normal app traffic are idempotent backups for one another.

The scheduled collector is not to be pointed at Dad's production service until this draft PR's database/schema path has passed CI and the deployment plan is reviewed.

## Source hierarchy for native ST Model

1. Same instrument/metric and same calculation semantics as the workbook.
2. Explicit source and variant identity; never mix revision families silently.
3. Prefer licensed/documented provider APIs suitable for unattended use.
4. If a public web source is used during parity/observation work, validate schema, persist provenance, monitor it, and fail closed on drift.
5. Missing exact data fails closed.
6. No silent proxy substitution.
