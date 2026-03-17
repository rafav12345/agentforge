/* ============================================
   AgentForge — FlowGraph Data Model
   Phase 2: Adjacency list + serialization
   ============================================ */

class FlowGraph {
  constructor() {
    // Adjacency list: nodeId -> { node: FlowNode, out: Set<{nodeId, fromPort, toPort}>, in: Set<...> }
    this.adjacency = new Map();
    this.metadata = {
      name: 'Untitled Flow',
      created: Date.now(),
      modified: Date.now(),
    };
  }

  // ---- Node operations ----

  addNode(node) {
    if (this.adjacency.has(node.id)) return false;
    this.adjacency.set(node.id, {
      node,
      out: [],  // edges going out: { targetId, fromPort, toPort }
      in: [],   // edges coming in: { sourceId, fromPort, toPort }
    });
    this._touch();
    return true;
  }

  removeNode(nodeId) {
    if (!this.adjacency.has(nodeId)) return false;

    // Remove all edges involving this node
    const entry = this.adjacency.get(nodeId);

    // Remove outgoing edges from targets' in-lists
    entry.out.forEach(edge => {
      const target = this.adjacency.get(edge.targetId);
      if (target) {
        target.in = target.in.filter(e => e.sourceId !== nodeId);
      }
    });

    // Remove incoming edges from sources' out-lists
    entry.in.forEach(edge => {
      const source = this.adjacency.get(edge.sourceId);
      if (source) {
        source.out = source.out.filter(e => e.targetId !== nodeId);
      }
    });

    this.adjacency.delete(nodeId);
    this._touch();
    return true;
  }

  getNode(nodeId) {
    const entry = this.adjacency.get(nodeId);
    return entry ? entry.node : null;
  }

  getAllNodes() {
    const nodes = [];
    this.adjacency.forEach(entry => nodes.push(entry.node));
    return nodes;
  }

  get nodeCount() {
    return this.adjacency.size;
  }

  // ---- Edge operations ----

  addEdge(fromNodeId, fromPort, toNodeId, toPort) {
    const source = this.adjacency.get(fromNodeId);
    const target = this.adjacency.get(toNodeId);
    if (!source || !target) return false;
    if (fromNodeId === toNodeId) return false;

    // Check for duplicate
    const exists = source.out.some(
      e => e.targetId === toNodeId && e.fromPort === fromPort && e.toPort === toPort
    );
    if (exists) return false;

    // Remove any existing edge into this specific input port (single input rule)
    target.in = target.in.filter(e => {
      if (e.toPort === toPort) {
        // Also remove from the source's out-list
        const src = this.adjacency.get(e.sourceId);
        if (src) {
          src.out = src.out.filter(
            o => !(o.targetId === toNodeId && o.toPort === toPort)
          );
        }
        return false;
      }
      return true;
    });

    source.out.push({ targetId: toNodeId, fromPort, toPort });
    target.in.push({ sourceId: fromNodeId, fromPort, toPort });
    this._touch();
    return true;
  }

  removeEdge(fromNodeId, fromPort, toNodeId, toPort) {
    const source = this.adjacency.get(fromNodeId);
    const target = this.adjacency.get(toNodeId);
    if (!source || !target) return false;

    source.out = source.out.filter(
      e => !(e.targetId === toNodeId && e.fromPort === fromPort && e.toPort === toPort)
    );
    target.in = target.in.filter(
      e => !(e.sourceId === fromNodeId && e.fromPort === fromPort && e.toPort === toPort)
    );
    this._touch();
    return true;
  }

  getEdges() {
    const edges = [];
    this.adjacency.forEach((entry, nodeId) => {
      entry.out.forEach(edge => {
        edges.push({
          from: { nodeId, port: edge.fromPort },
          to: { nodeId: edge.targetId, port: edge.toPort },
        });
      });
    });
    return edges;
  }

  // ---- Degree analysis ----

  inDegree(nodeId) {
    const entry = this.adjacency.get(nodeId);
    return entry ? entry.in.length : 0;
  }

  outDegree(nodeId) {
    const entry = this.adjacency.get(nodeId);
    return entry ? entry.out.length : 0;
  }

  // Get source nodes (in-degree 0)
  getSources() {
    const sources = [];
    this.adjacency.forEach((entry, nodeId) => {
      if (entry.in.length === 0) sources.push(nodeId);
    });
    return sources;
  }

  // Get sink nodes (out-degree 0)
  getSinks() {
    const sinks = [];
    this.adjacency.forEach((entry, nodeId) => {
      if (entry.out.length === 0) sinks.push(nodeId);
    });
    return sinks;
  }

  // Get neighbors (outgoing)
  getOutNeighbors(nodeId) {
    const entry = this.adjacency.get(nodeId);
    return entry ? entry.out.map(e => e.targetId) : [];
  }

  // Get predecessors (incoming)
  getInNeighbors(nodeId) {
    const entry = this.adjacency.get(nodeId);
    return entry ? entry.in.map(e => e.sourceId) : [];
  }

  // ---- Serialization ----

  serialize() {
    const nodes = [];
    const edges = [];

    this.adjacency.forEach((entry, nodeId) => {
      const node = entry.node;
      nodes.push({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        config: node.nodeConfig || {},
      });

      entry.out.forEach(edge => {
        edges.push({
          from: nodeId,
          fromPort: edge.fromPort,
          to: edge.targetId,
          toPort: edge.toPort,
        });
      });
    });

    return {
      version: 1,
      metadata: { ...this.metadata },
      nodes,
      edges,
    };
  }

  static deserialize(data, createNodeFn) {
    const graph = new FlowGraph();
    graph.metadata = { ...data.metadata };

    // Recreate nodes
    data.nodes.forEach(nd => {
      const node = createNodeFn(nd.type, nd.x, nd.y, nd.id);
      node.nodeConfig = nd.config || {};
      graph.addNode(node);
    });

    // Recreate edges
    data.edges.forEach(ed => {
      graph.addEdge(ed.from, ed.fromPort, ed.to, ed.toPort);
    });

    return graph;
  }

  toJSON() {
    return JSON.stringify(this.serialize(), null, 2);
  }

  // ---- Utility ----

  clear() {
    this.adjacency.clear();
    this._touch();
  }

  _touch() {
    this.metadata.modified = Date.now();
  }

  // Debug: print adjacency list
  debugPrint() {
    console.group('FlowGraph');
    console.log(`Nodes: ${this.adjacency.size}`);
    this.adjacency.forEach((entry, nodeId) => {
      const node = entry.node;
      const outStr = entry.out.map(e => `${e.fromPort}→${e.targetId.slice(-6)}:${e.toPort}`).join(', ');
      const inStr = entry.in.map(e => `${e.sourceId.slice(-6)}:${e.fromPort}→${e.toPort}`).join(', ');
      console.log(`  ${node.type} [${nodeId.slice(-6)}] | out: [${outStr}] | in: [${inStr}]`);
    });
    console.groupEnd();
  }
}
