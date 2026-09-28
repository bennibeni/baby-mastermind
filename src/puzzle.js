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

const C4 = [1, 4, 6, 4, 1];   // C(4, valore): in quanti modi si scelgono le posizioni giuste
// Rendimenti decrescenti: il primo aiuto di un tipo vale 1, il secondo mezzo, il terzo un quarto.
const diminishing = k => [0, 1, 1.5, 1.75, 1.875][Math.min(k, 4)];

/** Le proprietà della posizione che entrano nella difficoltà. */
export function properties(clues) {
  const best = clues.reduce((a, c) => (COMPAT_BY_VALORE[c.valore] < COMPAT_BY_VALORE[a.valore] ? c : a));
  let vicini = 0;
  for (let a = 0; a < clues.length; a++) for (let b = a + 1; b < clues.length; b++)
    if (clues[a].guess.filter((s, k) => s !== clues[b].guess[k]).length === 1) vicini++;
  return {
    best,
    peak: COMPAT_BY_VALORE[best.valore],                               // combinazioni dopo l'indizio migliore
    n: clues.length,                                                   // indizi da incrociare
    casi: clues.reduce((s, c) => s + C4[c.valore], 0),                 // ipotesi da esaminare
    zeri: clues.filter(c => c.valore === 0).length,                    // indizi a valore 0
    mono: clues.filter(c => new Set(c.guess).size === 1).length,       // indizi monocolore
    vicini,                                                            // coppie che differiscono in una sola posizione
  };
}

/**
 * Indice di difficoltà CONTINUO (nessun arrotondamento, nessun limite): 1 + somma delle voci.
 * Le voci positive rendono più difficile, le negative sono aiuti. Due scelte non lineari:
 * - le ipotesi da esaminare pesano in scala logaritmica (da 2 a 4 è un salto, da 20 a 22 quasi nulla);
 * - gli aiuti dello stesso tipo hanno rendimenti decrescenti.
 */
export function difficultyIndex(clues) {
  const p = properties(clues);
  const factors = [
    { key: 'partenza', label: 'Punto di partenza', detail: `${p.peak} combinazioni dopo l’indizio migliore`, points: (p.peak - 8) / 4 },
    { key: 'incrocio', label: 'Indizi da incrociare', detail: `${p.n} indizi`, points: (p.n - 2) * 1.5 },
    { key: 'casi', label: 'Ipotesi da esaminare', detail: `${p.casi} in tutto`, points: 2.5 * Math.log2(p.casi / 2) / Math.log2(12) },
    { key: 'zeri', label: 'Indizi a valore 0', detail: p.zeri ? `${p.zeri}: escludono un colore da ogni posizione` : 'nessuno', points: -diminishing(p.zeri) },
    { key: 'mono', label: 'Indizi monocolore', detail: p.mono ? `${p.mono}: si leggono al volo` : 'nessuno', points: -diminishing(p.mono) },
    { key: 'vicini', label: 'Indizi quasi uguali', detail: p.vicini ? `${p.vicini} ${p.vicini === 1 ? 'coppia' : 'coppie'} diverse in una sola posizione` : 'nessuna coppia', points: -0.75 * diminishing(p.vicini) },
  ];
  const index = 1 + factors.reduce((s, f) => s + f.points, 0);
  return { index, label: labelOf(index), factors, props: p };
}

// Soglie scelte sulla distribuzione delle partite generate: circa 21/30/16/21/12%.
export const LABEL_THRESHOLDS = [[3.25, 'Facilissima'], [4.5, 'Facile'], [6, 'Media'], [9, 'Difficile'], [Infinity, 'Difficilissima']];
export const labelOf = index => LABEL_THRESHOLDS.find(([t]) => index < t)[1];

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
 * Spiegazione in italiano. `before` non rivela nulla che non si veda già negli indizi;
 * `after` aggiunge il percorso più rapido, da mostrare a partita chiusa.
 */
export function explain(clues) {
  const d = difficultyIndex(clues), p = d.props;
  const start = p.peak <= 8 ? 'un ottimo punto di partenza' : p.peak <= 16 ? 'un buon punto di partenza' : p.peak <= 24 ? 'un punto di partenza debole' : 'quasi nessun aiuto per partire';
  const ties = clues.filter(c => c.valore === p.best.valore).length;
  const before = [
    `L’indizio più stretto ha ${p.best.valore} ${p.best.valore === 1 ? 'colore' : 'colori'} al posto giusto: da solo lascia ${p.peak} combinazioni su ${UNIVERSE.length}, ${start}${ties > 1 ? ` (ce ne sono ${ties} così)` : ''}.`,
    p.n === 2 ? 'Bastano 2 indizi da incrociare.' : `Bisogna incrociare tutti e ${p.n} gli indizi: nessuno è superfluo.`,
    `Le ipotesi da esaminare sono ${p.casi}: un indizio con 2 colori giusti ne apre 6, uno con 1 o 3 ne apre 4, uno con 0 una sola.`,
  ];
  if (p.zeri) before.push(p.zeri === 1 ? 'L’indizio a valore 0 è prezioso: esclude un colore da ogni posizione.' : `Gli indizi a valore 0 sono ${p.zeri}: il primo aiuta molto, i successivi un po’ meno perché ripetono in parte le stesse esclusioni.`);
  if (p.mono) before.push(`${p.mono === 1 ? 'C’è un indizio monocolore' : `Ci sono ${p.mono} indizi monocolore`}: si leggono al volo (per esempio «3 giusti» su quattro gialli vuol dire esattamente tre gialli).`);
  if (p.vicini) before.push(`${p.vicini === 1 ? 'Due indizi differiscono' : `${p.vicini} coppie di indizi differiscono`} in una sola posizione: confrontandoli si capisce subito il colore di quella posizione.`);
  const path = bestPath(clues);
  const after = `Percorso più rapido: ${path.order.join(' → ')}. Combinazioni rimaste: ${path.chain.join(' → ')}.`;
  return { ...d, before, after, path };
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
