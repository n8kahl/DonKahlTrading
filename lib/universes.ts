// =============================================================================
// ETF Universe Definitions for Breadth Analysis
// =============================================================================
// These use ETF constituents as proxies for index breadth since we don't have
// direct access to official index constituent feeds (PHLX, S&P, etc.).
// =============================================================================

export interface Universe {
  id: string
  label: string
  description: string
  symbols: string[]
  disclosureText: string
  etfProxy: string
  asOf: string // Last updated date
}

// =============================================================================
// SOXX - iShares Semiconductor ETF (Proxy for PHLX/SOX)
// =============================================================================
// Top semiconductor holdings - updated quarterly
const SOXX_CONSTITUENTS = [
  'NVDA',  // NVIDIA
  'AMD',   // Advanced Micro Devices
  'AVGO',  // Broadcom
  'INTC',  // Intel
  'TXN',   // Texas Instruments
  'QCOM',  // Qualcomm
  'MU',    // Micron Technology
  'AMAT',  // Applied Materials
  'LRCX',  // Lam Research
  'KLAC',  // KLA Corporation
  'ADI',   // Analog Devices
  'MRVL',  // Marvell Technology
  'NXPI',  // NXP Semiconductors
  'ON',    // ON Semiconductor
  'MCHP',  // Microchip Technology
  'ASML',  // ASML Holding (ADR)
  'ARM',   // Arm Holdings (ADR)
  'TSM',   // Taiwan Semiconductor (ADR)
  'MPWR',  // Monolithic Power Systems
  'SWKS',  // Skyworks Solutions
  'QRVO',  // Qorvo
  'TER',   // Teradyne
  'ENTG',  // Entegris
  'CRUS',  // Cirrus Logic
  'WOLF',  // Wolfspeed
  'SMTC',  // Semtech
  'ALGM',  // Allegro MicroSystems
  'ACLS',  // Axcelis Technologies
  'MKSI',  // MKS Instruments
  'COHR',  // Coherent Corp
]

// =============================================================================
// SMH - VanEck Semiconductor ETF (Alternative semi proxy)
// =============================================================================
const SMH_CONSTITUENTS = [
  'NVDA', 'TSM', 'AVGO', 'ASML', 'AMD',
  'QCOM', 'TXN', 'INTC', 'LRCX', 'AMAT',
  'MU', 'KLAC', 'ADI', 'NXPI', 'MRVL',
  'MCHP', 'ON', 'MPWR', 'ARM', 'SNPS',
  'CDNS', 'TER', 'SWKS', 'ENTG', 'QRVO',
]

// =============================================================================
// QQQ - Invesco QQQ Trust (Proxy for Nasdaq 100)
// =============================================================================
// Top 30 holdings (simplified for practical breadth)
const QQQ_CONSTITUENTS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META',
  'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'COST',
  'NFLX', 'AMD', 'PEP', 'ADBE', 'CSCO',
  'LIN', 'TMUS', 'INTC', 'INTU', 'CMCSA',
  'TXN', 'QCOM', 'AMGN', 'HON', 'AMAT',
  'ISRG', 'BKNG', 'SBUX', 'VRTX', 'MDLZ',
  'GILD', 'ADI', 'REGN', 'LRCX', 'MU',
  'PANW', 'KLAC', 'SNPS', 'CDNS', 'MRVL',
  'MELI', 'PYPL', 'MAR', 'ORLY', 'NXPI',
  'FTNT', 'ASML', 'CTAS', 'MNST', 'ABNB',
]

// =============================================================================
// SPY - SPDR S&P 500 ETF (Proxy for S&P 500)
// =============================================================================
// Top 50 holdings (simplified for practical breadth)
const SPY_CONSTITUENTS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META',
  'GOOGL', 'GOOG', 'BRK.B', 'TSLA', 'UNH',
  'XOM', 'JPM', 'JNJ', 'V', 'PG',
  'MA', 'HD', 'AVGO', 'CVX', 'MRK',
  'COST', 'ABBV', 'LLY', 'PEP', 'KO',
  'WMT', 'ADBE', 'BAC', 'CRM', 'CSCO',
  'TMO', 'MCD', 'NFLX', 'AMD', 'ACN',
  'ORCL', 'LIN', 'ABT', 'DHR', 'INTC',
  'WFC', 'TXN', 'DIS', 'PM', 'INTU',
  'VZ', 'QCOM', 'CMCSA', 'NEE', 'COP',
]

// =============================================================================
// IWM - iShares Russell 2000 ETF (Proxy for Russell 2000)
// =============================================================================
// Top 40 holdings (Russell 2000 has 2000 stocks; we use top 40 for practical breadth)
const IWM_CONSTITUENTS = [
  'SMCI', 'MSTR', 'CELH', 'ONTO', 'SPSC',
  'CVLT', 'ANF', 'EXAS', 'FIX', 'FN',
  'BMI', 'SANM', 'MOD', 'LNTH', 'GCM',
  'HALO', 'NVEE', 'SIG', 'ACLX', 'CRVL',
  'STEP', 'ELF', 'VFC', 'IDCC', 'ATKR',
  'SKY', 'GTLS', 'CWST', 'PLXS', 'RUN',
  'DIOD', 'VCYT', 'POWL', 'JANX', 'TGTX',
  'PRGS', 'CRSR', 'TMHC', 'KRYS', 'RXRX',
]

// =============================================================================
// DIA - SPDR Dow Jones Industrial Average ETF (Proxy for Dow 30)
// =============================================================================
const DIA_CONSTITUENTS = [
  'UNH', 'GS', 'MSFT', 'HD', 'CAT',
  'AMGN', 'MCD', 'V', 'CRM', 'TRV',
  'AXP', 'BA', 'HON', 'JPM', 'IBM',
  'AAPL', 'WMT', 'PG', 'JNJ', 'CVX',
  'MRK', 'DIS', 'NKE', 'KO', 'MMM',
  'DOW', 'CSCO', 'INTC', 'VZ', 'WBA',
]

// =============================================================================
// Universe Registry
// =============================================================================

export const UNIVERSES: Record<string, Universe> = {
  soxx: {
    id: 'soxx',
    label: 'Semiconductors (SOXX)',
    description: 'PHLX Semiconductor Index proxy using iShares SOXX ETF constituents',
    symbols: SOXX_CONSTITUENTS,
    disclosureText: 'Using SOXX ETF constituents as a proxy for PHLX/SOX semiconductor breadth. This is an industry-standard approach since official constituent feeds require licensed data.',
    etfProxy: 'SOXX',
    asOf: '2025-01-01',
  },
  smh: {
    id: 'smh',
    label: 'Semiconductors (SMH)',
    description: 'Alternative semiconductor proxy using VanEck SMH ETF constituents',
    symbols: SMH_CONSTITUENTS,
    disclosureText: 'Using SMH ETF constituents as an alternative semiconductor breadth proxy.',
    etfProxy: 'SMH',
    asOf: '2025-01-01',
  },
  qqq: {
    id: 'qqq',
    label: 'Nasdaq 100 (QQQ)',
    description: 'Nasdaq 100 proxy using Invesco QQQ Trust top holdings',
    symbols: QQQ_CONSTITUENTS,
    disclosureText: 'Using QQQ ETF top 50 holdings as a proxy for Nasdaq 100 breadth.',
    etfProxy: 'QQQ',
    asOf: '2025-01-01',
  },
  spy: {
    id: 'spy',
    label: 'S&P 500 (SPY)',
    description: 'S&P 500 proxy using SPDR SPY ETF top holdings',
    symbols: SPY_CONSTITUENTS,
    disclosureText: 'Using SPY ETF top 50 holdings as a proxy for S&P 500 breadth. Full S&P 500 breadth requires 500 symbols.',
    etfProxy: 'SPY',
    asOf: '2025-01-01',
  },
  iwm: {
    id: 'iwm',
    label: 'Russell 2000 (IWM)',
    description: 'Russell 2000 proxy using iShares IWM ETF top holdings',
    symbols: IWM_CONSTITUENTS,
    disclosureText: 'Using IWM ETF top 40 holdings as a proxy for Russell 2000 breadth. This represents the largest small-caps only.',
    etfProxy: 'IWM',
    asOf: '2025-01-01',
  },
  dia: {
    id: 'dia',
    label: 'Dow 30 (DIA)',
    description: 'Dow Jones Industrial Average using SPDR DIA ETF constituents',
    symbols: DIA_CONSTITUENTS,
    disclosureText: 'Using DIA ETF constituents (all 30 Dow stocks).',
    etfProxy: 'DIA',
    asOf: '2025-01-01',
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

export function resolveUniverse(universeId: string): Universe | null {
  const normalized = universeId.toLowerCase().trim()

  // Handle aliases
  const aliases: Record<string, string> = {
    'semiconductors': 'soxx',
    'semis': 'soxx',
    'sox': 'soxx',
    'phlx': 'soxx',
    'nasdaq': 'qqq',
    'nasdaq100': 'qqq',
    'nasdaq-100': 'qqq',
    'sp500': 'spy',
    's&p500': 'spy',
    's&p': 'spy',
    'russell': 'iwm',
    'russell2000': 'iwm',
    'smallcaps': 'iwm',
    'dow': 'dia',
    'dow30': 'dia',
    'djia': 'dia',
  }

  const resolvedId = aliases[normalized] || normalized
  return UNIVERSES[resolvedId] || null
}

export function listUniverses(): Universe[] {
  return Object.values(UNIVERSES)
}

export function getUniverseSymbolCount(universeId: string): number {
  const universe = resolveUniverse(universeId)
  return universe?.symbols.length || 0
}
