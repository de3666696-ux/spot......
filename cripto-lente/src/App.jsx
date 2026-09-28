import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, RefreshCw, AlertTriangle, Newspaper, TrendingUp, TrendingDown,
  ExternalLink, Star, Trash2, Send, Bot, HelpCircle,
  Layers, Activity, FlaskConical,
} from "lucide-react";
import { fmt } from "./lib/fmt.js";
import {
  fetchGlobal, fetchMarketScan, fetchCoinFundamental, fetchNews, humanError,
} from "./lib/api.js";
import {
  scoreStructural, scoreContext, combineScores, beginnerPicks, topMovers,
} from "./lib/fundamental.js";
import { DEFAULT_FEE, DEFAULT_SLIPPAGE } from "./lib/paper.js";
import { runBacktest } from "./lib/backtest.js";
import { fetchKlines, INTERVALS } from "./lib/binance.js";
import { loadStore, saveStore } from "./lib/store.js";
import { assistantReply } from "./lib/chat.js";
import { loadAiSettings, saveAiSettings, askCoinAi } from "./lib/ai.js";
import SignalPanel from "./SignalPanel.jsx";

const QUICK = ["BTC", "ETH", "SOL", "BNB", "XRP"];
const PAPER_SIZES = [100, 500, 1000, 5000];

function EquityChart({ values, height = 110 }) {
  if (!values?.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = 100 / (values.length - 1 || 1);
  const points = values
    .map((v, i) => `${i * step},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="equity-chart" style={{ height }}>
      <polyline
        points={points}
        fill="none"
        stroke={up ? "var(--green)" : "var(--red)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function App() {
  const initial = loadStore();
  const [query, setQuery] = useState("BTC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [global, setGlobal] = useState(null);
  const [scan, setScan] = useState([]);
  const [coin, setCoin] = useState(null);
  const [news, setNews] = useState([]);
  const [history, setHistory] = useState(initial.history || []);
  const [watchlist, setWatchlist] = useState(initial.watchlist || []);
  const [chatIn, setChatIn] = useState("");
  const [aiSettings, setAiSettings] = useState(() => loadAiSettings());
  const [showAiCfg, setShowAiCfg] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [btSymbol, setBtSymbol] = useState("BTCUSDT");
  const [btInterval, setBtInterval] = useState("1d");
  const [btFast, setBtFast] = useState(10);
  const [btSlow, setBtSlow] = useState(30);
  const [btLimit, setBtLimit] = useState(500);
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState(null);
  const [btError, setBtError] = useState(null);

  const [msgs, setMsgs] = useState([
    {
      role: "bot",
      text: "Analiza una moneda y pregúntame lo que quieras.\nSin API key uso la guía local; con key (Config IA) respondo con contexto real del activo.",
    },
  ]);
  const runId = useRef(0);

  useEffect(() => {
    saveStore({ history, watchlist });
  }, [history, watchlist]);

  const scoreStruct = useMemo(() => scoreStructural(coin), [coin]);
  const scoreCtx = useMemo(() => scoreContext(coin, global, scan), [coin, global, scan]);
  const combo = useMemo(() => combineScores(scoreStruct, scoreCtx, coin, global), [scoreStruct, scoreCtx, coin, global]);
  const picks = useMemo(() => beginnerPicks(scan), [scan]);
  const movers = useMemo(() => topMovers(scan), [scan]);

  const priceById = useMemo(() => {
    const m = {};
    for (const t of scan) m[t.id] = t.price;
    if (coin) m[coin.id] = coin.price;
    return m;
  }, [scan, coin]);


  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, s, n] = await Promise.all([
        fetchGlobal(),
        fetchMarketScan({ limit: 80 }),
        fetchNews({ limit: 12 }).catch(() => []),
      ]);
      setGlobal(g);
      setScan(s);
      setNews(n);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const analyze = useCallback(async (q) => {
    const term = (q ?? query).trim();
    if (!term) return;
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const c = await fetchCoinFundamental(term);
      if (id !== runId.current) return;
      setCoin(c);
      setQuery(c.symbol || term);
      setHistory((h) => {
        const entry = { id: c.id, symbol: c.symbol, name: c.name, logo: c.logo, at: Date.now() };
        return [entry, ...h.filter((x) => x.id !== c.id)].slice(0, 20);
      });
    } catch (e) {
      if (id !== runId.current) return;
      setError(humanError(e));
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    (async () => {
      await boot();
      await analyze("BTC");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleWatch() {
    if (!coin) return;
    setWatchlist((w) => {
      if (w.some((x) => x.id === coin.id)) return w.filter((x) => x.id !== coin.id);
      return [{ id: coin.id, symbol: coin.symbol, name: coin.name, logo: coin.logo }, ...w].slice(0, 30);
    });
  }




  async function runBt() {
    setBtRunning(true);
    setBtError(null);
    setBtResult(null);
    try {
      const candles = await fetchKlines(btSymbol, btInterval, btLimit);
      if (candles.length < btSlow + 5) throw new Error("Pocas velas para esos parámetros.");
      const res = runBacktest(candles, {
        fast: Number(btFast), slow: Number(btSlow),
        feeRate: DEFAULT_FEE, slippage: DEFAULT_SLIPPAGE,
      });
      setBtResult({ ...res, candles });
    } catch (e) {
      setBtError(e.message || "Error ejecutando backtest");
    } finally {
      setBtRunning(false);
    }
  }

  async function sendChat(text) {
    const q = (text ?? chatIn).trim();
    if (!q || aiBusy) return;
    setChatIn("");
    setMsgs((m) => [...m, { role: "me", text: q }]);

    const ctx = { coin, scoreStruct, scoreCtx, combo, global, news, movers };

    if (!aiSettings.apiKey?.trim()) {
      const reply = assistantReply(q, ctx);
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: reply + "\n\n—\nPara IA libre sobre esta moneda: abre «Config IA» y pega tu API key.",
        },
      ]);
      return;
    }

    setAiBusy(true);
    setMsgs((m) => [...m, { role: "bot", text: "Pensando sobre " + (coin?.symbol || "el mercado") + "…" }]);
    try {
      const reply = await askCoinAi(q, ctx, aiSettings);
      setMsgs((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1].text.startsWith("Pensando")) copy.pop();
        return [...copy, { role: "bot", text: reply }];
      });
    } catch (e) {
      const msg = e?.message === "NO_KEY" ? "Falta API key." : (e?.message || "Error al consultar la IA.");
      setMsgs((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1].text.startsWith("Pensando")) copy.pop();
        return [...copy, { role: "bot", text: "No pude responder con IA: " + msg }];
      });
    } finally {
      setAiBusy(false);
    }
  }

  function updateAi(partial) {
    setAiSettings((s) => {
      const next = { ...s, ...partial };
      saveAiSettings(next);
      return next;
    });
  }

  const inWatch = coin && watchlist.some((w) => w.id === coin.id);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>Cripto Lente</h1>
          <p>Fundamentos · contexto · señales · backtest</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => boot()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} /> Actualizar datos
        </button>
      </header>

      {global && (
        <div className="simple-banner">
          <div>
            <strong>Mercado hoy</strong>
            <p>
              Market cap global: <b>{fmt.compact(global.marketCap)}</b>.
              Dominancia BTC: <b>{global.btcDominance?.toFixed?.(1)}%</b>
              {global.btcDominance > 55
                ? " — régimen de alta dominancia; las alts suelen quedar rezagadas."
                : " — dominancia moderada; mayor rotación posible hacia alts."}
            </p>
          </div>
        </div>
      )}

      <div className="guide-card">
        <h3><HelpCircle size={15} /> Cómo usar esto</h3>
        <ol>
          <li>Elige un activo y lee los dos scores: <b>Estructura</b> y <b>Contexto</b>.</li>
          <li>Mira la síntesis combinada para una lectura rápida.</li>
          <li>Revisa el panel de <b>Señales</b> para setups con entrada, stop y objetivo.</li>
          <li>Prueba estrategias en el <b>Backtester</b> (histórico, no dinero real).</li>
        </ol>
      </div>

      <div className="search-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="BTC, ETH, SOL, nombre del proyecto…"
        />
        <button type="button" className="btn btn-primary" onClick={() => analyze()} disabled={loading}>
          {loading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
          Analizar
        </button>
      </div>
      <div className="quick">
        {QUICK.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => { setQuery(s); analyze(s); }}>
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="grid">
        <div>
          <div className="card">
            {loading && !coin && (
              <div className="loading"><RefreshCw className="spin" size={18} /> Cargando…</div>
            )}
            {coin && (
              <>
                <div className="coin-head">
                  <div className="coin-id">
                    {coin.logo && <img src={coin.logo} alt="" />}
                    <div>
                      <h2>{coin.name} <span>{coin.symbol}</span></h2>
                      <div className="meta">Rank #{coin.rank ?? "—"} · {coin.type || "crypto"}</div>
                    </div>
                  </div>
                  <div className="head-right">
                    <div className="price-big">{fmt.price(coin.price)}</div>
                    <div className={`meta ${(coin.change24h || 0) >= 0 ? "up" : "down"}`}>
                      24h {fmt.pct(coin.change24h)}
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${inWatch ? "btn-buy" : "btn-ghost"}`}
                      onClick={toggleWatch}
                    >
                      <Star size={13} /> {inWatch ? "En watchlist" : "Watchlist"}
                    </button>
                  </div>
                </div>

                {combo && (
                  <div className={`combo combo-${combo.tone}`}>
                    <div className="combo-action">{combo.action}</div>
                    <div className="combo-verdict">{combo.verdict}</div>
                    <div className="combo-advice">{combo.advice}</div>
                    {combo.reasons?.length > 0 && (
                      <ul className="combo-reasons">
                        {combo.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {(scoreStruct || scoreCtx) && (
                  <div className="dual-scores">
                    {scoreStruct && (
                      <div className={`plain-verdict v-${scoreStruct.color}`}>
                        <div className="pv-title">
                          <Layers size={16} /> Estructura · {scoreStruct.total}/100
                        </div>
                        <p><b>{scoreStruct.label}.</b> {scoreStruct.plain}</p>
                        {scoreStruct.bullets?.length > 0 && (
                          <ul>{scoreStruct.bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
                        )}
                      </div>
                    )}
                    {scoreCtx && (
                      <div className={`plain-verdict v-${scoreCtx.color}`}>
                        <div className="pv-title">
                          <Activity size={16} /> Contexto · {scoreCtx.total}/100
                        </div>
                        <p><b>{scoreCtx.label}.</b> {scoreCtx.plain}</p>
                        {scoreCtx.bullets?.length > 0 && (
                          <ul>{scoreCtx.bullets.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="stats">
                  <div className="stat">
                    <div className="lbl">7 días</div>
                    <div className={`val ${(coin.change7d || 0) >= 0 ? "up" : "down"}`}>{fmt.pct(coin.change7d)}</div>
                  </div>
                  <div className="stat">
                    <div className="lbl">30 días</div>
                    <div className={`val ${(coin.change30d || 0) >= 0 ? "up" : "down"}`}>{fmt.pct(coin.change30d)}</div>
                  </div>
                  <div className="stat">
                    <div className="lbl">Market cap</div>
                    <div className="val">{fmt.compact(coin.marketCap)}</div>
                  </div>
                  <div className="stat">
                    <div className="lbl">Volumen 24h</div>
                    <div className="val">{fmt.compact(coin.volume24h)}</div>
                  </div>
                  <div className="stat">
                    <div className="lbl">Desde ATH</div>
                    <div className="val">{fmt.pct(coin.percentFromAth)}</div>
                  </div>
                  <div className="stat">
                    <div className="lbl">ATH</div>
                    <div className="val">{fmt.price(coin.ath)}</div>
                  </div>
                </div>

                {coin.description && (
                  <>
                    <h3>Descripción</h3>
                    <p className="desc">
                      {coin.description.slice(0, 900)}
                      {coin.description.length > 900 ? "…" : ""}
                    </p>
                  </>
                )}

                {!!coin.tags?.length && (
                  <div className="tags">
                    {coin.tags.slice(0, 8).map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </div>
                )}

                <div className="links">
                  {coin.links?.website && (
                    <a href={coin.links.website} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Web oficial
                    </a>
                  )}
                  {coin.links?.whitepaper && (
                    <a href={coin.links.whitepaper} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Whitepaper
                    </a>
                  )}
                  {coin.links?.sourceCode && (
                    <a href={coin.links.sourceCode} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Código
                    </a>
                  )}
                </div>
              </>
            )}
          </div>

          <SignalPanel />

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <h3><FlaskConical size={14} /> Backtester · cruce de medias</h3>
            </div>

            <div className="bt-form">
              <div className="bt-field">
                <label>Símbolo</label>
                <input value={btSymbol} onChange={(e) => setBtSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" />
              </div>
              <div className="bt-field">
                <label>Intervalo</label>
                <div className="bt-pills">
                  {INTERVALS.map((iv) => (
                    <button
                      key={iv.id}
                      className={btInterval === iv.id ? "active" : ""}
                      onClick={() => setBtInterval(iv.id)}
                    >
                      {iv.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bt-field">
                <label>Velas</label>
                <input type="number" value={btLimit} onChange={(e) => setBtLimit(Number(e.target.value))} min={50} max={1000} />
              </div>
              <div className="bt-field">
                <label>Fast SMA</label>
                <input type="number" value={btFast} onChange={(e) => setBtFast(Number(e.target.value))} min={2} max={200} />
              </div>
              <div className="bt-field">
                <label>Slow SMA</label>
                <input type="number" value={btSlow} onChange={(e) => setBtSlow(Number(e.target.value))} min={3} max={400} />
              </div>
              <button className="btn btn-primary bt-run" onClick={runBt} disabled={btRunning}>
                {btRunning ? <RefreshCw size={14} className="spin" /> : <FlaskConical size={14} />}
                Ejecutar
              </button>
            </div>

            {btError && <div className="error" style={{ marginTop: 10 }}><AlertTriangle size={14} /> {btError}</div>}

            {btResult && (
              <>
                <div className="bt-stats">
                  <div className="pstat">
                    <span>Retorno total</span>
                    <strong className={btResult.stats.totalReturn >= 0 ? "up" : "down"}>
                      {btResult.stats.totalReturn >= 0 ? "+" : ""}{btResult.stats.totalReturn.toFixed(2)}%
                    </strong>
                  </div>
                  <div className="pstat">
                    <span>Equity final</span>
                    <strong>{fmt.usd(btResult.stats.final)}</strong>
                  </div>
                  <div className="pstat">
                    <span>Trades</span>
                    <strong>{btResult.stats.trades}</strong>
                  </div>
                  <div className="pstat">
                    <span>Win rate</span>
                    <strong>{btResult.stats.winRate.toFixed(0)}%</strong>
                  </div>
                  <div className="pstat">
                    <span>Profit factor</span>
                    <strong>{btResult.stats.profitFactor === Infinity ? "∞" : btResult.stats.profitFactor.toFixed(2)}</strong>
                  </div>
                  <div className="pstat">
                    <span>Max DD</span>
                    <strong className="down">-{btResult.stats.maxDrawdownPct.toFixed(1)}%</strong>
                  </div>
                  <div className="pstat">
                    <span>Sharpe</span>
                    <strong>{btResult.stats.sharpe.toFixed(2)}</strong>
                  </div>
                  <div className="pstat">
                    <span>Avg win / loss</span>
                    <strong>{fmt.usd(btResult.stats.avgWin)} / {fmt.usd(-Math.abs(btResult.stats.avgLoss))}</strong>
                  </div>
                </div>

                <div className="bt-chart-wrap">
                  <EquityChart values={btResult.equityCurve} />
                  <div className="bt-chart-meta">
                    <span>Curva de equity · {btSymbol} · {btInterval} · SMA {btFast}/{btSlow}</span>
                    <span className="muted">Datos Binance pública · fees y slippage aplicados</span>
                  </div>
                </div>

                <p className="bt-warn">
                  ⚠️ Resultado histórico. No garantiza nada a futuro.
                </p>
              </>
            )}
          </div>

          {picks.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3>Referencias de mercado</h3>
              <div className="pick-grid">
                {picks.map((p) => (
                  <button key={p.id} type="button" className="pick-card" onClick={() => analyze(p.id)}>
                    <strong>{p.symbol}</strong>
                    <span>{p.name}</span>
                    <span className="mono">{fmt.price(p.price)}</span>
                    <span className={p.change24h >= 0 ? "up" : "down"}>{fmt.pct(p.change24h)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(movers.up.length > 0 || movers.down.length > 0) && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3>Movimiento 24h</h3>
              <div className="insight-row">
                <div>
                  <h4><TrendingUp size={12} /> Gainers</h4>
                  {movers.up.map((g) => (
                    <button key={g.id} type="button" className="mini-row" onClick={() => analyze(g.id)}>
                      {g.symbol} <span className="up">{fmt.pct(g.change24h)}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <h4><TrendingDown size={12} /> Losers</h4>
                  {movers.down.map((g) => (
                    <button key={g.id} type="button" className="mini-row" onClick={() => analyze(g.id)}>
                      {g.symbol} <span className="down">{fmt.pct(g.change24h)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <h3><Newspaper size={14} /> Noticias recientes</h3>
            {!news.length && <div className="empty">Sin noticias por ahora.</div>}
            {news.slice(0, 8).map((n, i) => (
              <a key={i} className="news-row" href={n.link} target="_blank" rel="noreferrer">
                <div className="news-title">{n.title}</div>
                <div className="news-meta">{fmt.date(n.pubDate)}</div>
              </a>
            ))}
          </div>

          {(watchlist.length > 0 || history.length > 0) && (
            <div className="card" style={{ marginTop: 14 }}>
              {watchlist.length > 0 && (
                <>
                  <h3><Star size={14} /> Watchlist</h3>
                  {watchlist.map((w) => (
                    <div className="list-row" key={w.id} onClick={() => analyze(w.id)}>
                      {w.logo && <img src={w.logo} alt="" />}
                      <div className="name">{w.symbol} · {w.name}</div>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ marginLeft: "auto" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setWatchlist((list) => list.filter((x) => x.id !== w.id));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
              {history.length > 0 && (
                <>
                  <h3 style={{ marginTop: watchlist.length ? 14 : 0 }}>Historial</h3>
                  {history.slice(0, 6).map((h) => (
                    <div className="list-row" key={h.id + h.at} onClick={() => analyze(h.id)}>
                      {h.logo && <img src={h.logo} alt="" />}
                      <div>
                        <div className="name">{h.symbol} · {h.name}</div>
                        <div className="sub">{fmt.date(h.at)}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="card chat">
          <div className="card-head">
            <h3><Bot size={14} /> IA · {coin ? coin.symbol : "mercado"}</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAiCfg((v) => !v)}>
              Config IA
            </button>
          </div>
          {showAiCfg && (
            <div className="ai-cfg">
              <p className="ai-cfg-note">
                La IA responde con el contexto del activo. La key se guarda solo en este navegador.
              </p>
              <div className="field">
                <label>API key</label>
                <input
                  type="password"
                  value={aiSettings.apiKey || ""}
                  onChange={(e) => updateAi({ apiKey: e.target.value })}
                  placeholder="xai-... o sk-..."
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>Base URL</label>
                <input
                  value={aiSettings.baseUrl || ""}
                  onChange={(e) => updateAi({ baseUrl: e.target.value })}
                  placeholder="https://api.x.ai/v1"
                />
              </div>
              <div className="field">
                <label>Modelo</label>
                <input
                  value={aiSettings.model || ""}
                  onChange={(e) => updateAi({ model: e.target.value })}
                  placeholder="grok-2-latest"
                />
              </div>
              <p className="ai-cfg-warn">
                ⚠️ La key vive en tu navegador. No la compartas ni la subas a un sitio público.
              </p>
            </div>
          )}
          <div className="chat-msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role === "bot" ? "bot" : "me"}`}>{m.text}</div>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={chatIn}
              onChange={(e) => setChatIn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder={coin ? `Pregunta sobre ${coin.symbol}…` : "Analiza una moneda o pregunta por el mercado…"}
              disabled={aiBusy}
            />
            <button type="button" className="btn btn-primary" onClick={() => sendChat()} disabled={aiBusy}>
              {aiBusy ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
          <div className="quick-q">
            {(coin
              ? [`¿Qué es ${coin.symbol}?`, `Riesgos de ${coin.symbol}`, `Estructura de ${coin.symbol}`, `Contexto actual`, "Resume noticias"]
              : ["Dominancia BTC", "Noticias", "Gainers", "Losers"]
            ).map((q) => (
              <button key={q} type="button" onClick={() => sendChat(q)} disabled={aiBusy}>{q}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="footer">Cripto Lente · fundamentos · contexto · señales · backtest</p>
      <p className="footer-disclaimer">
        Herramienta informativa. No es asesoramiento financiero.
        Operar cripto conlleva riesgo de pérdida total. Usa gestión de riesgo.
      </p>
    </div>
  );
}