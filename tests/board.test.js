import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, addTask, updateTask, deleteTask, moveTask, shiftTask,
  filterTasks, groupByColumn, isOverdue, getStats, sanitizeState, validateTaskInput, wipStatus,
} from '../js/board.js';

const titles = (state, column) => state.tasks.filter((t) => t.column === column).map((t) => t.title);

function sample() {
  let s = createState();
  s = addTask(s, { title: 'A' });
  s = addTask(s, { title: 'B', priority: 'hoch' });
  s = addTask(s, { title: 'C' }, { column: 'doing' });
  return s;
}

test('addTask legt eine Aufgabe in "todo" an und trimmt den Titel', () => {
  const s = addTask(createState(), { title: '  Hallo  ' });
  assert.equal(s.tasks.length, 1);
  assert.equal(s.tasks[0].title, 'Hallo');
  assert.equal(s.tasks[0].column, 'todo');
  assert.equal(s.tasks[0].priority, 'mittel');
});

test('addTask verändert den ursprünglichen Zustand nicht (immutable)', () => {
  const s = createState();
  addTask(s, { title: 'X' });
  assert.equal(s.tasks.length, 0);
});

test('Validierung lehnt leere Titel, falsche Priorität und Datum ab', () => {
  assert.throws(() => validateTaskInput({ title: '   ' }), /leer/);
  assert.throws(() => validateTaskInput({ title: 'x', priority: 'egal' }), /Priorität/);
  assert.throws(() => validateTaskInput({ title: 'x', due: '31.12.2026' }), /Fälligkeitsdatum/);
  assert.throws(() => validateTaskInput({ title: 'x'.repeat(121) }), /maximal/);
});

test('updateTask ändert Felder und validiert erneut', () => {
  const s = sample();
  const id = s.tasks[0].id;
  const u = updateTask(s, id, { title: 'A2', priority: 'hoch' });
  assert.equal(u.tasks[0].title, 'A2');
  assert.equal(u.tasks[0].priority, 'hoch');
  assert.throws(() => updateTask(s, id, { title: '' }));
  assert.throws(() => updateTask(s, 'gibt-es-nicht', { title: 'x' }));
});

test('deleteTask entfernt nur die gewählte Aufgabe', () => {
  const s = sample();
  const d = deleteTask(s, s.tasks[1].id);
  assert.deepEqual(d.tasks.map((t) => t.title), ['A', 'C']);
});

test('moveTask verschiebt an die richtige Position der Zielspalte', () => {
  const s = sample();
  const [a, b] = s.tasks;
  assert.deepEqual(titles(moveTask(s, b.id, 'doing', 0), 'doing'), ['B', 'C']);
  assert.deepEqual(titles(moveTask(s, b.id, 'doing'), 'doing'), ['C', 'B']);
  assert.deepEqual(titles(moveTask(s, a.id, 'todo', 99), 'todo'), ['B', 'A']);
  assert.deepEqual(titles(moveTask(s, a.id, 'done', 0), 'done'), ['A']);
});

test('moveTask lehnt unbekannte Spalten ab', () => {
  const s = sample();
  assert.throws(() => moveTask(s, s.tasks[0].id, 'archiv'), /Spalte/);
});

test('shiftTask bewegt Spalte für Spalte und stoppt am Rand', () => {
  let s = sample();
  const id = s.tasks[0].id;
  s = shiftTask(s, id, 1);
  assert.equal(s.tasks.find((t) => t.id === id).column, 'doing');
  s = shiftTask(s, id, 1);
  s = shiftTask(s, id, 1);
  assert.equal(s.tasks.find((t) => t.id === id).column, 'done');
  assert.equal(shiftTask(s, s.tasks[0].id, -1).tasks.length, 3);
});

test('filterTasks filtert nach Text und Priorität', () => {
  const s = sample();
  assert.deepEqual(filterTasks(s.tasks, { priority: 'hoch' }).map((t) => t.title), ['B']);
  assert.deepEqual(filterTasks(s.tasks, { query: 'c' }).map((t) => t.title), ['C']);
  assert.equal(filterTasks(s.tasks).length, 3);
});

test('groupByColumn liefert alle Spalten, auch leere', () => {
  const g = groupByColumn(sample().tasks);
  assert.equal(g.todo.length, 2);
  assert.equal(g.doing.length, 1);
  assert.deepEqual(g.done, []);
});

test('isOverdue und getStats', () => {
  let s = createState();
  s = addTask(s, { title: 'alt', due: '2020-01-01' });
  s = addTask(s, { title: 'erledigt', due: '2020-01-01' }, { column: 'done' });
  s = addTask(s, { title: 'neu', due: '2099-01-01' });
  assert.equal(isOverdue(s.tasks[0], '2026-01-01'), true);
  assert.equal(isOverdue(s.tasks[1], '2026-01-01'), false);
  assert.deepEqual(getStats(s, '2026-01-01'), { total: 3, done: 1, overdue: 1, progress: 33 });
});

test('sanitizeState verwirft ungültige Einträge aus Importen', () => {
  const clean = sanitizeState({
    tasks: [
      { id: '1', title: 'ok', column: 'todo', priority: 'hoch' },
      { id: '2', title: '', column: 'todo' },
      { id: '3', title: 'x', column: 'irgendwo' },
      { title: 'ohne id', column: 'todo' },
      '<script>',
    ],
  });
  assert.deepEqual(clean.tasks.map((t) => t.id), ['1']);
  assert.deepEqual(sanitizeState(null).tasks, []);
});

test('wipStatus meldet Erreichen und Überschreiten des WIP-Limits', () => {
  let s = createState();
  assert.equal(wipStatus(s, 'todo'), null);
  for (const title of ['1', '2', '3']) s = addTask(s, { title }, { column: 'doing' });
  assert.deepEqual(wipStatus(s, 'doing'), { count: 3, limit: 3, atLimit: true, exceeded: false });
  s = addTask(s, { title: '4' }, { column: 'doing' });
  assert.equal(wipStatus(s, 'doing').exceeded, true);
});
