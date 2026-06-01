/* ============================================
   AgentForge — Dashboard (Phase 5)
   Run history, metrics, execution timeline
   ============================================ */

class RunHistoryManager {
  constructor(storageKey = 'agentforge_runs') {
    this.storageKey = storageKey;
    this.maxRuns = 50;
  }

  getRuns() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    } catch { return []; }
  }

  addRun(run) {
    const runs = this.getRuns();
    runs.unshift(run);
    if (runs.length > this.maxRuns) runs.length = this.maxRuns;
    localStorage.setItem(this.storageKey, JSON.stringify(runs));
  }

  clearRuns() {
    localStorage.removeItem(this.storageKey);
  }
}

class Dashboard {
  constructor(containerEl) {
    this.container = containerEl;
    this.historyMgr = new RunHistoryManager();
    this.visible = false;
  }

  show() {
    this.visible = true;
    this.render();
    this.container.style.display = 'flex';
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  /**
   * Record a completed execution run.
   */
  recordRun(context, flowName, nodeCount) {
    const statuses = Array.from(context.nodeStatus.entries());
    const succeeded = statuses.filter(([, s]) => s === EXEC_STATUS.SUCCESS).length;
    const failed = statuses.filter(([, s]) => s === EXEC_STATUS.ERROR).length;
    const skipped = statuses.filter(([, s]) => s === EXEC_STATUS.SKIPPED).length;

    // Collect per-node timings from logs
    const nodeTimings = [];
    const startTimes = new Map();
    context.logs.forEach(log => {
      if (log.type === 'start' && log.nodeId) startTimes.set(log.nodeId, log.timestamp);
      if (log.type === 'complete' && log.nodeId && startTimes.has(log.nodeId)) {
        // Try to grab the node's display label from the DOM
        const nodeEl = document.querySelector(`.node[data-node-id="${log.nodeId}"]`);
        const nodeLabel = nodeEl?.dataset.label || log.nodeId;
        nodeTimings.push({
          nodeId: log.nodeId,
          label: nodeLabel,
          duration: log.timestamp - startTimes.get(log.nodeId),
        });
      }
    });

    // Get final output
    let finalOutput = null;
    const lastComplete = [...context.logs].reverse().find(l => l.type === 'complete' && l.data?.output);
    if (lastComplete) {
      const out = lastComplete.data.output;
      finalOutput = typeof out === 'string' ? out.slice(0, 300) : JSON.stringify(out).slice(0, 300);
    }

    const run = {
      id: 'run_' + Date.now(),
      flowName: flowName || 'Untitled Flow',
      timestamp: context.startTime,
      duration: context.duration,
      nodeCount,
      succeeded,
      failed,
      skipped,
      aborted: context.aborted,
      status: failed > 0 ? 'error' : context.aborted ? 'aborted' : 'success',
      nodeTimings,
      finalOutput,
    };

    this.historyMgr.addRun(run);
    if (this.visible) this.render();
    return run;
  }

  render() {
    const runs = this.historyMgr.getRuns();
    this.container.innerHTML = '';

    // Dashboard header
    const header = document.createElement('div');
    header.className = 'arena-header';
    header.innerHTML = `
      <div class="arena-title">
        <span style="font-size:28px">📊</span>
        <span>Dashboard</span>
      </div>
      <p class="arena-subtitle">Flow analytics, run history, and performance insights.</p>
    `;
    this.container.appendChild(header);

    // Metrics row
    const metrics = this._computeMetrics(runs);
    const flowStats = this._getFlowStats();
    const metricsRow = document.createElement('div');
    metricsRow.className = 'dash-metrics';
    metricsRow.innerHTML = `
      ${this._metricCard('Total Runs', metrics.totalRuns, 'total')}
      ${this._metricCard('Success Rate', metrics.successRate + '%', metrics.successRate >= 80 ? 'good' : metrics.successRate >= 50 ? 'warn' : 'bad')}
      ${this._metricCard('Avg Duration', metrics.avgDuration + 'ms', 'neutral')}
      ${this._metricCard('Saved Flows', flowStats.savedFlows, 'total')}
      ${this._metricCard('Current Nodes', flowStats.currentNodes, 'neutral')}
      ${this._metricCard('Current Edges', flowStats.currentEdges, 'neutral')}
    `;
    this.container.appendChild(metricsRow);

    // Three-column layout: history + performance + flow info
    const columns = document.createElement('div');
    columns.className = 'dash-columns';

    // Left: run history
    const historyCol = document.createElement('div');
    historyCol.className = 'dash-column';
    historyCol.innerHTML = `
      <div class="dash-section-header">
        <span class="dash-section-title">Run History</span>
        ${runs.length > 0 ? '<button class="btn btn-ghost btn-sm" id="dash-clear-history">Clear</button>' : ''}
      </div>
    `;

    if (runs.length === 0) {
      historyCol.innerHTML += `
        <div class="dash-empty">
          <p>No runs yet</p>
          <p class="dash-empty-hint">Build a flow, validate it, and click Run Flow to see results here.</p>
        </div>
      `;
    } else {
      const list = document.createElement('div');
      list.className = 'dash-run-list';
      runs.forEach((run, idx) => {
        list.appendChild(this._renderRunItem(run, idx));
      });
      historyCol.appendChild(list);
    }

    // Right: performance + node breakdown
    const chartCol = document.createElement('div');
    chartCol.className = 'dash-column';

    // Duration sparkline
    chartCol.innerHTML = `<div class="dash-section-header"><span class="dash-section-title">Performance</span></div>`;

    if (runs.length >= 2) {
      const chartEl = document.createElement('div');
      chartEl.className = 'dash-chart-container';
      const canvas = document.createElement('canvas');
      canvas.id = 'dash-perf-chart';
      canvas.width = 500;
      canvas.height = 140;
      chartEl.appendChild(canvas);
      chartCol.appendChild(chartEl);
      requestAnimationFrame(() => this._drawPerfChart(canvas, runs));
    } else {
      chartCol.innerHTML += `<div class="dash-empty"><p>Run at least 2 flows to see performance trends.</p></div>`;
    }

    // Latest run timeline (Gantt-style)
    if (runs.length > 0 && runs[0].nodeTimings.length > 0) {
      chartCol.innerHTML += `<div class="dash-section-header" style="margin-top:20px"><span class="dash-section-title">Latest Run Timeline</span></div>`;
      const timeline = this._renderTimeline(runs[0]);
      chartCol.appendChild(timeline);
    }

    // Node type breakdown
    if (flowStats.nodeTypes && Object.keys(flowStats.nodeTypes).length > 0) {
      chartCol.innerHTML += `<div class="dash-section-header" style="margin-top:20px"><span class="dash-section-title">Node Composition</span></div>`;
      const breakdown = document.createElement('div');
      breakdown.className = 'dash-node-breakdown';

      // Sort by count descending
      const sorted = Object.entries(flowStats.nodeTypes).sort((a, b) => b[1] - a[1]);
      const totalNodes = sorted.reduce((sum, [, c]) => sum + c, 0);

      // Color bar
      const barColors = { input: '#00FFB2', output: '#FF6B6B', llm: '#A78BFA', condition: '#FBBF24', merge: '#38BDF8', tool: '#F472B6', loop: '#FB923C', datasource: '#06B6D4', debate: '#EC4899', ensemble: '#8B5CF6', supervisor: '#14B8A6', barrier: '#6366F1' };
      const bar = document.createElement('div');
      bar.className = 'dash-comp-bar';
      sorted.forEach(([type, count]) => {
        const pct = (count / totalNodes) * 100;
        const seg = document.createElement('div');
        seg.className = 'dash-comp-seg';
        seg.style.width = pct + '%';
        seg.style.background = barColors[type] || '#666';
        seg.title = `${type}: ${count}`;
        bar.appendChild(seg);
      });
      breakdown.appendChild(bar);

      // Legend
      const legend = document.createElement('div');
      legend.className = 'dash-comp-legend';
      sorted.forEach(([type, count]) => {
        legend.innerHTML += `<span class="dash-comp-item"><span class="dash-comp-dot" style="background:${barColors[type] || '#666'}"></span>${type} (${count})</span>`;
      });
      breakdown.appendChild(legend);
      chartCol.appendChild(breakdown);
    }

    columns.appendChild(historyCol);
    columns.appendChild(chartCol);
    this.container.appendChild(columns);

    // Wire clear button
    document.getElementById('dash-clear-history')?.addEventListener('click', () => {
      this.historyMgr.clearRuns();
      this.render();
    });
  }

  _getFlowStats() {
    const storage = new StorageManager();
    const savedFlows = storage.getFlowList();

    // Get current flow from graph if accessible
    let currentNodes = 0;
    let currentEdges = 0;
    let nodeTypes = {};

    try {
      // Access the global graph
      const graphEl = document.querySelectorAll('.node');
      currentNodes = graphEl.length;

      // Count edges from SVG paths
      const paths = document.querySelectorAll('.connections-layer path');
      currentEdges = paths.length;

      // Count node types
      graphEl.forEach(el => {
        const type = el.dataset.type || 'unknown';
        nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      });
    } catch { /* ignore */ }

    return {
      savedFlows: savedFlows.length,
      currentNodes,
      currentEdges,
      nodeTypes,
    };
  }

  _computeMetrics(runs) {
    if (runs.length === 0) return { totalRuns: 0, successRate: 0, avgDuration: 0, lastRun: '—' };

    const successCount = runs.filter(r => r.status === 'success').length;
    const avgDur = Math.round(runs.reduce((sum, r) => sum + r.duration, 0) / runs.length);
    const lastTime = new Date(runs[0].timestamp);
    const now = Date.now();
    const diffMin = Math.round((now - lastTime) / 60000);
    let lastRun;
    if (diffMin < 1) lastRun = 'Just now';
    else if (diffMin < 60) lastRun = `${diffMin}m ago`;
    else if (diffMin < 1440) lastRun = `${Math.round(diffMin / 60)}h ago`;
    else lastRun = `${Math.round(diffMin / 1440)}d ago`;

    return {
      totalRuns: runs.length,
      successRate: Math.round((successCount / runs.length) * 100),
      avgDuration: avgDur,
      lastRun,
    };
  }

  _metricCard(label, value, variant) {
    return `
      <div class="dash-metric ${variant}">
        <div class="dash-metric-value">${value}</div>
        <div class="dash-metric-label">${label}</div>
      </div>
    `;
  }

  _renderRunItem(run, index) {
    const el = document.createElement('div');
    el.className = `dash-run-item ${run.status}`;

    const time = new Date(run.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const statusIcon = run.status === 'success'
      ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="#00FFB2"><circle cx="7" cy="7" r="6"/><path d="M4.5 7l2 2 3.5-3.5" stroke="#0A0A0F" stroke-width="1.5" fill="none"/></svg>'
      : run.status === 'error'
        ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="#FF6B6B"><circle cx="7" cy="7" r="6"/><path d="M5 5l4 4M9 5l-4 4" stroke="#0A0A0F" stroke-width="1.5"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 14 14" fill="#FBBF24"><circle cx="7" cy="7" r="6"/><path d="M7 4v3M7 9v.5" stroke="#0A0A0F" stroke-width="1.5"/></svg>';

    el.innerHTML = `
      <div class="run-item-left">
        <span class="run-item-status">${statusIcon}</span>
        <div class="run-item-info">
          <span class="run-item-name">${this._esc(run.flowName)}</span>
          <span class="run-item-meta">${time} · ${run.duration}ms · ${run.nodeCount} nodes</span>
        </div>
      </div>
      <div class="run-item-right">
        <span class="run-item-badge success">${run.succeeded}</span>
        ${run.skipped > 0 ? `<span class="run-item-badge skipped">${run.skipped}</span>` : ''}
        ${run.failed > 0 ? `<span class="run-item-badge error">${run.failed}</span>` : ''}
      </div>
    `;

    // Expand to show output preview
    if (run.finalOutput) {
      const preview = document.createElement('div');
      preview.className = 'run-item-output';
      preview.style.display = 'none';
      preview.innerHTML = `<pre>${this._esc(run.finalOutput)}</pre>`;
      el.appendChild(preview);

      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const isOpen = preview.style.display !== 'none';
        preview.style.display = isOpen ? 'none' : 'block';
      });
    }

    return el;
  }

  _renderTimeline(run) {
    const container = document.createElement('div');
    container.className = 'dash-timeline';

    if (!run.nodeTimings || run.nodeTimings.length === 0) return container;

    const maxDur = Math.max(...run.nodeTimings.map(t => t.duration), 1);
    let cumulative = 0;

    run.nodeTimings.forEach(timing => {
      const pct = Math.max((timing.duration / run.duration) * 100, 2);
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';

      const nodeId = timing.nodeId;
      // Use stored label if available, otherwise extract readable name from nodeId
      let label = timing.label || nodeId;
      if (label === nodeId) {
        label = nodeId
          .replace(/^nl_/, '')               // strip NL builder prefix
          .replace(/_[a-z0-9]{4,6}$/, '')    // strip random suffix
          .replace(/_/g, ' ')                // underscores → spaces
          .replace(/\b\w/g, c => c.toUpperCase()) // title case
          || nodeId;
      }

      bar.innerHTML = `
        <div class="timeline-bar-label">${this._esc(label)}</div>
        <div class="timeline-bar-track">
          <div class="timeline-bar-fill" style="width: ${pct}%; left: ${(cumulative / run.duration) * 100}%"></div>
        </div>
        <div class="timeline-bar-time">${timing.duration}ms</div>
      `;

      cumulative += timing.duration;
      container.appendChild(bar);
    });

    return container;
  }

  _drawPerfChart(canvas, runs) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 20, right: 20, bottom: 30, left: 50 };

    ctx.clearRect(0, 0, w, h);

    // Use last 20 runs, oldest first
    const data = runs.slice(0, 20).reverse();
    if (data.length < 2) return;

    const durations = data.map(r => r.duration);
    const maxDur = Math.max(...durations);
    const minDur = Math.min(...durations);
    const range = maxDur - minDur || 1;

    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Axes
    ctx.strokeStyle = '#2A2A3E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#666680';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(maxDur + 'ms', pad.left - 8, pad.top + 4);
    ctx.fillText(minDur + 'ms', pad.left - 8, h - pad.bottom + 4);

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#00FFB2';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    data.forEach((run, i) => {
      const x = pad.left + (i / (data.length - 1)) * plotW;
      const y = pad.top + (1 - (run.duration - minDur) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw points
    data.forEach((run, i) => {
      const x = pad.left + (i / (data.length - 1)) * plotW;
      const y = pad.top + (1 - (run.duration - minDur) / range) * plotH;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = run.status === 'success' ? '#00FFB2' : run.status === 'error' ? '#FF6B6B' : '#FBBF24';
      ctx.fill();
    });

    // X-axis: run numbers
    ctx.fillStyle = '#666680';
    ctx.textAlign = 'center';
    ctx.fillText('#' + (runs.length - data.length + 1), pad.left, h - 8);
    ctx.fillText('#' + runs.length, w - pad.right, h - 8);
  }

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
