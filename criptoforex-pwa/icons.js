/* Картинки монет и флаги валют.
 *
 * Всё нарисовано SVG и встроено в страницу одним «спрайтом»: ничего не качается из сети,
 * иконки не мигают при перерисовке и работают офлайн.
 *
 * Хочешь свои картинки (например, официальные логотипы) — положи файл в webapp/coins/
 * и впиши его в ICON_FILES ниже, например:   BTCUSD: "coins/btc.png"
 * Для форекс-пар файл заменит ОБЕ половинки (пару флагов) одной картинкой.
 */
const ICON_FILES = {};

// актив -> иконка (имя символа в спрайте) или пара флагов [база, котируемая]
const COIN_ICON = { BTCUSD: "btc", ETHUSD: "eth", BNBUSD: "bnb", SOLUSD: "sol" };
const PAIR_FLAGS = { EURUSD: ["eu", "us"], GBPUSD: ["gb", "us"], USDJPY: ["us", "jp"], AUDUSD: ["au", "us"], USDCAD: ["us", "ca"] };

(function buildSprite() {
  // n-конечная звезда (внешний радиус R, внутренний R*k) вокруг (cx, cy)
  const star = (cx, cy, R, fill, n = 5, k = 0.4) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? R * k : R, a = (Math.PI * i) / n - Math.PI / 2;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + "," + (cy + r * Math.sin(a)).toFixed(2));
    }
    return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
  };
  const CLIP = (id) => `<clipPath id="cp-${id}"><circle cx="16" cy="16" r="16"/></clipPath>`;
  const RING = '<circle cx="16" cy="16" r="15.6" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".8"/>';
  const flag = (id, body) => `<symbol id="ic-${id}" viewBox="0 0 32 32"><defs>${CLIP(id)}</defs><g clip-path="url(#cp-${id})">${body}</g>${RING}</symbol>`;
  const sym = (id, body) => `<symbol id="ic-${id}" viewBox="0 0 32 32">${body}</symbol>`;

  // ---- флаги -------------------------------------------------------------
  const US = (() => {
    let s = '<rect width="32" height="32" fill="#fff"/>';
    const h = 32 / 13;
    for (let i = 0; i < 13; i += 2) s += `<rect y="${(i * h).toFixed(2)}" width="32" height="${h.toFixed(2)}" fill="#b22234"/>`;
    s += `<rect width="18" height="${(7 * h).toFixed(2)}" fill="#3c3b6e"/>`;     // круг срезает края, поэтому звёзды — ближе к центру
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += `<circle cx="${(7.2 + c * 4.3).toFixed(1)}" cy="${(5.3 + r * 4.1).toFixed(1)}" r="1.05" fill="#fff"/>`;
    return s;
  })();
  const EU = '<rect width="32" height="32" fill="#0b3d91"/>' +
    Array.from({ length: 12 }, (_, i) => star(16 + 9.2 * Math.cos((i * Math.PI) / 6), 16 + 9.2 * Math.sin((i * Math.PI) / 6), 2.1, "#ffcc00")).join("");
  const UJ = '<g id="uj"><rect width="32" height="32" fill="#012169"/>' +
    '<path d="M0 0L32 32M32 0L0 32" stroke="#fff" stroke-width="5.6"/><path d="M0 0L32 32M32 0L0 32" stroke="#c8102e" stroke-width="2"/>' +
    '<path d="M16 0V32M0 16H32" stroke="#fff" stroke-width="9"/><path d="M16 0V32M0 16H32" stroke="#c8102e" stroke-width="5.4"/></g>';
  const GB = '<use href="#uj" xlink:href="#uj"/>';
  const JP = '<rect width="32" height="32" fill="#fff"/><circle cx="16" cy="16" r="9" fill="#bc002d"/>';
  const AU = '<rect width="32" height="32" fill="#012169"/><g transform="scale(.5)"><use href="#uj" xlink:href="#uj"/></g>' +
    star(8, 24, 4, "#fff", 7, 0.5) + star(24, 6.5, 1.9, "#fff") + star(19.3, 13, 1.9, "#fff") + star(28.4, 12.5, 1.9, "#fff") +
    star(24, 23, 1.9, "#fff") + star(26.4, 16.6, 1.2, "#fff");
  const leaf = (() => {          // кленовый лист: правая половина (dx, dy от центра), левая — зеркально
    const R = [[0, -10.5], [1.4, -7.2], [3.3, -8], [2.9, -4.4], [6.4, -5.6], [5.4, -3], [8.2, -0.4], [6.2, 0.6], [6.8, 3], [1, 2.4], [1, 8.3]];
    const pts = R.map(([x, y]) => [16 + x, 16 + y]).concat(R.slice(1).reverse().map(([x, y]) => [16 - x, 16 + y]));
    return `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="#d80621"/>`;
  })();
  const CA = '<rect width="32" height="32" fill="#fff"/><rect width="8" height="32" fill="#d80621"/><rect x="24" width="8" height="32" fill="#d80621"/>' + leaf;

  // ---- монеты ------------------------------------------------------------
  const BTC = '<circle cx="16" cy="16" r="16" fill="#f7931a"/>' +
    '<path fill="#fff" fill-rule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"/>';
  const ETH = '<circle cx="16" cy="16" r="16" fill="#627eea"/><g fill="#fff" fill-rule="nonzero">' +
    '<path fill-opacity=".6" d="M16.498 4v8.87l7.497 3.35z"/><path d="M16.498 4L9 16.22l7.498-3.35z"/>' +
    '<path fill-opacity=".6" d="M16.498 21.968v6.027L24 17.616z"/><path d="M16.498 27.995v-6.028L9 17.616z"/>' +
    '<path fill-opacity=".2" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/><path fill-opacity=".6" d="M9 16.22l7.498 4.353v-7.701z"/></g>';
  const BNB = '<circle cx="16" cy="16" r="16" fill="#f3ba2f"/>' +
    '<path fill="#fff" d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z"/>';
  const SOL = (() => {
    const mk = (y, up) => {
      const x0 = 8, w = 13.4, s = 2.6, h = 3.4;
      const tl = x0 + (up ? s : 0), bl = x0 + (up ? 0 : s);
      return `<path d="M${tl} ${y}H${tl + w}L${bl + w} ${y + h}H${bl}Z" fill="url(#sol-g)" stroke="url(#sol-g)" stroke-width=".5" stroke-linejoin="round"/>`;
    };
    return '<defs><linearGradient id="sol-g" x1="8" y1="22" x2="24" y2="9" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00ffa3"/><stop offset="1" stop-color="#dc1fff"/></linearGradient></defs>' +
      '<circle cx="16" cy="16" r="16" fill="#111218"/>' + mk(9.2, true) + mk(14.3, false) + mk(19.4, true);
  })();

  // ---- биржи (упрощённые значки в фирменных цветах, рисованные SVG, без сети) -------------
  const circ = (c) => `<circle cx="16" cy="16" r="16" fill="${c}"/>`;
  const txt = (t, fs, fill) => `<text x="16" y="${(16 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${fs}" fill="${fill || "#fff"}">${t}</text>`;
  const okxSq = [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]].map(([i, k]) => `<rect x="${7.5 + i * 6}" y="${7.5 + k * 6}" width="5" height="5" fill="#fff"/>`).join("");
  const hexPts = (r) => Array.from({ length: 6 }, (_, i) => (16 + r * Math.cos(Math.PI / 6 + i * Math.PI / 3)).toFixed(1) + "," + (16 + r * Math.sin(Math.PI / 6 + i * Math.PI / 3)).toFixed(1)).join(" ");
  const EXI = {
    auto: circ("#6b7280") + '<path d="M18.2 6L10 18h5.2L13.8 26 22 14h-5.2z" fill="#fff"/>',
    binance: BNB,
    okx: circ("#000") + okxSq,
    bybit: circ("#17181e") + txt("B", 17) + '<rect x="21" y="8" width="4" height="4" rx="1" fill="#f7a600"/>',
    coinbase: circ("#0052ff") + '<circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="4.6" stroke-dasharray="38.3 12" transform="rotate(46 16 16)"/>',
    kraken: circ("#5741d9") + '<path d="M9.5 23V14.5a6.5 6.5 0 0 1 13 0V23l-2.17-2.2-2.16 2.2-2.17-2.2-2.17 2.2-2.16-2.2z" fill="#fff"/><circle cx="13.3" cy="14.6" r="1.5" fill="#5741d9"/><circle cx="18.7" cy="14.6" r="1.5" fill="#5741d9"/>',
    kucoin: circ("#23af91") + txt("K", 17),
    yahoo: circ("#6001d2") + txt("Y!", 14),
    mexc: circ("#1972e2") + txt("M", 17),
    gateio: circ("#2354e6") + txt("G", 17),
    bingx: circ("#2e54ff") + txt("X", 17),
    bitget: circ("#0b1218") + '<path d="M10.5 9l7 7-7 7M16.5 9l7 7-7 7" fill="none" stroke="#00f0ff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
    htx: circ("#2a5bd7") + star(16, 16, 10.5, "#fff", 4, 0.3),
    bitfinex: circ("#16b157") + '<path d="M8.5 23.5C8.5 14 14.5 8.5 24 8.5 24 18 18.5 23.5 8.5 23.5z" fill="#fff"/><path d="M10.5 21.5L19 13" stroke="#16b157" stroke-width="1.4" stroke-linecap="round"/>',
    bitstamp: circ("#008d4c") + txt("BS", 12.5),
    cryptocom: circ("#002d74") + `<polygon points="${hexPts(10.5)}" fill="#fff"/><polygon points="${hexPts(5)}" fill="#002d74"/>`,
  };

  const sprite = '<svg width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>' + UJ + '</defs>' +
    [sym("btc", BTC), sym("eth", ETH), sym("bnb", BNB), sym("sol", SOL),
     flag("us", US), flag("eu", EU), flag("gb", GB), flag("jp", JP), flag("au", AU), flag("ca", CA)].concat(Object.keys(EXI).map((k) => sym("ex-" + k, EXI[k]))).join("") + "</svg>";
  window.__ICON_SPRITE = sprite;
  const mount = () => document.body.insertAdjacentHTML("afterbegin", sprite);
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();

/* HTML иконки актива размером px: монета — кружок, форекс — два флага внахлёст, иначе прежний значок-буква. */
function assetIcon(a, px) {
  px = px || 24;
  const e = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (ICON_FILES[a.id]) return `<img class="aic" src="${e(ICON_FILES[a.id])}" width="${px}" height="${px}" alt="">`;
  const one = (id, extra) => `<svg class="ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-hidden="true"${extra || ""}><use href="#ic-${id}" xlink:href="#ic-${id}"/></svg>`;
  const pair = PAIR_FLAGS[a.id];
  if (pair) return `<span class="aic pair">${one(pair[0])}${one(pair[1], ` style="margin-left:${-Math.round(px * 0.34)}px"`)}</span>`;
  if (COIN_ICON[a.id]) return `<span class="aic">${one(COIN_ICON[a.id])}</span>`;
  return `<span class="coin" style="background:${e(a.color)};width:${px}px;height:${px}px;line-height:${px}px;font-size:${Math.round(px * ([...String(a.badge || "")].length >= 3 ? 0.36 : [...String(a.badge || "")].length === 2 ? 0.44 : 0.54))}px">${e(a.badge)}</span>`;
}

/* Значок биржи (id биржи или "auto") размером px; для неизвестной биржи — пусто. */
const EX_ICON_IDS = ["auto", "binance", "okx", "bybit", "coinbase", "kraken", "kucoin", "yahoo", "mexc", "gateio", "bingx", "bitget", "htx", "bitfinex", "bitstamp", "cryptocom"];
function exIcon(id, px) {
  id = id || "auto"; px = px || 18;
  if (!EX_ICON_IDS.includes(id)) return "";
  return `<span class="eic"><svg class="ic" width="${px}" height="${px}" viewBox="0 0 32 32" aria-hidden="true"><use href="#ic-ex-${id}" xlink:href="#ic-ex-${id}"/></svg></span>`;
}
