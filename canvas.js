/* ============================================
   AgentForge — Canvas (Pan & Zoom)
   ============================================ */

class CanvasManager {
  constructor(container, canvas, svgLayer) {
    this.container = container;
    this.canvas = canvas;
    this.svgLayer = svgLayer;

    this.transform = { x: 0, y: 0, scale: 1 };
    this.minScale = 0.25;
    this.maxScale = 2;

    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // Expose transform globally for port position calculations
    window.__canvasTransform = this.transform;

    this._bindEvents();
    this._applyTransform();
  }

  _bindEvents() {
    // Mouse wheel zoom (skip if inside a scrollable panel)
    this.container.addEventListener('wheel', (e) => {
      if (e.target.closest('.execution-panel, .validation-panel, .analyzer-panel, .config-panel, .node-output-preview')) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const rect = this.container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.zoomAt(mx, my, delta);
    }, { passive: false });

    // Pan: left-click on empty canvas, middle mouse, or Shift+drag
    this.container.addEventListener('mousedown', (e) => {
      const isMiddle = e.button === 1;
      const isShiftLeft = e.button === 0 && e.shiftKey;
      // Left-click on empty canvas area (not on a node, port, or UI element)
      const isCanvasBg = e.button === 0 && !e.shiftKey
        && (e.target === this.container || e.target === this.canvas || e.target === this.svgLayer
            || e.target.classList.contains('canvas-empty') || e.target.classList.contains('canvas-empty-text')
            || e.target.classList.contains('canvas-empty-hint') || e.target.classList.contains('canvas-empty-icon'));

      if (isMiddle || isShiftLeft || isCanvasBg) {
        e.preventDefault();
        this.isPanning = true;
        this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
        this.container.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.transform.x = e.clientX - this.panStart.x;
        this.transform.y = e.clientY - this.panStart.y;
        this._applyTransform();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = '';
      }
    });

    // Zoom buttons
    document.getElementById('zoom-in')?.addEventListener('click', () => {
      const rect = this.container.getBoundingClientRect();
      this.zoomAt(rect.width / 2, rect.height / 2, 0.15);
    });
    document.getElementById('zoom-out')?.addEventListener('click', () => {
      const rect = this.container.getBoundingClientRect();
      this.zoomAt(rect.width / 2, rect.height / 2, -0.15);
    });
    document.getElementById('zoom-fit')?.addEventListener('click', () => {
      this.resetZoom();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '=' || e.key === '+') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = this.container.getBoundingClientRect();
          this.zoomAt(rect.width / 2, rect.height / 2, 0.15);
        }
      }
      if (e.key === '-') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const rect = this.container.getBoundingClientRect();
          this.zoomAt(rect.width / 2, rect.height / 2, -0.15);
        }
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.resetZoom();
      }
    });
  }

  zoomAt(cx, cy, delta) {
    const oldScale = this.transform.scale;
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, oldScale + delta));

    // Zoom toward cursor
    this.transform.x = cx - (cx - this.transform.x) * (newScale / oldScale);
    this.transform.y = cy - (cy - this.transform.y) * (newScale / oldScale);
    this.transform.scale = newScale;

    this._applyTransform();
  }

  resetZoom() {
    this.transform.x = 0;
    this.transform.y = 0;
    this.transform.scale = 1;
    this._applyTransform();
  }

  _applyTransform() {
    const t = this.transform;
    const transformStr = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    this.canvas.style.transform = transformStr;
    this.svgLayer.style.transform = transformStr;

    // Update zoom level display
    const zoomEl = document.getElementById('zoom-level');
    if (zoomEl) zoomEl.textContent = Math.round(t.scale * 100) + '%';

    // Keep global reference in sync
    window.__canvasTransform = this.transform;
  }

  // Convert screen coordinates to canvas coordinates
  screenToCanvas(sx, sy) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (sx - rect.left - this.transform.x) / this.transform.scale,
      y: (sy - rect.top - this.transform.y) / this.transform.scale,
    };
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(cx, cy) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: cx * this.transform.scale + this.transform.x + rect.left,
      y: cy * this.transform.scale + this.transform.y + rect.top,
    };
  }
}
