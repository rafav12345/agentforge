# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Development Commands

**No build tools or package manager** - this is a zero-dependency vanilla JavaScript project.

### Running the Application
```bash
# Development - any static file server works
open index.html                    # macOS
python -m http.server 8000         # Python
npx serve .                        # If you have npx available

# For live reload during development
npx live-server .                  # If you want auto-refresh
```

### Testing
```bash
# Manual testing - load flows and test execution
open index.html
# Load examples -> run "Enterprise Decision Advisor"
# Test validation with intentional cycles
# Test multi-agent patterns (Debate, Ensemble, Supervisor)
```

### API Integration
- Set Anthropic API key in `executor.js:8` and `orchestrator.js:5` for live LLM calls
- Without API key, execution falls back to realistic simulations
- Test both modes (with/without API) to ensure graceful fallback

## Architecture

### Core Data Flow
The application follows a graph-based execution model where every pipeline is a DAG:

```
FlowGraph (adjacency list) → Validator (topological sort, cycle detection) → Executor (DAG traversal) → UI feedback
```

### Key Architectural Concepts

**Graph as First-Class Citizen**: The `FlowGraph` class in `flowgraph.js` uses `Map<nodeId, { node, in: [], out: [] }>` as the core data structure. All operations (validation, execution, analysis) operate on this adjacency list.

**Execution = Graph Traversal**: Running a pipeline literally means:
1. Validate DAG (cycle detection via DFS 3-color)
2. Get topological order (Kahn's algorithm)
3. Execute nodes in that order
4. Handle branching via condition node evaluation

**Real-time Visual Feedback**: The UI and execution engine are coupled via callbacks:
- `onNodeStart(nodeId)` → highlight node
- `onNodeComplete(nodeId, output)` → show result, record timing
- `onEdgeActive(fromId, toId)` → flash connection

**Multi-Agent Patterns**: The `orchestrator.js` implements three patterns:
- **Debate**: Two LLMs argue, judge picks winner via `MultiAgentExecutors.debate()`
- **Ensemble**: N LLMs respond in parallel, aggregate via `Promise.all()`
- **Supervisor**: Delegate subtasks to specialized agents

### Critical File Dependencies

**Core Graph Operations** (must understand together):
- `flowgraph.js` → Data model
- `validator.js` → Structural checks (cycles, connectivity, topological sort)
- `executor.js` → Execution engine that walks the validated DAG
- `analyzer.js` → Pathfinding (Dijkstra's, A*) and optimization

**Visual Layer** (rendering pipeline):
- `canvas.js` → Coordinate transforms, pan/zoom
- `connections.js` → SVG Bezier curve rendering
- `config-panel.js` → Dynamic form generation based on node schemas
- `nodes.js` → Node type definitions with ports, colors, icons

**Node Execution Chain**: When a node executes, the flow is:
1. `executor.js` calls `_execNodeType()` based on node type
2. For LLM nodes: `_execLLM()` → Codex API or simulation
3. For Condition nodes: `_execCondition()` → evaluate expression, route to true/false
4. For Multi-agent: `orchestrator.js` → `MultiAgentExecutors` patterns
5. Output feeds into next node's input via port connections

### Node Type System

Each node type in `nodes.js` defines:
```javascript
{
  label: "Display name",
  icon: "symbol",
  color: "hex-color",
  inputs: [{ name, type, required }],
  outputs: [{ name, type }],
  config: { field: { type, label, default } }
}
```

**Critical node behaviors**:
- **Condition nodes**: Evaluate JavaScript expressions, route to `outputs[0]` (true) or `outputs[1]` (false)
- **Loop nodes**: Re-execute connected subgraph N times
- **Barrier nodes**: Wait for ALL input branches before continuing (synchronization)
- **Merge nodes**: Combine multiple inputs into single output

### State Management Patterns

**No Framework**: All DOM manipulation is hand-written. Nodes are positioned via `transform: translate(x, y)` and connections are SVG `<path>` elements.

**Storage**: `storage.js` handles localStorage persistence. The app auto-saves every 30 seconds and on major changes.

**Validation State**: Three-phase validation:
1. **Structural** → check required configs, port connections
2. **Topological** → ensure DAG (no cycles), get execution order
3. **Reachability** → find orphaned nodes, verify connectivity

### Graph Algorithm Implementation Notes

**Topological Sort**: `validator.js` uses Kahn's algorithm with explicit in-degree tracking. This determines execution order for the DAG.

**Cycle Detection**: DFS with 3-color marking (white=unvisited, gray=visiting, black=done). If you encounter gray during traversal, there's a cycle.

**Pathfinding**: `analyzer.js` implements both Dijkstra's (shortest weighted path) and A* (with layer-distance heuristic). Used for optimization analysis.

**Layout Algorithms**: `layout.js` provides:
- **Sugiyama** (hierarchical): Layer-by-layer DAG layout
- **Force-directed**: Spring-electric model for organic positioning
- **Flow generation**: Prim's/Kruskal's MST + recursive backtracker for random valid topologies

## Working with the Codebase

### Adding New Node Types
1. Define in `nodes.js` with inputs, outputs, config schema
2. Add execution logic in `executor.js` → `_execYourNodeType()`
3. Add icon/styling in `styles.css`
4. Update `config-panel.js` if custom form fields needed

### Modifying Graph Algorithms
- Core algorithms in `validator.js` and `analyzer.js` are textbook implementations
- When modifying, test with complex flows (use "Enterprise Decision Advisor" example)
- Validation must run on every graph change (add/remove nodes/edges)

### Debugging Execution Issues
- Enable console logging in `executor.js` → set `DEBUG = true`
- Use browser dev tools to inspect `executionContext.nodeOutputs`
- Visual feedback: nodes should pulse green during execution
- Check topological order in validation panel before running

### Multi-Agent Development
- All patterns in `orchestrator.js` use `Promise.all()` for parallel execution
- Add new patterns by extending `MultiAgentExecutors` class
- Test with and without API keys (ensure simulation fallback works)

### Canvas/Visual Development
- Coordinate system: `canvas.js` handles screen ↔ canvas transforms
- Connections: `connections.js` uses cubic Bezier curves between port centers
- Node positioning: All nodes use absolute positioning with transform
- Minimap updates automatically via canvas transform events