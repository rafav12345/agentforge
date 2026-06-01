/* ============================================
   AgentForge — Sample Enterprise Datasets
   Realistic business data for grounding LLM agents
   in structured enterprise contexts
   ============================================ */

const SAMPLE_DATASETS = {

  "Quarterly Financials": {
    description: "Q1-Q4 2025 financial performance by region",
    columns: ["Quarter", "Region", "Revenue", "COGS", "OpEx", "NetIncome", "Headcount", "YoY_Growth_Pct"],
    rows: [
      ["Q1 2025", "North America", 8400000, 5460000, 1680000, 1260000, 489, 12.3],
      ["Q1 2025", "EMEA",          6200000, 4154000, 1240000,  806000, 312,  8.7],
      ["Q1 2025", "APAC",          3100000, 2139000,  682000,  279000, 156, 22.1],
      ["Q2 2025", "North America", 8900000, 5696000, 1780000, 1424000, 502, 14.1],
      ["Q2 2025", "EMEA",          6500000, 4355000, 1300000,  845000, 318,  9.2],
      ["Q2 2025", "APAC",          3400000, 2312000,  714000,  374000, 163, 25.8],
      ["Q3 2025", "North America", 9200000, 6072000, 1840000, 1288000, 510, 10.5],
      ["Q3 2025", "EMEA",          5800000, 4060000, 1276000,  464000, 305, -2.1],
      ["Q3 2025", "APAC",          3700000, 2405000,  740000,  555000, 171, 28.4],
      ["Q4 2025", "North America", 9800000, 6272000, 1960000, 1568000, 525, 16.7],
      ["Q4 2025", "EMEA",          5500000, 3960000, 1265000,  275000, 298, -5.3],
      ["Q4 2025", "APAC",          4100000, 2624000,  779000,  697000, 178, 31.2],
    ],
  },

  "Supply Chain Metrics": {
    description: "Current supply chain KPIs by product line",
    columns: ["ProductLine", "LeadTime_Days", "InventoryTurnover", "StockoutRate_Pct", "SupplierScore", "OTIF_Pct", "CostPerUnit", "DefectRate_Pct", "SafetyStock_Days"],
    rows: [
      ["Enterprise Platform",   14, 6.2, 1.8, 92, 96.1, 124.50, 0.3, 21],
      ["Analytics Suite",       21, 4.1, 4.7, 78, 87.3,  89.00, 1.2, 30],
      ["Mobile SDK",             7, 9.8, 0.5, 95, 98.7,  34.20, 0.1, 10],
      ["Data Connectors",       28, 3.2, 6.3, 71, 81.5,  67.80, 2.1, 35],
      ["AI/ML Engine",          35, 2.8, 8.1, 68, 76.2, 210.00, 1.8, 42],
      ["Security Module",       10, 7.5, 1.2, 94, 97.4,  56.30, 0.2, 14],
      ["Integration Layer",     18, 5.1, 3.4, 83, 91.8,  78.50, 0.9, 25],
      ["Reporting Dashboard",   12, 6.8, 2.0, 89, 94.6,  45.10, 0.4, 18],
    ],
  },

  "Sales Pipeline": {
    description: "Active Q1 2026 sales pipeline by opportunity",
    columns: ["Opportunity", "Account", "Stage", "DealSize", "Probability_Pct", "DaysInStage", "Rep", "Region", "ProductLine", "ExpectedClose"],
    rows: [
      ["OPP-2401", "Siemens AG",       "Negotiation",  450000, 75, 12, "Maria K.",   "EMEA",          "Enterprise Platform", "2026-02-15"],
      ["OPP-2402", "Toyota Motor",      "Proposal",     280000, 50, 21, "Kenji T.",   "APAC",          "Analytics Suite",     "2026-03-01"],
      ["OPP-2403", "JPMorgan Chase",    "Discovery",    820000, 20,  5, "Sarah L.",   "North America", "AI/ML Engine",        "2026-04-30"],
      ["OPP-2404", "Unilever",          "Closed Won",   190000, 100, 0, "Carlos R.",  "EMEA",          "Data Connectors",     "2026-01-20"],
      ["OPP-2405", "Samsung Electronics","Proposal",     340000, 45, 18, "Jin H.",     "APAC",          "Enterprise Platform", "2026-02-28"],
      ["OPP-2406", "Walmart Inc.",       "Negotiation",  560000, 70,  8, "Sarah L.",   "North America", "Enterprise Platform", "2026-02-10"],
      ["OPP-2407", "Nestlé SA",         "Discovery",    150000, 15, 30, "Maria K.",   "EMEA",          "Reporting Dashboard", "2026-05-15"],
      ["OPP-2408", "Microsoft Corp.",    "Proposal",     720000, 55, 14, "David P.",   "North America", "AI/ML Engine",        "2026-03-15"],
      ["OPP-2409", "Tata Group",        "Qualification", 95000, 10, 42, "Priya S.",   "APAC",          "Mobile SDK",          "2026-06-01"],
      ["OPP-2410", "BMW Group",          "Negotiation",  310000, 80,  6, "Carlos R.",  "EMEA",          "Analytics Suite",     "2026-02-05"],
      ["OPP-2411", "Amazon Web Services","Closed Won",   680000, 100, 0, "David P.",   "North America", "AI/ML Engine",        "2026-01-28"],
      ["OPP-2412", "BHP Group",          "Proposal",     220000, 40, 25, "Priya S.",   "APAC",          "Security Module",     "2026-03-20"],
      ["OPP-2413", "Novartis AG",        "Discovery",    410000, 25,  9, "Maria K.",   "EMEA",          "Enterprise Platform", "2026-04-15"],
      ["OPP-2414", "General Electric",   "Qualification",175000, 30, 15, "Sarah L.",   "North America", "Integration Layer",   "2026-04-01"],
      ["OPP-2415", "Alibaba Group",      "Proposal",     390000, 50, 11, "Jin H.",     "APAC",          "Analytics Suite",     "2026-03-10"],
    ],
  },

  "Customer Health": {
    description: "Top accounts health scorecard",
    columns: ["Account", "ARR", "NPS", "ChurnRisk_Pct", "TicketsOpen", "AvgResolution_Hours", "DaysSinceContact", "UsageGrowth_Pct", "ContractRenewal", "CSM"],
    rows: [
      ["Siemens AG",        480000, 72,  8, 3,  4.2, 12, 15.3, "2026-06-01", "Maria K."],
      ["JPMorgan Chase",    920000, 85,  3, 1,  2.1,  5, 22.1, "2026-09-15", "Sarah L."],
      ["Toyota Motor",      310000, 58, 22, 7, 12.8, 34, -5.2, "2026-04-01", "Kenji T."],
      ["Unilever",          195000, 64, 15, 4,  6.5, 21,  3.8, "2026-07-30", "Carlos R."],
      ["Samsung Electronics",360000, 71, 10, 2,  3.7, 18, 11.4, "2026-08-15", "Jin H."],
      ["Walmart Inc.",      580000, 78,  5, 2,  2.8,  8, 18.7, "2026-05-01", "Sarah L."],
      ["BMW Group",         340000, 68, 12, 5,  8.1, 25,  1.2, "2026-06-30", "Carlos R."],
      ["Microsoft Corp.",   750000, 82,  4, 1,  1.9,  3, 25.4, "2026-11-01", "David P."],
      ["Tata Group",        110000, 45, 35, 9, 18.4, 48, -12.3, "2026-03-15", "Priya S."],
      ["Amazon Web Services",710000, 88,  2, 0,  1.5,  7, 30.1, "2026-10-01", "David P."],
    ],
  },
};

// Helper: format a dataset as a grounding context string for LLM consumption
function formatDatasetForLLM(datasetName, dataset, filterExpr) {
  let rows = dataset.rows;

  // Apply optional filter
  if (filterExpr && filterExpr.trim()) {
    try {
      // Reject dangerous patterns, then bind each column as a named parameter
      // (no `with`) so the expression can reference columns by name safely.
      const safeExpr = Utils.sanitizeExpression(filterExpr);
      const cols = dataset.columns;
      const validCols = cols.filter(col => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(col));
      const predicate = new Function(...validCols, `return (${safeExpr});`);
      rows = rows.filter(row => {
        const args = validCols.map(col => row[cols.indexOf(col)]);
        return predicate(...args);
      });
    } catch (e) {
      // If filter fails (bad expression, prohibited pattern), use all rows.
    }
  }

  // Compute summary statistics for numeric columns
  const cols = dataset.columns;
  const numericCols = [];
  cols.forEach((col, i) => {
    if (rows.length > 0 && typeof rows[0][i] === 'number') {
      const values = rows.map(r => r[i]);
      numericCols.push({
        name: col,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        sum: values.reduce((a, b) => a + b, 0),
      });
    }
  });

  // Build the grounding context
  let context = `=== DATA CONTEXT ===\n`;
  context += `Dataset: ${datasetName} (${rows.length} rows, ${cols.length} columns)\n`;
  context += `Description: ${dataset.description}\n`;
  context += `Columns: ${cols.join(', ')}\n`;

  if (numericCols.length > 0) {
    context += `\nKey Statistics:\n`;
    numericCols.forEach(nc => {
      const fmt = nc.max > 10000 ? (v => '$' + Number(v).toLocaleString()) : (v => v);
      context += `  ${nc.name}: min=${fmt(nc.min)}, max=${fmt(nc.max)}, avg=${fmt(nc.avg)}\n`;
    });
  }

  context += `\n--- Raw Data ---\n`;
  context += cols.join(',') + '\n';
  rows.forEach(row => {
    context += row.join(',') + '\n';
  });

  return context;
}
