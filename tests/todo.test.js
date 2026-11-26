import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, addTask, updateTask, toggleTask, deleteTask, postponeOverdue, addList,
  tasksForView, completedForView, groupTasks, viewCounts, parseQuickAdd, sanitizeState, addDays, search,
} from '../js/todo.js';

const TODAY = '2026-11-26'; // Donnerstag

function sample() {
  let s = createState();
  s = addTask(s, { title: 'Alt', due: '2026-11-20', priority: 'hoch', listId: 'uni' }, 1);
  s = addTask(s, { title: 'Heute', due: TODAY }, 2);
  s = addTask(s, { title: 'Morgen', due: '2026-11-27', priority: 'mittel', listId: 'arbeit' }, 3);
  s = addTask(s, { title: 'Später', due: '2026-12-20' }, 4);
  s = addTask(s, { title: 'Irgendwann' }, 5);
  return s;
}

test('addTask validiert und normalisiert die Eingabe', () => {
  const s = addTask(createState(), { title: '  Einkaufen   gehen ' });
  assert.equal(s.tasks[0].title, 'Einkaufen gehen');
  assert.equal(s.tasks[0].listId, 'eingang');
  assert.equal(s.tasks[0].done, false);
  assert.throws(() => addTask(createState(), { title: ' ' }), /Titel/);
  assert.throws(() => addTask(createState(), { title: 'x', listId: 'gibtsnicht' }), /Liste/);
  assert.throws(() => addTask(createState(), { title: 'x', priority: 'egal' }), /Priorität/);
});

test('toggleTask hakt ab und wieder auf', () => {
  let s = sample();
  const id = s.tasks[1].id;
  s = toggleTask(s, id, 99);
  assert.deepEqual([s.tasks[1].done, s.tasks[1].doneAt], [true, 99]);
  s = toggleTask(s, id);
  assert.deepEqual([s.tasks[1].done, s.tasks[1].doneAt], [false, null]);
});

test('updateTask und deleteTask', () => {
  const s = sample();
  const u = updateTask(s, s.tasks[0].id, { title: 'Neu', listId: 'privat' });
  assert.equal(u.tasks[0].title, 'Neu');
  assert.equal(u.tasks[0].listId, 'privat');
  assert.throws(() => updateTask(s, s.tasks[0].id, { title: '' }));
  assert.equal(deleteTask(s, s.tasks[0].id).tasks.length, 4);
});

test('Ansichten: Heute enthält Überfälliges, 7 Tage, Listen, Erledigt', () => {
  let s = sample();
  assert.deepEqual(tasksForView(s, 'heute', TODAY).map((t) => t.title), ['Alt', 'Heute']);
  assert.deepEqual(tasksForView(s, 'woche', TODAY).map((t) => t.title), ['Alt', 'Heute', 'Morgen']);
  assert.deepEqual(tasksForView(s, 'uni', TODAY).map((t) => t.title), ['Alt']);
  assert.equal(tasksForView(s, 'alle', TODAY).length, 5);
  s = toggleTask(s, s.tasks[1].id, 1);
  assert.deepEqual(tasksForView(s, 'erledigt', TODAY).map((t) => t.title), ['Heute']);
  assert.deepEqual(completedForView(s, 'heute', TODAY).map((t) => t.title), ['Heute']);
});

test('groupTasks gruppiert nach Fälligkeit und sortiert nach Priorität', () => {
  const groups = groupTasks(tasksForView(sample(), 'alle', TODAY), TODAY);
  assert.deepEqual(groups.map((g) => g.id), ['ueberfaellig', 'heute', 'morgen', 'spaeter', 'ohne']);
  let s = createState();
  s = addTask(s, { title: 'niedrig', due: TODAY, priority: 'niedrig' }, 1);
  s = addTask(s, { title: 'hoch', due: TODAY, priority: 'hoch' }, 2);
  assert.deepEqual(groupTasks(s.tasks, TODAY)[0].tasks.map((t) => t.title), ['hoch', 'niedrig']);
});

test('postponeOverdue verschiebt nur offene überfällige Aufgaben', () => {
  const s = postponeOverdue(sample(), TODAY);
  assert.equal(s.tasks[0].due, TODAY);
  assert.equal(s.tasks[3].due, '2026-12-20');
});

test('viewCounts zählt offene Aufgaben je Ansicht', () => {
  const c = viewCounts(sample(), TODAY);
  assert.equal(c.heute, 2);
  assert.equal(c.woche, 3);
  assert.equal(c.eingang, 3);
  assert.equal(c.uni, 1);
});

test('Schnelleingabe: Datum, Priorität und Liste werden erkannt', () => {
  const r = parseQuickAdd('Hausarbeit abgeben morgen !hoch #Uni', TODAY);
  assert.deepEqual([r.title, r.due, r.priority, r.listId], ['Hausarbeit abgeben', '2026-11-27', 'hoch', 'uni']);
  assert.deepEqual(r.tokens.map((t) => t.type).sort(), ['date', 'list', 'priority']);
});

test('Schnelleingabe: deutsche Datumsangaben', () => {
  const due = (text) => parseQuickAdd(text, TODAY).due;
  assert.equal(due('Sport heute'), TODAY);
  assert.equal(due('Arzt übermorgen'), '2026-11-28');
  assert.equal(due('Meeting am Montag'), '2026-11-30');
  assert.equal(due('Wäsche Donnerstag'), '2026-12-03'); // heute ist Donnerstag → nächste Woche
  assert.equal(due('Rechnung in 3 Tagen'), '2026-11-29');
  assert.equal(due('Review in 2 Wochen'), '2026-12-10');
  assert.equal(due('Geburtstag 24.12.'), '2026-12-24');
  assert.equal(due('Steuer 31.05.'), '2027-05-31'); // bereits vorbei → nächstes Jahr
  assert.equal(due('Abgabe am 15.01.2027'), '2027-01-15');
  assert.equal(due('Ungültig 31.02.'), null);
});

test('Schnelleingabe lässt Unbekanntes im Titel', () => {
  const r = parseQuickAdd('Morgenroutine planen #Fitness', TODAY);
  assert.deepEqual([r.title, r.due, r.listId], ['Morgenroutine planen #Fitness', null, null]);
});

test('addList verhindert doppelte Namen', () => {
  const s = addList(createState(), 'Fitness');
  assert.equal(s.lists.at(-1).name, 'Fitness');
  assert.throws(() => addList(s, 'fitness'), /schon/);
  assert.equal(parseQuickAdd('Laufen #fitness', TODAY, s.lists).listId, s.lists.at(-1).id);
});

test('search und addDays', () => {
  assert.deepEqual(search(sample().tasks, 'morg').map((t) => t.title), ['Morgen']);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('sanitizeState verwirft ungültige Einträge und hängt Aufgaben unbekannter Listen in den Eingang', () => {
  const s = sanitizeState({
    lists: [{ id: 'uni', name: 'Uni' }],
    tasks: [
      { id: '1', title: 'ok', listId: 'uni' },
      { id: '2', title: 'verwaist', listId: 'weg' },
      { id: '3', title: '' },
      '<script>',
    ],
  });
  assert.deepEqual(s.tasks.map((t) => [t.id, t.listId]), [['1', 'uni'], ['2', 'eingang']]);
  assert.equal(s.lists[0].id, 'eingang');
  assert.equal(sanitizeState(null).lists.length, 4);
});
