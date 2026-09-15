# ST Swing Falsification Methodology

**Research snapshot:** 2026-09-15  
**Production source reviewed:** `main@c0b6cfba82f2f77a5f50bf27e1800524ae62d2b6`  
**Research branch:** `research/st-swing-falsification-2026-09-15`

## Purpose

This is an adversarial research exercise. The objective is to determine whether the independently reproducible **Std** signal in Don Kahl's ST Model supports an economically meaningful, executable swing setup after attempts to falsify it. It is not an attempt to prove the model works, and it does not modify Dad's production model.

No production formula, threshold, UI, trading rule, deployment, or Bull input is changed by this research.

## Repository source of truth

The research was grounded in the production implementation and contract files, not generic indicator definitions:

- `lib/st-model/config.ts`
- `lib/st-model/engine.ts`
- `lib/st-model/regimes.ts`
- `lib/st-model/types.ts`
- `fixtures/workbook-contract.json`
- `docs/ST_MODEL_SDD.md`
- `docs/ST_MODEL_SOURCE_AUDIT.md`

The production semantics used are:

- Workbook RSI uses exactly five close-to-close changes: current change plus the preceding four changes. It is **not Wilder RSI**.
- `pctRise = low_t / min(low[t-10..t]) - 1`.
- `pctFall = low_t / max(high[t-10..t]) - 1`.
- Std fires only when `pctFall < -20%` and workbook RSI `< 5`.
- SOXL, TQQQ and FNGG are eligible for EB only when Std is already true, RSI is exactly zero, and Presidential Impact is `PY_Thrust`; otherwise the Std signal is B.
- TECL, TNA, MSTR, YINN and TAN do not produce EB.
- FNGG's alternate `-13%` threshold is **Alt-only** and is not used for Std.
- Bull is excluded from this study because its legacy source fidelity remains gated.

## Market data

Provider: Massive/Polygon daily aggregates.  
Endpoint: `/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}`.  
Parameters: `adjusted=true`, `sort=asc`, `limit=50000`.

Research universe:

| Ticker | First Massive adjusted daily bar | Rows through 2026-09-15 |
| --- | --- | ---: |
| MSTR | 2003-09-10 | 5,790 |
| TAN | 2008-04-15 | 4,634 |
| TNA | 2008-11-05 | 4,491 |
| TQQQ | 2010-02-11 | 4,173 |
| SOXL | 2010-03-11 | 4,154 |
| YINN | 2011-06-15 | 3,835 |
| TECL | 2012-06-29 | 3,572 |
| FNGG | 2021-09-30 | 1,244 |

SPY was used only as a trading-calendar/exposure calendar check. VOO was used only for descriptive SMA-regime stratification.

### Data quality gate

For all eight research symbols:

- zero duplicate daily timestamps;
- zero null OHLC fields;
- zero malformed OHLC bars;
- zero missing Massive sessions relative to SPY after the ticker's own first available date.

Dates are normalized from Massive timestamps to UTC calendar dates. No synthetic bars are inserted.

## Episode definition

A **new Std episode** is the first B/EB day after the immediately preceding session has no Std signal. Consecutive signal days form one episode.

The full-history reconstruction produces **272 completed episodes on 188 distinct signal dates**. The prior exploratory headline of 269 episodes / 185 dates is reproduced exactly only after imposing an unstated `2008-01-01` global start date, which removes three valid MSTR episodes from 2004 and 2007. The full-history study does not use that arbitrary truncation.

## Baseline execution

For a signal on completed daily bar `t`:

- entry is the regular-session open on `t+1`;
- a 5-session hold exits at the close of `t+5`;
- the entry session is session 1;
- no lookahead is used.

The corrected confirmation variants use the same hold convention. A confirmation entry at a session close counts that session as day 1, so a 5-session confirmation trade exits four sessions later. A stop cannot use the entry session's prior intraday low when the entry occurs at that session's close.

## ATR research convention

ATR is **not** a production ST signal input, and the repository does not define a production ATR convention for this swing study. For this research, `ATR14` is defined as the simple mean of 14 completed daily True Range observations known at the signal close:

`TR = max(high-low, abs(high-prevClose), abs(low-prevClose))`

A full 14-observation warm-up is required. No entry-day completed range is used.

This convention is documented because it exposed a prior exploratory defect: the published ATR stop table can be reproduced nearly digit-for-digit only when the calculation is allowed to warm up on fewer than 14 observations for the earliest TNA event. The corrected study marks ATR unavailable until all 14 observations exist.

## Stop execution from daily OHLC

For an intended stop price:

1. if session open is at or below the stop, exit at the session open;
2. otherwise, if session low is at or below the stop, exit at the stop;
3. otherwise remain in the position.

This explicitly models overnight gap-through-stop risk. Daily OHLC cannot determine intraday sequence beyond those conservative rules.

## Primary research candidate

The predeclared candidate being challenged is:

- universe: SOXL, TQQQ, FNGG, TECL, TNA, MSTR, TAN;
- YINN excluded only because its weakness was already observable through 2022;
- trigger: first day of a new Std B/EB episode;
- entry: next regular-session open;
- initial stop: entry minus `2.0 * ATR14` known at signal close;
- exit: close of session 5 unless stopped earlier;
- no target, trailing stop, confirmation, discretionary filter, or EB size change.

A same-symbol entry is suppressed while an earlier accepted position in that symbol remains open. An entry on the same date an older position exits is treated conservatively as overlapping and is suppressed because open-vs-intraday sequencing is not safely known from daily OHLC.

## Predefined sensitivity grid

Only this grid is generated by `analyze.mjs`:

- Entry: next open; next-day close if that close exceeds signal-day close; first such close within 3 sessions.
- Hold: 3, 5, 7, 10 sessions.
- Stop: none; fixed 5%; fixed 8%; fixed 10%; ATR 1.5; ATR 2.0.

For every one of the 72 cells, same-symbol overlap is suppressed using that cell's actual modeled exit. No RSI, pctFall, ticker-specific, or micro-parameter optimization is performed.

The grid is treated as a multiple-comparison sensitivity exercise, not as 72 independent opportunities to discover a winner. The predeclared 5-session / 2 ATR candidate is evaluated separately from any apparent best cell.

## Dependence and inference

The leveraged products cluster heavily on the same dates. Trade count is therefore not treated as independent sample size.

Results are reported at:

1. event/trade level; and
2. signal-date level, where all names firing on the same date are one equal-weight basket.

Confidence intervals are generated by resampling **signal dates**, not individual trades. The runner produces both ordinary signal-date bootstrap and circular 5-date block bootstrap results with fixed seeds for reproducibility.

## Baselines

The signal is compared with:

- unconditional same-ticker 5-session returns;
- repeated random dates matched by ticker;
- repeated random dates matched by ticker plus broad calendar period.

The repeated randomization is intended as a drift/high-volatility baseline, not a conventional independent-trade p-value.

## Costs and gap risk

The executable candidate is stressed at round-trip friction equivalent to:

- 5 bps per side;
- 10 bps per side;
- 20 bps per side.

Net return is calculated as `(exit * (1-friction)) / (entry * (1+friction)) - 1`.

Stop gap-through frequency and slippage below the intended stop are reported separately. These tests do not claim to reconstruct open-auction queue position or intraday bid/ask spreads from daily OHLC.

## Portfolio illustrations

No personal risk percentage is selected.

Two normalized illustrations are generated:

1. **Equal notional:** each signal-date cohort receives at most 20% portfolio notional, split equally among names firing that date.
2. **Fixed risk:** each cohort begins with 0.20 normalized risk units split equally; notional is inverse to initial stop distance, then the entire series is scaled so peak modeled gross notional is 100%.

The 20% cohort cap is a deliberately simple, non-optimized way to prevent five-session cohorts from magically reusing the same capital. Reported drawdown is realized-at-exit drawdown; daily mark-to-market drawdown can be worse and is not inferred from exit-only accounting.

## Walk-forward structure

Rules are never changed from validation-fold performance.

- Train/history through 2013; validation 2014-2016.
- Train/history through 2016; validation 2017-2019.
- Train/history through 2019; validation 2020-2022.
- Train/history through 2022; validation 2023-2026.

The last window is explicitly a **pseudo-holdout**, because 2023-2026 results were already viewed in prior exploration.

## Descriptive-only stratifications

Std B vs EB, Presidential Cycle state, and VOO SMA state are descriptive analyses only. No better-looking bucket is promoted into a new filter without fresh prospective evidence.

## Known limitations

- The study uses adjusted daily bars, not intraday NBBO/open-auction executions.
- Daily OHLC can model gap-through stops but cannot reconstruct all intraday ordering.
- 2023-2026 is not pristine out-of-sample evidence.
- The strategy family and YINN question were already explored before this audit, creating research-selection risk.
- VOO history begins later than MSTR/TAN/TNA, so early SMA state is unavailable rather than backfilled.
- Realized-exit portfolio drawdown is not a substitute for daily mark-to-market drawdown.
- Options translation is intentionally not performed unless the underlying setup first clears the forward-validation gate.
