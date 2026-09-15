# ST Swing Research

This directory is an isolated, research-only falsification study of the independently reproducible **Std** signal in Don Kahl's ST Model.

It does **not** change production ST Model formulas, thresholds, Bull logic, application behavior, trading logic, or deployment state.

## Verdict

**B — RESEARCH-VALID / NOT READY**

The historical evidence supports a real post-Std rebound effect that is materially larger than ordinary same-ticker drift and survives correlation-aware resampling, transaction-cost stress, and modest exit/stop perturbation. It does **not** yet justify prospective paper-trading status because performance is regime-uneven, clustered by signal date, concentrated in a modest number of crash/rebound episodes, and 2023-2026 is only a pseudo-holdout.

See [`results.md`](./results.md) for the executive findings and [`methodology.md`](./methodology.md) for the exact research contract.

## Production source reviewed

Research snapshot: `main@c0b6cfba82f2f77a5f50bf27e1800524ae62d2b6`

Source-of-truth files read before analysis:

- `lib/st-model/config.ts`
- `lib/st-model/engine.ts`
- `lib/st-model/regimes.ts`
- `lib/st-model/types.ts`
- `fixtures/workbook-contract.json`
- `docs/ST_MODEL_SDD.md`
- `docs/ST_MODEL_SOURCE_AUDIT.md`

No conventional indicator definition is substituted for the workbook formulas.

## Primary reference candidate studied

This is a **research reference**, not an approved live or paper-trading recommendation.

- Universe: SOXL, TQQQ, FNGG, TECL, TNA, MSTR, TAN.
- Trigger: first session of a new Std B/EB episode.
- Entry: next regular-session open.
- ATR14: simple mean of 14 completed daily True Range observations known at signal close; a full 14-session warm-up is required.
- Initial stop: entry minus `2.0 * ATR14`.
- Exit: close of the fifth trading session, counting the entry session as day 1, unless stopped earlier.
- No target, trailing stop, discretionary confirmation, or EB size change.
- Same-symbol entries are suppressed while an earlier accepted position remains active.

## Reproduce

The analysis script uses the same repository credential convention as the existing Massive/Polygon integration:

```bash
MASSIVE_API_KEY=... node research/st-swing/analyze.mjs
```

`POLYGON_API_KEY` is accepted as the existing compatibility fallback. Optional environment variables:

```bash
ST_SWING_AS_OF=2026-09-15
ST_SWING_FROM=2000-01-01
POLYGON_BASE_URL=https://api.polygon.io
```

The script fetches adjusted daily aggregate bars directly from Massive/Polygon, validates them, rebuilds Std episodes, runs the predefined falsification grid, and rewrites the generated research outputs below.

## Generated outputs

- `event_ledger.csv` — every completed Std episode with signal metrics, entry, ATR, exit, MFE/MAE and 1.5/2 ATR outcomes.
- `walk_forward.csv` — frozen-rule validation windows.
- `ticker_breakdown.csv` — candidate results by ticker.
- `era_breakdown.csv` — candidate results by broad era.
- `parameter_sensitivity.csv` — the predefined 3-entry × 4-hold × 6-stop grid, with same-symbol overlap suppression performed per cell.
- `portfolio_results.csv` — capital-constrained equal-notional and normalized fixed-risk illustrations.
- `regime_breakdown.csv` — descriptive B/EB, Presidential Cycle and SMA regimes.
- `cost_sensitivity.csv` — 5/10/20 bps-per-side execution-friction stress.
- `research_output.json` — machine-readable audit summary including data ranges, bootstrap intervals and random-date baselines.

The CSV/JSON files are generated artifacts. `analyze.mjs`, `methodology.md`, and `results.md` are the durable research definition and interpretation.

## Important corrections to the prior exploratory analysis

The exploratory headline numbers are reproducible, but only after reconstructing undocumented conventions:

1. The claimed 269 completed events / 185 dates starts the study globally on `2008-01-01`. Full available Massive history contains three additional valid MSTR episodes from 2004 and 2007, producing 272 completed episodes / 188 dates.
2. The claimed ATR stop table allows an earliest TNA trade before 14 True Range observations exist. The corrected study requires a full 14-session ATR warm-up.
3. The claimed confirmation-entry comparison gives confirmed trades an extra holding session. The corrected grid counts the confirmation-entry session as day 1, just as the next-open baseline counts its entry session as day 1.
4. Raw episode counts can contain same-symbol position overlap. The executable research simulation suppresses a new same-symbol entry while an earlier accepted position remains active.

These corrections are applied to the research verdict rather than tuning the code to preserve the earlier headline.

## Boundaries

- Historical research only.
- No production code modifications.
- No deployment.
- No merge implied by this branch.
- No options translation at this stage.
- No recommendation of personal account-risk percentage.
- No new filters are created from whichever ticker, Presidential Cycle state, SMA state, or EB/B subgroup happened to look best historically.
