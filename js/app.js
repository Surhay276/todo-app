import {
  COLUMNS, addTask, updateTask, deleteTask, moveTask, shiftTask,
  filterTasks, groupByColumn, isOverdue, getStats, sanitizeState, createState, wipStatus,
} from './board.js';

const STORAGE_KEY = 'kanban-board:v1';
const THEME_KEY = 'kanban-board:theme';
const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------- DOM-Helfer ----------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
};
function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
const iconButton = (name, label, onclick, extra = {}) =>
  el('button', { type: 'button', className: `icon-btn ${extra.className ?? ''}`, title: label, ariaLabel: label, onclick, disabled: Boolean(extra.disabled) }, icon(name));

// ---------- Persistenz ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch { /* defekte Daten ignorieren */ }
  return seed();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Speicher voll / privater Modus */ }
}
function seed() {
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  let s = createState();
  s = addTask(s, { title: 'Projekt-Setup & Repository anlegen', priority: 'mittel' }, { column: 'done' });
  s = addTask(s, { title: 'Drag & Drop implementieren', description: 'Native HTML5-API, Einfügeposition anhand der Mausposition berechnen.', priority: 'hoch' }, { column: 'doing' });
  s = addTask(s, { title: 'Unit-Tests für die Board-Logik', description: 'node --test, ohne externe Abhängigkeiten.', priority: 'mittel', due: inDays(2) }, { column: 'doing' });
  s = addTask(s, { title: 'Mobile Ansicht mit Tabs', priority: 'hoch', due: inDays(-1) });
  s = addTask(s, { title: 'Dark Mode', priority: 'niedrig', due: inDays(7) });
  s = addTask(s, { title: 'JSON-Export / -Import', description: 'Board sichern und auf anderem Gerät wiederherstellen.', priority: 'mittel' });
  return s;
}

// ---------- Zustand ----------
let state = load();
let activeColumn = 'todo'; // für die mobile Ansicht
const filters = { query: '', priority: 'alle' };
const isFiltered = () => filters.query.trim() !== '' || filters.priority !== 'alle';

function commit(next) {
  state = next;
  save();
  render();
}

// ---------- Rendering ----------
const board = $('#board');
const tabs = $('#column-tabs');
const PRIORITY_LABEL = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' };
const COLUMN_TITLE = Object.fromEntries(COLUMNS.map((c) => [c.id, c.title]));
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

function move(task, direction) {
  const next = shiftTask(state, task.id, direction);
  const column = next.tasks.find((t) => t.id === task.id).column;
  commit(next);
  toast(`Nach „${COLUMN_TITLE[column]}“ verschoben`);
}

function remove(task) {
  const before = state;
  commit(deleteTask(state, task.id));
  toast('Aufgabe gelöscht', { label: 'Rückgängig', run: () => commit(before) });
}

function renderCard(task, colIndex) {
  const overdue = isOverdue(task);
  const card = el('article', { className: `card${overdue ? ' overdue' : ''}`, draggable: true, tabIndex: 0 });
  card.dataset.id = task.id;
  card.setAttribute('aria-label', `${task.title}. Priorität ${PRIORITY_LABEL[task.priority]}${overdue ? ', überfällig' : ''}`);

  const prev = COLUMNS[colIndex - 1];
  const next = COLUMNS[colIndex + 1];

  // textContent statt innerHTML → Benutzereingaben können kein HTML/Skript einschleusen
  card.append(
    el('h3', { className: 'card-title', textContent: task.title }),
    task.description && el('p', { className: 'card-desc', textContent: task.description }),
    el('div', { className: 'card-meta' },
      el('span', { className: `badge badge-${task.priority}`, textContent: PRIORITY_LABEL[task.priority] }),
      task.due && el('span', { className: 'due' },
        icon(overdue ? 'alert' : 'calendar'),
        `${overdue ? 'Überfällig · ' : ''}${dateFmt.format(new Date(`${task.due}T00:00`))}`)),
    el('div', { className: 'card-actions' },
      iconButton('left', prev ? `Nach „${prev.title}“ verschieben` : 'Erste Spalte', () => move(task, -1), { disabled: !prev }),
      el('span', { className: 'spacer' }),
      iconButton('edit', 'Bearbeiten', () => openDialog(task)),
      iconButton('trash', 'Löschen', () => remove(task), { className: 'danger' }),
      el('span', { className: 'spacer' }),
      iconButton('right', next ? `Nach „${next.title}“ verschieben` : 'Letzte Spalte', () => move(task, 1), { disabled: !next })),
  );

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'ArrowLeft' && prev) move(task, -1);
    if (e.key === 'ArrowRight' && next) move(task, 1);
    if (e.key === 'Enter') openDialog(task);
    if (e.key === 'Delete') remove(task);
  });
  return card;
}

/** Signatur-Element: WIP-Limit der Spalte „In Arbeit“ als Segmentanzeige. */
function renderWip(column) {
  const wip = wipStatus(state, column);
  if (!wip) return null;
  const pips = Array.from({ length: Math.max(wip.limit, wip.count) }, (_, i) =>
    el('span', { className: `wip-pip${i < wip.count ? ' on' : ''}` }));
  const label = wip.exceeded ? 'WIP-Limit überschritten' : wip.atLimit ? 'WIP-Limit erreicht' : 'WIP-Limit';
  return el('div', {
    className: `wip${wip.exceeded ? ' exceeded' : wip.atLimit ? ' at-limit' : ''}`,
    title: 'Work in Progress: höchstens so viele Aufgaben gleichzeitig in Arbeit – erst abschließen, dann neu anfangen.',
  },
  wip.exceeded && icon('alert'),
  el('span', { textContent: label }),
  el('span', { className: 'wip-pips', ariaHidden: 'true' }, ...pips),
  el('span', { className: 'wip-value', textContent: `${wip.count}/${wip.limit}` }));
}

function render() {
  const groups = groupByColumn(filterTasks(state.tasks, filters));
  const allGroups = groupByColumn(state.tasks);

  tabs.replaceChildren(...COLUMNS.map((col) => el('button', {
    type: 'button',
    role: 'tab',
    className: `tab tab-${col.id}`,
    ariaSelected: String(col.id === activeColumn),
    onclick: () => { activeColumn = col.id; render(); },
  }, el('span', { className: 'dot' }), col.title, el('span', { className: 'count', textContent: String(allGroups[col.id].length) }))));

  board.replaceChildren(...COLUMNS.map((col, i) => {
    const cards = groups[col.id];
    const list = el('div', { className: 'card-list' }, ...cards.map((t) => renderCard(t, i)));
    if (cards.length === 0) {
      list.append(isFiltered()
        ? el('p', { className: 'empty', textContent: 'Keine Treffer für diesen Filter' })
        : el('div', { className: 'empty' },
          el('span', { textContent: 'Noch keine Aufgaben' }),
          el('button', { type: 'button', textContent: '+ Aufgabe hinzufügen', onclick: () => openDialog(null, col.id) })));
    }
    list.dataset.column = col.id;
    attachDropZone(list);

    return el('section', { className: `column col-${col.id}${col.id === activeColumn ? ' is-active' : ''}`, ariaLabel: col.title },
      el('header', { className: 'column-head' },
        el('span', { className: 'dot' }),
        el('h2', { textContent: col.title }),
        el('span', { className: 'count', textContent: String(allGroups[col.id].length) }),
        el('button', { type: 'button', className: 'btn btn-icon btn-ghost', title: 'Aufgabe hinzufügen', ariaLabel: `Aufgabe zu „${col.title}“ hinzufügen`, onclick: () => openDialog(null, col.id) }, icon('plus'))),
      renderWip(col.id),
      list);
  }));

  const stats = getStats(state);
  $('#stat-total').textContent = stats.total;
  $('#stat-done').textContent = stats.done;
  $('#stat-overdue').textContent = stats.overdue;
  $('#stat-overdue').closest('.metric').classList.toggle('has-overdue', stats.overdue > 0);
  $('#progress-bar').style.width = `${stats.progress}%`;
  $('#progress').setAttribute('aria-valuenow', stats.progress);
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
    e.dataTransfer.dropEffect = 'move';
    list.classList.add('drop-target');
  });
  list.addEventListener('dragleave', (e) => {
    if (!list.contains(e.relatedTarget)) list.classList.remove('drop-target');
  });
  list.addEventListener('drop', (e) => {
    e.preventDefault();
    list.classList.remove('drop-target');
    const id = e.dataTransfer.getData('text/plain');
    if (!state.tasks.some((t) => t.id === id)) return;
    // Bei aktivem Filter sind nicht alle Karten sichtbar → ans Spaltenende einsortieren
    commit(moveTask(state, id, list.dataset.column, isFiltered() ? Infinity : dropIndex(list, e.clientY)));
  });
}

// ---------- Dialog ----------
const dialog = $('#task-dialog');
const form = $('#task-form');
const fields = form.elements;
let editingId = null;
let targetColumn = 'todo';

function openDialog(task, column = activeColumn) {
  editingId = task?.id ?? null;
  targetColumn = column;
  form.reset();
  $('#form-error').textContent = '';
  $('#dialog-title').textContent = task ? 'Aufgabe bearbeiten' : `Neue Aufgabe in „${COLUMN_TITLE[column]}“`;
  $('#submit-btn').textContent = task ? 'Änderungen speichern' : 'Aufgabe anlegen';
  if (task) {
    fields.title.value = task.title;
    fields.description.value = task.description;
    fields.priority.value = task.priority;
    fields.due.value = task.due ?? '';
  }
  dialog.showModal();
  fields.title.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: fields.title.value,
    description: fields.description.value,
    priority: fields.priority.value,
    due: fields.due.value || null,
  };
  try {
    const wasEditing = Boolean(editingId);
    const next = wasEditing ? updateTask(state, editingId, data) : addTask(state, data, { column: targetColumn });
    if (!wasEditing) activeColumn = targetColumn;
    commit(next);
    dialog.close();
    toast(wasEditing ? 'Änderungen gespeichert' : 'Aufgabe angelegt');
  } catch (err) {
    $('#form-error').textContent = err.message;
    fields.title.focus();
  }
});
$('#cancel-btn').addEventListener('click', () => dialog.close());
$('#close-btn').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // Klick auf den Hintergrund

// ---------- Toolbar ----------
$('#search').addEventListener('input', (e) => { filters.query = e.target.value; render(); });
$('#priority-filter').addEventListener('change', (e) => { filters.priority = e.target.value; render(); });
$('#new-task-btn').addEventListener('click', () => openDialog(null));

const menu = $('.menu');
document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.open = false; });

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `kanban-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  menu.open = false;
  toast('Board exportiert');
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  menu.open = false;
  if (!file) return;
  try {
    const imported = sanitizeState(JSON.parse(await file.text()));
    commit(imported);
    toast(`${imported.tasks.length} Aufgaben importiert`);
  } catch {
    toast('Import fehlgeschlagen: Die Datei ist kein gültiges Board-JSON.');
  }
  e.target.value = '';
});

$('#reset-btn').addEventListener('click', () => {
  const before = state;
  commit(seed());
  menu.open = false;
  toast('Demo-Daten geladen', { label: 'Rückgängig', run: () => commit(before) });
});

// ---------- Theme ----------
const themeBtn = $('#theme-btn');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'));
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Helles Design einschalten' : 'Dunkles Design einschalten');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = theme === 'dark' ? '#0C111D' : '#F9FAFB'; });
}
applyTheme(document.documentElement.dataset.theme || 'light');
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignorieren */ }
  applyTheme(next);
});

// ---------- Toast (mit optionaler Aktion, z. B. Rückgängig) ----------
let toastTimer;
function toast(message, action) {
  const t = $('#toast');
  t.replaceChildren(message);
  t.style.pointerEvents = action ? 'auto' : 'none';
  if (action) {
    t.append(el('button', {
      type: 'button', className: 'toast-action', textContent: action.label,
      onclick: () => { action.run(); t.classList.remove('show'); },
    }));
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2500);
}

render();
