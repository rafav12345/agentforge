'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function createClassList() {
  return {
    add() {},
    remove() {},
    toggle() {},
    contains() { return false; },
  };
}

function createElementStub() {
  return {
    style: {},
    dataset: {},
    classList: createClassList(),
    children: [],
    parentNode: null,
    firstChild: null,
    innerHTML: '',
    textContent: '',
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      if (!this.firstChild) this.firstChild = child;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(existing => existing !== child);
      if (this.firstChild === child) {
        this.firstChild = this.children[0] || null;
      }
    },
    insertBefore(child) {
      return this.appendChild(child);
    },
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0 };
    },
    getContext() {
      return {
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fillRect() {},
      };
    },
  };
}

function createStorageStub() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function installBrowserStubs() {
  const body = createElementStub();
  body.offsetHeight = 0;
  const setGlobal = (name, value) => {
    Object.defineProperty(global, name, {
      value,
      configurable: true,
      writable: true,
    });
  };

  setGlobal('window', {
    addEventListener() {},
    removeEventListener() {},
    history: { replaceState() {} },
    location: { search: '', pathname: '/', href: 'http://localhost/' },
  });
  setGlobal('document', {
    body,
    documentElement: {
      style: { setProperty() {} },
      classList: createClassList(),
      setAttribute() {},
    },
    createElement: createElementStub,
    createElementNS: createElementStub,
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  setGlobal('localStorage', createStorageStub());
  setGlobal('sessionStorage', createStorageStub());
  setGlobal('navigator', { userAgent: 'node-regression-smoke' });
  setGlobal('location', { hostname: 'localhost', href: 'http://localhost/' });
  setGlobal('performance', { now: () => Date.now() });
  setGlobal('requestAnimationFrame', (callback) => setTimeout(() => callback(Date.now()), 0));
  setGlobal('fetch', async () => {
    throw new Error('Network disabled in regression smoke runner');
  });
}

function loadProjectScripts() {
  const files = [
    'utils.js',
    'error-handler.js',
    'event-manager.js',
    'config-manager.js',
    'execution-utils.js',
    'datasets.js',
    'flowgraph.js',
    'validator.js',
    'orchestrator.js',
    'executor.js',
    'examples.js',
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInThisContext(source, { filename: file });
  }
}

function createRuntimeNode(type, x, y, id) {
  return {
    id,
    type,
    x,
    y,
    nodeConfig: {},
    config: { label: type },
    render() { return createElementStub(); },
    destroy() {},
  };
}

function buildGraph(flowData) {
  return FlowGraph.deserialize(flowData, createRuntimeNode);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runExampleFlow(name, flowData) {
  const graph = buildGraph(flowData);
  const validation = new FlowValidator(graph).validate();

  assert(validation.errorCount === 0, `${name}: validation reported ${validation.errorCount} error(s)`);
  assert(validation.warningCount === 0, `${name}: validation reported ${validation.warningCount} warning(s)`);
  assert(validation.executionReady, `${name}: flow is not execution-ready`);

  const ctx = await new FlowExecutor(graph).execute('test input');
  const statuses = Array.from(ctx.nodeStatus.values());
  const errorCount = statuses.filter(status => status === EXEC_STATUS.ERROR).length;
  assert(errorCount === 0, `${name}: execution finished with ${errorCount} error node(s)`);

  const sinkOutputs = graph.getSinks().map(nodeId => ctx.getOutput(nodeId));
  const definedSinkCount = sinkOutputs.filter(output => output !== undefined).length;
  assert(definedSinkCount > 0, `${name}: no sink produced output`);
}

async function runReconvergingBranchRegression() {
  const flow = {
    version: 1,
    metadata: { name: 'Reconverging Condition Flow', created: Date.now(), modified: Date.now() },
    nodes: [
      { id: 'in', type: 'input', x: 0, y: 0, config: { label: 'Input', defaultValue: 'negative' } },
      { id: 'cond', type: 'condition', x: 0, y: 0, config: { label: 'Route', expression: "{{input}}.includes('negative')", evaluator: 'javascript' } },
      { id: 'merge', type: 'merge', x: 0, y: 0, config: { label: 'Merge', strategy: 'template', template: 'A={{input_a}} | B={{input_b}}' } },
      { id: 'out', type: 'output', x: 0, y: 0, config: { label: 'Output' } },
    ],
    edges: [
      { from: 'in', fromPort: 'output', to: 'cond', toPort: 'input' },
      { from: 'cond', fromPort: 'true', to: 'merge', toPort: 'input_a' },
      { from: 'cond', fromPort: 'false', to: 'merge', toPort: 'input_b' },
      { from: 'merge', fromPort: 'merged', to: 'out', toPort: 'input' },
    ],
  };

  const graph = buildGraph(flow);
  const ctx = await new FlowExecutor(graph).execute('negative');
  const output = ctx.getOutput('out');

  assert(output === 'A=negative | B=', `Reconverging branch regression: expected "A=negative | B=", received ${JSON.stringify(output)}`);
}

async function runMaliciousExpressionRegression() {
  // A condition expression that tries to touch localStorage must be rejected by
  // Utils.sanitizeExpression, caught, and defaulted to false (the false branch
  // is taken) — never executed.
  const flow = {
    version: 1,
    metadata: { name: 'Malicious Expression Flow', created: Date.now(), modified: Date.now() },
    nodes: [
      { id: 'in', type: 'input', x: 0, y: 0, config: { label: 'Input', defaultValue: 'secret' } },
      { id: 'cond', type: 'condition', x: 0, y: 0, config: { label: 'Route', expression: "localStorage.getItem('agentforge_api_key') || true", evaluator: 'javascript' } },
      { id: 'merge', type: 'merge', x: 0, y: 0, config: { label: 'Merge', strategy: 'template', template: 'A={{input_a}} | B={{input_b}}' } },
      { id: 'out', type: 'output', x: 0, y: 0, config: { label: 'Output' } },
    ],
    edges: [
      { from: 'in', fromPort: 'output', to: 'cond', toPort: 'input' },
      { from: 'cond', fromPort: 'true', to: 'merge', toPort: 'input_a' },
      { from: 'cond', fromPort: 'false', to: 'merge', toPort: 'input_b' },
      { from: 'merge', fromPort: 'merged', to: 'out', toPort: 'input' },
    ],
  };

  const graph = buildGraph(flow);
  const ctx = await new FlowExecutor(graph).execute('secret');
  const output = ctx.getOutput('out');

  // If the expression had executed it would be truthy → input_a. Sanitization
  // forces false → input_b, so input_a must be empty.
  assert(output === 'A= | B=secret', `Malicious expression regression: expected false branch ("A= | B=secret"), received ${JSON.stringify(output)}`);
}

function runPerfReportRegression() {
  // Node IDs may contain underscores; the report must not split them apart.
  executionUtils.recordPerformanceMetric('node_abc_123', 'llm', 10);
  const report = executionUtils.getPerformanceReport();
  assert(
    report['node_abc_123'] && report['node_abc_123'].llm,
    `Perf report regression: expected grouping under 'node_abc_123' -> 'llm', got ${JSON.stringify(Object.keys(report))}`
  );
}

async function runDebounceRegression() {
  let calls = 0;
  const fn = appEvents.debounce(() => { calls += 1; }, 20);
  fn(); fn(); fn(); // three rapid calls collapse into one
  await new Promise(resolve => setTimeout(resolve, 40));
  assert(calls === 1, `Debounce regression: expected 1 call, got ${calls}`);
}

function runSsrfGuardRegression() {
  const blocked = [
    'http://169.254.169.254/latest/meta-data/', // cloud metadata
    'http://localhost:11434/api',
    'http://127.0.0.1:8080',
    'http://10.0.0.5',
    'http://192.168.1.10',
    'http://172.16.0.1',
    'http://printer.local',
    'file:///etc/passwd',
    'ftp://example.com',
    'not a url',
  ];
  for (const u of blocked) {
    let threw = false;
    try { Utils.assertSafeUrl(u); } catch { threw = true; }
    assert(threw, `SSRF guard regression: expected ${JSON.stringify(u)} to be blocked`);
  }

  const allowed = ['https://api.example.com/v1/x', 'http://example.com:3000/path'];
  for (const u of allowed) {
    let threw = false;
    try { Utils.assertSafeUrl(u); } catch { threw = true; }
    assert(!threw, `SSRF guard regression: expected ${JSON.stringify(u)} to be allowed`);
  }
}

function runSingleInputReplacementRegression() {
  const graph = new FlowGraph();
  const inputA = createRuntimeNode('input', 0, 0, 'input_a');
  const inputB = createRuntimeNode('input', 0, 0, 'input_b');
  const output = createRuntimeNode('output', 0, 0, 'output');

  graph.addNode(inputA);
  graph.addNode(inputB);
  graph.addNode(output);

  assert(graph.addEdge('input_a', 'output', 'output', 'input'), 'Expected first edge insertion to succeed');
  assert(graph.addEdge('input_b', 'output', 'output', 'input'), 'Expected replacement edge insertion to succeed');

  const incoming = graph.adjacency.get('output').in;
  assert(incoming.length === 1, `Single-input regression: expected one incoming edge, found ${incoming.length}`);
  assert(incoming[0].sourceId === 'input_b', `Single-input regression: expected latest source to win, found ${incoming[0].sourceId}`);
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function registerTests() {
  for (const [name, flowData] of Object.entries(EXAMPLE_FLOWS)) {
    test(`example: ${name}`, () => runExampleFlow(name, flowData));
  }

  test('regression: reconverging condition branch', runReconvergingBranchRegression);
  test('regression: malicious condition expression is rejected', runMaliciousExpressionRegression);
  test('regression: SSRF guard blocks internal targets', runSsrfGuardRegression);
  test('regression: perf report keeps underscored node IDs intact', runPerfReportRegression);
  test('regression: event debounce collapses rapid calls', runDebounceRegression);
  test('regression: single-input port replacement', runSingleInputReplacementRegression);
}

async function main() {
  installBrowserStubs();
  loadProjectScripts();
  registerTests();

  let passed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error.stack || error.message || String(error));
      process.exit(1);
    }
  }

  console.log(`\n${passed}/${tests.length} regression checks passed.`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
