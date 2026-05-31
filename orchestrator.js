/* ============================================
   AgentForge — Multi-Agent Orchestrator (Phase 8)
   Parallel execution, Debate / Ensemble / Supervisor
   patterns, The Arena (flow comparison + ELO)
   ============================================ */

/* ============================================
   1. Multi-Agent Node Executors
   These execute inside the FlowExecutor pipeline
   for the new Phase 8 node types.
   ============================================ */

const MultiAgentExecutors = {

  /**
   * Debate: Two LLMs argue about a topic, a judge picks the winner.
   * Like parallel maze solving where the fastest solver wins.
   */
  async debate(config, inputData) {
    const topic = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    const rounds = config.rounds || 2;
    const model = config.model || 'claude-sonnet-4-20250514';

    // Agent A argues FOR
    const agentAPrompt = `You are Debater A. Argue FOR the following position in ${rounds > 1 ? 'a brief opening' : 'one paragraph'}:\n\n${topic}`;
    // Agent B argues AGAINST
    const agentBPrompt = `You are Debater B. Argue AGAINST the following position in ${rounds > 1 ? 'a brief opening' : 'one paragraph'}:\n\n${topic}`;

    // Run both in parallel
    const [responseA, responseB] = await Promise.all([
      MultiAgentExecutors._callLLM(agentAPrompt, 'You are a skilled debater. Be concise and persuasive.', model),
      MultiAgentExecutors._callLLM(agentBPrompt, 'You are a skilled debater. Be concise and persuasive.', model),
    ]);

    // Judge evaluates
    const judgePrompt = `Two debaters argued about: "${topic.slice(0, 200)}"\n\nDebater A (FOR):\n${responseA}\n\nDebater B (AGAINST):\n${responseB}\n\nAs an impartial judge, which argument is stronger and why? Declare a winner (A or B) and explain in 2-3 sentences.`;
    const verdict = await MultiAgentExecutors._callLLM(judgePrompt, 'You are a fair, analytical judge. Be decisive.', model);

    return `🗣️ DEBATER A (FOR):\n${responseA}\n\n🗣️ DEBATER B (AGAINST):\n${responseB}\n\n⚖️ JUDGE VERDICT:\n${verdict}`;
  },

  /**
   * Ensemble: Multiple LLMs respond, results are aggregated.
   * Like multiple solvers tackling the same maze simultaneously.
   */
  async ensemble(config, inputData) {
    const input = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    const count = config.agentCount || 3;
    const strategy = config.aggregation || 'best';
    const model = config.model || 'claude-sonnet-4-20250514';

    // Run N agents in parallel with slightly different temperatures
    const temps = Array.from({ length: count }, (_, i) => 0.3 + i * 0.3);
    const promises = temps.map((temp, i) =>
      MultiAgentExecutors._callLLM(
        input,
        `You are Agent ${i + 1} of ${count}. Answer the prompt thoughtfully. Be concise.`,
        model,
        temp
      )
    );

    const responses = await Promise.all(promises);

    if (strategy === 'best') {
      // Ask a selector to pick the best response
      const selectorPrompt = responses.map((r, i) =>
        `Response ${i + 1}:\n${r}`
      ).join('\n\n---\n\n');

      const selection = await MultiAgentExecutors._callLLM(
        `Given these ${count} responses to the prompt "${input.slice(0, 100)}...":\n\n${selectorPrompt}\n\nWhich response is best? Output ONLY the number (1-${count}) and a one-sentence reason.`,
        'You are a quality evaluator. Pick the strongest response.',
        model,
        0.2
      );

      return `📊 ENSEMBLE (${count} agents, strategy: ${strategy})\n\n${responses.map((r, i) => `Agent ${i + 1}:\n${r}`).join('\n\n---\n\n')}\n\n🏆 SELECTION:\n${selection}`;
    } else {
      // Concatenate all responses
      return `📊 ENSEMBLE (${count} agents, strategy: concat)\n\n${responses.map((r, i) => `Agent ${i + 1}:\n${r}`).join('\n\n---\n\n')}`;
    }
  },

  /**
   * Supervisor: Breaks task into subtasks, delegates to workers, synthesizes.
   * Like a maze solver that divides the maze into regions.
   */
  async supervisor(config, inputData) {
    const task = typeof inputData === 'string' ? inputData : JSON.stringify(inputData || '');
    const workerCount = config.workerCount || 3;
    const model = config.model || 'claude-sonnet-4-20250514';

    // Supervisor plans the subtasks
    const planPrompt = `Break this task into exactly ${workerCount} independent subtasks. Output ONLY a numbered list, one subtask per line:\n\n${task}`;
    const plan = await MultiAgentExecutors._callLLM(planPrompt, 'You are a project manager. Decompose tasks clearly.', model, 0.3);

    // Parse subtasks
    const subtasks = plan.split('\n').filter(l => l.trim().match(/^\d/)).slice(0, workerCount);
    if (subtasks.length === 0) {
      return `[Supervisor] Could not decompose task. Raw plan:\n${plan}`;
    }

    // Workers execute subtasks in parallel
    const workerPromises = subtasks.map((subtask, i) =>
      MultiAgentExecutors._callLLM(
        subtask,
        `You are Worker ${i + 1}. Complete your assigned subtask concisely.`,
        model
      )
    );

    const results = await Promise.all(workerPromises);

    // Supervisor synthesizes
    const synthesizePrompt = `Original task: ${task.slice(0, 200)}\n\nWorker results:\n${results.map((r, i) => `Worker ${i + 1} (${subtasks[i]?.slice(0, 50)}):\n${r}`).join('\n\n')}\n\nSynthesize these into a cohesive final answer.`;
    const synthesis = await MultiAgentExecutors._callLLM(synthesizePrompt, 'You are a project manager synthesizing worker outputs into a final deliverable.', model, 0.4);

    return `👔 SUPERVISOR PLAN:\n${plan}\n\n${results.map((r, i) => `👷 WORKER ${i + 1}:\n${r}`).join('\n\n')}\n\n📋 SYNTHESIS:\n${synthesis}`;
  },

  /**
   * Barrier: Wait for all inputs before proceeding.
   * Same as sync point in parallel maze solving.
   */
  barrier(config, inputData) {
    // Barrier just collects and forwards all inputs
    if (typeof inputData === 'object' && inputData !== null) {
      return Object.values(inputData).join('\n\n---\n\n');
    }
    return inputData;
  },

  // ---- Shared LLM helper (with streaming support) ----
  async _callLLM(prompt, systemPrompt, model, temperature = 0.7) {
    const apiKey = localStorage.getItem('agentforge_api_key');
    try {
      if (!apiKey) throw new Error('No API key');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`API ${response.status}`);

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              fullText += event.delta.text;
            }
          } catch { /* skip */ }
        }
      }

      return fullText || '[No response]';
    } catch {
      // Simulated response
      const seed = prompt.slice(0, 30);
      return `[Simulated Agent]\nPrompt: "${seed}..."\nThis is a simulated multi-agent response. Connect API for real outputs.`;
    }
  },
};


/* ============================================
   2. The Arena
   Side-by-side flow comparison with ELO ratings.
   Run two flows against the same input and compare.
   ============================================ */

class Arena {
  constructor() {
    this.storageKey = 'agentforge_arena';
    this.matches = this._load();
  }

  /**
   * Run two flows head-to-head.
   * Returns { flowA, flowB, outputA, outputB, durationA, durationB }
   */
  async runMatch(graphA, graphB, input, nameA, nameB) {
    const [resultA, resultB] = await Promise.all([
      this._executeFlow(graphA, input),
      this._executeFlow(graphB, input),
    ]);

    const match = {
      id: 'match_' + Date.now(),
      timestamp: Date.now(),
      flowA: nameA,
      flowB: nameB,
      input: input.slice(0, 500),
      outputA: resultA.output?.slice(0, 5000) || '[No output]',
      outputB: resultB.output?.slice(0, 5000) || '[No output]',
      durationA: resultA.duration,
      durationB: resultB.duration,
      nodesA: resultA.nodeCount,
      nodesB: resultB.nodeCount,
      winner: null,  // set by user
    };

    return match;
  }

  recordWinner(match, winner) {
    match.winner = winner; // 'A', 'B', or 'tie'

    // Update ELO
    const eloA = this._getElo(match.flowA);
    const eloB = this._getElo(match.flowB);
    const { newA, newB } = this._computeElo(eloA, eloB, winner);
    this._setElo(match.flowA, newA);
    this._setElo(match.flowB, newB);

    this.matches.push(match);
    this._save();
    return { eloA: newA, eloB: newB };
  }

  getLeaderboard() {
    const elos = this._loadElos();
    return Object.entries(elos)
      .map(([name, elo]) => ({
        name,
        elo,
        matches: this.matches.filter(m => m.flowA === name || m.flowB === name).length,
        wins: this.matches.filter(m =>
          (m.flowA === name && m.winner === 'A') ||
          (m.flowB === name && m.winner === 'B')
        ).length,
      }))
      .sort((a, b) => b.elo - a.elo);
  }

  getMatches() {
    return [...this.matches].reverse();
  }

  clearHistory() {
    this.matches = [];
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.storageKey + '_elos');
  }

  async _executeFlow(graph, input) {
    const start = Date.now();
    try {
      const validator = new FlowValidator(graph);
      const validation = validator.validate();
      if (!validation.executionReady) return { output: '[Validation failed]', duration: 0, nodeCount: 0 };

      const executor = new FlowExecutor(graph);
      const ctx = await executor.execute(input);

      // Get output from sinks
      const sinks = graph.getSinks();
      let output = '';
      for (const sinkId of sinks) {
        const o = ctx.getOutput(sinkId);
        if (o) output += (typeof o === 'string' ? o : JSON.stringify(o));
      }

      return { output, duration: Date.now() - start, nodeCount: graph.nodeCount };
    } catch (e) {
      return { output: `[Error: ${e.message}]`, duration: Date.now() - start, nodeCount: graph.nodeCount };
    }
  }

  _computeElo(ratingA, ratingB, winner) {
    const K = 32;
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;

    let scoreA, scoreB;
    if (winner === 'A') { scoreA = 1; scoreB = 0; }
    else if (winner === 'B') { scoreA = 0; scoreB = 1; }
    else { scoreA = 0.5; scoreB = 0.5; }

    return {
      newA: Math.round(ratingA + K * (scoreA - expectedA)),
      newB: Math.round(ratingB + K * (scoreB - expectedB)),
    };
  }

  _getElo(name) { return this._loadElos()[name] || 1200; }
  _setElo(name, elo) {
    const elos = this._loadElos();
    elos[name] = elo;
    localStorage.setItem(this.storageKey + '_elos', JSON.stringify(elos));
  }
  _loadElos() {
    try { return JSON.parse(localStorage.getItem(this.storageKey + '_elos') || '{}'); }
    catch { return {}; }
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '[]'); }
    catch { return []; }
  }
  _save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.matches));
  }
}


/* ============================================
   3. Arena UI
   Side-by-side comparison view with
   leaderboard and match history.
   ============================================ */

class ArenaUI {
  constructor(containerEl) {
    this.container = containerEl;
    this.arena = new Arena();
    this._pendingMatch = null;
  }

  render() {
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'arena-header';
    header.innerHTML = `
      <div class="arena-title">
        <span class="arena-icon">⚔️</span>
        <span>The Arena</span>
      </div>
      <p class="arena-subtitle">Compare flows head-to-head. Pick winners. Build the leaderboard.</p>
    `;
    this.container.appendChild(header);

    // ---- New Match Section ----
    const matchSection = document.createElement('div');
    matchSection.className = 'arena-new-match';
    const flows = this._getAvailableFlows();

    if (flows.length < 2) {
      matchSection.innerHTML = `
        <div class="arena-new-match-header">
          <span class="dash-section-title">New Match</span>
        </div>
        <div class="dash-empty">
          <p>Need at least 2 saved flows to start a match.</p>
          <p class="dash-empty-hint">Go to Builder, create pipelines with "Build with AI", and save them (Ctrl+S).</p>
        </div>
      `;
    } else {
      const flowOptions = flows.map(f => `<option value="${this._esc(f.name)}">${this._esc(f.name)}</option>`).join('');
      const flowBDefault = flows.length > 1 ? flows[1].name : flows[0].name;

      matchSection.innerHTML = `
        <div class="arena-new-match-header">
          <span class="dash-section-title">New Match</span>
        </div>
        <div class="arena-match-setup">
          <div class="arena-fighter">
            <label class="arena-fighter-label">Flow A</label>
            <select id="arena-flow-a" class="config-input">${flowOptions}</select>
          </div>
          <div class="arena-vs-badge">VS</div>
          <div class="arena-fighter">
            <label class="arena-fighter-label">Flow B</label>
            <select id="arena-flow-b" class="config-input">${flowOptions}</select>
          </div>
        </div>
        <div class="arena-input-row">
          <label class="arena-fighter-label">Shared Input</label>
          <textarea id="arena-input" class="config-textarea" rows="2" placeholder="Enter the test input both flows will process...">I've been waiting 3 weeks for my order and nobody responds to my emails. This is terrible service!</textarea>
        </div>
        <button class="btn btn-accent arena-fight-btn" id="arena-fight-btn">⚔️ Fight!</button>
      `;
    }
    this.container.appendChild(matchSection);

    // ---- Results area (for pending match) ----
    const resultsArea = document.createElement('div');
    resultsArea.id = 'arena-results';
    resultsArea.className = 'arena-results';
    this.container.appendChild(resultsArea);
    if (this._pendingMatch) this._renderResults(this._pendingMatch);

    // ---- Two-column: leaderboard + match history ----
    const columns = document.createElement('div');
    columns.className = 'dash-columns';

    // Leaderboard
    const lbCol = document.createElement('div');
    lbCol.className = 'dash-column';
    lbCol.innerHTML = `<div class="dash-section-header"><span class="dash-section-title">Leaderboard</span></div>`;

    const leaderboard = this.arena.getLeaderboard();
    if (leaderboard.length === 0) {
      lbCol.innerHTML += `<div class="dash-empty"><p>No rated flows yet.</p><p class="dash-empty-hint">Run some matches above to build the rankings.</p></div>`;
    } else {
      const table = document.createElement('div');
      table.className = 'arena-leaderboard';
      leaderboard.forEach((entry, rank) => {
        const row = document.createElement('div');
        row.className = 'arena-lb-row';
        const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`;
        row.innerHTML = `
          <span class="arena-lb-rank">${medal}</span>
          <span class="arena-lb-name">${this._esc(entry.name)}</span>
          <span class="arena-lb-elo">${entry.elo}</span>
          <span class="arena-lb-record">${entry.wins}W / ${entry.matches}M</span>
        `;
        table.appendChild(row);
      });
      lbCol.appendChild(table);
    }

    // Match history
    const matchCol = document.createElement('div');
    matchCol.className = 'dash-column';
    matchCol.innerHTML = `
      <div class="dash-section-header">
        <span class="dash-section-title">Match History</span>
        ${this.arena.getMatches().length > 0 ? '<button class="btn btn-ghost btn-sm" id="arena-clear">Clear</button>' : ''}
      </div>
    `;

    const matches = this.arena.getMatches();
    if (matches.length === 0) {
      matchCol.innerHTML += `<div class="dash-empty"><p>No matches yet.</p></div>`;
    } else {
      const list = document.createElement('div');
      list.className = 'dash-run-list';
      matches.slice(0, 20).forEach((match, idx) => {
        const el = document.createElement('div');
        el.className = 'arena-match-card';
        const winnerLabel = match.winner === 'A' ? match.flowA : match.winner === 'B' ? match.flowB : 'Tie';
        const timeAgo = this._timeAgo(match.timestamp);
        el.innerHTML = `
          <div class="arena-match-card-header" data-match-idx="${idx}">
            <div class="arena-match-flows">
              <span class="arena-match-flow ${match.winner === 'A' ? 'winner' : ''}">${this._esc(match.flowA)}</span>
              <span class="arena-match-vs">vs</span>
              <span class="arena-match-flow ${match.winner === 'B' ? 'winner' : ''}">${this._esc(match.flowB)}</span>
            </div>
            <div class="arena-match-meta">
              <span>👑 ${this._esc(winnerLabel)}</span>
              <span>${match.durationA}ms vs ${match.durationB}ms</span>
              <span>${timeAgo}</span>
              <span class="arena-expand-icon">▶</span>
            </div>
          </div>
          <div class="arena-match-detail" id="arena-detail-${idx}" style="display:none">
            <div class="arena-match-input-preview">
              <span class="arena-fighter-label">Input</span>
              <div class="arena-detail-text">${this._esc(match.input)}</div>
            </div>
            <div class="arena-detail-grid">
              <div class="arena-detail-side ${match.winner === 'A' ? 'arena-winner' : ''}">
                <div class="arena-detail-side-header">
                  <span class="arena-result-name">${this._esc(match.flowA)}</span>
                  <span class="arena-result-meta">${match.nodesA} nodes · ${match.durationA}ms</span>
                </div>
                <div class="arena-detail-text">${this._esc(match.outputA)}</div>
              </div>
              <div class="arena-detail-side ${match.winner === 'B' ? 'arena-winner' : ''}">
                <div class="arena-detail-side-header">
                  <span class="arena-result-name">${this._esc(match.flowB)}</span>
                  <span class="arena-result-meta">${match.nodesB} nodes · ${match.durationB}ms</span>
                </div>
                <div class="arena-detail-text">${this._esc(match.outputB)}</div>
              </div>
            </div>
          </div>
        `;
        // Toggle expand
        el.querySelector('.arena-match-card-header').addEventListener('click', () => {
          const detail = document.getElementById(`arena-detail-${idx}`);
          const icon = el.querySelector('.arena-expand-icon');
          if (detail.style.display === 'none') {
            detail.style.display = 'block';
            icon.textContent = '▼';
          } else {
            detail.style.display = 'none';
            icon.textContent = '▶';
          }
        });
        list.appendChild(el);
      });
      matchCol.appendChild(list);
    }

    columns.appendChild(lbCol);
    columns.appendChild(matchCol);
    this.container.appendChild(columns);

    // ---- Wire events ----
    // Default flow B to second option
    const flowBSelect = document.getElementById('arena-flow-b');
    if (flowBSelect && flows.length > 1) flowBSelect.selectedIndex = 1;

    document.getElementById('arena-fight-btn')?.addEventListener('click', () => this._startFight());
    document.getElementById('arena-clear')?.addEventListener('click', () => {
      this.arena.clearHistory();
      this._pendingMatch = null;
      this.render();
    });
  }

  async _startFight() {
    const flowAName = document.getElementById('arena-flow-a')?.value;
    const flowBName = document.getElementById('arena-flow-b')?.value;
    const input = document.getElementById('arena-input')?.value?.trim();
    const btn = document.getElementById('arena-fight-btn');

    if (!flowAName || !flowBName) return;
    if (flowAName === flowBName) {
      this._showToast('Pick two different flows');
      return;
    }
    if (!input) {
      this._showToast('Enter a test input');
      return;
    }

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="arena-spinner"></span> Running...';

    try {
      const flows = this._getAvailableFlows();
      const flowAInfo = flows.find(f => f.name === flowAName);
      const flowBInfo = flows.find(f => f.name === flowBName);
      if (!flowAInfo || !flowBInfo) { this._showToast('Flow not found'); return; }

      // Build graphs
      const graphA = this._loadFlowGraph(flowAInfo);
      const graphB = this._loadFlowGraph(flowBInfo);
      if (!graphA || !graphB) { this._showToast('Could not load flow data'); return; }

      const match = await this.arena.runMatch(graphA, graphB, input, flowAName, flowBName);
      this._pendingMatch = match;
      this._renderResults(match);
    } catch (e) {
      this._showToast(`Error: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '⚔️ Fight!';
    }
  }

  _renderResults(match) {
    const resultsArea = document.getElementById('arena-results');
    if (!resultsArea) return;

    resultsArea.innerHTML = `
      <div class="arena-results-header">
        <span class="dash-section-title">Results</span>
      </div>
      <div class="arena-results-grid">
        <div class="arena-result-card ${match.winner === 'A' ? 'arena-winner' : ''}">
          <div class="arena-result-name">${this._esc(match.flowA)}</div>
          <div class="arena-result-meta">${match.nodesA} nodes · ${match.durationA}ms</div>
          <div class="arena-result-output">${this._esc(match.outputA)}</div>
          <button class="btn btn-sm arena-vote-btn" data-winner="A">👑 Vote Winner</button>
        </div>
        <div class="arena-result-vs">VS</div>
        <div class="arena-result-card ${match.winner === 'B' ? 'arena-winner' : ''}">
          <div class="arena-result-name">${this._esc(match.flowB)}</div>
          <div class="arena-result-meta">${match.nodesB} nodes · ${match.durationB}ms</div>
          <div class="arena-result-output">${this._esc(match.outputB)}</div>
          <button class="btn btn-sm arena-vote-btn" data-winner="B">👑 Vote Winner</button>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm arena-tie-btn" data-winner="tie">🤝 Call it a Tie</button>
    `;

    // Wire vote buttons
    resultsArea.querySelectorAll('.arena-vote-btn, .arena-tie-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const winner = btn.dataset.winner;
        const { eloA, eloB } = this.arena.recordWinner(match, winner);
        this._pendingMatch = null;

        const winnerName = winner === 'A' ? match.flowA : winner === 'B' ? match.flowB : 'Tie';
        this._showToast(`${winnerName}${winner === 'tie' ? '' : ' wins!'} (ELO: ${eloA} / ${eloB})`);
        this.render();
      });
    });
  }

  _getAvailableFlows() {
    const flows = [];

    // Saved flows from storage
    const storage = new StorageManager();
    const saved = storage.getFlowList();
    saved.forEach(f => {
      flows.push({
        name: f.metadata?.name || 'Untitled',
        nodes: f.nodes?.length || 0,
        source: 'saved',
      });
    });

    // Built-in templates (always available)
    const builder = new NLFlowBuilder();
    const templates = builder._buildTemplates();
    for (const [key, tpl] of Object.entries(templates)) {
      if (key === 'generic') continue;
      const name = tpl.flow.metadata.name;
      if (!flows.find(f => f.name === name)) {
        flows.push({
          name,
          nodes: tpl.flow.nodes?.length || 0,
          source: 'template',
          templateKey: key,
        });
      }
    }

    return flows;
  }

  _loadFlowGraph(flowInfo) {
    let data;
    if (flowInfo.source === 'saved') {
      const storage = new StorageManager();
      data = storage.loadFlow(flowInfo.name);
    } else {
      const builder = new NLFlowBuilder();
      const templates = builder._buildTemplates();
      const tpl = templates[flowInfo.templateKey];
      if (tpl) data = JSON.parse(JSON.stringify(tpl.flow));
    }
    if (!data) return null;

    // Build a FlowGraph with lightweight node objects (no DOM needed for execution)
    const createNode = (type, x, y, id) => ({
      id, type, x, y,
      nodeConfig: {},
      config: {},
      render: () => document.createElement('div'),
      destroy: () => {},
    });
    return FlowGraph.deserialize(data, createNode);
  }

  _showToast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  _timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
}
