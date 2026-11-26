import {
  SMART_VIEWS, createState, addTask, updateTask, toggleTask, deleteTask, postponeOverdue, addList,
  tasksForView, completedForView, groupTasks, viewCounts, parseQuickAdd, sanitizeState, search,
  todayISO, addDays, daysBetween, sortTasks,
} from './todo.js?v=9';

const STORAGE_KEY = 'todo:v1';
const THEME_KEY = 'todo:theme';
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
const mobile = matchMedia('(max-width: 899px)');

// ---------- Zustand & Persistenz ----------
function seed() {
  const t = todayISO();
  const d = (n) => addDays(t, n);
  let s = createState();
  const add = (task, minutesAgo = 0) => { s = addTask(s, task, Date.now() - minutesAgo * 60000); };
  add({ title: 'Hausarbeit Wirtschaftsinformatik abgeben', due: d(-1), priority: 'hoch', listId: 'uni', notes: 'Abgabe als PDF über Moodle.' }, 50);
  add({ title: 'Folien für die Datenbank-Übung vorbereiten', due: t, priority: 'mittel', listId: 'uni' }, 40);
  add({ title: 'Rechnung an Kunden schicken', due: t, priority: 'hoch', listId: 'arbeit' }, 30);
  add({ title: 'Einkaufen: Kaffee, Haferflocken, Obst', due: t, listId: 'privat' }, 20);
  add({ title: 'Kursplan für Montag erstellen', due: d(1), priority: 'mittel', listId: 'arbeit' }, 15);
  add({ title: 'Bewerbung abschicken', due: d(3), priority: 'hoch', listId: 'eingang', notes: 'GitHub-Link zur Startseite beilegen.' }, 10);
  add({ title: 'Fitnessstudio-Vertrag kündigen', due: d(12), priority: 'niedrig', listId: 'privat' }, 5);
  add({ title: 'Buchideen sammeln', listId: 'eingang' }, 1);
  add({ title: 'Repository anlegen', due: d(-2), listId: 'arbeit' }, 60);
  s = toggleTask(s, s.tasks.at(-1).id);
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch { /* defekte Daten ignorieren */ }
  return seed();
}
const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignorieren */ } };

let state = load();
let view = 'heute';
let query = '';
let openTaskId = null;
const collapsed = new Set(['__done']); // eingeklappte Gruppen; „Erledigt“ startet zu

function commit(next) {
  state = next;
  save();
  render();
}

// ---------- Formatierung ----------
const today = () => todayISO();
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);

function relativeDate(iso) {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff > 1 && diff < 7) return new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(asDate(iso));
  return dayFmt.format(asDate(iso)).replace(',', '');
}
const listName = (id) => state.lists.find((l) => l.id === id)?.name ?? 'Eingang';
const viewName = (id) => SMART_VIEWS.find((v) => v.id === id)?.name ?? listName(id);
const PRIORITY_LABEL = { keine: 'Keine Priorität', niedrig: 'Niedrige Priorität', mittel: 'Mittlere Priorität', hoch: 'Hohe Priorität' };

// ---------- Seitenleiste ----------
const VIEW_ICONS = { heute: 'today', woche: 'week', alle: 'all', erledigt: 'done' };

function navItem(id, label, iconName, count) {
  return el('button', {
    type: 'button',
    className: `nav-item${view === id ? ' is-active' : ''}`,
    ariaCurrent: view === id ? 'page' : null,
    onclick: () => selectView(id),
  }, icon(iconName), el('span', { textContent: label }), count ? el('span', { className: 'nav-count', textContent: String(count) }) : null);
}

function renderSidebar(counts) {
  $('#smart-nav').replaceChildren(...SMART_VIEWS.map((v) => navItem(v.id, v.name, VIEW_ICONS[v.id], counts[v.id])));
  $('#list-nav').replaceChildren(...state.lists.map((l) => navItem(l.id, l.name, l.id === 'eingang' ? 'inbox' : 'hash', counts[l.id])));
}

function selectView(id) {
  view = id;
  closeSidebar();
  render();
  $('.main').scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0 });
}

// ---------- Aufgabenliste ----------
function taskRow(task) {
  const overdue = !task.done && task.due && task.due < today();
  const isToday = task.due === today();
  const row = el('div', { className: `task prio-${task.priority}${task.done ? ' is-done' : ''}`, role: 'listitem' });
  row.dataset.id = task.id;

  const check = el('button', {
    type: 'button',
    className: 'check',
    ariaLabel: task.done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ erledigen`,
    title: PRIORITY_LABEL[task.priority],
    onclick: (e) => { e.stopPropagation(); complete(task); },
  }, icon('check'));
  check.setAttribute('aria-pressed', String(task.done));

  const meta = el('span', { className: 'task-meta' },
    task.notes && el('span', { className: 'meta-notes', title: 'Hat Notizen' }, icon('notes')),
    !['eingang', view].includes(task.listId) && el('span', { className: 'meta-list' }, icon('hash'), listName(task.listId)),
  );

  const body = el('button', {
    type: 'button',
    className: 'task-body',
    onclick: () => openDetail(task.id),
  },
  el('span', { className: 'task-title', textContent: task.title }), // textContent → kein HTML aus Nutzereingaben
  meta.childElementCount ? meta : null);

  const date = task.due && el('span', {
    className: `task-date${overdue ? ' is-overdue' : ''}${isToday ? ' is-today' : ''}`,
    textContent: relativeDate(task.due),
  });
  row.append(check, body, date);
  return row;
}

function group(id, title, tasks, { action, count = tasks.length } = {}) {
  const isCollapsed = collapsed.has(id);
  const list = el('div', { className: 'group-list', role: 'list' }, ...tasks.map(taskRow));
  list.hidden = isCollapsed;
  const head = el('div', { className: 'group-head' },
    el('button', {
      type: 'button', className: 'group-toggle', ariaExpanded: String(!isCollapsed),
      onclick: () => { collapsed[isCollapsed ? 'delete' : 'add'](id); render(); },
    }, el('span', { className: 'group-title', textContent: title }), el('span', { className: 'group-count', textContent: String(count) }), icon('chevron')),
    action);
  return el('section', { className: `group group-${id}${isCollapsed ? ' is-collapsed' : ''}` }, head, list);
}

function emptyState() {
  const filtered = query.trim() !== '';
  const text = filtered ? `Keine Aufgaben zu „${query.trim()}“.`
    : view === 'heute' ? 'Für heute ist alles erledigt.'
    : view === 'erledigt' ? 'Noch nichts abgehakt.'
    : 'Diese Liste ist leer.';
  return el('div', { className: 'empty' },
    el('span', { className: 'empty-icon' }, icon(filtered ? 'search' : 'done')),
    el('p', { textContent: text }),
    !filtered && view !== 'erledigt' && el('button', { type: 'button', className: 'btn btn-secondary', onclick: focusQuickAdd }, icon('plus'), 'Aufgabe hinzufügen'));
}

function renderTasks() {
  const t = today();
  const area = $('#task-area');
  const open = search(tasksForView(state, view, t), query);
  const done = search(completedForView(state, view, t), query);
  const sections = [];

  if (view === 'erledigt') {
    if (open.length) sections.push(group('erledigt-liste', 'Abgehakt', open));
  } else {
    for (const g of groupTasks(open, t)) sections.push(groupFor(g));
  }
  if (done.length && view !== 'erledigt') sections.push(group('__done', 'Erledigt', sortTasks(done).reverse()));

  area.replaceChildren(...(sections.length ? sections : [emptyState()]));
}

function groupFor(g) {
  const action = g.id === 'ueberfaellig'
    ? el('button', {
      type: 'button', className: 'link-btn',
      onclick: () => {
        const before = state;
        commit(postponeOverdue(state, today()));
        toast('Überfällige Aufgaben auf heute verschoben', { label: 'Rückgängig', run: () => commit(before) });
      },
    }, 'Auf heute verschieben')
    : null;
  return group(g.id, g.name, g.tasks, { action });
}

function renderHeader() {
  const t = today();
  $('#view-title').textContent = viewName(view);
  $('#view-sub').textContent = view === 'heute' ? longFmt.format(asDate(t)) : '';
  document.title = `${viewName(view)} · To-do`;

  // Tagesfortschritt (nur in „Heute“)
  const progress = $('#progress');
  if (view === 'heute') {
    const open = tasksForView(state, 'heute', t).length;
    const done = state.tasks.filter((x) => x.done && x.due === t).length;
    const total = open + done;
    progress.hidden = total === 0;
    $('#progress-bar').style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    $('#progress-label').textContent = `${done} von ${total} erledigt`;
  } else {
    progress.hidden = true;
  }
}

function render() {
  const counts = viewCounts(state, today());
  renderSidebar(counts);
  renderHeader();
  renderTasks();
  renderQuickAddOptions();
  if (openTaskId) fillDetail();
}

// ---------- Abhaken mit Rückgängig ----------
function complete(task) {
  const before = state;
  const row = document.querySelector(`.task[data-id="${task.id}"]`);
  const finish = () => {
    commit(toggleTask(state, task.id));
    if (!task.done) toast(`„${task.title}“ erledigt`, { label: 'Rückgängig', run: () => commit(before) });
  };
  if (!task.done && row && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    row.classList.add('is-completing'); // kurze Häkchen-Animation, dann aus der Liste nehmen
    setTimeout(finish, 280);
  } else {
    finish();
  }
}

// ---------- Schnelleingabe ----------
const qa = $('#quick-add');
const qaInput = $('#qa-input');
const manual = { due: null, priority: null, listId: null }; // per Chip gesetzt

function defaultsForView() {
  const t = today();
  return {
    due: ['heute', 'woche'].includes(view) ? t : null,
    listId: state.lists.some((l) => l.id === view) ? view : 'eingang',
  };
}

function currentDraft() {
  const parsed = parseQuickAdd(qaInput.value, today(), state.lists);
  const defaults = defaultsForView();
  return {
    parsed,
    title: parsed.title,
    due: parsed.due ?? manual.due ?? defaults.due,
    priority: parsed.priority ?? manual.priority ?? 'keine',
    listId: parsed.listId ?? manual.listId ?? defaults.listId,
  };
}

function renderQuickAddOptions() {
  const select = $('#qa-list');
  const current = select.value;
  select.replaceChildren(...state.lists.map((l) => el('option', { value: l.id, textContent: l.name })));
  select.value = current || defaultsForView().listId;
  updateChips();
}

/** Spiegelt die erkannten Angaben live in die Chips (Signatur der Schnelleingabe). */
function updateChips() {
  const draft = currentDraft();
  const detected = new Set(draft.parsed.tokens.map((tk) => tk.type));
  $('#qa-date').value = draft.due ?? '';
  $('#qa-date-label').textContent = draft.due ? relativeDate(draft.due) : 'Datum';
  $('#qa-priority').value = draft.priority;
  $('#qa-list').value = draft.listId;
  qa.querySelector('[data-chip="date"]').classList.toggle('is-set', Boolean(draft.due));
  qa.querySelector('[data-chip="priority"]').classList.toggle('is-set', draft.priority !== 'keine');
  qa.querySelector('[data-chip="priority"]').dataset.p = draft.priority;
  qa.querySelector('[data-chip="list"]').classList.toggle('is-set', draft.listId !== 'eingang');
  qa.querySelector('[data-chip="date"]').classList.toggle('is-detected', detected.has('date'));
  qa.querySelector('[data-chip="priority"]').classList.toggle('is-detected', detected.has('priority'));
  qa.querySelector('[data-chip="list"]').classList.toggle('is-detected', detected.has('list'));
  qa.classList.toggle('has-text', qaInput.value.trim() !== '');
}

qaInput.addEventListener('input', updateChips);
$('#qa-date').addEventListener('change', (e) => { manual.due = e.target.value || null; updateChips(); });
$('#qa-priority').addEventListener('change', (e) => { manual.priority = e.target.value; updateChips(); });
$('#qa-list').addEventListener('change', (e) => { manual.listId = e.target.value; updateChips(); });

qa.addEventListener('submit', (e) => {
  e.preventDefault();
  const draft = currentDraft();
  if (!draft.title) {
    toast('Bitte einen Titel eingeben.');
    qaInput.focus();
    return;
  }
  commit(addTask(state, { title: draft.title, due: draft.due, priority: draft.priority, listId: draft.listId }));
  // Liegt die neue Aufgabe außerhalb der aktuellen Ansicht, sagen wir, wo sie gelandet ist
  const created = state.tasks.at(-1);
  const visible = tasksForView(state, view, today()).some((t) => t.id === created.id);
  toast(visible ? 'Aufgabe hinzugefügt' : `Aufgabe hinzugefügt in „${listName(created.listId)}“${created.due ? ` · ${relativeDate(created.due)}` : ''}`);
  qaInput.value = '';
  Object.assign(manual, { due: null, priority: null, listId: null });
  updateChips();
  qaInput.focus();
});

function focusQuickAdd() {
  if (mobile.matches) document.body.classList.add('qa-open');
  syncScrollLock();
  qaInput.focus();
}
function closeQuickAdd() {
  document.body.classList.remove('qa-open');
  syncScrollLock();
}
$('#fab').addEventListener('click', focusQuickAdd);
document.addEventListener('pointerdown', (e) => {
  if (document.body.classList.contains('qa-open') && !qa.contains(e.target) && e.target !== $('#fab') && !$('#fab').contains(e.target)) {
    closeQuickAdd();
  }
});
qaInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { qaInput.blur(); closeQuickAdd(); } });

// ---------- Detailansicht ----------
const detail = $('#detail');

function openDetail(id) {
  openTaskId = id;
  $('#detail-error').textContent = '';
  fillDetail();
  detail.showModal();
  syncScrollLock();
  requestAnimationFrame(() => autoGrow($('#detail-title'))); // Höhe erst messen, wenn der Dialog sichtbar ist
}

function fillDetail() {
  const task = state.tasks.find((t) => t.id === openTaskId);
  if (!task) { detail.close(); return; }
  const titleField = $('#detail-title');
  if (document.activeElement !== titleField) titleField.value = task.title;
  autoGrow(titleField);
  if (document.activeElement !== $('#detail-notes')) $('#detail-notes').value = task.notes;
  $('#detail-due').value = task.due ?? '';
  $('#detail-list').replaceChildren(...state.lists.map((l) => el('option', { value: l.id, textContent: l.name })));
  $('#detail-list').value = task.listId;
  const check = $('#detail-check');
  check.className = `check prio-${task.priority}`;
  check.setAttribute('aria-pressed', String(task.done));
  check.ariaLabel = task.done ? 'Wieder öffnen' : 'Als erledigt markieren';
  detail.classList.toggle('is-done', task.done);
  for (const b of $('#detail-priority').children) b.setAttribute('aria-checked', String(b.dataset.p === task.priority));
}

function patchTask(patch) {
  try {
    $('#detail-error').textContent = '';
    commit(updateTask(state, openTaskId, patch));
  } catch (err) {
    $('#detail-error').textContent = err.message;
  }
}

const autoGrow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
$('#detail-title').addEventListener('input', (e) => autoGrow(e.target));
$('#detail-title').addEventListener('change', (e) => patchTask({ title: e.target.value }));
$('#detail-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#detail-notes').addEventListener('change', (e) => patchTask({ notes: e.target.value }));
$('#detail-due').addEventListener('change', (e) => patchTask({ due: e.target.value || null }));
$('#detail-list').addEventListener('change', (e) => patchTask({ listId: e.target.value }));
$('#detail-priority').addEventListener('click', (e) => { const p = e.target.closest('[data-p]')?.dataset.p; if (p) patchTask({ priority: p }); });
$('#detail-quickdates').addEventListener('click', (e) => {
  const b = e.target.closest('[data-days]');
  if (b) patchTask({ due: b.dataset.days === '' ? null : addDays(today(), Number(b.dataset.days)) });
});
$('#detail-check').addEventListener('click', () => {
  const task = state.tasks.find((t) => t.id === openTaskId);
  commit(toggleTask(state, openTaskId));
  if (!task.done) { detail.close(); toast(`„${task.title}“ erledigt`); }
});
$('#detail-delete').addEventListener('click', () => {
  const before = state;
  const task = state.tasks.find((t) => t.id === openTaskId);
  detail.close();
  commit(deleteTask(state, openTaskId));
  toast(`„${task.title}“ gelöscht`, { label: 'Rückgängig', run: () => commit(before) });
});
detail.addEventListener('close', () => {
  // ungespeicherte Eingaben übernehmen (z. B. Notizen ohne Fokuswechsel)
  const task = state.tasks.find((t) => t.id === openTaskId);
  const title = $('#detail-title').value;
  const notes = $('#detail-notes').value;
  if (task && (title.trim() !== task.title || notes.trim() !== task.notes) && title.trim()) patchTask({ title, notes });
  openTaskId = null;
  syncScrollLock();
});
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); }); // Klick auf Hintergrund

// ---------- Seitenleiste mobil ----------
/** Sperrt das Scrollen der Seite im Hintergrund (Menü, Detail-Sheet, Schnelleingabe). */
function syncScrollLock() {
  const locked = mobile.matches && (document.body.classList.contains('sidebar-open')
    || document.body.classList.contains('qa-open') || detail.open);
  document.documentElement.classList.toggle('scroll-locked', locked);
}

function openSidebar() {
  document.body.classList.add('sidebar-open');
  syncScrollLock();
  $('#scrim').hidden = false;
  $('#open-sidebar').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  requestAnimationFrame(syncScrollLock);
  $('#scrim').hidden = true;
  $('#open-sidebar').setAttribute('aria-expanded', 'false');
}
$('#open-sidebar').addEventListener('click', openSidebar);
$('#close-sidebar').addEventListener('click', closeSidebar);
$('#scrim').addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

// ---------- Suche, Listen, Import/Export ----------
$('#search').addEventListener('input', (e) => { query = e.target.value; renderTasks(); });

$('#add-list-btn').addEventListener('click', () => {
  const form = $('#add-list-form');
  form.hidden = !form.hidden;
  if (!form.hidden) $('#add-list-input').focus();
});
$('#add-list-form').addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    commit(addList(state, $('#add-list-input').value));
    $('#add-list-input').value = '';
    $('#add-list-form').hidden = true;
    selectView(state.lists.at(-1).id);
    toast('Liste angelegt');
  } catch (err) {
    toast(err.message);
  }
});
$('#add-list-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#add-list-form').hidden = true; });

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `todo-${today()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Aufgaben exportiert');
});
$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = sanitizeState(JSON.parse(await file.text()));
    commit(imported);
    toast(`${imported.tasks.length} Aufgaben importiert`);
  } catch {
    toast('Import fehlgeschlagen: Die Datei ist kein gültiges To-do-JSON.');
  }
  e.target.value = '';
});
$('#reset-btn').addEventListener('click', () => {
  const before = state;
  commit(seed());
  closeSidebar();
  toast('Demo-Daten geladen', { label: 'Rückgängig', run: () => commit(before) });
});

// ---------- Theme ----------
const themeBtn = $('#theme-btn');
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'), el('span', { textContent: theme === 'dark' ? 'Helles Design' : 'Dunkles Design' }));
  $('meta[name="theme-color"]').content = theme === 'dark' ? '#0C111D' : '#FFFFFF';
}
applyTheme(document.documentElement.dataset.theme);
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignorieren */ }
  applyTheme(next);
});

// ---------- Toast ----------
let toastTimer;
function toast(message, action) {
  const t = $('#toast');
  t.replaceChildren(el('span', { textContent: message }));
  t.style.pointerEvents = action ? 'auto' : 'none';
  if (action) t.append(el('button', { type: 'button', className: 'toast-action', textContent: action.label, onclick: () => { action.run(); t.classList.remove('show'); } }));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2500);
}

// Tastenkürzel: „n“ = neue Aufgabe
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !detail.open) {
    e.preventDefault();
    focusQuickAdd();
  }
});

render();
