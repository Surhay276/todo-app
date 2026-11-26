import {
  COLUMNS, addTask, updateTask, deleteTask, moveTask, shiftTask,
  filterTasks, groupByColumn, isOverdue, getStats, sanitizeState, createState,
} from './board.js';

const STORAGE_KEY = 'kanban-board:v1';
const THEME_KEY = 'kanban-board:theme';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
};

// ---------- Persistenz ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch { /* defekte Daten ignorieren */ }
  return seed();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Speicher voll / privat */ }
}

function seed() {
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  let s = createState();
  s = addTask(s, { title: 'Projekt-Setup & Repository anlegen', priority: 'mittel' }, { column: 'done' });
  s = addTask(s, { title: 'Drag & Drop implementieren', description: 'Native HTML5 Drag-and-Drop API, Position innerhalb der Spalte berechnen.', priority: 'hoch' }, { column: 'doing' });
  s = addTask(s, { title: 'Unit-Tests für die Board-Logik', description: 'node --test, ohne externe Abhängigkeiten.', priority: 'mittel', due: inDays(2) }, { column: 'doing' });
  s = addTask(s, { title: 'Dark Mode', priority: 'niedrig', due: inDays(7) });
  s = addTask(s, { title: 'JSON-Export / -Import', description: 'Board sichern und auf anderem Gerät wiederherstellen.', priority: 'mittel' });
  return s;
}

// ---------- Zustand ----------
let state = load();
const filters = { query: '', priority: 'alle' };

function commit(next) {
  state = next;
  save();
  render();
}

// ---------- Rendering ----------
const board = $('#board');
const PRIORITY_LABEL = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' };
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function renderCard(task, colIndex) {
  const overdue = isOverdue(task);
  const card = el('article', {
    className: `card prio-${task.priority}${overdue ? ' overdue' : ''}`,
    draggable: true,
    tabIndex: 0,
  });
  card.dataset.id = task.id;
  card.setAttribute('aria-label', `${task.title}, Priorität ${PRIORITY_LABEL[task.priority]}`);

  const meta = el('div', { className: 'card-meta' },
    el('span', { className: `badge badge-${task.priority}`, textContent: PRIORITY_LABEL[task.priority] }),
    task.due && el('span', {
      className: 'due',
      textContent: `${overdue ? '⚠ überfällig · ' : '📅 '}${dateFmt.format(new Date(task.due + 'T00:00'))}`,
    }),
  );

  const actions = el('div', { className: 'card-actions' },
    el('button', { className: 'icon-btn', title: 'Nach links', ariaLabel: 'Nach links verschieben', textContent: '←', disabled: colIndex === 0, onclick: () => commit(shiftTask(state, task.id, -1)) }),
    el('button', { className: 'icon-btn', title: 'Bearbeiten', ariaLabel: 'Bearbeiten', textContent: '✎', onclick: () => openDialog(task) }),
    el('button', { className: 'icon-btn danger', title: 'Löschen', ariaLabel: 'Löschen', textContent: '🗑', onclick: () => commit(deleteTask(state, task.id)) }),
    el('button', { className: 'icon-btn', title: 'Nach rechts', ariaLabel: 'Nach rechts verschieben', textContent: '→', disabled: colIndex === COLUMNS.length - 1, onclick: () => commit(shiftTask(state, task.id, 1)) }),
  );

  // textContent statt innerHTML → kein XSS durch Benutzereingaben
  card.append(
    el('h3', { className: 'card-title', textContent: task.title }),
    task.description && el('p', { className: 'card-desc', textContent: task.description }),
    meta,
    actions,
  );

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'ArrowLeft') commit(shiftTask(state, task.id, -1));
    if (e.key === 'ArrowRight') commit(shiftTask(state, task.id, 1));
    if (e.key === 'Enter') openDialog(task);
    if (e.key === 'Delete') commit(deleteTask(state, task.id));
  });
  return card;
}

function render() {
  const visible = filterTasks(state.tasks, filters);
  const groups = groupByColumn(visible);
  const allGroups = groupByColumn(state.tasks);

  board.replaceChildren(...COLUMNS.map((col, i) => {
    const list = el('div', { className: 'card-list' }, ...groups[col.id].map((t) => renderCard(t, i)));
    if (groups[col.id].length === 0) list.append(el('p', { className: 'empty', textContent: 'Keine Aufgaben' }));
    list.dataset.column = col.id;
    attachDropZone(list);

    return el('section', { className: `column col-${col.id}` },
      el('header', { className: 'column-head' },
        el('h2', { textContent: col.title }),
        el('span', { className: 'count', textContent: String(allGroups[col.id].length) }),
        el('button', { className: 'icon-btn add', title: 'Aufgabe hinzufügen', ariaLabel: `Aufgabe zu „${col.title}“ hinzufügen`, textContent: '+', onclick: () => openDialog(null, col.id) }),
      ),
      list,
    );
  }));

  const stats = getStats(state);
  $('#stat-total').textContent = stats.total;
  $('#stat-done').textContent = stats.done;
  $('#stat-overdue').textContent = stats.overdue;
  $('#progress-bar').style.width = `${stats.progress}%`;
  $('#progress-label').textContent = `${stats.progress} %`;
}

// ---------- Drag & Drop ----------
function dropIndex(list, y) {
  const cards = [...list.querySelectorAll('.card:not(.dragging)')];
  const idx = cards.findIndex((c) => {
    const r = c.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return idx === -1 ? cards.length : idx;
}

function attachDropZone(list) {
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    list.classList.add('drop-target');
  });
  list.addEventListener('dragleave', (e) => {
    if (!list.contains(e.relatedTarget)) list.classList.remove('drop-target');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    list.classList.remove('drop-target');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    // Index bezieht sich auf die sichtbaren Karten; bei aktivem Filter ans Ende sortieren
    const filtered = filters.query || filters.priority !== 'alle';
    commit(moveTask(state, id, list.dataset.column, filtered ? Infinity : dropIndex(list, e.clientY)));
  });
}

// ---------- Dialog ----------
const dialog = $('#task-dialog');
const form = $('#task-form');
let editingId = null;
let targetColumn = 'todo';

function openDialog(task, column = 'todo') {
  editingId = task?.id ?? null;
  targetColumn = column;
  form.reset();
  $('#form-error').textContent = '';
  $('#dialog-title').textContent = task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  if (task) {
    form.elements.title.value = task.title;
    form.elements.description.value = task.description;
    form.elements.priority.value = task.priority;
    form.elements.due.value = task.due ?? '';
  }
  dialog.showModal();
  form.elements.title.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: form.elements.title.value,
    description: form.elements.description.value,
    priority: form.elements.priority.value,
    due: form.elements.due.value || null,
  };
  try {
    commit(editingId ? updateTask(state, editingId, data) : addTask(state, data, { column: targetColumn }));
    dialog.close();
  } catch (err) {
    $('#form-error').textContent = err.message;
  }
});
$('#cancel-btn').addEventListener('click', () => dialog.close());

// ---------- Toolbar ----------
$('#search').addEventListener('input', (e) => { filters.query = e.target.value; render(); });
$('#priority-filter').addEventListener('change', (e) => { filters.priority = e.target.value; render(); });
$('#new-task-btn').addEventListener('click', () => openDialog(null));

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kanban-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = sanitizeState(JSON.parse(await file.text()));
    commit(imported);
    toast(`${imported.tasks.length} Aufgaben importiert`);
  } catch {
    toast('Import fehlgeschlagen: ungültige JSON-Datei');
  }
  e.target.value = '';
});

$('#reset-btn').addEventListener('click', () => {
  commit(seed());
  toast('Demo-Daten wiederhergestellt');
});

// ---------- Theme ----------
const themeBtn = $('#theme-btn');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
applyTheme(localStorage.getItem(THEME_KEY) ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

render();
