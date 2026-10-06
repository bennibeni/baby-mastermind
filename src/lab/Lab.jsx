import React, { useEffect, useRef, useState } from "react";
import { COLORS } from "../model.js";
import { FEATURES, MODELS, OPTIONS, DEFAULTS } from "./experiment.js";
import { LABEL_THRESHOLDS } from "../puzzle.js";

const it = (v, d = 2) =>
  (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString("it-IT", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
const pct = (v) => `${it(v * 100, 0)}%`;
const signed = (v, d = 2) => (v >= 0.5 * 10 ** -d ? "+" : "") + it(v, d);
const NAME = Object.fromEntries(MODELS.map((m) => [m.key, m.label]));
const SHORT = {
  media: "Media",
  lineare: "Lineare",
  albero: "Albero",
  foresta: "Foresta",
  rete: "Rete neurale",
};

function Swatch({ value, size = 16 }) {
  return (
    <span className="sw">
      {value.map((s, i) => (
        <span
          key={i}
          style={{ width: size, height: size, background: COLORS[s].hex }}
          title={COLORS[s].label}
        />
      ))}
    </span>
  );
}

/** Previsto (verticale) contro vero (orizzontale) sul 20% di prova: un pannello per modello, stessa scala per tutti. */
function Scatter({ points, model, lo, hi }) {
  const W = 190,
    P = 26,
    s = (v) => P + ((v - lo) / (hi - lo)) * (W - P - 8),
    ys = (v) => W - P - ((v - lo) / (hi - lo)) * (W - P - 8);
  const ticks = [Math.ceil(lo), Math.round((lo + hi) / 2), Math.floor(hi)];
  return (
    <figure className="scatter">
      <figcaption>{SHORT[model]}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${W}`}
        role="img"
        aria-label={`${NAME[model]}: previsto contro vero`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={s(t)} x2={s(t)} y1={8} y2={W - P} className="grid" />
            <line x1={P} x2={W - 8} y1={ys(t)} y2={ys(t)} className="grid" />
            <text x={s(t)} y={W - P + 13} className="tick" textAnchor="middle">
              {t}
            </text>
            <text x={P - 5} y={ys(t) + 3} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <line x1={s(lo)} y1={ys(lo)} x2={s(hi)} y2={ys(hi)} className="diag" />
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={s(pt.y)}
            cy={ys(pt.p[model])}
            r={3}
            className="dot"
          >
            <title>{`vero ${it(pt.y)} · previsto ${it(pt.p[model])}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function Bars({ items, valueOf, labelOf, fmt, mark }) {
  const max = Math.max(...items.map((x) => Math.abs(valueOf(x))), 1e-9);
  return (
    <div className="bars">
      {items.map((x) => {
        const v = valueOf(x);
        return (
          <div
            className="barRow"
            key={x.key}
            title={`${labelOf(x)}: ${fmt(v)}`}
          >
            <span className="barLabel">
              {mark && mark(x) && (
                <b className="star" title="usata dalla formula dell’app">
                  ★
                </b>
              )}
              {labelOf(x)}
            </span>
            <span className="barTrack">
              <span
                className={v < 0 ? "bar neg" : "bar"}
                style={{ width: `${(Math.abs(v) / max) * 100}%` }}
              />
            </span>
            <span className="barValue">{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Loss({ history }) {
  const [hover, setHover] = useState(null);
  if (!history.length) return null;
  const W = 520,
    H = 150,
    P = 34,
    max = Math.max(...history),
    n = history.length;
  const x = (i) => P + (i / Math.max(1, n - 1)) * (W - P - 10),
    y = (v) => H - 22 - (v / max) * (H - 34);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="loss"
      role="img"
      aria-label="Errore della rete neurale durante l’addestramento"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(
          ((((e.clientX - r.left) / r.width) * W - P) / (W - P - 10)) * (n - 1),
        );
        setHover(Math.max(0, Math.min(n - 1, i)));
      }}
    >
      {[0, max / 2, max].map((t) => (
        <g key={t}>
          <line x1={P} x2={W - 10} y1={y(t)} y2={y(t)} className="grid" />
          <text x={P - 5} y={y(t) + 3} className="tick" textAnchor="end">
            {it(t, 1)}
          </text>
        </g>
      ))}
      <text x={P} y={H - 6} className="tick">
        epoca 1
      </text>
      <text x={W - 10} y={H - 6} className="tick" textAnchor="end">
        epoca {n}
      </text>
      <polyline
        points={history.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        className="line"
      />
      {hover !== null && (
        <g>
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={10}
            y2={H - 22}
            className="cross"
          />
          <circle
            cx={x(hover)}
            cy={y(history[hover])}
            r={4}
            className="dot solid"
          />
          <text x={Math.min(x(hover) + 6, W - 120)} y={20} className="tip">
            epoca {hover + 1}: errore {it(history[hover], 3)}
          </text>
        </g>
      )}
    </svg>
  );
}

export default function Lab() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [result, setResult] = useState(null),
    [impModel, setImpModel] = useState("rete"),
    [lens, setLens] = useState(0),
    [reveal, setReveal] = useState(false);
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);

  function start(e) {
    e.preventDefault();
    setError("");
    setRunning(true);
    setProgress("Avvio…");
    worker.current?.terminate();
    const w = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      if (data.type === "progress") setProgress(data.message);
      else {
        setRunning(false);
        w.terminate();
        if (data.type === "done") {
          setResult(data.result);
          setImpModel(data.result.best);
          setLens(0);
        } else setError(data.message);
      }
    };
    w.onerror = (ev) => {
      setRunning(false);
      setError(ev.message || "Errore nel calcolo.");
    };
    w.postMessage(cfg);
  }
  function stop() {
    worker.current?.terminate();
    setRunning(false);
    setProgress("");
  }
  const toggleHidden = (key) =>
    setCfg((c) => ({
      ...c,
      hidden: c.hidden.includes(key)
        ? c.hidden.filter((k) => k !== key)
        : [...c.hidden, key],
    }));

  const r = result;
  const range = r
    ? (() => {
        const v = r.scatter.flatMap((pt) => [pt.y, ...Object.values(pt.p)]);
        return [Math.floor(Math.min(...v)), Math.ceil(Math.max(...v))];
      })()
    : [0, 1];
  const L = r?.lens[lens];

  return (
    <main className="lab">
      <header>
        <a className="back" href="./">
          ← Torna al gioco
        </a>
        <p className="eyebrow">Baby Mastermind · Laboratorio</p>
        <h1>
          Può una macchina imparare la difficoltà{" "}
          <em>senza conoscere la formula?</em>
        </h1>
        <p>
          Il laboratorio genera posizioni del gioco, ne misura le proprietà e
          chiede all’app il suo indice di difficoltà, trattandola come una
          scatola nera. Cinque modelli imparano sull’<b>80%</b> delle posizioni;
          sul restante <b>20%</b> si vede quale restituisce il valore più vicino
          a quello dell’app.
        </p>
      </header>

      <form className="card" onSubmit={start}>
        <p className="eyebrow">01 · Esperimento</p>
        <div className="grid4">
          <label>
            Posizioni
            <select
              value={cfg.size}
              disabled={running}
              onChange={(e) => setCfg({ ...cfg, size: Number(e.target.value) })}
            >
              {OPTIONS.size.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("it-IT")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profondità dell’albero
            <select
              value={cfg.depth}
              disabled={running}
              onChange={(e) =>
                setCfg({ ...cfg, depth: Number(e.target.value) })
              }
            >
              {OPTIONS.depth.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Alberi nella foresta
            <select
              value={cfg.trees}
              disabled={running}
              onChange={(e) =>
                setCfg({ ...cfg, trees: Number(e.target.value) })
              }
            >
              {OPTIONS.trees.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Epoche della rete
            <select
              value={cfg.epochs}
              disabled={running}
              onChange={(e) =>
                setCfg({ ...cfg, epochs: Number(e.target.value) })
              }
            >
              {OPTIONS.epochs.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset disabled={running} className="split">
          <legend>Come dividere 80% e 20%</legend>
          <label className="radio">
            <input
              type="radio"
              name="split"
              checked={cfg.split === "casuale"}
              onChange={() => setCfg({ ...cfg, split: "casuale" })}
            />{" "}
            <span>
              <b>Posizioni a caso.</b> Il 20% contiene quasi solo combinazioni
              di proprietà già viste: misura quanto un modello <i>ricorda</i>.
            </span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="split"
              checked={cfg.split === "maiviste"}
              onChange={() => setCfg({ ...cfg, split: "maiviste" })}
            />{" "}
            <span>
              <b>Combinazioni mai viste.</b> Nel 20% finiscono solo combinazioni
              assenti dall’80%: misura quanto un modello <i>generalizza</i>.
            </span>
          </label>
        </fieldset>
        <fieldset disabled={running} className="props">
          <legend>
            Proprietà visibili ai modelli{" "}
            <small>(togli la spunta per nasconderne qualcuna)</small>
          </legend>
          {FEATURES.map((f) => (
            <label key={f.key} className="check">
              <input
                type="checkbox"
                checked={!cfg.hidden.includes(f.key)}
                onChange={() => toggleHidden(f.key)}
              />{" "}
              {f.label}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button type="submit" disabled={running}>
            Avvia l’esperimento
          </button>
          {running && (
            <button type="button" className="secondary" onClick={stop}>
              Interrompi
            </button>
          )}
          <label className="seed">
            Seme
            <input
              type="number"
              min="1"
              max="999999"
              value={cfg.seed}
              disabled={running}
              onChange={(e) =>
                setCfg({ ...cfg, seed: Number(e.target.value) || 1 })
              }
            />
          </label>
        </div>
        <div role="status" aria-live="polite">
          {running && (
            <p className="status">
              <span className="spinner" />
              {progress}
            </p>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>

      {r && (
        <>
          <section className="card">
            <p className="eyebrow">02 · Chi si avvicina di più all’app</p>
            <h2>{NAME[r.best]}</h2>
            <p className="note">
              {r.counts.train.toLocaleString("it-IT")} posizioni per imparare,{" "}
              {r.counts.test.toLocaleString("it-IT")} per la prova ·{" "}
              {pct(r.counts.overlap)} delle posizioni di prova ha proprietà già
              viste in addestramento · {it(r.seconds, 1)} s
            </p>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Modello</th>
                    <th>
                      Errore medio
                      <br />
                      <small>addestramento</small>
                    </th>
                    <th>
                      Errore medio
                      <br />
                      <small>prova</small>
                    </th>
                    <th>
                      Entro ±0,1
                      <br />
                      <small>prova</small>
                    </th>
                    <th>
                      Stessa etichetta
                      <br />
                      <small>prova</small>
                    </th>
                    <th>
                      R²
                      <br />
                      <small>prova</small>
                    </th>
                    <th>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {r.results.map((x) => (
                    <tr key={x.key} className={x.key === r.best ? "win" : ""}>
                      <td>
                        {x.label}
                        {x.key === r.best && (
                          <span className="badge">migliore</span>
                        )}
                      </td>
                      <td>{it(x.train.mae, 3)}</td>
                      <td>
                        <b>{it(x.test.mae, 3)}</b>
                      </td>
                      <td>{pct(x.test.entro01)}</td>
                      <td>{pct(x.test.stessaEtichetta)}</td>
                      <td>{it(x.test.r2, 3)}</td>
                      <td>{it(x.seconds, 1)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              L’errore medio è in punti di indice (che va da circa 0 a 12). Un
              errore di addestramento molto più basso di quello di prova segnala
              che il modello ricorda le posizioni invece di capire la regola.
            </p>
          </section>

          <section className="card">
            <p className="eyebrow">03 · Previsto contro vero</p>
            <p className="note">
              Ogni punto è una posizione di prova (al massimo 300): in
              orizzontale l’indice dell’app, in verticale quello previsto. Sulla
              diagonale la previsione è perfetta.
            </p>
            <div className="scatters">
              {MODELS.map((m) => (
                <Scatter
                  key={m.key}
                  model={m.key}
                  points={r.scatter}
                  lo={range[0]}
                  hi={range[1]}
                />
              ))}
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">04 · Che cosa guarda il modello</p>
            <div className="tabs" role="tablist">
              {MODELS.filter((m) => m.key !== "media").map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={impModel === m.key}
                  className={impModel === m.key ? "tab on" : "tab"}
                  onClick={() => setImpModel(m.key)}
                >
                  {SHORT[m.key]}
                </button>
              ))}
            </div>
            <p className="note">
              Di quanto peggiora l’errore medio se una proprietà viene mescolata
              a caso tra le posizioni di prova. Se non peggiora, il modello non
              la usa. La colonna casuale deve restare a zero.
            </p>
            <Bars
              items={r.importance[impModel]}
              valueOf={(x) => x.delta}
              labelOf={(x) => x.label}
              fmt={(v) => signed(v, 3)}
              mark={(x) => reveal && x.formula}
            />
          </section>

          <div className="two">
            <section className="card">
              <p className="eyebrow">05 · I pesi della regressione lineare</p>
              <p className="note">
                Quanto cambia l’indice per ogni unità in più della proprietà, a
                parità delle altre. Con proprietà ridondanti (per esempio il
                numero di indizi è la somma dei quattro conteggi per valore) il
                peso si divide tra loro in modo arbitrario.
              </p>
              <Bars
                items={r.linear.coef}
                valueOf={(x) => x.value}
                labelOf={(x) => x.label}
                fmt={(v) => signed(v, 2)}
                mark={(x) => reveal && x.formula}
              />
            </section>
            <section className="card">
              <p className="eyebrow">06 · Le prime regole dell’albero</p>
              <p className="note">
                Tra parentesi quadre le posizioni di addestramento che arrivano
                a quel ramo.
              </p>
              <ul className="rules">
                {r.rules.map((x, i) => (
                  <li
                    key={i}
                    style={{ paddingLeft: x.depth * 18 }}
                    className={x.kind}
                  >
                    {x.text}
                    {x.n ? (
                      <small> [{x.n.toLocaleString("it-IT")}]</small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <p className="eyebrow">07 · La rete neurale mentre impara</p>
            <p className="note">
              Errore medio (radice dell’errore quadratico) sulle posizioni di
              addestramento, epoca dopo epoca. Passa sopra la curva per leggere
              i valori.
            </p>
            <Loss history={r.history} />
          </section>

          {L && (
            <section className="card">
              <p className="eyebrow">08 · Una posizione sotto la lente</p>
              <div className="lensNav">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setLens((lens + r.lens.length - 1) % r.lens.length)
                  }
                >
                  ←
                </button>
                <span>
                  Posizione {lens + 1} di {r.lens.length} (dal 20% di prova)
                </span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setLens((lens + 1) % r.lens.length)}
                >
                  →
                </button>
              </div>
              <div className="clues">
                {L.clues.map((c) => (
                  <div key={c.id}>
                    <small>
                      {c.id} · {c.valore}{" "}
                      {c.valore === 1 ? "colore giusto" : "colori giusti"}
                    </small>
                    <Swatch value={c.guess} />
                  </div>
                ))}
              </div>
              <div className="two">
                <div>
                  <h3>
                    Indice dell’app: {it(L.index)} <small>({L.label})</small>
                  </h3>
                  <Bars
                    items={MODELS.map((m) => ({
                      key: m.key,
                      v: L.pred[m.key],
                    }))}
                    valueOf={(x) => x.v}
                    labelOf={(x) =>
                      `${SHORT[x.key]}: ${signed(x.v - L.index, 2)}`
                    }
                    fmt={(v) => it(v)}
                  />
                  <p className="note">
                    Accanto al nome, l’errore di ciascun modello su questa
                    posizione.
                  </p>
                </div>
                <div>
                  <h3>Perché, secondo la formula dell’app</h3>
                  {reveal ? (
                    <Bars
                      items={L.factors}
                      valueOf={(x) => x.points}
                      labelOf={(x) => x.label}
                      fmt={(v) => signed(v, 2)}
                    />
                  ) : (
                    <p className="note">
                      Nascosto finché non sveli la formula (sezione 09): i
                      modelli non la conoscono, e nemmeno tu per ora.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="card reveal">
            <p className="eyebrow">09 · La formula dell’app</p>
            <button
              type="button"
              className={reveal ? "secondary" : ""}
              onClick={() => setReveal((v) => !v)}
            >
              {reveal ? "Nascondi la formula" : "Svela la formula"}
            </button>
            {reveal && (
              <div className="formula">
                <p>
                  L’indice è <b>1 + la somma di sei voci</b>, senza
                  arrotondamenti né limiti. Le proprietà che usa sono segnate
                  con ★ nei grafici 04 e 05.
                </p>
                <ul>
                  <li>
                    <b>Punto di partenza:</b> (combinazioni dopo l’indizio
                    migliore − 8) ÷ 4
                  </li>
                  <li>
                    <b>Indizi da incrociare:</b> (numero di indizi − 2) × 1,5
                  </li>
                  <li>
                    <b>Ipotesi da esaminare:</b> 2,5 × log₂(ipotesi ÷ 2) ÷ log₂
                    12 <i>(non lineare)</i>
                  </li>
                  <li>
                    <b>Indizi a valore 0:</b> −1 il primo, −0,5 il secondo,
                    −0,25 il terzo <i>(rendimenti decrescenti)</i>
                  </li>
                  <li>
                    <b>Indizi monocolore:</b> come sopra
                  </li>
                  <li>
                    <b>Coppie quasi uguali:</b> come sopra, × 0,75
                  </li>
                </ul>
                <p>
                  Etichette:{" "}
                  {LABEL_THRESHOLDS.map(
                    ([t, l], i) =>
                      `${l} ${i === 0 ? `sotto ${it(t)}` : Number.isFinite(t) ? `fino a ${it(t)}` : `oltre ${it(LABEL_THRESHOLDS[i - 1][0])}`}`,
                  ).join(" · ")}
                  .
                </p>
                <p className="note">
                  Confronta: i pesi lineari delle proprietà ★ sono vicini ai
                  coefficienti veri? Le proprietà senza ★ hanno importanza
                  vicina a zero, o servono ai modelli come scorciatoie per
                  quelle vere?
                </p>
              </div>
            )}
          </section>
        </>
      )}
      <footer className="projects-footer">
        <a href="https://links-page-bennibeni.vercel.app/">
          &larr; All projects
        </a>
        <a href="./">Torna al gioco &rarr;</a>
      </footer>
    </main>
  );
}
