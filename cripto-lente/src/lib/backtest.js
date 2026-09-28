export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function runBacktest(candles, {
  fast = 10, slow = 30,
  feeRate = 0.001, slippage = 0.0005,
  initial = 10000,
} = {}) {
  if (!candles?.length) throw new Error("Sin velas");
  if (fast >= slow) throw new Error("fast debe ser menor que slow");
  if (fast < 2) throw new Error("fast debe ser >= 2");

  const closes = candles.map((c) => c.close);
  const fastSMA = sma(closes, fast);
  const slowSMA = sma(closes, slow);

  let cash = initial;
  let position = null;
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < candles.length; i++) {
    const f = fastSMA[i], s = slowSMA[i];
    const pf = fastSMA[i - 1], ps = slowSMA[i - 1];
    const price = closes[i];

    if (f != null && s != null && pf != null && ps != null) {
      const crossUp = pf <= ps && f > s;
      const crossDown = pf >= ps && f < s;

      if (crossUp && !position) {
        const entryPrice = price * (1 + slippage);
        const sizeUsd = cash / (1 + feeRate);
        const entryFee = sizeUsd * feeRate;
        if (sizeUsd > 0 && cash >= sizeUsd + entryFee) {
          cash -= sizeUsd + entryFee;
          position = { entryIndex: i, entryPrice, sizeUsd, entryFee };
        }
      } else if (crossDown && position) {
        const exitPrice = price * (1 - slippage);
        const grossPnl = (position.sizeUsd * (exitPrice - position.entryPrice)) / position.entryPrice;
        const exitFee = position.sizeUsd * feeRate;
        const netPnl = grossPnl - exitFee;
        cash += position.sizeUsd + netPnl;
        trades.push({
          entryIndex: position.entryIndex, exitIndex: i,
          entryPrice: position.entryPrice, exitPrice,
          sizeUsd: position.sizeUsd, grossPnl, entryFee: position.entryFee, exitFee,
          netPnl, pnlPct: (netPnl / position.sizeUsd) * 100,
        });
        position = null;
      }
    }

    const openPnl = position
      ? (position.sizeUsd * (price - position.entryPrice)) / position.entryPrice
      : 0;
    equityCurve.push(cash + (position ? position.sizeUsd + openPnl : 0));
  }

  if (position) {
    const price = closes[closes.length - 1];
    const exitPrice = price * (1 - slippage);
    const grossPnl = (position.sizeUsd * (exitPrice - position.entryPrice)) / position.entryPrice;
    const exitFee = position.sizeUsd * feeRate;
    const netPnl = grossPnl - exitFee;
    cash += position.sizeUsd + netPnl;
    trades.push({
      entryIndex: position.entryIndex, exitIndex: candles.length - 1,
      entryPrice: position.entryPrice, exitPrice,
      sizeUsd: position.sizeUsd, grossPnl, entryFee: position.entryFee, exitFee,
      netPnl, pnlPct: (netPnl / position.sizeUsd) * 100,
      forcedExit: true,
    });
    equityCurve[equityCurve.length - 1] = cash;
  }

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const grossProfit = wins.reduce((s2, t) => s2 + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s2, t) => s2 + t.netPnl, 0));

  let peak = equityCurve[0] ?? initial;
  let maxDD = 0, maxDDPct = 0;
  for (const e of equityCurve) {
    if (e > peak) peak = e;
    const dd = peak - e;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDDPct) { maxDDPct = ddPct; maxDD = dd; }
  }

  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1] > 0) returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const avgRet = returns.length ? returns.reduce((s2, r) => s2 + r, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((s2, r) => s2 + (r - avgRet) ** 2, 0) / (returns.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (avgRet / std) * Math.sqrt(365) : 0;

  return {
    equityCurve,
    trades,
    stats: {
      initial, final: cash,
      totalReturn: ((cash - initial) / initial) * 100,
      trades: trades.length,
      wins: wins.length, losses: losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      grossProfit, grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
      maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
      sharpe,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
    },
  };
}