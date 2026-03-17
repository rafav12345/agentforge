/* ============================================
   AgentForge — Graph Validator (Phase 3)
   Topological sort, cycle detection,
   connected components, structural checks
   ============================================ */

// Validation severity levels
const VSEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  PASS: 'pass',
};

class ValidationResult {
  constructor() {
    this.issues = [];       // { severity, code, message, nodeIds[], edgeIds[] }
    this.topoOrder = [];    // topologically sorted node IDs (empty if cycles exist)
    this.cycles = [];       // arrays of node IDs forming cycles
    this.components = [];   // arrays of node IDs per connected component
    this.orphans = [];      // disconnected node IDs
    this.isValid = false;
    this.isDAG = false;
    this.executionReady = false;
  }

  get errorCount() { return this.issues.filter(i => i.severity === VSEVERITY.ERROR).length; }
  get warningCount() { return this.issues.filter(i => i.severity === VSEVERITY.WARNING).length; }

  addIssue(severity, code, message, nodeIds = [], edgeIds = []) {
    this.issues.push({ severity, code, message, nodeIds, edgeIds });
  }
}

class FlowValidator {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Run full validation. Returns a ValidationResult.
   * steps[] callback fires for each step of validation for animation.
   */
  validate(onStep = null) {
    const result = new ValidationResult();
    const g = this.graph;

    if (g.nodeCount === 0) {
      result.addIssue(VSEVERITY.INFO, 'EMPTY', 'Flow is empty — add some nodes to get started.');
      return result;
    }

    // Step 1: Structural checks
    if (onStep) onStep({ phase: 'structure', message: 'Checking node structure...' });
    this._checkStructure(result);

    // Step 2: Connected components (undirected reachability)
    if (onStep) onStep({ phase: 'components', message: 'Finding connected components...' });
    this._findComponents(result);

    // Step 3: Cycle detection (DFS 3-color)
    if (onStep) onStep({ phase: 'cycles', message: 'Detecting cycles (DFS)...' });
    this._detectCycles(result);

    // Step 4: Topological sort (Kahn's algorithm) — only if no cycles
    if (result.isDAG) {
      if (onStep) onStep({ phase: 'toposort', message: 'Computing topological order (Kahn\'s)...' });
      this._topologicalSort(result);
    }

    // Step 5: Reachability check
    if (onStep) onStep({ phase: 'reachability', message: 'Checking reachability...' });
    this._checkReachability(result);

    // Step 6: Determine overall status
    result.isValid = result.errorCount === 0;
    result.executionReady = result.isValid && result.isDAG && result.topoOrder.length > 0;

    if (result.executionReady) {
      result.addIssue(VSEVERITY.PASS, 'READY', `Flow is valid! Execution order: ${result.topoOrder.length} nodes.`);
    }

    return result;
  }

  // ---- Step 1: Structural checks ----
  _checkStructure(result) {
    const g = this.graph;
    let hasInput = false;
    let hasOutput = false;

    g.adjacency.forEach((entry, nodeId) => {
      const node = entry.node;

      if (node.type === 'input') hasInput = true;
      if (node.type === 'output') hasOutput = true;

      // Check: Input nodes should have no incoming edges
      if (node.type === 'input' && entry.in.length > 0) {
        result.addIssue(VSEVERITY.WARNING, 'INPUT_HAS_INCOMING',
          `Input node "${node.nodeConfig?.label || node.config.label}" has incoming connections — inputs are typically flow entry points.`,
          [nodeId]);
      }

      // Check: Output nodes should have no outgoing edges
      if (node.type === 'output' && entry.out.length > 0) {
        result.addIssue(VSEVERITY.WARNING, 'OUTPUT_HAS_OUTGOING',
          `Output node "${node.nodeConfig?.label || node.config.label}" has outgoing connections — outputs are typically flow exit points.`,
          [nodeId]);
      }

      // Check: LLM nodes should have at least a prompt connected
      if (node.type === 'llm' && entry.in.length === 0) {
        result.addIssue(VSEVERITY.WARNING, 'LLM_NO_INPUT',
          `LLM node "${node.nodeConfig?.label || node.config.label}" has no input connected.`,
          [nodeId]);
      }

      // Check: Condition nodes should have both true/false outputs
      if (node.type === 'condition') {
        const outPorts = entry.out.map(e => e.fromPort);
        if (!outPorts.includes('true')) {
          result.addIssue(VSEVERITY.WARNING, 'CONDITION_NO_TRUE',
            `Condition node "${node.nodeConfig?.label || node.config.label}" has no "true" branch connected.`,
            [nodeId]);
        }
        if (!outPorts.includes('false')) {
          result.addIssue(VSEVERITY.WARNING, 'CONDITION_NO_FALSE',
            `Condition node "${node.nodeConfig?.label || node.config.label}" has no "false" branch connected.`,
            [nodeId]);
        }
      }
    });

    if (!hasInput) {
      result.addIssue(VSEVERITY.WARNING, 'NO_INPUT', 'Flow has no Input node — consider adding one as an entry point.');
    }
    if (!hasOutput) {
      result.addIssue(VSEVERITY.WARNING, 'NO_OUTPUT', 'Flow has no Output node — consider adding one as an exit point.');
    }
  }

  // ---- Step 2: Connected Components (BFS, undirected) ----
  _findComponents(result) {
    const g = this.graph;
    const visited = new Set();
    const components = [];

    g.adjacency.forEach((_, nodeId) => {
      if (visited.has(nodeId)) return;

      const component = [];
      const queue = [nodeId];
      visited.add(nodeId);

      while (queue.length > 0) {
        const current = queue.shift();
        component.push(current);

        // Traverse both directions (undirected reachability)
        const entry = g.adjacency.get(current);
        if (!entry) continue;

        entry.out.forEach(e => {
          if (!visited.has(e.targetId)) {
            visited.add(e.targetId);
            queue.push(e.targetId);
          }
        });
        entry.in.forEach(e => {
          if (!visited.has(e.sourceId)) {
            visited.add(e.sourceId);
            queue.push(e.sourceId);
          }
        });
      }

      components.push(component);
    });

    result.components = components;

    // Find orphans: nodes with no connections at all
    g.adjacency.forEach((entry, nodeId) => {
      if (entry.in.length === 0 && entry.out.length === 0) {
        result.orphans.push(nodeId);
      }
    });

    if (components.length > 1) {
      result.addIssue(VSEVERITY.WARNING, 'DISCONNECTED',
        `Flow has ${components.length} disconnected groups. Consider connecting them or removing isolated nodes.`,
        components.flat());
    }

    if (result.orphans.length > 0) {
      const orphanLabels = result.orphans.map(id => {
        const n = g.getNode(id);
        return n ? (n.nodeConfig?.label || n.config.label) : id.slice(-6);
      });
      result.addIssue(VSEVERITY.WARNING, 'ORPHANS',
        `${result.orphans.length} orphan node(s) with no connections: ${orphanLabels.join(', ')}`,
        result.orphans);
    }
  }

  // ---- Step 3: Cycle Detection (DFS 3-color) ----
  // WHITE (0) = unvisited, GRAY (1) = in current path, BLACK (2) = fully explored
  _detectCycles(result) {
    const g = this.graph;
    const color = new Map();  // nodeId -> 0/1/2
    const parent = new Map(); // nodeId -> nodeId (for path reconstruction)
    const cycles = [];

    g.adjacency.forEach((_, nodeId) => color.set(nodeId, 0));

    const dfs = (nodeId) => {
      color.set(nodeId, 1); // GRAY — entering

      const entry = g.adjacency.get(nodeId);
      if (!entry) return;

      for (const edge of entry.out) {
        const neighbor = edge.targetId;
        const neighborColor = color.get(neighbor);

        if (neighborColor === 1) {
          // GRAY neighbor = back edge = CYCLE found!
          const cycle = this._reconstructCycle(parent, nodeId, neighbor);
          cycles.push(cycle);
        } else if (neighborColor === 0) {
          parent.set(neighbor, nodeId);
          dfs(neighbor);
        }
        // BLACK (2) = already fully explored, skip
      }

      color.set(nodeId, 2); // BLACK — done
    };

    // Run DFS from every unvisited node
    g.adjacency.forEach((_, nodeId) => {
      if (color.get(nodeId) === 0) {
        dfs(nodeId);
      }
    });

    result.cycles = cycles;
    result.isDAG = cycles.length === 0;

    if (cycles.length > 0) {
      cycles.forEach((cycle, i) => {
        const labels = cycle.map(id => {
          const n = g.getNode(id);
          return n ? (n.nodeConfig?.label || n.config.label) : id.slice(-6);
        });
        result.addIssue(VSEVERITY.ERROR, 'CYCLE',
          `Cycle detected: ${labels.join(' → ')} → ${labels[0]}`,
          cycle);
      });
    }
  }

  _reconstructCycle(parent, from, to) {
    // Walk back from 'from' to 'to' using parent map
    const cycle = [to];
    let current = from;
    while (current !== to) {
      cycle.push(current);
      current = parent.get(current);
      if (!current) break; // safety
    }
    cycle.reverse();
    return cycle;
  }

  // ---- Step 4: Topological Sort (Kahn's Algorithm) ----
  _topologicalSort(result) {
    const g = this.graph;

    // Build in-degree map
    const inDegree = new Map();
    g.adjacency.forEach((entry, nodeId) => {
      inDegree.set(nodeId, entry.in.length);
    });

    // Seed queue with nodes that have in-degree 0
    const queue = [];
    inDegree.forEach((deg, nodeId) => {
      if (deg === 0) queue.push(nodeId);
    });

    const order = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      order.push(nodeId);

      const entry = g.adjacency.get(nodeId);
      if (!entry) continue;

      for (const edge of entry.out) {
        const newDeg = inDegree.get(edge.targetId) - 1;
        inDegree.set(edge.targetId, newDeg);
        if (newDeg === 0) {
          queue.push(edge.targetId);
        }
      }
    }

    result.topoOrder = order;

    // Sanity check — if order length != node count, something went wrong
    if (order.length !== g.nodeCount) {
      result.addIssue(VSEVERITY.ERROR, 'TOPO_INCOMPLETE',
        `Topological sort incomplete: processed ${order.length}/${g.nodeCount} nodes. Possible undetected cycle.`);
    }
  }

  // ---- Step 5: Reachability ----
  _checkReachability(result) {
    if (!result.isDAG || result.topoOrder.length === 0) return;

    const g = this.graph;

    // Find all nodes reachable from sources (BFS forward)
    const sources = g.getSources();
    const reachableFromSource = new Set();
    const forwardQueue = [...sources];
    forwardQueue.forEach(id => reachableFromSource.add(id));

    while (forwardQueue.length > 0) {
      const nodeId = forwardQueue.shift();
      g.getOutNeighbors(nodeId).forEach(neighbor => {
        if (!reachableFromSource.has(neighbor)) {
          reachableFromSource.add(neighbor);
          forwardQueue.push(neighbor);
        }
      });
    }

    // Find all nodes that can reach sinks (BFS backward)
    const sinks = g.getSinks();
    const reachesToSink = new Set();
    const backwardQueue = [...sinks];
    backwardQueue.forEach(id => reachesToSink.add(id));

    while (backwardQueue.length > 0) {
      const nodeId = backwardQueue.shift();
      g.getInNeighbors(nodeId).forEach(neighbor => {
        if (!reachesToSink.has(neighbor)) {
          reachesToSink.add(neighbor);
          backwardQueue.push(neighbor);
        }
      });
    }

    // Nodes not reachable from any source
    const unreachable = [];
    g.adjacency.forEach((_, nodeId) => {
      if (!reachableFromSource.has(nodeId)) unreachable.push(nodeId);
    });

    // Nodes that don't lead to any sink (dead ends in the middle)
    const deadEnds = [];
    g.adjacency.forEach((entry, nodeId) => {
      if (!reachesToSink.has(nodeId) && entry.out.length > 0) deadEnds.push(nodeId);
    });

    if (unreachable.length > 0) {
      result.addIssue(VSEVERITY.WARNING, 'UNREACHABLE',
        `${unreachable.length} node(s) not reachable from any source/input.`,
        unreachable);
    }

    if (deadEnds.length > 0) {
      result.addIssue(VSEVERITY.WARNING, 'DEAD_END',
        `${deadEnds.length} node(s) don't lead to any output/sink.`,
        deadEnds);
    }
  }
}


/* ============================================
   Validation UI Manager
   Handles animated validation, node highlighting,
   and results panel
   ============================================ */

class ValidationUI {
  constructor() {
    this.panelEl = document.getElementById('validation-panel');
    this.resultsEl = document.getElementById('validation-results');
    this.currentResult = null;
    this.animationTimer = null;
  }

  /**
   * Run validation with step-by-step animation.
   * Each node lights up as it's checked.
   */
  async runAnimated(graph, getNodeEl) {
    this.clear();
    this.show();

    const validator = new FlowValidator(graph);
    const steps = [];

    // Collect steps
    const result = validator.validate((step) => {
      steps.push(step);
    });

    this.currentResult = result;

    // Animate: show each phase as a line in the panel
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this._addStepLine(step.message, 'running');
      await this._delay(300);
      this._updateLastStep('done');
    }

    // Highlight nodes based on results
    this._highlightNodes(result, graph);

    // Render final results
    this._renderResults(result, graph);

    return result;
  }

  /**
   * Run instant validation (no animation).
   */
  runInstant(graph) {
    const validator = new FlowValidator(graph);
    return validator.validate();
  }

  // Show execution order overlay on nodes
  showExecutionOrder(result, graph) {
    this.clearHighlights();
    result.topoOrder.forEach((nodeId, index) => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        const badge = document.createElement('div');
        badge.className = 'node-order-badge';
        badge.textContent = index + 1;
        node.el.appendChild(badge);
        node.el.classList.add('validation-pass');
      }
    });
  }

  _highlightNodes(result, graph) {
    this.clearHighlights();

    // Mark cycle nodes
    result.cycles.forEach(cycle => {
      cycle.forEach(nodeId => {
        const node = graph.getNode(nodeId);
        if (node && node.el) {
          node.el.classList.add('validation-error');
        }
      });
    });

    // Mark orphan nodes
    result.orphans.forEach(nodeId => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        node.el.classList.add('validation-warning');
      }
    });

    // Mark unreachable/dead end nodes
    result.issues.forEach(issue => {
      if (issue.code === 'UNREACHABLE' || issue.code === 'DEAD_END') {
        issue.nodeIds.forEach(nodeId => {
          const node = graph.getNode(nodeId);
          if (node && node.el && !node.el.classList.contains('validation-error')) {
            node.el.classList.add('validation-warning');
          }
        });
      }
    });

    // If all passed, mark topo order nodes green with order badges
    if (result.executionReady) {
      this.showExecutionOrder(result, graph);
    }
  }

  clearHighlights() {
    document.querySelectorAll('.node').forEach(el => {
      el.classList.remove('validation-error', 'validation-warning', 'validation-pass');
      el.querySelector('.node-order-badge')?.remove();
    });
  }

  _renderResults(result, graph) {
    if (!this.resultsEl) return;

    // Summary
    const summary = document.createElement('div');
    summary.className = `validation-summary ${result.executionReady ? 'valid' : result.errorCount > 0 ? 'invalid' : 'warnings'}`;

    if (result.executionReady) {
      summary.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4 4a1 1 0 01-1.4 0l-2-2a1 1 0 011.4-1.4L7 8.17l3.3-3.3a1 1 0 011.4 1.42z"/></svg>
        <span>Flow is valid — ${result.topoOrder.length} nodes in execution order</span>
      `;
    } else if (result.errorCount > 0) {
      summary.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 011 1v3a1 1 0 01-2 0V5a1 1 0 011-1zm0 7a1 1 0 110 2 1 1 0 010-2z"/></svg>
        <span>${result.errorCount} error(s), ${result.warningCount} warning(s)</span>
      `;
    } else {
      summary.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 011 1v3a1 1 0 01-2 0V5a1 1 0 011-1zm0 7a1 1 0 110 2 1 1 0 010-2z"/></svg>
        <span>${result.warningCount} warning(s) — flow may still work</span>
      `;
    }
    this.resultsEl.appendChild(summary);

    // Issue list
    result.issues.forEach(issue => {
      if (issue.severity === VSEVERITY.PASS) return; // shown in summary
      const item = document.createElement('div');
      item.className = `validation-issue ${issue.severity}`;
      item.innerHTML = `
        <span class="validation-issue-icon">${this._severityIcon(issue.severity)}</span>
        <span class="validation-issue-text">${issue.message}</span>
      `;

      // Click to highlight related nodes
      if (issue.nodeIds.length > 0) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => {
          this.clearHighlights();
          issue.nodeIds.forEach(nodeId => {
            const node = graph.getNode(nodeId);
            if (node && node.el) {
              node.el.classList.add(issue.severity === VSEVERITY.ERROR ? 'validation-error' : 'validation-warning');
              node.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        });
      }

      this.resultsEl.appendChild(item);
    });

    // Topological order detail
    if (result.topoOrder.length > 0) {
      const topoSection = document.createElement('div');
      topoSection.className = 'validation-topo';
      topoSection.innerHTML = `<div class="validation-topo-title">Execution Order</div>`;

      const topoList = document.createElement('div');
      topoList.className = 'validation-topo-list';

      result.topoOrder.forEach((nodeId, index) => {
        const node = graph.getNode(nodeId);
        if (!node) return;
        const color = node.config.color;
        const label = node.nodeConfig?.label || node.config.label;

        const item = document.createElement('div');
        item.className = 'validation-topo-item';
        item.innerHTML = `
          <span class="validation-topo-index">${index + 1}</span>
          <span class="validation-topo-dot" style="background: ${color}"></span>
          <span class="validation-topo-label">${label}</span>
          <span class="validation-topo-type">${node.type}</span>
        `;

        // Click to select node
        item.addEventListener('click', () => {
          const el = node.el;
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        topoList.appendChild(item);

        // Arrow between items (except last)
        if (index < result.topoOrder.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'validation-topo-arrow';
          arrow.textContent = '↓';
          topoList.appendChild(arrow);
        }
      });

      topoSection.appendChild(topoList);
      this.resultsEl.appendChild(topoSection);
    }
  }

  _severityIcon(severity) {
    switch (severity) {
      case VSEVERITY.ERROR:   return '<svg width="12" height="12" viewBox="0 0 12 12" fill="#FF6B6B"><circle cx="6" cy="6" r="5"/><path d="M4 4l4 4M8 4l-4 4" stroke="#0A0A0F" stroke-width="1.5"/></svg>';
      case VSEVERITY.WARNING: return '<svg width="12" height="12" viewBox="0 0 12 12" fill="#FBBF24"><path d="M6 1l5.5 10H.5L6 1z"/><path d="M6 5v2M6 8.5v.5" stroke="#0A0A0F" stroke-width="1.2"/></svg>';
      case VSEVERITY.INFO:    return '<svg width="12" height="12" viewBox="0 0 12 12" fill="#38BDF8"><circle cx="6" cy="6" r="5"/><path d="M6 5v3M6 3.5v.5" stroke="#0A0A0F" stroke-width="1.2"/></svg>';
      default: return '';
    }
  }

  _addStepLine(message, status) {
    if (!this.resultsEl) return;
    const line = document.createElement('div');
    line.className = `validation-step ${status}`;
    line.innerHTML = `
      <span class="validation-step-spinner"></span>
      <span>${message}</span>
    `;
    this.resultsEl.appendChild(line);
  }

  _updateLastStep(status) {
    if (!this.resultsEl) return;
    const steps = this.resultsEl.querySelectorAll('.validation-step');
    const last = steps[steps.length - 1];
    if (last) {
      last.classList.remove('running');
      last.classList.add(status);
    }
  }

  show() {
    if (this.panelEl) this.panelEl.classList.add('open');
  }

  hide() {
    if (this.panelEl) this.panelEl.classList.remove('open');
    this.clearHighlights();
  }

  clear() {
    if (this.resultsEl) this.resultsEl.innerHTML = '';
    this.clearHighlights();
    this.currentResult = null;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
