-- Create dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  config TEXT NOT NULL,
  results TEXT NOT NULL
);

-- Create index on createdAt for faster queries
CREATE INDEX IF NOT EXISTS idx_dashboards_created_at ON dashboards(createdAt);
