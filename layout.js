/* ============================================
   AgentForge — Layout & Generation (Phase 6)
   Auto-layout: Hierarchical (Sugiyama) + Force-directed
   Flow generation: Maze algorithms (Prim's, Kruskal's, Backtracker)
   ============================================ */

const NODE_W = 200;
const NODE_H = 90;
const H_GAP = 100;  // horizontal gap between layers
const V_GAP = 40;   // vertical gap between nodes in a layer

/* ============================================
   1. Hierarchical Layout (Sugiyama-style)
   Arranges DAGs in left-to-right layers.
   Step 1: Assign layers via longest-path
   Step 2: Order nodes within layers to minimize crossings
   Step 3: Position with even spacing
   ============================================ */

class HierarchicalLayout {
  static apply(graph, animate = false) {
    const nodes = graph.getAllNodes();
    if (nodes.length === 0) return [];

    // Step 1: Layer assignment (longest path from sources)
    const layers = this._assignLayers(graph);

    // Step 2: Order within layers (barycenter heuristic)
    this._orderLayers(layers, graph);

    // Step 3: Compute positions
    const positions = this._computePositions(layers);

    return positions; // [{nodeId, x, y}]
  }

  static _assignLayers(graph) {
    const layerMap = new Map(); // nodeId -> layer index

    // BFS from sources using longest path
    const sources = graph.getSources();
    const queue = sources.map(id => ({ id, layer: 0 }));
    const visited = new Set();

    // Initialize all to layer 0
    graph.adjacency.forEach((_, id) => layerMap.set(id, 0));

    // Longest path: each node's layer = max(predecessor layers) + 1
    // Use topological processing
    const inDegree = new Map();
    graph.adjacency.forEach((entry, id) => inDegree.set(id, entry.in.length));

    const topoQueue = [];
    inDegree.forEach((deg, id) => { if (deg === 0) topoQueue.push(id); });

    while (topoQueue.length > 0) {
      const nodeId = topoQueue.shift();
      const entry = graph.adjacency.get(nodeId);
      if (!entry) continue;

      for (const edge of entry.out) {
        const targetLayer = layerMap.get(nodeId) + 1;
        if (targetLayer > layerMap.get(edge.targetId)) {
          layerMap.set(edge.targetId, targetLayer);
        }
        const newDeg = inDegree.get(edge.targetId) - 1;
        inDegree.set(edge.targetId, newDeg);
        if (newDeg === 0) topoQueue.push(edge.targetId);
      }
    }

    // Handle disconnected nodes (no edges)
    graph.adjacency.forEach((entry, id) => {
      if (entry.in.length === 0 && entry.out.length === 0 && !layerMap.has(id)) {
        layerMap.set(id, 0);
      }
    });

    // Group into layers array
    const maxLayer = Math.max(...layerMap.values(), 0);
    const layers = Array.from({ length: maxLayer + 1 }, () => []);
    layerMap.forEach((layer, nodeId) => {
      layers[layer].push(nodeId);
    });

    return layers;
  }

  static _orderLayers(layers, graph) {
    // Barycenter heuristic: order nodes by average position of their neighbors
    for (let pass = 0; pass < 4; pass++) {
      // Forward sweep
      for (let i = 1; i < layers.length; i++) {
        this._sortLayerByBarycenter(layers[i], layers[i - 1], graph, 'in');
      }
      // Backward sweep
      for (let i = layers.length - 2; i >= 0; i--) {
        this._sortLayerByBarycenter(layers[i], layers[i + 1], graph, 'out');
      }
    }
  }

  static _sortLayerByBarycenter(layer, refLayer, graph, direction) {
    const posMap = new Map();
    refLayer.forEach((id, idx) => posMap.set(id, idx));

    const barycenters = layer.map(nodeId => {
      const entry = graph.adjacency.get(nodeId);
      if (!entry) return { nodeId, bc: 0 };

      const neighbors = direction === 'in'
        ? entry.in.map(e => e.sourceId)
        : entry.out.map(e => e.targetId);

      const positions = neighbors
        .filter(n => posMap.has(n))
        .map(n => posMap.get(n));

      const bc = positions.length > 0
        ? positions.reduce((a, b) => a + b, 0) / positions.length
        : Infinity;

      return { nodeId, bc };
    });

    barycenters.sort((a, b) => a.bc - b.bc);
    layer.length = 0;
    barycenters.forEach(b => layer.push(b.nodeId));
  }

  static _computePositions(layers) {
    const positions = [];
    const startX = 80;
    const startY = 60;

    layers.forEach((layer, layerIdx) => {
      const totalHeight = layer.length * NODE_H + (layer.length - 1) * V_GAP;
      const layerStartY = startY + (layerIdx === 0 ? 0 : 0); // center vertically

      layer.forEach((nodeId, nodeIdx) => {
        positions.push({
          nodeId,
          x: startX + layerIdx * (NODE_W + H_GAP),
          y: startY + nodeIdx * (NODE_H + V_GAP),
        });
      });
    });

    // Center each layer vertically around the tallest layer
    const maxNodesInLayer = Math.max(...layers.map(l => l.length));
    const maxHeight = maxNodesInLayer * NODE_H + (maxNodesInLayer - 1) * V_GAP;

    let posIdx = 0;
    layers.forEach(layer => {
      const layerHeight = layer.length * NODE_H + (layer.length - 1) * V_GAP;
      const offset = (maxHeight - layerHeight) / 2;
      for (let i = 0; i < layer.length; i++) {
        positions[posIdx + i].y += offset;
      }
      posIdx += layer.length;
    });

    return positions;
  }
}


/* ============================================
   2. Force-Directed Layout
   Physics simulation: nodes repel, edges attract.
   Same spring-electric model used in graph visualization.
   ============================================ */

class ForceDirectedLayout {
  static apply(graph, iterations = 120) {
    const nodes = graph.getAllNodes();
    if (nodes.length === 0) return [];

    // Initialize positions (use current or random)
    const pos = new Map();
    const vel = new Map();
    nodes.forEach(n => {
      pos.set(n.id, { x: n.x || Math.random() * 600, y: n.y || Math.random() * 400 });
      vel.set(n.id, { x: 0, y: 0 });
    });

    const k = 180; // ideal spring length
    const repulsion = 50000;
    const attraction = 0.005;
    const damping = 0.85;
    const gravity = 0.01;
    const centerX = 400;
    const centerY = 300;

    for (let iter = 0; iter < iterations; iter++) {
      const temp = 1 - iter / iterations; // cooling

      // Repulsive forces (all pairs)
      const forces = new Map();
      nodes.forEach(n => forces.set(n.id, { x: 0, y: 0 }));

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id);
          const b = pos.get(nodes[j].id);
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          forces.get(nodes[i].id).x += fx;
          forces.get(nodes[i].id).y += fy;
          forces.get(nodes[j].id).x -= fx;
          forces.get(nodes[j].id).y -= fy;
        }
      }

      // Attractive forces (edges)
      graph.getEdges().forEach(edge => {
        const a = pos.get(edge.from.nodeId);
        const b = pos.get(edge.to.nodeId);
        if (!a || !b) return;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = attraction * (dist - k);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        forces.get(edge.from.nodeId).x += fx;
        forces.get(edge.from.nodeId).y += fy;
        forces.get(edge.to.nodeId).x -= fx;
        forces.get(edge.to.nodeId).y -= fy;
      });

      // Gravity toward center
      nodes.forEach(n => {
        const p = pos.get(n.id);
        forces.get(n.id).x += (centerX - p.x) * gravity;
        forces.get(n.id).y += (centerY - p.y) * gravity;
      });

      // Apply forces
      nodes.forEach(n => {
        const f = forces.get(n.id);
        const v = vel.get(n.id);
        const p = pos.get(n.id);

        v.x = (v.x + f.x) * damping * temp;
        v.y = (v.y + f.y) * damping * temp;
        p.x += v.x;
        p.y += v.y;
      });
    }

    // Convert to positions array
    return nodes.map(n => ({
      nodeId: n.id,
      x: Math.round(pos.get(n.id).x),
      y: Math.round(pos.get(n.id).y),
    }));
  }
}


/* ============================================
   3. Maze-Based Flow Generation
   Use maze generation algorithms to create
   random but valid flow topologies.
   ============================================ */

// Node type probability weights for generation
const GEN_NODE_TYPES = [
  { type: 'llm', weight: 4 },
  { type: 'tool', weight: 2 },
  { type: 'condition', weight: 2 },
  { type: 'merge', weight: 1 },
  { type: 'loop', weight: 1 },
];

function _pickRandomNodeType() {
  const total = GEN_NODE_TYPES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of GEN_NODE_TYPES) {
    r -= t.weight;
    if (r <= 0) return t.type;
  }
  return 'llm';
}

class FlowGenerator {

  /**
   * Generate a flow using Prim's algorithm (MST-based).
   * Produces efficient, minimal flows with short paths.
   * Like a maze with many short corridors.
   */
  static prims(nodeCount = 6) {
    const nodes = this._createNodeSet(nodeCount);
    const edges = [];
    const inTree = new Set([0]);
    const candidates = [];

    // Add edges from node 0
    for (let j = 1; j < nodes.length; j++) {
      candidates.push({ from: 0, to: j, weight: Math.random() });
    }

    while (inTree.size < nodes.length && candidates.length > 0) {
      // Pick lowest weight edge that connects to a new node
      candidates.sort((a, b) => a.weight - b.weight);
      let added = false;

      for (let i = 0; i < candidates.length; i++) {
        const edge = candidates[i];
        if (inTree.has(edge.from) && !inTree.has(edge.to)) {
          edges.push({ from: edge.from, to: edge.to });
          inTree.add(edge.to);
          candidates.splice(i, 1);

          // Add new candidates from the newly added node
          for (let j = 0; j < nodes.length; j++) {
            if (!inTree.has(j)) {
              candidates.push({ from: edge.to, to: j, weight: Math.random() });
            }
          }
          added = true;
          break;
        }
      }

      if (!added) break;
    }

    return this._buildFlow("Prim's Flow", nodes, edges);
  }

  /**
   * Generate a flow using Kruskal's algorithm (MST-based).
   * Produces balanced, well-distributed flows.
   * Like a maze with evenly-sized rooms.
   */
  static kruskals(nodeCount = 6) {
    const nodes = this._createNodeSet(nodeCount);
    const edges = [];

    // Generate all possible edges with random weights
    const allEdges = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        allEdges.push({ from: i, to: j, weight: Math.random() });
      }
    }
    allEdges.sort((a, b) => a.weight - b.weight);

    // Union-Find
    const parent = nodes.map((_, i) => i);
    const rank = nodes.map(() => 0);

    function find(x) {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra === rb) return false;
      if (rank[ra] < rank[rb]) parent[ra] = rb;
      else if (rank[ra] > rank[rb]) parent[rb] = ra;
      else { parent[rb] = ra; rank[ra]++; }
      return true;
    }

    for (const edge of allEdges) {
      if (union(edge.from, edge.to)) {
        edges.push({ from: edge.from, to: edge.to });
        if (edges.length === nodes.length - 1) break;
      }
    }

    return this._buildFlow("Kruskal's Flow", nodes, edges);
  }

  /**
   * Generate a flow using Recursive Backtracker (DFS maze gen).
   * Produces deep, winding flows with occasional branches.
   * Like a maze with long corridors and dead ends.
   */
  static recursiveBacktracker(nodeCount = 6) {
    const nodes = this._createNodeSet(nodeCount);
    const edges = [];
    const visited = new Set([0]);
    const stack = [0];

    while (stack.length > 0) {
      const current = stack[stack.length - 1];

      // Find unvisited neighbors (all nodes are potential neighbors)
      const unvisited = [];
      for (let i = 0; i < nodes.length; i++) {
        if (!visited.has(i) && i !== current) unvisited.push(i);
      }

      if (unvisited.length > 0) {
        // Pick a random unvisited neighbor
        const next = unvisited[Math.floor(Math.random() * unvisited.length)];
        edges.push({ from: current, to: next });
        visited.add(next);
        stack.push(next);
      } else {
        // Backtrack
        stack.pop();
      }
    }

    return this._buildFlow("Backtracker Flow", nodes, edges);
  }

  /**
   * Generate a random DAG with configurable density.
   * More general than MST — allows multiple paths.
   */
  static randomDAG(nodeCount = 6, edgeDensity = 0.3) {
    const nodes = this._createNodeSet(nodeCount);
    const edges = [];

    // Ensure it's a DAG by only adding edges from lower to higher index
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.random() < edgeDensity) {
          edges.push({ from: i, to: j });
        }
      }
    }

    // Ensure connectivity: at least one path from first to last
    for (let i = 0; i < nodes.length - 1; i++) {
      const hasOut = edges.some(e => e.from === i);
      if (!hasOut) {
        edges.push({ from: i, to: i + 1 });
      }
    }

    return this._buildFlow("Random DAG", nodes, edges);
  }

  // ---- Helpers ----

  static _createNodeSet(count) {
    const clamped = Math.max(3, Math.min(12, count));
    const nodes = [];

    // First node is always Input
    nodes.push({ type: 'input', label: 'Input' });

    // Middle nodes are random types
    for (let i = 1; i < clamped - 1; i++) {
      const type = _pickRandomNodeType();
      const typeDef = NODE_TYPES[type];
      nodes.push({ type, label: typeDef.label + ' ' + i });
    }

    // Last node is always Output
    nodes.push({ type: 'output', label: 'Output' });

    return nodes;
  }

  static _buildFlow(name, nodes, edgeIndices) {
    const flowNodes = [];
    const flowEdges = [];

    // Create node definitions with temporary positions
    nodes.forEach((n, i) => {
      flowNodes.push({
        id: 'gen_' + Date.now() + '_' + i,
        type: n.type,
        x: 100 + i * 50,  // temp positions, will be auto-laid out
        y: 100 + i * 30,
        config: { label: n.label },
      });
    });

    // Create edge definitions
    edgeIndices.forEach(e => {
      const fromNode = flowNodes[e.from];
      const toNode = flowNodes[e.to];
      if (!fromNode || !toNode) return;

      const fromType = NODE_TYPES[fromNode.type];
      const toType = NODE_TYPES[toNode.type];
      if (!fromType || !toType) return;

      // Pick compatible ports
      const fromPort = fromType.ports.out[0] || 'output';
      const toPort = toType.ports.in[0] || 'input';

      flowEdges.push({
        from: fromNode.id,
        fromPort,
        to: toNode.id,
        toPort,
      });
    });

    return {
      version: 1,
      metadata: { name, created: Date.now(), modified: Date.now() },
      nodes: flowNodes,
      edges: flowEdges,
    };
  }
}


/* ============================================
   4. Layout Animator
   Smoothly transitions nodes from current
   positions to target positions.
   ============================================ */

class LayoutAnimator {
  /**
   * Animate nodes to new positions over duration ms.
   * positions: [{nodeId, x, y}]
   */
  static animate(graph, positions, connectionMgr, getNodeById, duration = 600) {
    return new Promise(resolve => {
      const starts = new Map();
      positions.forEach(p => {
        const node = graph.getNode(p.nodeId);
        if (node) starts.set(p.nodeId, { x: node.x, y: node.y });
      });

      const startTime = performance.now();

      function frame(now) {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        positions.forEach(p => {
          const start = starts.get(p.nodeId);
          const node = graph.getNode(p.nodeId);
          if (!start || !node) return;

          const x = start.x + (p.x - start.x) * ease;
          const y = start.y + (p.y - start.y) * ease;
          node.setPosition(x, y);
        });

        connectionMgr.updateAll(getNodeById);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }
}
