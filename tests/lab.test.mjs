import { test } from "node:test";
import assert from "node:assert/strict";
import {
  run,
  split,
  validate,
  FEATURES,
  MODELS,
} from "../src/lab/experiment.js";
import { fitLinear, fitTree, fitNeural, rng } from "../src/lab/models.js";

test("Modelli: la lineare ritrova pesi noti, l’albero una soglia, la rete una curva", () => {
  const r = rng(1),
    X = [],
    y = [];
  for (let i = 0; i < 600; i++) {
    const a = r() * 4,
      b = Math.floor(r() * 3);
    X.push([a, b]);
    y.push(1 + 2 * a - 0.5 * b);
  }
  const lin = fitLinear(X, y);
  assert.ok(
    Math.abs(lin.coef[0] - 2) < 0.01 &&
      Math.abs(lin.coef[1] + 0.5) < 0.01 &&
      Math.abs(lin.intercept - 1) < 0.02,
  );
  const tree = fitTree(
    X.map((x) => [x[1]]),
    X.map((x) => (x[1] >= 1 ? 5 : 0)),
    { maxDepth: 2, minLeaf: 5 },
  );
  assert.equal(tree.predict([0]), 0);
  assert.equal(tree.predict([2]), 5);
  const Xs = Array.from({ length: 300 }, (_, i) => [i / 100]),
    ys = Xs.map(([x]) => Math.log2(1 + x));
  const net = fitNeural(Xs, ys, { epochs: 150, seed: 3 });
  const err =
    Xs.reduce((s, x, i) => s + Math.abs(net.predict(x) - ys[i]), 0) / Xs.length;
  assert.ok(err < 0.05, `errore rete ${err}`);
});

test("Divisione «combinazioni mai viste»: nessuna combinazione della prova compare in addestramento", () => {
  const res = run({
    size: 500,
    split: "maiviste",
    epochs: 40,
    trees: 30,
    depth: 6,
    seed: 2,
  });
  assert.equal(res.counts.overlap, 0);
  assert.ok(res.counts.test >= 100 && res.counts.test <= 160);
  const casual = run({
    size: 500,
    split: "casuale",
    epochs: 40,
    trees: 30,
    depth: 6,
    seed: 2,
  });
  assert.ok(casual.counts.overlap > 0.8);
  assert.equal(casual.counts.test, 100);
});

test("Esperimento completo: cinque modelli, i migliori battono la media, la colonna casuale non conta", () => {
  const res = run({
    size: 2000,
    split: "casuale",
    epochs: 40,
    trees: 30,
    depth: 8,
    seed: 5,
  });
  assert.deepEqual(
    res.results.map((r) => r.key),
    MODELS.map((m) => m.key),
  );
  const mae = Object.fromEntries(res.results.map((r) => [r.key, r.test.mae]));
  for (const k of ["lineare", "albero", "foresta", "rete"])
    assert.ok(mae[k] < mae.media / 5, `${k} non batte la media`);
  const peak = res.linear.coef.find((c) => c.key === "peak").value;
  assert.ok(
    Math.abs(peak - 0.25) < 0.05,
    `peso di «combinazioni dopo l’indizio migliore» ${peak}`,
  );
  for (const k of ["lineare", "albero", "foresta", "rete"]) {
    const c = res.importance[k].find((i) => i.key === "casuale").delta;
    assert.ok(
      Math.abs(c) < 0.02,
      `${k}: importanza della colonna casuale ${c}`,
    );
  }
  assert.ok(
    res.rules.length > 3 && res.scatter.length > 0 && res.lens.length === 24,
  );
  assert.equal(res.history.length, 40);
});

test("Proprietà nascoste: spariscono dai modelli; opzioni non valide rifiutate", () => {
  const res = run({
    size: 500,
    epochs: 40,
    trees: 30,
    depth: 6,
    hidden: ["peak", "casi"],
  });
  assert.ok(!res.features.some((f) => f.key === "peak" || f.key === "casi"));
  assert.equal(res.features.length, FEATURES.length - 2);
  assert.throws(() => validate({ size: 123 }), /Valore non valido/);
  assert.throws(
    () => validate({ hidden: FEATURES.map((f) => f.key) }),
    /almeno una/,
  );
});
