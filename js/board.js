/**
 * Reine Geschäftslogik des Kanban-Boards.
 * Alle Funktionen sind seiteneffektfrei und liefern einen neuen Zustand zurück
 * (immutable updates) – dadurch sind sie ohne DOM mit `node --test` testbar.
 */

export const COLUMNS = Object.freeze([
  { id: 'todo', title: 'Zu erledigen' },
  { id: 'doing', title: 'In Arbeit' },
  { id: 'done', title: 'Erledigt' },
]);

export const PRIORITIES = Object.freeze(['niedrig', 'mittel', 'hoch']);

/** Work-in-Progress-Limits: begrenzen, wie viele Aufgaben gleichzeitig in Arbeit sein sollen. */
export const WIP_LIMITS = Object.freeze({ doing: 3 });

const COLUMN_IDS = COLUMNS.map((c) => c.id);
const MAX_TITLE = 120;
const MAX_DESC = 1000;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Prüft und normalisiert Eingabedaten einer Aufgabe. Wirft bei ungültigen Daten. */
export function validateTaskInput({ title, description = '', priority = 'mittel', due = null }) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) throw new Error('Der Titel darf nicht leer sein.');
  if (cleanTitle.length > MAX_TITLE) throw new Error(`Der Titel darf maximal ${MAX_TITLE} Zeichen lang sein.`);
  if (!PRIORITIES.includes(priority)) throw new Error(`Ungültige Priorität: ${priority}`);
  if (due !== null && due !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('Ungültiges Fälligkeitsdatum.');
  return {
    title: cleanTitle,
    description: String(description ?? '').trim().slice(0, MAX_DESC),
    priority,
    due: due || null,
  };
}

export function createState(tasks = []) {
  return { tasks: [...tasks] };
}

export function addTask(state, input, { column = 'todo', now = Date.now() } = {}) {
  if (!COLUMN_IDS.includes(column)) throw new Error(`Unbekannte Spalte: ${column}`);
  const task = { id: newId(), ...validateTaskInput(input), column, createdAt: now };
  return { ...state, tasks: [...state.tasks, task] };
}

export function updateTask(state, id, patch) {
  const existing = state.tasks.find((t) => t.id === id);
  if (!existing) throw new Error(`Aufgabe nicht gefunden: ${id}`);
  const merged = validateTaskInput({ ...existing, ...patch });
  return { ...state, tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...merged } : t)) };
}

export function deleteTask(state, id) {
  return { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
}

/**
 * Verschiebt eine Aufgabe in eine Spalte an eine Position (Index innerhalb der Zielspalte).
 * Ein Index außerhalb des Bereichs wird auf das Spaltenende begrenzt.
 */
export function moveTask(state, id, toColumn, toIndex = Infinity) {
  if (!COLUMN_IDS.includes(toColumn)) throw new Error(`Unbekannte Spalte: ${toColumn}`);
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Aufgabe nicht gefunden: ${id}`);

  const others = state.tasks.filter((t) => t.id !== id);
  const target = others.filter((t) => t.column === toColumn);
  const moved = { ...task, column: toColumn };
  const index = Math.max(0, Math.min(Number.isFinite(toIndex) ? toIndex : target.length, target.length));

  let globalIndex;
  if (index < target.length) {
    globalIndex = others.indexOf(target[index]);
  } else if (target.length > 0) {
    globalIndex = others.indexOf(target[target.length - 1]) + 1;
  } else {
    globalIndex = others.length;
  }
  others.splice(globalIndex, 0, moved);
  return { ...state, tasks: others };
}

/** Verschiebt eine Aufgabe eine Spalte nach links (-1) oder rechts (+1) – für Tastaturbedienung. */
export function shiftTask(state, id, direction) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Aufgabe nicht gefunden: ${id}`);
  const next = COLUMN_IDS.indexOf(task.column) + direction;
  if (next < 0 || next >= COLUMN_IDS.length) return state;
  return moveTask(state, id, COLUMN_IDS[next]);
}

export function filterTasks(tasks, { query = '', priority = 'alle' } = {}) {
  const q = query.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (priority === 'alle' || t.priority === priority) &&
      (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
  );
}

export function groupByColumn(tasks) {
  const groups = Object.fromEntries(COLUMN_IDS.map((id) => [id, []]));
  for (const t of tasks) groups[t.column]?.push(t);
  return groups;
}

export function isOverdue(task, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(task.due) && task.column !== 'done' && task.due < today;
}

export function getStats(state, today) {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.column === 'done').length;
  return {
    total,
    done,
    overdue: state.tasks.filter((t) => isOverdue(t, today)).length,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Bereinigt importierte/gespeicherte Daten – verwirft alles, was nicht dem Schema entspricht. */
export function sanitizeState(raw) {
  const list = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const tasks = [];
  for (const t of list) {
    try {
      if (typeof t?.id !== 'string' || !COLUMN_IDS.includes(t.column)) continue;
      tasks.push({ id: t.id, column: t.column, createdAt: Number(t.createdAt) || 0, ...validateTaskInput(t) });
    } catch {
      /* ungültige Aufgabe überspringen */
    }
  }
  return createState(tasks);
}

/** Status des WIP-Limits einer Spalte (null, wenn die Spalte kein Limit hat). */
export function wipStatus(state, column) {
  const limit = WIP_LIMITS[column];
  if (!limit) return null;
  const count = state.tasks.filter((t) => t.column === column).length;
  return { count, limit, atLimit: count === limit, exceeded: count > limit };
}
