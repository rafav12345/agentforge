/* ============================================
   AgentForge — Storage Manager
   Phase 2: Save/load flows to localStorage
   ============================================ */

class StorageManager {
  constructor(storageKey = 'agentforge_flows') {
    this.storageKey = storageKey;
    this.autosaveKey = 'agentforge_autosave';
  }

  // ---- Flow list ----

  getFlowList() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  _saveFlowList(list) {
    localStorage.setItem(this.storageKey, JSON.stringify(list));
  }

  // ---- Save / Load / Delete ----

  saveFlow(flowData) {
    const list = this.getFlowList();
    const existing = list.findIndex(f => f.metadata.name === flowData.metadata.name);

    const entry = {
      ...flowData,
      metadata: {
        ...flowData.metadata,
        modified: Date.now(),
      },
    };

    if (existing >= 0) {
      list[existing] = entry;
    } else {
      entry.metadata.created = Date.now();
      list.push(entry);
    }

    this._saveFlowList(list);
    return entry;
  }

  loadFlow(name) {
    const list = this.getFlowList();
    return list.find(f => f.metadata.name === name) || null;
  }

  deleteFlow(name) {
    const list = this.getFlowList();
    const filtered = list.filter(f => f.metadata.name !== name);
    this._saveFlowList(filtered);
  }

  // ---- Autosave ----

  autosave(flowData) {
    try {
      localStorage.setItem(this.autosaveKey, JSON.stringify(flowData));
    } catch (e) {
      console.warn('Autosave failed:', e);
    }
  }

  loadAutosave() {
    try {
      const data = localStorage.getItem(this.autosaveKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  clearAutosave() {
    localStorage.removeItem(this.autosaveKey);
  }

  // ---- Export / Import ----

  exportFlowJSON(flowData) {
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowData.metadata.name || 'flow'}.agentforge.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importFlowJSON() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file selected'));

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            if (!data.version || !data.nodes || !data.edges) {
              throw new Error('Invalid flow file');
            }
            resolve(data);
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsText(file);
      });
      input.click();
    });
  }
}
