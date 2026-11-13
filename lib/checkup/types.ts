// =============================================================================
// Spreadsheet check-up - shared types
// =============================================================================

import type { PTok } from './formula'

// -----------------------------------------------------------------------------
// Workbook model (what the reader produces)
// -----------------------------------------------------------------------------

export type CellKind = 'formula' | 'value' | 'empty'

export interface Cell {
  row: number
  col: number
  kind: CellKind
  /** n = number, s = text, b = true/false, e = Excel error, d = date */
  type: 'n' | 's' | 'b' | 'e' | 'd'
  /** Cached value as Excel would roughly show it, or null when the cell shows nothing. */
  display: string | null
  /** Tokenised row-relative formula (formula cells only). */
  toks?: PTok[]
  /** patternKey(toks), cached. */
  pkey?: string
}

export interface CfRule {
  type: string
  operator: string
  /** Rule formulas as row-relative patterns anchored at the block's first cell. */
  formulaKeys: string[]
  /** Rule formulas as written. */
  formulas: string[]
  /** Fill colour as RRGGBB, when the rule sets one. */
  color: string | null
}

export interface CfBlock {
  /** Rectangles the rule covers. */
  ranges: { c1: number; r1: number; c2: number; r2: number }[]
  rules: CfRule[]
}

export interface SheetModel {
  name: string
  index: number
  hidden: boolean
  /** column number -> row number -> cell */
  columns: Map<number, Map<number, Cell>>
  maxRow: number
  maxCol: number
  conditionalFormats: CfBlock[]
  /** True when the sheet was too large and only its first rows were read. */
  truncated: boolean
}

export interface WorkbookModel {
  sheets: SheetModel[]
  /** Things the workbook contains that a careless save would lose (queries, macros, ...). */
  features: string[]
}

// -----------------------------------------------------------------------------
// Findings (what the checks produce)
// -----------------------------------------------------------------------------

export type FindingKind =
  /** (a) a few rows use a different formula from the rest of the column */
  | 'inconsistent'
  /** (a) a typed-in value sits where the column's formula should be */
  | 'hardcoded'
  /** (b) blank cells inside a column of formulas */
  | 'empty'
  /** (c) the formula reads the wrong row */
  | 'offset'
  /** (d) the cell shows an Excel error */
  | 'error'
  /** (e) a colour rule covers only part of a column */
  | 'formatting'
  /** a column uses several formulas and none is clearly the main one */
  | 'mixed'
  /** (f) two formulas share the column and only the owner knows which is right */
  | 'question'

export type Severity = 'high' | 'medium' | 'low'

export interface RowRange {
  from: number
  to: number
}

export interface ColumnRef {
  letter: string
  header: string | null
}

export interface ExampleCell {
  /** A1-style address, e.g. "D14". */
  cell: string
  /** What the cell shows now (cached value), or null when blank. */
  value: string | null
  /** Formula in the cell now, with leading "=", or null. */
  formula: string | null
  /** Formula the cell should hold, with leading "=", or null. */
  suggested: string | null
}

export interface QuestionOption {
  key: 'a' | 'b'
  /** Default plain-words label for the button. */
  label: string
  /** The formula as it reads in `cell`, with leading "=". */
  formula: string
  /** The cell the formula is written for, e.g. "H440". */
  cell: string
  rows: RowRange[]
  count: number
}

export interface Finding {
  id: string
  kind: FindingKind
  severity: Severity
  sheet: string
  columns: ColumnRef[]
  rows: RowRange[]
  /** Number of cells affected across all listed columns. */
  cellCount: number
  /** How many of those cells currently show a value. */
  cellsWithValues: number
  /** Formula found, written for the first example cell, with leading "=". */
  formulaBefore: string | null
  /** Formula suggested for that same cell, with leading "=". */
  formulaSuggested: string | null
  examples: ExampleCell[]
  /** Default plain wording, replaced by the AI's when available. */
  title: string
  explanation: string
  /** Extra caution shown with the finding, never rewritten by the AI. */
  caution: string | null
  /** For kind = "question": the two choices. */
  options?: [QuestionOption, QuestionOption]
  /** For a finding whose fix depends on a question: that question's id. */
  dependsOn?: string
  /** For kind = "formatting": the rule's colour (RRGGBB) and the range it should cover. */
  color?: string | null
  suggestedRange?: string
  /** Machine-readable detail for step 2 (producing the fixed copy). */
  detail?: Record<string, string | number | boolean | null>
}

// -----------------------------------------------------------------------------
// Structure summary (what is shown and what is sent to the AI)
// -----------------------------------------------------------------------------

export interface ColumnSummary {
  letter: string
  header: string | null
  /** What the column mostly holds. */
  holds: 'formulas' | 'numbers' | 'dates' | 'text' | 'mixed'
  filledRows: number
  /** One formula per distinct pattern (largest first), written for its first row. */
  formulas: { formula: string; rows: number; firstRow: number }[]
  /** A few values as shown, top of the column first. */
  samples: string[]
  /** Default one-line description, replaced by the AI's when available. */
  description: string
}

export interface SheetSummary {
  name: string
  hidden: boolean
  rows: number
  headerRow: number | null
  columns: ColumnSummary[]
  /** Sheets without formulas are described but never produce findings. */
  hasFormulas: boolean
  /** For a short tab of written notes: its lines, so the notes can inform the description. */
  notes: string[]
}

export interface WorkbookStructure {
  sheets: SheetSummary[]
  features: string[]
}

// -----------------------------------------------------------------------------
// Result returned to the page
// -----------------------------------------------------------------------------

export interface CheckupResult {
  fileName: string
  fileSize: number
  structure: WorkbookStructure
  /** Problems, most serious first. Never includes kind = "question". */
  problems: Finding[]
  /** Questions only the owner can answer. */
  questions: Finding[]
  /** Three-sentence description of what the spreadsheet does. */
  summary: string
  /** True when the wording came from the AI, false when it is the built-in default. */
  explainedByAI: boolean
  /** Why the AI wording is missing, in plain words (null when it is present). */
  aiNote: string | null
}
