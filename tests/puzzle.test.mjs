import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIVERSE, COMPAT_BY_VALORE, compatible, hits, minimalClues, computeDifficulty, explain, generatePuzzle } from '../src/puzzle.js';

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
    assert.deepEqual({ score: d.score, label: d.label }, (({ score, label }) => ({ score, label }))(computeDifficulty(p.clues)));
    assert.equal(d.factors.reduce((s, f) => s + f.points, 0) + 8, d.raw);
    assert.equal(d.path.chain.at(-1), 1); assert.equal(d.path.chain[0], 81);
    assert.equal(d.path.order.length, p.clues.length);
    assert.ok(d.before.length >= 2 && d.before.every(t => t.length > 20));
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
