/* ============================================
   AgentForge — Flow Analyzer & Debugger (Phase 7)
   Pathfinding: Dijkstra's, A*, all paths
   Optimization: Critical path, dead nodes, redundancy
   Debugging: Step-through trace, breakpoints, data inspector
   ============================================ */

/* ============================================
   1. Pathfinding Algorithms
   Same algorithms that solve mazes — here they
   analyze and optimize agent flows.
   ============================================ */

class FlowPathfinder {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Dijkstra's shortest path.
   * Weights: node estimated cost (LLM=10, tool=8, condition=2, etc.)
   * Returns { path: [nodeIds], cost: number }
   */
  dijkstra(startId, endId) {
    const g = this.graph;
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();

    // Priority queue (simple array — fine for our graph sizes)
    const pq = [];

    g.adjacency.forEach((_, id) => dist.set(id, Infinity));
    dist.set(startId, 0);
    pq.push({ id: startId, cost: 0 });

    while (pq.length > 0) {
      pq.sort((a, b) => a.cost - b.cost);
      const { id: current } = pq.shift();

      if (visited.has(current)) continue;
      visited.add(current);

      if (current === endId) break;

      const entry = g.adjacency.get(current);
      if (!entry) continue;

      for (const edge of entry.out) {
        const neighbor = edge.targetId;
        if (visited.has(neighbor)) continue;

        const weight = this._nodeWeight(neighbor);
        const newDist = dist.get(current) + weight;

        if (newDist < dist.get(neighbor)) {
          dist.set(neighbor, newDist);
          prev.set(neighbor, current);
          pq.push({ id: neighbor, cost: newDist });
        }
      }
    }

    // Reconstruct path
    if (dist.get(endId) === Infinity) return { path: [], cost: Infinity };

    const path = [];
    let current = endId;
    while (current !== undefined) {
      path.unshift(current);
      current = prev.get(current);
    }

    return { path, cost: dist.get(endId) };
  }

  /**
   * A* pathfinding.
   * Heuristic: estimated remaining cost based on layer distance.
   * Returns { path: [nodeIds], cost: number, nodesExplored: number }
   */
  astar(startId, endId) {
    const g = this.graph;

    // Heuristic: use topological distance as estimate
    const layers = this._computeLayers();
    const startLayer = layers.get(startId) || 0;
    const endLayer = layers.get(endId) || 0;

    const gScore = new Map(); // cost from start to node
    const fScore = new Map(); // gScore + heuristic
    const prev = new Map();
    const visited = new Set();
    let nodesExplored = 0;

    g.adjacency.forEach((_, id) => {
      gScore.set(id, Infinity);
      fScore.set(id, Infinity);
    });
    gScore.set(startId, 0);
    fScore.set(startId, this._heuristic(startId, endId, layers));

    const openSet = [startId];

    while (openSet.length > 0) {
      // Pick node with lowest fScore
      openSet.sort((a, b) => fScore.get(a) - fScore.get(b));
      const current = openSet.shift();
      nodesExplored++;

      if (current === endId) {
        const path = [];
        let c = endId;
        while (c !== undefined) { path.unshift(c); c = prev.get(c); }
        return { path, cost: gScore.get(endId), nodesExplored };
      }

      visited.add(current);
      const entry = g.adjacency.get(current);
      if (!entry) continue;

      for (const edge of entry.out) {
        const neighbor = edge.targetId;
        if (visited.has(neighbor)) continue;

        const tentative = gScore.get(current) + this._nodeWeight(neighbor);
        if (tentative < gScore.get(neighbor)) {
          prev.set(neighbor, current);
          gScore.set(neighbor, tentative);
          fScore.set(neighbor, tentative + this._heuristic(neighbor, endId, layers));
          if (!openSet.includes(neighbor)) openSet.push(neighbor);
        }
      }
    }

    return { path: [], cost: Infinity, nodesExplored };
  }

  /**
   * Find ALL paths from start to end (DFS enumeration).
   * Warning: exponential in branchy graphs — capped at 50 paths.
   */
  allPaths(startId, endId, maxPaths = 50) {
    const g = this.graph;
    const results = [];
    const currentPath = [];
    const visited = new Set();

    const dfs = (nodeId) => {
      if (results.length >= maxPaths) return;
      if (nodeId === endId) {
        results.push({
          path: [...currentPath, nodeId],
          cost: currentPath.reduce((s, id) => s + this._nodeWeight(id), 0) + this._nodeWeight(nodeId),
        });
        return;
      }

      visited.add(nodeId);
      currentPath.push(nodeId);

      const entry = g.adjacency.get(nodeId);
      if (entry) {
        for (const edge of entry.out) {
          if (!visited.has(edge.targetId)) {
            dfs(edge.targetId);
          }
        }
      }

      currentPath.pop();
      visited.delete(nodeId);
    };

    dfs(startId);
    results.sort((a, b) => a.cost - b.cost);
    return results;
  }

  // Estimated execution cost per node type
  _nodeWeight(nodeId) {
    const node = this.graph.getNode(nodeId);
    if (!node) return 1;
    switch (node.type) {
      case 'llm':       return 10;  // API call — slowest
      case 'tool':      return 8;   // HTTP request
      case 'loop':      return 6;   // iteration overhead
      case 'condition':  return 2;   // fast eval
      case 'merge':     return 1;   // data manipulation
      case 'input':     return 0;   // instant
      case 'output':    return 0;   // instant
      default:          return 3;
    }
  }

  _heuristic(fromId, toId, layers) {
    const fromLayer = layers.get(fromId) || 0;
    const toLayer = layers.get(toId) || 0;
    return Math.max(0, toLayer - fromLayer) * 5; // estimated cost per layer
  }

  _computeLayers() {
    const g = this.graph;
    const layers = new Map();
    g.adjacency.forEach((_, id) => layers.set(id, 0));

    const inDeg = new Map();
    g.adjacency.forEach((entry, id) => inDeg.set(id, entry.in.length));
    const queue = [];
    inDeg.forEach((d, id) => { if (d === 0) queue.push(id); });

    while (queue.length > 0) {
      const id = queue.shift();
      const entry = g.adjacency.get(id);
      if (!entry) continue;
      for (const edge of entry.out) {
        const newLayer = layers.get(id) + 1;
        if (newLayer > layers.get(edge.targetId)) layers.set(edge.targetId, newLayer);
        const nd = inDeg.get(edge.targetId) - 1;
        inDeg.set(edge.targetId, nd);
        if (nd === 0) queue.push(edge.targetId);
      }
    }
    return layers;
  }
}


/* ============================================
   2. Flow Optimizer
   Critical path, dead node detection,
   redundancy analysis, optimization suggestions
   ============================================ */

class FlowOptimizer {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Full analysis — returns optimization report.
   */
  analyze() {
    const report = {
      criticalPath: this.criticalPath(),
      deadNodes: this.findDeadNodes(),
      bottlenecks: this.findBottlenecks(),
      suggestions: [],
      stats: this.computeStats(),
    };

    // Generate suggestions
    report.suggestions = this._generateSuggestions(report);
    return report;
  }

  /**
   * Critical Path Method — longest path through the DAG.
   * The critical path determines minimum execution time.
   * Same as finding the longest path in a maze.
   */
  criticalPath() {
    const g = this.graph;
    const pathfinder = new FlowPathfinder(g);

    // Compute longest path using dynamic programming on topo order
    const dist = new Map();     // longest distance to each node
    const prev = new Map();     // predecessor on longest path
    const weight = new Map();   // node execution weight

    g.adjacency.forEach((_, id) => {
      dist.set(id, 0);
      weight.set(id, pathfinder._nodeWeight(id));
    });

    // Topological order
    const inDeg = new Map();
    g.adjacency.forEach((entry, id) => inDeg.set(id, entry.in.length));
    const queue = [];
    inDeg.forEach((d, id) => { if (d === 0) queue.push(id); });
    const topoOrder = [];

    while (queue.length > 0) {
      const id = queue.shift();
      topoOrder.push(id);
      const entry = g.adjacency.get(id);
      if (!entry) continue;
      for (const edge of entry.out) {
        const nd = inDeg.get(edge.targetId) - 1;
        inDeg.set(edge.targetId, nd);
        if (nd === 0) queue.push(edge.targetId);
      }
    }

    // Forward pass: compute longest distance
    for (const nodeId of topoOrder) {
      const entry = g.adjacency.get(nodeId);
      if (!entry) continue;
      for (const edge of entry.out) {
        const newDist = dist.get(nodeId) + weight.get(edge.targetId);
        if (newDist > dist.get(edge.targetId)) {
          dist.set(edge.targetId, newDist);
          prev.set(edge.targetId, nodeId);
        }
      }
    }

    // Find the end node with maximum distance
    let maxDist = 0;
    let endNode = null;
    dist.forEach((d, id) => { if (d >= maxDist) { maxDist = d; endNode = id; } });

    // Reconstruct critical path
    const path = [];
    let current = endNode;
    while (current !== undefined) {
      path.unshift(current);
      current = prev.get(current);
    }

    return {
      path,
      totalCost: maxDist,
      nodeWeights: path.map(id => ({ nodeId: id, weight: weight.get(id) })),
    };
  }

  /**
   * Find dead nodes: unreachable from sources or can't reach sinks.
   * Same as dead-end detection in maze solving.
   */
  findDeadNodes() {
    const g = this.graph;

    // Forward BFS from sources
    const sources = g.getSources();
    const reachable = new Set();
    const fwdQueue = [...sources];
    fwdQueue.forEach(id => reachable.add(id));
    while (fwdQueue.length > 0) {
      const id = fwdQueue.shift();
      g.getOutNeighbors(id).forEach(n => { if (!reachable.has(n)) { reachable.add(n); fwdQueue.push(n); } });
    }

    // Backward BFS from sinks
    const sinks = g.getSinks();
    const productive = new Set();
    const bwdQueue = [...sinks];
    bwdQueue.forEach(id => productive.add(id));
    while (bwdQueue.length > 0) {
      const id = bwdQueue.shift();
      g.getInNeighbors(id).forEach(n => { if (!productive.has(n)) { productive.add(n); bwdQueue.push(n); } });
    }

    const dead = [];
    g.adjacency.forEach((_, id) => {
      if (!reachable.has(id) || !productive.has(id)) {
        dead.push({
          nodeId: id,
          reason: !reachable.has(id) ? 'unreachable' : 'unproductive',
        });
      }
    });

    return dead;
  }

  /**
   * Find bottleneck nodes — nodes where many paths converge.
   * High in-degree + on critical path = bottleneck.
   */
  findBottlenecks() {
    const g = this.graph;
    const cp = this.criticalPath();
    const cpSet = new Set(cp.path);
    const bottlenecks = [];

    g.adjacency.forEach((entry, id) => {
      const inDeg = entry.in.length;
      const outDeg = entry.out.length;
      const node = entry.node;
      const onCritical = cpSet.has(id);

      // Bottleneck: high fan-in AND on critical path, or very high fan-in
      if ((inDeg >= 3 && onCritical) || inDeg >= 4) {
        bottlenecks.push({
          nodeId: id,
          label: node.nodeConfig?.label || node.config.label,
          inDegree: inDeg,
          outDegree: outDeg,
          onCriticalPath: onCritical,
          severity: onCritical ? 'high' : 'medium',
        });
      }
    });

    return bottlenecks;
  }

  /**
   * Compute flow statistics.
   */
  computeStats() {
    const g = this.graph;
    const pathfinder = new FlowPathfinder(g);
    const nodes = g.getAllNodes();
    const edges = g.getEdges();

    // Compute all-pairs shortest paths for diameter
    let maxPath = 0;
    let totalPath = 0;
    let pathCount = 0;
    const sources = g.getSources();
    const sinks = g.getSinks();

    for (const src of sources) {
      for (const sink of sinks) {
        const result = pathfinder.dijkstra(src, sink);
        if (result.path.length > 0) {
          maxPath = Math.max(maxPath, result.path.length);
          totalPath += result.path.length;
          pathCount++;
        }
      }
    }

    // Type distribution
    const typeCounts = {};
    nodes.forEach(n => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });

    // Estimated total cost
    let totalCost = 0;
    nodes.forEach(n => totalCost += pathfinder._nodeWeight(n.id));

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceCount: sources.length,
      sinkCount: sinks.length,
      diameter: maxPath,
      avgPathLength: pathCount > 0 ? Math.round(totalPath / pathCount * 10) / 10 : 0,
      density: nodes.length > 1 ? Math.round(edges.length / (nodes.length * (nodes.length - 1)) * 100) / 100 : 0,
      estimatedCost: totalCost,
      typeCounts,
    };
  }

  _generateSuggestions(report) {
    const suggestions = [];

    // Dead nodes
    if (report.deadNodes.length > 0) {
      suggestions.push({
        type: 'dead-nodes',
        priority: 'high',
        title: `Remove ${report.deadNodes.length} dead node(s)`,
        description: 'These nodes are unreachable or unproductive — they\'ll never execute.',
        nodeIds: report.deadNodes.map(d => d.nodeId),
        action: 'remove',
      });
    }

    // Bottlenecks
    report.bottlenecks.forEach(b => {
      if (b.severity === 'high') {
        suggestions.push({
          type: 'bottleneck',
          priority: 'medium',
          title: `Bottleneck: ${b.label}`,
          description: `${b.inDegree} inputs converge here on the critical path. Consider parallelizing or caching.`,
          nodeIds: [b.nodeId],
          action: 'optimize',
        });
      }
    });

    // Critical path dominated by LLMs
    const cpNodes = report.criticalPath.nodeWeights;
    const llmOnCritical = cpNodes.filter(n => {
      const node = this.graph.getNode(n.nodeId);
      return node && node.type === 'llm';
    });
    if (llmOnCritical.length >= 3) {
      suggestions.push({
        type: 'llm-chain',
        priority: 'medium',
        title: `${llmOnCritical.length} sequential LLM calls on critical path`,
        description: 'Consider parallelizing independent LLM calls or combining prompts to reduce latency.',
        nodeIds: llmOnCritical.map(n => n.nodeId),
        action: 'parallelize',
      });
    }

    // High density suggestion
    if (report.stats.density > 0.5) {
      suggestions.push({
        type: 'dense',
        priority: 'low',
        title: 'High edge density',
        description: 'Many connections may indicate unnecessary dependencies. Review if all edges are needed.',
        nodeIds: [],
        action: 'review',
      });
    }

    return suggestions;
  }
}


/* ============================================
   3. Step-Through Debugger
   Trace mode: walk through execution one node
   at a time with data inspection.
   ============================================ */

class FlowDebugger {
  constructor(graph) {
    this.graph = graph;
    this.breakpoints = new Set();  // nodeIds where execution pauses
    this.traceHistory = [];        // [{nodeId, input, output, status}]
    this.currentStep = -1;
    this.paused = false;
    this._resumeResolve = null;

    // UI callbacks
    this.onStepEnter = null;    // (nodeId, stepIndex) => void
    this.onStepLeave = null;    // (nodeId, status) => void
    this.onBreakpoint = null;   // (nodeId) => void
    this.onDataInspect = null;  // (nodeId, input, output) => void
    this.onTraceUpdate = null;  // (traceHistory) => void
  }

  toggleBreakpoint(nodeId) {
    if (this.breakpoints.has(nodeId)) {
      this.breakpoints.delete(nodeId);
      return false;
    } else {
      this.breakpoints.add(nodeId);
      return true;
    }
  }

  /**
   * Create a trace-enabled executor that pauses at breakpoints
   * and records all intermediate data.
   */
  wrapExecutor(executor) {
    const self = this;
    self.traceHistory = [];
    self.currentStep = -1;

    const origOnNodeStart = executor.onNodeStart;
    const origOnNodeComplete = executor.onNodeComplete;

    executor.onNodeStart = async (nodeId) => {
      self.currentStep++;
      self.traceHistory.push({
        nodeId,
        step: self.currentStep,
        input: null,
        output: null,
        status: 'running',
        timestamp: Date.now(),
      });

      if (origOnNodeStart) origOnNodeStart(nodeId);
      if (self.onStepEnter) self.onStepEnter(nodeId, self.currentStep);

      // Check breakpoint
      if (self.breakpoints.has(nodeId)) {
        self.paused = true;
        if (self.onBreakpoint) self.onBreakpoint(nodeId);
        await self._waitForResume();
      }
    };

    executor.onNodeComplete = (nodeId, status, output) => {
      const entry = self.traceHistory.find(t => t.nodeId === nodeId && t.status === 'running');
      if (entry) {
        entry.output = output;
        entry.status = status;
        entry.duration = Date.now() - entry.timestamp;
      }

      if (origOnNodeComplete) origOnNodeComplete(nodeId, status, output);
      if (self.onStepLeave) self.onStepLeave(nodeId, status);
      if (self.onTraceUpdate) self.onTraceUpdate(self.traceHistory);
    };

    return executor;
  }

  resume() {
    this.paused = false;
    if (this._resumeResolve) {
      this._resumeResolve();
      this._resumeResolve = null;
    }
  }

  stepOver() {
    // Resume but set a one-time breakpoint on the next node
    this.resume();
  }

  _waitForResume() {
    return new Promise(resolve => { this._resumeResolve = resolve; });
  }

  // Navigate trace history
  getStep(index) {
    return this.traceHistory[index] || null;
  }

  getCurrentStep() {
    return this.traceHistory[this.currentStep] || null;
  }
}


/* ============================================
   4. Analyzer UI
   Panel that shows pathfinding results,
   optimization report, and debug controls
   ============================================ */

class AnalyzerUI {
  constructor() {
    this.panelEl = document.getElementById('analyzer-panel');
    this.bodyEl = document.getElementById('analyzer-body');
    this.debugger = null;
  }

  show() { if (this.panelEl) this.panelEl.classList.add('open'); }
  hide() { if (this.panelEl) this.panelEl.classList.remove('open'); this.clearHighlights(); }
  clear() { if (this.bodyEl) this.bodyEl.innerHTML = ''; this.clearHighlights(); }

  /**
   * Run full flow analysis and display results.
   */
  showAnalysis(graph) {
    this.clear();
    this.show();

    if (graph.nodeCount === 0) {
      this._msg('Add some nodes first.');
      return;
    }

    const optimizer = new FlowOptimizer(graph);
    const report = optimizer.analyze();

    // Stats overview
    this._renderStats(report.stats);

    // Critical path
    this._renderCriticalPath(report.criticalPath, graph);

    // Suggestions
    if (report.suggestions.length > 0) {
      this._renderSuggestions(report.suggestions, graph);
    }

    // Bottlenecks
    if (report.bottlenecks.length > 0) {
      this._renderBottlenecks(report.bottlenecks, graph);
    }

    // Dead nodes
    if (report.deadNodes.length > 0) {
      this._renderDeadNodes(report.deadNodes, graph);
    }
  }

  /**
   * Show pathfinding results between two nodes.
   */
  showPathfinding(graph, startId, endId) {
    this.clear();
    this.show();

    const pf = new FlowPathfinder(graph);

    // Dijkstra
    const dijkstra = pf.dijkstra(startId, endId);
    // A*
    const astar = pf.astar(startId, endId);
    // All paths
    const allPaths = pf.allPaths(startId, endId, 10);

    const startNode = graph.getNode(startId);
    const endNode = graph.getNode(endId);
    const startLabel = startNode?.nodeConfig?.label || startNode?.config?.label || '?';
    const endLabel = endNode?.nodeConfig?.label || endNode?.config?.label || '?';

    this._addSection(`Paths: ${startLabel} → ${endLabel}`);

    // Dijkstra result
    const dEl = this._addResult('Dijkstra (shortest)', dijkstra.path.length > 0
      ? `Cost: ${dijkstra.cost} · ${dijkstra.path.length} nodes`
      : 'No path found');
    if (dijkstra.path.length > 0) {
      dEl.style.cursor = 'pointer';
      dEl.addEventListener('click', () => this._highlightPath(dijkstra.path, graph, '#00FFB2'));
    }

    // A* result
    const aEl = this._addResult('A* (heuristic)', astar.path.length > 0
      ? `Cost: ${astar.cost} · ${astar.path.length} nodes · ${astar.nodesExplored} explored`
      : 'No path found');
    if (astar.path.length > 0) {
      aEl.style.cursor = 'pointer';
      aEl.addEventListener('click', () => this._highlightPath(astar.path, graph, '#38BDF8'));
    }

    // All paths
    this._addSection(`All Paths (${allPaths.length} found)`);
    allPaths.forEach((p, i) => {
      const labels = p.path.map(id => {
        const n = graph.getNode(id);
        return n?.nodeConfig?.label || n?.config?.label || '?';
      });
      const el = this._addResult(`Path ${i + 1}`, `Cost: ${p.cost} · ${labels.join(' → ')}`);
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this._highlightPath(p.path, graph, i === 0 ? '#00FFB2' : '#FBBF24'));
    });
  }

  /**
   * Show debug trace panel for step-through execution.
   */
  showDebugTrace(traceHistory, graph) {
    this.clear();
    this.show();
    this._addSection('Execution Trace');

    if (traceHistory.length === 0) {
      this._msg('No trace data. Run flow with debugger to see trace.');
      return;
    }

    const list = document.createElement('div');
    list.className = 'trace-list';

    traceHistory.forEach((step, i) => {
      const node = graph.getNode(step.nodeId);
      const label = node?.nodeConfig?.label || node?.config?.label || '?';
      const color = node?.config?.color || '#666';

      const el = document.createElement('div');
      el.className = `trace-step ${step.status}`;
      el.innerHTML = `
        <div class="trace-step-header">
          <span class="trace-step-index">${i + 1}</span>
          <span class="trace-step-dot" style="background:${color}"></span>
          <span class="trace-step-label">${this._esc(label)}</span>
          <span class="trace-step-status">${step.status}</span>
          ${step.duration ? `<span class="trace-step-time">${step.duration}ms</span>` : ''}
        </div>
      `;

      // Data inspector (expandable)
      if (step.output !== null && step.output !== undefined) {
        const dataStr = typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2);
        const inspector = document.createElement('div');
        inspector.className = 'trace-step-data';
        inspector.style.display = 'none';
        inspector.innerHTML = `<pre>${this._esc(dataStr.slice(0, 500))}</pre>`;

        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const open = inspector.style.display !== 'none';
          inspector.style.display = open ? 'none' : 'block';
          // Highlight node
          this.clearHighlights();
          if (!open && node?.el) {
            node.el.classList.add('analyzer-highlight');
          }
        });

        el.appendChild(inspector);
      }

      list.appendChild(el);
    });

    this.bodyEl.appendChild(list);
  }

  // ---- Render helpers ----

  _renderStats(stats) {
    const grid = document.createElement('div');
    grid.className = 'analyzer-stats';
    grid.innerHTML = `
      <div class="analyzer-stat"><span class="stat-val">${stats.nodeCount}</span><span class="stat-lbl">Nodes</span></div>
      <div class="analyzer-stat"><span class="stat-val">${stats.edgeCount}</span><span class="stat-lbl">Edges</span></div>
      <div class="analyzer-stat"><span class="stat-val">${stats.diameter}</span><span class="stat-lbl">Diameter</span></div>
      <div class="analyzer-stat"><span class="stat-val">${stats.avgPathLength}</span><span class="stat-lbl">Avg Path</span></div>
      <div class="analyzer-stat"><span class="stat-val">${stats.density}</span><span class="stat-lbl">Density</span></div>
      <div class="analyzer-stat"><span class="stat-val">${stats.estimatedCost}</span><span class="stat-lbl">Est. Cost</span></div>
    `;
    this.bodyEl.appendChild(grid);
  }

  _renderCriticalPath(cp, graph) {
    this._addSection(`Critical Path (cost: ${cp.totalCost})`);

    const container = document.createElement('div');
    container.className = 'critical-path-vis';

    cp.path.forEach((nodeId, i) => {
      const node = graph.getNode(nodeId);
      if (!node) return;
      const label = node.nodeConfig?.label || node.config.label;
      const weight = cp.nodeWeights[i]?.weight || 0;
      const color = node.config.color;

      const el = document.createElement('div');
      el.className = 'cp-node';
      el.innerHTML = `
        <span class="cp-dot" style="background:${color}"></span>
        <span class="cp-label">${this._esc(label)}</span>
        <span class="cp-weight">${weight}</span>
      `;
      el.addEventListener('click', () => {
        this.clearHighlights();
        if (node.el) node.el.classList.add('analyzer-highlight');
      });
      container.appendChild(el);

      if (i < cp.path.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'cp-arrow';
        arrow.textContent = '→';
        container.appendChild(arrow);
      }
    });

    // Click to highlight full path
    container.addEventListener('dblclick', () => {
      this._highlightPath(cp.path, graph, '#FF6B6B');
    });

    this.bodyEl.appendChild(container);
  }

  _renderSuggestions(suggestions, graph) {
    this._addSection('Optimization Suggestions');

    suggestions.forEach(s => {
      const el = document.createElement('div');
      el.className = `analyzer-suggestion ${s.priority}`;
      el.innerHTML = `
        <div class="suggestion-header">
          <span class="suggestion-priority">${s.priority}</span>
          <span class="suggestion-title">${this._esc(s.title)}</span>
        </div>
        <div class="suggestion-desc">${this._esc(s.description)}</div>
      `;

      if (s.nodeIds.length > 0) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          this.clearHighlights();
          s.nodeIds.forEach(id => {
            const n = graph.getNode(id);
            if (n?.el) n.el.classList.add(s.priority === 'high' ? 'validation-error' : 'validation-warning');
          });
        });
      }

      this.bodyEl.appendChild(el);
    });
  }

  _renderBottlenecks(bottlenecks, graph) {
    this._addSection('Bottlenecks');
    bottlenecks.forEach(b => {
      const el = this._addResult(b.label, `In: ${b.inDegree} · Out: ${b.outDegree} · ${b.onCriticalPath ? 'On critical path' : ''}`);
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        this.clearHighlights();
        const n = graph.getNode(b.nodeId);
        if (n?.el) n.el.classList.add('validation-warning');
      });
    });
  }

  _renderDeadNodes(deadNodes, graph) {
    this._addSection('Dead Nodes');
    deadNodes.forEach(d => {
      const node = graph.getNode(d.nodeId);
      const label = node?.nodeConfig?.label || node?.config?.label || '?';
      const el = this._addResult(label, d.reason);
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        this.clearHighlights();
        if (node?.el) node.el.classList.add('validation-error');
      });
    });
  }

  _addSection(title) {
    const el = document.createElement('div');
    el.className = 'analyzer-section-title';
    el.textContent = title;
    this.bodyEl.appendChild(el);
  }

  _addResult(title, detail) {
    const el = document.createElement('div');
    el.className = 'analyzer-result';
    el.innerHTML = `
      <span class="analyzer-result-title">${this._esc(title)}</span>
      <span class="analyzer-result-detail">${this._esc(detail)}</span>
    `;
    this.bodyEl.appendChild(el);
    return el;
  }

  _msg(text) {
    const el = document.createElement('div');
    el.className = 'analyzer-msg';
    el.textContent = text;
    this.bodyEl.appendChild(el);
  }

  _highlightPath(path, graph, color) {
    this.clearHighlights();
    path.forEach((nodeId, i) => {
      const node = graph.getNode(nodeId);
      if (node?.el) {
        node.el.style.boxShadow = `0 0 0 2px ${color}, 0 0 16px ${color}40`;
        node.el.classList.add('analyzer-highlight');

        // Add order badge
        const badge = document.createElement('div');
        badge.className = 'node-order-badge analyzer-badge';
        badge.style.background = color;
        badge.textContent = i + 1;
        node.el.appendChild(badge);
      }
    });
  }

  clearHighlights() {
    document.querySelectorAll('.node').forEach(el => {
      el.classList.remove('analyzer-highlight');
      el.style.boxShadow = '';
      el.querySelectorAll('.analyzer-badge').forEach(b => b.remove());
    });
  }

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
}
