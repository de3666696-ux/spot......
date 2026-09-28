export const DEFAULT_BALANCE = 10000;
export const DEFAULT_FEE = 0.001;
export const DEFAULT_SLIPPAGE = 0.0005;
const MAX_POSITIONS = 20;
const MAX_HISTORY = 200;

export function createAccount(initial = DEFAULT_BALANCE) {
  return { initial, cash: initial, positions: [], closed: [], createdAt: Date.now() };
}

function applySlippage(price, side, isEntry, slip) {
  if (side === "long") return isEntry ? price * (1 + slip) : price * (1 - slip);
  return isEntry ? price * (1 - slip) : price * (1 + slip);
}

export function computeUnrealized(pos, currentPrice) {
  if (!pos || currentPrice == null || !pos.entryPrice) return 0;
  const move = (currentPrice - pos.entryPrice) / pos.entryPrice;
  return pos.side === "long" ? pos.sizeUsd * move : pos.sizeUsd * -move;
}

export function equity(account, priceById) {
  let eq = account.cash;
  for (const p of account.positions) {
    const px = priceById?.[p.coinId] ?? p.entryPrice;
    const gross = computeUnrealized(p, px);
    const exitFee = p.sizeUsd * (p.feeRate ?? DEFAULT_FEE);
    eq += p.sizeUsd + gross - exitFee;
  }
  return eq;
}

export function openPosition(account, {
  coinId, symbol, side, price, sizeUsd, note = "",
  stopLoss = null, takeProfit = null,
  feeRate = DEFAULT_FEE, slippage = DEFAULT_SLIPPAGE,
}) {
  if (!account) throw new Error("Sin cuenta");
  if (!["long", "short"].includes(side)) throw new Error("Lado inválido");
  if (!price || price <= 0) throw new Error("Precio inválido");
  if (!sizeUsd || sizeUsd <= 0) throw new Error("Tamaño inválido");
  if (account.positions.length >= MAX_POSITIONS) throw new Error("Máximo de posiciones alcanzado");
  if (account.positions.some((p) => p.coinId === coinId && p.side === side))
    throw new Error("Ya tienes una posición en ese lado");

  const entryPrice = applySlippage(price, side, true, slippage);
  const entryFee = sizeUsd * feeRate;
  const totalCost = sizeUsd + entryFee;
  if (totalCost > account.cash) throw new Error("Saldo insuficiente");

  if (stopLoss != null) {
    if (side === "long" && stopLoss >= entryPrice) throw new Error("SL debe ser menor al precio de entrada (long)");
    if (side === "short" && stopLoss <= entryPrice) throw new Error("SL debe ser mayor al precio de entrada (short)");
  }
  if (takeProfit != null) {
    if (side === "long" && takeProfit <= entryPrice) throw new Error("TP debe ser mayor al precio de entrada (long)");
    if (side === "short" && takeProfit >= entryPrice) throw new Error("TP debe ser menor al precio de entrada (short)");
  }

  const pos = {
    id: "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    coinId, symbol, side, entryPrice, sizeUsd, entryFee,
    openedAt: Date.now(), note,
    stopLoss, takeProfit, feeRate, slippage,
  };
  return { ...account, cash: account.cash - totalCost, positions: [...account.positions, pos] };
}

export function closePosition(account, positionId, currentPrice, reason = "manual") {
  const pos = account.positions.find((p) => p.id === positionId);
  if (!pos) throw new Error("Posición no encontrada");
  if (currentPrice == null || currentPrice <= 0) throw new Error("Precio actual inválido");

  const exitPrice = applySlippage(currentPrice, pos.side, false, pos.slippage ?? DEFAULT_SLIPPAGE);
  const grossPnl = pos.side === "long"
    ? (pos.sizeUsd * (exitPrice - pos.entryPrice)) / pos.entryPrice
    : (pos.sizeUsd * (pos.entryPrice - exitPrice)) / pos.entryPrice;
  const exitFee = pos.sizeUsd * (pos.feeRate ?? DEFAULT_FEE);
  const netPnl = grossPnl - exitFee;

  const closed = {
    ...pos, exitPrice, closedAt: Date.now(),
    grossPnl, exitFee, pnl: netPnl,
    pnlPct: (netPnl / pos.sizeUsd) * 100,
    reason,
  };
  return {
    ...account,
    cash: account.cash + pos.sizeUsd + netPnl,
    positions: account.positions.filter((p) => p.id !== positionId),
    closed: [closed, ...account.closed].slice(0, MAX_HISTORY),
  };
}

export function checkTriggers(account, priceById) {
  const toClose = [];
  for (const p of account.positions) {
    const px = priceById?.[p.coinId];
    if (px == null) continue;
    if (p.stopLoss != null) {
      if ((p.side === "long" && px <= p.stopLoss) || (p.side === "short" && px >= p.stopLoss)) {
        toClose.push({ id: p.id, price: p.stopLoss, reason: "stop-loss" });
        continue;
      }
    }
    if (p.takeProfit != null) {
      if ((p.side === "long" && px >= p.takeProfit) || (p.side === "short" && px <= p.takeProfit)) {
        toClose.push({ id: p.id, price: p.takeProfit, reason: "take-profit" });
      }
    }
  }
  if (!toClose.length) return account;
  let updated = account;
  for (const t of toClose) {
    try { updated = closePosition(updated, t.id, t.price, t.reason); } catch {}
  }
  return updated;
}

export function stats(account) {
  const closed = account.closed || [];
  const base = {
    trades: 0, wins: 0, losses: 0, winRate: 0,
    totalPnl: 0, totalPnlPct: 0, avgWin: 0, avgLoss: 0, best: 0, worst: 0,
    feesPaid: 0,
  };
  if (!closed.length) return base;
  const wins = closed.filter((c) => c.pnl > 0);
  const losses = closed.filter((c) => c.pnl < 0);
  const totalPnl = closed.reduce((s, c) => s + c.pnl, 0);
  const feesPaid = closed.reduce((s, c) => s + (c.entryFee || 0) + (c.exitFee || 0), 0);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / closed.length) * 100,
    totalPnl,
    totalPnlPct: (totalPnl / account.initial) * 100,
    avgWin: wins.length ? wins.reduce((s, c) => s + c.pnl, 0) / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((s, c) => s + c.pnl, 0) / losses.length : 0,
    best: closed.reduce((m, c) => Math.max(m, c.pnl), 0),
    worst: closed.reduce((m, c) => Math.min(m, c.pnl), 0),
    feesPaid,
  };
}