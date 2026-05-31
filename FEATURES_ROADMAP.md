# AgentForge — Feature Roadmap

New features beyond the original 8-phase plan. Organized by impact and priority.

---

## Priority 1 — Visual Step-Through Debugger

**The single most differentiating feature you can add.** No visual AI pipeline tool (LangGraph Studio, Flowise, n8n) offers a real step-through debugger.

**What to build:**
- Click any node to toggle a **breakpoint** (red dot indicator)
- Execution pauses when it reaches a breakpoint node
- **Debugger toolbar**: Step Forward | Step Back | Continue | Reset
- **Data inspector panel** — floating overlay at the current node showing exact input/output payload as formatted JSON
- Current node gets a pulsing highlight; all non-active nodes dim to 30% opacity
- Data flowing along the active edge animates as a moving dot

**Where to start:**
- `analyzer.js` already has a `FlowDebugger` class with `traceHistory` — extend this
- `executor.js` has `onNodeStart` / `onNodeComplete` callbacks — hook debugger controls here
- Add debugger UI controls to the execution panel in `index.html`
- New CSS classes for breakpoint dots, dimmed nodes, data inspector overlay

**Estimated effort:** 2-3 sessions

---

## Priority 2 — Streaming LLM Responses

**High visual wow factor.** Seeing tokens appear character-by-character inside graph nodes is immediately impressive in demos.

**What to build:**
- Switch `_callLLM` from `await response.json()` to Anthropic streaming API (`stream: true`, read from `ReadableStream`)
- As tokens arrive, update the LLM node's body text with a typing animation
- Add a **token counter badge** on each LLM node (e.g., "347 tokens")
- Show streaming progress in the execution log panel
- Graceful fallback: if streaming fails, fall back to batch response

**Where to start:**
- `executor.js` — the `_execLLM` method (around line 250)
- `orchestrator.js` — the `_callLLM` helper (around line 135)
- Add a `_streamLLM()` method alongside the existing `_callLLM()`
- CSS for the token badge and typing cursor animation

**Estimated effort:** 1-2 sessions

---

## Priority 3 — Export Flow to Python/JS Code

**Bridges the visual-to-code gap.** Proves the tool produces real, runnable artifacts — not just a toy.

**What to build:**
- New **Export Code** button in the topbar
- New `codegen.js` module that:
  - Takes `graph.serialize()` output
  - Walks the topological order
  - Emits function calls for each node type
  - Condition nodes → `if/else`
  - Loop nodes → `for` loop
  - Merge nodes → variable assignment
  - LLM nodes → `anthropic.messages.create()` (Python) or `fetch()` (JS)
  - Multi-agent → `asyncio.gather()` (Python) or `Promise.all()` (JS)
- Output targets: **Python** (anthropic SDK) and **JavaScript** (fetch API)
- Modal with syntax-highlighted code (`<pre>` with CSS classes) and **Copy to Clipboard** button
- Include generated comments explaining each step

**Where to start:**
- Create new `codegen.js`
- Reference `flowgraph.js` serialization format and `examples.js` for test cases
- Wire the Export button in `app.js`

**Estimated effort:** 2-3 sessions

---

## Priority 4 — Natural Language Flow Builder

**"AI building AI pipelines"** — the best single-sentence pitch for a demo.

**What to build:**
- Text input field at the top of the canvas (or a modal)
- User types: "Build me a pipeline that takes a research question, searches for papers, summarizes them, and produces a report"
- Send to Claude with a system prompt that outputs JSON matching the existing flow serialization schema (same format as `examples.js`)
- Parse the JSON response and call `loadFlowData()` to render it
- Auto-layout with `HierarchicalLayout.apply()`
- Show 3-4 **example prompt suggestions** as clickable chips

**Where to start:**
- The flow schema is already well-defined in `examples.js` — use these as few-shot examples in the system prompt
- Wire into `app.js` with a new modal or inline input
- Reuse existing `_callLLM` from `executor.js` for the generation call

**Estimated effort:** 2 sessions

---

## Priority 5 — Plugin / Custom Node SDK

**Shows extensibility thinking.** This is the kind of architecture decision that signals senior engineering.

**What to build:**
- Public API: `window.AgentForge.registerNode(config)` accepting:
  - `type` (string), `label`, `color`, `icon` (SVG string)
  - `ports: { in: [...], out: [...] }`
  - `configSchema` (same format as `config-panel.js` schemas)
  - `execute: async (config, input) => output` function
- Registered plugins appear in the sidebar palette automatically under a "Plugins" category
- Persist plugin definitions in localStorage or load from a URL parameter
- Example plugin: Slack notifier, GitHub issue creator, email sender

**Where to start:**
- `nodes.js` — the `NODE_TYPES` object is the registry; make it extensible
- `executor.js` — the `_executeNode` switch statement needs a plugin fallback
- `config-panel.js` — `CONFIG_SCHEMAS` needs dynamic extension
- Expose `AgentForge` on `window` in `app.js`

**Estimated effort:** 2-3 sessions

---

## Priority 6 — Version History & Flow Diffing

**Signals engineering maturity.** Version control for visual workflows is rare.

**What to build:**
- Extend `StorageManager` to save **versioned snapshots**: an array of `{ timestamp, serializedFlow }` per flow name, capped at 20 versions
- **History button** opens a timeline sidebar with version thumbnails
- Click any version to preview it (read-only overlay on canvas)
- **Visual diff** between two versions:
  - Green border = added nodes
  - Red border (strikethrough) = removed nodes
  - Yellow border = modified nodes (config changed)
  - Dashed edges = changed connections

**Where to start:**
- `storage.js` — currently a simple save/load wrapper (~100 lines). Add versioning here.
- New history panel in `index.html`
- Diff logic compares two serialized flow objects

**Estimated effort:** 2-3 sessions

---

## Priority 7 — Performance Profiling Visualization

**What to build:**
- After execution, overlay a **heatmap** on nodes: red = slow, green = fast
- **Gantt chart** in the execution panel showing node execution as horizontal bars on a timeline
- Flame-chart-style breakdown: total time, time per node type, % spent on LLM API calls vs. local computation
- Click any bar to jump to that node on the canvas

**Where to start:**
- `dashboard.js` already collects `nodeTimings` in `recordRun()` — use this data
- `executor.js` already tracks start/end times per node
- New visualization components in the execution panel

**Estimated effort:** 2 sessions

---

## Priority 8 — A/B Testing in Arena

**What to build:**
- Extend the Arena view to support **batch testing**: run N inputs through two flows side by side
- **Automated scoring**: cost (token count), latency (ms), output quality (LLM-as-judge)
- **Statistical comparison** table with per-metric breakdowns
- Charts: bar chart comparing metrics, scatter plot of latency vs. quality
- Declare a winner with confidence score

**Where to start:**
- `orchestrator.js` — the `Arena` class (around line 166) already runs head-to-head comparisons
- Extend with batch mode and scoring
- Add chart rendering to the Arena view

**Estimated effort:** 3 sessions

---

## Future / Ambitious Features

These require significant architecture changes (server component, new protocols) but would be impressive additions:

| Feature | What | Effort |
|---------|------|--------|
| **Real-Time Collaboration** | WebSocket server broadcasting graph mutations, multi-cursor display, CRDT conflict resolution | 4-6 weeks |
| **Webhook Triggers** | Trigger node type that listens for HTTP webhooks or runs on cron schedules | 2-3 weeks |
| **Mobile/Tablet Support** | Touch event handling, responsive sidebar, pinch-to-zoom | 2 weeks |
| **Subflows** | Collapse a group of nodes into a single "macro node" (graph-within-a-graph) | 3 weeks |
| **Recursive Flows** | A flow that calls itself with depth limits | 1 week |
| **Database Backend** | Replace localStorage with SQLite/Postgres for persistence, sharing, and search | 2-3 weeks |

---

## Recommended Build Order for Maximum Portfolio Impact

1. **Visual Step-Through Debugger** — Most unique differentiator
2. **Streaming LLM Responses** — Highest visual wow factor per effort
3. **Export to Code** — Proves practical, real-world value
4. **Natural Language Builder** — Best demo moment ("AI builds AI pipelines")
5. **Plugin SDK** — Shows architecture and extensibility thinking
6. **Version History** — Signals engineering maturity
7. **Performance Profiling** — Adds depth to the dashboard
8. **A/B Testing** — Completes the Arena view
