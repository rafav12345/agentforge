/* ============================================
   AgentForge — Config Panel
   Phase 2: Per-node configuration sidebar
   ============================================ */

// Config schemas for each node type
const CONFIG_SCHEMAS = {
  input: {
    sections: [
      {
        title: 'Input Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'User Input', default: 'User Input' },
          { key: 'inputType', type: 'select', label: 'Input Type', default: 'text',
            options: [
              { value: 'text', label: 'Text' },
              { value: 'file', label: 'File Upload' },
              { value: 'json', label: 'JSON Data' },
              { value: 'variable', label: 'Variable' },
            ]
          },
          { key: 'defaultValue', type: 'textarea', label: 'Default Value', placeholder: 'Enter default input...', default: '' },
        ],
      },
    ],
  },

  output: {
    sections: [
      {
        title: 'Output Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Final Output', default: 'Final Output' },
          { key: 'format', type: 'select', label: 'Output Format', default: 'text',
            options: [
              { value: 'text', label: 'Plain Text' },
              { value: 'markdown', label: 'Markdown' },
              { value: 'json', label: 'JSON' },
              { value: 'stream', label: 'Stream' },
            ]
          },
        ],
      },
    ],
  },

  llm: {
    sections: [
      {
        title: 'Model',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'LLM Call', default: 'LLM Call' },
          { key: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Anthropic)' },
              { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Anthropic)' },
              { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
              { value: 'mistral-large', label: 'Mistral Large' },
              { value: 'local', label: 'Local / Ollama' },
            ]
          },
        ],
      },
      {
        title: 'Prompt',
        fields: [
          { key: 'systemPrompt', type: 'textarea', label: 'System Prompt', placeholder: 'You are a helpful assistant...', default: '' },
          { key: 'promptTemplate', type: 'textarea', label: 'User Prompt Template',
            placeholder: 'Use {{input}} to reference incoming data', default: '{{input}}' },
        ],
      },
      {
        title: 'Parameters',
        fields: [
          { key: 'temperature', type: 'range', label: 'Temperature', default: 0.7, min: 0, max: 2, step: 0.1 },
          { key: 'maxTokens', type: 'number', label: 'Max Tokens', default: 1024, min: 1, max: 100000 },
        ],
      },
    ],
  },

  tool: {
    sections: [
      {
        title: 'Tool Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'API Call', default: 'API Call' },
          { key: 'toolType', type: 'select', label: 'Tool Type', default: 'http',
            options: [
              { value: 'http', label: 'HTTP Request' },
              { value: 'function', label: 'Custom Function' },
              { value: 'database', label: 'Database Query' },
              { value: 'shell', label: 'Shell Command' },
            ]
          },
        ],
      },
      {
        title: 'HTTP Request',
        fields: [
          { key: 'method', type: 'select', label: 'Method', default: 'GET',
            options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' },
            ]
          },
          { key: 'url', type: 'text', label: 'URL', placeholder: 'https://api.example.com/endpoint', default: '' },
          { key: 'headers', type: 'textarea', label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer ..."}', default: '' },
          { key: 'body', type: 'textarea', label: 'Body Template', placeholder: '{"query": "{{input}}"}', default: '' },
        ],
      },
    ],
  },

  condition: {
    sections: [
      {
        title: 'Condition Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'If / Else', default: 'If / Else' },
          { key: 'expression', type: 'textarea', label: 'Condition Expression',
            placeholder: '{{input}}.includes("error")\nor\n{{input}}.length > 100',
            default: '' },
          { key: 'evaluator', type: 'select', label: 'Evaluator', default: 'javascript',
            options: [
              { value: 'javascript', label: 'JavaScript Expression' },
              { value: 'regex', label: 'Regex Match' },
              { value: 'contains', label: 'Contains Text' },
              { value: 'llm', label: 'LLM Judge' },
            ]
          },
        ],
      },
    ],
  },

  loop: {
    sections: [
      {
        title: 'Loop Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Loop', default: 'Loop' },
          { key: 'loopType', type: 'select', label: 'Loop Type', default: 'count',
            options: [
              { value: 'count', label: 'Fixed Count' },
              { value: 'while', label: 'While Condition' },
              { value: 'forEach', label: 'For Each Item' },
            ]
          },
          { key: 'maxIterations', type: 'number', label: 'Max Iterations', default: 5, min: 1, max: 1000 },
          { key: 'condition', type: 'textarea', label: 'Continue Condition',
            placeholder: 'Expression that returns true to continue', default: '' },
        ],
      },
    ],
  },

  merge: {
    sections: [
      {
        title: 'Merge Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Merge', default: 'Merge' },
          { key: 'strategy', type: 'select', label: 'Merge Strategy', default: 'concat',
            options: [
              { value: 'concat', label: 'Concatenate' },
              { value: 'object', label: 'Merge as Object' },
              { value: 'array', label: 'Collect as Array' },
              { value: 'template', label: 'Custom Template' },
            ]
          },
          { key: 'template', type: 'textarea', label: 'Merge Template',
            placeholder: 'Input A: {{input_a}}\nInput B: {{input_b}}', default: '' },
          { key: 'waitForAll', type: 'checkbox', label: 'Wait for all inputs', default: true },
        ],
      },
    ],
  },

  // ---- Data Source node ----
  datasource: {
    sections: [
      {
        title: 'Data Source',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Data Source', default: 'Data Source' },
          { key: 'dataset', type: 'select', label: 'Dataset', default: 'Quarterly Financials',
            options: [
              { value: 'Quarterly Financials', label: 'Quarterly Financials' },
              { value: 'Supply Chain Metrics', label: 'Supply Chain Metrics' },
              { value: 'Sales Pipeline', label: 'Sales Pipeline' },
              { value: 'Customer Health', label: 'Customer Health' },
              { value: 'custom', label: 'Custom Data' },
            ]
          },
          { key: 'dataFormat', type: 'select', label: 'Format', default: 'csv',
            options: [
              { value: 'csv', label: 'CSV' },
              { value: 'json', label: 'JSON' },
            ]
          },
        ],
      },
      {
        title: 'Data & Filtering',
        fields: [
          { key: 'rawData', type: 'textarea', label: 'Custom Data (for Custom dataset)',
            placeholder: 'Paste CSV or JSON data here...', default: '' },
          { key: 'queryFilter', type: 'textarea', label: 'Filter Expression (optional)',
            placeholder: 'e.g. Revenue > 5000000\nor Region === "EMEA"', default: '' },
        ],
      },
    ],
  },

  // ---- Phase 8: Multi-Agent nodes ----
  debate: {
    sections: [
      {
        title: 'Debate Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Debate', default: 'Debate' },
          { key: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
            ]
          },
          { key: 'rounds', type: 'number', label: 'Debate Rounds', default: 2, min: 1, max: 5 },
        ],
      },
    ],
  },

  ensemble: {
    sections: [
      {
        title: 'Ensemble Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Ensemble', default: 'Ensemble' },
          { key: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
            ]
          },
          { key: 'agentCount', type: 'number', label: 'Agent Count', default: 3, min: 2, max: 7 },
          { key: 'aggregation', type: 'select', label: 'Aggregation', default: 'best',
            options: [
              { value: 'best', label: 'Pick Best (LLM judge)' },
              { value: 'concat', label: 'Concatenate All' },
            ]
          },
        ],
      },
    ],
  },

  supervisor: {
    sections: [
      {
        title: 'Supervisor Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Supervisor', default: 'Supervisor' },
          { key: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
            ]
          },
          { key: 'workerCount', type: 'number', label: 'Worker Count', default: 3, min: 2, max: 6 },
        ],
      },
    ],
  },

  barrier: {
    sections: [
      {
        title: 'Barrier Settings',
        fields: [
          { key: 'label', type: 'text', label: 'Label', placeholder: 'Barrier', default: 'Barrier' },
          { key: 'waitForAll', type: 'checkbox', label: 'Wait for all inputs', default: true },
        ],
      },
    ],
  },
};


class ConfigPanel {
  constructor(containerEl) {
    this.container = containerEl;
    this.currentNodeId = null;
    this.onConfigChange = null;  // callback: (nodeId, config) => void
    this.onNodeLabelChange = null;  // callback: (nodeId, label) => void
  }

  open(node) {
    this.currentNodeId = node.id;
    const schema = CONFIG_SCHEMAS[node.type];
    if (!schema) return;

    const config = node.nodeConfig || {};
    this.container.innerHTML = '';
    this.container.classList.add('open');

    // Panel header
    const header = document.createElement('div');
    header.className = 'config-header';
    header.innerHTML = `
      <div class="config-header-left">
        <div class="node-icon" style="--node-color: ${node.config.color}">${node.config.icon}</div>
        <span class="config-header-title">${node.config.label}</span>
      </div>
      <button class="config-close" id="config-close-btn">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
    `;
    this.container.appendChild(header);

    document.getElementById('config-close-btn').addEventListener('click', () => this.close());

    // Sections
    const body = document.createElement('div');
    body.className = 'config-body';

    schema.sections.forEach(section => {
      const sec = document.createElement('div');
      sec.className = 'config-section';

      const secTitle = document.createElement('div');
      secTitle.className = 'config-section-title';
      secTitle.textContent = section.title;
      sec.appendChild(secTitle);

      section.fields.forEach(field => {
        const fieldEl = this._renderField(field, config[field.key] ?? field.default);
        sec.appendChild(fieldEl);
      });

      body.appendChild(sec);
    });

    this.container.appendChild(body);

    // Node info footer
    const footer = document.createElement('div');
    footer.className = 'config-footer';
    footer.innerHTML = `
      <span class="config-node-id">${node.id.slice(-12)}</span>
      <span class="config-node-pos">(${Math.round(node.x)}, ${Math.round(node.y)})</span>
    `;
    this.container.appendChild(footer);
  }

  close() {
    this.currentNodeId = null;
    this.container.classList.remove('open');
    this.container.innerHTML = '';
  }

  isOpen() {
    return this.container.classList.contains('open');
  }

  _renderField(field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'config-field';

    const label = document.createElement('label');
    label.className = 'config-label';
    label.textContent = field.label;
    wrapper.appendChild(label);

    let input;

    switch (field.type) {
      case 'text':
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'config-input';
        input.placeholder = field.placeholder || '';
        input.value = value || '';
        input.addEventListener('input', () => this._emitChange(field.key, input.value));
        break;

      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'config-input';
        input.min = field.min ?? '';
        input.max = field.max ?? '';
        input.value = value ?? field.default;
        input.addEventListener('input', () => this._emitChange(field.key, parseFloat(input.value)));
        break;

      case 'textarea':
        input = document.createElement('textarea');
        input.className = 'config-textarea';
        input.placeholder = field.placeholder || '';
        input.value = value || '';
        input.rows = 3;
        input.addEventListener('input', () => this._emitChange(field.key, input.value));
        break;

      case 'select':
        input = document.createElement('select');
        input.className = 'config-select';
        field.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === value) option.selected = true;
          input.appendChild(option);
        });
        input.addEventListener('change', () => this._emitChange(field.key, input.value));
        break;

      case 'range':
        const rangeWrap = document.createElement('div');
        rangeWrap.className = 'config-range-wrap';

        input = document.createElement('input');
        input.type = 'range';
        input.className = 'config-range';
        input.min = field.min ?? 0;
        input.max = field.max ?? 1;
        input.step = field.step ?? 0.1;
        input.value = value ?? field.default;

        const rangeValue = document.createElement('span');
        rangeValue.className = 'config-range-value';
        rangeValue.textContent = input.value;

        input.addEventListener('input', () => {
          rangeValue.textContent = input.value;
          this._emitChange(field.key, parseFloat(input.value));
        });

        rangeWrap.appendChild(input);
        rangeWrap.appendChild(rangeValue);
        wrapper.appendChild(rangeWrap);
        return wrapper;

      case 'checkbox':
        const checkWrap = document.createElement('div');
        checkWrap.className = 'config-check-wrap';

        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'config-checkbox';
        input.checked = value ?? field.default;

        const checkLabel = document.createElement('span');
        checkLabel.className = 'config-check-label';
        checkLabel.textContent = field.label;

        input.addEventListener('change', () => this._emitChange(field.key, input.checked));

        checkWrap.appendChild(input);
        checkWrap.appendChild(checkLabel);

        // For checkbox, replace the label
        wrapper.innerHTML = '';
        wrapper.appendChild(checkWrap);
        return wrapper;
    }

    if (input) wrapper.appendChild(input);
    return wrapper;
  }

  _emitChange(key, value) {
    if (this.onConfigChange && this.currentNodeId) {
      this.onConfigChange(this.currentNodeId, key, value);
    }
    // Update node title if label field changed
    if (key === 'label' && this.onNodeLabelChange && this.currentNodeId) {
      this.onNodeLabelChange(this.currentNodeId, value);
    }
  }
}
