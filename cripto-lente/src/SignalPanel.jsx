import React, { useState, useCallback } from "react";
import {
  Zap, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Trash2,
} from "lucide-react";
import { fmt } from "./lib/fmt.js";
import { fetchKlines } from "./lib/binance.js";
import {
  detectRegime, analyzeSymbol, positionSize, signalStats,
} from "./lib/signals.js";
import { loadJournal, saveJournal, addSignal } from "./lib/journal.js";

const TIMEFRAME = "4h";
const CANDLES = 300;
const DEFAULT_UNIVERSE = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT",
];

export default function SignalPanel() {
  const [universe, setUniverse] = useState(DEFAULT_UNIVERSE);
  const [scanning, setScanning] = useState(false);
  const [regime, setRegime] = useState(null);
  const [signals, setSignals] = useState([]);
  const [journal, setJournal] = useState(() => loadJournal());
  const [capital, setCapital] = useState(1000);
  const [error, setError] = useState(null);
  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const btcCandles = await fetchKlines("BTCUSDT", TIMEFRAME, CANDLES);
      const reg = detectRegime(btcCandles);
      setRegime(reg);

      const results = [];
      for (const sym of universe) {
        if (sym === "BTCUSDT") continue;
        try {
          const candles = await fetchKlines(sym, TIMEFRAME, CANDLES);
          const sig = analyzeSymbol(sym, candles, reg);
          if (sig) {
            sig.size = positionSize(capital, sig.entry, sig.stop, 0.01);
            results.push(sig);
          }
          await new Promise(r => setTimeout(r, 100));
        } catch {}
      }
      results.sort((a, b) => b.confidence - a.confidence);
      setSignals(results);

      if (results.length) {
        setJournal(prev => {
          const next = results.reduce((acc, s) => addSignal(acc, s), prev);
          saveJournal(next);
          return next;
        });
      }
    } catch (e) {
      setError(e.message || "Error escaneando");
    } finally {
      setScanning(false);
    }
  }, [universe, capital]);

  function clearJournal() {
    if (!confirm("¿Borrar el historial de señales?")) return;
    setJournal([]);
    saveJournal([]);
  }

  const stats = signalStats(journal);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-head">
        <h3><Zap size={14} /> Señales · {TIMEFRAME}</h3>
        <button className="btn btn-primary btn-sm" onClick={scan} disabled={scanning}>
          {scanning ? <RefreshCw size={13} className="spin" /> : <Zap size={13} />}
          Escanear
        </button>
      </div>

      {regime && (
        <div className={`regime regime-${regime}`}>
          <strong>
            Régimen BTC:{" "}
            {regime === "bull" ? "ALCISTA" : regime === "bear" ? "BAJISTA" : "NEUTRO"}
          </strong>
          <span>
            {regime === "bull" && "Solo se buscan longs en alts."}
            {regime === "bear" && "Solo se buscan shorts en alts."}
            {regime === "neutral" && "Solo shorts, y solo si el activo está en downtrend claro."}
          </span>
        </div>
      )}

      <div className="sig-config">
        <div className="sig-field">
          <label>Capital (para sizing)</label>
          <input
            type="number"
            value={capital}
            onChange={e => setCapital(Number(e.target.value) || 0)}
            min={100}
          />
        </div>
        <div className="sig-field sig-field-wide">
          <label>Universo (separado por coma)</label>
          <input
            value={universe.join(",")}
            onChange={e => setUniverse(
              e.target.value.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
            )}
          />
        </div>
      </div>

      {error && <div className="error"><AlertTriangle size={14} /> {error}</div>}

      {!scanning && !signals.length && !error && (
        <div className="empty" style={{ padding: "20px 12px" }}>
          Pulsa Escanear. Si no hay setups válidos, no aparecerá ninguna señal — eso es normal y bueno.
        </div>
      )}

      {signals.map(s => (
        <div className="sig-card" key={s.id}>
          <div className="sig-head">
            <div className="sig-title">
              <strong>{s.base}</strong>
              <span className={`sig-side sig-${s.side}`}>
                {s.side === "long" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {s.side.toUpperCase()}
              </span>
              <span className="sig-confidence">{s.confidence} condiciones</span>
            </div>
          </div>

          <div className="sig-levels">
            <div className="sig-lvl"><span>Entrada</span><strong className="mono">{fmt.price(s.entry)}</strong></div>
            <div className="sig-lvl"><span>Stop</span><strong className="mono down">{fmt.price(s.stop)}</strong></div>
            <div className="sig-lvl"><span>TP1 (2R)</span><strong className="mono up">{fmt.price(s.tp1)}</strong></div>
            <div className="sig-lvl"><span>TP2 (3R)</span><strong className="mono up">{fmt.price(s.tp2)}</strong></div>
            <div className="sig-lvl"><span>Size</span><strong className="mono">{fmt.usd(s.size)}</strong></div>
            <div className="sig-lvl"><span>Riesgo</span><strong className="mono">{s.slPct.toFixed(2)}%</strong></div>
          </div>

          <ul className="sig-reasons">
            {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      ))}

      {journal.length > 0 && (
        <div className="sig-journal">
          <div className="sig-journal-head">
            <h4>Journal · {stats.total} señales</h4>
            <div className="sig-journal-stats">
              <span className="up">{stats.wins}W</span>
              <span className="down">{stats.losses}L</span>
              <span className="muted">{stats.pending}P</span>
              <span>·</span>
              <strong>Win rate: {stats.winRate.toFixed(0)}%</strong>
            </div>
            <button className="icon-btn" onClick={clearJournal} title="Borrar historial">
              <Trash2 size={13} />
            </button>
          </div>
          {journal.slice(0, 20).map(j => (
            <div className={`sig-jrow sig-jrow-${j.status}`} key={j.id}>
              <span className="mono">{fmt.date(j.detectedAt)}</span>
              <strong>{j.base}</strong>
              <span className={`sig-side sig-${j.side}`}>{j.side.toUpperCase()}</span>
              <span className="mono">{fmt.price(j.entry)}</span>
              <span className={`mono ${j.status === "win" ? "up" : j.status === "loss" ? "down" : "muted"}`}>
                {j.status === "win" ? "WIN" : j.status === "loss" ? "LOSS" : "PEND"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}