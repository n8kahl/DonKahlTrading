# ST Swing Falsification Results

**As of:** 2026-09-15  
**Production source reviewed:** `main@c0b6cfba82f2f77a5f50bf27e1800524ae62d2b6`  
**Research-only branch:** `research/st-swing-falsification-2026-09-15`

## 1. Verdict

# B — RESEARCH-VALID / NOT READY

There is credible historical evidence of a post-Std rebound effect. The effect is larger than ordinary leveraged-ETF drift, is not confined to one hold/stop cell, survives signal-date clustering and block resampling, remains positive under substantial friction stress, and persists into the 2023-2026 pseudo-holdout.

It does **not** yet clear the standard for forward paper validation. The largest reasons are:

- the effective evidence set is roughly 149 correlated signal dates, not more than 200 independent trades;
- the frozen 2 ATR rule has a negative 2017-2019 walk-forward window;
- a material share of the historical gain comes from a limited number of crash/rebound dates and strong years;
- 2023-2026 was already viewed before this audit and is not a pristine holdout;
- the prior exploratory work contained an undocumented 2008 start-date cutoff, partial ATR warm-up, and unequal confirmation holding horizon;
- daily bars cannot fully prove open-auction fill quality, intraday execution sequence, or mark-to-market drawdown.

The correct next state is **forward-only shadow observation with frozen research definitions**, not production trading and not an options translation.

---

## 2. What was independently reproduced

Using full adjusted Massive daily history and the exact repository Std implementation:

| Statistic | Prior exploratory claim | Independent reconstruction |
| --- | ---: | ---: |
| Completed Std episodes | 269 | **272 full-history** |
| Unique signal dates | 185 | **188 full-history** |
| Mean 5-session next-open return | +2.81% | **+2.77%** |
| Positive events | 58.4% | **58.46%** |
| Worst event | about -41.8% | **-41.81%** |
| Maximum simultaneous symbols | 6 | **6** |

The claimed **269 / 185 / +2.81% / 58.4%** is reproduced when the history is truncated globally to `2008-01-01`. That removes three valid MSTR episodes from 2004 and 2007. Because Massive has valid adjusted MSTR history beginning 2003-09-10, the corrected full-history study does not silently discard them.

YINN also reproduces exactly:

- through 2022: **36 events, -0.89% mean, 41.7% positive**;
- 2023-2026: **16 events, -2.32% mean, 50.0% positive**.

That means YINN's historical weakness was observable before the later pseudo-holdout rather than being invented solely from 2023-2026 performance. No other symbol is removed after seeing full-history results.

---

## 3. Corrections to the prior exploration

### Undocumented 2008 cutoff

The prior headline excludes three legitimate pre-2008 MSTR episodes. The corrected study uses every available ticker's own valid history rather than one arbitrary global start date.

### ATR14 warm-up

The prior stop table can be reproduced almost digit-for-digit only if the earliest TNA event is allowed to use fewer than 14 completed True Range observations. The corrected research definition requires a **full 14-session ATR** known at signal close.

### Confirmation horizon mismatch

The claimed next-day-close confirmation result of 148 events / +1.94% / 61.5% is reproduced only when the confirmed trade receives one extra session: entry at the `t+1` close and exit at the `t+6` close.

The corrected grid counts the entry session as day 1 for every entry method. Under like-for-like holding periods, confirmation remains positive historically but is weaker than next-open entry.

### Same-symbol overlap

The raw five-session episode ledger contains scheduled-window same-symbol overlaps. Under the primary 2 ATR path, most of those older positions have already stopped before the later signal enters. Two entries still overlap and are suppressed conservatively:

- TECL signal on 2016-02-11;
- MSTR signal on 2023-03-09.

A same-day prior exit/new entry is treated as overlap because daily OHLC cannot safely establish an executable intraday ordering.

---

## 4. Reference candidate tested

This remains a **research reference candidate**, not an approved trading rule.

**WHEN**  
A new Std B/EB episode appears in SOXL, TQQQ, FNGG, TECL, TNA, MSTR, or TAN using the exact production ST formulas.

**ENTER**  
At the next regular-session open.

**INITIAL STOP**  
`entry price - 2.0 × ATR14`, where ATR14 is the simple average of 14 completed daily True Range observations available at the signal close.

**EXIT**  
At the close of session 5, counting the entry session as session 1, unless the initial stop exits earlier.

**NO ADDITIONAL RULES**  
No profit target, trailing stop, confirmation filter, discretionary regime filter, or extra EB size. A new same-symbol entry is skipped while an accepted older position remains active.

---

## 5. Corrected primary-candidate evidence

After requiring full ATR warm-up and suppressing active same-symbol overlap:

| Metric | Result |
| --- | ---: |
| Executable events | **217** |
| Distinct signal-date baskets | **149** |
| Mean event return | **+3.09%** |
| Median event return | **+3.26%** |
| Positive events | **59.9%** |
| Average winning event | **+11.19%** |
| Average losing event | **-9.12%** |
| Payoff ratio | **1.23** |
| Profit factor | **1.86** |
| Average MFE | **+11.02%** |
| Average MAE | **-8.77%** |
| 5th percentile event | **-15.84%** |
| Worst modeled event | **-20.86%** |
| 5% CVaR / expected shortfall | **-18.38%** |
| Stop-out rate | **16.1%** |
| Stops gapped through | **6** |
| Mean gap slippage below intended stop | **-0.99%** |
| Worst gap slippage below intended stop | **-3.62%** |

The 2 ATR stop materially changes the tail. The comparable no-stop history contains a **-41.81%** event. The stop therefore appears to add genuine risk-shaping value rather than merely clipping winners, although it does not eliminate overnight gap risk.

---

## 6. Correlation / clustering adjustment

The leveraged products frequently fire together. Treating each ticker as independent overstates the evidence.

After active same-symbol overlap suppression, the primary candidate compresses to **149 signal-date baskets**. On that basis:

- mean equal-weight basket return: **+2.14%**;
- median basket return: **+2.27%**;
- positive baskets: **57.1%**;
- worst basket: **-20.86%**;
- 5% basket CVaR: **-18.64%**;
- maximum consecutive losing signal dates: **6**;
- average names per signal date: **1.46**;
- maximum names on one signal date: **6**.

This signal-date result, not the 217-trade count, is the more appropriate unit for inferential claims.

### Bootstrap

Resampling signal dates rather than trades:

- ordinary signal-date bootstrap: the 95% interval for mean expectancy is roughly **+0.14% to +4.26%**;
- circular five-signal-date block bootstrap: roughly **+0.10% to +4.14%**.

Both stay above zero in the ordinary historical resampling exercise. That supports an underlying effect, but it is not a conventional independent-trade p-value and it does not erase strategy-selection or multiple-comparison risk.

---

## 7. Parameter sensitivity

The predefined grid is broad enough to falsify a one-cell optimum without inviting a large parameter search.

The main conclusions are stable:

- **5 sessions is not uniquely magical.** Next-open 3-, 5-, 7- and 10-session no-stop histories are all positive. Five sessions has the strongest raw mean in this grid, but 7 sessions remains materially positive.
- **Fixed 5/8/10% stops are consistently damaging.** They stop out too many leveraged-ETF rebounds and sharply reduce expectancy.
- **1.5 ATR and 2 ATR form a broad region, not a razor-thin optimum.** Both preserve substantially more expectancy than fixed stops while controlling the left tail better than no stop.
- **Next-open entry is stronger than confirmation under equal holding conventions.** The earlier confirmation comparison looked better partly because the confirmed trades were given an extra holding session.

Because the study examines 72 predefined cells, the best-looking cell is not treated as a newly discovered optimum. The predeclared 2 ATR / 5-session rule remains the reference only because it was specified before this falsification pass.

---

## 8. Walk-forward / pseudo-out-of-sample evidence

The frozen rule is not uniformly positive across time.

Most importantly, the **2017-2019 signal-date validation window is negative, about -2.63% per signal-date basket**. This is direct evidence against a claim that the rule is regime-invariant.

The 2020-2022 period is strongly positive, and 2023-2026 remains positive in the historical reconstruction. However, 2023-2026 was already viewed in prior exploratory work, so it is a **pseudo-holdout**, not untouched out-of-sample evidence.

This negative middle walk-forward window is a primary reason the setup remains **NOT READY** despite a positive full-history average.

---

## 9. Baselines: is this just leveraged-ETF drift?

No-stop Std episodes were compared with ordinary five-session returns on the same tickers.

The unconditional five-session drift is much smaller. Across the included symbols, ordinary same-ticker returns are generally around a fraction of one percent to roughly one percent, while the Std-episode mean is several percent.

Repeated randomization strengthens that result:

- 1,000 ticker-matched random date sets averaged about **+0.75%** versus about **+3.74%** on the raw signal set; only about **2%** of random draws met or exceeded the signal mean.
- Matching ticker **and broad calendar period** produced an average random return of about **+0.59%**, again with about **2%** of draws meeting or exceeding the signal mean.

These percentages are **not** presented as formal independent-trade p-values. Their purpose is narrower: the observed rebound is difficult to explain purely as generic positive drift or high volatility in leveraged products.

---

## 10. Costs and executability

The historical effect is large enough that reasonable friction assumptions do not erase it.

For the corrected signal-date mean of +2.14%, applying symmetric friction to entry and exit leaves approximately:

| Friction | Cost-adjusted mean signal-date basket |
| --- | ---: |
| 5 bps / side | **+2.04%** |
| 10 bps / side | **+1.94%** |
| 20 bps / side | **+1.74%** |

This does **not** prove that every next-open fill is obtainable at the official daily open. It shows that ordinary transaction friction alone is not large enough to explain the historical edge.

The more important execution risk is discontinuity: six historical 2 ATR stops gap through the intended level, and the worst modeled gap is about **3.62% below the stop itself**. The stop must never be described as a guaranteed maximum loss.

---

## 11. Portfolio / capital overlap

A realistic portfolio cannot count six same-day ETF signals as six independent uses of the same capital.

The research runner therefore includes two deliberately simple, non-optimized portfolio illustrations:

1. equal notional, with each signal-date cohort capped at 20% notional and split among that date's names;
2. normalized fixed risk, with the signal-date risk unit split across names and notional scaled so modeled peak gross exposure is 100%.

The historical diagnostics show:

- up to **6 simultaneous positions**;
- five-session cohorts can overlap across dates, so portfolio gross exposure can be several times the single-cohort allocation;
- capital-constrained results remain positive historically, but realized drawdown is materially larger than the single-trade averages suggest;
- the equal-notional diagnostic reached roughly **-14 percentage points** of realized-exit drawdown before final overlap cleanup.

`portfolio_results.csv`, generated by `analyze.mjs`, is the authoritative reproducible portfolio table. Its drawdown is explicitly **realized-at-exit drawdown**, not daily mark-to-market drawdown; intratrade portfolio drawdown can be worse.

---

## 12. Concentration and what could make the result false

The edge is not evenly distributed.

The ten strongest signal-date baskets account for a large share of net historical gains. The strongest include crash/rebound dates in 2008-2009, 2010, 2022 and 2024. In the equal-notional diagnostic, SOXL is the single largest contributor, and 2022/2024 contribute disproportionately.

This does not automatically invalidate the system—large rebounds are exactly the economic phenomenon the signal is intended to identify—but it means the hypothesis is vulnerable to a future world in which leveraged-ETF crash rebounds are slower, structurally different, or less recoverable within five sessions.

Evidence that would materially weaken or invalidate the reference hypothesis going forward includes:

- a sustained forward signal-date expectancy at or below zero after execution costs;
- repeated loss clusters materially worse than the historical six-date losing streak;
- gap losses materially beyond the historical tail often enough to erase the stop's risk benefit;
- forward performance converging toward ticker/calendar-matched random baselines;
- one or more material signal-reconstruction discrepancies between contemporaneous logs and the production ST engine;
- dependence on changing the frozen RSI, pctFall, universe, entry, ATR convention, hold, or stop rule after observing forward outcomes.

---

## 13. B vs EB and descriptive regimes

EB is too small a sample to justify a separate rule. In the pre-overlap diagnostic there are only **11 EB events**, and EB does not outperform ordinary B strongly enough to support additional size.

Presidential Cycle and VOO SMA stratifications also show historical differences, but they remain **descriptive only**. In particular, some supposedly favorable-looking subgroups are not the obvious ones. No new regime filter is created from those results.

---

## 14. Forward-only shadow plan

Because the verdict is B rather than C, this is a **research shadow-validation gate**, not an instruction to paper trade capital.

For every new Std episode, record contemporaneously:

- signal timestamp/date;
- ticker and B/EB type;
- workbook RSI, pctFall/pctRise and PY state;
- source-data snapshot/hash when practical;
- intended next-open entry;
- observed next open;
- 14-session ATR available at signal close;
- intended 2 ATR stop;
- intended session-5 exit date;
- observable stop/exit outcome;
- data, fill, market-holiday, corporate-action, or execution deviations;
- whether the signal was suppressed because the same symbol already had an active reference position.

Do **not** backfill a missed signal after subsequent price action is known.

### Minimum gate before reconsidering readiness

Require at least **40 new independent signal dates and 12 calendar months, whichever takes longer**, with the rule and data semantics frozen in advance. The sample should include more than one volatility regime and at least one multi-signal cluster; a merely favorable handful of trades is insufficient.

At that point, re-run the same signal-date and portfolio tests without changing the rule. A small forward sample may be directionally informative but must not be described as statistically conclusive.

---

## 15. Options translation

**Do not proceed yet.**

The underlying setup did not reach `READY FOR FORWARD PAPER VALIDATION`, so translating the signal into historical calls or debit spreads would add another layer of strike/DTE/IV/spread choices before the underlying hypothesis has earned that complexity.

If the frozen underlying reference survives the forward-only shadow gate, options research can then be performed separately with actual historical NBBO where available and with the underlying signal held fixed.

---

## Bottom line

The adversarial pass did **not** break the core historical idea. Std episodes are followed by unusually strong rebound returns relative to ordinary dates, and a broad ATR stop region appears capable of reducing catastrophic tails without destroying the effect.

It **did** break the stronger interpretation that the existing backtest was ready to trust operationally. Once the undocumented cutoff, ATR warm-up, confirmation horizon, signal clustering, same-symbol overlap and walk-forward weakness are handled honestly, the evidence is promising but not yet prospective.

**Current state: keep the reference candidate frozen for research logging; do not promote it to Dad's production trading logic, paper execution, or options strategy yet.**
