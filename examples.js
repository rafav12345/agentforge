/* ============================================
   AgentForge — Example Flows
   Pre-built flow templates to load and explore
   ============================================ */

const EXAMPLE_FLOWS = {

  // ---- 1. Simple Chain: Input → LLM → Output ----
  "Simple Chat": {
    version: 1,
    metadata: {
      name: "Simple Chat",
      created: Date.now(),
      modified: Date.now(),
    },
    nodes: [
      { id: "ex1_input", type: "input", x: 80, y: 180,
        config: { label: "User Message", inputType: "text", defaultValue: "Explain quantum computing in one paragraph." }},
      { id: "ex1_llm", type: "llm", x: 380, y: 170,
        config: { label: "Claude", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a helpful, concise assistant.", promptTemplate: "{{input}}", temperature: 0.7, maxTokens: 1024 }},
      { id: "ex1_output", type: "output", x: 680, y: 180,
        config: { label: "Response", format: "text" }},
    ],
    edges: [
      { from: "ex1_input", fromPort: "output", to: "ex1_llm", toPort: "prompt" },
      { from: "ex1_llm", fromPort: "response", to: "ex1_output", toPort: "input" },
    ],
  },

  // ---- 2. Summarize & Translate: chain of 2 LLMs ----
  "Summarize & Translate": {
    version: 1,
    metadata: {
      name: "Summarize & Translate",
      created: Date.now(),
      modified: Date.now(),
    },
    nodes: [
      { id: "ex2_input", type: "input", x: 60, y: 180,
        config: { label: "Article Text", inputType: "text", defaultValue: "The European Central Bank held interest rates steady on Thursday, keeping its benchmark rate at 2.75%. ECB President Christine Lagarde said inflation was declining but warned that risks remain, particularly from energy prices and geopolitical tensions. Analysts expect the ECB to consider a rate cut at its next meeting in April if inflation continues to moderate." }},
      { id: "ex2_summarize", type: "llm", x: 340, y: 100,
        config: { label: "Summarizer", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a concise news summarizer. Output exactly 1-2 sentences.", promptTemplate: "Summarize this article:\n\n{{input}}", temperature: 0.3, maxTokens: 200 }},
      { id: "ex2_translate", type: "llm", x: 620, y: 100,
        config: { label: "Translator (ES)", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a professional translator. Translate the input to Spanish. Output ONLY the translation, nothing else.", promptTemplate: "{{input}}", temperature: 0.2, maxTokens: 300 }},
      { id: "ex2_merge", type: "merge", x: 620, y: 280,
        config: { label: "Combine Results", strategy: "template", template: "📝 SUMMARY:\n{{input_a}}\n\n🇪🇸 SPANISH:\n{{input_b}}", waitForAll: true }},
      { id: "ex2_output", type: "output", x: 900, y: 200,
        config: { label: "Final Report", format: "text" }},
    ],
    edges: [
      { from: "ex2_input", fromPort: "output", to: "ex2_summarize", toPort: "prompt" },
      { from: "ex2_summarize", fromPort: "response", to: "ex2_translate", toPort: "prompt" },
      { from: "ex2_summarize", fromPort: "response", to: "ex2_merge", toPort: "input_a" },
      { from: "ex2_translate", fromPort: "response", to: "ex2_merge", toPort: "input_b" },
      { from: "ex2_merge", fromPort: "merged", to: "ex2_output", toPort: "input" },
    ],
  },

  // ---- 3. Sentiment Router: condition branching ----
  "Sentiment Router": {
    version: 1,
    metadata: {
      name: "Sentiment Router",
      created: Date.now(),
      modified: Date.now(),
    },
    nodes: [
      { id: "ex3_input", type: "input", x: 60, y: 200,
        config: { label: "Customer Message", inputType: "text", defaultValue: "I've been waiting 3 weeks for my order and nobody responds to my emails. This is terrible service!" }},
      { id: "ex3_classifier", type: "llm", x: 340, y: 200,
        config: { label: "Sentiment Classifier", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a sentiment classifier. Respond with ONLY one word: positive, negative, or neutral. Nothing else.", promptTemplate: "Classify the sentiment of this message:\n\n{{input}}", temperature: 0, maxTokens: 10 }},
      { id: "ex3_condition", type: "condition", x: 620, y: 200,
        config: { label: "Is Negative?", expression: "input.toLowerCase().includes('negative')", evaluator: "javascript" }},
      { id: "ex3_escalate", type: "llm", x: 900, y: 100,
        config: { label: "Escalation Drafter", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a customer service manager. Draft a sincere, empathetic apology response. Keep it under 3 sentences.", promptTemplate: "A customer sent this angry message. Draft an apology:\n\n{{input}}", temperature: 0.5, maxTokens: 200 }},
      { id: "ex3_standard", type: "llm", x: 900, y: 320,
        config: { label: "Standard Reply", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a friendly customer service agent. Write a brief, helpful reply.", promptTemplate: "Reply to this customer message:\n\n{{input}}", temperature: 0.7, maxTokens: 200 }},
      { id: "ex3_out_urgent", type: "output", x: 1180, y: 100,
        config: { label: "🚨 Urgent Reply", format: "text" }},
      { id: "ex3_out_normal", type: "output", x: 1180, y: 320,
        config: { label: "✉️ Normal Reply", format: "text" }},
    ],
    edges: [
      { from: "ex3_input", fromPort: "output", to: "ex3_classifier", toPort: "prompt" },
      { from: "ex3_classifier", fromPort: "response", to: "ex3_condition", toPort: "input" },
      { from: "ex3_condition", fromPort: "true", to: "ex3_escalate", toPort: "prompt" },
      { from: "ex3_condition", fromPort: "false", to: "ex3_standard", toPort: "prompt" },
      { from: "ex3_escalate", fromPort: "response", to: "ex3_out_urgent", toPort: "input" },
      { from: "ex3_standard", fromPort: "response", to: "ex3_out_normal", toPort: "input" },
    ],
  },

  // ---- 4. RAG Pipeline (simulated retrieval) ----
  "RAG Pipeline": {
    version: 1,
    metadata: {
      name: "RAG Pipeline",
      created: Date.now(),
      modified: Date.now(),
    },
    nodes: [
      { id: "ex4_input", type: "input", x: 60, y: 200,
        config: { label: "User Question", inputType: "text", defaultValue: "What is the company's return policy for electronics?" }},
      { id: "ex4_retriever", type: "tool", x: 340, y: 120,
        config: { label: "Knowledge Retriever", toolType: "function", method: "GET", url: "", body: "", headers: "" }},
      { id: "ex4_rewriter", type: "llm", x: 340, y: 300,
        config: { label: "Query Rewriter", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "Rewrite the user question to be more specific for a knowledge base search. Output only the rewritten query.", promptTemplate: "{{input}}", temperature: 0.3, maxTokens: 100 }},
      { id: "ex4_merge", type: "merge", x: 620, y: 200,
        config: { label: "Combine Context", strategy: "template", template: "RETRIEVED CONTEXT:\n{{input_a}}\n\nREWRITTEN QUERY:\n{{input_b}}", waitForAll: true }},
      { id: "ex4_generator", type: "llm", x: 900, y: 200,
        config: { label: "Answer Generator", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a helpful assistant that answers questions based on the provided context. If the context doesn't contain the answer, say so honestly. Always cite which part of the context you're referencing.", promptTemplate: "{{input}}", temperature: 0.5, maxTokens: 500 }},
      { id: "ex4_output", type: "output", x: 1180, y: 200,
        config: { label: "Answer", format: "markdown" }},
    ],
    edges: [
      { from: "ex4_input", fromPort: "output", to: "ex4_retriever", toPort: "input" },
      { from: "ex4_input", fromPort: "output", to: "ex4_rewriter", toPort: "prompt" },
      { from: "ex4_retriever", fromPort: "result", to: "ex4_merge", toPort: "input_a" },
      { from: "ex4_rewriter", fromPort: "response", to: "ex4_merge", toPort: "input_b" },
      { from: "ex4_merge", fromPort: "merged", to: "ex4_generator", toPort: "prompt" },
      { from: "ex4_generator", fromPort: "response", to: "ex4_output", toPort: "input" },
    ],
  },

  // ---- 5. Multi-step Analysis with Loop ----
  "Iterative Analyst": {
    version: 1,
    metadata: {
      name: "Iterative Analyst",
      created: Date.now(),
      modified: Date.now(),
    },
    nodes: [
      { id: "ex5_input", type: "input", x: 60, y: 200,
        config: { label: "Raw Data", inputType: "text", defaultValue: "Q1 Revenue: $4.2M (+12% YoY)\nQ1 Expenses: $3.8M (+18% YoY)\nQ1 Net Income: $400K (-15% YoY)\nHeadcount: 45 (+8)\nChurn Rate: 4.2% (up from 3.1%)\nNPS Score: 62 (down from 71)" }},
      { id: "ex5_loop", type: "loop", x: 340, y: 200,
        config: { label: "Analysis Passes", loopType: "count", maxIterations: 3, condition: "" }},
      { id: "ex5_analyst", type: "llm", x: 620, y: 120,
        config: { label: "Analyst Agent", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are a sharp financial analyst. Identify the single most critical insight from this data that leadership needs to act on immediately. Be specific and quantitative. One paragraph max.", promptTemplate: "Analyze this data and give your top insight:\n\n{{input}}", temperature: 0.8, maxTokens: 300 }},
      { id: "ex5_synthesizer", type: "llm", x: 620, y: 300,
        config: { label: "Synthesizer", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "You are an executive briefing writer. Take the analysis and produce 3 bullet-point action items for the CEO. Be direct and actionable.", promptTemplate: "Based on this analysis, write 3 action items:\n\n{{input}}", temperature: 0.5, maxTokens: 300 }},
      { id: "ex5_output", type: "output", x: 900, y: 300,
        config: { label: "Executive Brief", format: "markdown" }},
    ],
    edges: [
      { from: "ex5_input", fromPort: "output", to: "ex5_loop", toPort: "input" },
      { from: "ex5_loop", fromPort: "iteration", to: "ex5_analyst", toPort: "prompt" },
      { from: "ex5_loop", fromPort: "done", to: "ex5_synthesizer", toPort: "prompt" },
      { from: "ex5_analyst", fromPort: "response", to: "ex5_synthesizer", toPort: "prompt" },
      { from: "ex5_synthesizer", fromPort: "response", to: "ex5_output", toPort: "input" },
    ],
  },

  // ---- 6. Multi-Agent Debate ----
  "AI Debate": {
    version: 1,
    metadata: { name: "AI Debate", created: Date.now(), modified: Date.now() },
    nodes: [
      { id: "ex6_input", type: "input", x: 80, y: 180,
        config: { label: "Debate Topic", inputType: "text", defaultValue: "Should AI systems be required to identify themselves as AI in all interactions with humans?" }},
      { id: "ex6_debate", type: "debate", x: 380, y: 180,
        config: { label: "AI Ethics Debate", model: "claude-sonnet-4-20250514", rounds: 2 }},
      { id: "ex6_output", type: "output", x: 680, y: 180,
        config: { label: "Debate Result", format: "markdown" }},
    ],
    edges: [
      { from: "ex6_input", fromPort: "output", to: "ex6_debate", toPort: "topic" },
      { from: "ex6_debate", fromPort: "verdict", to: "ex6_output", toPort: "input" },
    ],
  },

  // ---- 7. Enterprise Decision Advisor (Aily-style Decision Intelligence) ----
  "Enterprise Decision Advisor": {
    version: 1,
    metadata: { name: "Enterprise Decision Advisor", created: Date.now(), modified: Date.now() },
    nodes: [
      // User Question (top-left)
      { id: "eda_question", type: "input", x: 60, y: -100,
        config: { label: "Executive Question", inputType: "text", defaultValue: "What are the biggest risks to our Q1 2026 targets, and where should we double down for growth?" }},

      // Data Sources (left column)
      { id: "eda_fin_data", type: "datasource", x: 60, y: 80,
        config: { label: "Financial Data", dataset: "Quarterly Financials", dataFormat: "csv", queryFilter: "" }},
      { id: "eda_sc_data", type: "datasource", x: 60, y: 260,
        config: { label: "Supply Chain Data", dataset: "Supply Chain Metrics", dataFormat: "csv", queryFilter: "" }},
      { id: "eda_sales_data", type: "datasource", x: 60, y: 440,
        config: { label: "Sales Pipeline", dataset: "Sales Pipeline", dataFormat: "csv", queryFilter: "" }},

      // Domain Analyst Agents (middle column)
      { id: "eda_fin_analyst", type: "llm", x: 380, y: 40,
        config: { label: "Finance Analyst", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are a senior financial analyst at an enterprise SaaS company. Analyze the provided financial data and identify:\n1. Revenue trends across regions (North America, EMEA, APAC)\n2. Margin compression or expansion signals\n3. Cost structure concerns (COGS, OpEx ratios)\n4. YoY growth trajectory and any red flags\n\nBe quantitative — cite specific numbers from the data. Flag any region showing declining performance. Output a structured analysis with a RISK LEVEL (LOW/MEDIUM/HIGH) at the end.",
          promptTemplate: "Analyze this financial dataset and provide your assessment:\n\n{{input}}", temperature: 0.3, maxTokens: 800 }},
      { id: "eda_sc_analyst", type: "llm", x: 380, y: 250,
        config: { label: "Supply Chain Analyst", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are a supply chain operations analyst. Analyze the provided supply chain KPIs and identify:\n1. Product lines with critical lead times (>25 days) or high stockout rates (>5%)\n2. Supplier reliability issues (SupplierScore < 80, OTIF < 90%)\n3. Quality concerns (DefectRate > 1%)\n4. Cost per unit outliers and inventory efficiency\n\nBe specific — reference product line names and exact metrics. Recommend immediate actions for any KPI in the red zone. Output a structured analysis with a RISK LEVEL (LOW/MEDIUM/HIGH) at the end.",
          promptTemplate: "Analyze this supply chain data and provide your assessment:\n\n{{input}}", temperature: 0.3, maxTokens: 800 }},
      { id: "eda_sales_analyst", type: "llm", x: 380, y: 420,
        config: { label: "Commercial Analyst", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are a commercial strategy analyst. Analyze the provided sales pipeline and identify:\n1. Pipeline coverage ratio and health (total weighted pipeline vs. targets)\n2. Deals at risk — stalled opportunities (DaysInStage > 20, low probability)\n3. Regional and product line concentration risks\n4. Rep performance patterns and capacity issues\n\nBe quantitative — cite deal IDs, account names, and specific metrics. Highlight the top 3 opportunities to accelerate and any deals that should be de-risked. Output a structured analysis with a RISK LEVEL (LOW/MEDIUM/HIGH) at the end.",
          promptTemplate: "Analyze this sales pipeline and provide your assessment:\n\n{{input}}", temperature: 0.3, maxTokens: 800 }},

      // Synchronization
      { id: "eda_barrier", type: "barrier", x: 700, y: 250,
        config: { label: "Sync Analyses", waitForAll: true }},

      // Merge question with analyst outputs
      { id: "eda_merge_q", type: "merge", x: 850, y: 180,
        config: { label: "Contextualize", strategy: "template", template: "EXECUTIVE QUESTION:\n{{input_a}}\n\nDOMAIN ANALYSES:\n{{input_b}}", waitForAll: true }},

      // Decision Orchestrator (Supervisor Agent)
      { id: "eda_orchestrator", type: "llm", x: 1080, y: 180,
        config: { label: "Decision Orchestrator", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are a Chief Strategy Officer synthesizing cross-functional intelligence. You receive an executive question and analyses from three domain experts (Finance, Supply Chain, Commercial). Your job is to:\n\n1. ANSWER the executive question directly using evidence from the domain analyses\n2. SYNTHESIZE: Identify where the three analyses converge or conflict\n3. CORRELATE: Connect cross-domain signals (e.g., EMEA revenue decline + supply chain issues + stalled deals)\n4. PRIORITIZE: Rank the top 3 strategic decisions the executive team must make this quarter\n5. RECOMMEND: For each decision, provide a clear recommendation with expected impact\n\nStart your response with an OVERALL RISK ASSESSMENT: LOW, MEDIUM, or HIGH.\nThen provide the structured synthesis.\nEnd with a single sentence: the ONE thing the CEO should do this week.",
          promptTemplate: "Cross-functional analysis reports:\n\n{{input}}", temperature: 0.4, maxTokens: 1200 }},

      // Risk-based routing
      { id: "eda_risk_check", type: "condition", x: 1380, y: 180,
        config: { label: "Risk Level Check", expression: "input.toUpperCase().includes('HIGH')", evaluator: "javascript" }},

      // Risk Mitigation Path
      { id: "eda_mitigation", type: "llm", x: 1660, y: 80,
        config: { label: "Risk Mitigation Advisor", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are an enterprise risk mitigation specialist. The organization has been flagged as HIGH RISK. Based on the strategic synthesis, draft:\n\n1. IMMEDIATE ACTIONS (this week): 2-3 urgent steps\n2. SHORT-TERM PLAN (30 days): Key workstreams to stabilize\n3. MONITORING: Specific KPIs to watch daily with thresholds\n\nBe direct and actionable. No fluff. Format as an executive memo.",
          promptTemplate: "HIGH RISK ALERT — Draft mitigation plan based on this analysis:\n\n{{input}}", temperature: 0.3, maxTokens: 800 }},

      // Growth Path
      { id: "eda_growth", type: "llm", x: 1660, y: 300,
        config: { label: "Growth Opportunity Advisor", provider: "anthropic", model: "claude-sonnet-4-20250514",
          systemPrompt: "You are a growth strategy advisor. The organization is in a stable position. Based on the strategic synthesis, identify:\n\n1. GROWTH LEVERS: Top 3 opportunities to accelerate revenue\n2. INVESTMENT THESIS: Where to allocate incremental budget for maximum ROI\n3. QUICK WINS: 2-3 actions that can show results within 30 days\n\nBe specific and tie recommendations to the data. Format as an executive memo.",
          promptTemplate: "STABLE/LOW RISK — Identify growth opportunities from this analysis:\n\n{{input}}", temperature: 0.5, maxTokens: 800 }},

      // Output
      { id: "eda_output_risk", type: "output", x: 1940, y: 80,
        config: { label: "Risk Mitigation Brief", format: "markdown" }},
      { id: "eda_output_growth", type: "output", x: 1940, y: 300,
        config: { label: "Growth Strategy Brief", format: "markdown" }},
    ],
    edges: [
      // Data → Analysts
      { from: "eda_fin_data", fromPort: "data", to: "eda_fin_analyst", toPort: "prompt" },
      { from: "eda_sc_data", fromPort: "data", to: "eda_sc_analyst", toPort: "prompt" },
      { from: "eda_sales_data", fromPort: "data", to: "eda_sales_analyst", toPort: "prompt" },
      // Analysts → Barrier
      { from: "eda_fin_analyst", fromPort: "response", to: "eda_barrier", toPort: "input_a" },
      { from: "eda_sc_analyst", fromPort: "response", to: "eda_barrier", toPort: "input_b" },
      { from: "eda_sales_analyst", fromPort: "response", to: "eda_barrier", toPort: "input_c" },
      // Question + Barrier → Merge → Orchestrator
      { from: "eda_question", fromPort: "output", to: "eda_merge_q", toPort: "input_a" },
      { from: "eda_barrier", fromPort: "synced", to: "eda_merge_q", toPort: "input_b" },
      { from: "eda_merge_q", fromPort: "merged", to: "eda_orchestrator", toPort: "prompt" },
      // Orchestrator → Risk Check
      { from: "eda_orchestrator", fromPort: "response", to: "eda_risk_check", toPort: "input" },
      // Risk routing
      { from: "eda_risk_check", fromPort: "true", to: "eda_mitigation", toPort: "prompt" },
      { from: "eda_risk_check", fromPort: "false", to: "eda_growth", toPort: "prompt" },
      // Final outputs
      { from: "eda_mitigation", fromPort: "response", to: "eda_output_risk", toPort: "input" },
      { from: "eda_growth", fromPort: "response", to: "eda_output_growth", toPort: "input" },
    ],
  },

  // ---- 8. Ensemble + Supervisor Pipeline ----
  "Multi-Agent Pipeline": {
    version: 1,
    metadata: { name: "Multi-Agent Pipeline", created: Date.now(), modified: Date.now() },
    nodes: [
      { id: "ex7_input", type: "input", x: 60, y: 200,
        config: { label: "Research Question", inputType: "text", defaultValue: "What are the 3 most promising applications of quantum computing in the next 5 years?" }},
      { id: "ex7_ensemble", type: "ensemble", x: 340, y: 120,
        config: { label: "Research Ensemble", model: "claude-sonnet-4-20250514", agentCount: 3, aggregation: "best" }},
      { id: "ex7_supervisor", type: "supervisor", x: 340, y: 300,
        config: { label: "Deep Dive Supervisor", model: "claude-sonnet-4-20250514", workerCount: 3 }},
      { id: "ex7_barrier", type: "barrier", x: 620, y: 200,
        config: { label: "Sync Results", waitForAll: true }},
      { id: "ex7_merge_llm", type: "llm", x: 880, y: 200,
        config: { label: "Final Synthesis", provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt: "Synthesize the ensemble research and the supervisor deep-dive into a concise executive report with clear recommendations.", promptTemplate: "{{input}}", temperature: 0.4, maxTokens: 800 }},
      { id: "ex7_output", type: "output", x: 1140, y: 200,
        config: { label: "Research Report", format: "markdown" }},
    ],
    edges: [
      { from: "ex7_input", fromPort: "output", to: "ex7_ensemble", toPort: "input" },
      { from: "ex7_input", fromPort: "output", to: "ex7_supervisor", toPort: "task" },
      { from: "ex7_ensemble", fromPort: "result", to: "ex7_barrier", toPort: "input_a" },
      { from: "ex7_supervisor", fromPort: "result", to: "ex7_barrier", toPort: "input_b" },
      { from: "ex7_barrier", fromPort: "synced", to: "ex7_merge_llm", toPort: "prompt" },
      { from: "ex7_merge_llm", fromPort: "response", to: "ex7_output", toPort: "input" },
    ],
  },
};
