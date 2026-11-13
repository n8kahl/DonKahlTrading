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

`/checkup` takes one `.xlsx` workbook (up to 10 MB), says in plain words what it does, and lists what is wrong with it: formulas that read the wrong row, blank or typed-over cells in a column of formulas, rows that use a different formula from the rest of their column, error cells, and colour rules that cover only part of a column. It is written for someone who is neither a trader nor a spreadsheet user.

- Where two formulas share a column and the checks cannot tell which is intended, the page picks one, says why, and lets the reader switch. The choice follows any background the reader added (pasted text from the email or post the workbook is based on, or one screenshot); otherwise it follows what an experienced trader would do.
- The workbook is read in memory by `POST /api/checkup`. Nothing uploaded is written to disk or the database, and the workbook is never re-saved.
- The checks are plain code in `lib/checkup/` (no AI). Claude rewrites the wording and chooses between the two options of a question; it cannot add, drop or alter findings. It is sent the workbook's structure (tab names, headings, one formula per pattern, a few sample values) rather than its contents, plus the optional background. If that call fails, the findings are shown with built-in wording and no choice is made.
- There is no passcode. Uploads are limited to 10 per 10 minutes per address, and AI write-ups to 10 per hour across all visitors; past that, findings are still shown with built-in wording.
- Environment variables:
  - `ANTHROPIC_API_KEY`: enables the plain-language write-up.
  - `CHECKUP_MODEL` (optional): Claude model for the write-up. Defaults to `claude-opus-5-5`.
  - `CHECKUP_AI_PER_HOUR` (optional): hourly cap on AI write-ups. Defaults to 10; 0 switches them off.
- Try it without a real workbook: upload `fixtures/spreadsheet-checkup-sample.xlsx`, a made-up file with one of each fault (rebuild it with `npx tsx scripts/make-checkup-fixture.ts`).
- From the command line: `npx tsx scripts/checkup-cli.ts path/to/workbook.xlsx` (add `--explain` for the Claude wording).

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
