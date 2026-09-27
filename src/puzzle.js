// Logica del puzzle, separata dall'interfaccia: generazione, riduzione agli indizi
// necessari, difficoltà e spiegazione. Nessuna dipendenza da React: si prova con `npm test`.
import { TOTAL, symbols } from './model.js';

function allTickets() {
  const res = [];
  (function visit(pos, t) {
    if (pos === TOTAL) { res.push(t); return; }
    for (const s of symbols) visit(pos + 1, [...t, s]);
  })(0, []);
  return res;
}
export const UNIVERSE = allTickets();   // 3^4 = 81 combinazioni

export const hits = (a, b) => a.filter((s, i) => s === b[i]).length;
const randomTicket = (random) => Array.from({ length: TOTAL }, () => symbols[Math.floor(random() * 3)]);

/** Combinazioni compatibili con tutti gli indizi dati. */
export const compatible = (clues, universe = UNIVERSE) => universe.filter(t => clues.every(c => hits(t, c.guess) === c.valore));

// Quante delle 81 combinazioni restano compatibili con UN SOLO indizio di quel valore:
// C(4,valore) · 2^(4-valore). Non è monotono: valore 1 è il meno restrittivo (32).
export const COMPAT_BY_VALORE = { 0: 16, 1: 32, 2: 24, 3: 8 };

/**
 * Il sottoinsieme più piccolo di indizi che lascia una sola combinazione, nell'ordine originale.
 * Con al massimo 4 indizi basta provare i sottoinsiemi per dimensione crescente (15 casi).
 * Ogni indizio è vero per la vincitrice, quindi «una sola compatibile» significa «la vincitrice».
 */
export function minimalClues(clues) {
  const n = clues.length;
  for (let size = 1; size <= n; size++) {
    for (let mask = 1; mask < 1 << n; mask++) {
      if (popcount(mask) !== size) continue;
      const subset = clues.filter((_, i) => mask & (1 << i));
      if (compatible(subset).length === 1) return subset;
    }
  }
  return clues;
}
const popcount = m => { let c = 0; for (; m; m &= m - 1) c++; return c; };

/**
 * Difficoltà da due fattori: quanto restringe l'indizio migliore da solo (punto di partenza)
 * e quanti indizi bisogna incrociare. Restituisce anche i singoli contributi, per spiegarla.
 */
export function computeDifficulty(clues) {
  const best = clues.reduce((a, c) => (COMPAT_BY_VALORE[c.valore] < COMPAT_BY_VALORE[a.valore] ? c : a));
  const peak = COMPAT_BY_VALORE[best.valore];
  const extra = (clues.length - 2) * 4;
  const raw = peak + extra;                              // 8 (facilissimo) .. 40 (difficilissimo)
  const score = Math.max(1, Math.min(10, Math.round(1 + 9 * (raw - 8) / 32)));
  const label = score <= 2 ? 'Facilissima' : score <= 4 ? 'Facile' : score <= 6 ? 'Media' : score <= 8 ? 'Difficile' : 'Difficilissima';
  return { score, label, raw, peak, extra, best };
}

/** Percorso migliore: a ogni passo l'indizio che lascia meno combinazioni. */
export function bestPath(clues) {
  let used = [], left = [...clues];
  const chain = [UNIVERSE.length];
  while (left.length && compatible(used).length > 1) {
    let pick = null;
    for (const c of left) { const n = compatible([...used, c]).length; if (!pick || n < pick.n) pick = { c, n }; }
    used.push(pick.c); left = left.filter(c => c !== pick.c); chain.push(pick.n);
  }
  return { order: used.map(c => c.id), chain };
}

/**
 * Spiegazione in italiano. `before` non rivela nulla che non si veda già negli indizi
 * (valore migliore e numero di indizi); `after` aggiunge il percorso, da mostrare a partita chiusa.
 */
export function explain(clues) {
  const d = computeDifficulty(clues);
  const n = clues.length;
  const start = d.peak <= 8 ? 'un ottimo punto di partenza' : d.peak <= 16 ? 'un buon punto di partenza' : d.peak <= 24 ? 'un punto di partenza debole' : 'quasi nessun aiuto per partire';
  const ties = clues.filter(c => c.valore === d.best.valore).length;
  const before = [
    `L’indizio più stretto ha ${d.best.valore} ${d.best.valore === 1 ? 'colore' : 'colori'} al posto giusto: da solo lascia ${d.peak} combinazioni su ${UNIVERSE.length}, ${start}${ties > 1 ? ` (ce ne sono ${ties} così)` : ''}.`,
    n === 2 ? 'Bastano 2 indizi da incrociare.' : `Bisogna incrociare tutti e ${n} gli indizi: nessuno è superfluo.`,
  ];
  if (d.best.valore === 0) before.push('Un indizio con 0 colori giusti è prezioso: esclude un colore da ogni posizione.');
  const path = bestPath(clues);
  const after = `Percorso più rapido: ${path.order.join(' → ')}. Combinazioni rimaste: ${path.chain.join(' → ')}.`;
  return { ...d, factors: [
    { label: 'Punto di partenza', detail: `${d.peak} combinazioni dopo l’indizio migliore`, points: d.peak - 8, max: 24 },
    { label: 'Indizi da incrociare', detail: `${n} indizi`, points: d.extra, max: 8 },
  ], before, after, path };
}

/**
 * Genera una partita: vincitrice casuale, indizi casuali tenuti solo se restringono,
 * poi ridotti al minimo necessario. `random` è iniettabile per i test.
 */
export function generatePuzzle(random = Math.random) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const winner = randomTicket(random);
    const seen = new Set(); const guesses = [];
    for (let i = 0; i < 40; i++) {
      const g = randomTicket(random);
      const key = g.join('');
      if (key === winner.join('') || seen.has(key)) continue;
      seen.add(key);
      guesses.push({ guess: g, valore: hits(g, winner) });
    }
    // Mischiati invece che ordinati per valore: altrimenti quasi sempre il primo indizio avrebbe 3 corrispondenze.
    for (let i = guesses.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [guesses[i], guesses[j]] = [guesses[j], guesses[i]];
    }
    let survivors = UNIVERSE; const chosen = [];
    for (const g of guesses) {
      const next = survivors.filter(t => hits(t, g.guess) === g.valore);
      if (next.length < survivors.length || chosen.length === 0) { chosen.push(g); survivors = next; }
      if (survivors.length === 1) break;
      if (chosen.length >= 4) break;
    }
    if (survivors.length === 1 && survivors[0].join('') === winner.join('')) {
      // Via gli indizi ridondanti: in circa un terzo delle partite uno degli indizi scelti non serviva.
      const clues = minimalClues(chosen).map((c, i) => ({ id: 'C' + (i + 1), valore: c.valore, guess: c.guess }));
      return { winner, clues, difficulty: explain(clues) };
    }
  }
  return null;
}
