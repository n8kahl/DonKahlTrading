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

## Nasdaq New Highs / New Lows

The workbook does **not** contain a live connection for `NHNL!B:C`.

- Column B is Nasdaq new highs.
- Column C is Nasdaq new lows.
- The values are static/pasted workbook values.
- There are no workbook external links or query connections supplying B:C.
- The last populated source row is **2024-02-15** (`230` new highs, `64` new lows).
- Later dated rows exist but the NH/NL source cells are blank.

Therefore there is no live spreadsheet datasource to mirror for NH/NL. The correct problem is to identify or reconstruct the original breadth methodology and prove it against historical workbook values.

## NH/NL reconstruction lane

`fixtures/nhnl-workbook-samples.json` banks ten known workbook dates from 2024-02-02 through 2024-02-15 as a golden parity set.

`lib/st-model/nhnl-research.ts` provides a research-only candidate reconstruction and exact comparison harness. It is intentionally not imported by the live API.

Initial Massive reference-universe research for **2024-02-15** returned **3,302 active XNAS common stocks**. The workbook contains a `3400` Nasdaq-universe constant. The proximity makes full-universe reconstruction plausible, but it is not evidence of parity by itself.

A candidate NH/NL source may be promoted to the live Bull regime only after its historical counts reproduce the workbook fixture to the agreed parity standard. Until then, NH/NL remains explicitly gated.

## Source hierarchy for native ST Model

1. Same instrument and same calculation semantics as the workbook.
2. Licensed/documented provider APIs suitable for unattended application use.
3. Explicit provenance and freshness in the API/UI.
4. Missing exact data fails closed.
5. No silent proxy substitution and no undocumented scraping endpoint in a trading decision path.
