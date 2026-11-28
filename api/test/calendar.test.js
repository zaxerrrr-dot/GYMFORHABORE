// The calendar feed's text (integrations/calendar.js): what a day holds, the RFC 5545 details a
// calendar app is strict about, and the finished workouts when asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, dayRoutines, icsText, fold } from '../integrations/calendar.js';

const NOW = Date.parse('2026-11-04T10:00:00Z');   // a Wednesday
const S = {
  routines: [
    { id: 'a', name: 'Push, heavy', emoji: '💪', ex: [{ id: '0025' }] },
    { id: 'b', name: 'Core', ex: [] },
    { id: 'c', name: 'Legs', ex: [] },
  ],
  week: { 3: ['a', 'b'], 5: ['c'] },
  dayPlan: { '2026-11-06': 'rest', '2026-11-07': 'a' },
  workouts: [{ id: 'w1', d: '2026-11-02', name: 'Monday thing', start: Date.parse('2026-11-02T17:00:00Z'), end: Date.parse('2026-11-02T18:05:00Z'), entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: false }] }] }],
};
const events = ics => ics.split('BEGIN:VEVENT').slice(1).map(e => Object.fromEntries(e.split('\r\n').filter(l => l.includes(':')).map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)])));

test('a day holds a combined weekday, an override, or nothing on a rest override', () => {
  assert.deepEqual(dayRoutines(S, '2026-11-04', '2026-11-04'), ['a', 'b']);
  assert.deepEqual(dayRoutines(S, '2026-11-06', '2026-11-04'), []);
  assert.deepEqual(dayRoutines(S, '2026-11-07', '2026-11-04'), ['a']);
  assert.deepEqual(dayRoutines(S, '2026-11-05', '2026-11-04'), []);
});

test('the feed: all-day plan events with stable ids, escaped, folded', () => {
  const ics = buildIcs(S, { uid: 'u1', now: NOW, tz: 'UTC', name: 'Duarte' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
  assert.match(ics, /X-WR-CALNAME:Habcore Gym · Duarte\r\n/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'folded: ' + line);
  const ev = events(ics);
  const wed = ev.filter(e => e['DTSTART;VALUE=DATE'] === '20261104');
  assert.deepEqual(wed.map(e => e.SUMMARY), ['Push\\, heavy', 'Core'], 'never the icon (kl18)');
  assert.equal(wed[0]['DTEND;VALUE=DATE'], '20261105');
  assert.equal(wed[0].UID, 'plan-2026-11-04-a-u1@opengym');
  assert.ok(!ev.some(e => e['DTSTART;VALUE=DATE'] === '20261106'), 'rest override');
  assert.ok(ev.some(e => e['DTSTART;VALUE=DATE'] === '20261107' && e.SUMMARY.endsWith('Push\\, heavy')));
  assert.ok(!ics.includes('✓'), 'no workouts unless asked');
  // eight weeks of Wednesdays and Fridays ahead; nothing before today (kl18)
  assert.ok(ev.some(e => e['DTSTART;VALUE=DATE'] === '20261230'));
  assert.ok(!ev.some(e => (e['DTSTART;VALUE=DATE'] || '9') < '20261104'), 'no plan day gone by');
  assert.match(wed[0].DESCRIPTION, /^Plan na ten dzień · ćwiczenia: 1$/);
  assert.ok(!ev.some(e => e['DTSTART;VALUE=DATE'] === '20270107'));
});

test('with done: the finished workouts as timed events, and their day without its plan', () => {
  const ev = events(buildIcs({ ...S, week: { ...S.week, 1: ['c'] } }, { uid: 'u1', now: NOW, tz: 'UTC', done: true }));
  const w = ev.find(e => e.UID === 'done-w1-u1@opengym');
  assert.equal(w.DTSTART, '20261102T170000Z');
  assert.equal(w.DTEND, '20261102T180500Z');
  assert.equal(w.SUMMARY, '✓ Monday thing');
  assert.equal(w.DESCRIPTION, 'Czas: 1 h 5 min\\nObjętość: 480 kg\\nSerie: 1\\nĆwiczenia: 1');
  assert.ok(!ev.some(e => e['DTSTART;VALUE=DATE'] === '20261102'), 'the plan of a day with its workout is left out');
});

test('a coach week: today has its next session, later days only what has a day', () => {
  const Q = { ...S, week: { 4: ['c'] }, dayPlan: {}, queue: { ids: ['a', 'b'], startsOn: '2026-11-01', since: 1 }, workouts: [] };
  assert.deepEqual(dayRoutines(Q, '2026-11-04', '2026-11-04'), ['a']);
  assert.deepEqual(dayRoutines(Q, '2026-11-05', '2026-11-04'), ['c']);
  assert.deepEqual(dayRoutines(Q, '2026-11-09', '2026-11-04'), []);
});

test('text and folding by the rules', () => {
  assert.equal(icsText('a,b;c\\d\ne\u0007'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'DESCRIPTION:' + 'ü'.repeat(60);
  const f = fold(long).split('\r\n');
  assert.ok(f.length > 1 && f.slice(1).every(l => l.startsWith(' ')));
  assert.ok(f.every(l => Buffer.byteLength(l) <= 75));
  assert.equal(f.map((l, i) => (i ? l.slice(1) : l)).join(''), long);
});

// Habcore Gym (kl18): the owner's report (Apple Calendar): Tue 24 "dumbbell Upper", Thu 26 nothing, Sat 28 "flame FBW".
// His document's shape: no weekly plan, two days picked (Upper on 24, FBW on 28) with icon names in `emoji`, a workout
// on 24 (Upper, logged in seconds) and a trainer's old-style entry on 26 (start = end, no plan), a feed made with
// finished workouts off, no time zone on the profile.
const unf = x => x.replace(/\r\n /g, '');
test('the owner\'s week: done days as "✓ name" at their time, the plan only ahead and not done, no icon, Polish', () => {
  const now = Date.parse('2026-11-28T09:00:00Z');
  const D = {
    lang: 'pl', unit: 'kg', week: {}, reminder: { on: false, tz: null },
    routines: [{ id: 'up', name: 'Upper', emoji: 'dumbbell', ex: [{}, {}, {}] }, { id: 'lo', name: 'Lower', emoji: 'legs', ex: [{}] }, { id: 'fbw', name: 'FBW', emoji: 'flame', ex: [{}, {}] }],
    dayPlan: { '2026-11-24': 'up', '2026-11-28': 'fbw', '2026-11-30': 'lo' },
    workouts: [
      { id: 'w24', d: '2026-11-24', name: 'Wtorek', routineIds: ['up'], routineId: 'up', start: Date.parse('2026-11-24T16:00:00Z'), end: Date.parse('2026-11-24T17:10:00Z'), entries: [{ id: '0025', sets: [{ w: 50, r: 10, done: true }, { w: 50, r: 10, done: true }] }] },
      { id: 'tw26', d: '2026-11-26', name: 'Lower', routineIds: [], start: Date.parse('2026-11-26T12:00:00Z'), end: Date.parse('2026-11-26T12:00:00Z'), entries: [{ id: '0026', sets: [{ w: 100, r: 5, done: true }] }] },
    ],
  };
  const ev = events(unf(buildIcs(D, { uid: 'o', now, done: true, tz: D.reminder.tz })));
  const sum = ev.map(e => (e.DTSTART || e['DTSTART;VALUE=DATE']) + ' ' + e.SUMMARY);
  assert.deepEqual(sum, ['20261124T160000Z ✓ Upper', '20261126T120000Z ✓ Lower', '20261128 FBW', '20261130 Lower']);
  const tue = ev[0];
  assert.equal(tue.DTEND, '20261124T171000Z', 'its real end');
  assert.equal(tue.DESCRIPTION, 'Czas: 1 h 10 min\\nObjętość: 1\u00a0000 kg\\nSerie: 2\\nĆwiczenia: 1');
  assert.equal(ev[1].DTEND, '20261126T130000Z', 'no length logged: an hour');
  assert.match(ev[1].DESCRIPTION, /^Czas: bez zapisanego czasu\\n/);
  for (const e of ev) assert.doesNotMatch(e.SUMMARY, /dumbbell|flame|legs/);
  // Saturday done later: only the workout stays.
  const sat = { ...D, workouts: [...D.workouts, { id: 'w28', d: '2026-11-28', routineIds: ['fbw'], start: now - 3600000, end: now - 60000, entries: [] }] };
  const ev2 = events(unf(buildIcs(sat, { uid: 'o', now, done: true })));
  assert.ok(ev2.some(e => e.SUMMARY === '✓ FBW')); assert.ok(!ev2.some(e => e.SUMMARY === 'FBW'));
  // Finished workouts off: done days are still not shown as plans.
  const ev3 = events(unf(buildIcs(D, { uid: 'o', now, done: false })));
  assert.deepEqual(ev3.map(e => e.SUMMARY), ['FBW', 'Lower']);
  // English profile: English words.
  assert.match(buildIcs({ ...D, lang: 'en' }, { uid: 'o', now, done: true }), /DESCRIPTION:Time: 1 h 10 min/);
});
