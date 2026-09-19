"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { COLORS, TOTAL, names, strip, symbols } from './model.js';
import "./styles.css";

const ROW_HEIGHT = 30;
const MAX_ROWS = 9; // 3 carte x 3 righe per striscia (lengths[k]-1=1 -> 3^1=3 per carta)
// Stesso dominio di R22 (2 strisce da 2 posizioni, 3 colori, 81 combinazioni).
// La vincitrice e i 3 (o 4) indizi sono generati casualmente ad ogni partita
// (vedi generatePuzzle): si prova una vincitrice, si generano indizi casuali
// e si tengono solo quelli che, applicati in ordine di valore decrescente,
// restringono le combinazioni compatibili fino a un'unica sopravvissuta —
// esattamente la vincitrice scelta. Se una vincitrice non produce un set di
// indizi che convergono, se ne prova un'altra.

function allTickets() {
  const res = [];
  function visit(pos, t) {
    if (pos === TOTAL) { res.push([...t]); return; }
    for (const s of symbols) visit(pos + 1, [...t, s]);
  }
  visit(0, []);
  return res;
}
const UNIVERSE = allTickets();

function randomTicket() {
  return Array.from({ length: TOTAL }, () => symbols[Math.floor(Math.random() * 3)]);
}

// Quante delle 81 combinazioni totali restano compatibili con UN SOLO indizio
// che dichiari quel valore (calcolato una volta: C(4,valore) * 2^(4-valore)).
// Curiosamente non e' monotono: valore 1 e' il MENO restrittivo di tutti
// (32 combinazioni compatibili), meno perfino di valore 0 (16).
const COMPAT_BY_VALORE = { 0: 16, 1: 32, 2: 24, 3: 8 };

// Difficolta' stimata da due fattori: quanto restringe il migliore indizio da
// solo (piu' e' piccolo quel numero, piu' facile e' partire) e quanti indizi
// bisogna incrociare in tutto (piu' ce ne sono, piu' lavoro mentale servono).
function computeDifficulty(clues) {
  const peak = Math.min(...clues.map(c => COMPAT_BY_VALORE[c.valore]));
  const raw = peak + (clues.length - 2) * 4; // ~8 (facilissimo) .. ~40 (difficilissimo)
  const score = Math.max(1, Math.min(10, Math.round(1 + 9 * (raw - 8) / 32)));
  const label = score <= 2 ? 'Facilissima' : score <= 4 ? 'Facile' : score <= 6 ? 'Media' : score <= 8 ? 'Difficile' : 'Difficilissima';
  return label;
}

const DIFFICULTY_COLORS = {
  Facilissima: '#2e7d32',
  Facile: '#8bc34a',
  Media: '#d4a017',
  Difficile: '#e08e2d',
  Difficilissima: '#c0392b',
};

function generatePuzzle() {
  for (let attempt = 0; attempt < 500; attempt++) {
    const winner = randomTicket();
    const seen = new Set(); const guesses = [];
    for (let i = 0; i < 40; i++) {
      const g = randomTicket();
      const key = g.join('');
      if (key === winner.join('') || seen.has(key)) continue;
      seen.add(key);
      const valore = g.filter((s, idx) => s === winner[idx]).length;
      guesses.push({ guess: g, valore });
    }
    // Mischiamo invece di ordinare per valore decrescente: ordinando sempre dal
    // punteggio piu' alto, su un pool di 40 tentativi quasi certamente esiste
    // un indizio con 3 corrispondenze (l'unico punteggio praticamente
    // raggiungibile, dato che 4 equivarrebbe a indovinare subito), e quello
    // veniva scelto per primo quasi ogni partita: risultato, indizi sempre
    // troppo simili e poco vari. Mischiando, i punteggi restano vari (0-3).
    for (let i = guesses.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [guesses[i], guesses[j]] = [guesses[j], guesses[i]];
    }
    let survivors = UNIVERSE; const chosen = [];
    for (const g of guesses) {
      const next = survivors.filter(t => t.filter((s, idx) => s === g.guess[idx]).length === g.valore);
      if (next.length < survivors.length || chosen.length === 0) { chosen.push(g); survivors = next; }
      if (survivors.length === 1) break;
      if (chosen.length >= 4) break;
    }
    if (survivors.length === 1 && survivors[0].join('') === winner.join('')) {
      const clues = chosen.map((c, i) => ({ id: 'C' + (i + 1), valore: c.valore, guess: c.guess }));
      return { winner, clues, difficulty: computeDifficulty(clues) };
    }
  }
  return null;
}

function Swatch({ value, matches, size = 22 }) {
  return <span style={{ display: 'inline-flex', gap: 4 }}>{value.map((s, i) => {
    const on = matches && matches[i];
    return <span key={i} style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: COLORS[s].hex, boxSizing: 'border-box',
      border: on ? '3px solid #1f6f4a' : '1px solid #0002',
      boxShadow: on ? '0 0 0 1px #1f6f4a55' : 'none'
    }} />;
  })}</span>;
}

function ClueInfo({ clue }) {
  return <div style={{ flex: '1 1 130px', padding: 12, borderRadius: 10, background: '#f1f0ea', textAlign: 'center' }}>
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#55625a' }}><strong>{clue.valore}</strong> colori nella giusta posizione</span>
    </div>
    <Swatch value={clue.guess} size={20} />
  </div>;
}

function arrowStyle(locked, bg, shadow, size, fontSize) {
  return {
    width: size, height: size, borderRadius: '50%', border: 'none',
    background: locked ? '#c9cec4' : bg,
    color: '#fff', fontSize, fontWeight: 800, lineHeight: 1,
    cursor: locked ? 'default' : 'pointer',
    boxShadow: locked ? 'none' : `0 4px 0 ${shadow}`,
    opacity: locked ? 0.7 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto'
  };
}

export default function Page() {
  const [puzzle, setPuzzle] = useState(null);
  const [pos, setPos] = useState(() => names.map(() => 0));
  const [dir, setDir] = useState(() => names.map(() => null));
  const [attempts, setAttempts] = useState([]);
  const [barred, setBarred] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPuzzle(generatePuzzle()), 0);
    return () => clearTimeout(t);
  }, []);

  const mergedByCol = useMemo(() => names.map((_, k) => [0, 1, 2].flatMap(r => strip(k, r))), []);

  if (!puzzle) {
    return <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px', fontFamily: 'system-ui,sans-serif', color: '#2b332e', position: 'relative' }}>
      <div className="score" style={{ position: 'absolute', top: 20, right: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#64796b', fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#284f43', lineHeight: 1 }}>{score}</div>
      </div>
      <p style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700, color: '#64796b', margin: 0 }}>Baby Mastermind</p>
      <h1 style={{ fontSize: 26, margin: '4px 0 6px', textAlign: 'center' }}>Trova la combinazione vincente</h1>
      <p style={{ color: '#55625a', fontSize: 14 }}>Preparazione della partita…</p>
    </main>;
  }

  const clues = puzzle.clues;
  const guess = names.map((_, k) => mergedByCol[k][pos[k]]);
  const guessFlat = names.flatMap((_, k) => guess[k]);

  const won = !barred && attempts.some(a => a.ok);
  const locked = won || barred;
  const lastAttempt = attempts[attempts.length - 1];
  const misses = attempts.filter(a => !a.ok).length;
  const lastFailedAttempt = [...attempts].reverse().find(a => !a.ok);
  const isCriticalNext = attempts.length === 0 && !won;

  function move(k, delta) {
    if (locked) return;
    setPos(p => p.map((v, i) => i === k ? (v + delta + MAX_ROWS) % MAX_ROWS : v));
    setDir(d => d.map((v, i) => i === k ? (delta > 0 ? 'up' : 'down') : v));
  }

  function swap(k) {
    if (locked) return;
    const [a, b] = mergedByCol[k][pos[k]];
    const target = mergedByCol[k].findIndex(r => r[0] === b && r[1] === a);
    if (target >= 0) setPos(p => p.map((v, i) => i === k ? target : v));
  }

  function swapColumns() {
    if (locked) return;
    setPos(p => [p[1], p[0]]);
  }

  function verify() {
    if (locked) return;
    const perClue = clues.map(clue => {
      const matches = guessFlat.filter((s, i) => s === clue.guess[i]).length;
      return { id: clue.id, matches, ok: matches === clue.valore };
    });
    const ok = perClue.every(p => p.ok);
    const nextAttempts = [...attempts, { guessFlat, perClue, ok }];
    if (ok) {
      setScore(s => s + 1);
    } else if (nextAttempts.filter(a => !a.ok).length >= 2) {
      setBarred(true);
      setScore(0);
    }
    setAttempts(nextAttempts);
  }

  function resetGame() {
    setPuzzle(generatePuzzle());
    setPos(names.map(() => 0));
    setAttempts([]);
    setBarred(false);
  }

  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px', fontFamily: 'system-ui,sans-serif', color: '#2b332e', position: 'relative' }}>
    <div className="score" style={{ position: 'absolute', top: 20, right: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#64796b', fontWeight: 700, letterSpacing: 1 }}>SCORE</div>
      <div style={{ fontSize: 36, fontWeight: 800, color: '#284f43', lineHeight: 1 }}>{score}</div>
    </div>
    <style>{`
      @keyframes r23SlideDown { from { transform: translateY(-${ROW_HEIGHT}px); } to { transform: translateY(0); } }
      @keyframes r23SlideUp { from { transform: translateY(${ROW_HEIGHT}px); } to { transform: translateY(0); } }
    `}</style>
    <p style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700, color: '#64796b', margin: 0 }}>Baby Mastermind</p>
    <h1 style={{ fontSize: 26, margin: '4px 0 6px', textAlign: 'center' }}>Trova la combinazione vincente</h1>
    <p style={{ margin: '0 0 14px', color: '#55625a', fontSize: 14 }}>
      Questi sono gli indizi. Ragiona su di loro prima di muovere le strisce: esiste esattamente <strong>1</strong> combinazione compatibile con tutti.
    </p>

    <div className="clues" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      {clues.map(clue => <ClueInfo key={clue.id} clue={clue} />)}
    </div>

    {isCriticalNext && <div style={{ padding: '12px 16px', background: '#fdf3d9', border: '2px solid #bc8f44', borderRadius: 10, marginBottom: 16, fontSize: 14, textAlign: 'center' }}>
      Trova l'unica combinazione valida al primo colpo.
      <div style={{ marginTop: 4, fontSize: 13, color: '#6b5a2e' }}>Difficoltà: <strong style={{ background: '#e3e0d6', color: DIFFICULTY_COLORS[puzzle.difficulty], padding: '2px 8px', borderRadius: 6 }}>{puzzle.difficulty}</strong></div>
    </div>}

    {misses === 1 && !barred && !won && <div style={{ padding: '12px 16px', background: '#fdf3d9', border: '2px solid #bc8f44', borderRadius: 10, marginBottom: 16, fontSize: 14, textAlign: 'center' }}>
      Hai sbagliato ma ti do un'altra possibilità.
    </div>}

    {barred && !won && <div style={{ padding: '12px 16px', background: '#f6e6e3', border: '2px solid #b0463c', borderRadius: 10, marginBottom: 16, fontSize: 14, color: '#b0463c', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      <span>Hai sbagliato, ritenta</span>
      <button onClick={resetGame} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #b0463c', background: '#fff', color: '#b0463c', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        Ricomincia
      </button>
    </div>}

    {lastFailedAttempt && !won && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16, fontSize: 13, color: '#55625a' }}>
      <span>Tentativo non riuscito:</span>
      <Swatch value={lastFailedAttempt.guessFlat} size={18} />
    </div>}

    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      {[0, 1].map(k => {
        const rows = mergedByCol[k];
        const prevIdx = (pos[k] - 1 + MAX_ROWS) % MAX_ROWS;
        const nextIdx = (pos[k] + 1) % MAX_ROWS;
        const swapBtn = <button onClick={() => swap(k)} disabled={locked} title="Scambia le due palline" style={arrowStyle(locked, '#8a7a8a', '#6b5e6b', 34, 15)}>⇄</button>;
        return <React.Fragment key={names[k]}>
          {k === 1 && <button onClick={swapColumns} disabled={locked} title="Scambia le due strisce" style={{ ...arrowStyle(locked, '#8a7a8a', '#6b5e6b', 54, 24), alignSelf: 'center', margin: 0 }}>⇄</button>}
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {k === 0 && swapBtn}
              <div style={{ width: 78 }}>
                <div style={{ margin: '8px 0' }}>
                  <button onClick={() => move(k, 1)} disabled={locked} style={arrowStyle(locked, '#6d7b8a', '#525d69', 46, 22)}>↑</button>
                </div>
                <div style={{
                  height: ROW_HEIGHT * 3, width: 78, border: '2px solid #bc8f44', borderRadius: 10, background: '#fffdf4',
                  overflow: 'hidden', boxShadow: 'inset 0 0 0 4px #fdf7e6'
                }}>
                  <div key={`${pos[k]}-${dir[k]}`} style={dir[k] ? { animation: `${dir[k] === 'up' ? 'r23SlideUp' : 'r23SlideDown'} .18s ease-out` } : undefined}>
                    <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
                      <Swatch value={rows[prevIdx]} size={20} />
                    </div>
                    <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px dashed #e3d3a0', borderBottom: '1px dashed #e3d3a0', background: '#fdf3d955' }}>
                      <Swatch value={rows[pos[k]]} size={28} />
                    </div>
                    <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
                      <Swatch value={rows[nextIdx]} size={20} />
                    </div>
                  </div>
                </div>
                <div style={{ margin: '8px 0' }}>
                  <button onClick={() => move(k, -1)} disabled={locked} style={arrowStyle(locked, '#6d7b8a', '#525d69', 46, 22)}>↓</button>
                </div>
              </div>
              {k === 1 && swapBtn}
            </div>
          </div>
        </React.Fragment>;
      })}
    </div>

    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <button onClick={verify} disabled={locked} style={{
        padding: '16px 48px', borderRadius: 12, border: 'none',
        background: locked ? '#c5ccc1' : '#284f43', color: '#fff', cursor: locked ? 'default' : 'pointer', fontSize: 18, fontWeight: 700, boxShadow: locked ? 'none' : '0 4px 12px #284f4340'
      }}>
        Verifica
      </button>
    </div>

    {won && <div style={{ padding: 20, background: '#e1efe3', border: '2px solid #284f43', borderRadius: 10, textAlign: 'center' }}>
      <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#284f43' }}>Hai trovato la combinazione vincente!</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 14 }}>
        {lastAttempt.guessFlat.map((s, k) => <Swatch key={k} value={[s]} size={30} />)}
      </div>
      <button onClick={resetGame} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#284f43', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        Nuova partita
      </button>
    </div>}
    <footer className="projects-footer">
      <a href="https://links-page-bennibeni.vercel.app/">
        &larr; All projects
      </a>
    </footer>
  </main>;
}
