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
      for (const nodeId of topoOrder) {
        if (ctx.aborted) {
          ctx.log(null, 'system', 'Execution aborted by user.');
          break;
        }

        const node = this.graph.getNode(nodeId);
        if (!node) continue;

        // Gather inputs from connected predecessors
        const inputData = this._gatherInputs(nodeId);

        // Check if node was skipped (from condition branching)
        if (ctx.nodeStatus.get(nodeId) === EXEC_STATUS.SKIPPED) {
          ctx.log(nodeId, 'skip', `Skipped: ${node.nodeConfig?.label || node.config.label}`);
          this._emitLog(ctx.logs[ctx.logs.length - 1]);
          if (this.onNodeComplete) this.onNodeComplete(nodeId, EXEC_STATUS.SKIPPED, null);
          continue;
        }

        // Execute the node
        ctx.setStatus(nodeId, EXEC_STATUS.RUNNING);
        if (this.onNodeStart) this.onNodeStart(nodeId);

        ctx.log(nodeId, 'start', `Executing: ${node.nodeConfig?.label || node.config.label}`, { input: inputData });
        this._emitLog(ctx.logs[ctx.logs.length - 1]);

        try {
          const output = await this._executeNode(node, inputData, initialInput);
          ctx.setOutput(nodeId, output);
          ctx.setStatus(nodeId, EXEC_STATUS.SUCCESS);

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

          // Stop execution on error
          break;
        }
      }
    } finally {
      this.context.endTime = Date.now();
      this.running = false;

      ctx.log(null, 'system', `Execution finished in ${ctx.duration}ms.`);
      this._emitLog(ctx.logs[ctx.logs.length - 1]);

      if (this.onComplete) this.onComplete(ctx);
    }

    return this.context;
  }

  abort() {
    if (this.context) this.context.aborted = true;
  }

  // ---- Gather inputs from predecessors ----
  _gatherInputs(nodeId) {
    const entry = this.graph.adjacency.get(nodeId);
    if (!entry || entry.in.length === 0) return null;

    const inputs = {};
    for (const edge of entry.in) {
      const sourceOutput = this.context.getOutput(edge.sourceId);
      if (sourceOutput !== undefined) {
        inputs[edge.toPort] = sourceOutput;
      }
    }

    // If single input, unwrap
    const keys = Object.keys(inputs);
    if (keys.length === 1) return inputs[keys[0]];
    if (keys.length === 0) return null;
    return inputs;
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
    const model = config.model || 'claude-sonnet-4-20250514';
    const systemPrompt = config.systemPrompt || '';
    const promptTemplate = config.promptTemplate || '{{input}}';
    const temperature = config.temperature ?? 0.7;
    const maxTokens = config.maxTokens ?? 1024;

    // Build the prompt from template
    const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    const userPrompt = promptTemplate.replace(/\{\{input\}\}/g, inputStr);

    // Build messages
    const messages = [{ role: 'user', content: userPrompt }];

    try {
      // Real API call to Anthropic
      const body = {
        model,
        max_tokens: maxTokens,
        messages,
      };
      if (systemPrompt) body.system = systemPrompt;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(`API error ${response.status}: ${errData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const textContent = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      return textContent || '[No text response]';

    } catch (err) {
      // If API fails, fall back to simulated response
      if (err.message.includes('API error') || err.message.includes('Failed to fetch')) {
        return this._simulateLLM(userPrompt, model);
      }
      throw err;
    }
  }

  _simulateLLM(prompt, model) {
    // Simulated LLM response for when API isn't available
    const trimmed = prompt.slice(0, 100);
    return `[Simulated ${model} response]\n\nPrompt received: "${trimmed}${prompt.length > 100 ? '...' : ''}"\n\nThis is a simulated response. Connect an API key to get real LLM outputs.`;
  }

  async _execTool(config, inputData) {
    const toolType = config.toolType || 'http';
    const method = config.method || 'GET';
    const url = config.url || '';
    const headersStr = config.headers || '';
    const bodyTemplate = config.body || '';

    if (toolType === 'http' && url) {
      try {
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
    const evaluator = config.evaluator || 'javascript';
    const inputStr = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');

    let result = false;

    try {
      switch (evaluator) {
        case 'javascript':
          // Safely evaluate with input available
          const fn = new Function('input', `return Boolean(${expression || 'false'})`);
          result = fn(inputStr);
          break;

        case 'contains':
          result = inputStr.includes(expression);
          break;

        case 'regex':
          const regex = new RegExp(expression);
          result = regex.test(inputStr);
          break;

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
          this._markSubtreeSkipped(edge.targetId);
        }
      }
    }

    return inputData; // Pass data through to the active branch
  }

  _markSubtreeSkipped(nodeId) {
    // BFS to mark all downstream nodes as skipped
    const visited = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      // Only skip if not already executed
      const currentStatus = this.context.nodeStatus.get(current);
      if (!currentStatus || currentStatus === EXEC_STATUS.IDLE) {
        this.context.setStatus(current, EXEC_STATUS.SKIPPED);
      }

      const entry = this.graph.adjacency.get(current);
      if (entry) {
        entry.out.forEach(e => queue.push(e.targetId));
      }
    }
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

    // Wrap with debugger for trace recording
    if (debugger_) {
      debugger_.wrapExecutor(executor);
    }

    // Update Run button
    const runBtn = document.getElementById('btn-run');
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
        if (output && status === EXEC_STATUS.SUCCESS) {
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

    executor.onComplete = (ctx) => {
      this.running = false;

      // Remove progress bar with fade
      progressBar.classList.add('fade-out');
      setTimeout(() => progressBar.remove(), 500);

      if (runBtn) {
        runBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1l10 6-10 6V1z"/></svg>
          Run Flow
        `;
        runBtn.classList.remove('running');
      }

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
        if (output) {
          this._appendFinalOutput(output, graph.getNode(sinkId));
        }
      }

      // Record run for dashboard
      if (this._recordCallback) this._recordCallback(ctx);
    };

    try {
      await executor.execute(initialInput);
    } catch (err) {
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
    let preview = node.el.querySelector('.node-output-preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'node-output-preview';
      node.el.appendChild(preview);
    }
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    preview.textContent = text.slice(0, 80) + (text.length > 80 ? '...' : '');
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
    });
    document.querySelectorAll('.connection-path').forEach(el => {
      el.classList.remove('active');
    });
  }

  isRunning() {
    return this.running;
  }
}
