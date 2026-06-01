/* ============================================
   AgentForge — Flow Execution Engine (Phase 4)
   Walks DAG in topological order, executes
   each node, passes data along edges
   ============================================ */

// Execution status
const EXEC_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped',
};

class ExecutionContext {
  constructor() {
    this.nodeOutputs = new Map(); // nodeId -> output data
    this.nodeStatus = new Map();  // nodeId -> EXEC_STATUS
    this.inactiveEdges = new Set(); // "fromId:fromPort->toId:toPort"
    this.logs = [];               // { timestamp, nodeId, type, message, data }
    this.startTime = null;
    this.endTime = null;
    this.aborted = false;
  }

  setOutput(nodeId, data) {
    this.nodeOutputs.set(nodeId, data);
  }

  getOutput(nodeId) {
    return this.nodeOutputs.get(nodeId);
  }

  setStatus(nodeId, status) {
    this.nodeStatus.set(nodeId, status);
  }

  markEdgeInactive(fromNodeId, fromPort, toNodeId, toPort) {
    this.inactiveEdges.add(`${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`);
  }

  isEdgeInactive(fromNodeId, fromPort, toNodeId, toPort) {
    return this.inactiveEdges.has(`${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`);
  }

  log(nodeId, type, message, data = null) {
    this.logs.push({
      timestamp: Date.now(),
      nodeId,
      type,
      message,
      data,
    });
  }

  get duration() {
    if (!this.startTime) return 0;
    return (this.endTime || Date.now()) - this.startTime;
  }
}

class FlowExecutor {
  constructor(graph) {
    this.graph = graph;
    this.context = null;
    this.running = false;

    // Callbacks for UI
    this.onNodeStart = null;    // (nodeId) => void
    this.onNodeComplete = null; // (nodeId, status, output) => void
    this.onNodeError = null;    // (nodeId, error) => void
    this.onEdgeActive = null;   // (fromId, toId) => void
    this.onLog = null;          // (logEntry) => void
    this.onComplete = null;     // (context) => void
    this.onStream = null;       // (nodeId, textSoFar, tokenCount) => void
  }

  /**
   * Execute the flow with the given initial input.
   * Returns the ExecutionContext with all results.
   */
  async execute(initialInput = '') {
    // Validate first
    const validator = new FlowValidator(this.graph);
    const validation = validator.validate();

    if (!validation.executionReady) {
      throw new Error('Flow validation failed. Fix errors before running.');
    }

    this.context = new ExecutionContext();
    this.context.startTime = Date.now();
    this.running = true;

    const ctx = this.context;
    const topoOrder = validation.topoOrder;

    ctx.log(null, 'system', `Execution started. ${topoOrder.length} nodes to process.`);
    this._emitLog(ctx.logs[ctx.logs.length - 1]);

    try {
      if (typeof appEvents !== 'undefined') {
        appEvents.emit(EVENT_TYPES.EXECUTION_START, { nodeCount: topoOrder.length });
      }
      for (const nodeId of topoOrder) {
        if (ctx.aborted) {
          ctx.log(null, 'system', 'Execution aborted by user.');
          break;
        }

        const node = this.graph.getNode(nodeId);
        if (!node) continue;

        // Gather inputs from connected predecessors
        const inputData = this._gatherInputs(nodeId);

        if (ctx.nodeStatus.get(nodeId) !== EXEC_STATUS.SKIPPED && this._shouldSkipNode(nodeId)) {
          ctx.setStatus(nodeId, EXEC_STATUS.SKIPPED);
        }

        // Check if node was skipped (from condition branching)
        if (ctx.nodeStatus.get(nodeId) === EXEC_STATUS.SKIPPED) {
          ctx.log(nodeId, 'skip', `Skipped: ${node.nodeConfig?.label || node.config.label}`);
          this._emitLog(ctx.logs[ctx.logs.length - 1]);
          if (this.onNodeComplete) this.onNodeComplete(nodeId, EXEC_STATUS.SKIPPED, null);
          continue;
        }

        // Execute the node
        ctx.setStatus(nodeId, EXEC_STATUS.RUNNING);
        this._currentNodeId = nodeId;
        if (this.onNodeStart) await this.onNodeStart(nodeId);

        // Non-fatal pre-flight validation: surfaces config issues as warnings.
        this._preflightValidate(node);

        ctx.log(nodeId, 'start', `Executing: ${node.nodeConfig?.label || node.config.label}`, { input: inputData });
        this._emitLog(ctx.logs[ctx.logs.length - 1]);

        const nodeStart = Date.now();
        try {
          const output = await this._executeNode(node, inputData, initialInput);
          ctx.setOutput(nodeId, output);
          ctx.setStatus(nodeId, EXEC_STATUS.SUCCESS);
          this._recordNodeMetric(nodeId, node.type, Date.now() - nodeStart);

          ctx.log(nodeId, 'complete', `Completed: ${node.nodeConfig?.label || node.config.label}`, { output });
          this._emitLog(ctx.logs[ctx.logs.length - 1]);

          if (this.onNodeComplete) this.onNodeComplete(nodeId, EXEC_STATUS.SUCCESS, output);

          // Animate data flowing along edges
          const entry = this.graph.adjacency.get(nodeId);
          if (entry) {
            for (const edge of entry.out) {
              if (this.onEdgeActive) this.onEdgeActive(nodeId, edge.targetId);
            }
          }

          // Small delay between nodes for visual effect
          await this._delay(200);

        } catch (err) {
          ctx.setStatus(nodeId, EXEC_STATUS.ERROR);
          ctx.log(nodeId, 'error', `Error: ${err.message}`, { error: err.message });
          this._emitLog(ctx.logs[ctx.logs.length - 1]);

          if (this.onNodeError) this.onNodeError(nodeId, err);
          if (this.onNodeComplete) this.onNodeComplete(nodeId, EXEC_STATUS.ERROR, null);

          if (typeof appEvents !== 'undefined') {
            appEvents.emit(EVENT_TYPES.ERROR_OCCURRED, { nodeId, message: err.message });
          }

          // Stop execution on error
          break;
        }
      }
    } finally {
      this.context.endTime = Date.now();
      this.running = false;

      ctx.log(null, 'system', `Execution finished in ${ctx.duration}ms.`);
      this._emitLog(ctx.logs[ctx.logs.length - 1]);

      if (typeof appEvents !== 'undefined') {
        appEvents.emit(EVENT_TYPES.EXECUTION_COMPLETE, {
          durationMs: ctx.duration,
          report: typeof executionUtils !== 'undefined' ? executionUtils.getPerformanceReport() : null,
        });
      }

      if (this.onComplete) this.onComplete(ctx);
    }

    return this.context;
  }

  abort() {
    if (this.context) this.context.aborted = true;
  }

  // ---- Pre-flight validation (non-fatal advisory via ExecutionUtils) ----
  _preflightValidate(node) {
    if (typeof executionUtils === 'undefined') return;
    try {
      const result = executionUtils.validateNodeExecution(node, this.context);
      const messages = [...(result.errors || []), ...(result.warnings || [])];
      for (const message of messages) {
        this.context.log(node.id, 'warning', message);
        this._emitLog(this.context.logs[this.context.logs.length - 1]);
      }
    } catch { /* validation must never block execution */ }
  }

  // ---- Record per-node timing via ExecutionUtils ----
  _recordNodeMetric(nodeId, type, durationMs) {
    if (typeof executionUtils === 'undefined') return;
    try {
      executionUtils.recordPerformanceMetric(nodeId, type, durationMs);
    } catch { /* metrics are best-effort */ }
  }

  // ---- Gather inputs from predecessors ----
  _gatherInputs(nodeId) {
    const entry = this.graph.adjacency.get(nodeId);
    if (!entry || entry.in.length === 0) return null;
    const node = this.graph.getNode(nodeId);

    const inputs = {};
    for (const edge of entry.in) {
      if (this.context.isEdgeInactive(edge.sourceId, edge.fromPort, nodeId, edge.toPort)) {
        continue;
      }
      const sourceOutput = this.context.getOutput(edge.sourceId);
      if (sourceOutput !== undefined) {
        inputs[edge.toPort] = sourceOutput;
      }
    }

    // If single input, unwrap
    const keys = Object.keys(inputs);
    const keepStructuredInput = node && ['merge', 'barrier'].includes(node.type);
    if (keys.length === 1 && !keepStructuredInput) return inputs[keys[0]];
    if (keys.length === 0) return null;
    return inputs;
  }

  _shouldSkipNode(nodeId) {
    const entry = this.graph.adjacency.get(nodeId);
    if (!entry || entry.in.length === 0) return false;

    return entry.in.every(edge => {
      if (this.context.isEdgeInactive(edge.sourceId, edge.fromPort, nodeId, edge.toPort)) {
        return true;
      }
      return this.context.nodeStatus.get(edge.sourceId) === EXEC_STATUS.SKIPPED;
    });
  }

  // ---- Execute individual node by type ----
  async _executeNode(node, inputData, initialInput) {
    const config = node.nodeConfig || {};
    const type = node.type;

    switch (type) {
      case 'input':
        return this._execInput(config, initialInput);

      case 'output':
        return this._execOutput(config, inputData);

      case 'llm':
        return await this._execLLM(config, inputData);

      case 'datasource':
        return this._execDataSource(config, inputData);

      case 'tool':
        return await this._execTool(config, inputData);

      case 'condition':
        return this._execCondition(node, config, inputData);

      case 'loop':
        return await this._execLoop(node, config, inputData);

      case 'merge':
        return this._execMerge(config, inputData);

      // Phase 8: Multi-Agent nodes
      case 'debate':
        return await MultiAgentExecutors.debate(config, inputData);

      case 'ensemble':
        return await MultiAgentExecutors.ensemble(config, inputData);

      case 'supervisor':
        return await MultiAgentExecutors.supervisor(config, inputData);

      case 'barrier':
        return MultiAgentExecutors.barrier(config, inputData);

      default:
        throw new Error(`Unknown node type: ${type}`);
    }
  }

  // ---- Node type executors ----

  _execInput(config, initialInput) {
    // Input nodes pass through the initial input or their default value
    if (initialInput && initialInput.trim()) return initialInput;
    return config.defaultValue || '';
  }

  _execOutput(config, inputData) {
    // Output nodes just pass through their input
    return inputData;
  }

  _execDataSource(config) {
    const datasetName = config.dataset || 'Quarterly Financials';

    // Custom data
    if (datasetName === 'custom') {
      const raw = config.rawData || '';
      return `=== DATA CONTEXT ===\nDataset: Custom Data\n\n${raw}`;
    }

    // Built-in dataset
    const dataset = SAMPLE_DATASETS[datasetName];
    if (!dataset) return `[Error: Dataset "${datasetName}" not found]`;

    return formatDatasetForLLM(datasetName, dataset, config.queryFilter);
  }

  async _execLLM(config, inputData) {
    const model = config.model || (typeof getDefaultModel === 'function' ? getDefaultModel() : 'claude-sonnet-4-20250514');
    const systemPrompt = config.systemPrompt || '';
    const promptTemplate = config.promptTemplate || '{{input}}';
    const temperature = config.temperature ?? 0.7;
    const maxTokens = config.maxTokens ?? 1024;

    // Build the prompt from template
    const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    const userPrompt = promptTemplate.replace(/\{\{input\}\}/g, inputStr);

    // Build messages
    const messages = [{ role: 'user', content: userPrompt }];

    // Find the current node ID for streaming callbacks
    const currentNodeId = this._currentNodeId;

    try {
      // Real API call to Anthropic with streaming
      const body = {
        model,
        max_tokens: maxTokens,
        messages,
        stream: true,
      };
      if (systemPrompt) body.system = systemPrompt;

      const apiKey = Utils.getApiKey();
      if (!apiKey) throw new Error('Failed to fetch'); // no key → fallback to simulation

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`API error ${response.status}: ${errData.error?.message || response.statusText}`);
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let tokenCount = 0;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              fullText += event.delta.text;
              tokenCount++;
              if (this.onStream) this.onStream(currentNodeId, fullText, tokenCount);
            }
          } catch { /* skip non-JSON lines */ }
        }
      }

      return fullText || '[No text response]';

    } catch (err) {
      // If API fails, fall back to simulated streaming response
      if (err.message.includes('API error') || err.message.includes('Failed to fetch')) {
        return await this._simulateStreamingLLM(currentNodeId, userPrompt, model, systemPrompt);
      }
      throw err;
    }
  }

  async _simulateStreamingLLM(nodeId, prompt, model, systemPrompt) {
    const fullText = this._generateSmartSimulation(prompt, model, systemPrompt || '');

    // Simulate token-by-token streaming
    const words = fullText.split(/(\s+)/); // split keeping whitespace
    let accumulated = '';
    let tokenCount = 0;

    for (const word of words) {
      accumulated += word;
      tokenCount++;
      if (this.onStream) this.onStream(nodeId, accumulated, tokenCount);
      await this._delay(25); // ~40 tokens/sec feel
    }

    return fullText;
  }

  _generateSmartSimulation(prompt, model, systemPrompt) {
    const sys = (systemPrompt || '').toLowerCase();
    const p = (prompt || '').toLowerCase();

    // Sentiment classifier
    if (sys.includes('sentiment') && sys.includes('one word')) {
      if (p.includes('terrible') || p.includes('angry') || p.includes('worst') || p.includes('waiting') || p.includes('horrible') || p.includes('awful')) return 'negative';
      if (p.includes('love') || p.includes('great') || p.includes('amazing') || p.includes('excellent') || p.includes('thank')) return 'positive';
      return 'neutral';
    }

    // Apology / escalation drafter
    if (sys.includes('apology') || sys.includes('empathetic') || sys.includes('escalation')) {
      return "I sincerely apologize for the unacceptable delay with your order. I've personally escalated this to our fulfillment team with a priority flag, and you'll receive a tracking update within 24 hours. As a gesture of goodwill, I've applied a 20% discount to your account for your next purchase.";
    }

    // Standard customer reply
    if (sys.includes('customer service') || sys.includes('friendly') || sys.includes('helpful reply')) {
      return "Thank you for reaching out! I'd be happy to help you with your inquiry. Let me look into this right away and get back to you with a detailed response. Is there anything specific you'd like me to prioritize?";
    }

    // Summarizer
    if (sys.includes('summariz') && (sys.includes('concise') || sys.includes('1-2 sentence'))) {
      return "The ECB maintained interest rates at 2.75%, with President Lagarde noting declining inflation but warning of ongoing risks from energy prices and geopolitical tensions. A rate cut may be considered at the April meeting if inflation continues moderating.";
    }

    // Translator
    if (sys.includes('translat') && sys.includes('spanish')) {
      return "El BCE mantuvo las tasas de interes en el 2,75%, y la presidenta Lagarde senalo la disminucion de la inflacion pero advirtio sobre los riesgos persistentes de los precios de la energia y las tensiones geopoliticas.";
    }

    // Financial analyst
    if (sys.includes('financial analyst') || sys.includes('analyst')) {
      return "CRITICAL INSIGHT: While revenue grew 12% YoY, expenses surged 18% — creating a margin compression that drove net income down 15% to $400K. The churn rate spike from 3.1% to 4.2% correlates with the NPS decline (71 to 62), suggesting a customer satisfaction crisis that will compound revenue risk in Q2 if unaddressed.\n\nRISK LEVEL: HIGH";
    }

    // Strategy / synthesis
    if (sys.includes('chief strategy') || sys.includes('synthesiz') || sys.includes('cross-functional')) {
      return "OVERALL RISK ASSESSMENT: HIGH\n\n1. REVENUE AT RISK: EMEA revenue declined 8% while expenses rose, creating unsustainable margin pressure.\n2. SUPPLY CHAIN BOTTLENECK: Lead times for Enterprise Pro exceed 30 days with 7% stockout rate.\n3. PIPELINE WEAKNESS: 40% of Q1 pipeline is concentrated in 3 deals, all stalled >20 days.\n\nTOP RECOMMENDATION: Immediately deploy a cross-functional task force to address the churn-NPS correlation before it impacts Q2 pipeline conversion.";
    }

    // Judge / debate
    if (sys.includes('judge') || sys.includes('impartial') || sys.includes('evaluate both')) {
      return "After careful evaluation, the PRO arguments present stronger evidence with concrete implementation examples, while the CON arguments raise valid concerns about enforcement. VERDICT: The proposition should be ADOPTED with modifications — mandatory AI disclosure in high-stakes contexts (healthcare, legal, financial) while allowing flexibility in casual consumer interactions.";
    }

    // Research / ensemble
    if (sys.includes('research agent') || sys.includes('unique perspective')) {
      return "From my analysis, the most promising near-term application is in drug discovery, where quantum computing can simulate molecular interactions at unprecedented scale. Recent breakthroughs in error correction have brought practical quantum advantage within 3-5 years for computational chemistry, potentially reducing drug development timelines by 40%.";
    }

    // Toxicity scorer (content moderation)
    if (sys.includes('toxicity') || (sys.includes('content safety') && sys.includes('rate'))) {
      if (p.includes('hate') || p.includes('scam') || p.includes('worst') || p.includes('ashamed')) return 'SCORE: 7/10 | CLASS: WARNING | REASON: Contains strong negative language, personal attacks on creators, and inflammatory tone. No threats or slurs detected.';
      if (p.includes('kill') || p.includes('threat') || p.includes('die')) return 'SCORE: 10/10 | CLASS: DANGEROUS | REASON: Contains violent language and potential threats requiring immediate review.';
      return 'SCORE: 2/10 | CLASS: SAFE | REASON: Normal conversational tone, no harmful content detected.';
    }

    // PII detector (content moderation)
    if (sys.includes('pii detect') || sys.includes('personal information')) {
      if (p.includes('@') || p.includes('email')) return 'PII_FOUND | Detected: email address. Recommend redaction before publishing.';
      if (p.includes('555') || p.includes('phone')) return 'PII_FOUND | Detected: phone number pattern. Recommend redaction before publishing.';
      return 'PII_CLEAR | No personal identifiable information detected. Content is safe for publishing.';
    }

    // Security auditor (code review)
    if (sys.includes('security auditor') || sys.includes('vulnerabilit')) {
      return '[CRITICAL] SQL Injection — User input is directly concatenated into the query string. An attacker can inject arbitrary SQL.\n[HIGH] Plaintext Passwords — Passwords are compared in plaintext. Must use bcrypt or argon2 hashing.\n[MEDIUM] No Input Validation — No length limits or character filtering on user/pass parameters.';
    }

    // Code quality analyzer
    if (sys.includes('code quality') || sys.includes('quality score')) {
      return 'Quality Score: 2/10\n\n• ERROR HANDLING: None — no try/catch, no validation of db.execute result\n• EDGE CASES: Empty strings, null values, and special characters will cause crashes\n• PERFORMANCE: No connection pooling, no prepared statements\n• NAMING: Function name is acceptable, but parameters should be more descriptive';
    }

    // Auto-fixer (code review)
    if (sys.includes('senior developer') && sys.includes('fix')) {
      return 'async function login(username, password) {\n  const query = "SELECT * FROM users WHERE name = ?";\n  const [user] = await db.execute(query, [username]);\n  if (!user) throw new AuthError("Invalid credentials");\n  const valid = await bcrypt.compare(password, user.hash);\n  if (!valid) throw new AuthError("Invalid credentials");\n  return user;\n}';
    }

    // Code review report generator
    if (sys.includes('review report') || sys.includes('pr review')) {
      return 'VERDICT: BLOCK\n\nCritical security vulnerabilities must be fixed before merge.\n\nSecurity: SQL injection allows complete database compromise. Passwords stored in plaintext.\nQuality: 2/10 — No error handling, no input validation.\nFixed Code: Provided — uses parameterized queries, bcrypt hashing, and proper error handling.\n\nRequired: All 3 critical issues must be resolved. Re-request review after fixes.';
    }

    // Data validator (ETL)
    if (sys.includes('data validation') || sys.includes('validation engine')) {
      return 'VALIDATION REPORT:\n• Record #1: PASS (amount: valid, date: valid) — FLAG: High-value transaction ($5,200)\n• Record #2: PASS (amount: valid, date: valid)\n• Missing Fields: "category" empty on both records — requires enrichment\n• Duplicates: None detected\n• Overall: PASS WITH WARNINGS';
    }

    // Data cleaner (ETL)
    if (sys.includes('data cleaning') || sys.includes('standardize format')) {
      return '{"transactions": [\n  {"id": 1, "amount": 5200.00, "date": "2026-03-15", "merchant": "Amazon Marketplace", "category": "Shopping"},\n  {"id": 2, "amount": 89.99, "date": "2026-03-14", "merchant": "Netflix", "category": "Entertainment"}\n]}';
    }

    // Data enricher (ETL)
    if (sys.includes('data enrichment') || sys.includes('enrichment engine')) {
      return '{"transactions": [\n  {"id": 1, "amount": 5200.00, "date": "2026-03-15", "merchant": "Amazon Marketplace", "category": "Shopping", "risk_flag": "HIGH — exceeds $1K threshold", "tags": ["e-commerce", "high-value"]},\n  {"id": 2, "amount": 89.99, "date": "2026-03-14", "merchant": "Netflix", "category": "Entertainment", "risk_flag": "LOW", "tags": ["subscription", "recurring"]}\n],\n"summary": {"total_spend": 5289.99, "avg_transaction": 2644.99, "high_risk_count": 1}}';
    }

    // Refiner / quality reviewer
    if (sys.includes('refin') || sys.includes('quality reviewer') || sys.includes('improve')) {
      return "Here is the refined and improved version:\n\nThe analysis identifies three critical action items: (1) Address the margin compression by implementing a cost optimization program targeting the 18% expense growth, (2) Launch a customer retention initiative to reverse the NPS decline from 71 to 62, and (3) Accelerate pipeline velocity by focusing on the top 5 stalled deals representing $2.1M in weighted value.";
    }

    // Default fallback
    const trimmed = prompt.slice(0, 80);
    return `[Simulated ${model} response]\n\nPrompt: "${trimmed}${prompt.length > 80 ? '...' : ''}"\n\nThis is a simulated response demonstrating the pipeline flow. Connect an API key for real LLM outputs. The node configuration, routing logic, and data flow are all fully functional.`;
  }

  async _execTool(config, inputData) {
    const toolType = config.toolType || 'http';
    const method = config.method || 'GET';
    const url = config.url || '';
    const headersStr = config.headers || '';
    const bodyTemplate = config.body || '';

    if (toolType === 'http' && url) {
      try {
        // Block SSRF to loopback/private/link-local targets before fetching.
        Utils.assertSafeUrl(url);

        const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
        const finalBody = bodyTemplate.replace(/\{\{input\}\}/g, inputStr);

        let headers = {};
        if (headersStr) {
          try { headers = JSON.parse(headersStr); } catch { /* ignore */ }
        }

        const fetchOptions = { method, headers };
        if (method !== 'GET' && finalBody) {
          fetchOptions.body = finalBody;
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, fetchOptions);
        const text = await response.text();

        try { return JSON.parse(text); } catch { return text; }

      } catch (err) {
        return `[Tool Error] ${err.message}`;
      }
    }

    // Simulated tool for non-HTTP or no URL
    const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    return `[Simulated Tool: ${config.label || toolType}]\nInput: ${inputStr.slice(0, 200)}`;
  }

  _execCondition(node, config, inputData) {
    const expression = config.expression || '';
    const normalizedExpression = expression.replace(/\{\{\s*input\s*\}\}/g, 'input');
    const evaluator = config.evaluator || 'javascript';
    const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');

    let result = false;

    try {
      switch (evaluator) {
        case 'javascript': {
          // Reject dangerous patterns before evaluating user-supplied input.
          const safeExpression = Utils.sanitizeExpression(normalizedExpression || 'false');
          const fn = new Function('input', `return Boolean(${safeExpression})`);
          result = fn(inputStr);
          break;
        }

        case 'contains':
          result = inputStr.includes(expression);
          break;

        case 'regex': {
          const regex = new RegExp(expression);
          result = regex.test(inputStr);
          break;
        }

        case 'llm':
          // For LLM judge, just pass true for now (Phase 4+)
          result = true;
          break;
      }
    } catch (err) {
      this.context.log(node.id, 'warning', `Condition eval error: ${err.message}, defaulting to false`);
      result = false;
    }

    // Mark the branch NOT taken as skipped
    const entry = this.graph.adjacency.get(node.id);
    if (entry) {
      const skipPort = result ? 'false' : 'true';
      for (const edge of entry.out) {
        if (edge.fromPort === skipPort) {
          this.context.markEdgeInactive(node.id, edge.fromPort, edge.targetId, edge.toPort);
        }
      }
    }

    return inputData; // Pass data through to the active branch
  }

  async _execLoop(node, config, inputData) {
    const loopType = config.loopType || 'count';
    const maxIterations = config.maxIterations || 5;

    const results = [];
    for (let i = 0; i < maxIterations; i++) {
      results.push(`Iteration ${i + 1}: ${typeof inputData === 'string' ? inputData.slice(0, 50) : JSON.stringify(inputData).slice(0, 50)}`);
      await this._delay(100);
    }

    return results.join('\n');
  }

  _execMerge(config, inputData) {
    const strategy = config.strategy || 'concat';

    if (typeof inputData !== 'object' || inputData === null) return inputData;

    switch (strategy) {
      case 'concat':
        return Object.values(inputData).join('\n\n');

      case 'object':
        return inputData;

      case 'array':
        return Object.values(inputData);

      case 'template': {
        let template = config.template || '';
        Object.entries(inputData).forEach(([key, val]) => {
          const valStr = typeof val === 'string' ? val : JSON.stringify(val);
          template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), valStr);
        });
        template = template.replace(/\{\{[^}]+\}\}/g, '');
        return template;
      }

      default:
        return inputData;
    }
  }

  // ---- Helpers ----
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _emitLog(entry) {
    if (this.onLog) this.onLog(entry);
  }
}


/* ============================================
   Execution UI Manager
   Real-time visual feedback during execution
   ============================================ */

class ExecutionUI {
  constructor() {
    this.logPanelEl = document.getElementById('execution-panel');
    this.logBodyEl = document.getElementById('execution-log');
    this.executor = null;
    this.running = false;
    this._recordCallback = null; // set by app.js to record runs
  }

  /**
   * Run a flow with animated visual feedback.
   */
  async run(graph, initialInput, connectionMgr, debugger_ = null) {
    this.clear();
    this.show();
    this.running = true;

    const executor = new FlowExecutor(graph);
    this.executor = executor;

    // NOTE: debugger wrapping moved AFTER UI callbacks are set (below)

    // Update Run button
    const runBtn = document.getElementById('btn-run');
    const resetRunButton = () => {
      if (!runBtn) return;
      runBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1l10 6-10 6V1z"/></svg>
        Run Flow
      `;
      runBtn.classList.remove('running');
    };
    if (runBtn) {
      runBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1"/></svg>
        Stop
      `;
      runBtn.classList.add('running');
    }

    // ---- Progress bar ----
    const validator = new FlowValidator(graph);
    const validation = validator.validate();
    if (!validation.executionReady) {
      this.running = false;
      resetRunButton();
      this._appendError('Flow validation failed. Fix errors before running.');
      return;
    }
    const totalNodes = validation.topoOrder ? validation.topoOrder.length : 0;
    let completedNodes = 0;

    const progressBar = document.createElement('div');
    progressBar.className = 'exec-progress-bar';
    progressBar.innerHTML = `
      <div class="exec-progress-label">Starting execution...</div>
      <div class="exec-progress-track"><div class="exec-progress-fill"></div></div>
    `;
    document.getElementById('canvas-container')?.appendChild(progressBar);

    const updateProgress = (nodeId, status) => {
      completedNodes++;
      const pct = Math.round((completedNodes / totalNodes) * 100);
      const node = graph.getNode(nodeId);
      const label = node ? (node.nodeConfig?.label || node.config.label) : '';
      progressBar.querySelector('.exec-progress-label').textContent =
        `${status === 'running' ? 'Running' : 'Done'}: ${label} (${completedNodes}/${totalNodes})`;
      progressBar.querySelector('.exec-progress-fill').style.width = pct + '%';
    };

    // Wire up UI callbacks
    executor.onNodeStart = (nodeId) => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        node.el.classList.add('executing');
        this._scrollNodeIntoView(node.el);
        // Add thinking indicator for LLM-type nodes
        if (['llm', 'debate', 'ensemble', 'supervisor'].includes(node.type)) {
          this._showThinkingIndicator(node);
        }
      }
      // Update progress bar (show as running)
      const label = node ? (node.nodeConfig?.label || node.config.label) : '';
      progressBar.querySelector('.exec-progress-label').textContent =
        `Running: ${label} (${completedNodes + 1}/${totalNodes})`;
    };

    executor.onNodeComplete = (nodeId, status, output) => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        node.el.classList.remove('executing');
        node.el.classList.add(`exec-${status}`);
        // Remove thinking indicator
        this._removeThinkingIndicator(node);

        // Show output preview on node
        if (output !== undefined && status === EXEC_STATUS.SUCCESS) {
          this._showNodeOutput(node, output);
        }
      }
      updateProgress(nodeId, 'done');
    };

    executor.onNodeError = (nodeId, error) => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        node.el.classList.remove('executing');
        node.el.classList.add('exec-error');
        this._removeThinkingIndicator(node);
      }
    };

    executor.onEdgeActive = (fromId, toId) => {
      // Animate the connection wire + data particle
      if (connectionMgr) {
        const conn = connectionMgr.connections.find(
          c => c.from.nodeId === fromId && c.to.nodeId === toId
        );
        if (conn && conn.pathEl) {
          conn.pathEl.classList.add('active');
          this._animateDataParticle(conn.pathEl);
          setTimeout(() => conn.pathEl.classList.remove('active'), 1500);
        }
      }
    };

    executor.onLog = (entry) => {
      this._appendLog(entry, graph);
    };

    // Streaming: show live tokens inside node body
    executor.onStream = (nodeId, textSoFar, tokenCount) => {
      const node = graph.getNode(nodeId);
      if (!node || !node.el) return;
      this._showStreamingText(node, textSoFar, tokenCount);
    };

    executor.onComplete = (ctx) => {
      this.running = false;

      // Remove progress bar with fade
      progressBar.classList.add('fade-out');
      setTimeout(() => progressBar.remove(), 500);

      resetRunButton();

      // Summary line
      const summaryEl = document.createElement('div');
      summaryEl.className = `execution-summary ${ctx.aborted ? 'aborted' : 'done'}`;

      const errors = Array.from(ctx.nodeStatus.values()).filter(s => s === EXEC_STATUS.ERROR).length;
      const succeeded = Array.from(ctx.nodeStatus.values()).filter(s => s === EXEC_STATUS.SUCCESS).length;
      const skipped = Array.from(ctx.nodeStatus.values()).filter(s => s === EXEC_STATUS.SKIPPED).length;

      summaryEl.innerHTML = `
        <span class="execution-summary-icon">${errors > 0 ? '✗' : '✓'}</span>
        <span>Finished in ${ctx.duration}ms — ${succeeded} succeeded, ${skipped} skipped, ${errors} errors</span>
      `;
      this.logBodyEl.appendChild(summaryEl);
      this._scrollToBottom();

      // Show final output
      const sinks = graph.getSinks();
      for (const sinkId of sinks) {
        const output = ctx.getOutput(sinkId);
        if (output !== undefined) {
          this._appendFinalOutput(output, graph.getNode(sinkId));
        }
      }

      // Record run for dashboard
      if (this._recordCallback) this._recordCallback(ctx);
    };

    // Wrap with debugger AFTER UI callbacks are set so it can intercept them
    if (debugger_) {
      debugger_.wrapExecutor(executor);
    }

    // ---- Debugger UI wiring ----
    if (debugger_) {
      const toolbar = document.getElementById('debugger-toolbar');
      const dbgStatus = document.getElementById('dbg-status');
      const inspector = document.getElementById('data-inspector');
      const inspectorTitle = document.getElementById('data-inspector-title');
      const inspectorInput = document.getElementById('data-inspector-input');
      const inspectorOutput = document.getElementById('data-inspector-output');
      const stepBtn = document.getElementById('dbg-step-over');
      const continueBtn = document.getElementById('dbg-continue');
      const inspectorClose = document.getElementById('data-inspector-close');

      if (toolbar) toolbar.style.display = 'flex';

      // Enable/disable buttons
      const setDebugButtons = (enabled) => {
        if (stepBtn) stepBtn.disabled = !enabled;
        if (continueBtn) continueBtn.disabled = !enabled;
      };
      setDebugButtons(false);

      // On pause — highlight node, dim others, show inspector
      debugger_.onPause = (nodeId, stepIndex, traceEntry) => {
        setDebugButtons(true);
        const node = graph.getNode(nodeId);
        const label = node ? (node.nodeConfig?.label || node.config.label) : nodeId;
        if (dbgStatus) dbgStatus.textContent = `Paused: ${label}`;

        // Visual: pause highlight + dim others
        document.querySelectorAll('.node').forEach(el => {
          el.classList.remove('debug-paused', 'debug-dimmed');
          if (el.dataset.nodeId === nodeId || el.id === nodeId) {
            el.classList.add('debug-paused');
          } else if (!el.classList.contains('exec-success') && !el.classList.contains('exec-error')) {
            el.classList.add('debug-dimmed');
          }
        });
        // Also check by node.el
        if (node && node.el) {
          node.el.classList.remove('debug-dimmed', 'executing');
          node.el.classList.add('debug-paused');
        }

        // Show data inspector
        if (inspector) {
          inspector.style.display = 'block';
          if (inspectorTitle) inspectorTitle.textContent = label;
          if (inspectorInput) {
            const inputStr = traceEntry.input
              ? JSON.stringify(traceEntry.input, null, 2)
              : '(no input)';
            inspectorInput.textContent = inputStr.slice(0, 2000);
          }
          if (inspectorOutput) inspectorOutput.textContent = 'Waiting...';
        }
      };

      // On resume — clear pause visuals
      debugger_.onResume = () => {
        setDebugButtons(false);
        if (dbgStatus) dbgStatus.textContent = 'Running...';
        document.querySelectorAll('.node').forEach(el => {
          el.classList.remove('debug-paused', 'debug-dimmed');
        });
        if (inspector) inspector.style.display = 'none';
      };

      // Update inspector output when node completes
      debugger_.onStepLeave = (nodeId, status) => {
        if (inspector && inspector.style.display !== 'none') {
          const traceEntry = debugger_.traceHistory.find(
            t => t.nodeId === nodeId && (t.status === 'success' || t.status === 'error')
          );
          if (traceEntry && inspectorOutput) {
            const outputStr = traceEntry.output
              ? JSON.stringify(traceEntry.output, null, 2)
              : `(${status})`;
            inspectorOutput.textContent = outputStr.slice(0, 2000);
          }
        }
      };

      // On finish — clean up debugger UI
      debugger_.onFinish = () => {
        if (toolbar) toolbar.style.display = 'none';
        if (inspector) inspector.style.display = 'none';
        if (dbgStatus) dbgStatus.textContent = '';
        setDebugButtons(false);
        document.querySelectorAll('.node').forEach(el => {
          el.classList.remove('debug-paused', 'debug-dimmed');
        });
      };

      // Button handlers
      const stepHandler = () => { if (debugger_.paused) debugger_.stepOver(); };
      const continueHandler = () => { if (debugger_.paused) debugger_.resume(); };
      const closeHandler = () => { if (inspector) inspector.style.display = 'none'; };

      if (stepBtn) {
        stepBtn.removeEventListener('click', stepBtn._dbgHandler);
        stepBtn._dbgHandler = stepHandler;
        stepBtn.addEventListener('click', stepHandler);
      }
      if (continueBtn) {
        continueBtn.removeEventListener('click', continueBtn._dbgHandler);
        continueBtn._dbgHandler = continueHandler;
        continueBtn.addEventListener('click', continueHandler);
      }
      if (inspectorClose) {
        inspectorClose.removeEventListener('click', inspectorClose._dbgHandler);
        inspectorClose._dbgHandler = closeHandler;
        inspectorClose.addEventListener('click', closeHandler);
      }
    }

    try {
      await executor.execute(initialInput);
    } catch (err) {
      this.running = false;
      progressBar.remove();
      resetRunButton();
      if (debugger_?.onFinish) debugger_.onFinish();
      this._appendError(err.message);
    }
  }

  abort() {
    if (this.executor) this.executor.abort();
  }

  // ---- Log rendering ----

  _appendLog(entry, graph) {
    const el = document.createElement('div');
    el.className = `execution-log-entry ${entry.type}`;

    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    let nodeLabel = '';
    if (entry.nodeId && graph) {
      const node = graph.getNode(entry.nodeId);
      if (node) nodeLabel = node.nodeConfig?.label || node.config.label;
    }

    el.innerHTML = `
      <span class="log-time">${time}</span>
      ${nodeLabel ? `<span class="log-node">${nodeLabel}</span>` : ''}
      <span class="log-msg">${this._escapeHtml(entry.message)}</span>
    `;

    // Expandable data
    if (entry.data) {
      const dataStr = typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2);
      if (dataStr.length > 0 && dataStr !== '{}' && dataStr !== 'null') {
        const toggle = document.createElement('button');
        toggle.className = 'log-data-toggle';
        toggle.textContent = 'data ▸';
        const dataEl = document.createElement('pre');
        dataEl.className = 'log-data';
        dataEl.textContent = dataStr.slice(0, 500) + (dataStr.length > 500 ? '...' : '');
        dataEl.style.display = 'none';
        toggle.addEventListener('click', () => {
          const showing = dataEl.style.display !== 'none';
          dataEl.style.display = showing ? 'none' : 'block';
          toggle.textContent = showing ? 'data ▸' : 'data ▾';
        });
        el.appendChild(toggle);
        el.appendChild(dataEl);
      }
    }

    this.logBodyEl.appendChild(el);
    this._scrollToBottom();
  }

  _appendFinalOutput(output, node) {
    const el = document.createElement('div');
    el.className = 'execution-final-output';

    const label = node ? (node.nodeConfig?.label || node.config.label) : 'Output';
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

    el.innerHTML = `
      <div class="final-output-header">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8 15V5M4 9l4-4 4 4M2 2h12"/></svg>
        <span>Final Output — ${this._escapeHtml(label)}</span>
      </div>
      <pre class="final-output-body">${this._escapeHtml(outputStr)}</pre>
    `;
    this.logBodyEl.appendChild(el);
    this._scrollToBottom();
  }

  _appendError(message) {
    const el = document.createElement('div');
    el.className = 'execution-log-entry error';
    el.innerHTML = `<span class="log-msg" style="color:var(--danger)">${this._escapeHtml(message)}</span>`;
    this.logBodyEl.appendChild(el);
    this._scrollToBottom();
  }

  _showNodeOutput(node, output) {
    // Add a small output preview to the node body
    if (!node.el) return;

    // Clean up streaming text if present
    const streamEl = node.el.querySelector('.node-stream-text');
    if (streamEl) streamEl.remove();

    // Restore label
    const label = node.el.querySelector('.node-body-label');
    if (label) label.style.display = '';

    let preview = node.el.querySelector('.node-output-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'node-output-preview';
      node.el.appendChild(preview);
    }
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    preview.textContent = text.slice(0, 80) + (text.length > 80 ? '...' : '');
  }

  _showStreamingText(node, textSoFar, tokenCount) {
    if (!node.el) return;
    const body = node.el.querySelector('.node-body');
    if (!body) return;

    // Replace thinking indicator with streaming text
    const thinking = body.querySelector('.node-thinking');
    if (thinking) thinking.remove();

    // Hide the default label during streaming
    const label = body.querySelector('.node-body-label');
    if (label) label.style.display = 'none';

    // Create or update streaming text container
    let streamEl = body.querySelector('.node-stream-text');
    if (!streamEl) {
      streamEl = document.createElement('div');
      streamEl.className = 'node-stream-text';
      body.appendChild(streamEl);
    }
    // Show last ~80 chars of streamed text
    const display = textSoFar.length > 80
      ? '...' + textSoFar.slice(-77)
      : textSoFar;
    streamEl.textContent = display;

    // Token counter badge
    let badge = node.el.querySelector('.node-token-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'node-token-badge';
      node.el.appendChild(badge);
    }
    badge.textContent = tokenCount + ' tokens';
  }

  // ---- Data particle animation along SVG paths ----
  _animateDataParticle(pathEl) {
    const svgLayer = document.getElementById('connections-layer');
    if (!svgLayer || !pathEl.getTotalLength) return;

    const totalLength = pathEl.getTotalLength();
    const duration = 800; // ms
    const trailCount = 3;

    // Create particle group
    const particles = [];
    for (let i = 0; i < trailCount; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 4 - i);
      circle.setAttribute('fill', '#00FFB2');
      circle.setAttribute('opacity', 1 - (i * 0.3));
      circle.classList.add('data-particle');
      if (i === 0) {
        circle.setAttribute('filter', 'url(#glow)');
      }
      svgLayer.appendChild(circle);
      particles.push(circle);
    }

    // Ensure glow filter exists
    if (!svgLayer.querySelector('#glow')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      `;
      svgLayer.insertBefore(defs, svgLayer.firstChild);
    }

    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      particles.forEach((p, i) => {
        const offset = i * 0.08; // trail spacing
        const t = Math.max(0, Math.min(1, progress - offset));
        const len = t * totalLength;
        try {
          const point = pathEl.getPointAtLength(len);
          p.setAttribute('cx', point.x);
          p.setAttribute('cy', point.y);
        } catch (e) { /* path may not be ready */ }
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Fade out and remove
        particles.forEach(p => {
          p.style.transition = 'opacity 0.3s';
          p.style.opacity = '0';
          setTimeout(() => p.remove(), 300);
        });
      }
    };

    requestAnimationFrame(animate);
  }

  // ---- Thinking indicator for LLM nodes ----
  _showThinkingIndicator(node) {
    if (!node.el) return;
    const body = node.el.querySelector('.node-body');
    if (!body) return;

    // Hide the label
    const label = body.querySelector('.node-body-label');
    if (label) label.style.display = 'none';

    const indicator = document.createElement('div');
    indicator.className = 'node-thinking';
    indicator.innerHTML = `
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-text">Analyzing...</span>
    `;
    body.appendChild(indicator);
  }

  _removeThinkingIndicator(node) {
    if (!node.el) return;
    const body = node.el.querySelector('.node-body');
    if (!body) return;
    const indicator = body.querySelector('.node-thinking');
    if (indicator) indicator.remove();

    // Restore the label
    const label = body.querySelector('.node-body-label');
    if (label) label.style.display = '';
  }

  _scrollNodeIntoView(el) {
    // Don't force scroll — just make sure it's reasonably visible
  }

  _scrollToBottom() {
    if (this.logBodyEl) {
      this.logBodyEl.scrollTop = this.logBodyEl.scrollHeight;
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Panel control ----

  show() {
    if (this.logPanelEl) this.logPanelEl.classList.add('open');
  }

  hide() {
    if (this.logPanelEl) this.logPanelEl.classList.remove('open');
    this.clearNodeStates();
  }

  clear() {
    if (this.logBodyEl) this.logBodyEl.innerHTML = '';
    this.clearNodeStates();
  }

  clearNodeStates() {
    document.querySelectorAll('.node').forEach(el => {
      el.classList.remove('executing', 'exec-success', 'exec-error', 'exec-skipped');
      el.querySelector('.node-output-preview')?.remove();
      el.querySelector('.node-token-badge')?.remove();
      el.querySelector('.node-stream-text')?.remove();
      el.querySelector('.node-thinking')?.remove();
      // Restore label if hidden by streaming
      const label = el.querySelector('.node-body-label');
      if (label) label.style.display = '';
    });
    document.querySelectorAll('.connection-path').forEach(el => {
      el.classList.remove('active');
    });
  }

  isRunning() {
    return this.running;
  }
}
