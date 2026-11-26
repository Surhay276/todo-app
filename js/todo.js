/**
 * Reine Logik der To-do-App – ohne DOM, vollständig mit `node --test` testbar.
 * Alle Funktionen geben neue Objekte zurück (immutable updates).
 */

export const PRIORITIES = Object.freeze(['keine', 'niedrig', 'mittel', 'hoch']);
const PRIORITY_RANK = { hoch: 3, mittel: 2, niedrig: 1, keine: 0 };

export const DEFAULT_LISTS = Object.freeze([
  { id: 'eingang', name: 'Eingang' },
  { id: 'uni', name: 'Uni' },
  { id: 'arbeit', name: 'Arbeit' },
  { id: 'privat', name: 'Privat' },
]);

export const SMART_VIEWS = Object.freeze([
  { id: 'heute', name: 'Heute' },
  { id: 'woche', name: 'Nächste 7 Tage' },
  { id: 'alle', name: 'Alle Aufgaben' },
  { id: 'erledigt', name: 'Erledigt' },
]);

const MAX_TITLE = 200;
const MAX_NOTES = 2000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------- Datum ----------
export const todayISO = (now = new Date()) =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 864e5);

// ---------- Zustand ----------
export function createState({ tasks = [], lists = DEFAULT_LISTS } = {}) {
  return { tasks: [...tasks], lists: lists.map((l) => ({ ...l })) };
}

export function validateTask({ title, notes = '', due = null, priority = 'keine', listId = 'eingang' }, lists) {
  const cleanTitle = String(title ?? '').trim().replace(/\s+/g, ' ');
  if (!cleanTitle) throw new Error('Bitte einen Titel eingeben.');
  if (cleanTitle.length > MAX_TITLE) throw new Error(`Der Titel darf höchstens ${MAX_TITLE} Zeichen lang sein.`);
  if (!PRIORITIES.includes(priority)) throw new Error(`Unbekannte Priorität: ${priority}`);
  if (due && !ISO.test(due)) throw new Error('Ungültiges Datum.');
  if (lists && !lists.some((l) => l.id === listId)) throw new Error(`Unbekannte Liste: ${listId}`);
  return { title: cleanTitle, notes: String(notes ?? '').trim().slice(0, MAX_NOTES), due: due || null, priority, listId };
}

export function addTask(state, input, now = Date.now()) {
  const task = { id: newId(), ...validateTask(input, state.lists), done: false, doneAt: null, createdAt: now };
  return { ...state, tasks: [...state.tasks, task] };
}

export function updateTask(state, id, patch) {
  const existing = state.tasks.find((t) => t.id === id);
  if (!existing) throw new Error(`Aufgabe nicht gefunden: ${id}`);
  const merged = { ...existing, ...validateTask({ ...existing, ...patch }, state.lists) };
  return { ...state, tasks: state.tasks.map((t) => (t.id === id ? merged : t)) };
}

export function toggleTask(state, id, now = Date.now()) {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? null : now } : t)),
  };
}

export function deleteTask(state, id) {
  return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
}

/** Verschiebt alle überfälligen, offenen Aufgaben auf ein Datum (TickTick: „Verschieben“). */
export function postponeOverdue(state, today, to = today) {
  return {
    ...state,
    tasks: state.tasks.map((t) => (!t.done && t.due && t.due < today ? { ...t, due: to } : t)),
  };
}

export function addList(state, name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Bitte einen Listennamen eingeben.');
  if (state.lists.some((l) => l.name.toLowerCase() === clean.toLowerCase())) throw new Error('Diese Liste gibt es schon.');
  const id = `l-${newId().slice(0, 8)}`;
  return { ...state, lists: [...state.lists, { id, name: clean.slice(0, 40) }] };
}

// ---------- Ansichten & Gruppierung ----------
export function tasksForView(state, view, today) {
  const open = state.tasks.filter((t) => !t.done);
  switch (view) {
    case 'heute': return open.filter((t) => t.due && t.due <= today);
    case 'woche': return open.filter((t) => t.due && t.due <= addDays(today, 6));
    case 'alle': return open;
    case 'erledigt': return state.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    default: return open.filter((t) => t.listId === view);
  }
}

/** Erledigte Aufgaben, die in einer Ansicht unten eingeklappt angezeigt werden. */
export function completedForView(state, view, today) {
  const done = state.tasks.filter((t) => t.done);
  switch (view) {
    case 'heute': return done.filter((t) => t.due && t.due <= today);
    case 'woche': return done.filter((t) => t.due && t.due <= addDays(today, 6));
    case 'alle': return done;
    case 'erledigt': return [];
    default: return done.filter((t) => t.listId === view);
  }
}

export const sortTasks = (tasks) =>
  [...tasks].sort((a, b) =>
    (a.due ?? '9999') .localeCompare(b.due ?? '9999')
    || PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    || a.createdAt - b.createdAt);

export function groupKey(task, today) {
  if (!task.due) return 'ohne';
  const diff = daysBetween(today, task.due);
  if (diff < 0) return 'ueberfaellig';
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff <= 6) return 'woche';
  return 'spaeter';
}

export const GROUPS = Object.freeze([
  { id: 'ueberfaellig', name: 'Überfällig' },
  { id: 'heute', name: 'Heute' },
  { id: 'morgen', name: 'Morgen' },
  { id: 'woche', name: 'Diese Woche' },
  { id: 'spaeter', name: 'Später' },
  { id: 'ohne', name: 'Ohne Datum' },
]);

/** Gruppiert offene Aufgaben nach Fälligkeit; leere Gruppen entfallen. */
export function groupTasks(tasks, today) {
  const buckets = new Map(GROUPS.map((g) => [g.id, []]));
  for (const t of sortTasks(tasks)) buckets.get(groupKey(t, today)).push(t);
  return GROUPS.map((g) => ({ ...g, tasks: buckets.get(g.id) })).filter((g) => g.tasks.length > 0);
}

export function viewCounts(state, today) {
  const counts = {};
  for (const v of SMART_VIEWS) counts[v.id] = v.id === 'erledigt' ? 0 : tasksForView(state, v.id, today).length;
  for (const l of state.lists) counts[l.id] = tasksForView(state, l.id, today).length;
  return counts;
}

export function search(tasks, query) {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q));
}

// ---------- Schnelleingabe mit natürlicher Sprache ----------
const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const PRIORITY_WORDS = { hoch: 'hoch', h: 'hoch', 3: 'hoch', mittel: 'mittel', m: 'mittel', 2: 'mittel', niedrig: 'niedrig', n: 'niedrig', 1: 'niedrig' };

/**
 * Zerlegt eine Eingabe wie „Hausarbeit abgeben morgen !hoch #Uni“ in Titel, Datum, Priorität und Liste.
 * Erkannte Teile werden aus dem Titel entfernt und als `tokens` zurückgegeben (für die Live-Hervorhebung).
 */
export function parseQuickAdd(text, today, lists = DEFAULT_LISTS) {
  let rest = ` ${String(text ?? '')} `;
  const result = { title: '', due: null, priority: null, listId: null, tokens: [] };
  const take = (regex, handler) => {
    rest = rest.replace(regex, (match, ...groups) => {
      const value = handler(...groups);
      if (value === undefined) return match;
      result.tokens.push({ ...value, text: match.trim() });
      return ' ';
    });
  };

  // Priorität: !hoch, !h, !3
  take(/\s!(hoch|mittel|niedrig|h|m|n|[123])(?=\s)/i, (p) => {
    result.priority = PRIORITY_WORDS[p.toLowerCase()];
    return { type: 'priority', value: result.priority };
  });

  // Liste: #Uni (nur vorhandene Listen)
  take(/\s#([\p{L}\d_-]+)(?=\s)/u, (name) => {
    const list = lists.find((l) => l.name.toLowerCase() === name.toLowerCase() || l.id === name.toLowerCase());
    if (!list) return undefined;
    result.listId = list.id;
    return { type: 'list', value: list.id, label: list.name };
  });

  // Datum: Formulierungen von spezifisch nach allgemein
  const setDue = (iso) => { result.due = iso; return { type: 'date', value: iso }; };
  if (!result.due) take(/\s(?:am\s)?(\d{1,2})\.(\d{1,2})\.(\d{4})?(?=\s)/i, (d, m, y) => {
    const year = y ? Number(y) : Number(today.slice(0, 4));
    const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) || new Date(`${iso}T00:00:00Z`).getUTCDate() !== Number(d)) return undefined;
    return setDue(!y && iso < today ? `${year + 1}${iso.slice(4)}` : iso);
  });
  if (!result.due) take(/\sin\s(\d{1,3})\s(tag|tagen|woche|wochen)(?=\s)/i, (n, unit) =>
    setDue(addDays(today, Number(n) * (unit.toLowerCase().startsWith('woche') ? 7 : 1))));
  if (!result.due) take(/\s(übermorgen|uebermorgen)(?=\s)/i, () => setDue(addDays(today, 2)));
  if (!result.due) take(/\s(heute)(?=\s)/i, () => setDue(today));
  if (!result.due) take(/\s(morgen)(?=\s)/i, () => setDue(addDays(today, 1)));
  if (!result.due) take(/\s(nächste woche|naechste woche)(?=\s)/i, () => setDue(addDays(today, 7)));
  if (!result.due) take(new RegExp(`\\s(?:am\\s)?(${WEEKDAYS.join('|')})(?=\\s)`, 'i'), (day) => {
    const target = WEEKDAYS.indexOf(day.toLowerCase());
    const current = new Date(`${today}T00:00:00Z`).getUTCDay();
    const diff = ((target - current + 7) % 7) || 7; // immer der nächste kommende Wochentag
    return setDue(addDays(today, diff));
  });

  result.title = rest.replace(/\s+/g, ' ').trim();
  return result;
}

// ---------- Import / Speicher ----------
export function sanitizeState(raw) {
  const lists = Array.isArray(raw?.lists) && raw.lists.length
    ? raw.lists.filter((l) => typeof l?.id === 'string' && String(l.name ?? '').trim()).map((l) => ({ id: l.id, name: String(l.name).trim().slice(0, 40) }))
    : DEFAULT_LISTS.map((l) => ({ ...l }));
  if (!lists.some((l) => l.id === 'eingang')) lists.unshift({ id: 'eingang', name: 'Eingang' });
  const tasks = [];
  for (const t of Array.isArray(raw?.tasks) ? raw.tasks : []) {
    try {
      if (typeof t?.id !== 'string') continue;
      const listId = lists.some((l) => l.id === t.listId) ? t.listId : 'eingang';
      tasks.push({
        id: t.id, ...validateTask({ ...t, listId }, lists),
        done: Boolean(t.done), doneAt: t.done ? Number(t.doneAt) || 0 : null, createdAt: Number(t.createdAt) || 0,
      });
    } catch { /* ungültige Aufgabe überspringen */ }
  }
  return { tasks, lists };
}
