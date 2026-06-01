/* ============================================
   AgentForge — Natural Language Flow Builder
   Describe a pipeline in English, AI generates it
   ============================================ */

class NLFlowBuilder {
  constructor() {
    this._templates = this._buildTemplates();
  }

  /* ---- Main entry point ---- */
  async generate(prompt) {
    // Try real API if key is available
    const apiKey = Utils.getApiKey();
    if (apiKey) {
      try {
        const flow = await this._callAPI(apiKey, prompt);
        if (flow && flow.nodes && flow.nodes.length > 0) return flow;
      } catch (e) {
        console.warn('NLBuilder: API call failed, using templates', e);
      }
    }
    // Fallback: template matching (always works offline)
    return this._matchTemplate(prompt);
  }

  /* ---- Template matching ---- */
  _matchTemplate(prompt) {
    const lower = prompt.toLowerCase();
    const scores = [];

    for (const [key, tpl] of Object.entries(this._templates)) {
      let score = 0;
      for (const kw of tpl.keywords) {
        if (lower.includes(kw)) score += kw.length; // longer matches = higher weight
      }
      scores.push({ key, score, flow: tpl.flow });
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    // Deep-clone the flow to avoid mutating templates
    const flow = JSON.parse(JSON.stringify(best.score > 0 ? best.flow : this._templates.generic.flow));

    // Update metadata
    flow.metadata.name = this._extractFlowName(prompt);
    flow.metadata.created = Date.now();
    flow.metadata.modified = Date.now();

    return flow;
  }

  _extractFlowName(prompt) {
    // Try to make a name from the prompt
    const cleaned = prompt.replace(/^(build|create|make|design|generate)\s+(me\s+)?(a\s+)?/i, '');
    const words = cleaned.split(/\s+/).slice(0, 5);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  /* ---- Real API call (bonus path) ---- */
  async _callAPI(apiKey, prompt) {
    const schema = `{ version: 1, metadata: { name: "..." }, nodes: [{ id, type, x, y, config }], edges: [{ from, fromPort, to, toPort }] }`;
    const nodeTypes = 'input, output, llm, tool, condition, loop, merge, datasource, debate, ensemble, supervisor, barrier';

    const systemPrompt = `You are a pipeline architect for AgentForge. Generate valid flow JSON.
Schema: ${schema}
Node types: ${nodeTypes}
Port names: input nodes have "output" port. LLM nodes have "prompt" input and "response" output. Condition has "input", "true", "false". Merge has "input_a", "input_b", "merged". Output has "input". Tool has "input", "result". Barrier has "input_a"..."input_c", "synced".
LLM config: { label, provider: "anthropic", model: "claude-sonnet-4-20250514", systemPrompt, promptTemplate: "{{input}}", temperature, maxTokens }
Space nodes ~280px apart horizontally. Keep y between 80-400.
Output ONLY valid JSON, nothing else.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Build me a pipeline that: ${prompt}` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    const text = data.content[0].text;

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    return JSON.parse(jsonMatch[0]);
  }

  /* ---- Pre-built template flows ---- */
  _buildTemplates() {
    return {

      // -- Customer Support with Sentiment Routing --
      sentiment: {
        keywords: ['sentiment', 'customer', 'support', 'service', 'ticket', 'complaint', 'routing', 'escalat', 'negative', 'positive', 'classify', 'triage'],
        flow: {
          version: 1,
          metadata: { name: 'Customer Support Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Customer Message', inputType: 'text', defaultValue: "I've been waiting 3 weeks for my order and nobody responds to my emails. This is terrible service!" }},
            { id: 'nl_classifier', type: 'llm', x: 340, y: 200,
              config: { label: 'Sentiment Classifier', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a sentiment classifier. Respond with ONLY one word: positive, negative, or neutral. Nothing else.', promptTemplate: 'Classify the sentiment of this message:\n\n{{input}}', temperature: 0, maxTokens: 10 }},
            { id: 'nl_condition', type: 'condition', x: 620, y: 200,
              config: { label: 'Is Negative?', expression: "input.toLowerCase().includes('negative')", evaluator: 'javascript' }},
            { id: 'nl_escalate', type: 'llm', x: 900, y: 100,
              config: { label: 'Escalation Drafter', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a customer service manager. Draft a sincere, empathetic apology response. Keep it under 3 sentences.', promptTemplate: 'A customer sent this angry message. Draft an apology:\n\n{{input}}', temperature: 0.5, maxTokens: 200 }},
            { id: 'nl_standard', type: 'llm', x: 900, y: 320,
              config: { label: 'Standard Reply', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a friendly customer service agent. Write a brief, helpful reply.', promptTemplate: 'Reply to this customer message:\n\n{{input}}', temperature: 0.7, maxTokens: 200 }},
            { id: 'nl_out_urgent', type: 'output', x: 1180, y: 100,
              config: { label: 'Urgent Reply', format: 'text' }},
            { id: 'nl_out_normal', type: 'output', x: 1180, y: 320,
              config: { label: 'Normal Reply', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_classifier', toPort: 'prompt' },
            { from: 'nl_classifier', fromPort: 'response', to: 'nl_condition', toPort: 'input' },
            { from: 'nl_condition', fromPort: 'true', to: 'nl_escalate', toPort: 'prompt' },
            { from: 'nl_condition', fromPort: 'false', to: 'nl_standard', toPort: 'prompt' },
            { from: 'nl_escalate', fromPort: 'response', to: 'nl_out_urgent', toPort: 'input' },
            { from: 'nl_standard', fromPort: 'response', to: 'nl_out_normal', toPort: 'input' },
          ],
        },
      },

      // -- RAG Pipeline --
      rag: {
        keywords: ['rag', 'retrieval', 'retriev', 'search', 'document', 'knowledge', 'vector', 'context', 'augment'],
        flow: {
          version: 1,
          metadata: { name: 'RAG Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'User Question', inputType: 'text', defaultValue: "What is our company's return policy for electronics?" }},
            { id: 'nl_retriever', type: 'tool', x: 340, y: 120,
              config: { label: 'Knowledge Retriever', toolType: 'function', method: 'GET', url: '', body: '', headers: '' }},
            { id: 'nl_rewriter', type: 'llm', x: 340, y: 300,
              config: { label: 'Query Optimizer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'Rewrite the user question to be more specific for a knowledge base search. Output only the rewritten query.', promptTemplate: '{{input}}', temperature: 0.3, maxTokens: 100 }},
            { id: 'nl_merge', type: 'merge', x: 620, y: 200,
              config: { label: 'Combine Context', strategy: 'template', template: 'RETRIEVED CONTEXT:\n{{input_a}}\n\nOPTIMIZED QUERY:\n{{input_b}}', waitForAll: true }},
            { id: 'nl_generator', type: 'llm', x: 900, y: 200,
              config: { label: 'Answer Generator', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a helpful assistant. Answer the question using only the provided context. Cite specific parts of the context.', promptTemplate: '{{input}}', temperature: 0.5, maxTokens: 500 }},
            { id: 'nl_output', type: 'output', x: 1180, y: 200,
              config: { label: 'Answer', format: 'markdown' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_retriever', toPort: 'input' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_rewriter', toPort: 'prompt' },
            { from: 'nl_retriever', fromPort: 'result', to: 'nl_merge', toPort: 'input_a' },
            { from: 'nl_rewriter', fromPort: 'response', to: 'nl_merge', toPort: 'input_b' },
            { from: 'nl_merge', fromPort: 'merged', to: 'nl_generator', toPort: 'prompt' },
            { from: 'nl_generator', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Multi-Agent Debate --
      debate: {
        keywords: ['debate', 'research', 'compare', 'multi-agent', 'versus', 'pros', 'cons', 'argue', 'discuss', 'team'],
        flow: {
          version: 1,
          metadata: { name: 'Multi-Agent Research', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Research Topic', inputType: 'text', defaultValue: 'Should AI systems be required to identify themselves as AI in all interactions with humans?' }},
            { id: 'nl_debate', type: 'debate', x: 340, y: 120,
              config: { label: 'Expert Debate', model: 'claude-sonnet-4-20250514', rounds: 2 }},
            { id: 'nl_ensemble', type: 'ensemble', x: 340, y: 300,
              config: { label: 'Research Ensemble', model: 'claude-sonnet-4-20250514', agentCount: 3, aggregation: 'best' }},
            { id: 'nl_barrier', type: 'barrier', x: 620, y: 200,
              config: { label: 'Sync Results', waitForAll: true }},
            { id: 'nl_synthesizer', type: 'llm', x: 900, y: 200,
              config: { label: 'Research Synthesizer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'Synthesize the debate results and ensemble research into a concise executive report with clear conclusions and recommendations.', promptTemplate: '{{input}}', temperature: 0.4, maxTokens: 800 }},
            { id: 'nl_output', type: 'output', x: 1180, y: 200,
              config: { label: 'Research Report', format: 'markdown' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_debate', toPort: 'topic' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_ensemble', toPort: 'input' },
            { from: 'nl_debate', fromPort: 'verdict', to: 'nl_barrier', toPort: 'input_a' },
            { from: 'nl_ensemble', fromPort: 'result', to: 'nl_barrier', toPort: 'input_b' },
            { from: 'nl_barrier', fromPort: 'synced', to: 'nl_synthesizer', toPort: 'prompt' },
            { from: 'nl_synthesizer', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Summarize & Translate --
      summarize: {
        keywords: ['summarize', 'summary', 'translate', 'content', 'article', 'language', 'moderate', 'moderation', 'filter', 'review', 'write', 'blog'],
        flow: {
          version: 1,
          metadata: { name: 'Content Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Content Input', inputType: 'text', defaultValue: 'The European Central Bank held interest rates steady on Thursday, keeping its benchmark rate at 2.75%. ECB President Christine Lagarde said inflation was declining but warned that risks remain. Analysts expect the ECB to consider a rate cut at its next meeting.' }},
            { id: 'nl_summarize', type: 'llm', x: 340, y: 120,
              config: { label: 'Summarizer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a concise summarizer. Output exactly 1-2 sentences.', promptTemplate: 'Summarize this content:\n\n{{input}}', temperature: 0.3, maxTokens: 200 }},
            { id: 'nl_translate', type: 'llm', x: 340, y: 320,
              config: { label: 'Translator', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'Translate the input to Spanish. Output ONLY the translation.', promptTemplate: '{{input}}', temperature: 0.2, maxTokens: 300 }},
            { id: 'nl_merge', type: 'merge', x: 620, y: 200,
              config: { label: 'Combine', strategy: 'template', template: 'SUMMARY:\n{{input_a}}\n\nSPANISH:\n{{input_b}}', waitForAll: true }},
            { id: 'nl_output', type: 'output', x: 900, y: 200,
              config: { label: 'Final Output', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_summarize', toPort: 'prompt' },
            { from: 'nl_summarize', fromPort: 'response', to: 'nl_translate', toPort: 'prompt' },
            { from: 'nl_summarize', fromPort: 'response', to: 'nl_merge', toPort: 'input_a' },
            { from: 'nl_translate', fromPort: 'response', to: 'nl_merge', toPort: 'input_b' },
            { from: 'nl_merge', fromPort: 'merged', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Content Moderation Pipeline --
      moderation: {
        keywords: ['moderate', 'moderation', 'toxic', 'safety', 'harmful', 'flag', 'approve', 'reject', 'content review', 'guardrail', 'filter', 'abuse', 'hate'],
        flow: {
          version: 1,
          metadata: { name: 'Content Moderation Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'User Content', inputType: 'text', defaultValue: "I absolutely hate this product, it's a complete scam and the people who made it should be ashamed. WORST PURCHASE EVER." }},
            { id: 'nl_toxicity', type: 'llm', x: 340, y: 120,
              config: { label: 'Toxicity Scorer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a content safety classifier. Rate the toxicity of the input on a scale of 1-10 and classify as: SAFE, WARNING, or DANGEROUS. Format: SCORE: X/10 | CLASS: [label] | REASON: [brief reason]', promptTemplate: 'Analyze this content for toxicity:\n\n{{input}}', temperature: 0, maxTokens: 100 }},
            { id: 'nl_pii', type: 'llm', x: 340, y: 320,
              config: { label: 'PII Detector', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a PII detection system. Check for personal information (emails, phones, addresses, names). Respond with: PII_FOUND or PII_CLEAR followed by details.', promptTemplate: 'Scan for PII:\n\n{{input}}', temperature: 0, maxTokens: 100 }},
            { id: 'nl_merge', type: 'merge', x: 620, y: 200,
              config: { label: 'Combine Checks', strategy: 'template', template: 'TOXICITY REPORT:\n{{input_a}}\n\nPII REPORT:\n{{input_b}}', waitForAll: true }},
            { id: 'nl_decision', type: 'condition', x: 900, y: 200,
              config: { label: 'Auto-Approve?', expression: "input.includes('SAFE') && input.includes('PII_CLEAR')", evaluator: 'javascript' }},
            { id: 'nl_approve', type: 'output', x: 1180, y: 120,
              config: { label: '✅ Published', format: 'text' }},
            { id: 'nl_review', type: 'output', x: 1180, y: 300,
              config: { label: '🚨 Needs Review', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_toxicity', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_pii', toPort: 'prompt' },
            { from: 'nl_toxicity', fromPort: 'response', to: 'nl_merge', toPort: 'input_a' },
            { from: 'nl_pii', fromPort: 'response', to: 'nl_merge', toPort: 'input_b' },
            { from: 'nl_merge', fromPort: 'merged', to: 'nl_decision', toPort: 'input' },
            { from: 'nl_decision', fromPort: 'true', to: 'nl_approve', toPort: 'input' },
            { from: 'nl_decision', fromPort: 'false', to: 'nl_review', toPort: 'input' },
          ],
        },
      },

      // -- Code Review Pipeline --
      codereview: {
        keywords: ['code review', 'code', 'review', 'lint', 'bug', 'security', 'vulnerability', 'pull request', 'pr review', 'refactor', 'code quality'],
        flow: {
          version: 1,
          metadata: { name: 'AI Code Review Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Code Snippet', inputType: 'text', defaultValue: 'function login(user, pass) {\n  const query = "SELECT * FROM users WHERE name=\'" + user + "\' AND pass=\'" + pass + "\'";\n  return db.execute(query);\n}' }},
            { id: 'nl_security', type: 'llm', x: 340, y: 80,
              config: { label: 'Security Auditor', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a security auditor. Find vulnerabilities (SQL injection, XSS, auth issues). Format: [CRITICAL/HIGH/MEDIUM/LOW] - description. Be specific.', promptTemplate: 'Audit this code for security vulnerabilities:\n\n{{input}}', temperature: 0, maxTokens: 300 }},
            { id: 'nl_quality', type: 'llm', x: 340, y: 240,
              config: { label: 'Quality Analyzer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a code quality expert. Check for: error handling, edge cases, performance issues, naming conventions. Give a quality score out of 10.', promptTemplate: 'Review code quality:\n\n{{input}}', temperature: 0.2, maxTokens: 300 }},
            { id: 'nl_fix', type: 'llm', x: 340, y: 400,
              config: { label: 'Auto-Fixer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a senior developer. Rewrite the code to fix all security and quality issues. Output ONLY the corrected code.', promptTemplate: 'Fix all issues in this code:\n\n{{input}}', temperature: 0.3, maxTokens: 500 }},
            { id: 'nl_barrier', type: 'barrier', x: 620, y: 200,
              config: { label: 'Sync Reviews', waitForAll: true }},
            { id: 'nl_report', type: 'llm', x: 900, y: 200,
              config: { label: 'Report Generator', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a code review report generator. Combine the security audit, quality analysis, and fixed code into a concise PR review comment. Start with a verdict: APPROVE, REQUEST_CHANGES, or BLOCK.', promptTemplate: 'Generate review report:\n\n{{input}}', temperature: 0.3, maxTokens: 500 }},
            { id: 'nl_output', type: 'output', x: 1180, y: 200,
              config: { label: 'Review Report', format: 'markdown' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_security', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_quality', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_fix', toPort: 'prompt' },
            { from: 'nl_security', fromPort: 'response', to: 'nl_barrier', toPort: 'input_a' },
            { from: 'nl_quality', fromPort: 'response', to: 'nl_barrier', toPort: 'input_b' },
            { from: 'nl_fix', fromPort: 'response', to: 'nl_barrier', toPort: 'input_c' },
            { from: 'nl_barrier', fromPort: 'synced', to: 'nl_report', toPort: 'prompt' },
            { from: 'nl_report', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Data Processing ETL --
      etl: {
        keywords: ['data', 'etl', 'pipeline', 'transform', 'clean', 'process', 'validate', 'enrich', 'ingest', 'extract', 'load', 'csv', 'json', 'parse'],
        flow: {
          version: 1,
          metadata: { name: 'Data Processing Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Raw Data', inputType: 'text', defaultValue: '{"transactions": [{"id": 1, "amount": "$5,200", "date": "03/15/2026", "merchant": "AMZN*MARKETPLACE", "category": ""}, {"id": 2, "amount": "$89.99", "date": "03/14/2026", "merchant": "NETFLIX.COM", "category": ""}]}' }},
            { id: 'nl_validate', type: 'llm', x: 340, y: 120,
              config: { label: 'Data Validator', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a data validation engine. Check the input data for: missing fields, invalid formats, outliers, duplicates. Output a validation report with PASS/FAIL status for each record.', promptTemplate: 'Validate this data:\n\n{{input}}', temperature: 0, maxTokens: 300 }},
            { id: 'nl_clean', type: 'llm', x: 340, y: 320,
              config: { label: 'Data Cleaner', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a data cleaning engine. Standardize formats (dates to ISO, currency to numbers), fill missing categories by inferring from merchant names, remove duplicates. Output clean JSON.', promptTemplate: 'Clean and standardize this data:\n\n{{input}}', temperature: 0, maxTokens: 500 }},
            { id: 'nl_merge', type: 'merge', x: 620, y: 200,
              config: { label: 'Combine Results', strategy: 'template', template: 'VALIDATION:\n{{input_a}}\n\nCLEANED DATA:\n{{input_b}}', waitForAll: true }},
            { id: 'nl_enrich', type: 'llm', x: 900, y: 200,
              config: { label: 'Data Enricher', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a data enrichment engine. Take the cleaned data and add: risk flags for high-value transactions, spending category tags, and a summary statistics block at the end.', promptTemplate: 'Enrich this processed data:\n\n{{input}}', temperature: 0.2, maxTokens: 500 }},
            { id: 'nl_output', type: 'output', x: 1180, y: 200,
              config: { label: 'Enriched Dataset', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_validate', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_clean', toPort: 'prompt' },
            { from: 'nl_validate', fromPort: 'response', to: 'nl_merge', toPort: 'input_a' },
            { from: 'nl_clean', fromPort: 'response', to: 'nl_merge', toPort: 'input_b' },
            { from: 'nl_merge', fromPort: 'merged', to: 'nl_enrich', toPort: 'prompt' },
            { from: 'nl_enrich', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Executive Decision Intelligence --
      decision: {
        keywords: ['decision', 'executive', 'strategy', 'revenue', 'churn', 'nps', 'pipeline', 'forecast', 'kpi', 'quarterly', 'board', 'stakeholder', 'risk assessment', 'business', 'intelligence', 'metrics'],
        flow: {
          version: 1,
          metadata: { name: 'Decision Intelligence Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Business Data', inputType: 'text', defaultValue: 'Revenue is down 8% in EMEA but up 12% in APAC. Customer churn spiked from 3.1% to 4.2% this quarter. NPS dropped from 71 to 62. Pipeline has $4.2M in weighted deals but 40% are stalled over 30 days.' }},
            { id: 'nl_financial', type: 'llm', x: 340, y: 80,
              config: { label: 'Financial Analyst', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a senior financial analyst. Analyze the data for revenue trends, margin risks, and financial health indicators. Quantify the impact. Output: KEY FINDINGS, RISK LEVEL (LOW/MEDIUM/HIGH/CRITICAL), and FINANCIAL IMPACT estimate.', promptTemplate: 'Analyze financial data:\n\n{{input}}', temperature: 0.2, maxTokens: 400 }},
            { id: 'nl_customer', type: 'llm', x: 340, y: 240,
              config: { label: 'Customer Intelligence', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a customer success strategist. Analyze churn rates, NPS trends, and customer satisfaction signals. Identify root causes and leading indicators. Output: CHURN DRIVERS, RETENTION RISK, and IMMEDIATE ACTIONS needed.', promptTemplate: 'Analyze customer metrics:\n\n{{input}}', temperature: 0.2, maxTokens: 400 }},
            { id: 'nl_market', type: 'llm', x: 340, y: 400,
              config: { label: 'Market Strategist', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a market strategist. Analyze pipeline health, deal velocity, win rates, and competitive positioning. Identify bottlenecks and growth opportunities. Output: PIPELINE HEALTH, DEAL RISKS, and GROWTH LEVERS.', promptTemplate: 'Analyze market and pipeline data:\n\n{{input}}', temperature: 0.2, maxTokens: 400 }},
            { id: 'nl_barrier', type: 'barrier', x: 620, y: 200,
              config: { label: 'Sync Analysis', waitForAll: true }},
            { id: 'nl_cso', type: 'llm', x: 900, y: 200,
              config: { label: 'Chief Strategy Officer', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a Chief Strategy Officer. Synthesize the financial analysis, customer intelligence, and market strategy into an executive decision brief. Prioritize the top 3 actions by impact and urgency. Format: EXECUTIVE SUMMARY, RISK MATRIX (2x2 impact vs urgency), TOP 3 RECOMMENDATIONS with owners and deadlines, and DECISION REQUIRED from leadership.', promptTemplate: 'Synthesize all analyses into executive brief:\n\n{{input}}', temperature: 0.3, maxTokens: 800 }},
            { id: 'nl_output', type: 'output', x: 1180, y: 200,
              config: { label: 'Executive Brief', format: 'markdown' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_financial', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_customer', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_market', toPort: 'prompt' },
            { from: 'nl_financial', fromPort: 'response', to: 'nl_barrier', toPort: 'input_a' },
            { from: 'nl_customer', fromPort: 'response', to: 'nl_barrier', toPort: 'input_b' },
            { from: 'nl_market', fromPort: 'response', to: 'nl_barrier', toPort: 'input_c' },
            { from: 'nl_barrier', fromPort: 'synced', to: 'nl_cso', toPort: 'prompt' },
            { from: 'nl_cso', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },

      // -- Supply Chain Risk Monitor --
      supplychain: {
        keywords: ['supply chain', 'supply', 'logistics', 'inventory', 'supplier', 'procurement', 'lead time', 'stockout', 'sku', 'warehouse', 'demand', 'forecast'],
        flow: {
          version: 1,
          metadata: { name: 'Supply Chain Intelligence', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 60, y: 200,
              config: { label: 'Supply Chain Data', inputType: 'text', defaultValue: 'Supply chain lead times for our top 5 SKUs exceeded 45 days. Three key suppliers flagged capacity constraints. Warehouse utilization at 94%. Demand forecast shows 15% spike for Q2.' }},
            { id: 'nl_risk', type: 'llm', x: 340, y: 120,
              config: { label: 'Risk Assessor', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a supply chain risk analyst. Assess risks from lead times, supplier constraints, and capacity data. Classify each risk as RED/AMBER/GREEN. Identify single points of failure and cascading risk scenarios.', promptTemplate: 'Assess supply chain risks:\n\n{{input}}', temperature: 0.1, maxTokens: 400 }},
            { id: 'nl_demand', type: 'llm', x: 340, y: 320,
              config: { label: 'Demand Planner', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a demand planning specialist. Analyze demand signals, forecast accuracy, and inventory levels. Recommend safety stock adjustments and reorder points. Flag any demand-supply mismatches.', promptTemplate: 'Analyze demand and inventory:\n\n{{input}}', temperature: 0.1, maxTokens: 400 }},
            { id: 'nl_merge', type: 'merge', x: 620, y: 200,
              config: { label: 'Combine Intel', strategy: 'template', template: 'RISK ASSESSMENT:\n{{input_a}}\n\nDEMAND ANALYSIS:\n{{input_b}}', waitForAll: true }},
            { id: 'nl_condition', type: 'condition', x: 900, y: 200,
              config: { label: 'Critical Risk?', expression: "input.includes('RED') || input.includes('CRITICAL')", evaluator: 'javascript' }},
            { id: 'nl_alert', type: 'output', x: 1180, y: 120,
              config: { label: '🔴 War Room Alert', format: 'text' }},
            { id: 'nl_monitor', type: 'output', x: 1180, y: 300,
              config: { label: '🟢 Continue Monitoring', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_risk', toPort: 'prompt' },
            { from: 'nl_input', fromPort: 'output', to: 'nl_demand', toPort: 'prompt' },
            { from: 'nl_risk', fromPort: 'response', to: 'nl_merge', toPort: 'input_a' },
            { from: 'nl_demand', fromPort: 'response', to: 'nl_merge', toPort: 'input_b' },
            { from: 'nl_merge', fromPort: 'merged', to: 'nl_condition', toPort: 'input' },
            { from: 'nl_condition', fromPort: 'true', to: 'nl_alert', toPort: 'input' },
            { from: 'nl_condition', fromPort: 'false', to: 'nl_monitor', toPort: 'input' },
          ],
        },
      },

      // -- Generic fallback --
      generic: {
        keywords: [],
        flow: {
          version: 1,
          metadata: { name: 'AI Pipeline', created: Date.now(), modified: Date.now() },
          nodes: [
            { id: 'nl_input', type: 'input', x: 80, y: 200,
              config: { label: 'Input', inputType: 'text', defaultValue: 'Enter your prompt here...' }},
            { id: 'nl_llm1', type: 'llm', x: 380, y: 140,
              config: { label: 'Processor', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a helpful AI assistant. Process the input thoroughly.', promptTemplate: '{{input}}', temperature: 0.7, maxTokens: 1024 }},
            { id: 'nl_llm2', type: 'llm', x: 680, y: 140,
              config: { label: 'Refiner', provider: 'anthropic', model: 'claude-sonnet-4-20250514', systemPrompt: 'You are a quality reviewer. Refine and improve the previous output. Make it clearer and more actionable.', promptTemplate: 'Refine this:\n\n{{input}}', temperature: 0.5, maxTokens: 1024 }},
            { id: 'nl_output', type: 'output', x: 980, y: 200,
              config: { label: 'Result', format: 'text' }},
          ],
          edges: [
            { from: 'nl_input', fromPort: 'output', to: 'nl_llm1', toPort: 'prompt' },
            { from: 'nl_llm1', fromPort: 'response', to: 'nl_llm2', toPort: 'prompt' },
            { from: 'nl_llm2', fromPort: 'response', to: 'nl_output', toPort: 'input' },
          ],
        },
      },
    };
  }
}
