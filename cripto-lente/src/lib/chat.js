import { fmt } from "./fmt.js";

export function assistantReply(q, ctx) {
  const query = (q || "").toLowerCase();
  const { coin, scoreStruct, scoreCtx, global, news, movers } = ctx;

  if (/ayuda|c[oó]mo usar|gu[ií]a/.test(query)) {
    return [
      "1) Mira dominancia BTC y market cap global.",
      "2) Analiza un activo: verás dos scores — estructural (calidad) y contexto (timing).",
      "3) Contrasta con noticias del día.",
      "4) Revisa señales y backtest; no es dinero real.",
    ].join("\n");
  }
  if (/dominanc|btc|mercado/.test(query)) {
    if (!global) return "Pulsa Actualizar para cargar el mercado.";
    return [
      `Market cap global: ${fmt.compact(global.marketCap)}.`,
      `Dominancia BTC: ${global.btcDominance?.toFixed?.(1)}%.`,
      global.btcDominance > 55
        ? "Con BTC tan fuerte, las alts suelen ir más flojas."
        : "Dominancia contenida: el resto tiene más aire.",
    ].join("\n");
  }
  if (/noticia|titular/.test(query)) {
    if (!news?.length) return "Sin noticias. Pulsa Actualizar.";
    return "Últimos titulares:\n" + news.slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`).join("\n");
  }
  if (/sube|gainer/.test(query)) {
    if (!movers?.up?.length) return "Sin datos.";
    return movers.up.map((g) => `${g.symbol}: ${fmt.pct(g.change24h)}`).join("\n");
  }
  if (/baja|loser/.test(query)) {
    if (!movers?.down?.length) return "Sin datos.";
    return movers.down.map((g) => `${g.symbol}: ${fmt.pct(g.change24h)}`).join("\n");
  }
  if (/score|estructura|calidad|fundamental/.test(query)) {
    if (!scoreStruct) return "Analiza un activo primero.";
    return [
      `${coin.name} · ESTRUCTURA: ${scoreStruct.total}/100 (${scoreStruct.label})`,
      scoreStruct.plain,
      ...scoreStruct.bullets.slice(0, 3).map((b) => "· " + b),
    ].join("\n");
  }
  if (/contexto|timing|momento|entrar/.test(query)) {
    if (!scoreCtx) return "Analiza un activo primero.";
    return [
      `${coin.name} · CONTEXTO: ${scoreCtx.total}/100 (${scoreCtx.label})`,
      scoreCtx.plain,
      ...scoreCtx.bullets.slice(0, 3).map((b) => "· " + b),
    ].join("\n");
  }
  if (/comprar|vender|entrada|ahora/.test(query)) {
    const combo = ctx.combo;
    if (!combo) return coin ? "Analiza el activo para ver COMPRAR / NO COMPRAR." : "Analiza un activo primero.";
    return [
      `${coin?.symbol || "Activo"}: ${combo.action}`,
      combo.verdict,
      combo.advice,
      ...(combo.reasons || []).slice(0, 4),
      "Es orientación con datos públicos, no una garantía.",
    ].join("\n");
  }
  return [
    "Temas: estructura del activo, contexto de mercado, noticias, gainers/losers.",
    coin ? `Activo abierto: ${coin.name}.` : "Analiza BTC, ETH u otro símbolo.",
  ].join("\n");
}