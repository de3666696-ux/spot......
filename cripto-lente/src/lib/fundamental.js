function band(total, bands) {
  for (const [min, label, color] of bands) if (total >= min) return { label, color };
  return { label: "—", color: "no" };
}

const STRUCT_BANDS = [
  [75, "Sólido", "buy"],
  [60, "Sano", "scale"],
  [45, "Mixto", "wait"],
  [0, "Débil", "no"],
];
const CTX_BANDS = [
  [70, "Favorable", "buy"],
  [55, "Neutro", "scale"],
  [40, "Cauto", "wait"],
  [0, "Adverso", "no"],
];

export function scoreStructural(coin) {
  if (!coin) return null;
  const parts = {};

  let liq = 4;
  if (coin.rank != null) {
    if (coin.rank <= 10) liq = 24;
    else if (coin.rank <= 30) liq = 20;
    else if (coin.rank <= 50) liq = 16;
    else if (coin.rank <= 100) liq = 12;
    else if (coin.rank <= 200) liq = 8;
  }
  if (coin.marketCap && coin.volume24h) {
    const vr = coin.volume24h / coin.marketCap;
    if (vr > 0.08) liq = Math.min(30, liq + 4);
    else if (vr < 0.005) liq = Math.max(0, liq - 6);
  }
  parts.liquidez = Math.min(30, liq);

  let tok = 6;
  if (coin.circulating && coin.maxSupply) {
    const r = coin.circulating / coin.maxSupply;
    if (r > 0.85) tok = 24;
    else if (r > 0.5) tok = 20;
    else if (r > 0.25) tok = 13;
    else tok = 7;
  } else if (coin.maxSupply == null && coin.circulating) {
    tok = 14;
  }
  parts.tokenomics = tok;

  let proj = 5;
  if (coin.description && coin.description.length > 120) proj += 6;
  if (coin.openSource) proj += 6;
  if (coin.links?.website) proj += 3;
  if (coin.links?.sourceCode) proj += 4;
  if (coin.links?.whitepaper) proj += 4;
  if (coin.hardwareWallet) proj += 3;
  if (coin.tags?.length >= 3) proj += 3;
  if (coin.team?.length >= 2) proj += 4;
  if (coin.team?.length >= 5) proj += 3;
  if (coin.developmentStatus && /working|mvp|on.?going/i.test(coin.developmentStatus)) proj += 3;
  if (coin.isActive) proj += 1;
  parts.proyecto = Math.min(45, proj);

  const total = Math.round(parts.liquidez + parts.tokenomics + parts.proyecto);
  const { label, color } = band(total, STRUCT_BANDS);

  const bullets = [];
  if (coin.rank != null && coin.rank <= 20) bullets.push("Alta capitalización: mejor profundidad de mercado.");
  if (coin.rank != null && coin.rank > 100) bullets.push("Cap. baja: mayor volatilidad esperada.");
  if (coin.openSource) bullets.push("Código abierto declarado (más transparencia).");
  if (!coin.links?.website) bullets.push("Sin web oficial en los datos: verifica antes.");
  if (coin.maxSupply && coin.circulating && coin.circulating / coin.maxSupply < 0.3)
    bullets.push("Aún queda mucho supply por emitir: presión futura posible.");
  if (!coin.team?.length) bullets.push("No hay equipo público listado.");

  return {
    total, label, color, bullets, parts,
    plain:
      total >= 75 ? "Buenos fundamentos en datos públicos. No implica dirección del precio."
      : total >= 60 ? "Base razonable, con algún punto flojo que conviene vigilar."
      : total >= 45 ? "Fundamentos mixtos. Contrasta con activos de referencia."
      : "Datos públicos frágiles o incompletos. Trátalo con mucha cautela.",
  };
}

export function scoreContext(coin, global, scan) {
  if (!coin) return null;
  const parts = {};

  let mom = 20;
  const c7 = coin.change7d;
  const c30 = coin.change30d;
  const c24 = coin.change24h;
  if (c7 != null) {
    if (c7 > 0 && c7 < 25) mom += 8;
    else if (c7 >= 25 && c7 < 50) mom += 3;
    else if (c7 >= 50) mom -= 6;
    else if (c7 < -20) mom -= 6;
  }
  if (c30 != null) {
    if (c30 > -15 && c30 < 40) mom += 6;
    else if (c30 < -50) mom -= 6;
  }
  if (c24 != null && Math.abs(c24) > 15) mom -= 3;
  parts.momentum = Math.max(0, Math.min(40, mom));

  let val = 12;
  const d = coin.percentFromAth != null ? Math.abs(coin.percentFromAth) : null;
  if (d != null) {
    if (d >= 40 && d <= 75) val = 32;
    else if (d >= 20 && d < 40) val = 24;
    else if (d > 85) val = 12;
    else if (d < 10) val = 14;
  }
  parts.valoracion = Math.min(35, val);

  let reg = 12;
  if (global?.btcDominance != null) {
    if (global.btcDominance > 58) reg = 10;
    else if (global.btcDominance > 50) reg = 14;
    else reg = 18;
  }
  if (scan?.length) {
    const up = scan.filter((x) => (x.change24h || 0) > 0).length;
    const ratio = up / scan.length;
    if (ratio > 0.6) reg += 6;
    else if (ratio < 0.35) reg -= 4;
  }
  parts.regimen = Math.max(0, Math.min(25, reg));

  const total = Math.round(parts.momentum + parts.valoracion + parts.regimen);
  const { label, color } = band(total, CTX_BANDS);

  const bullets = [];
  if (global?.btcDominance > 55) bullets.push("Dominancia BTC alta: viento en contra para alts.");
  else if (global?.btcDominance != null) bullets.push("Dominancia BTC contenida: mayor rotación posible.");
  if (d != null && d > 70) bullets.push("Muy lejos del ATH: descuento o problema, según el caso.");
  if (d != null && d < 15) bullets.push("Cerca de máximos: poco margen de seguridad histórico.");
  if (c24 != null && Math.abs(c24) > 15) bullets.push("Volatilidad alta en 24h.");

  return {
    total, label, color, bullets, parts,
    plain:
      total >= 70 ? "Contexto favorable: momentum y valoración acompañan."
      : total >= 55 ? "Contexto neutro: sin viento fuerte a favor ni en contra."
      : total >= 40 ? "Contexto cauto: conviene reducir tamaño y esperar confirmación."
      : "Contexto adverso: mejor no forzar entradas ahora mismo.",
  };
}

export function combineScores(struct, ctx, coin, global) {
  if (!struct || !ctx) return null;
  const s = struct.total;
  const c = ctx.total;
  const ch24 = coin?.change24h;
  const ch7 = coin?.change7d;
  const rank = coin?.rank;
  const isBtc = (coin?.symbol || "").toUpperCase() === "BTC";
  const isEth = (coin?.symbol || "").toUpperCase() === "ETH";
  const dom = global?.btcDominance;
  const reasons = [];

  // Solo dos salidas: COMPRAR | NO COMPRAR
  let action = "NO COMPRAR";
  let tone = "no";
  let verdict = "No comprar";
  let advice = "Con los datos actuales no conviene entrar.";

  const weak = s < 50 || coin?.isActive === false;
  const tooHot = ch24 != null && ch24 > 15;
  const thin = rank != null && rank > 200;
  const smoke = s < 55 && c >= 55; // impulso sin base
  const btcCrush = !isBtc && !isEth && dom != null && dom > 58 && s < 75;

  if (weak) {
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar";
    advice = "Estructura débil o poco clara. No conviene entrar.";
    reasons.push("Estructura " + s + "/100 insuficiente.");
    if (rank != null && rank > 150) reasons.push("Rank #" + rank + ".");
  } else if (thin) {
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar";
    advice = "Muy poca capitalización relativa. Alto riesgo y poca liquidez.";
    reasons.push("Rank #" + rank + ".");
  } else if (smoke) {
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar";
    advice = "Hay movimiento de mercado pero el proyecto no sostiene la entrada.";
    reasons.push("Contexto " + c + " con estructura solo " + s + ".");
  } else if (tooHot) {
    // Euforia: no comprar (antes era esperar)
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar (muy caliente)";
    advice = "Subió demasiado en 24h. Entrar ahora es perseguir el precio.";
    reasons.push("Cambio 24h: +" + Number(ch24).toFixed(1) + "%.");
  } else if (btcCrush) {
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar (BTC manda)";
    advice = "Dominancia BTC muy alta: las alts suelen quedar atrás. Mejor no entrar en esta.";
    reasons.push("Dominancia BTC ~" + Number(dom).toFixed(1) + "%.");
    reasons.push("Estructura " + s + "/100.");
  } else if (s >= 58 && c >= 50) {
    action = "COMPRAR";
    tone = "buy";
    const softDip = (ch7 != null && ch7 < -5) || (ch24 != null && ch24 < -2);
    verdict = softDip ? "Comprar (mejor zona)" : "Comprar";
    advice = softDip
      ? "Fundamentos y contexto razonables, y el precio aflojó un poco. Si entras, usa solo parte del capital."
      : "Estructura y contexto alineados de forma aceptable para considerar compra (no es garantía).";
    reasons.push("Estructura " + s + "/100 · Contexto " + c + "/100.");
    if (rank != null) reasons.push("Rank #" + rank + ".");
    if (softDip && ch7 != null) reasons.push("7d: " + Number(ch7).toFixed(1) + "%.");
  } else if (s >= 65 && (isBtc || isEth || (rank != null && rank <= 20))) {
    // Top assets con buena estructura aunque contexto sea mediocre
    action = "COMPRAR";
    tone = "buy";
    verdict = "Comprar";
    advice = "Activo grande con estructura sólida. El contexto no es perfecto, pero no es un no claro.";
    reasons.push("Estructura " + s + "/100 · Contexto " + c + "/100.");
    reasons.push("Activo de alta capitalización.");
  } else {
    action = "NO COMPRAR";
    tone = "no";
    verdict = "No comprar";
    advice = "No hay alineación suficiente entre calidad del proyecto y momento de mercado.";
    reasons.push("Estructura " + s + "/100 · Contexto " + c + "/100.");
  }

  return {
    action,
    verdict,
    tone,
    advice,
    reasons,
    structTotal: s,
    ctxTotal: c,
  };
}

export function beginnerPicks(scan) {
  if (!scan?.length) return [];
  const want = ["BTC", "ETH", "SOL", "BNB", "XRP"];
  return want.map((s) => scan.find((x) => x.symbol === s)).filter(Boolean);
}

export function topMovers(scan) {
  if (!scan?.length) return { up: [], down: [] };
  const valid = scan.filter((x) => x.change24h != null);
  const sorted = [...valid].sort((a, b) => b.change24h - a.change24h);
  return {
    up: sorted.filter((x) => x.change24h > 0).slice(0, 5),
    down: sorted.filter((x) => x.change24h < 0).slice(-5).reverse(),
  };
}