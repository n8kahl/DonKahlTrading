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
