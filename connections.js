/* ============================================
   AgentForge — Connections System
   ============================================ */

class Connection {
  constructor(fromNodeId, fromPort, toNodeId, toPort) {
    this.id = 'conn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    this.from = { nodeId: fromNodeId, port: fromPort };
    this.to = { nodeId: toNodeId, port: toPort };
    this.pathEl = null;
  }
}

class ConnectionManager {
  constructor(svgLayer) {
    this.svgLayer = svgLayer;
    this.connections = [];
    this.tempPath = null;
    this.dragging = false;
    this.dragFrom = null;
    this.onConnectionRemoved = null;
  }

  // Create a cubic bezier path between two points
  static makePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const cpOffset = Math.max(50, dx * 0.5);
    return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`;
  }

  addConnection(fromNodeId, fromPort, toNodeId, toPort) {
    // Don't allow duplicate connections
    const exists = this.connections.some(c =>
      c.from.nodeId === fromNodeId && c.from.port === fromPort &&
      c.to.nodeId === toNodeId && c.to.port === toPort
    );
    if (exists) return null;

    // Don't allow self-connections
    if (fromNodeId === toNodeId) return null;

    // Remove any existing connection to this input port (one input only)
    this.connections = this.connections.filter(c => {
      if (c.to.nodeId === toNodeId && c.to.port === toPort) {
        this.removePath(c);
        this.unmarkPortsConnected(c);
        if (this.onConnectionRemoved) this.onConnectionRemoved(c);
        return false;
      }
      return true;
    });

    const conn = new Connection(fromNodeId, fromPort, toNodeId, toPort);
    this.connections.push(conn);
    this.renderConnection(conn);
    this.markPortsConnected(conn);
    return conn;
  }

  renderConnection(conn) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('connection-path');
    path.dataset.connId = conn.id;

    // Click to delete
    path.style.pointerEvents = 'stroke';
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeConnection(conn.id);
    });

    this.svgLayer.appendChild(path);
    conn.pathEl = path;
  }

  removeConnection(connId) {
    const idx = this.connections.findIndex(c => c.id === connId);
    if (idx === -1) return;
    const conn = this.connections[idx];
    this.removePath(conn);
    this.unmarkPortsConnected(conn);
    this.connections.splice(idx, 1);
    if (this.onConnectionRemoved) this.onConnectionRemoved(conn);
  }

  removePath(conn) {
    if (conn.pathEl && conn.pathEl.parentNode) {
      conn.pathEl.parentNode.removeChild(conn.pathEl);
    }
  }

  removeConnectionsForNode(nodeId) {
    const toRemove = this.connections.filter(
      c => c.from.nodeId === nodeId || c.to.nodeId === nodeId
    );
    toRemove.forEach(c => {
      this.removePath(c);
      this.unmarkPortsConnected(c);
    });
    this.connections = this.connections.filter(
      c => c.from.nodeId !== nodeId && c.to.nodeId !== nodeId
    );
  }

  markPortsConnected(conn) {
    this._setPortConnected(conn.from.nodeId, conn.from.port, 'out', true);
    this._setPortConnected(conn.to.nodeId, conn.to.port, 'in', true);
  }

  unmarkPortsConnected(conn) {
    // Only unmark if no other connections use this port
    const fromStillUsed = this.connections.some(
      c => c.id !== conn.id && c.from.nodeId === conn.from.nodeId && c.from.port === conn.from.port
    );
    const toStillUsed = this.connections.some(
      c => c.id !== conn.id && c.to.nodeId === conn.to.nodeId && c.to.port === conn.to.port
    );
    if (!fromStillUsed) this._setPortConnected(conn.from.nodeId, conn.from.port, 'out', false);
    if (!toStillUsed) this._setPortConnected(conn.to.nodeId, conn.to.port, 'in', false);
  }

  _setPortConnected(nodeId, portName, dir, connected) {
    const dot = document.querySelector(
      `.port-dot[data-node-id="${nodeId}"][data-port="${portName}"][data-dir="${dir}"]`
    );
    if (dot) dot.classList.toggle('connected', connected);
  }

  // Update all connection paths (call after node move)
  updateAll(getNode) {
    this.connections.forEach(conn => {
      this.updatePath(conn, getNode);
    });
  }

  updatePath(conn, getNode) {
    const fromNode = getNode(conn.from.nodeId);
    const toNode = getNode(conn.to.nodeId);
    if (!fromNode || !toNode || !conn.pathEl) return;

    const fromPos = fromNode.getPortPosition(conn.from.port, 'out');
    const toPos = toNode.getPortPosition(conn.to.port, 'in');
    const d = ConnectionManager.makePath(fromPos.x, fromPos.y, toPos.x, toPos.y);
    conn.pathEl.setAttribute('d', d);
  }

  // Temp path while dragging a new connection
  startTempPath(x, y) {
    this.tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.tempPath.classList.add('connection-temp');
    this.svgLayer.appendChild(this.tempPath);
    this._tempStart = { x, y };
  }

  updateTempPath(x, y) {
    if (!this.tempPath) return;
    let d;
    if (this.dragFrom && this.dragFrom.dir === 'in') {
      // Dragging from input: draw in reverse
      d = ConnectionManager.makePath(x, y, this._tempStart.x, this._tempStart.y);
    } else {
      d = ConnectionManager.makePath(this._tempStart.x, this._tempStart.y, x, y);
    }
    this.tempPath.setAttribute('d', d);
  }

  endTempPath() {
    if (this.tempPath && this.tempPath.parentNode) {
      this.tempPath.parentNode.removeChild(this.tempPath);
    }
    this.tempPath = null;
    this._tempStart = null;
  }

  // Get all connections as serializable data
  serialize() {
    return this.connections.map(c => ({
      from: { ...c.from },
      to: { ...c.to },
    }));
  }

  clear() {
    this.connections.forEach(c => {
      this.removePath(c);
      this.unmarkPortsConnected(c);
    });
    this.connections = [];
  }
}
