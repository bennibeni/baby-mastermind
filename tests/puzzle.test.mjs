import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIVERSE, COMPAT_BY_VALORE, compatible, hits, minimalClues, difficultyIndex, properties, labelOf, explain, generatePuzzle } from '../src/puzzle.js';

// Generatore ripetibile (mulberry32) per partite identiche a ogni esecuzione.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('La tabella COMPAT_BY_VALORE coincide con il conteggio sulle 81 combinazioni', () => {
  assert.equal(UNIVERSE.length, 81);
  const guess = ['R', 'G', 'B', 'R'];
  for (const [v, n] of Object.entries(COMPAT_BY_VALORE)) assert.equal(UNIVERSE.filter(t => hits(t, guess) === Number(v)).length, n);
});

test('minimalClues toglie l’indizio ridondante (esempio reale: C3 non serviva)', () => {
  const winner = ['G', 'G', 'R', 'G'];
  const clue = (id, g) => ({ id, guess: g.split(''), valore: hits(g.split(''), winner) });
  const clues = [clue('C1', 'RRRR'), clue('C2', 'GGGG'), clue('C3', 'RGGB'), clue('C4', 'RBGB')];
  assert.deepEqual(clues.map(c => c.valore), [1, 3, 1, 0]);
  assert.equal(compatible(clues).length, 1);
  const min = minimalClues(clues);
  assert.deepEqual(min.map(c => c.id), ['C1', 'C2', 'C4']);
  assert.deepEqual(compatible(min)[0], winner);
});

test('2.000 partite: soluzione unica, nessun indizio superfluo, spiegazione coerente con il punteggio', () => {
  const random = rng(42), counts = {};
  for (let i = 0; i < 2000; i++) {
    const p = generatePuzzle(random);
    assert.ok(p);
    const sol = compatible(p.clues);
    assert.equal(sol.length, 1); assert.deepEqual(sol[0], p.winner);
    for (let k = 0; k < p.clues.length; k++) assert.ok(compatible(p.clues.filter((_, j) => j !== k)).length > 1, 'indizio superfluo');
    const d = p.difficulty;
    assert.ok(Math.abs(d.index - (1 + d.factors.reduce((t, f) => t + f.points, 0))) < 1e-12, 'indice = 1 + somma delle voci');
    assert.equal(d.index, difficultyIndex(p.clues).index);
    assert.equal(d.label, labelOf(d.index));
    assert.ok(Number.isFinite(d.index) && d.index > -1 && d.index < 14);
    assert.equal(d.path.chain.at(-1), 1); assert.equal(d.path.chain[0], 81);
    assert.equal(d.path.order.length, p.clues.length);
    assert.ok(d.before.length >= 3 && d.before.every(t => t.length > 20));
    counts[d.label] = (counts[d.label] || 0) + 1;
  }
  console.log('etichette su 2.000 partite:', counts);
});

test('Spiegazione: prima della soluzione non nomina il percorso', () => {
  const p = generatePuzzle(rng(7));
  const e = explain(p.clues);
  assert.ok(!e.before.join(' ').includes('→'));
  assert.match(e.after, /Percorso più rapido: C\d/);
});

test('Formula B: voci attese su un caso controllato a mano', () => {
  const winner = ['G', 'G', 'R', 'G'];
  const clue = (id, g) => ({ id, guess: g.split(''), valore: hits(g.split(''), winner) });
  const clues = [clue('C1', 'RRRR'), clue('C2', 'GGGG'), clue('C4', 'RBGB')];   // valori 1, 3, 0
  const p = properties(clues);
  assert.deepEqual({ peak: p.peak, n: p.n, casi: p.casi, zeri: p.zeri, mono: p.mono, vicini: p.vicini }, { peak: 8, n: 3, casi: 4 + 4 + 1, zeri: 1, mono: 2, vicini: 0 });
  const d = difficultyIndex(clues), pts = Object.fromEntries(d.factors.map(f => [f.key, f.points]));
  assert.equal(pts.partenza, 0); assert.equal(pts.incrocio, 1.5);
  assert.ok(Math.abs(pts.casi - 2.5 * Math.log2(9 / 2) / Math.log2(12)) < 1e-12);
  assert.equal(pts.zeri, -1); assert.equal(pts.mono, -1.5);      // rendimenti decrescenti: 1 + 0,5
  assert.equal(pts.vicini, -0);
});

test('Non linearità: il 2º aiuto vale meno del 1º, le ipotesi pesano in scala logaritmica', () => {
  const a = difficultyIndex([{ guess: ['R','R','R','R'], valore: 0 }, { guess: ['G','G','G','G'], valore: 3 }]);
  const b = difficultyIndex([{ guess: ['R','R','R','R'], valore: 0 }, { guess: ['B','B','B','B'], valore: 0 }, { guess: ['G','G','G','G'], valore: 3 }]);
  const za = a.factors.find(f => f.key === 'zeri').points, zb = b.factors.find(f => f.key === 'zeri').points;
  assert.equal(za, -1); assert.equal(zb, -1.5);
  const casi = n => 2.5 * Math.log2(n / 2) / Math.log2(12);
  assert.ok(casi(4) - casi(2) > 5 * (casi(22) - casi(20)));
});
