import { sma, rsi, atr } from "./indicators.js";

export function detectRegime(btcCandles) {
  if (!btcCandles || btcCandles.length < 220) return "neutral";
  const closes = btcCandles.map(c => c.close);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const i = closes.length - 1;
  if (s50[i] == null || s200[i] == null) return "neutral";
  const price = closes[i];
  if (price > s200[i] && s50[i] > s200[i]) return "bull";
  if (price < s200[i] && s50[i] < s200[i]) return "bear";
  return "neutral";
}

export function analyzeSymbol(symbol, candles, regime) {
  if (!candles || candles.length < 220) return null;

  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const a = atr(candles, 14);
  const vs = sma(volumes, 20);

  const i = closes.length - 1;
  const price = closes[i];
  const S20 = s20[i], S50 = s50[i], S200 = s200[i];
  const R = r[i], A = a[i], V = volumes[i], VS = vs[i];
  if ([S20, S50, S200, R, A, VS].some(x => x == null)) return null;

  const reasons = [];
  let side = null;

  if (regime === "bull" && price > S50 && S50 > S200) {
    reasons.push("Tendencia alcista confirmada (SMA50 > SMA200)");
    const nearS20 = Math.abs(price - S20) / S20 < 0.025;
    if (nearS20) reasons.push("Pullback a SMA20");
    const rsiOK = R >= 35 && R <= 62;
    if (rsiOK) reasons.push(`RSI ${R.toFixed(0)} en zona de entrada`);
    const volOK = V > VS * 1.05;
    if (volOK) reasons.push("Volumen por encima de media");
    const bull = closes[i] > closes[i - 1] && closes[i] > candles[i].open;
    if (bull) reasons.push("Vela de confirmación alcista");
    if (nearS20 && rsiOK && volOK && bull) side = "long";
  }

  if ((regime === "bear" || regime === "neutral") && price < S50 && S50 < S200) {
    reasons.push("Tendencia bajista confirmada (SMA50 < SMA200)");
    const nearS20 = Math.abs(price - S20) / S20 < 0.025;
    if (nearS20) reasons.push("Rebote a SMA20");
    const rsiOK = R >= 40 && R <= 68;
    if (rsiOK) reasons.push(`RSI ${R.toFixed(0)} en zona de entrada`);
    const volOK = V > VS * 1.05;
    if (volOK) reasons.push("Volumen por encima de media");
    const bear = closes[i] < closes[i - 1] && closes[i] < candles[i].open;
    if (bear) reasons.push("Vela de confirmación bajista");
    if (nearS20 && rsiOK && volOK && bear) side = "short";
  }

  if (!side) return null;

  const entry = price;
  const slDist = A * 1.5;
  const stop = side === "long" ? entry - slDist : entry + slDist;
  const tp1 = side === "long" ? entry + slDist * 2 : entry - slDist * 2;
  const tp2 = side === "long" ? entry + slDist * 3 : entry - slDist * 3;

  return {
    id: symbol + "_" + Date.now(),
    symbol,
    base: symbol.replace(/USDT$/, ""),
    side, entry, stop, tp1, tp2,
    rr: 2,
    atr: A,
    rsi: R,
    regime,
    reasons,
    slPct: (slDist / entry) * 100,
    confidence: reasons.length,
    detectedAt: Date.now(),
  };
}

export function positionSize(capital, entry, stop, riskPct = 0.01) {
  const slDist = Math.abs(entry - stop);
  if (slDist === 0) return 0;
  return (capital * riskPct) / (slDist / entry);
}

export function signalStats(journal) {
  if (!journal?.length) return { total: 0, wins: 0, losses: 0, pending: 0, winRate: 0 };
  const wins = journal.filter(s => s.status === "win").length;
  const losses = journal.filter(s => s.status === "loss").length;
  const pending = journal.filter(s => s.status === "pending").length;
  const resolved = wins + losses;
  return {
    total: journal.length,
    wins, losses, pending,
    winRate: resolved ? (wins / resolved) * 100 : 0,
  };
}