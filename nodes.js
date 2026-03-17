/* ============================================
   AgentForge — Node System
   ============================================ */

// Node type definitions
const NODE_TYPES = {
  input: {
    label: 'Input',
    color: '#00FFB2',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v10M4 7l4 4 4-4M2 14h12"/></svg>',
    ports: { in: [], out: ['output'] },
    body: 'User prompt or data',
  },
  output: {
    label: 'Output',
    color: '#FF6B6B',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15V5M4 9l4-4 4 4M2 2h12"/></svg>',
    ports: { in: ['input'], out: [] },
    body: 'Final response',
  },
  llm: {
    label: 'LLM Call',
    color: '#A78BFA',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM6 9h4v1H6V9z"/></svg>',
    ports: { in: ['prompt'], out: ['response'] },
    body: 'Claude / GPT / Mistral',
  },
  tool: {
    label: 'Tool Use',
    color: '#FBBF24',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 1.5L9 3l4 4 1.5-1.5a2.12 2.12 0 000-3 2.12 2.12 0 00-3 0zM8 4L1 11v4h4l7-7-4-4z"/></svg>',
    ports: { in: ['input'], out: ['result'] },
    body: 'API call / Function',
  },
  condition: {
    label: 'Condition',
    color: '#38BDF8',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l7 7-7 7-7-7 7-7z"/></svg>',
    ports: { in: ['input'], out: ['true', 'false'] },
    body: 'If / else branch',
  },
  loop: {
    label: 'Loop',
    color: '#F472B6',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12 4H6a4 4 0 000 8h1M10 9l3 3-3 3"/></svg>',
    ports: { in: ['input'], out: ['iteration', 'done'] },
    body: 'Repeat N times',
  },
  merge: {
    label: 'Merge',
    color: '#FB923C',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3l6 5-6 5M14 3l-6 5 6 5"/></svg>',
    ports: { in: ['input_a', 'input_b'], out: ['merged'] },
    body: 'Combine inputs',
  },

  // ---- Data Source: Structured Business Data ----
  datasource: {
    label: 'Data Source',
    color: '#06B6D4',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12v2H2zM2 7h12v2H2zM2 11h12v2H2z"/><path d="M5 2v13M10 2v13" opacity="0.4"/></svg>',
    ports: { in: [], out: ['data'] },
    body: 'Structured business data',
  },

  // ---- Phase 8: Multi-Agent Orchestration ----
  debate: {
    label: 'Debate',
    color: '#E879F9',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h4v3H3zM9 2h4v3H9zM5 8h6v3H5zM7 5v3M9 5v3M8 11v3"/></svg>',
    ports: { in: ['topic'], out: ['verdict'] },
    body: 'Two LLMs argue, judge picks',
  },
  ensemble: {
    label: 'Ensemble',
    color: '#34D399',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="4" r="2.5"/><circle cx="12" cy="4" r="2.5"/><circle cx="8" cy="12" r="2.5"/><path d="M5.5 5.5L7 10M10.5 5.5L9 10" stroke="currentColor" stroke-width="0.8"/></svg>',
    ports: { in: ['input'], out: ['result'] },
    body: 'Multiple LLMs, aggregate',
  },
  supervisor: {
    label: 'Supervisor',
    color: '#F97316',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="2.5"/><circle cx="3" cy="12" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M8 5.5V10M5 10L3 10M11 10l2 0" stroke="currentColor" stroke-width="0.8"/></svg>',
    ports: { in: ['task'], out: ['result'] },
    body: 'Delegate to workers',
  },
  barrier: {
    label: 'Barrier',
    color: '#94A3B8',
    icon: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8h12M4 5v6M8 4v8M12 5v6"/></svg>',
    ports: { in: ['input_a', 'input_b', 'input_c'], out: ['synced'] },
    body: 'Wait for all inputs',
  },
};

class FlowNode {
  constructor(type, x, y, id = null) {
    this.id = id || 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this.type = type;
    this.x = x;
    this.y = y;
    this.selected = false;
    this.config = NODE_TYPES[type];
    this.nodeConfig = {};  // user-editable config (Phase 2)
    this.el = null;
  }

  render() {
    const node = document.createElement('div');
    node.className = 'node';
    node.id = this.id;
    node.style.left = this.x + 'px';
    node.style.top = this.y + 'px';
    node.style.setProperty('--node-color', this.config.color);
    node.dataset.nodeId = this.id;

    // Header
    const header = document.createElement('div');
    header.className = 'node-header';
    header.innerHTML = `
      <div class="node-icon" style="--node-color: ${this.config.color}">${this.config.icon}</div>
      <span class="node-title">${this.config.label}</span>
      <button class="node-delete" data-action="delete" title="Delete node">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M9.5 2.5l-7 7M2.5 2.5l7 7"/>
        </svg>
      </button>
    `;
    node.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'node-body';
    body.innerHTML = `<span class="node-body-label">${this.config.body}</span>`;
    node.appendChild(body);

    // Ports
    const ports = document.createElement('div');
    ports.className = 'node-ports';

    // Input ports
    const portsIn = document.createElement('div');
    portsIn.className = 'node-ports-in';
    this.config.ports.in.forEach(portName => {
      const port = document.createElement('div');
      port.className = 'port port-in';
      port.dataset.portName = portName;
      port.dataset.portDir = 'in';
      port.dataset.nodeId = this.id;
      port.innerHTML = `
        <div class="port-dot" data-port="${portName}" data-dir="in" data-node-id="${this.id}"></div>
        <span class="port-label">${portName}</span>
      `;
      portsIn.appendChild(port);
    });

    // Output ports
    const portsOut = document.createElement('div');
    portsOut.className = 'node-ports-out';
    this.config.ports.out.forEach(portName => {
      const port = document.createElement('div');
      port.className = 'port port-out';
      port.dataset.portName = portName;
      port.dataset.portDir = 'out';
      port.dataset.nodeId = this.id;
      port.innerHTML = `
        <span class="port-label">${portName}</span>
        <div class="port-dot" data-port="${portName}" data-dir="out" data-node-id="${this.id}"></div>
      `;
      portsOut.appendChild(port);
    });

    ports.appendChild(portsIn);
    ports.appendChild(portsOut);
    node.appendChild(ports);

    this.el = node;
    return node;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    if (this.el) {
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    }
  }

  setSelected(val) {
    this.selected = val;
    if (this.el) {
      this.el.classList.toggle('selected', val);
    }
  }

  getPortPosition(portName, direction) {
    if (!this.el) return { x: 0, y: 0 };
    const dot = this.el.querySelector(`.port-dot[data-port="${portName}"][data-dir="${direction}"]`);
    if (!dot) return { x: this.x, y: this.y };

    const nodeRect = this.el.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();

    // Return position relative to canvas (not screen)
    const canvas = document.getElementById('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const transform = getCanvasTransform();

    return {
      x: (dotRect.left + dotRect.width / 2 - canvasRect.left) / transform.scale,
      y: (dotRect.top + dotRect.height / 2 - canvasRect.top) / transform.scale,
    };
  }

  destroy() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}

// Helper to get current canvas transform (will be set by canvas.js)
function getCanvasTransform() {
  return window.__canvasTransform || { x: 0, y: 0, scale: 1 };
}
