// === Data Layer (localStorage + JSON file sync) ===
const DB = {
  KEY: 'dog_training_clients',

  load() {
    const raw = localStorage.getItem(this.KEY);
    if (!raw) return { clients: [] };
    try { return JSON.parse(raw); } catch { return { clients: [] }; }
  },

  save(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
    // Persist to JSON file via server (fire-and-forget)
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2)
    }).catch(function() {});
  },

  // Load data from JSON file into localStorage (called once on startup).
  // Only works when server.py is running (provides /api/data).
  // Falls back silently to localStorage when using a plain HTTP server.
  async loadFromFile() {
    try {
      var res = await fetch('/api/data');
      if (res.ok) {
        var data = await res.json();
        if (data && Array.isArray(data.clients)) {
          localStorage.setItem(this.KEY, JSON.stringify(data));
        }
      }
    } catch(e) { /* server API not available, use localStorage */ }
  },

  getClients() {
    return this.load().clients;
  },

  getClient(id) {
    return this.getClients().find(c => c.id === id) || null;
  },

  addClient(client) {
    const data = this.load();
    client.id = crypto.randomUUID();
    client.sessions = [];
    client.next_session_plan = '';
    client.created_at = new Date().toISOString().split('T')[0];
    data.clients.push(client);
    this.save(data);
    return client.id;
  },

  updateClient(id, updates) {
    const data = this.load();
    const client = data.clients.find(c => c.id === id);
    if (!client) return false;
    Object.assign(client, updates);
    this.save(data);
    return true;
  },

  deleteClient(id) {
    const data = this.load();
    data.clients = data.clients.filter(c => c.id !== id);
    this.save(data);
  },

  addSession(clientId, session) {
    const data = this.load();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return false;
    session.id = crypto.randomUUID();
    client.sessions.push(session);
    this.save(data);
    return true;
  },

  updateSession(clientId, sessionId, updates) {
    const data = this.load();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return false;
    const session = client.sessions.find(s => s.id === sessionId);
    if (!session) return false;
    Object.assign(session, updates);
    this.save(data);
    return true;
  },

  deleteSession(clientId, sessionId) {
    const data = this.load();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return false;
    client.sessions = client.sessions.filter(s => s.id !== sessionId);
    this.save(data);
    return true;
  },

  updateNotes(clientId, notes) {
    const data = this.load();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return false;
    client.notes = notes;
    this.save(data);
    return true;
  },

  updatePlan(clientId, plan) {
    const data = this.load();
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return false;
    client.next_session_plan = plan;
    this.save(data);
    return true;
  },

  exportJSON() {
    return JSON.stringify(this.load(), null, 2);
  },

  importJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.clients || !Array.isArray(data.clients)) {
      throw new Error('פורמט לא תקין');
    }
    this.save(data);
  }
};

// === Router ===
const Router = {
  routes: {},

  on(hash, handler) {
    this.routes[hash] = handler;
  },

  navigate(hash) {
    window.location.hash = hash;
  },

  resolve() {
    const hash = window.location.hash || '#/';
    if (this.routes[hash]) {
      this.routes[hash]();
      return;
    }
    for (const [pattern, handler] of Object.entries(this.routes)) {
      if (pattern.includes(':')) {
        const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$');
        const match = hash.match(regex);
        if (match) {
          handler(...match.slice(1));
          return;
        }
      }
    }
    if (this.routes['#/']) this.routes['#/']();
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }
};

// === Utility ===
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
  if (!text) return '';
  // First escape HTML to prevent XSS
  var s = esc(text);
  // Split into lines for block-level processing
  var lines = s.split('\n');
  var html = [];
  var inList = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<hr>');
      continue;
    }
    // Headings
    if (/^### (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<h4>' + line.replace(/^### /, '') + '</h4>');
      continue;
    }
    if (/^## (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<h3>' + line.replace(/^## /, '') + '</h3>');
      continue;
    }
    if (/^# (.+)$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<h2>' + line.replace(/^# /, '') + '</h2>');
      continue;
    }
    // List items (- or * at start)
    if (/^[\-\*] (.+)$/.test(line.trim())) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push('<li>' + line.trim().replace(/^[\-\*] /, '') + '</li>');
      continue;
    }
    // Numbered list items
    if (/^\d+\. (.+)$/.test(line.trim())) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push('<div class="md-list-item">' + line.trim() + '</div>');
      continue;
    }
    // Regular line
    if (inList) { html.push('</ul>'); inList = false; }
    if (line.trim() === '') {
      html.push('<br>');
    } else {
      html.push('<p>' + line + '</p>');
    }
  }
  if (inList) html.push('</ul>');
  var result = html.join('');
  // Inline formatting: bold then italic
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return result;
}

function showFlash(message, type = 'success') {
  const flash = document.getElementById('flash');
  flash.className = 'flash ' + type;
  flash.textContent = message;
  flash.style.display = 'block';
  setTimeout(() => { flash.style.display = 'none'; }, 3000);
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

// === DOM Helpers ===
function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') element.className = val;
    else if (key === 'textContent') element.textContent = val;
    else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), val);
    else element.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else if (child) element.appendChild(child);
  }
  return element;
}

// === Views ===
const appEl = document.getElementById('app');

function renderClientList(search = '') {
  let clients = DB.getClients();
  if (search) {
    const s = search.toLowerCase();
    clients = clients.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.dog.name.toLowerCase().includes(s)
    );
  }

  const container = document.createDocumentFragment();

  // Header
  const header = el('div', { className: 'page-header' }, [
    el('h2', { textContent: 'הלקוחות שלי' }),
    el('div', { className: 'btn-group' }, [
      el('a', { href: '#/client/new', className: 'btn btn-primary', textContent: '+ לקוח חדש' }),
      el('button', { className: 'btn btn-secondary btn-sm', textContent: 'ייצוא נתונים', onClick: exportData }),
      (() => {
        const label = el('label', { className: 'btn btn-secondary btn-sm', style: 'cursor:pointer' }, ['ייבוא נתונים']);
        const input = el('input', { type: 'file', accept: '.json', style: 'display:none' });
        input.addEventListener('change', importData);
        label.appendChild(input);
        return label;
      })()
    ])
  ]);
  container.appendChild(header);

  // Search
  const searchDiv = el('div', { className: 'search-bar' });
  const searchInput = el('input', {
    type: 'text',
    id: 'search-input',
    placeholder: 'חיפוש לפי שם בעלים או שם כלב...',
    value: search
  });
  searchInput.addEventListener('input', function() { handleSearch(this.value); });
  searchDiv.appendChild(searchInput);
  container.appendChild(searchDiv);

  if (clients.length === 0) {
    const empty = el('div', { className: 'empty-state' }, [
      el('div', { className: 'icon', textContent: '🐾' }),
    ]);
    if (search) {
      empty.appendChild(el('p', { textContent: `לא נמצאו תוצאות עבור "${search}"` }));
    } else {
      empty.appendChild(el('p', { textContent: 'אין לקוחות עדיין' }));
      empty.appendChild(el('a', { href: '#/client/new', className: 'btn btn-primary', textContent: 'הוסף לקוח ראשון' }));
    }
    container.appendChild(empty);
  } else {
    for (const client of clients) {
      const lastSession = client.sessions.length > 0
        ? client.sessions[client.sessions.length - 1].date
        : null;
      const link = el('a', { href: '#/client/' + client.id, className: 'card-link' });
      const card = el('div', { className: 'card client-card' });
      const info = el('div', { className: 'client-info' }, [
        el('h3', { textContent: client.name }),
      ]);
      const dogSpan = el('span', { className: 'dog-name', textContent: '🐕 ' + client.dog.name });
      info.appendChild(dogSpan);
      if (client.dog.breed) {
        info.appendChild(document.createTextNode(' · ' + client.dog.breed));
      }
      const meta = el('div', { className: 'meta', textContent: client.sessions.length + ' פגישות' + (lastSession ? ' · פגישה אחרונה: ' + lastSession : '') });
      info.appendChild(meta);
      card.appendChild(info);
      card.appendChild(el('span', { className: 'client-badge', textContent: client.sessions.length + ' פגישות' }));
      link.appendChild(card);
      container.appendChild(link);
    }
  }

  appEl.replaceChildren(container);
}

function renderClientDetail(clientId) {
  const client = DB.getClient(clientId);
  if (!client) {
    showFlash('לקוח לא נמצא', 'error');
    Router.navigate('#/');
    return;
  }

  const sessions = [...client.sessions].sort((a, b) => b.date.localeCompare(a.date));
  const container = document.createDocumentFragment();

  // Header
  const header = el('div', { className: 'page-header' }, [
    el('h2', { textContent: client.name + ' – ' + client.dog.name }),
    el('div', { className: 'btn-group' }, [
      el('a', { href: '#/client/' + client.id + '/session/new', className: 'btn btn-primary', textContent: '+ פגישה חדשה' }),
      el('a', { href: '#/client/' + client.id + '/edit', className: 'btn btn-secondary', textContent: 'עריכה' }),
      el('button', {
        className: 'btn btn-danger btn-sm',
        textContent: 'מחיקה',
        onClick: () => deleteClient(client.id, client.name)
      })
    ])
  ]);
  container.appendChild(header);

  // Detail grid
  const grid = el('div', { className: 'detail-grid' });

  // Owner details
  const ownerCard = el('div', { className: 'detail-card' }, [el('h3', { textContent: 'פרטי בעלים' })]);
  const ownerRows = [['שם', client.name], ['טלפון', client.phone], ['כתובת', client.address], ['מחיר לפגישה', client.session_price], ['לקוח מאז', client.created_at]];
  for (const [label, value] of ownerRows) {
    if (!value) continue;
    const row = el('div', { className: 'detail-row' }, [
      el('span', { className: 'label', textContent: label }),
    ]);
    if (label === 'טלפון') {
      const link = el('a', { href: 'tel:' + value, style: 'color:var(--primary);text-decoration:none' });
      link.textContent = value;
      const span = el('span', { className: 'value' });
      span.appendChild(link);
      row.appendChild(span);
    } else {
      row.appendChild(el('span', { className: 'value', textContent: value }));
    }
    ownerCard.appendChild(row);
  }
  grid.appendChild(ownerCard);

  // Dog details
  const dogCard = el('div', { className: 'detail-card' }, [el('h3', { textContent: 'פרטי הכלב' })]);
  const dogRows = [['שם', client.dog.name], ['גזע', client.dog.breed], ['גיל', client.dog.age], ['משקל', client.dog.weight]];
  for (const [label, value] of dogRows) {
    if (!value) continue;
    dogCard.appendChild(el('div', { className: 'detail-row' }, [
      el('span', { className: 'label', textContent: label }),
      el('span', { className: 'value', textContent: value })
    ]));
  }
  if (client.dog.issues) {
    const issuesRow = el('div', { className: 'detail-row' }, [
      el('span', { className: 'label', textContent: 'בעיות / סיבת הפנייה' }),
      (() => { var d = el('span', { className: 'value markdown-body' }); d.innerHTML = renderMarkdown(client.dog.issues); return d; })()
    ]);
    dogCard.appendChild(issuesRow);
  }
  grid.appendChild(dogCard);
  container.appendChild(grid);

  // Notes section
  container.appendChild(buildEditableSection('notes-section', 'הערות כלליות', client.notes, 'אין הערות',
    (val) => { DB.updateNotes(clientId, val); showFlash('ההערות עודכנו!'); renderClientDetail(clientId); }));

  // Plan section
  container.appendChild(buildEditableSection('plan-section', 'תוכנית לפגישה הבאה', client.next_session_plan, 'אין תוכנית עדיין',
    (val) => { DB.updatePlan(clientId, val); showFlash('התוכנית עודכנה!'); renderClientDetail(clientId); }));

  // Schedule next session
  const scheduleSection = el('div', { className: 'editable-section', id: 'schedule-section' });
  const scheduleHeader = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
    el('h3', { textContent: 'קביעת פגישה הבאה' })
  ]);
  scheduleSection.appendChild(scheduleHeader);

  const scheduleForm = el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;' });
  const dateGroup = el('div', { className: 'form-group', style: 'margin-bottom:0;flex:1;min-width:150px;' });
  dateGroup.appendChild(el('label', { textContent: 'תאריך' }));
  const dateInput = el('input', { type: 'date', id: 'schedule-date' });
  dateInput.value = client.next_session_date || '';
  dateGroup.appendChild(dateInput);
  scheduleForm.appendChild(dateGroup);

  const timeGroup = el('div', { className: 'form-group', style: 'margin-bottom:0;flex:1;min-width:120px;' });
  timeGroup.appendChild(el('label', { textContent: 'שעה' }));
  const timeInput = el('input', { type: 'time', id: 'schedule-time' });
  timeInput.value = client.next_session_time || '';
  timeGroup.appendChild(timeInput);
  scheduleForm.appendChild(timeGroup);

  const calendarBtn = el('button', {
    className: 'btn btn-primary btn-sm',
    textContent: '📅 קבע בלוח שנה',
    style: 'white-space:nowrap;height:42px;',
    onClick: async () => {
      const date = dateInput.value;
      const time = timeInput.value;
      if (!date || !time) {
        showFlash('יש לבחור תאריך ושעה', 'error');
        return;
      }
      // Save to client data
      DB.updateClient(clientId, { next_session_date: date, next_session_time: time });

      // Create Google Calendar event
      calendarBtn.textContent = '...שולח';
      calendarBtn.disabled = true;
      try {
        const res = await fetch('/api/calendar/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: client.name,
            dog_name: client.dog.name,
            date: date,
            time: time,
            address: client.address || '',
            plan: client.next_session_plan || '',
          })
        });
        const result = await res.json();
        if (result.ok) {
          showFlash('הפגישה נקבעה בלוח השנה!');
        } else {
          showFlash('שגיאה: ' + (result.error || 'לא ניתן ליצור אירוע'), 'error');
        }
      } catch (e) {
        showFlash('שגיאה בחיבור לשרת', 'error');
      }
      calendarBtn.textContent = '📅 קבע בלוח שנה';
      calendarBtn.disabled = false;
    }
  });
  scheduleForm.appendChild(calendarBtn);
  scheduleSection.appendChild(scheduleForm);

  // Show current scheduled date if exists
  if (client.next_session_date) {
    const info = el('div', { style: 'margin-top:10px;color:var(--primary);font-size:0.95rem;' });
    info.textContent = '📅 פגישה הבאה: ' + client.next_session_date + (client.next_session_time ? ' בשעה ' + client.next_session_time : '');
    scheduleSection.appendChild(info);
  }

  container.appendChild(scheduleSection);

  // Sessions
  const sessionsDiv = el('div', { className: 'sessions-section' });
  const sessionsHeader = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
    el('h3', { textContent: 'היסטוריית פגישות (' + sessions.length + ')' }),
    el('a', { href: '#/client/' + client.id + '/session/new', className: 'btn btn-primary btn-sm', textContent: '+ פגישה' })
  ]);
  sessionsDiv.appendChild(sessionsHeader);

  if (sessions.length === 0) {
    sessionsDiv.appendChild(el('div', { className: 'empty-state' }, [el('p', { textContent: 'אין פגישות עדיין' })]));
  } else {
    for (const s of sessions) {
      const card = el('div', { className: 'session-card' });

      // Header row: date + edit/delete buttons
      const dateRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;' }, [
        el('div', { className: 'session-date', textContent: s.date }),
        el('div', { className: 'btn-group' })
      ]);
      const btnGroup = dateRow.querySelector('.btn-group');
      const editBtn = el('button', { className: 'btn-edit', textContent: 'עריכה' });
      const deleteBtn = el('button', { className: 'btn-edit', style: 'color:var(--danger)', textContent: 'מחיקה', onClick: () => {
        if (confirm('למחוק את הפגישה מתאריך ' + s.date + '?')) {
          DB.deleteSession(client.id, s.id);
          showFlash('הפגישה נמחקה');
          renderClientDetail(clientId);
        }
      }});
      btnGroup.appendChild(editBtn);
      btnGroup.appendChild(deleteBtn);
      card.appendChild(dateRow);

      // View mode: display fields
      const viewDiv = el('div', { className: 'content' });
      const fields = [['מה עשינו', s.summary, 'summary'], ['תגובת הכלב', s.dog_behavior, 'dog_behavior'], ['שיעורי בית', s.homework, 'homework'], ['הערות', s.notes, 'notes']];
      for (const [label, value] of fields) {
        if (!value) continue;
        var fieldDiv = el('div', { className: 'session-field' }, [
          el('div', { className: 'field-label', textContent: label }),
        ]);
        var valDiv = el('div', { className: 'field-value markdown-body' });
        valDiv.innerHTML = renderMarkdown(value);
        fieldDiv.appendChild(valDiv);
        viewDiv.appendChild(fieldDiv);
      }
      card.appendChild(viewDiv);

      // Edit mode: textareas for each field
      const editDiv = el('div', { style: 'display:none;' });
      const fieldDefs = [
        ['תאריך', 'date', s.date, 'date'],
        ['מה עשינו', 'summary', s.summary, 'textarea'],
        ['תגובת הכלב', 'dog_behavior', s.dog_behavior, 'textarea'],
        ['שיעורי בית', 'homework', s.homework, 'textarea'],
        ['הערות', 'notes', s.notes, 'textarea']
      ];
      const inputs = {};
      for (const [label, key, value, type] of fieldDefs) {
        const group = el('div', { className: 'form-group' });
        group.appendChild(el('label', { textContent: label }));
        if (type === 'date') {
          const input = el('input', { type: 'date' });
          input.value = value || '';
          inputs[key] = input;
          group.appendChild(input);
        } else {
          const ta = el('textarea', { placeholder: label + '...' });
          ta.value = value || '';
          inputs[key] = ta;
          group.appendChild(ta);
        }
        editDiv.appendChild(group);
      }

      const editActions = el('div', { className: 'edit-actions', style: 'display:flex;gap:8px;margin-top:10px;' });
      const saveBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'שמור' });
      const cancelBtn = el('button', { className: 'btn btn-secondary btn-sm', textContent: 'ביטול' });
      editActions.appendChild(saveBtn);
      editActions.appendChild(cancelBtn);
      editDiv.appendChild(editActions);
      card.appendChild(editDiv);

      // Toggle edit mode
      editBtn.addEventListener('click', () => {
        viewDiv.style.display = 'none';
        editDiv.style.display = 'block';
        editBtn.style.display = 'none';
      });
      cancelBtn.addEventListener('click', () => {
        viewDiv.style.display = '';
        editDiv.style.display = 'none';
        editBtn.style.display = '';
      });
      saveBtn.addEventListener('click', () => {
        DB.updateSession(clientId, s.id, {
          date: inputs.date.value,
          summary: inputs.summary.value.trim(),
          dog_behavior: inputs.dog_behavior.value.trim(),
          homework: inputs.homework.value.trim(),
          notes: inputs.notes.value.trim(),
        });
        showFlash('הפגישה עודכנה!');
        renderClientDetail(clientId);
      });

      sessionsDiv.appendChild(card);
    }
  }
  container.appendChild(sessionsDiv);

  appEl.replaceChildren(container);
}

function buildEditableSection(id, title, value, emptyText, onSave) {
  const section = el('div', { className: 'editable-section', id: id });
  const header = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;' }, [
    el('h3', { textContent: title })
  ]);
  const editBtn = el('button', { className: 'btn-edit', textContent: 'עריכה' });
  header.appendChild(editBtn);
  section.appendChild(header);

  const content = el('div', { className: 'content markdown-body' + (value ? '' : ' empty') });
  if (value) {
    content.innerHTML = renderMarkdown(value);
  } else {
    content.textContent = emptyText;
  }
  section.appendChild(content);

  const textarea = el('textarea');
  textarea.value = value || '';
  section.appendChild(textarea);

  const actions = el('div', { className: 'edit-actions' });
  const saveBtn = el('button', { className: 'btn btn-primary btn-sm', textContent: 'שמור' });
  const cancelBtn = el('button', { className: 'btn btn-secondary btn-sm', textContent: 'ביטול' });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  section.appendChild(actions);

  editBtn.addEventListener('click', () => {
    section.classList.add('editing');
    textarea.focus();
  });
  cancelBtn.addEventListener('click', () => {
    section.classList.remove('editing');
    textarea.value = value || '';
  });
  saveBtn.addEventListener('click', () => {
    onSave(textarea.value.trim());
  });

  return section;
}

function renderClientForm(clientId = null) {
  const client = clientId ? DB.getClient(clientId) : null;
  const isEdit = !!client;

  const container = document.createDocumentFragment();
  container.appendChild(el('div', { className: 'page-header' }, [
    el('h2', { textContent: isEdit ? 'עריכת לקוח' : 'לקוח חדש' })
  ]));

  const formCard = el('div', { className: 'form-card' });
  const form = el('form', { id: 'client-form' });

  // Owner section
  const ownerSection = el('div', { className: 'form-section' }, [el('h3', { textContent: 'פרטי בעלים' })]);
  ownerSection.appendChild(formGroup('שם הבעלים *', 'text', 'name', isEdit ? client.name : '', 'שם מלא', true));
  const phoneAddrRow = el('div', { className: 'form-row' });
  phoneAddrRow.appendChild(formGroup('טלפון', 'tel', 'phone', isEdit ? client.phone : '', '050-1234567'));
  phoneAddrRow.appendChild(formGroup('כתובת', 'text', 'address', isEdit ? client.address : '', 'עיר, רחוב'));
  ownerSection.appendChild(phoneAddrRow);
  ownerSection.appendChild(formGroup('מחיר לפגישה', 'text', 'session_price', isEdit ? (client.session_price || '') : '', 'למשל: 200 ₪'));
  ownerSection.appendChild(formGroupTextarea('הערות כלליות', 'notes', isEdit ? client.notes : '', 'הערות על הלקוח...'));
  form.appendChild(ownerSection);

  // Dog section
  const dogSection = el('div', { className: 'form-section' }, [el('h3', { textContent: 'פרטי הכלב' })]);
  dogSection.appendChild(formGroup('שם הכלב *', 'text', 'dog_name', isEdit ? client.dog.name : '', 'שם הכלב', true));
  const breedAgeRow = el('div', { className: 'form-row' });
  breedAgeRow.appendChild(formGroup('גזע', 'text', 'dog_breed', isEdit ? client.dog.breed : '', 'למשל: לברדור'));
  breedAgeRow.appendChild(formGroup('גיל', 'text', 'dog_age', isEdit ? client.dog.age : '', 'למשל: שנתיים'));
  dogSection.appendChild(breedAgeRow);
  dogSection.appendChild(formGroup('משקל', 'text', 'dog_weight', isEdit ? client.dog.weight : '', 'למשל: 25 ק״ג'));
  dogSection.appendChild(formGroupTextarea('בעיות התנהגות / סיבת הפנייה', 'dog_issues', isEdit ? client.dog.issues : '', 'תאר את הבעיות או סיבת הפנייה לאילוף...'));
  form.appendChild(dogSection);

  // Actions
  const actions = el('div', { className: 'form-actions' }, [
    el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'שמור שינויים' : 'הוסף לקוח' }),
    el('a', { href: isEdit ? '#/client/' + client.id : '#/', className: 'btn btn-secondary', textContent: 'ביטול' })
  ]);
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: fd.get('name').trim(),
      phone: fd.get('phone').trim(),
      address: fd.get('address').trim(),
      session_price: fd.get('session_price').trim(),
      notes: fd.get('notes').trim(),
      dog: {
        name: fd.get('dog_name').trim(),
        breed: fd.get('dog_breed').trim(),
        age: fd.get('dog_age').trim(),
        weight: fd.get('dog_weight').trim(),
        issues: fd.get('dog_issues').trim(),
      }
    };
    if (isEdit) {
      DB.updateClient(clientId, data);
      showFlash('הלקוח עודכן בהצלחה!');
      Router.navigate('#/client/' + clientId);
    } else {
      const newId = DB.addClient(data);
      showFlash('הלקוח נוסף בהצלחה!');
      Router.navigate('#/client/' + newId);
    }
  });

  formCard.appendChild(form);
  container.appendChild(formCard);
  appEl.replaceChildren(container);
}

function renderSessionForm(clientId, sessionId) {
  const client = DB.getClient(clientId);
  if (!client) {
    showFlash('לקוח לא נמצא', 'error');
    Router.navigate('#/');
    return;
  }

  const existing = sessionId ? client.sessions.find(s => s.id === sessionId) : null;
  const isEdit = !!existing;

  const container = document.createDocumentFragment();
  container.appendChild(el('div', { className: 'page-header' }, [
    el('h2', { textContent: (isEdit ? 'עריכת פגישה' : 'פגישה חדשה') + ' – ' + client.dog.name + ' (' + client.name + ')' })
  ]));

  // Show plan if exists (only for new sessions)
  if (!isEdit && client.next_session_plan) {
    const planCard = el('div', { className: 'card', style: 'border-right:4px solid var(--accent);margin-bottom:20px;background:var(--accent-light);' }, [
      el('div', { style: 'color:var(--accent);font-weight:700;font-size:0.9rem;margin-bottom:6px;', textContent: '📋 תוכנית שהוכנה לפגישה זו:' }),
      (() => { var d = el('div', { className: 'markdown-body', style: 'font-size:0.95rem;' }); d.innerHTML = renderMarkdown(client.next_session_plan); return d; })()
    ]);
    container.appendChild(planCard);
  }

  const formCard = el('div', { className: 'form-card' });
  const form = el('form', { id: 'session-form' });

  form.appendChild(formGroup('תאריך', 'date', 'date', isEdit ? existing.date : getToday()));
  form.appendChild(formGroupTextarea('מה עשינו בפגישה *', 'summary', isEdit ? existing.summary : '', 'תאר את התרגילים והפעילויות שביצעתם...', true));
  form.appendChild(formGroupTextarea('איך הכלב הגיב', 'dog_behavior', isEdit ? existing.dog_behavior : '', 'תאר את התנהגות הכלב, התקדמות, קשיים...'));
  form.appendChild(formGroupTextarea('שיעורי בית לבעלים', 'homework', isEdit ? existing.homework : '', 'מה הבעלים צריכים לתרגל עד הפגישה הבאה...'));
  form.appendChild(formGroupTextarea('הערות נוספות', 'session_notes', isEdit ? existing.notes : '', 'כל דבר נוסף שחשוב לציין...'));

  const actions = el('div', { className: 'form-actions' }, [
    el('button', { type: 'submit', className: 'btn btn-primary', textContent: isEdit ? 'שמור שינויים' : 'שמור פגישה' }),
    el('a', { href: '#/client/' + client.id, className: 'btn btn-secondary', textContent: 'ביטול' })
  ]);
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const session = {
      date: fd.get('date'),
      summary: fd.get('summary').trim(),
      dog_behavior: fd.get('dog_behavior').trim(),
      homework: fd.get('homework').trim(),
      notes: fd.get('session_notes').trim(),
    };
    if (isEdit) {
      DB.updateSession(clientId, sessionId, session);
      showFlash('הפגישה עודכנה בהצלחה!');
    } else {
      DB.addSession(clientId, session);
      showFlash('הפגישה נוספה בהצלחה!');
    }
    Router.navigate('#/client/' + clientId);
  });

  formCard.appendChild(form);
  container.appendChild(formCard);
  appEl.replaceChildren(container);
}

// === Form Helpers ===
function formGroup(label, type, name, value = '', placeholder = '', required = false) {
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('label', { for: name, textContent: label }));
  const input = el('input', { type, id: name, name, placeholder });
  input.value = value;
  if (required) input.required = true;
  group.appendChild(input);
  return group;
}

function formGroupTextarea(label, name, value = '', placeholder = '', required = false) {
  const group = el('div', { className: 'form-group' });
  group.appendChild(el('label', { for: name, textContent: label }));
  const textarea = el('textarea', { id: name, name, placeholder });
  textarea.value = value;
  if (required) textarea.required = true;
  group.appendChild(textarea);
  return group;
}

// === Event Handlers ===
function handleSearch(value) {
  renderClientList(value);
  const input = document.getElementById('search-input');
  if (input) {
    input.focus();
    input.setSelectionRange(value.length, value.length);
  }
}

function deleteClient(id, name) {
  if (confirm('למחוק את הלקוח ' + name + '?')) {
    DB.deleteClient(id);
    showFlash('הלקוח נמחק');
    Router.navigate('#/');
  }
}

function exportData() {
  const json = DB.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clients_backup_' + getToday() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showFlash('הנתונים יוצאו בהצלחה!');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      DB.importJSON(e.target.result);
      showFlash('הנתונים יובאו בהצלחה!');
      Router.navigate('#/');
      renderClientList();
    } catch (err) {
      showFlash('שגיאה בייבוא: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// === Init ===
Router.on('#/', () => renderClientList());
Router.on('#/client/new', () => renderClientForm());
Router.on('#/client/:id', (id) => renderClientDetail(id));
Router.on('#/client/:id/edit', (id) => renderClientForm(id));
Router.on('#/client/:id/session/new', (id) => renderSessionForm(id));
Router.on('#/client/:id/session/:sid/edit', (id, sid) => renderSessionForm(id, sid));

// Load data from file (if server.py is running), then start the app
DB.loadFromFile().then(function() { Router.init(); });
