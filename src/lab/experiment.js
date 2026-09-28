// Esperimento del laboratorio: genera posizioni, le divide 80/20, addestra i modelli sull'80%
// e misura sul 20% quale restituisce meglio l'indice di difficoltà dell'app, che resta una scatola nera.
import { generatePuzzle, compatible, labelOf } from '../puzzle.js';
import { rng, fitMean, fitLinear, fitTree, fitForest, fitNeural, treeRules } from './models.js';

/**
 * Proprietà di una posizione visibili al laboratorio. `formula: true` segna quelle che la formula
 * dell'app usa davvero: il laboratorio NON lo sa, serve solo alla pagina per il confronto finale.
 */
export const FEATURES = [
  { key: 'n', label: 'Numero di indizi', formula: true },
  { key: 'v0', label: 'Indizi a valore 0', formula: true },
  { key: 'v1', label: 'Indizi a valore 1' },
  { key: 'v2', label: 'Indizi a valore 2' },
  { key: 'v3', label: 'Indizi a valore 3' },
  { key: 'vmax', label: 'Valore massimo' },
  { key: 'vmin', label: 'Valore minimo' },
  { key: 'vsum', label: 'Somma dei valori' },
  { key: 'peak', label: 'Combinazioni dopo l’indizio migliore', formula: true },
  { key: 'coppia', label: 'Combinazioni dopo la coppia migliore' },
  { key: 'casi', label: 'Ipotesi da esaminare', formula: true },
  { key: 'mono', label: 'Indizi monocolore', formula: true },
  { key: 'vicini', label: 'Coppie di indizi quasi uguali', formula: true },
  { key: 'casuale', label: 'Colonna casuale (controllo)', continuous: true },
];

export const MODELS = [
  { key: 'media', label: 'Media (modello di base)' },
  { key: 'lineare', label: 'Regressione lineare' },
  { key: 'albero', label: 'Albero di regressione' },
  { key: 'foresta', label: 'Random Forest' },
  { key: 'rete', label: 'Rete neurale' },
];

/** Proprietà di una partita (solo ciò che si vede prima di giocare) + indice dell'app. */
export function describe(puzzle, random) {
  const c = puzzle.clues, d = puzzle.difficulty, p = d.props, vals = c.map(x => x.valore);
  // Minimo sulle coppie di indizi (NON su tutti gli indizi insieme, che lasciano sempre 1 combinazione).
  let coppia = Infinity;
  for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) coppia = Math.min(coppia, compatible([c[a], c[b]]).length);
  if (!Number.isFinite(coppia)) coppia = compatible(c).length;
  const count = v => vals.filter(x => x === v).length;
  return {
    props: { n: c.length, v0: count(0), v1: count(1), v2: count(2), v3: count(3), vmax: Math.max(...vals), vmin: Math.min(...vals), vsum: vals.reduce((s, x) => s + x, 0), peak: p.peak, coppia, casi: p.casi, mono: p.mono, vicini: p.vicini, casuale: random() },
    index: d.index, label: d.label, clues: c, factors: d.factors,
  };
}

export const OPTIONS = { size: [500, 2000, 5000, 10000], split: ['casuale', 'maiviste'], depth: [4, 6, 8, 12], trees: [30, 100], epochs: [40, 120, 300] };
export const DEFAULTS = { size: 2000, split: 'casuale', depth: 8, trees: 100, epochs: 120, seed: 1, hidden: [] };

export function validate(input) {
  const c = { ...DEFAULTS, ...input };
  for (const k of ['size', 'depth', 'trees', 'epochs']) if (!OPTIONS[k].includes(Number(c[k]))) throw new Error(`Valore non valido: ${k}.`);
  if (!OPTIONS.split.includes(c.split)) throw new Error('Tipo di divisione non valido.');
  const hidden = (c.hidden || []).filter(k => FEATURES.some(f => f.key === k));
  if (hidden.length >= FEATURES.length) throw new Error('Serve almeno una proprietà visibile.');
  return { size: Number(c.size), split: c.split, depth: Number(c.depth), trees: Number(c.trees), epochs: Number(c.epochs), seed: Number(c.seed) || 1, hidden };
}

const FORMULA_KEY = r => ['peak', 'n', 'casi', 'v0', 'mono', 'vicini'].map(k => r.props[k]).join(',');

/**
 * Divisione 80/20. «casuale»: posizioni estratte a caso. «maiviste»: si dividono le COMBINAZIONI di proprietà,
 * così nel 20% di prova ci sono solo combinazioni mai viste in addestramento (vera generalizzazione).
 */
export function split(rows, mode, random) {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (mode === 'casuale') { const idx = shuffle([...rows.keys()]), cut = Math.round(rows.length * 0.8); return { train: idx.slice(0, cut), test: idx.slice(cut) }; }
  const groups = new Map();
  rows.forEach((r, i) => { const k = FORMULA_KEY(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const keys = shuffle([...groups.keys()]), train = [], test = [];
  for (const k of keys) (test.length < rows.length * 0.2 ? test : train).push(...groups.get(k));
  return { train, test };
}

export function metrics(y, p) {
  const n = y.length, mean = y.reduce((s, v) => s + v, 0) / n;
  let ae = 0, se = 0, st = 0, close = 0, same = 0;
  for (let i = 0; i < n; i++) {
    const e = p[i] - y[i]; ae += Math.abs(e); se += e * e; st += (y[i] - mean) ** 2;
    if (Math.abs(e) <= 0.1) close++;
    if (labelOf(p[i]) === labelOf(y[i])) same++;
  }
  return { mae: ae / n, rmse: Math.sqrt(se / n), r2: st ? 1 - se / st : 0, entro01: close / n, stessaEtichetta: same / n };
}

/** Importanza per permutazione: di quanto cresce l'errore medio se una proprietà viene mescolata tra le posizioni di prova. */
function importance(model, X, y, names, random, repeats = 3) {
  const base = metrics(y, X.map(model.predict)).mae;
  return names.map((name, j) => {
    let d = 0;
    for (let r = 0; r < repeats; r++) {
      const perm = X.map(x => x[j]);
      for (let i = perm.length - 1; i > 0; i--) { const k = Math.floor(random() * (i + 1)); [perm[i], perm[k]] = [perm[k], perm[i]]; }
      d += metrics(y, X.map((x, i) => { const z = [...x]; z[j] = perm[i]; return model.predict(z); })).mae - base;
    }
    return { key: name.key, label: name.label, formula: !!name.formula, delta: d / repeats };
  }).sort((a, b) => b.delta - a.delta);
}

const it = (v, d = 2) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

export function run(input, progress = () => {}) {
  const cfg = validate(input), random = rng(cfg.seed), t0 = Date.now();
  progress(`Generazione di ${cfg.size.toLocaleString('it-IT')} posizioni…`);
  const rows = [];
  for (let i = 0; i < cfg.size; i++) rows.push(describe(generatePuzzle(random), random));
  const feats = FEATURES.filter(f => !cfg.hidden.includes(f.key));
  const X = rows.map(r => feats.map(f => r.props[f.key])), y = rows.map(r => r.index);
  const { train, test } = split(rows, cfg.split, random);
  const Xtr = train.map(i => X[i]), ytr = train.map(i => y[i]), Xte = test.map(i => X[i]), yte = test.map(i => y[i]);
  const seen = new Set(train.map(i => X[i].filter((_, j) => !feats[j].continuous).join(',')));
  const overlap = test.filter(i => seen.has(X[i].filter((_, j) => !feats[j].continuous).join(','))).length / test.length;

  const fitted = {}, results = [];
  let history = [];
  const fitters = {
    media: () => fitMean(Xtr, ytr),
    lineare: () => fitLinear(Xtr, ytr),
    albero: () => fitTree(Xtr, ytr, { maxDepth: cfg.depth }),
    foresta: () => fitForest(Xtr, ytr, { trees: cfg.trees, maxDepth: cfg.depth, seed: cfg.seed }),
    rete: () => fitNeural(Xtr, ytr, { epochs: cfg.epochs, seed: cfg.seed, onEpoch: (e, err) => { if (e % 10 === 0 || e === cfg.epochs) progress(`Rete neurale: epoca ${e} di ${cfg.epochs}, errore ${it(err, 3)}`); } }),
  };
  for (const m of MODELS) {
    progress(`Addestramento: ${m.label}…`);
    const s = Date.now(), model = fitters[m.key]();
    fitted[m.key] = model;
    if (m.key === 'rete') history = model.history;
    results.push({ key: m.key, label: m.label, seconds: (Date.now() - s) / 1000, train: metrics(ytr, Xtr.map(model.predict)), test: metrics(yte, Xte.map(model.predict)) });
  }
  const ranked = results.filter(r => r.key !== 'media').sort((a, b) => a.test.mae - b.test.mae);

  progress('Importanza delle proprietà…');
  const imp = {};
  for (const m of MODELS.filter(m => m.key !== 'media')) imp[m.key] = importance(fitted[m.key], Xte, yte, feats, random);

  const intFmt = (f, t) => (feats[f].continuous ? it(t) : String(Math.floor(t)));
  const lin = fitted.lineare;
  const sample = test.slice(0, 300);
  return {
    config: cfg, seconds: (Date.now() - t0) / 1000,
    counts: { total: rows.length, train: train.length, test: test.length, combosTrain: new Set(train.map(i => FORMULA_KEY(rows[i]))).size, combosTest: new Set(test.map(i => FORMULA_KEY(rows[i]))).size, overlap },
    features: feats.map(f => ({ key: f.key, label: f.label, formula: !!f.formula })),
    results, best: ranked[0].key, importance: imp,
    linear: { intercept: lin.intercept, coef: feats.map((f, j) => ({ key: f.key, label: f.label, formula: !!f.formula, value: lin.coef[j] })) },
    rules: treeRules(fitted.albero, feats.map(f => f.label.toLowerCase()), 3, v => it(v), intFmt),
    history,
    scatter: sample.map(i => ({ y: y[i], p: Object.fromEntries(MODELS.map(m => [m.key, fitted[m.key].predict(X[i])])) })),
    lens: test.slice(0, 24).map(i => ({ clues: rows[i].clues, index: y[i], label: rows[i].label, factors: rows[i].factors.map(f => ({ key: f.key, label: f.label, points: f.points })), props: rows[i].props, pred: Object.fromEntries(MODELS.map(m => [m.key, fitted[m.key].predict(X[i])])) })),
  };
}
