# AgentForge — Development Roadmap

## The Big Idea

AgentForge is a visual agent flow builder + command center. But under the hood, every flow is a **directed graph** — nodes are vertices, connections are edges. This means graph theory isn't some bolt-on feature; it's the actual data structure your app runs on.

The maze generator/solver work maps directly here: a maze is a graph, an agent flow is a graph, and the algorithms that solve one can power the other. Here's how it all comes together across 8 phases.

---

## Phase 1 — Canvas Foundation ✅ DONE

**What:** Draggable nodes on a canvas, visual wiring between ports, pan/zoom, minimap.

**Graph concepts already present:**
- Nodes = vertices
- Connections = directed edges (output → input)
- Adjacency is implicit in the connection list

**Files:** `index.html`, `styles.css`, `nodes.js`, `connections.js`, `canvas.js`, `app.js`

---

## Phase 2 — Node Configuration & Data Model

**What:** Click a node → sidebar panel shows editable settings (model selector for LLM nodes, prompt textarea, condition expressions, loop counts). Introduce a proper `FlowGraph` data class.

**Build list:**
- Configuration panel component (slides in from right or replaces sidebar)
- Per-type config schemas: LLM (model, temperature, system prompt), Tool (endpoint, method, headers), Condition (expression), Loop (max iterations), Merge (strategy)
- `FlowGraph` class wrapping an adjacency list representation
- Serialize/deserialize flows to JSON
- Save/load flows to localStorage

**Graph theory introduced:**
- **Adjacency list** — the canonical graph representation, stored as `Map<nodeId, { in: [], out: [] }>`
- **In-degree / out-degree** — used to validate flows (inputs should have in-degree 0, outputs should have out-degree 0)
- **Serialization** — converting a live graph to a portable JSON format and back

**Skills you'll learn:** DOM manipulation for dynamic forms, JSON serialization, data modeling

---

## Phase 3 — Graph Validation & Cycle Detection

**What:** Before a flow can run, validate it. Is it a valid DAG? Are there disconnected nodes? Missing required connections?

**Build list:**
- **Topological sort** (Kahn's algorithm) — determines execution order
- **Cycle detection** (DFS with coloring) — prevents infinite loops
- Visual feedback: highlight invalid nodes in red, show error messages
- Warning indicators on disconnected/orphan nodes
- "Validate" button that runs all checks and reports issues
- Animated validation — nodes light up green/red as they're checked

**Graph theory introduced:**
- **DAG (Directed Acyclic Graph)** — agent flows must be DAGs to have a deterministic execution order
- **Topological ordering** — the order nodes execute in
- **Cycle detection** — DFS-based, same algorithm used in maze generation to check for loops
- **Connected components** — finding isolated subgraphs (orphan nodes)

**Direct maze connection:** Your maze solver already does DFS traversal. Cycle detection is the same traversal with a "visited" coloring scheme (white → gray → black). If you hit a gray node, there's a cycle.

**Skills you'll learn:** Classic graph algorithms, DFS/BFS, algorithm visualization

---

## Phase 4 — Execution Engine

**What:** Actually run agent flows. The engine walks the graph in topological order, executing each node and passing data along edges.

**Build list:**
- `FlowExecutor` class that takes a validated DAG and runs it
- Topological sort drives execution order
- Data passing: output of one node feeds into input of the next
- Condition nodes evaluate expressions and route to `true`/`false` branches
- Loop nodes re-execute their subgraph N times
- Real-time visual feedback: nodes glow/pulse as they execute
- Execution log panel showing step-by-step progress
- Python FastAPI backend with `/execute` endpoint
- WebSocket connection for streaming execution updates

**Graph theory introduced:**
- **Graph traversal as execution** — walking the DAG IS running the program
- **Data flow graphs** — each edge carries data from producer to consumer
- **Branch resolution** — condition nodes create divergent paths, same concept as maze branching

**Direct maze connection:** Running a flow is conceptually identical to solving a maze: start at the input node, follow edges (corridors), make decisions at condition nodes (junctions), reach the output (exit). The BFS/DFS solvers from your maze project are the same traversal patterns.

**Skills you'll learn:** Backend API design, WebSocket streaming, async execution, state machines

---

## Phase 5 — Dashboard & Monitoring (Command Center)

**What:** The second view — a real-time dashboard showing running/completed flows, their status, logs, metrics, and performance.

**Build list:**
- Dashboard view toggle (Builder ↔ Dashboard)
- Flow run history with status (pending, running, success, error)
- Live execution timeline — Gantt-style visualization of node execution times
- Log viewer with filtering
- Metrics: total runs, success rate, avg execution time, token usage
- Agent health cards (one per saved flow)
- Auto-refresh via WebSocket

**Graph theory introduced:**
- **Critical path analysis** — which sequence of nodes takes the longest? This is the bottleneck of your flow (same algorithm used in project management / PERT charts)
- **Graph metrics** — diameter, average path length applied to flow performance

**Skills you'll learn:** Data visualization, real-time UI updates, dashboard layout design, WebSocket consumption

---

## Phase 6 — Maze-Powered Auto-Layout & Flow Generation

**This is where maze generation directly powers AgentForge.**

**What:** Use maze generation algorithms to automatically lay out messy flows AND to generate template flows from natural language descriptions.

**Build list:**

### Auto-Layout Engine
- **Force-directed graph layout** — nodes repel each other, connections act as springs. Produces clean, readable layouts automatically. Uses the same physics simulation concepts as maze visualization.
- **Hierarchical layout** (Sugiyama algorithm) — arranges DAGs in layers left-to-right or top-to-bottom. Perfect for agent flows since they're DAGs.
- **"Tidy up" button** — one click to auto-arrange a messy canvas
- Animated layout transitions (nodes smoothly slide to new positions)

### Maze-Based Flow Generation
- **Random flow generator** — uses maze generation algorithms (Prim's, Kruskal's, recursive backtracker) to create random but valid flow topologies. Useful for testing, templates, and exploration.
- **Prim's algorithm** → generates a minimum spanning tree flow (most efficient path)
- **Kruskal's algorithm** → generates flows with balanced branching
- **Recursive backtracker** → generates deep, sequential flows with occasional branches
- User picks "generate random flow" → selects algorithm → watches the flow get built node-by-node with animation (just like watching a maze generate)

### Template Suggestion
- "Describe what you want" → NLP parses intent → maps to a graph structure → renders as a flow
- Pre-built templates: "RAG pipeline", "Multi-agent debate", "Tool-augmented chain", "Conditional routing"

**Graph theory introduced:**
- **Minimum spanning trees** — Prim's and Kruskal's, directly from maze generation
- **Force-directed placement** — spring-electric model for graph layout
- **Layered graph drawing** — Sugiyama method for hierarchical DAGs
- **Random graph generation** — Erdős–Rényi model adapted for valid flow topologies

**Direct maze connection:** This is the payoff. Your maze generators ARE graph generators. A maze generated by recursive backtracker is a tree (spanning tree of a grid graph). By swapping the grid for node types, the same algorithm produces agent flow topologies. The animation you built for maze generation visualizes flow generation.

**Skills you'll learn:** Physics simulation, layout algorithms, generative design, algorithm animation

---

## Phase 7 — Pathfinding & Flow Optimization

**What:** Use pathfinding algorithms to analyze, optimize, and debug flows.

**Build list:**

### Flow Analysis
- **Shortest path** (Dijkstra's / A*) — "what's the fastest route from input to output?" Weights = estimated execution time per node
- **All paths enumeration** — show every possible route through a conditional flow
- **Bottleneck detection** — find the node that slows everything down (widest path / critical path)
- Visual path highlighting: click input → output and see every possible execution path light up

### Flow Optimization
- **Dead node detection** — unreachable nodes (not on any path from input to output)
- **Redundancy detection** — duplicate subgraphs that could be merged
- **Suggested rewiring** — "if you move this connection, your flow runs 30% faster"
- Side-by-side comparison of original vs optimized flow

### Debugging
- **Trace mode** — step through execution one node at a time (like a debugger)
- **Breakpoints** — pause execution at specific nodes
- **Data inspector** — see what data is flowing through each edge at each step
- **Backtracking** — step backwards through execution (uses the same backtracking logic as maze solvers)

**Graph theory introduced:**
- **Dijkstra's algorithm** — shortest weighted path
- **A* search** — heuristic-guided pathfinding (same as your maze solver!)
- **Critical path method** — longest path in a weighted DAG
- **Dead code elimination** — unreachable vertex detection via BFS from source
- **Backtracking** — exactly your maze solver's wall-follower / backtrack pattern

**Direct maze connection:** A* in your maze solver finds the optimal path through walls. A* in AgentForge finds the optimal execution path through nodes. Same algorithm, different domain. Backtracking in maze solving = stepping backward through execution history.

**Skills you'll learn:** Weighted graph algorithms, optimization, debugging tools, algorithm visualization

---

## Phase 8 — Multi-Agent Orchestration & Advanced Graph Structures

**What:** Go beyond simple flows. Support multiple agents running concurrently, competing, or collaborating within a single flow. This is "Agent Arena" meets "Flow Builder."

**Build list:**

### Concurrent Execution
- **Parallel branches** — when a flow forks (one node → multiple outputs), execute branches simultaneously
- **Barrier/sync nodes** — wait for all parallel branches to complete before continuing (like a Merge but with synchronization)
- **Race nodes** — first branch to complete wins, others are cancelled

### Multi-Agent Patterns
- **Debate pattern** — two LLM nodes argue, a judge LLM picks the winner
- **Ensemble pattern** — multiple LLMs answer the same prompt, results are aggregated
- **Supervisor pattern** — one agent delegates subtasks to worker agents
- **Swarm pattern** — agents dynamically spawn and coordinate (uses graph expansion at runtime)

### Advanced Graph Structures
- **Subflows** — collapse a group of nodes into a single "macro node" (graph within a graph)
- **Recursive flows** — a flow that calls itself (with depth limits)
- **Dynamic graph modification** — agents can add/remove nodes at runtime
- **Hypergraph edges** — one output connecting to multiple inputs simultaneously

### The Arena
- Side-by-side flow comparison: run two different flows on the same input, compare outputs
- Leaderboard: track which flow configurations perform best
- ELO-style rating for agent configurations

**Graph theory introduced:**
- **Parallel graph traversal** — concurrent BFS/DFS
- **Graph condensation** — collapsing subgraphs into supernodes
- **Hypergraphs** — edges connecting more than two vertices
- **Dynamic graphs** — graphs that change during traversal
- **Tournament graphs** — the arena's competitive structure

**Direct maze connection:** Parallel maze solving (multiple explorers in one maze) maps directly to parallel flow execution. Subflows are like "rooms within rooms" — recursive mazes. Dynamic graph modification is like a maze that changes while you're solving it.

**Skills you'll learn:** Concurrency patterns, advanced data structures, system design, competitive evaluation

---

## Concept Map: Graph Theory Through AgentForge

```
Phase   Graph Concept                Maze Equivalent              AgentForge Application
─────   ─────────────                ───────────────              ──────────────────────
  2     Adjacency list               Grid representation          Flow data model
  3     Topological sort             -                            Execution order
  3     Cycle detection (DFS)        DFS traversal                Flow validation
  3     Connected components         Flood fill                   Orphan detection
  4     Graph traversal              Maze solving                 Flow execution
  5     Critical path                Longest path                 Performance bottleneck
  6     MST (Prim's/Kruskal's)      Maze generation              Flow auto-generation
  6     Force-directed layout        -                            Auto-arrange nodes
  7     Dijkstra's / A*             A* maze solver               Flow optimization
  7     Backtracking                 Wall follower                Execution debugging
  8     Parallel traversal           Multi-agent maze solve       Concurrent execution
  8     Graph condensation           Recursive mazes              Subflows
  8     Dynamic graphs               Changing mazes               Runtime modification
```

---

## Suggested Build Schedule

| Phase | Effort | Depends On | Calendar Estimate |
|-------|--------|------------|-------------------|
| 1 ✅ | Done | — | Done |
| 2 | 2–3 sessions | Phase 1 | Week 1–2 |
| 3 | 2 sessions | Phase 2 | Week 2–3 |
| 4 | 3–4 sessions | Phase 3 | Week 3–5 |
| 5 | 2–3 sessions | Phase 4 | Week 5–6 |
| 6 | 3–4 sessions | Phase 4 + maze project | Week 6–8 |
| 7 | 3–4 sessions | Phase 6 | Week 8–10 |
| 8 | 4–5 sessions | Phase 7 | Week 10–13 |

**Total: ~3 months of weekend/evening sessions**

---

## The Thesis

Every phase teaches you graph theory by building something you can see and use. The maze project isn't a separate thing — it's R&D for AgentForge. Algorithms you've already implemented (DFS, BFS, A*, Prim's, backtracking) will be directly ported into this project. By Phase 8, you'll have built a production-grade visual tool that demonstrates deep understanding of graph theory, AI orchestration, and frontend engineering.

This is portfolio material that tells a story: "I understand the computer science underneath AI agent systems, and I can build the tools to orchestrate them."
