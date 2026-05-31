# AgentForge

**Visual multi-agent AI pipeline builder. Zero dependencies. Pure JavaScript.**

Build, validate, execute, and analyze multi-agent AI workflows on an interactive graph canvas — powered by the same algorithms that solve mazes.

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  Input   │────▶│ LLM Call │────▶│ Condition │──┬──▶│  Output  │
│  (User)  │     │ (Claude) │     │ (Router)  │  │  │ (Result) │
└─────────┘     └──────────┘     └───────────┘  │  └──────────┘
                                                  │  ┌──────────┐
                                                  └──▶│ Escalate │
                                                     └──────────┘
```

---

## What is AgentForge?

AgentForge is a visual graph editor for designing and running multi-agent AI pipelines. Drag nodes onto a canvas, wire them together, and watch your flow execute in real time — nodes light up as data flows through them.

Under the hood, every pipeline is a directed acyclic graph. The execution engine uses topological sort to determine run order, DFS to detect cycles, and Dijkstra's/A* to optimize paths. No frameworks, no build tools, no npm — just 14 JavaScript files and a browser.

---

## Features

### Visual Builder
- **Drag-and-drop node palette** — 15 node types across 4 categories
- **SVG Bezier connections** — Click ports to wire nodes with smooth curves
- **Infinite canvas** — Pan, zoom, minimap, keyboard shortcuts
- **Quick-add menu** — Double-click anywhere to spawn nodes
- **Config panel** — Click any node to edit model, prompt, temperature, expressions
- **Auto-layout** — One-click hierarchical (Sugiyama) or force-directed arrangement

### Graph Algorithms
- **Cycle detection** — DFS with 3-color marking (white/gray/black)
- **Topological sort** — Kahn's algorithm determines execution order
- **Shortest path** — Dijkstra's with node-type cost weights
- **A\* pathfinding** — Heuristic-guided optimal path search
- **Critical path analysis** — Find the bottleneck sequence
- **Flow generation** — Prim's, Kruskal's, and recursive backtracker produce random valid topologies

### Execution Engine
- **DAG-order execution** — Nodes run in validated topological order
- **Real-time visual feedback** — Nodes pulse green as they execute, edges flash with data flow
- **Claude API integration** — Anthropic Claude with simulation fallback when offline
- **Conditional branching** — Route data through true/false paths at runtime
- **Multi-agent patterns** — Debate (two LLMs argue + judge), Ensemble (aggregate N responses), Supervisor (delegate subtasks)
- **Barrier synchronization** — Wait for all parallel branches before continuing

### Dashboard & Analysis
- **Run history** — Track every execution with timing, status, and output
- **Flow analysis** — Dijkstra's path, A* path, dead nodes, optimization suggestions
- **Arena** — Head-to-head flow comparison with ELO ratings
- **Animated validation** — Watch nodes sweep green/red during structural checks

---

## Quick Start

```bash
git clone https://github.com/rafav12345/agentforge.git
cd agentforge
open index.html    # or any static file server
```

No `npm install`. No build step. No dependencies. Just open the file.

**Optional — Enable live LLM calls:**
Set your Anthropic API key in `executor.js` (line 8) and `orchestrator.js` (line 5). Without it, the execution engine falls back to realistic simulations.

### Regression Smoke Tests

Run the zero-dependency regression harness from the repo root:

```bash
node scripts/regression-smoke.js
```

It loads the core graph/runtime files in a stubbed browser environment, executes every built-in example flow under simulation fallback, and checks targeted regressions around condition routing and input-port replacement.

---

## Running a Demo

Here's how to give a 3-4 minute demo that shows off everything:

### Act 1 — The Canvas (15s)
Open the app. Pan around the empty canvas, zoom in and out, watch the minimap update. This establishes the custom graph editor — mention "zero dependencies, pure vanilla JS."

### Act 2 — Build from Scratch (45s)
Drag an **Input** node from the left palette. Then an **LLM Call**. Then an **Output**. Connect them by clicking output ports to input ports — Bezier curves render instantly. Click the LLM node, change its system prompt in the config panel. Hit **Tidy Up** to auto-layout.

### Act 3 — Enterprise Decision Advisor (60s)
Click **Examples** and load the most complex template. It has 3 data sources feeding 3 analyst LLMs, a barrier node for synchronization, a merge, a decision orchestrator, and conditional routing to risk vs. growth paths. Click **Validate** — watch the animated sweep turn nodes green one by one. The validation panel shows structural checks, cycle detection, and topological order.

### Act 4 — Execute (60s)
Click **Run Flow** and enter a question. Watch nodes pulse green in topological order as they execute. When the condition node fires, one branch activates and the other dims. The execution log scrolls in real time. Click the output node to see the final result.

### Act 5 — Analyze (45s)
Click **Analyze**. The analysis panel shows Dijkstra's shortest path highlighted on the graph, A* path, critical path, dead node detection, and optimization suggestions. Switch to the **Dashboard** tab for run history and metrics.

### Act 6 — Generate (30s)
Click **Generate**, pick **Prim's MST**. Watch a random flow generate with 8 nodes. Hit **Tidy Up** to auto-arrange. This shows maze generation algorithms producing valid pipeline topologies.

---

## Example Flows

| Example | Nodes | Demonstrates |
|---------|-------|-------------|
| **Simple Chat** | 3 | Basic Input → LLM → Output chain |
| **Summarize & Translate** | 5 | Dual LLM chain with merge node |
| **Sentiment Router** | 7 | Condition branching (positive → standard reply, negative → escalation) |
| **RAG Pipeline** | 6 | Data source → retrieval → augmented generation |
| **Multi-Branch** | 8+ | Complex conditional flow with multiple paths |
| **Debate Arena** | 6 | Two LLMs argue, judge picks winner |
| **Enterprise Decision Advisor** | 14 | Data sources, parallel analysis, barrier sync, conditional routing |

---

## Architecture

```
AgentForge/
├── index.html          Entry point — 3 views (Builder, Dashboard, Arena)
├── styles.css          Dark theme with CSS variables, 2100+ lines
├── app.js              Main orchestrator — wires everything together
├── flowgraph.js        FlowGraph class — adjacency list data model
├── nodes.js            15 node types with ports, colors, icons
├── connections.js      SVG Bezier curve rendering and port management
├── canvas.js           Pan, zoom, minimap, coordinate transforms
├── config-panel.js     Dynamic per-node configuration forms
├── validator.js        Cycle detection, topological sort, reachability
├── executor.js         DAG-order execution engine with LLM integration
├── analyzer.js         Dijkstra's, A*, critical path, optimization
├── layout.js           Sugiyama hierarchical + force-directed layout
├── orchestrator.js     Multi-agent patterns (Debate, Ensemble, Supervisor)
├── dashboard.js        Run history, metrics, execution timeline
├── datasets.js         Sample enterprise data (financials, supply chain, sales)
├── examples.js         Pre-built flow templates
└── storage.js          localStorage persistence with autosave
```

**Key design decisions:**
- **No framework** — All DOM manipulation is hand-written. Nodes are `div` elements with absolute positioning. Connections are SVG `path` elements with cubic Bezier curves.
- **Adjacency list** — `FlowGraph` wraps a `Map<nodeId, { node, in: [], out: [] }>`. All graph algorithms operate on this structure.
- **Execution = traversal** — The executor validates the DAG, gets topological order, then walks it node by node. Running a pipeline is literally solving a graph.
- **CSS variables** — The entire dark theme (neon cyan `#00FFB2`, purple `#A78BFA`, etc.) is driven by CSS custom properties. Swap them to re-theme.

---

## Graph Theory in Practice

This is not a toy — every major feature is backed by a real algorithm:

| Algorithm | CS Concept | AgentForge Application |
|-----------|-----------|----------------------|
| **Kahn's Algorithm** | Topological sort | Determines node execution order |
| **DFS 3-Color** | Cycle detection | Validates flows are acyclic before running |
| **BFS** | Connected components | Finds orphaned/disconnected nodes |
| **Dijkstra's** | Shortest weighted path | Finds lowest-cost route through a pipeline |
| **A\*** | Heuristic pathfinding | Optimized path search with layer-distance heuristic |
| **Critical Path Method** | Longest path in DAG | Identifies performance bottleneck sequence |
| **Sugiyama** | Layered graph drawing | Hierarchical auto-layout for DAGs |
| **Spring-Electric Model** | Force-directed layout | Organic node arrangement |
| **Prim's Algorithm** | Minimum spanning tree | Generates random flow topologies |
| **Kruskal's Algorithm** | MST (edge-sorted) | Generates flows with balanced branching |
| **Recursive Backtracker** | DFS maze generation | Generates deep sequential flows |

---

## Roadmap

See [`FEATURES_ROADMAP.md`](./FEATURES_ROADMAP.md) for the full plan. Highlights:

- **Visual Step-Through Debugger** — Breakpoints, step forward/back, data inspector at each node
- **Streaming LLM Responses** — Live token-by-token display inside graph nodes
- **Export to Code** — Generate runnable Python or JavaScript from any flow
- **Natural Language Builder** — "Build me a pipeline that..." → auto-generated flow
- **Plugin SDK** — Register custom node types with `AgentForge.registerNode()`
- **Version History** — Snapshots with visual flow diffing
- **Performance Profiling** — Heatmap overlay and Gantt chart of execution
- **A/B Testing** — Batch-run two flows, compare with automated scoring

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Vanilla JavaScript (ES2020+) |
| Styling | CSS3 with custom properties |
| Canvas | SVG + HTML absolute positioning |
| Fonts | JetBrains Mono (code) + DM Sans (UI) |
| LLM | Anthropic Claude API |
| Storage | localStorage with autosave |
| Build tools | None |
| Dependencies | **None** |

---

## License

MIT
