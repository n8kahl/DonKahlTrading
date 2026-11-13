# Trading Dashboard - Heatmap Analysis

A Next.js 14 dashboard that displays a heatmap-style table showing "days since rolling high" for market indices.

## Features

- **Dark-themed heatmap table** with sticky date column and header
- **Configurable parameters**:
  - Lookback period: 21, 63, 126, or 252 trading days
  - Basis: High or Close
  - Date range: Last 30, 63, or 126 trading days
  - Custom symbol universe (comma-separated)
- **Share functionality**: Create read-only shareable links
- **Export options**: CSV and JSON export
- **Real-time data**: Fetches from Massive API with mock fallback

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

Initialize the SQLite database:

```bash
npx prisma generate
npx prisma db push
```

### 3. Configure Environment Variables

Create a `.env.local` file:

```env
MASSIVE_API_KEY=your_api_key_here
```

If `MASSIVE_API_KEY` is not set, the dashboard will use mock data and display a warning.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## API Routes

- `GET /api/heatmap` - Fetches and computes heatmap data
  - Query params: `symbols`, `lookback`, `basis`, `days`
- `POST /api/share` - Creates a shareable dashboard snapshot
- `GET /api/dashboard/[id]` - Retrieves a shared dashboard

## Spreadsheet check-up

`/checkup` takes one `.xlsx` workbook (up to 10 MB), works out what is wrong with it, repairs it, and explains in plain words what the workbook does, what was wrong, what was changed and why, and how the latest reading changed. The owner gets a "Download fixed copy" button; the original is never changed. It is written for someone who is neither a trader nor a spreadsheet user: they can type one line about what seems wrong and, optionally, add the email text or a screenshot of the rules the workbook follows. They are never asked a question.

How it works:

1. **First pass** (`lib/checkup/`, plain code, no AI). The workbook's XML is read directly, every formula becomes a row-relative pattern, and rows are grouped per column. This finds formulas that read the wrong row, blank or typed-over cells in a formula column, stray formulas, error cells, colour rules that cover only part of a column, and columns split between two formulas.
2. **Repair** (`lib/checkup/repair/`). The workbook, the owner's words, any reference material and the first-pass findings go to a Claude agent with a code sandbox (a Managed Agents session). It investigates, patches only the affected sheet XML inside the zip, and writes a fixed copy and a report. Its work is graded against a checklist and sent back until it passes.
3. **After-check** (plain code again). The first-pass checks are re-run on the fixed copy and every part of the workbook is compared with the original. A copy that cannot be opened or has lost a part is not offered for download.

A repair takes minutes, so `POST /api/checkup` starts a job and returns its id, `GET /api/checkup/[id]` reports progress and then the result, and `GET /api/checkup/[id]/file` serves the fixed copy. The job id is the agent session's id; nothing is stored on this server.

What leaves this server: the whole workbook, the owner's sentence and any reference text or screenshot are sent to Anthropic. Sessions and uploaded files stay on Anthropic's side until they are deleted (see the pull request for details).

Limits (the page has no sign-in):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Required for repairs and for the plain-language report |
| `CHECKUP_RUNS_PER_DAY` | 5 | Repairs allowed in any 24 hours, across all visitors. 0 switches repairs off |
| `CHECKUP_RUN_BUDGET_CENTS` | 800 | Hard spend ceiling for one repair, in US cents at list prices |
| `CHECKUP_RUN_MINUTES` | 30 | A repair still running after this long is stopped |
| `CHECKUP_AGENT_MODEL` | `claude-opus-5-5` | Model the repair agent runs on |
| `CHECKUP_AI_PER_HOUR` | 10 | Hourly cap on the cheaper report-only write-up (used when no repair can run) |
| `CHECKUP_AGENT_ID`, `CHECKUP_ENVIRONMENT_ID` | – | Optional: pin an existing agent and sandbox instead of looking them up by name |

Uploads are also limited to 6 per half hour per address. When a repair cannot run (no key, the daily allowance is used, or the start fails) the page falls back to a report of the first-pass findings.

The agent and its sandbox are created on Anthropic's side the first time a repair runs and reused after that; when the instructions in `lib/checkup/repair/agent-config.ts` change, the stored agent is updated on the next run.

Try it:

- Checks only, no cost: `npx tsx scripts/checkup-cli.ts path/to/workbook.xlsx`
- A full repair from the command line (a paid run): `npx tsx --env-file=.env.local scripts/checkup-repair-cli.ts workbook.xlsx fixed.xlsx "what seems wrong"`
- Recent repair jobs with cost and duration: `npx tsx --env-file=.env.local scripts/checkup-jobs.ts`
- `fixtures/spreadsheet-checkup-sample.xlsx` is a made-up workbook with one of each fault (rebuild it with `npx tsx scripts/make-checkup-fixture.ts`).

## Project Structure

```
app/
  page.tsx              # Main dashboard page
  d/[id]/page.tsx       # Shared dashboard page
  api/
    heatmap/route.ts    # Heatmap data API
    share/route.ts      # Share dashboard API
    dashboard/[id]/route.ts  # Get shared dashboard API
components/
  heatmap-table.tsx     # Heatmap table component
  dashboard-controls.tsx # Control panel
  export-menu.tsx       # Export functionality
  loading-skeleton.tsx  # Loading states
hooks/
  use-heatmap-data.ts   # Data fetching hook
lib/
  massive-api.ts        # Massive API integration
  prisma.ts             # Prisma client
  env.ts                # Environment validation
prisma/
  schema.prisma         # Database schema
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Database**: Prisma + SQLite
- **TypeScript**: Full type safety
- **Data Source**: Massive API (with mock fallback)

## Usage

1. Adjust the controls to configure your analysis
2. Click "Refresh" to update data
3. Click "Share" to create a shareable link (copies to clipboard)
4. Use the "Export" menu to download CSV or JSON

## Notes

- The heatmap colors intensity based on days since high (0 = brightest green)
- Shared dashboards are read-only snapshots
- Mock data is used when API key is missing or API calls fail
```

```json file="" isHidden
