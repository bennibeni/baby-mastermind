// Modelli di REGRESSIONE per il laboratorio: imparano a restituire un numero (l'indice di difficoltà).
// Tutti in JavaScript puro, senza librerie: girano nel browser (in un Web Worker) e in Node per i test.

/** Generatore pseudo-casuale ripetibile (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ standardizzazione

/** Media e deviazione di ogni colonna, calcolate SOLO sui dati di addestramento. */
export function scaler(X) {
  const p = X[0].length, mean = new Array(p).fill(0), sd = new Array(p).fill(0);
  for (const x of X) for (let j = 0; j < p; j++) mean[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < p; j++) sd[j] += (x[j] - mean[j]) ** 2 / X.length;
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  return { mean, sd, apply: x => x.map((v, j) => (v - mean[j]) / sd[j]) };
}

// ------------------------------------------------------------------ media (modello di base)

export function fitMean(X, y) {
  const m = y.reduce((s, v) => s + v, 0) / y.length;
  return { type: 'media', predict: () => m, value: m };
}

// ------------------------------------------------------------------ regressione lineare

/** Risolve H w = g con Cholesky (H simmetrica definita positiva). */
function solve(H, g) {
  const p = g.length, L = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
    let s = H[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
  }
  const z = new Float64Array(p), w = new Float64Array(p);
  for (let i = 0; i < p; i++) { let s = g[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  for (let i = p - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < p; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  return w;
}

/**
 * Minimi quadrati (con una penalità minima per stabilità) su colonne standardizzate.
 * Restituisce anche i coefficienti nelle unità originali: «ogni indizio a valore 0 in più vale −0,9 punti».
 */
export function fitLinear(X, y, { lambda = 1e-3 } = {}) {
  const sc = scaler(X), Z = X.map(sc.apply), p = X[0].length + 1;
  const H = Array.from({ length: p }, () => new Float64Array(p)), g = new Float64Array(p);
  for (let i = 0; i < Z.length; i++) {
    const x = [1, ...Z[i]];
    for (let j = 0; j < p; j++) { g[j] += x[j] * y[i]; for (let k = 0; k < p; k++) H[j][k] += x[j] * x[k]; }
  }
  for (let j = 1; j < p; j++) H[j][j] += lambda * Z.length;
  const w = solve(H, g);
  const coef = sc.sd.map((s, j) => w[j + 1] / s);
  const intercept = w[0] - coef.reduce((acc, c, j) => acc + c * sc.mean[j], 0);
  return { type: 'lineare', coef, intercept, predict: x => intercept + x.reduce((s, v, j) => s + v * coef[j], 0) };
}

// ------------------------------------------------------------------ albero e foresta (a istogrammi)

/** Confini dei bin: i valori distinti se sono pochi (proprietà intere), altrimenti 32 quantili. */
export function binner(X) {
  const p = X[0].length;
  const edges = Array.from({ length: p }, (_, j) => {
    const v = [...new Set(X.map(x => x[j]))].sort((a, b) => a - b);
    if (v.length <= 40) return v.slice(0, -1).map((a, k) => (a + v[k + 1]) / 2);   // soglie a metà tra valori vicini
    const sorted = X.map(x => x[j]).sort((a, b) => a - b);
    return [...new Set(Array.from({ length: 31 }, (_, k) => sorted[Math.floor((k + 1) * sorted.length / 32)]))];
  });
  const code = x => x.map((v, j) => { const e = edges[j]; let b = 0; while (b < e.length && v > e[b]) b++; return b; });
  return { edges, code, nBins: edges.map(e => e.length + 1) };
}

/** Albero di regressione: in ogni foglia la media dei valori; la divisione migliore riduce di più la somma dei quadrati. */
function trainTree(cols, y, idx, { nBins, maxDepth, minLeaf, mtry, random }) {
  const F = cols.length;
  const leaf = rows => { let s = 0; for (const i of rows) s += y[i]; return s / rows.length; };
  function build(rows, depth) {
    if (depth >= maxDepth || rows.length < 2 * minLeaf) return leaf(rows);
    let total = 0; for (const i of rows) total += y[i];
    const n = rows.length, base = total * total / n;
    const feats = [...Array(F).keys()];
    for (let k = F - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [feats[k], feats[j]] = [feats[j], feats[k]]; }
    let best = null;
    for (const f of feats.slice(0, mtry)) {
      const nb = nBins[f], cnt = new Float64Array(nb), sum = new Float64Array(nb), col = cols[f];
      for (const i of rows) { cnt[col[i]]++; sum[col[i]] += y[i]; }
      let cl = 0, sl = 0;
      for (let b = 0; b < nb - 1; b++) {
        cl += cnt[b]; sl += sum[b];
        const cr = n - cl, sr = total - sl;
        if (cl < minLeaf || cr < minLeaf) continue;
        const gain = sl * sl / cl + sr * sr / cr - base;
        if (!best || gain > best.gain) best = { gain, f, b };
      }
    }
    if (!best || best.gain <= 1e-12) return leaf(rows);
    const L = [], R = [];
    for (const i of rows) (cols[best.f][i] <= best.b ? L : R).push(i);
    return { f: best.f, b: best.b, n, l: build(L, depth + 1), r: build(R, depth + 1) };
  }
  return build(idx, 0);
}
const walk = (node, c) => { while (typeof node !== 'number') node = c[node.f] <= node.b ? node.l : node.r; return node; };
const columns = (codes, F) => Array.from({ length: F }, (_, f) => Uint16Array.from(codes, c => c[f]));

export function fitTree(X, y, { maxDepth = 8, minLeaf = 5 } = {}) {
  const bn = binner(X), codes = X.map(bn.code), F = X[0].length;
  const root = trainTree(columns(codes, F), y, [...codes.keys()], { nBins: bn.nBins, maxDepth, minLeaf, mtry: F, random: rng(1) });
  return { type: 'albero', root, edges: bn.edges, predict: x => walk(root, bn.code(x)) };
}

export function fitForest(X, y, { trees = 100, maxDepth = 8, minLeaf = 3, seed = 1 } = {}) {
  const bn = binner(X), codes = X.map(bn.code), F = X[0].length, cols = columns(codes, F), random = rng(seed), n = X.length;
  const mtry = Math.max(1, Math.ceil(F / 3)), roots = [];
  for (let t = 0; t < trees; t++) {
    const idx = Array.from({ length: n }, () => Math.floor(random() * n));   // bootstrap
    roots.push(trainTree(cols, y, idx, { nBins: bn.nBins, maxDepth, minLeaf, mtry, random }));
  }
  return { type: 'foresta', predict: x => { const c = bn.code(x); let s = 0; for (const r of roots) s += walk(r, c); return s / roots.length; } };
}

/**
 * Regole leggibili dei primi livelli dell'albero: [{ depth, kind: 'se'|'altrimenti'|'foglia'|'taglio', text, n }].
 * `n` è il numero di posizioni di addestramento che arrivano al nodo. `fmtT(colonna, soglia)` formatta le soglie.
 */
export function treeRules(model, names, maxDepth = 3, fmt = v => String(v), fmtT = (f, t) => fmt(t)) {
  const out = [];
  (function visit(node, depth) {
    if (typeof node === 'number') { out.push({ depth, kind: 'foglia', text: `indice ≈ ${fmt(node)}` }); return; }
    if (depth >= maxDepth) { out.push({ depth, kind: 'taglio', text: `… altre divisioni`, n: node.n }); return; }
    const t = fmtT(node.f, model.edges[node.f][node.b]);
    const nl = typeof node.l === 'number' ? null : node.l.n, nr = typeof node.r === 'number' ? null : node.r.n;
    out.push({ depth, kind: 'se', text: `se ${names[node.f]} ≤ ${t}`, n: nl });
    visit(node.l, depth + 1);
    out.push({ depth, kind: 'altrimenti', text: `se ${names[node.f]} > ${t}`, n: nr });
    visit(node.r, depth + 1);
  })(model.root, 0);
  return out;
}

// ------------------------------------------------------------------ rete neurale

/**
 * Percettrone multistrato: ingresso → 24 neuroni tanh → 12 neuroni tanh → 1 uscita lineare.
 * Addestrato con Adam su mini-batch, minimizzando l'errore quadratico. Ingresso e uscita standardizzati.
 * `onEpoch(epoca, errore)` riceve l'andamento dell'errore di addestramento.
 */
export function fitNeural(X, y, { hidden = [24, 12], epochs = 120, batch = 64, lr = 0.01, seed = 7, onEpoch = () => {} } = {}) {
  const random = rng(seed), sc = scaler(X), Z = X.map(sc.apply);
  const ym = y.reduce((s, v) => s + v, 0) / y.length, ys = Math.sqrt(y.reduce((s, v) => s + (v - ym) ** 2, 0) / y.length) || 1;
  const T = y.map(v => (v - ym) / ys);
  const sizes = [Z[0].length, ...hidden, 1];
  const gauss = () => { const u = random() || 1e-9, v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const layers = sizes.slice(1).map((out, l) => {
    const inp = sizes[l], W = Float64Array.from({ length: out * inp }, () => gauss() * Math.sqrt(1 / inp));
    return { inp, out, W, b: new Float64Array(out), mW: new Float64Array(out * inp), vW: new Float64Array(out * inp), mb: new Float64Array(out), vb: new Float64Array(out) };
  });
  const forward = x => {
    const acts = [Float64Array.from(x)];
    layers.forEach((L, l) => {
      const a = acts[l], z = new Float64Array(L.out);
      for (let o = 0; o < L.out; o++) { let s = L.b[o]; const row = o * L.inp; for (let i = 0; i < L.inp; i++) s += L.W[row + i] * a[i]; z[o] = l < layers.length - 1 ? Math.tanh(s) : s; }
      acts.push(z);
    });
    return acts;
  };
  const b1 = 0.9, b2 = 0.999, eps = 1e-8; let step = 0;
  const order = [...Z.keys()], history = [];
  for (let e = 0; e < epochs; e++) {
    for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    let loss = 0;
    for (let s = 0; s < order.length; s += batch) {
      const gW = layers.map(L => new Float64Array(L.W.length)), gb = layers.map(L => new Float64Array(L.out));
      const ids = order.slice(s, s + batch);
      for (const i of ids) {
        const acts = forward(Z[i]);
        let delta = Float64Array.of(acts.at(-1)[0] - T[i]);
        loss += delta[0] ** 2;
        for (let l = layers.length - 1; l >= 0; l--) {
          const L = layers[l], a = acts[l], prev = new Float64Array(L.inp);
          for (let o = 0; o < L.out; o++) {
            gb[l][o] += delta[o]; const row = o * L.inp;
            for (let q = 0; q < L.inp; q++) { gW[l][row + q] += delta[o] * a[q]; prev[q] += L.W[row + q] * delta[o]; }
          }
          if (l > 0) for (let q = 0; q < L.inp; q++) prev[q] *= 1 - a[q] * a[q];   // derivata di tanh
          delta = prev;
        }
      }
      step++;
      layers.forEach((L, l) => {
        const upd = (P, G, M, V, j) => { const g = G[j] / ids.length; M[j] = b1 * M[j] + (1 - b1) * g; V[j] = b2 * V[j] + (1 - b2) * g * g; P[j] -= lr * (M[j] / (1 - b1 ** step)) / (Math.sqrt(V[j] / (1 - b2 ** step)) + eps); };
        for (let j = 0; j < L.W.length; j++) upd(L.W, gW[l], L.mW, L.vW, j);
        for (let j = 0; j < L.out; j++) upd(L.b, gb[l], L.mb, L.vb, j);
      });
    }
    const mse = loss / order.length * ys * ys;
    history.push(Math.sqrt(mse)); onEpoch(e + 1, Math.sqrt(mse));
  }
  return { type: 'rete', history, predict: x => forward(sc.apply(x)).at(-1)[0] * ys + ym };
}
