/* ============================================
   AgentForge — Main Application (Phase 2)
   FlowGraph source of truth + config panel
   ============================================ */

(function () {
  'use strict';

  // ---- State ----
  let graph = new FlowGraph();
  let selectedNodes = new Set();
  let connectionMgr;
  let canvasMgr;
  let configPanel;
  let storage;
  let activeDebugger = null; // persists breakpoints across runs

  // DOM refs
  const canvasContainer = document.getElementById('canvas-container');
  const canvasEl = document.getElementById('canvas');
  const svgLayer = document.getElementById('connections-layer');
  const emptyState = document.getElementById('canvas-empty');
  const flowNameEl = document.querySelector('.flow-name');

  // Autosave timer
  let autosaveTimer = null;
  let saveModalMode = 'save';
  let validationUI;
  let executionUI;
  let dashboard;
  let analyzerUI;
  let arenaUI;

  // ---- Initialize ----
  function init() {
    canvasMgr = new CanvasManager(canvasContainer, canvasEl, svgLayer);
    connectionMgr = new ConnectionManager(svgLayer);
    configPanel = new ConfigPanel(document.getElementById('config-panel'));
    storage = new StorageManager();
    connectionMgr.onConnectionRemoved = (conn) => {
      graph.removeEdge(conn.from.nodeId, conn.from.port, conn.to.nodeId, conn.to.port);
      refreshGraphState();
    };

    // Config panel callbacks
    configPanel.onConfigChange = (nodeId, key, value) => {
      const node = graph.getNode(nodeId);
      if (node) {
        node.nodeConfig[key] = value;
        scheduleAutosave();
      }
    };
    configPanel.onNodeLabelChange = (nodeId, label) => {
      const node = graph.getNode(nodeId);
      if (node && node.el) {
        const titleEl = node.el.querySelector('.node-title');
        if (titleEl) titleEl.textContent = label || node.config.label;
        node.el.dataset.label = label || node.config.label;
      }
    };

    // Flow name editing
    if (flowNameEl) {
      flowNameEl.addEventListener('blur', () => {
        graph.metadata.name = flowNameEl.textContent.trim() || 'Untitled Flow';
        flowNameEl.textContent = graph.metadata.name;
        scheduleAutosave();
      });
      flowNameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); flowNameEl.blur(); }
      });
    }

    setupPaletteDrag();
    setupCanvasInteraction();
    setupQuickAdd();
    setupKeyboard();
    setupButtons();
    setupSaveLoad();
    setupValidation();
    setupExecution();
    setupAnalyzer();
    setupDashboard();
    setupTabs();
    setupExamples();
    setupLayout();
    setupAIBuilder();
    setupExport();
    setupAPIKey();
    setupSettings();
    updateMinimap();

    // Reset param for clean demo starts
    if (new URLSearchParams(window.location.search).has('reset')) {
      localStorage.clear();
      window.history.replaceState({}, '', window.location.pathname);
      return; // Start fresh — don't load autosave
    }

    // Try loading autosave
    const autosaved = storage.loadAutosave();
    if (autosaved && autosaved.nodes && autosaved.nodes.length > 0) {
      loadFlowData(autosaved);
      showToast('Restored autosaved flow');
    }
  }

  // ---- Helper ----
  function getNodeById(id) {
    return graph.getNode(id);
  }

  function refreshGraphState({ autosave = true } = {}) {
    if (validationUI) validationUI.clearHighlights();
    if (executionUI) executionUI.clearNodeStates();
    silentValidate();
    updateMinimap();
    if (autosave) scheduleAutosave();
  }

  // ---- Palette drag-to-canvas ----
  function setupPaletteDrag() {
    const paletteNodes = document.querySelectorAll('.palette-node');
    let dragGhost = null;

    paletteNodes.forEach(pn => {
      pn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', pn.dataset.type);
        e.dataTransfer.effectAllowed = 'copy';
        dragGhost = pn.cloneNode(true);
        dragGhost.style.position = 'fixed';
        dragGhost.style.opacity = '0.7';
        dragGhost.style.pointerEvents = 'none';
        dragGhost.style.zIndex = '9999';
        document.body.appendChild(dragGhost);
        e.dataTransfer.setDragImage(dragGhost, 0, 0);
      });
      pn.addEventListener('dragend', () => {
        if (dragGhost && dragGhost.parentNode) dragGhost.parentNode.removeChild(dragGhost);
        dragGhost = null;
      });
    });

    canvasContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    canvasContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (!type || !NODE_TYPES[type]) return;
      const pos = canvasMgr.screenToCanvas(e.clientX, e.clientY);
      addNode(type, pos.x - 100, pos.y - 30);
    });
  }

  // ---- Node CRUD ----
  function addNode(type, x, y, id = null) {
    const node = new FlowNode(type, x, y, id);
    const el = node.render();
    canvasEl.appendChild(el);
    graph.addNode(node);
    setupNodeInteraction(node);
    hideEmptyState();
    refreshGraphState();
    showToast(`Added ${node.config.label} node`);
    return node;
  }

  function removeNode(nodeId) {
    const node = graph.getNode(nodeId);
    if (!node) return;
    if (configPanel.currentNodeId === nodeId) configPanel.close();
    connectionMgr.removeConnectionsForNode(nodeId);
    node.destroy();
    graph.removeNode(nodeId);
    selectedNodes.delete(nodeId);
    if (graph.nodeCount === 0) showEmptyState();
    refreshGraphState();
  }

  // ---- Breakpoint toggling ----
  function toggleNodeBreakpoint(nodeId) {
    // Ensure we have a debugger to store breakpoints
    if (!activeDebugger) {
      activeDebugger = new FlowDebugger(graph);
    }
    const isSet = activeDebugger.toggleBreakpoint(nodeId);
    const node = graph.getNode(nodeId);
    if (!node || !node.el) return;

    // Add/remove visual indicator
    const existing = node.el.querySelector('.node-breakpoint');
    if (isSet && !existing) {
      const dot = document.createElement('div');
      dot.className = 'node-breakpoint';
      dot.title = 'Breakpoint (right-click to remove)';
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNodeBreakpoint(nodeId);
      });
      node.el.appendChild(dot);
      showToast(`Breakpoint set on ${node.nodeConfig?.label || node.config.label}`);
    } else if (!isSet && existing) {
      existing.remove();
      showToast(`Breakpoint removed`);
    }
  }

  // ---- Node interaction ----
  function setupNodeInteraction(node) {
    const el = node.el;
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let hasMoved = false;

    // Right-click to toggle breakpoint
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleNodeBreakpoint(node.id);
    });

    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.port-dot') || e.target.closest('.port')) return;
      if (e.target.closest('[data-action="delete"]')) { removeNode(node.id); return; }
      if (e.target.closest('.node-breakpoint')) return; // don't drag when clicking breakpoint dot

      e.stopPropagation();
      if (!e.ctrlKey && !e.metaKey && !selectedNodes.has(node.id)) clearSelection();
      selectNode(node.id);
      hasMoved = false;
      isDragging = true;
      el.classList.add('dragging');
      const pos = canvasMgr.screenToCanvas(e.clientX, e.clientY);
      dragOffset.x = pos.x - node.x;
      dragOffset.y = pos.y - node.y;
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      hasMoved = true;
      const pos = canvasMgr.screenToCanvas(e.clientX, e.clientY);
      const newX = pos.x - dragOffset.x;
      const newY = pos.y - dragOffset.y;
      const dx = newX - node.x;
      const dy = newY - node.y;
      selectedNodes.forEach(id => {
        const n = graph.getNode(id);
        if (n) n.setPosition(n.x + dx, n.y + dy);
      });
      connectionMgr.updateAll(getNodeById);
      updateMinimap();
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        el.classList.remove('dragging');
        if (!hasMoved) {
          configPanel.open(node);
        } else {
          scheduleAutosave();
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Port connection dragging
    el.querySelectorAll('.port-dot').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const nodeId = dot.dataset.nodeId;
        const portName = dot.dataset.port;
        const dir = dot.dataset.dir;
        const sourceNode = graph.getNode(nodeId);
        if (!sourceNode) return;
        const portPos = sourceNode.getPortPosition(portName, dir);
        connectionMgr.dragging = true;
        connectionMgr.dragFrom = { nodeId, port: portName, dir };
        connectionMgr.startTempPath(portPos.x, portPos.y);
      });
    });
  }

  // ---- Canvas interaction ----
  function setupCanvasInteraction() {
    canvasContainer.addEventListener('mousemove', (e) => {
      if (!connectionMgr.dragging) return;
      const pos = canvasMgr.screenToCanvas(e.clientX, e.clientY);
      connectionMgr.updateTempPath(pos.x, pos.y);
    });

    canvasContainer.addEventListener('mouseup', (e) => {
      if (!connectionMgr.dragging) return;
      const target = e.target.closest('.port-dot');
      if (target) {
        const toNodeId = target.dataset.nodeId;
        const toPort = target.dataset.port;
        const toDir = target.dataset.dir;
        const from = connectionMgr.dragFrom;
        let added = false;
        if (from.dir === 'out' && toDir === 'in') {
          connectionMgr.addConnection(from.nodeId, from.port, toNodeId, toPort);
          graph.addEdge(from.nodeId, from.port, toNodeId, toPort);
          added = true;
        } else if (from.dir === 'in' && toDir === 'out') {
          connectionMgr.addConnection(toNodeId, toPort, from.nodeId, from.port);
          graph.addEdge(toNodeId, toPort, from.nodeId, from.port);
          added = true;
        }
        if (added) {
          connectionMgr.updateAll(getNodeById);
          refreshGraphState();
        }
      }
      connectionMgr.endTempPath();
      connectionMgr.dragging = false;
      connectionMgr.dragFrom = null;
    });

    canvasContainer.addEventListener('mousedown', (e) => {
      if (e.target === canvasContainer || e.target === canvasEl) {
        if (!e.shiftKey && e.button === 0) {
          clearSelection();
          configPanel.close();
          closeQuickAdd();
        }
      }
    });
  }

  // ---- Selection ----
  function selectNode(nodeId) {
    selectedNodes.add(nodeId);
    const node = graph.getNode(nodeId);
    if (node) node.setSelected(true);
  }

  function clearSelection() {
    selectedNodes.forEach(id => {
      const node = graph.getNode(id);
      if (node) node.setSelected(false);
    });
    selectedNodes.clear();
  }

  // ---- Quick add ----
  let quickAddMenu = null;

  function setupQuickAdd() {
    canvasContainer.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node')) return;
      const pos = canvasMgr.screenToCanvas(e.clientX, e.clientY);
      showQuickAdd(e.clientX, e.clientY, pos.x, pos.y);
    });
  }

  function showQuickAdd(screenX, screenY, canvasX, canvasY) {
    closeQuickAdd();
    const menu = document.createElement('div');
    menu.className = 'quick-add-menu';
    menu.style.left = screenX + 'px';
    menu.style.top = screenY + 'px';
    Object.entries(NODE_TYPES).forEach(([type, config]) => {
      const item = document.createElement('button');
      item.className = 'quick-add-item';
      item.innerHTML = `
        <div class="palette-node-icon" style="--node-color: ${config.color}">${config.icon}</div>
        <span>${config.label}</span>
      `;
      item.addEventListener('click', () => { addNode(type, canvasX - 100, canvasY - 30); closeQuickAdd(); });
      menu.appendChild(item);
    });
    document.body.appendChild(menu);
    quickAddMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', handleQuickAddOutside), 0);
  }

  function handleQuickAddOutside(e) {
    if (quickAddMenu && !quickAddMenu.contains(e.target)) closeQuickAdd();
  }

  function closeQuickAdd() {
    if (quickAddMenu && quickAddMenu.parentNode) quickAddMenu.parentNode.removeChild(quickAddMenu);
    quickAddMenu = null;
    document.removeEventListener('mousedown', handleQuickAddOutside);
  }

  // ---- Keyboard ----
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        [...selectedNodes].forEach(id => removeNode(id));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        graph.getAllNodes().forEach(n => selectNode(n.id));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFlow();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        document.getElementById('btn-validate')?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        document.getElementById('btn-tidy')?.click();
      }
      if (e.key === 'Escape') {
        clearSelection();
        configPanel.close();
        closeQuickAdd();
        closeSaveModal();
        closeRunModal();
      }
    });
  }

  // ---- Buttons ----
  function setupButtons() {
    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (graph.nodeCount === 0) return;
      graph.getAllNodes().forEach(n => { connectionMgr.removeConnectionsForNode(n.id); n.destroy(); });
      graph.clear();
      connectionMgr.clear();
      selectedNodes.clear();
      configPanel.close();
      showEmptyState();
      refreshGraphState();
      showToast('Canvas cleared');
    });
  }

  // ---- Validation ----
  function setupValidation() {
    validationUI = new ValidationUI();

    document.getElementById('btn-validate')?.addEventListener('click', async () => {
      if (graph.nodeCount === 0) {
        showToast('Nothing to validate — add some nodes first');
        return;
      }
      const result = await validationUI.runAnimated(graph, getNodeById);

      // Enable/disable Run button based on validation
      const runBtn = document.getElementById('btn-run');
      if (runBtn) {
        runBtn.disabled = !result.executionReady;
      }
    });

    document.getElementById('validation-close')?.addEventListener('click', () => {
      validationUI.hide();
    });
  }

  // ---- Execution ----
  function setupExecution() {
    executionUI = new ExecutionUI();

    // Run button → open input modal (or run directly if already validated)
    document.getElementById('btn-run')?.addEventListener('click', () => {
      if (executionUI.isRunning()) {
        executionUI.abort();
        return;
      }
      openRunModal();
    });

    // Run modal buttons
    document.getElementById('run-cancel')?.addEventListener('click', closeRunModal);
    document.getElementById('run-confirm')?.addEventListener('click', async () => {
      const input = document.getElementById('run-input-textarea').value;
      const debugMode = document.getElementById('run-debug-mode')?.checked || false;
      closeRunModal();

      // Close validation panel if open
      validationUI.hide();

      // Run the flow — executionUI.run returns after completion
      executionUI._recordCallback = (ctx) => {
        if (dashboard) {
          dashboard.recordRun(ctx, graph.metadata.name, graph.nodeCount);
        }
        // Record trace for analyzer
        if (analyzerUI && executionUI._lastDebugger) {
          analyzerUI.showDebugTrace(executionUI._lastDebugger.traceHistory, graph);
        }
      };

      // Create debugger — carry over breakpoints from previous session
      const dbg = new FlowDebugger(graph);
      if (activeDebugger) {
        for (const bp of activeDebugger.breakpoints) {
          dbg.breakpoints.add(bp);
        }
      }
      // In debug mode, pause at the very first node
      if (debugMode) {
        dbg.stepMode = true;
      }
      activeDebugger = dbg;
      executionUI._lastDebugger = dbg;
      await executionUI.run(graph, input, connectionMgr, dbg);
      executionUI._recordCallback = null;
    });
    document.getElementById('run-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'run-modal') closeRunModal();
    });

    // Execution panel buttons
    document.getElementById('execution-close')?.addEventListener('click', () => {
      executionUI.hide();
    });
    document.getElementById('execution-clear')?.addEventListener('click', () => {
      executionUI.clear();
    });
  }

  function openRunModal() {
    const modal = document.getElementById('run-modal');
    modal.style.display = 'flex';
    const textarea = document.getElementById('run-input-textarea');
    textarea.value = '';
    textarea.focus();
  }

  function closeRunModal() {
    document.getElementById('run-modal').style.display = 'none';
  }

  // ---- Analyzer ----
  function setupAnalyzer() {
    analyzerUI = new AnalyzerUI();

    document.getElementById('btn-analyze')?.addEventListener('click', () => {
      if (graph.nodeCount === 0) {
        showToast('Nothing to analyze — add some nodes first');
        return;
      }
      // Close other bottom panels
      validationUI.hide();
      executionUI.hide();

      analyzerUI.showAnalysis(graph);
    });

    document.getElementById('analyzer-close')?.addEventListener('click', () => {
      analyzerUI.hide();
    });
  }

  // ---- Dashboard ----
  function setupDashboard() {
    dashboard = new Dashboard(document.getElementById('dashboard-view'));
    arenaUI = new ArenaUI(document.getElementById('arena-view'));
  }

  // ---- Tab switching (Builder / Dashboard / Arena) ----
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab[data-view]');
    const workspace = document.querySelector('.workspace');
    const builderButtons = ['btn-validate', 'btn-run', 'btn-clear', 'btn-save', 'btn-load', 'btn-examples', 'layout-group', 'btn-analyze'];

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Remove all view classes
        workspace.classList.remove('view-dashboard', 'view-arena');
        dashboard.hide();

        if (view === 'builder') {
          builderButtons.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
        } else {
          builderButtons.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

          if (view === 'dashboard') {
            workspace.classList.add('view-dashboard');
            dashboard.show();
          } else if (view === 'arena') {
            workspace.classList.add('view-arena');
            arenaUI.render();
          }
        }
      });
    });
  }

  // ---- Examples ----
  function setupExamples() {
    document.getElementById('btn-examples')?.addEventListener('click', showExamplesMenu);
  }

  function showExamplesMenu() {
    // Close any existing menu
    document.querySelector('.examples-menu')?.remove();

    const btn = document.getElementById('btn-examples');
    const rect = btn.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'quick-add-menu examples-menu';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.minWidth = '260px';

    const header = document.createElement('div');
    header.className = 'examples-menu-header';
    header.textContent = 'Load Example Flow';
    menu.appendChild(header);

    const descriptions = {
      "Simple Chat": "Input → LLM → Output. The basics.",
      "Summarize & Translate": "Chain 2 LLMs + merge. Summarize then translate.",
      "Sentiment Router": "Classify sentiment → branch to different handlers.",
      "RAG Pipeline": "Retrieval + rewrite → merge context → generate answer.",
      "Iterative Analyst": "Loop + multi-LLM analysis of financial data.",
      "AI Debate": "Debate node — two LLMs argue, a judge picks the winner.",
      "Enterprise Decision Advisor": "Decision intelligence: 3 data sources → domain analysts → cross-functional synthesis → risk routing.",
      "Multi-Agent Pipeline": "Ensemble + Supervisor + Barrier → parallel multi-agent research.",
    };

    Object.entries(EXAMPLE_FLOWS).forEach(([name, flow]) => {
      const item = document.createElement('button');
      item.className = 'quick-add-item examples-item';
      item.innerHTML = `
        <div class="examples-item-info">
          <span class="examples-item-name">${name}</span>
          <span class="examples-item-desc">${descriptions[name] || ''}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        loadFlowData(flow);
        silentValidate();
        menu.remove();
        showToast(`Loaded "${name}"`);
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Close on outside click
    setTimeout(() => {
      const handler = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', handler); }
      };
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  // ---- Layout & Generation ----
  function setupLayout() {
    // Tidy Up button — hierarchical layout
    document.getElementById('btn-tidy')?.addEventListener('click', async () => {
      if (graph.nodeCount === 0) { showToast('Nothing to arrange'); return; }
      const positions = HierarchicalLayout.apply(graph);
      if (positions.length > 0) {
        await LayoutAnimator.animate(graph, positions, connectionMgr, getNodeById, 600);
        updateMinimap();
        scheduleAutosave();
        showToast('Tidied up — hierarchical layout');
      }
    });

    // Generate button — dropdown menu
    document.getElementById('btn-generate')?.addEventListener('click', showGenerateMenu);
  }

  function showGenerateMenu() {
    document.querySelector('.generate-menu')?.remove();

    const btn = document.getElementById('btn-generate');
    const rect = btn.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'generate-menu';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 6) + 'px';

    let nodeCount = 6;

    menu.innerHTML = `
      <div class="generate-menu-header">Generate Flow</div>
      <div class="generate-menu-section">
        <label>Nodes:</label>
        <input type="number" id="gen-node-count" value="${nodeCount}" min="3" max="12">
      </div>
      <div class="generate-menu-divider"></div>
      <div class="generate-menu-header">Maze Algorithms</div>
    `;

    const algorithms = [
      { id: 'prims', name: "Prim's MST", desc: 'Efficient, minimal paths — like short corridors', fn: () => FlowGenerator.prims(nodeCount) },
      { id: 'kruskals', name: "Kruskal's MST", desc: 'Balanced, evenly-distributed branches', fn: () => FlowGenerator.kruskals(nodeCount) },
      { id: 'backtracker', name: 'Recursive Backtracker', desc: 'Deep, winding paths — long corridors, dead ends', fn: () => FlowGenerator.recursiveBacktracker(nodeCount) },
      { id: 'random', name: 'Random DAG', desc: 'Dense connections, multiple parallel paths', fn: () => FlowGenerator.randomDAG(nodeCount, 0.35) },
    ];

    algorithms.forEach(algo => {
      const item = document.createElement('button');
      item.className = 'generate-menu-item';
      item.innerHTML = `
        <span class="generate-item-name">${algo.name}</span>
        <span class="generate-item-desc">${algo.desc}</span>
      `;
      item.addEventListener('click', () => {
        nodeCount = parseInt(document.getElementById('gen-node-count')?.value) || 6;
        const flow = algo.fn();
        loadFlowData(flow);

        // Auto-layout after loading
        requestAnimationFrame(async () => {
          const positions = HierarchicalLayout.apply(graph);
          if (positions.length > 0) {
            await LayoutAnimator.animate(graph, positions, connectionMgr, getNodeById, 800);
            updateMinimap();
            scheduleAutosave();
          }
        });

        menu.remove();
        showToast(`Generated with ${algo.name} (${nodeCount} nodes)`);
      });
      menu.appendChild(item);
    });

    // Force-directed layout option
    const divider2 = document.createElement('div');
    divider2.className = 'generate-menu-divider';
    menu.appendChild(divider2);

    const header2 = document.createElement('div');
    header2.className = 'generate-menu-header';
    header2.textContent = 'Layout Only';
    menu.appendChild(header2);

    const forceItem = document.createElement('button');
    forceItem.className = 'generate-menu-item';
    forceItem.innerHTML = `
      <span class="generate-item-name">Force-Directed Layout</span>
      <span class="generate-item-desc">Physics simulation — nodes repel, edges attract</span>
    `;
    forceItem.addEventListener('click', async () => {
      if (graph.nodeCount === 0) { showToast('Nothing to layout'); menu.remove(); return; }
      const positions = ForceDirectedLayout.apply(graph);
      await LayoutAnimator.animate(graph, positions, connectionMgr, getNodeById, 800);
      updateMinimap();
      scheduleAutosave();
      menu.remove();
      showToast('Applied force-directed layout');
    });
    menu.appendChild(forceItem);

    document.body.appendChild(menu);

    setTimeout(() => {
      const handler = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', handler); }
      };
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  // ---- Save / Load ----
  function setupSaveLoad() {
    document.getElementById('btn-save')?.addEventListener('click', openSaveModal);
    document.getElementById('btn-load')?.addEventListener('click', openLoadModal);
    document.getElementById('save-cancel')?.addEventListener('click', closeSaveModal);
    document.getElementById('save-confirm')?.addEventListener('click', () => {
      if (saveModalMode === 'load') {
        closeSaveModal();
        return;
      }
      const name = document.getElementById('save-name-input').value.trim();
      if (!name) return;
      graph.metadata.name = name;
      flowNameEl.textContent = name;
      storage.saveFlow(graph.serialize());
      closeSaveModal();
      showToast(`Saved "${name}"`);
    });
    document.getElementById('save-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'save-modal') closeSaveModal();
    });
  }

  function openSaveModal() {
    saveModalMode = 'save';
    const modal = document.getElementById('save-modal');
    const nameInput = document.getElementById('save-name-input');
    const listEl = document.getElementById('saved-flows-list');

    document.querySelector('#save-modal .modal-header').textContent = 'Save Flow';
    document.getElementById('save-confirm').textContent = 'Save';
    nameInput.style.display = '';
    nameInput.value = graph.metadata.name || '';
    modal.style.display = 'flex';

    renderFlowList(listEl, 'save');
    nameInput.focus();
    nameInput.select();
  }

  function openLoadModal() {
    const flows = storage.getFlowList();
    if (flows.length === 0) { showToast('No saved flows'); return; }

    saveModalMode = 'load';
    const modal = document.getElementById('save-modal');
    const nameInput = document.getElementById('save-name-input');
    const listEl = document.getElementById('saved-flows-list');

    document.querySelector('#save-modal .modal-header').textContent = 'Load Flow';
    document.getElementById('save-confirm').textContent = 'Close';
    nameInput.style.display = 'none';
    modal.style.display = 'flex';

    renderFlowList(listEl, 'load');
  }

  function renderFlowList(listEl, mode) {
    const flows = storage.getFlowList();
    listEl.innerHTML = '';
    flows.forEach(f => {
      const item = document.createElement('div');
      item.className = 'saved-flow-item';
      const date = new Date(f.metadata.modified).toLocaleDateString();
      item.innerHTML = `
        <div>
          <div class="saved-flow-name">${f.metadata.name}</div>
          <div class="saved-flow-date">${f.nodes.length} nodes · ${date}</div>
        </div>
        <button class="saved-flow-delete" title="Delete">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M9.5 2.5l-7 7M2.5 2.5l7 7"/></svg>
        </button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.saved-flow-delete')) return;
        if (mode === 'load') {
          loadFlowData(f);
          closeSaveModal();
          showToast(`Loaded "${f.metadata.name}"`);
        } else {
          document.getElementById('save-name-input').value = f.metadata.name;
        }
      });
      item.querySelector('.saved-flow-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        storage.deleteFlow(f.metadata.name);
        item.remove();
        showToast(`Deleted "${f.metadata.name}"`);
      });
      listEl.appendChild(item);
    });
  }

  function closeSaveModal() {
    document.getElementById('save-modal').style.display = 'none';
  }

  function saveCurrentFlow() {
    const name = graph.metadata.name || 'Untitled Flow';
    graph.metadata.name = name;
    storage.saveFlow(graph.serialize());
    showToast(`Saved "${name}"`);
  }

  // ---- Load flow data ----
  function loadFlowData(data) {
    // Clear
    graph.getAllNodes().forEach(n => { connectionMgr.removeConnectionsForNode(n.id); n.destroy(); });
    graph.clear();
    connectionMgr.clear();
    selectedNodes.clear();
    configPanel.close();

    // Rebuild
    graph = FlowGraph.deserialize(data, (type, x, y, id) => new FlowNode(type, x, y, id));

    graph.getAllNodes().forEach(node => {
      node.nodeConfig = node.nodeConfig || {};
      const el = node.render();
      if (node.nodeConfig.label) {
        const titleEl = el.querySelector('.node-title');
        if (titleEl) titleEl.textContent = node.nodeConfig.label;
      }
      canvasEl.appendChild(el);
      setupNodeInteraction(node);
    });

    graph.getEdges().forEach(edge => {
      connectionMgr.addConnection(edge.from.nodeId, edge.from.port, edge.to.nodeId, edge.to.port);
    });

    requestAnimationFrame(() => connectionMgr.updateAll(getNodeById));

    graph.metadata = data.metadata || graph.metadata;
    if (flowNameEl) flowNameEl.textContent = graph.metadata.name || 'Untitled Flow';
    if (graph.nodeCount > 0) hideEmptyState(); else showEmptyState();
    refreshGraphState({ autosave: false });
  }

  // ---- Autosave ----
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => storage.autosave(graph.serialize()), 2000);
  }

  // ---- Empty state ----
  function hideEmptyState() { if (emptyState) emptyState.classList.add('hidden'); }
  function showEmptyState() { if (emptyState) emptyState.classList.remove('hidden'); }

  // ---- Minimap ----
  function updateMinimap() {
    const mc = document.getElementById('minimap-canvas');
    if (!mc) return;
    const ctx = mc.getContext('2d');
    const w = mc.width, h = mc.height;
    ctx.clearRect(0, 0, w, h);

    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allNodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 200); maxY = Math.max(maxY, n.y + 80);
    });
    const pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const scale = Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1));
    const ox = (w - (maxX - minX) * scale) / 2;
    const oy = (h - (maxY - minY) * scale) / 2;

    ctx.strokeStyle = '#00FFB2'; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
    connectionMgr.connections.forEach(c => {
      const fn = graph.getNode(c.from.nodeId), tn = graph.getNode(c.to.nodeId);
      if (!fn || !tn) return;
      ctx.beginPath();
      ctx.moveTo((fn.x + 200 - minX) * scale + ox, (fn.y + 40 - minY) * scale + oy);
      ctx.lineTo((tn.x - minX) * scale + ox, (tn.y + 40 - minY) * scale + oy);
      ctx.stroke();
    });

    ctx.globalAlpha = 0.7;
    allNodes.forEach(n => {
      ctx.fillStyle = n.selected ? '#00FFB2' : NODE_TYPES[n.type].color;
      ctx.fillRect((n.x - minX) * scale + ox, (n.y - minY) * scale + oy, Math.max(200 * scale, 4), Math.max(60 * scale, 3));
    });
    ctx.globalAlpha = 1;
  }

  // ---- Toast ----
  let toastEl = null, toastTimeout = null;
  function showToast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  window.showToast = showToast;

  // ---- AI Builder ----
  function setupAIBuilder() {
    const builder = new NLFlowBuilder();
    const modal = document.getElementById('ai-build-modal');
    const promptEl = document.getElementById('ai-build-prompt');
    const statusEl = document.getElementById('ai-build-status');
    const generateBtn = document.getElementById('ai-build-generate');

    document.getElementById('btn-ai-build')?.addEventListener('click', () => {
      modal.style.display = 'flex';
      promptEl.value = '';
      statusEl.style.display = 'none';
      generateBtn.disabled = false;
      promptEl.focus();
    });

    // Suggestion chips
    document.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        promptEl.value = chip.dataset.prompt;
      });
    });

    document.getElementById('ai-build-cancel')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    generateBtn?.addEventListener('click', async () => {
      const prompt = promptEl.value.trim();
      if (!prompt) { promptEl.focus(); return; }

      statusEl.style.display = 'flex';
      generateBtn.disabled = true;

      try {
        // Small delay for visual effect
        await new Promise(r => setTimeout(r, 600));
        const flowData = await builder.generate(prompt);
        modal.style.display = 'none';

        // Load the flow
        loadFlowData(flowData);

        // Materialization animation: set all nodes invisible, then stagger reveal
        const allNodes = graph.getAllNodes();
        allNodes.forEach(n => {
          if (n.el) n.el.classList.add('materializing');
        });

        // Force reflow
        void document.body.offsetHeight;

        // Stagger reveal
        allNodes.forEach((n, i) => {
          if (n.el) {
            setTimeout(() => {
              n.el.classList.remove('materializing');
              n.el.classList.add('materialized');
            }, 100 + i * 120);
          }
        });

        // Auto-layout after brief delay
        setTimeout(async () => {
          if (typeof HierarchicalLayout !== 'undefined') {
            const positions = HierarchicalLayout.apply(graph);
            if (typeof LayoutAnimator !== 'undefined') {
              await LayoutAnimator.animate(graph, positions, connectionMgr, getNodeById, 700);
            } else {
              positions.forEach(pos => {
                const node = graph.getNode(pos.nodeId);
                if (node) node.setPosition(pos.x, pos.y);
              });
              connectionMgr.updateAll(getNodeById);
            }
            updateMinimap();
            scheduleAutosave();
          }
        }, 200 + allNodes.length * 120);

        // Auto-validate
        silentValidate();

        showToast('AI generated your pipeline!');

      } catch (e) {
        console.error('AI Builder error:', e);
        statusEl.querySelector('span').textContent = 'Generation failed — try again';
        generateBtn.disabled = false;
      }
    });
  }

  // ---- Export Code ----
  function setupExport() {
    const modal = document.getElementById('export-modal');
    const codeOutput = document.getElementById('export-code-output');

    document.getElementById('btn-export')?.addEventListener('click', () => {
      if (graph.nodeCount === 0) {
        showToast('Nothing to export — add some nodes first');
        return;
      }
      const gen = new CodeGenerator(graph.serialize());
      const code = gen.generate();
      codeOutput.innerHTML = gen.highlightPython(code);
      codeOutput._rawCode = code;
      modal.style.display = 'flex';
    });

    document.getElementById('export-cancel')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('export-copy')?.addEventListener('click', async () => {
      const code = codeOutput._rawCode || codeOutput.textContent;
      try {
        await navigator.clipboard.writeText(code);
        const btn = document.getElementById('export-copy');
        const origHTML = btn.innerHTML;
        btn.classList.add('btn-copied');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 7l3 3 7-7" stroke="currentColor" stroke-width="2" fill="none"/></svg> Copied!';
        setTimeout(() => { btn.innerHTML = origHTML; btn.classList.remove('btn-copied'); }, 2000);
      } catch (e) {
        showToast('Copy failed — try selecting manually');
      }
    });

    document.getElementById('export-download')?.addEventListener('click', () => {
      const code = codeOutput._rawCode || codeOutput.textContent;
      const name = (graph.metadata.name || 'pipeline').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '.py';
      const blob = new Blob([code], { type: 'text/x-python' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${name}`);
    });
  }

  // ---- API Key Modal ----
  function setupAPIKey() {
    const modal = document.getElementById('api-modal');
    const input = document.getElementById('settings-api-key');
    const status = document.getElementById('settings-status');
    const apiBtn = document.getElementById('btn-api-key');

    // Show connected indicator on load
    if (Utils.getApiKey()) {
      apiBtn?.classList.add('connected');
    }

    apiBtn?.addEventListener('click', () => {
      const key = Utils.getApiKey();
      input.value = key;
      status.textContent = key ? '✓ Connected' : '';
      status.className = 'settings-status' + (key ? ' success' : '');
      modal.style.display = 'flex';
      setTimeout(() => input.focus(), 100);
    });

    document.getElementById('settings-save')?.addEventListener('click', () => {
      const key = input.value.trim();
      if (!key) {
        status.textContent = 'Please enter an API key';
        status.className = 'settings-status error';
        return;
      }
      Utils.setApiKey(key);
      apiBtn?.classList.add('connected');
      status.textContent = '✓ Key saved!';
      status.className = 'settings-status success';
      showToast('API key saved — flows will use real Claude responses');
      setTimeout(() => { modal.style.display = 'none'; }, 800);
    });

    document.getElementById('settings-clear-key')?.addEventListener('click', () => {
      Utils.clearApiKey();
      apiBtn?.classList.remove('connected');
      input.value = '';
      status.textContent = 'Key cleared — using simulated responses.';
      status.className = 'settings-status error';
      showToast('API key cleared');
    });

    document.getElementById('api-cancel')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // ---- Settings Panel ----
  function setupSettings() {
    const modal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('btn-settings');
    const SETTINGS_KEY = 'agentforge_settings';

    // Load saved settings
    const defaults = {
      accentColor: '#00FFB2',
      fontSize: '13',
      gridSnap: true,
      autoLayout: true,
      animSpeed: 'normal',
      defaultModel: 'claude-sonnet-4-20250514',
      defaultTemp: 0.7,
      defaultTokens: '1024',
    };

    function loadSettings() {
      try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
      } catch { return { ...defaults }; }
    }

    function saveSettings(s) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    }

    function applySettings(s) {
      // Accent color
      const dim = s.accentColor + '99';
      document.documentElement.style.setProperty('--accent', s.accentColor);
      document.documentElement.style.setProperty('--accent-dim', s.accentColor + 'cc');
      document.documentElement.style.setProperty('--accent-glow', s.accentColor + '26');

      // Font size
      document.documentElement.style.fontSize = s.fontSize + 'px';

      // Update active swatch
      document.querySelectorAll('#accent-swatches .swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === s.accentColor);
      });
    }

    // Apply on load
    const current = loadSettings();
    applySettings(current);

    settingsBtn?.addEventListener('click', () => {
      const s = loadSettings();
      // Populate UI
      document.querySelectorAll('#accent-swatches .swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === s.accentColor);
      });
      document.getElementById('setting-font-size').value = s.fontSize;
      document.getElementById('setting-grid-snap').checked = s.gridSnap;
      document.getElementById('setting-auto-layout').checked = s.autoLayout;
      document.getElementById('setting-anim-speed').value = s.animSpeed;
      document.getElementById('setting-default-model').value = s.defaultModel;
      document.getElementById('setting-default-temp').value = s.defaultTemp;
      document.getElementById('setting-temp-display').textContent = s.defaultTemp;
      document.getElementById('setting-default-tokens').value = s.defaultTokens;
      modal.style.display = 'flex';
    });

    // Live accent color preview
    document.getElementById('accent-swatches')?.addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      document.querySelectorAll('#accent-swatches .swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      // Live preview
      document.documentElement.style.setProperty('--accent', sw.dataset.color);
      document.documentElement.style.setProperty('--accent-dim', sw.dataset.color + 'cc');
      document.documentElement.style.setProperty('--accent-glow', sw.dataset.color + '26');
    });

    // Temperature slider display
    document.getElementById('setting-default-temp')?.addEventListener('input', (e) => {
      document.getElementById('setting-temp-display').textContent = e.target.value;
    });

    // Apply
    document.getElementById('settings-apply')?.addEventListener('click', () => {
      const s = {
        accentColor: document.querySelector('#accent-swatches .swatch.active')?.dataset.color || defaults.accentColor,
        fontSize: document.getElementById('setting-font-size').value,
        gridSnap: document.getElementById('setting-grid-snap').checked,
        autoLayout: document.getElementById('setting-auto-layout').checked,
        animSpeed: document.getElementById('setting-anim-speed').value,
        defaultModel: document.getElementById('setting-default-model').value,
        defaultTemp: parseFloat(document.getElementById('setting-default-temp').value),
        defaultTokens: document.getElementById('setting-default-tokens').value,
      };
      saveSettings(s);
      applySettings(s);
      modal.style.display = 'none';
      showToast('Settings saved');
    });

    // Reset
    document.getElementById('settings-reset')?.addEventListener('click', () => {
      saveSettings(defaults);
      applySettings(defaults);
      // Re-populate UI
      document.getElementById('setting-font-size').value = defaults.fontSize;
      document.getElementById('setting-grid-snap').checked = defaults.gridSnap;
      document.getElementById('setting-auto-layout').checked = defaults.autoLayout;
      document.getElementById('setting-anim-speed').value = defaults.animSpeed;
      document.getElementById('setting-default-model').value = defaults.defaultModel;
      document.getElementById('setting-default-temp').value = defaults.defaultTemp;
      document.getElementById('setting-temp-display').textContent = defaults.defaultTemp;
      document.getElementById('setting-default-tokens').value = defaults.defaultTokens;
      document.querySelectorAll('#accent-swatches .swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.color === defaults.accentColor);
      });
      showToast('Settings reset to defaults');
    });

    // Cancel
    document.getElementById('settings-cancel')?.addEventListener('click', () => {
      // Revert live preview
      applySettings(loadSettings());
      modal.style.display = 'none';
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        applySettings(loadSettings());
        modal.style.display = 'none';
      }
    });

    // Expose settings getter for other modules
    window._agentForgeSettings = loadSettings;
  }

  // ---- Silent Validate (auto-validate without showing panel) ----
  function silentValidate() {
    const runBtn = document.getElementById('btn-run');
    if (!runBtn) return;

    if (graph.nodeCount === 0) {
      runBtn.disabled = true;
      return;
    }

    try {
      const validator = new FlowValidator(graph);
      const result = validator.validate();
      runBtn.disabled = !result.executionReady;
    } catch (e) {
      runBtn.disabled = true;
    }
  }

  // ---- Debug ----
  window.__agentforge = {
    get graph() { return graph; },
    get connections() { return connectionMgr; },
    get validation() { return validationUI; },
    get execution() { return executionUI; },
    get dashboard() { return dashboard; },
    get analyzer() { return analyzerUI; },
    get arena() { return arenaUI?.arena; },
    debugGraph() { graph.debugPrint(); },
    validate() { return new FlowValidator(graph).validate(); },
    pathfind(startId, endId) {
      const pf = new FlowPathfinder(graph);
      console.log('Dijkstra:', pf.dijkstra(startId, endId));
      console.log('A*:', pf.astar(startId, endId));
      console.log('All paths:', pf.allPaths(startId, endId));
    },
    optimize() {
      const opt = new FlowOptimizer(graph);
      const report = opt.analyze();
      console.log('Optimization report:', report);
      return report;
    },
  };

  // ---- Start ----
  init();
})();
