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

function installBrowserStubs() {
  const storage = new Map();
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
  setGlobal('localStorage', {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  });
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
