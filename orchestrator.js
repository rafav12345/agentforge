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

  // ---- Shared LLM helper ----
  async _callLLM(prompt, systemPrompt, model, temperature = 0.7) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      return data.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '[No response]';
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
      input: input.slice(0, 200),
      outputA: resultA.output?.slice(0, 500) || '[No output]',
      outputB: resultB.output?.slice(0, 500) || '[No output]',
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

    // Two-column: leaderboard + match history
    const columns = document.createElement('div');
    columns.className = 'dash-columns';

    // Leaderboard
    const lbCol = document.createElement('div');
    lbCol.className = 'dash-column';
    lbCol.innerHTML = `<div class="dash-section-header"><span class="dash-section-title">Leaderboard</span></div>`;

    const leaderboard = this.arena.getLeaderboard();
    if (leaderboard.length === 0) {
      lbCol.innerHTML += `<div class="dash-empty"><p>No rated flows yet.</p><p class="dash-empty-hint">Save some flows and run them against each other in the Arena.</p></div>`;
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
      matches.slice(0, 20).forEach(match => {
        const el = document.createElement('div');
        el.className = 'arena-match';
        const winnerLabel = match.winner === 'A' ? match.flowA : match.winner === 'B' ? match.flowB : 'Tie';
        el.innerHTML = `
          <div class="arena-match-flows">
            <span class="arena-match-flow ${match.winner === 'A' ? 'winner' : ''}">${this._esc(match.flowA)}</span>
            <span class="arena-match-vs">vs</span>
            <span class="arena-match-flow ${match.winner === 'B' ? 'winner' : ''}">${this._esc(match.flowB)}</span>
          </div>
          <div class="arena-match-meta">
            ${match.durationA}ms vs ${match.durationB}ms · Winner: ${this._esc(winnerLabel)}
          </div>
        `;
        list.appendChild(el);
      });
      matchCol.appendChild(list);
    }

    columns.appendChild(lbCol);
    columns.appendChild(matchCol);
    this.container.appendChild(columns);

    // Wire clear button
    document.getElementById('arena-clear')?.addEventListener('click', () => {
      this.arena.clearHistory();
      this.render();
    });
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
}
