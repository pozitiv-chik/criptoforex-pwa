/* Forex Игра — Mini App (чистый JS, без сборки). */
"use strict";
const tg = window.Telegram && Telegram.WebApp;
// IN_TG — внутри Telegram Mini App; в обычном браузере (ПК, ноутбук, PWA) Telegram-настройки и упоминания скрываются
const IN_TG = !!tg;
// тактильный отклик имеет смысл только в Telegram или на устройстве с вибромотором и сенсорным экраном (не на ПК/ноутбуке с мышью)
const IS_IOS = (() => { try { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } catch (e) { return false; } })();
const HAS_HAPTIC = IN_TG || IS_IOS || (() => { try { return !!navigator.vibrate && (window.matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0); } catch (e) { return false; } })();
// iPhone: у Safari нет navigator.vibrate, но переключатель <input switch> (iOS 17.4+) даёт системный тактильный отклик — дёргаем его программно
let iosHapEl = null;
function iosHaptic() {
  try {
    if (!iosHapEl) {
      iosHapEl = document.createElement("label");
      iosHapEl.setAttribute("aria-hidden", "true");
      iosHapEl.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
      const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1; iosHapEl.appendChild(i);
      document.body.appendChild(iosHapEl);
    }
    iosHapEl.click();
  } catch (e) {}
}
const LOCAL_DEMO = (() => {
  try { return !!(window.LocalDemo && LocalDemo.enabled && LocalDemo.enabled()); }
  catch (e) { return false; }
})();
// ---- тактильный отклик: единая точка для всей вибрации; отключается галочкой в Настройках
const hapOn = () => { if (!HAS_HAPTIC) return false; try { if (typeof S !== "undefined" && S && S.haptic !== undefined) return S.haptic !== false; return localStorage.getItem("haptic") !== "0"; } catch (e) { return true; } };
const hapLast = {};
// kind: sel (тик) | light | medium | heavy | rigid | soft | ok | warn | err; force — мимо ограничения частоты (для «щелчков» ползунка)
function hap(kind, force) {
  if (!hapOn()) return;
  const now = performance.now(), gap = kind === "sel" ? 24 : 36;
  if (!force && now - (hapLast[kind] || 0) < gap) return;
  hapLast[kind] = now;
  try {
    const h = tg && tg.HapticFeedback;
    if (h) {
      if (kind === "sel") h.selectionChanged();
      else if (kind === "ok") h.notificationOccurred("success");
      else if (kind === "warn") h.notificationOccurred("warning");
      else if (kind === "err") h.notificationOccurred("error");
      else h.impactOccurred(kind);
    } else if (IS_IOS) {
      iosHaptic(); if (kind === "ok" || kind === "warn" || kind === "err" || kind === "heavy") setTimeout(iosHaptic, 70);
    } else if (navigator.vibrate) {
      navigator.vibrate({ sel: 5, soft: 8, light: 12, medium: 20, rigid: 24, heavy: 32, ok: [14, 40, 14], warn: [20, 50, 20], err: [30, 40, 30, 40, 30] }[kind] || 12);
    }
  } catch (e) {}
}
// отклик на любое нажатие кнопок, чипов, строк, вкладок и переключателей
document.addEventListener("click", (e) => {
  const t = e.target && e.target.closest ? e.target.closest("button,.chip,.pill,.row.tap,.tab,[data-tf],[data-ex],.nav-i,nav [data-tab]") : null;
  if (!t || t.disabled || t.dataset.nohap || t.closest("[data-nohap]")) return;
  const lb = t.closest("label"); if (lb && lb.querySelector('input[type="checkbox"]')) return;   // у галочек свой отклик (change)
  hap(t.classList.contains("btn-green") || t.classList.contains("btn-red") ? "medium" : "light");
}, true);
document.addEventListener("change", (e) => {
  const t = e.target; if (t && t.type === "checkbox") hap(t.checked ? "medium" : "light", true);
}, true);
// ползунки: тик на каждом шаге + нажатие/отпускание
document.addEventListener("pointerdown", (e) => { const t = e.target; if (t && t.type === "range") hap("light", true); }, true);
document.addEventListener("pointerup", (e) => { const t = e.target; if (t && t.type === "range") hap("soft", true); }, true);
// ---- режим окна Telegram: compact (компактное) | full (обычное, на весь рост) | fs (полный экран, Bot API 8.0+). Хранится на устройстве.
const WIN_KEY = "winMode";
let winTs = 0;                                                       // когда окно Telegram менялось в последний раз: в этот момент случайные касания переключателей игнорируем
const winBusy = () => Date.now() - winTs < 1500;
const winMode = () => { try { const v = localStorage.getItem(WIN_KEY); return v === "compact" || v === "fs" ? v : "full"; } catch (e) { return "full"; } };
function winClasses() {
  const h = document.documentElement, fs = !!(tg && tg.isFullscreen);
  const compact = !fs && ((tg && tg.isExpanded === false) || (innerHeight < 600 && innerHeight > innerWidth));
  h.classList.toggle("fs", fs); h.classList.toggle("compact", compact);
}
function winApply() {
  if (tg) {
    const m = winMode();
    try {
      if (m === "fs") {
        if (tg.isVersionAtLeast && !tg.isVersionAtLeast("8.0")) { if (typeof toast === "function") toast("Для полного экрана нужен свежий Telegram (8.0+)"); }
        else if (!tg.isFullscreen && tg.requestFullscreen) tg.requestFullscreen();
        tg.expand();
      } else {
        if (tg.isFullscreen && tg.exitFullscreen) tg.exitFullscreen();
        if (m === "full") tg.expand();                      // compact: не раскрываем — окно остаётся компактным
      }
    } catch (e) {}
  }
  winClasses();
}
if (tg) {
  tg.ready(); winApply(); try { tg.disableVerticalSwipes(); } catch (e) {} try { tg.setHeaderColor("#16181d"); tg.setBackgroundColor("#16181d"); } catch (e) {}
  ["fullscreenChanged", "viewportChanged", "safeAreaChanged", "contentSafeAreaChanged"].forEach((ev) => { try { tg.onEvent(ev, () => { winTs = Date.now(); winClasses(); }); } catch (e) {} });
  try { tg.onEvent("fullscreenFailed", (e) => { if (typeof toast === "function") toast("Полный экран недоступен" + (e && e.error === "UNSUPPORTED" ? " в этой версии Telegram" : "")); }); } catch (e) {}
}
window.addEventListener("resize", winClasses); winClasses();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => (n >= 0 ? "+ " : "− ") + money(Math.abs(n));

// ---------------------------------------------------------------- API
const DEV_USER = new URLSearchParams(location.search).get("dev_user");
const DEV_NAME = new URLSearchParams(location.search).get("dev_name");   // DEV_MODE: ?dev_user=1&dev_name=e3to_ya — войти под этим ником
async function api(path, body) {
  if (LOCAL_DEMO) return LocalDemo.api(path, body);
  const headers = { "Content-Type": "application/json" };
  if (tg && tg.initData) headers["X-Init-Data"] = tg.initData;
  else if (DEV_USER) { headers["X-Dev-User"] = DEV_USER; if (DEV_NAME) headers["X-Dev-Username"] = DEV_NAME; }
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 10000);   // зависший запрос = нет сети
  let res;
  try { res = await fetch(path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, signal: ac.signal }); }
  catch (e) { const er = new Error("Нет связи"); er.net = true; throw er; }
  finally { clearTimeout(to); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка " + res.status);
  return data;
}
// анимации включены? (переключатель в Настройках + системное «уменьшить движение»)
const animOn = () => !(typeof S !== "undefined" && S.anim === false) && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
// Замедление ВСЕХ анимаций одним числом: переменная --ak в начале style.css (1 — как было, 2 — вдвое медленнее).
// AKs(мс) и AKt(сек) — те же длительности для JS (таймеры, inline-transition), чтобы всё шло синхронно с CSS.
const AK = (() => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ak")); return v > 0 ? v : 1; })();
const AKs = (ms) => Math.round(ms * AK);
const AKt = (sec) => +(sec * AK).toFixed(3) + "s";
// перезапустить CSS-анимацию у элемента (класс cls)
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
// списки: каскадное появление дочерних элементов (класс .enter на ~0,7 с)
function enterAnim(el) { if (!el || !animOn()) return; replay(el, "enter"); clearTimeout(el._et); el._et = setTimeout(() => el.classList.remove("enter"), AKs(700)); }
// экраны-оверлеи: заезжают справа, уезжают обратно
function showAnimated(el) { clearTimeout(el._ht); el.classList.remove("ov-out"); el.hidden = false; }
function hideAnimated(el) {
  if (el.hidden) return;
  clearTimeout(el._ht);
  if (!animOn()) { el.hidden = true; return; }
  el.classList.add("ov-out");
  el._ht = setTimeout(() => { el.hidden = true; el.classList.remove("ov-out"); }, AKs(200));
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("out"); t.hidden = false;
  if (animOn()) { t.style.animation = "none"; void t.offsetWidth; t.style.animation = ""; }
  clearTimeout(toast._t); clearTimeout(toast._h);
  toast._t = setTimeout(() => {
    if (!animOn()) { t.hidden = true; return; }
    t.classList.add("out"); toast._h = setTimeout(() => { t.hidden = true; t.classList.remove("out"); }, AKs(210));
  }, 2600);
}

// ---------------------------------------------------------------- состояние
const TIMEFRAMES = [["15 с", "15s"], ["1 м", "1"], ["5 м", "5"], ["15 м", "15"], ["1 ч", "60"], ["1 д", "D"]];
// Индикаторы виджета TradingView. id@tv-basicstudies — встроенные исследования.
// Для "mom" идентификатор не проверен на всех версиях виджета; если не рисуется — поправь здесь.
const INDICATORS = [
  { id: "trend", name: "Линия тренда", study: null, tvTools: true, info: "В TradingView-режиме слева появится панель рисования: выбери «Трендовая линия» и поставь две точки. На своём графике: коснись графика и веди палец — слева внизу появится лупа. Отпусти — точка 1, так же вторая. Линию можно двигать за кружки. 📐 — новая линия, ↶ — удалить." },
  { id: "sr", name: "Поддержка и сопротивление", study: null, tvStudy: "PivotPointsStandard@tv-basicstudies", info: "Авто-уровни: на своём графике — по недавним разворотам цены (красные — сопротивление, зелёные — поддержка); в TradingView-режиме — уровни Pivot Points (P, S1–S3, R1–R3)." },
  { id: "ma", name: "Скользящая средняя", study: "MASimple@tv-basicstudies", info: "Сглаживает цену и показывает направление тренда." },
  { id: "bb", name: "Волны Боллинджера", study: "BB@tv-basicstudies", info: "Канал волатильности вокруг скользящей средней." },
  { id: "atr", name: "ATR", study: "ATR@tv-basicstudies", info: "Средний истинный диапазон (14) — мера волатильности." },
  { id: "mom", name: "Momentum", study: "Momentum@tv-basicstudies", info: "Скорость изменения цены (10): выше 0 — рост, ниже 0 — падение." },
  { id: "rsi", name: "RSI", study: "RSI@tv-basicstudies", info: "Перекупленность (>70) / перепроданность (<30)." },
  { id: "macd", name: "MACD", study: "MACD@tv-basicstudies", info: "Схождение/расхождение скользящих средних (12, 26, 9)." },
  { id: "stoch", name: "Stochastic", study: "Stochastic@tv-basicstudies", info: "Положение цены внутри недавнего диапазона (14, 3, 3)." },
];
// ---- настройки индикаторов: значения по умолчанию и поля окна «Настройки»
const PALETTE = ["#e85454", "#f29b4a", "#f1c94b", "#2e9e3a", "#38bdf8", "#a78bfa", "#e5e7eb", "#f472b6"];
const WIDTHS = [1, 2, 3, 4];
const DEF = {
  trend: { color: "#e85454", width: 2 },
  sr: { levels: 2, touches: 2, colR: "#e03500", wR: 1, colS: "#2e9e3a", wS: 1 },
  ma: { period: 20, type: "SMA", color: "#f5b301", width: 1 },
  bb: { period: 20, mult: 2, color: "#f5b301", width: 1, bandColor: "#5b9bd5", bandW: 1 },
  atr: { period: 14, color: "#f59e0b", width: 1 },
  mom: { period: 10, color: "#38bdf8", width: 1 },
  rsi: { period: 14, color: "#a78bfa", width: 1, ob: 70, obColor: "#f29b4a", obW: 1, os: 30, osColor: "#f1c94b", osW: 1 },
  macd: { fast: 12, slow: 26, signal: 9, color: "#38bdf8", width: 1, sColor: "#f59e0b", sWidth: 1, hUp: "#2e9e3a", hDown: "#e03500" },
  stoch: { slow: 3, period: 14, color: "#38bdf8", width: 1, dPeriod: 3, dColor: "#f59e0b", dWidth: 1,
           ob: 80, obColor: "#f29b4a", obW: 1, os: 20, osColor: "#f1c94b", osW: 1 },
};
const fN = (k, label, min, max, dec) => ({ k, label, t: "num", min, max, dec });
const fC = (k, label) => ({ k, label: label || "Цвет", t: "color" });
const fW = (k, label) => ({ k, label: label || "Толщина", t: "width" });
const fS = (k, label, opts) => ({ k, label, t: "sel", opts });
const SCHEMA = {
  trend: [{ f: [fC("color"), fW("width")] }],
  sr: [{ f: [fN("levels", "Уровней с каждой стороны", 1, 4), fN("touches", "Мин. касаний", 2, 6)] },
       { title: "Сопротивление", f: [fC("colR"), fW("wR")] }, { title: "Поддержка", f: [fC("colS"), fW("wS")] }],
  ma: [{ f: [fN("period", "Период", 2, 500), fC("color"), fW("width")] }, { f: [fS("type", "Тип", ["SMA", "EMA"])] }],
  bb: [{ title: "Средняя линия", f: [fN("period", "Период", 2, 500), fC("color"), fW("width")] },
       { title: "Полосы", f: [fN("mult", "Откл. (σ)", 0.5, 6, true), fC("bandColor"), fW("bandW")] }],
  atr: [{ f: [fN("period", "Период", 1, 200), fC("color"), fW("width")] }],
  mom: [{ f: [fN("period", "Период", 1, 200), fC("color"), fW("width")] }],
  rsi: [{ f: [fN("period", "Период", 2, 200), fC("color"), fW("width")] },
        { title: "Перекупленность", f: [fN("ob", "Процент", 51, 99), fC("obColor"), fW("obW")] },
        { title: "Перепроданность", f: [fN("os", "Процент", 1, 49), fC("osColor"), fW("osW")] }],
  macd: [{ f: [fN("fast", "Быстрая", 2, 200), fN("slow", "Медленная", 3, 400), fN("signal", "Сигнал", 1, 100)] },
         { title: "Линия MACD", f: [fC("color"), fW("width")] }, { title: "Сигнальная линия", f: [fC("sColor"), fW("sWidth")] },
         { title: "Гистограмма", f: [fC("hUp", "Цвет роста"), fC("hDown", "Цвет падения")] }],
  stoch: [{ f: [fN("slow", "Сглаживание", 1, 50)] },
          { title: "%K", f: [fN("period", "Период", 2, 200), fC("color"), fW("width")] },
          { title: "%D", f: [fN("dPeriod", "Период", 1, 50), fC("dColor"), fW("dWidth")] },
          { title: "Перекупленность", f: [fN("ob", "Процент", 51, 99), fC("obColor"), fW("obW")] },
          { title: "Перепроданность", f: [fN("os", "Процент", 1, 49), fC("osColor"), fW("osW")] }],
};
const cfgOf = (id) => ({ ...DEF[id], ...((S.indSet && S.indSet[id]) || {}) });
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

const LESSONS = [
  ["Что такое валютная пара", "EUR/USD — сколько долларов стоит один евро. Растёт пара — евро дорожает."],
  ["Как читать свечи", "Зелёная свеча — цена выросла за период, красная — упала. Тени — крайние точки."],
  ["Вверх и Вниз", "«Вверх» выигрывает при росте цены после входа, «Вниз» — при падении."],
  ["Управление рисками", "Не ставь больше 1–2% депозита на одну сделку. Убыток ограничен ставкой."],
  ["Индикаторы: RSI и MACD", "Подсказывают перекупленность и смену импульса. Не работают в одиночку."],
];

const S = {
  assets: [], cfg: {}, ui: {}, balance: 0,
  asset: "EURUSD", tabs: [], tf: "5", indicators: [], indSet: {}, trends: {}, ex: null, pex: null, exNames: {}, leverage: 100, favorites: [], stake: 1, chartTheme: "dark", theme: "default", themeBg: "#16181d",
  quote: null, trades: [], page: "trade", chartKey: "", chartMode: "own", chartCfg: {}, currency: "USD", rates: {}, ratesLive: false,
  pre: { tp: null, sl: null, on: true },   // заготовка TP/SL для новых сделок: % от ставки (null = не задан)
  isAdmin: false, exMiss: 0,
};
const assetById = (id) => S.assets.find((a) => a.id === id);
const assetExchanges = () => { const a = assetById(S.asset); return a && a.exchanges ? a.exchanges : []; };
const exName = (id) => (S.exNames && S.exNames[id]) || id;
const exQ = () => (S.ex ? "&ex=" + S.ex : "");

// Таймфрейм и индикаторы хранятся ОТДЕЛЬНО для каждой монеты (S.chartCfg[id]);
// S.tf / S.indicators — рабочая копия настроек текущей монеты.
function storeCfg() { S.chartCfg[S.asset] = { tf: S.tf, indicators: S.indicators, ind: S.indSet, trends: S.trends, ex: S.ex, pex: S.pex }; }
function loadCfg() {
  const c = S.chartCfg[S.asset] || {};
  S.tf = TIMEFRAMES.some((t) => t[1] === c.tf) ? c.tf : "5";
  S.indicators = Array.isArray(c.indicators) ? c.indicators.slice() : [];
  S.indSet = (c.ind && typeof c.ind === "object") ? c.ind : {};
  S.ex = assetExchanges().includes(c.ex) ? c.ex : null;   // null = «авто»
  S.pex = c.pex === "auto" || assetExchanges().includes(c.pex) ? c.pex : null;   // предыдущая биржа ("auto" = авто)
  S.trends = (c.trends && typeof c.trends === "object") ? c.trends : {};   // {таймфрейм: [{t1,p1,t2,p2}]}
  LW.pending = null; LW.sel = -1; LW.place = false;
  $("btn-tf").textContent = TIMEFRAMES.find((t) => t[1] === S.tf)[0];
}
let saveTimer;
function saveUi() {
  storeCfg();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api("/api/ui", { tabs: S.tabs, asset: S.asset,
                     favorites: S.favorites, stake: S.stake, chart_cfg: S.chartCfg, chart_mode: S.chartMode, theme: S.theme, theme_custom: customColors(), currency: S.currency, leverage: S.leverage, pre_levels: S.pre, hints: S.hints !== false, arb_hints: S.arbHints !== false, anim: S.anim !== false, haptic: S.haptic !== false }).catch(() => {});
  }, 500);
}

// ---------------------------------------------------------------- TradingView
function mountTV(container, script, cfg) {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "tradingview-widget-container";
  box.style.cssText = "width:100%;height:100%";
  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  inner.style.cssText = "width:100%;height:100%";
  box.appendChild(inner);
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/external-embedding/" + script;
  s.async = true;
  s.text = JSON.stringify(cfg);          // виджет читает конфиг из содержимого <script>
  box.appendChild(s);
  container.appendChild(box);
}

// ---------------------------------------------------------------- темы оформления
// default — прежний тёмный вид. telegram — подхватывает цвета Telegram пользователя.
let FX_RGB = "150,205,255";   // цвет искр нижнего бара (r,g,b); в теме «Свой цвет» берётся из цвета кнопок
const THEMES = {
  default: { name: "Стандартная", dark: true, v: { bg: "#16181d", card: "#1f2227", card2: "#272b32", line: "#2e3239", text: "#ffffff", muted: "#8b9099",
    sheet: "#22252b", pop: "#2b2f36", border2: "#555555", inv: "#ffffff", invT: "#000000", toast: "#333333", toastT: "#ffffff" } },
  midnight: { name: "Полночь (синяя)", dark: true, v: { bg: "#0d1526", card: "#14203a", card2: "#1a2848", line: "#243659", text: "#eaf1ff", muted: "#8296b8",
    sheet: "#111c33", pop: "#1a2848", border2: "#35508a", inv: "#ffffff", invT: "#0d1526", toast: "#243659", toastT: "#ffffff" } },
  graphite: { name: "Графит", dark: true, v: { bg: "#202124", card: "#2a2b2f", card2: "#34363b", line: "#44464c", text: "#f1f3f4", muted: "#9aa0a6",
    sheet: "#27282c", pop: "#34363b", border2: "#5f6368", inv: "#ffffff", invT: "#202124", toast: "#44464c", toastT: "#ffffff" } },
  emerald: { name: "Изумруд", dark: true, v: { bg: "#0b1a16", card: "#12291f", card2: "#183629", line: "#21493a", text: "#e8fff4", muted: "#7fa896",
    sheet: "#0f211b", pop: "#183629", border2: "#2f6a53", inv: "#ffffff", invT: "#0b1a16", toast: "#21493a", toastT: "#ffffff" } },
  violet: { name: "Фиолет", dark: true, v: { bg: "#17102a", card: "#221842", card2: "#2c2058", line: "#3d2f73", text: "#f3edff", muted: "#a395cc",
    sheet: "#1d1536", pop: "#2c2058", border2: "#5b48a3", inv: "#ffffff", invT: "#17102a", toast: "#3d2f73", toastT: "#ffffff" } },
  sand: { name: "Светлая (песок)", dark: false, v: { bg: "#f6f1e7", card: "#ebe4d4", card2: "#e0d7c2", line: "#d3c9b0", text: "#2b2418", muted: "#7d735d",
    sheet: "#f6f1e7", pop: "#ebe4d4", border2: "#b8ac8e", inv: "#2b2418", invT: "#f6f1e7", toast: "#2b2418", toastT: "#ffffff" } },
  light: { name: "Светлая", dark: false, v: { bg: "#f4f6fa", card: "#e8ecf3", card2: "#dce2ec", line: "#cfd6e2", text: "#12161f", muted: "#6b7280",
    sheet: "#ffffff", pop: "#e8ecf3", border2: "#b6bfce", inv: "#12161f", invT: "#ffffff", toast: "#222222", toastT: "#ffffff" } },
  telegram: { name: "Как в Telegram", auto: true, tgOnly: true },
  custom: { name: "Свой цвет", custom: true },
  tgnight: { name: "Telegram Night", dark: true, v: { bg: "#17212b", card: "#1e2a38", card2: "#242f3d", line: "#2b3a4a", text: "#f5f5f5", muted: "#7f91a4",
    sheet: "#1c2733", pop: "#242f3d", border2: "#3c4f63", inv: "#ffffff", invT: "#17212b", toast: "#2b3a4a", toastT: "#ffffff" }, acc: "#5288c1", tgOnly: true },
  tgday: { name: "Telegram Day", dark: false, v: { bg: "#ffffff", card: "#f1f3f5", card2: "#e6e9ed", line: "#dfe3e8", text: "#0f1419", muted: "#707579",
    sheet: "#ffffff", pop: "#f1f3f5", border2: "#c4c9cf", inv: "#0f1419", invT: "#ffffff", toast: "#222222", toastT: "#ffffff" }, acc: "#3390ec", tgOnly: true },
  amoled: { name: "Чёрная (AMOLED)", dark: true, v: { bg: "#000000", card: "#0e0e0e", card2: "#161616", line: "#222222", text: "#ffffff", muted: "#7d838c",
    sheet: "#0b0b0b", pop: "#151515", border2: "#3a3a3a", inv: "#ffffff", invT: "#000000", toast: "#222222", toastT: "#ffffff" } },
};
function hexDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return true;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}
function hexLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
// тема Telegram: две краски темы (акцент и текст). Светлая — на место зелёного (вверх), тёмная — на место красного (вниз).
function tgUpDown(p) {
  const a = p.button_color, b = p.text_color;
  const la = hexLum(a), lb = hexLum(b);
  if (la == null || lb == null || Math.abs(la - lb) < 25) return null;       // нет двух разных цветов — оставляем зелёный/красный
  return la > lb ? { up: a, down: b } : { up: b, down: a };
}
// ---- тема «Свой цвет»: два цвета (фон и кнопки), всё остальное считается от них
const HEX6 = /^#[0-9a-f]{6}$/i;
// ввод цвета кодом: «#292929», «292929» или короткий «#222» -> «#292929» (иначе null)
const normHex = (s) => { s = String(s || "").trim().replace(/^#/, ""); if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, "$&$&"); return /^[0-9a-f]{6}$/i.test(s) ? "#" + s.toLowerCase() : null; };
const CUSTOM_DEF = { bg: "#16181d", btn: "#3b82f6" };
function customColors() {
  let c = S.custom;
  if (!c) { try { c = JSON.parse(localStorage.getItem("themeCustom") || "null"); } catch (e) { c = null; } }
  return { bg: c && HEX6.test(c.bg) ? c.bg : CUSTOM_DEF.bg, btn: c && HEX6.test(c.btn) ? c.btn : CUSTOM_DEF.btn };
}
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = (r) => "#" + r.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
function customTheme() {
  const { bg, btn } = customColors(), dark = hexDark(bg), hi = dark ? "#ffffff" : "#000000";
  const text = dark ? "#ffffff" : "#0f1419", m = (t) => mixHex(bg, hi, t), r = hexRgb(btn);
  const mixRgb = (to, t) => mixHex(btn, to, t).slice(1).match(/../g).map((s) => parseInt(s, 16)).join(",");
  return { dark, ud: null, mono: btn, acc: { c: btn, t: null },
    fx: [mixRgb("#ffffff", 0.55), r.join(","), mixRgb("#000000", 0.45)],
    v: { bg, card: m(dark ? 0.06 : 0.045), card2: m(dark ? 0.11 : 0.085), line: m(dark ? 0.17 : 0.13), text, muted: mixHex(text, bg, 0.5),
       sheet: m(dark ? 0.04 : 0.02), pop: m(dark ? 0.09 : 0.06), border2: m(dark ? 0.3 : 0.24), inv: text, invT: bg, toast: m(dark ? 0.16 : 0.7), toastT: dark ? "#ffffff" : "#ffffff" } };
}
function resolveTheme(id) {
  const t = THEMES[id] || THEMES.default;
  if (t.custom) return customTheme();
  if (!t.auto) return { dark: t.dark, ud: null, v: t.v, acc: t.acc ? { c: t.acc, t: null } : null };
  const p = (tg && tg.themeParams) || {};
  if (!p.bg_color) return { dark: THEMES.default.dark, ud: null, v: THEMES.default.v };     // не в Telegram — стандартная
  const dark = hexDark(p.bg_color), card = p.secondary_bg_color || p.bg_color;
  return { dark, ud: tgUpDown(p), acc: p.button_color ? { c: p.button_color, t: p.button_text_color || null } : null, v: { bg: p.bg_color, card, card2: p.section_bg_color || p.header_bg_color || card, line: p.section_separator_color || "rgba(128,128,128,.3)",
    text: p.text_color || (dark ? "#fff" : "#000"), muted: p.hint_color || "#8b9099", sheet: p.bg_color, pop: p.section_bg_color || card,
    border2: "rgba(128,128,128,.5)", inv: p.text_color || (dark ? "#fff" : "#000"), invT: p.bg_color, toast: p.text_color || "#333", toastT: p.bg_color } };
}
function applyTheme(id, redraw) {
  if (!THEMES[id]) id = "default";
  const th = resolveTheme(id), v = th.v, st = document.documentElement.style;
  S.theme = id; S.chartTheme = th.dark ? "dark" : "light"; S.themeBg = v.bg;
  const map = { bg: "--bg", card: "--card", card2: "--card2", line: "--line", text: "--text", muted: "--muted", sheet: "--sheet", pop: "--pop",
    border2: "--border2", inv: "--inv", invT: "--inv-t", toast: "--toast", toastT: "--toast-t" };
  Object.keys(map).forEach((k) => st.setProperty(map[k], v[k]));
  if (redraw && animOn()) { const h = document.documentElement; h.classList.add("theming"); clearTimeout(applyTheme._t); applyTheme._t = setTimeout(() => h.classList.remove("theming"), AKs(450)); }
  document.documentElement.classList.toggle("light", !th.dark);
  // кнопки и акценты: в темах Telegram — цвет кнопок Telegram, иначе прежние (зелёный / серые кружки)
  const acc = th.acc, inkOn = (c) => ((hexLum(c) == null ? 100 : hexLum(c)) > 150 ? "#000000" : "#ffffff");
  const ac = acc ? acc.c : "#2e9e3a", at = acc ? (acc.t || inkOn(ac)) : "#ffffff";
  st.setProperty("--accent", ac); st.setProperty("--accent-t", at); st.setProperty("--sel", acc ? ac : "#e03500");
  st.setProperty("--round", acc ? ac : "rgba(110,110,110,.85)"); st.setProperty("--round-t", acc ? at : "#ffffff");
  // свечи и кнопки «Вверх/Вниз»
  const up = th.ud ? th.ud.up : "#2e9e3a", down = th.ud ? th.ud.down : "#e03500";
  COLOR_UP = up; COLOR_DOWN = down;                                              // свечи остаются зелёными/красными (или как в теме Telegram)
  const ink = (c) => ((hexLum(c) == null ? 100 : hexLum(c)) > 150 ? "#000000" : "#ffffff");
  const bu = th.mono || up, bd = th.mono || down;                                // «Своя» тема: кнопки «Вверх/Вниз» тоже одного цвета
  st.setProperty("--up", bu); st.setProperty("--down", bd); st.setProperty("--up-t", ink(bu)); st.setProperty("--down-t", ink(bd));
  document.documentElement.classList.toggle("th-custom", !!th.mono);
  if (th.fx) { st.setProperty("--fx1", th.fx[0]); st.setProperty("--fx2", th.fx[1]); st.setProperty("--fx3", th.fx[2]); st.setProperty("--fx-alt", th.fx[1]); }
  else ["--fx1", "--fx2", "--fx3", "--fx-alt"].forEach((k) => st.removeProperty(k));   // нижний бар и эффекты — прежний голубой
  FX_RGB = th.fx ? th.fx[0] : "150,205,255";
  if (LW.series) { try { LW.series.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down }); LW.markerKey = ""; } catch (e) {} }
  try { localStorage.setItem("theme", id); } catch (e) {}
  // статус-бар / системная панель: красим под фон темы (Chrome/Android, Safari, Telegram)
  try {
    const mt = document.getElementById("meta-theme"), ms = document.getElementById("meta-scheme");
    if (mt) mt.setAttribute("content", v.bg);
    if (ms) ms.setAttribute("content", th.dark ? "dark" : "light");
    document.documentElement.style.backgroundColor = v.bg;
  } catch (e) {}
  if (tg) { try { tg.setHeaderColor(v.bg); tg.setBackgroundColor(v.bg); } catch (e) {} }
  if (redraw) {
    if (LW.chart) { try { LW.chart.applyOptions(lwTheme()); } catch (e) {} }
    if (S.chartMode === "tv") renderTV(true);
    LW.lvKey = "";
    try { if (S.assets && S.assets.length) renderAnalytics(true); } catch (e) {}   // виджеты аналитики — под новую тему
  }
}

try { applyTheme(localStorage.getItem("theme") || "default"); } catch (e) {}   // сразу при загрузке, без мигания
if (tg && tg.onEvent) tg.onEvent("themeChanged", () => { if (S.theme === "telegram") applyTheme("telegram", true); });

function renderTV(force) {
  const a = assetById(S.asset); if (!a) return;
  const studies = INDICATORS.filter((i) => S.indicators.includes(i.id) && (i.study || i.tvStudy)).map((i) => i.study || i.tvStudy);
  const tools = S.indicators.includes("trend");   // панель рисования TradingView (трендовые линии и т. п.)
  const tvInterval = S.tf === "15s" ? "1" : S.tf;   // секундных свечей в виджете нет
  const key = [a.tv, tvInterval, studies.join(), S.chartTheme, S.themeBg, tools].join("|");
  if (!force && key === S.chartKey) return;
  S.chartKey = key;
  const dark = S.chartTheme === "dark";
  mountTV($("tv-chart"), "embed-widget-advanced-chart.js", {
    autosize: true, symbol: a.tv, interval: tvInterval, timezone: "Etc/UTC",
    theme: S.chartTheme, style: "1", locale: "ru",
    backgroundColor: S.themeBg,
    gridColor: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)",
    hide_top_toolbar: true, hide_side_toolbar: !tools, hide_legend: true,
    allow_symbol_change: false, save_image: false, withdateranges: false,
    calendar: false, support_host: "https://www.tradingview.com", studies,
  });
}

// ---------------------------------------------------------------- свой график (lightweight-charts)
// Тот же движок графиков, что у TradingView, но данные — с нашего сервера:
// цена на графике == цена, по которой считается PnL, поэтому нет рассинхрона,
// и на график можно ставить линию входа.
const LW_SOURCES = ["lightweight-charts.js",
  "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
  "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"];
const TF_SEC = { "15s": 15, "1": 60, "5": 300, "15": 900, "60": 3600, "D": 86400 };
let COLOR_UP = "#2e9e3a", COLOR_DOWN = "#e03500";   // меняются темой «Как в Telegram»
let lwPromise = null, lwOk = null;
const LW = { chart: null, series: null, key: "", candles: [], lines: new Map(), markerKey: "", ov: {}, ovLen: {}, oscKey: "", sr: [], srN: -1, trendN: -1, pending: null, cur: null, sel: -1, place: false, tn: [], tKey: "", drag: null, snap: null, lvl: {},
  lv: new Map(), pills: new Map(), drag2: null, hold: null };   // линии и «пилюли» TP/SL
const lwTime = (sec) => sec - new Date().getTimezoneOffset() * 60;   // показываем местное время

function loadLW() {
  if (window.LightweightCharts) return Promise.resolve(true);
  if (lwPromise) return lwPromise;
  lwPromise = (async () => {
    for (const src of LW_SOURCES) {
      const ok = await new Promise((res) => {
        const el = document.createElement("script"); el.src = src;
        el.onload = () => res(!!window.LightweightCharts); el.onerror = () => res(false);
        document.head.appendChild(el);
      });
      if (ok) return true;
    }
    return false;
  })();
  return lwPromise;
}
function lwTheme() {
  const dark = S.chartTheme === "dark";
  return { layout: { background: { type: "solid", color: S.themeBg }, textColor: dark ? "#8b9099" : "#555" },
           grid: { vertLines: { color: dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.06)" }, horzLines: { color: dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.06)" } } };
}
function ensureLW() {
  if (LW.chart) return;
  LW.chart = LightweightCharts.createChart($("lw-chart"), {
    autoSize: true, ...lwTheme(),
    rightPriceScale: { borderVisible: false }, crosshair: { mode: 0 },
    timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false, rightOffset: 6 },
  });
  LW.series = LW.chart.addCandlestickSeries({ upColor: COLOR_UP, downColor: COLOR_DOWN, borderVisible: false,
    wickUpColor: COLOR_UP, wickDownColor: COLOR_DOWN });
  LW.chart.subscribeClick(onChartClick);
  initTrendUi(); requestAnimationFrame(trendFrame); requestAnimationFrame(tpslFrame);
  let rzT = 0;
  if (window.ResizeObserver) new ResizeObserver(() => { drawLegend(); clearTimeout(rzT); rzT = setTimeout(() => { if (!LW.userMoved) defaultView(); }, 150); }).observe($("lw-chart"));
  const box = $("lw-chart");
  box.addEventListener("wheel", () => { LW.userMoved = true; }, { passive: true });
  box.addEventListener("pointermove", (e) => { if (e.buttons > 0 && e.pointerType !== "") LW.userMoved = true; }, { passive: true });
  box.addEventListener("touchmove", () => { LW.userMoved = true; }, { passive: true });
}
function renderOwn(force) {
  loadLW().then((ok) => {
    if (!ok) { lwOk = false; toast("Свой график не загрузился — включён TradingView"); renderChart(true); return; }
    lwOk = true; ensureLW();
    LW.chart.applyOptions({ ...lwTheme(), timeScale: { secondsVisible: S.tf === "15s" } });
    const key = S.asset + "|" + S.tf + "|" + (S.ex || "");
    if (force || key !== LW.key) loadOwnCandles(); else updateOverlays();
  });
}
function defaultView() {
  const n = LW.candles && LW.candles.length;
  if (!LW.chart || !n) return;
  try {
    LW.chart.priceScale("right").applyOptions({ autoScale: true });
    LW.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 90), to: n + 6 });
  } catch (e) {}
}
// пока пользователь сам не двигал график — держим его «нормальным» (после загрузки, поворота экрана, смены размера)
function settleView(key) {
  const go = () => { if (!LW.userMoved && (!key || LW.key === key)) defaultView(); };
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 350); setTimeout(go, 1200);
}
async function loadOwnCandles() {
  const a = assetById(S.asset), key = S.asset + "|" + S.tf + "|" + (S.ex || "");
  LW.key = key; LW.userMoved = false; LW.candles = []; LW.ovLen = {}; LW.srN = -1; LW.trendN = -1; LW.sel = -1; LW.tKey = ""; clearPending();
  LW.lines.forEach((l) => LW.series.removePriceLine(l)); LW.lines.clear(); LW.markerKey = "";
  LW.lv.forEach((v) => LW.series.removePriceLine(v.line)); LW.lv.clear();
  try {
    const { candles } = await api(`/api/candles?asset=${S.asset}&tf=${S.tf}${exQ()}`);
    if (LW.key !== key) return;                       // пока грузили, переключили актив
    LW.candles = candles.map((c) => ({ ...c, time: lwTime(c.time) }));
    if (!LW.candles.length && S.tf !== "15s") {
      if ((LW.retry = (LW.key === LW.retryKey ? LW.retry : 0) + 1, LW.retryKey = key, LW.retry) <= 6) setTimeout(() => { if (LW.key === key) loadOwnCandles(); }, 2500);   // биржа моргнула — пробуем снова
      else toast(S.ex ? exName(S.ex) + ": нет данных графика" : "Нет данных графика");
    }
    if (LW.candles.length) LW.retry = 0;
    LW.series.applyOptions({ priceFormat: { type: "price", precision: a.decimals, minMove: Math.pow(10, -a.decimals) } });
    LW.series.setData(LW.candles);
    defaultView(); settleView(key);
    syncLines(); updateOverlays();
  } catch (e) { if (e.net) NET.reload = true; else toast("График: " + e.message); }
}
function updateLive(q) {
  if (!LW.series || !q || q.asset !== S.asset || LW.key !== S.asset + "|" + S.tf + "|" + (S.ex || "")) return;
  if (!LW.candles.length && S.tf !== "15s") return;   // история ещё грузится
  const sec = TF_SEC[S.tf], b = lwTime(Math.floor(q.ts / sec) * sec);
  let last = LW.candles[LW.candles.length - 1];
  if (!last || b > last.time) {
    last = { time: b, open: last ? last.close : q.price, high: q.price, low: q.price, close: q.price };
    last.high = Math.max(last.open, q.price); last.low = Math.min(last.open, q.price);
    LW.candles.push(last);
  } else if (b === last.time) {
    last.high = Math.max(last.high, q.price); last.low = Math.min(last.low, q.price); last.close = q.price;
  } else return;
  LW.series.update(last);
  updateOverlays();
}
// линия цены входа + стрелка на свече открытия
function syncLines() {
  if (!LW.series || LW.key !== S.asset + "|" + S.tf + "|" + (S.ex || "")) return;
  syncLevels();
  const mine = S.trades.filter(onThisMarket);
  const ids = new Set(mine.map((t) => t.id));
  LW.lines.forEach((l, id) => { if (!ids.has(id)) { LW.series.removePriceLine(l); LW.lines.delete(id); } });
  mine.forEach((t) => {
    if (LW.lines.has(t.id)) return;
    const up = t.direction === "up";
    LW.lines.set(t.id, LW.series.createPriceLine({
      price: t.entry_price, color: "#aab2c0", lineWidth: 1, lineStyle: 1,
      axisLabelVisible: false, title: "" }));
  });
  const mk = mine.map((t) => t.id).join();
  if (mk !== LW.markerKey) {
    LW.markerKey = mk;
    const sec = TF_SEC[S.tf], first = LW.candles.length ? LW.candles[0].time : 0;
    LW.series.setMarkers(mine.map((t) => ({ time: lwTime(Math.floor(t.opened_at / sec) * sec), up: t.direction === "up", t }))
      .filter((m) => m.time >= first).sort((x, y) => x.time - y.time)
      .map((m) => ({ time: m.time, position: m.up ? "belowBar" : "aboveBar", shape: m.up ? "arrowUp" : "arrowDown",
                     color: m.up ? COLOR_UP : COLOR_DOWN })));
  }
}
// ---------------------------------------------------------------- индикаторы на своём графике
// Всё считается в браузере по свечам с нашего сервера (те же цены, что в PnL).
// lightweight-charts 4.x не умеет отдельные панели, поэтому осцилляторы рисуются
// на своих шкалах цены, которым выделены горизонтальные полосы под основным графиком.
const OSC_ORDER = ["atr", "mom", "rsi", "macd", "stoch"];
const C_BLUE = "#38bdf8", C_ORANGE = "#f59e0b", C_VIOLET = "#a78bfa";

function calcSMA(a, n) {
  const out = new Array(a.length).fill(null); let sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null) { sum = 0; cnt = 0; continue; }
    sum += a[i]; cnt++;
    if (cnt > n) { sum -= a[i - n]; cnt = n; }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
}
function calcEMA(a, n) {
  const out = new Array(a.length).fill(null), k = 2 / (n + 1);
  let prev = null, buf = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] == null) continue;
    if (prev === null) { buf.push(a[i]); if (buf.length === n) { prev = buf.reduce((x, y) => x + y, 0) / n; out[i] = prev; } }
    else { prev = a[i] * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}
function calcATR(cs, n) {
  const out = new Array(cs.length).fill(null), tr = cs.map((c, i) =>
    i ? Math.max(c.high - c.low, Math.abs(c.high - cs[i - 1].close), Math.abs(c.low - cs[i - 1].close)) : c.high - c.low);
  if (cs.length < n) return out;
  let a = 0; for (let i = 0; i < n; i++) a += tr[i]; a /= n; out[n - 1] = a;
  for (let i = n; i < cs.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}
function calcRSI(cs, n) {
  const out = new Array(cs.length).fill(null); if (cs.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = cs[i].close - cs[i - 1].close; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < cs.length; i++) {
    const d = cs[i].close - cs[i - 1].close;
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n; l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function oscDef(id) {
  const s = cfgOf(id);
  if (id === "atr") return { label: `ATR (${s.period})`, lines: [{ k: "v", color: s.color, w: s.width }], levels: [], calc: (cs) => ({ v: calcATR(cs, s.period) }) };
  if (id === "mom") return { label: `Momentum (${s.period})`, lines: [{ k: "v", color: s.color, w: s.width }], levels: [{ v: 0, color: "rgba(139,144,153,.7)", w: 1 }],
    calc: (cs) => ({ v: cs.map((c, i) => (i >= s.period ? c.close - cs[i - s.period].close : null)) }) };
  if (id === "rsi") return { label: `RSI (${s.period})`, lines: [{ k: "v", color: s.color, w: s.width }], fixed: [0, 100],
    levels: [{ v: s.os, color: s.osColor, w: s.osW }, { v: s.ob, color: s.obColor, w: s.obW }], calc: (cs) => ({ v: calcRSI(cs, s.period) }) };
  if (id === "macd") {
    const f = Math.min(s.fast, s.slow - 1), sl = s.slow;
    return { label: `MACD (${f}, ${sl}, ${s.signal})`, levels: [{ v: 0, color: "rgba(139,144,153,.7)", w: 1 }],
      lines: [{ k: "h", hist: true, up: s.hUp, down: s.hDown }, { k: "m", color: s.color, w: s.width }, { k: "s", color: s.sColor, w: s.sWidth }],
      calc: (cs) => {
        const cl = cs.map((c) => c.close), e1 = calcEMA(cl, f), e2 = calcEMA(cl, sl);
        const m = cl.map((_, i) => (e1[i] != null && e2[i] != null ? e1[i] - e2[i] : null)), sg = calcEMA(m, s.signal);
        return { m, s: sg, h: m.map((v, i) => (v != null && sg[i] != null ? v - sg[i] : null)) };
      } };
  }
  return { label: `Stochastic (${s.period}, ${s.slow}, ${s.dPeriod})`, fixed: [0, 100],
    lines: [{ k: "k", color: s.color, w: s.width }, { k: "d", color: s.dColor, w: s.dWidth }],
    levels: [{ v: s.os, color: s.osColor, w: s.osW }, { v: s.ob, color: s.obColor, w: s.obW }],
    calc: (cs) => {
      const n = s.period, raw = cs.map((c, i) => {
        if (i < n - 1) return null;
        let hh = -Infinity, ll = Infinity;
        for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, cs[j].high); ll = Math.min(ll, cs[j].low); }
        return hh === ll ? 50 : ((c.close - ll) / (hh - ll)) * 100;
      });
      const k = calcSMA(raw, s.slow); return { k, d: calcSMA(k, s.dPeriod) };
    } };
}
const toData = (cs, arr) => { const o = []; for (let i = 0; i < cs.length; i++) if (arr[i] != null && isFinite(arr[i])) o.push({ time: cs[i].time, value: arr[i] }); return o; };

// единый «подать данные в серию»: полная загрузка при смене числа свечей, иначе обновление последней точки
function feed(name, data, make) {
  if (!data) { if (LW.ov[name]) { LW.chart.removeSeries(LW.ov[name]); delete LW.ov[name]; delete LW.ovLen[name]; } return; }
  if (!LW.ov[name]) { LW.ov[name] = make(); LW.ovLen[name] = -1; }
  if (LW.ovLen[name] !== data.length) { LW.ov[name].setData(data); LW.ovLen[name] = data.length; }
  else if (data.length) LW.ov[name].update(data[data.length - 1]);
}
const lineOpts = (color, extra) => ({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
const activeOsc = () => OSC_ORDER.filter((id) => S.indicators.includes(id));

// раскладка: сколько места под основной график, сколько под каждую панель
function layoutPanes(act) {
  const n = act.length, h = n ? Math.min(0.2, 0.58 / n) : 0;
  LW.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: n ? n * h + 0.03 : 0.08 } });
  act.forEach((id, i) => {
    const top = 1 - (n - i) * h, bottom = (n - i - 1) * h;
    LW.chart.priceScale("osc_" + id).applyOptions({ scaleMargins: { top: top + 0.025, bottom: bottom + 0.005 }, borderVisible: false, autoScale: true });
  });
  LW.panes = { n, h };
  drawLegend();
}
function drawLegend() {
  let box = $("lw-legend");
  if (!box) { box = document.createElement("div"); box.id = "lw-legend"; $("lw-chart").parentNode.appendChild(box); }
  if (!LW.chart || !LW.panes || !LW.panes.n) { box.innerHTML = ""; return; }
  const ts = LW.chart.timeScale(), axisH = typeof ts.height === "function" ? ts.height() : 26;
  const H = $("lw-chart").clientHeight - axisH, { n, h } = LW.panes;
  box.innerHTML = activeOsc().map((id, i) =>
    `<div class="lg" style="top:${Math.round(H * (1 - (n - i) * h))}px"><span>${oscDef(id).label}</span> <b data-lg="${id}"></b></div>`).join("");
  updateLegendValues();
}
function updateLegendValues() {
  document.querySelectorAll("[data-lg]").forEach((el) => {
    const id = el.dataset.lg, cs = LW.candles; if (!cs.length || !LW.oscLast) return;
    const last = LW.oscLast[id]; if (!last) return;
    const a = assetById(S.asset), f = (v) => (v == null ? "—" : id === "atr" || id === "mom" || id === "macd" ? v.toFixed(a.decimals) : v.toFixed(2));
    el.textContent = Object.keys(last).map((k) => f(last[k])).join("  ");
  });
}

// сброс всех линий индикаторов (после смены настроек): серии создаются заново с новыми цветами/периодами
function resetOverlays() {
  if (!LW.chart) return;
  Object.keys(LW.ov).forEach((n) => { try { LW.chart.removeSeries(LW.ov[n]); } catch (e) {} });
  LW.ov = {}; LW.ovLen = {}; LW.lvl = {}; LW.oscKey = ""; LW.srN = -1;
}
function updateOverlays() {
  if (!LW.chart) return;
  const cs = LW.candles, cl = cs.map((c) => c.close);
  const mk = (color, w) => () => LW.chart.addLineSeries(lineOpts(color, { lineWidth: w }));

  const sm = cfgOf("ma");
  feed("ma", S.indicators.includes("ma") && cs.length >= sm.period ? toData(cs, sm.type === "EMA" ? calcEMA(cl, sm.period) : calcSMA(cl, sm.period)) : null, mk(sm.color, sm.width));
  const sb = cfgOf("bb");
  if (S.indicators.includes("bb") && cs.length >= sb.period) {
    const P = sb.period, mid = calcSMA(cl, P), up = new Array(cs.length).fill(null), lo = new Array(cs.length).fill(null);
    for (let i = P - 1; i < cs.length; i++) {
      let v = 0; for (let j = i - P + 1; j <= i; j++) v += (cl[j] - mid[i]) ** 2;
      const sd = Math.sqrt(v / P); up[i] = mid[i] + sb.mult * sd; lo[i] = mid[i] - sb.mult * sd;
    }
    feed("bbm", toData(cs, mid), mk(sb.color, sb.width)); feed("bbu", toData(cs, up), mk(sb.bandColor, sb.bandW)); feed("bbl", toData(cs, lo), mk(sb.bandColor, sb.bandW));
  } else { feed("bbm", null); feed("bbu", null); feed("bbl", null); }

  // осцилляторы в панелях под графиком
  const act = activeOsc(), oscKey = act.join() + "|" + S.asset;
  OSC_ORDER.filter((id) => !act.includes(id)).forEach((id) => { oscDef(id).lines.forEach((l) => feed(id + "_" + l.k, null)); LW.lvl[id] = null; });
  LW.oscLast = {};
  act.forEach((id) => {
    const d = oscDef(id), res = d.calc(cs), scale = "osc_" + id;
    d.lines.forEach((l) => {
      const data = toData(cs, res[l.k]), name = id + "_" + l.k;
      if (l.hist) {
        data.forEach((p) => (p.color = hexA(p.value >= 0 ? l.up : l.down, 0.65)));
        feed(name, data, () => LW.chart.addHistogramSeries({ priceScaleId: scale, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 5, minMove: 0.00001 } }));
      } else {
        feed(name, data, () => LW.chart.addLineSeries(lineOpts(l.color, { lineWidth: l.w, priceScaleId: scale, priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
          autoscaleInfoProvider: d.fixed ? () => ({ priceRange: { minValue: d.fixed[0], maxValue: d.fixed[1] } }) : undefined })));
      }
    });
    const first = d.lines.find((l) => !l.hist), host = LW.ov[id + "_" + first.k];
    if (!LW.lvl[id] && host) {   // горизонтальные уровни (30/70, 20/80, 0) — цвет и толщина из настроек
      LW.lvl[id] = d.levels.map((L) => host.createPriceLine({ price: L.v, color: L.color, lineWidth: L.w, lineStyle: 2, axisLabelVisible: false, title: "" }));
    }
    LW.oscLast[id] = {}; d.lines.forEach((l) => { const arr = res[l.k]; LW.oscLast[id][l.k] = arr[arr.length - 1]; });
  });
  if (oscKey !== LW.oscKey) { LW.oscKey = oscKey; layoutPanes(act); }
  updateLegendValues();

  if (cs.length !== LW.srN) { LW.srN = cs.length; drawSR(); }   // уровни пересчитываем только на новой свече
}

// ---- поддержка / сопротивление: кластеры разворотных точек (фракталы), ближайшие к цене
function drawSR() {
  LW.sr.forEach((l) => { try { LW.series.removePriceLine(l); } catch (e) {} }); LW.sr = [];
  const cs = LW.candles, cf = cfgOf("sr"); if (!S.indicators.includes("sr") || cs.length < 30) return;
  const K = 3, from = Math.max(K, cs.length - 400), price = cs[cs.length - 1].close;
  const atr = calcATR(cs, 14).filter((v) => v != null).pop() || price * 0.001;
  const tol = Math.max(atr * 0.6, price * 0.0003), piv = [];
  for (let i = from; i < cs.length - K; i++) {
    let hi = true, lo = true;
    for (let j = i - K; j <= i + K; j++) { if (cs[j].high > cs[i].high) hi = false; if (cs[j].low < cs[i].low) lo = false; }
    if (hi) piv.push(cs[i].high); if (lo) piv.push(cs[i].low);
  }
  piv.sort((a, b) => a - b);
  const groups = [];
  piv.forEach((p) => { const g = groups[groups.length - 1]; if (g && p - g.sum / g.n <= tol) { g.sum += p; g.n++; } else groups.push({ sum: p, n: 1 }); });
  const lv = groups.filter((g) => g.n >= cf.touches).map((g) => ({ p: g.sum / g.n, n: g.n }));
  const above = lv.filter((x) => x.p > price).sort((a, b) => a.p - b.p).slice(0, cf.levels);
  const below = lv.filter((x) => x.p <= price).sort((a, b) => b.p - a.p).slice(0, cf.levels);
  [...above.map((x) => ({ ...x, r: true })), ...below.map((x) => ({ ...x, r: false }))].forEach((x) => {
    LW.sr.push(LW.series.createPriceLine({ price: x.p, color: x.r ? cf.colR : cf.colS, lineWidth: x.r ? cf.wR : cf.wS, lineStyle: 1,
      axisLabelVisible: true, title: (x.r ? "R " : "S ") + x.n + "×" }));
  });
}

// ---- линия тренда: ОТРЕЗОК (без продления вправо), хранится как {время, цена} и рисуется поверх графика в SVG.
// Поэтому он не влияет на масштаб цены (раньше именно продление «раздувало» шкалу и линии улетали за экран).
// Три кружка: начало, конец и середина (середина двигает всю линию). Пока палец на графике — слева внизу лупа.
const MAG = 132, ZOOM = 3, SVGNS = "http://www.w3.org/2000/svg";
const trendList = () => (S.trends[S.tf] = S.trends[S.tf] || []);
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function timeToLogical(t) {
  const cs = LW.candles; if (!cs.length) return null;
  const sec = TF_SEC[S.tf], last = cs.length - 1;
  if (t <= cs[0].time) return (t - cs[0].time) / sec;
  if (t >= cs[last].time) return last + (t - cs[last].time) / sec;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m].time <= t) lo = m; else hi = m; }
  return lo + (t - cs[lo].time) / ((cs[hi].time - cs[lo].time) || 1);
}
function logicalToTime(idx) {
  const cs = LW.candles, last = cs.length - 1, sec = TF_SEC[S.tf];
  return idx < 0 ? cs[0].time + Math.round(idx) * sec : idx > last ? cs[last].time + Math.round(idx - last) * sec : cs[Math.round(idx)].time;
}
function mainBottom() { const { n, h } = LW.panes || { n: 0, h: 0 }; return $("lw-chart").clientHeight * (1 - n * h) - 28; }
function xyToData(x, y) {                       // пиксели графика -> {время, цена}
  if (!LW.candles.length) return null;
  y = Math.min(y, mainBottom());                 // в панели индикаторов точки не ставим
  const p = LW.series.coordinateToPrice(y), idx = LW.chart.timeScale().coordinateToLogical(x);
  return p == null || idx == null ? null : { t: logicalToTime(idx), p };
}
function dataToXY(t, p) {                        // {время, цена} -> пиксели графика
  const idx = timeToLogical(t); if (idx == null) return null;
  const x = LW.chart.timeScale().logicalToCoordinate(idx), y = LW.series.priceToCoordinate(p);
  return x == null || y == null ? null : { x, y };
}
const evXY = (e) => { const r = $("lw-chart").getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

// --- лупа (слева внизу): увеличенный снимок графика вокруг точки + линия, которую ставим
function takeSnap() { LW.snap = null; try { LW.snap = LW.chart.takeScreenshot(); } catch (e) {} }
function hideMag() { $("mag").hidden = true; LW.snap = null; }
function drawMag(cx, cy, segs) {
  const c = $("mag"), dpr = window.devicePixelRatio || 1; c.hidden = false;
  if (c.width !== Math.round(MAG * dpr)) { c.width = c.height = Math.round(MAG * dpr); }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = S.themeBg; g.fillRect(0, 0, MAG, MAG);
  if (LW.snap) {
    const k = LW.snap.width / $("lw-chart").clientWidth, sw = MAG / ZOOM;
    try { g.drawImage(LW.snap, (cx - sw / 2) * k, (cy - sw / 2) * k, sw * k, sw * k, 0, 0, MAG, MAG); } catch (e) {}
  }
  const tx = (x) => (x - cx) * ZOOM + MAG / 2, ty = (y) => (y - cy) * ZOOM + MAG / 2, st = cfgOf("trend");
  g.lineCap = "round"; g.strokeStyle = st.color; g.lineWidth = Math.max(2, st.width * 1.5);
  segs.forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(tx(x1), ty(y1)); g.lineTo(tx(x2), ty(y2)); g.stroke(); });
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1; g.beginPath();
  g.moveTo(MAG / 2, MAG / 2 - 16); g.lineTo(MAG / 2, MAG / 2 + 16); g.moveTo(MAG / 2 - 16, MAG / 2); g.lineTo(MAG / 2 + 16, MAG / 2); g.stroke();
  g.beginPath(); g.arc(MAG / 2, MAG / 2, 3, 0, 6.2832); g.stroke();
}

// --- состояние интерфейса линий тренда
function syncTrendUi() {
  const own = S.chartMode === "own" && !!LW.chart, editing = own && S.indicators.includes("trend") && (LW.place || LW.sel >= 0);
  $("btn-trend").hidden = !editing; $("btn-trend").classList.toggle("on", LW.place);
  $("btn-undo-trend").hidden = !editing;
  $("place-ov").hidden = !(own && LW.place);
}
function drawTrends() { LW.tKey = ""; syncTrendUi(); }
function startPlace() {
  if (!(S.chartMode === "own" && lwOk)) return;
  if (!S.indicators.includes("trend")) { S.indicators = [...S.indicators, "trend"]; saveUi(); }
  LW.place = true; LW.pending = null; LW.sel = -1; LW.tKey = ""; syncTrendUi();
  toast("Коснись графика и веди палец — лупа слева внизу.\nОтпусти — точка 1, потом так же точка 2");
}
function stopPlace() { LW.place = false; LW.pending = null; LW.cur = null; hideMag(); syncTrendUi(); }
function clearPending() { stopPlace(); }

function initTrendUi() {
  if (initTrendUi.done) return; initTrendUi.done = true;
  const ov = $("place-ov"), svg = $("trend-svg"), noScroll = (e) => e.preventDefault();
  ov.addEventListener("touchstart", noScroll, { passive: false }); svg.addEventListener("touchstart", noScroll, { passive: false });
  const move = (e) => {
    const p = evXY(e), d = xyToData(p.x, p.y); if (!d) return;
    LW.cur = d; LW.curPx = p; const segs = [];
    if (LW.pending) { const a = dataToXY(LW.pending.t, LW.pending.p); if (a) segs.push([a.x, a.y, p.x, p.y]); }
    drawMag(p.x, p.y, segs);
  };
  ov.addEventListener("pointerdown", (e) => { e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch (x) {} LW.down = true; takeSnap(); move(e); });
  ov.addEventListener("pointermove", (e) => { if (LW.down) move(e); });
  ov.addEventListener("pointercancel", () => { LW.down = false; LW.curPx = null; hideMag(); });
  ov.addEventListener("pointerup", () => {
    if (!LW.down) return; LW.down = false; hideMag(); LW.curPx = null;
    const d = LW.cur; LW.cur = null; if (!d) return;
    if (!LW.pending) { LW.pending = d; syncTrendUi(); toast("Точка 1 есть — поставь вторую"); return; }
    const a = LW.pending;
    if (a.t === d.t) return toast("Вторая точка — на другой свече (правее или левее)");
    const list = trendList(); list.push({ t1: a.t, p1: a.p, t2: d.t, p2: d.p }); if (list.length > 5) list.shift();
    LW.sel = list.length - 1; stopPlace(); saveUi(); drawTrends();
  });
}

// --- перетаскивание кружков (конец/начало/середина)
function startDrag(e, i, which) {
  e.preventDefault(); e.stopPropagation();
  if (i !== LW.sel) { LW.sel = i; return; }       // первое касание линии только выделяет её
  const t = trendList()[i], a0 = dataToXY(t.t1, t.p1), b0 = dataToXY(t.t2, t.p2); if (!a0 || !b0) return;
  LW.drag = { i, which, a0, b0, start: evXY(e), moved: false, hd: 0 }; takeSnap(); hap("light", true);
  window.addEventListener("pointermove", dragMove); window.addEventListener("pointerup", dragEnd); window.addEventListener("pointercancel", dragEnd);
}
function dragMove(e) {
  const D = LW.drag; if (!D) return;
  const p = evXY(e), dx = p.x - D.start.x, dy = p.y - D.start.y, t = trendList()[D.i]; if (!t) return;
  D.moved = true;
  { const dd = Math.hypot(dx, dy); if (Math.abs(dd - D.hd) > 22) { D.hd = dd; hap("sel"); } }   // тик каждые ~22 px перетаскивания
  const set = (pt, x, y) => { const d = xyToData(x, y); if (d) { pt.t = d.t; pt.p = d.p; } };
  if (D.which === "1") { const q = { t: t.t1, p: t.p1 }; set(q, D.a0.x + dx, D.a0.y + dy); t.t1 = q.t; t.p1 = q.p; }
  else if (D.which === "2") { const q = { t: t.t2, p: t.p2 }; set(q, D.b0.x + dx, D.b0.y + dy); t.t2 = q.t; t.p2 = q.p; }
  else {
    const q1 = { t: t.t1, p: t.p1 }, q2 = { t: t.t2, p: t.p2 };
    set(q1, D.a0.x + dx, D.a0.y + dy); set(q2, D.b0.x + dx, D.b0.y + dy);
    t.t1 = q1.t; t.p1 = q1.p; t.t2 = q2.t; t.p2 = q2.p;
  }
  const a = dataToXY(t.t1, t.p1), b = dataToXY(t.t2, t.p2);
  const c = D.which === "1" ? { x: D.a0.x + dx, y: D.a0.y + dy } : D.which === "2" ? { x: D.b0.x + dx, y: D.b0.y + dy }
    : { x: (D.a0.x + D.b0.x) / 2 + dx, y: (D.a0.y + D.b0.y) / 2 + dy };
  drawMag(c.x, c.y, a && b ? [[a.x, a.y, b.x, b.y]] : []);
}
function dragEnd() {
  window.removeEventListener("pointermove", dragMove); window.removeEventListener("pointerup", dragEnd); window.removeEventListener("pointercancel", dragEnd);
  const moved = LW.drag && LW.drag.moved; LW.drag = null; hideMag(); if (moved) { saveUi(); hap("soft", true); }
}

// --- SVG: создаём элементы при смене набора линий, а каждый кадр только двигаем их
function rebuildTrendSvg() {
  const svg = $("trend-svg"); svg.innerHTML = ""; LW.tn = []; LW.pv = null;
  if (!S.indicators.includes("trend") || !LW.chart) return;
  const st = cfgOf("trend"), list = trendList(), hs = [];
  list.forEach((t, i) => {
    const hit = svgEl("line", { stroke: "transparent", "stroke-width": 28, "stroke-linecap": "round", "pointer-events": "stroke" });
    const line = svgEl("line", { stroke: st.color, "stroke-width": st.width, "stroke-linecap": "round", "pointer-events": "none" });
    hit.addEventListener("pointerdown", (e) => startDrag(e, i, "m"));
    svg.append(hit, line); LW.tn[i] = { hit, line, h: null };
    if (i === LW.sel) {
      const mkH = (which, mid) => {
        const g = svgEl("g", {});
        if (!mid) g.append(svgEl("circle", { r: 15, fill: hexA(st.color, 0.2), stroke: st.color, "stroke-width": 2, "pointer-events": "none" }));
        g.append(svgEl("circle", { r: mid ? 12 : 7, fill: hexA(st.color, mid ? 0.7 : 0.95), "pointer-events": "none" }));
        const hz = svgEl("circle", { r: 26, fill: "transparent", "pointer-events": "all" });
        hz.addEventListener("pointerdown", (e) => startDrag(e, i, which)); g.append(hz); return g;
      };
      LW.tn[i].h = { 1: mkH("1"), 2: mkH("2"), m: mkH("m", true) }; hs.push(LW.tn[i].h[1], LW.tn[i].h[2], LW.tn[i].h.m);
    }
  });
  hs.forEach((g) => svg.append(g));
  LW.pv = { line: svgEl("line", { stroke: st.color, "stroke-width": st.width, "stroke-linecap": "round", "pointer-events": "none" }),
            dot: svgEl("circle", { r: 6, fill: st.color, "pointer-events": "none" }) };
  svg.append(LW.pv.line, LW.pv.dot);
}
function trendFrame() {
  requestAnimationFrame(trendFrame);
  if (!LW.chart || document.hidden || S.page !== "trade") return;
  const on = S.indicators.includes("trend"), list = trendList();
  const key = [on, S.asset, S.tf, list.length, LW.sel, JSON.stringify(cfgOf("trend"))].join("|");
  if (key !== LW.tKey && !LW.drag) { LW.tKey = key; rebuildTrendSvg(); syncTrendUi(); }
  if (!on) return;
  const setL = (el, a, b) => { el.setAttribute("x1", a.x); el.setAttribute("y1", a.y); el.setAttribute("x2", b.x); el.setAttribute("y2", b.y); };
  const setC = (g, pt) => g.setAttribute("transform", `translate(${pt.x},${pt.y})`);
  list.forEach((t, i) => {
    const n = LW.tn[i]; if (!n) return;
    const a = dataToXY(t.t1, t.p1), b = dataToXY(t.t2, t.p2), vis = a && b ? "" : "none";
    n.hit.style.display = n.line.style.display = vis;
    if (n.h) Object.values(n.h).forEach((g) => (g.style.display = vis));
    if (!a || !b) return;
    setL(n.hit, a, b); setL(n.line, a, b);
    if (n.h) { setC(n.h[1], a); setC(n.h[2], b); setC(n.h.m, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); }
  });
  if (LW.pv) {
    const a = LW.pending ? dataToXY(LW.pending.t, LW.pending.p) : null;
    LW.pv.dot.style.display = a ? "" : "none";
    if (a) { LW.pv.dot.setAttribute("cx", a.x); LW.pv.dot.setAttribute("cy", a.y); }
    const c = LW.curPx, showLine = a && c && LW.down;
    LW.pv.line.style.display = showLine ? "" : "none";
    if (showLine) setL(LW.pv.line, a, c);
  }
}
function onChartClick() {                       // тап по пустому месту снимает выделение
  if (S.indicators.includes("trend") && !LW.place && LW.sel >= 0) { LW.sel = -1; LW.tKey = ""; }
}
function undoTrend() {
  if (LW.pending || LW.place) { stopPlace(); toast("Постановка отменена"); return; }
  const list = trendList(); if (!list.length || !S.indicators.includes("trend")) return toast("Линий тренда нет");
  list.splice(LW.sel >= 0 ? LW.sel : list.length - 1, 1); LW.sel = -1; saveUi(); drawTrends();
}

function renderChart(force) {
  const own = S.chartMode === "own" && lwOk !== false;
  $("tv-chart").hidden = own; $("lw-chart").hidden = !own; $("tpsl-svg").style.display = own ? "" : "none";
  if (own) renderOwn(force); else renderTV(force);
}

// сделка относится к текущему рынку: выбрана «Авто» — только авто-сделки; выбрана биржа — сделки этой биржи
// и авто-сделки, которые сейчас считаются по её цене (открыл на «Авто · OKX» → видно и на OKX)
const onThisMarket = (t) => t.asset === S.asset && (S.ex ? (t.exchange || t.via || null) === S.ex : !t.exchange);
// ---------------------------------------------------------------- торговая страница
// ---- «плавающая» рамка активной вкладки: перетекает от монеты к монете (пружина, растяжение, размытие по скорости, лёгкое «эхо»)
const tabInd = (() => {
  const st = { x: 0, w: 0, tx: 0, tw: 0, v: 0, sf: 0, dir: 1, id: null, run: false, last: 0, hist: [], el: null, gh: [] };
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
  const sampleAt = (t) => { let r = st.hist[0]; for (const h of st.hist) { if (h.t <= t) r = h; else break; } return r; };
  function ensure(box) {
    if (st.el && st.el.parentNode === box) return;
    st.el = document.createElement("i"); st.el.className = "tab-ind"; st.el.setAttribute("aria-hidden", "true"); box.insertBefore(st.el, box.firstChild);
    st.gh = [0, 1].map(() => { const g = document.createElement("i"); g.className = "tab-ind tab-ghost"; g.setAttribute("aria-hidden", "true"); box.insertBefore(g, st.el); return g; });
  }
  function render(now) {
    const stretch = st.sf * 0.35, w = st.w * (1 + stretch), left = st.dir > 0 ? st.x - st.w * stretch : st.x;
    st.el.style.width = w + "px"; st.el.style.transform = `translate3d(${left.toFixed(2)}px,0,0)`;
    st.el.style.filter = st.sf > 0.01 ? `blur(${(st.sf * 3.5).toFixed(2)}px)` : "none"; st.el.style.setProperty("--gl", st.sf.toFixed(3));
    st.hist.push({ t: now, l: left, w }); while (st.hist.length > 2 && now - st.hist[0].t > 260) st.hist.shift();
    st.gh.forEach((g, i) => { const h = sampleAt(now - 55 * (i + 1)); g.style.width = h.w + "px"; g.style.transform = `translate3d(${h.l.toFixed(2)}px,0,0)`; g.style.opacity = (st.sf * (0.55 - i * 0.22)).toFixed(3); });
  }
  function loop(now) {
    const dt = Math.min((now - st.last) / 1000 || 0.016, 0.034); st.last = now;
    const K = 260 / (AK * AK), C = 23 / AK, a = K * (st.tx - st.x) - C * st.v;
    st.v += a * dt; st.x += st.v * dt; st.w += (st.tw - st.w) * Math.min(1, dt * 14);
    if (Math.abs(st.v) > 30) st.dir = st.v > 0 ? 1 : -1;
    st.sf += (clamp(Math.abs(st.v) * AK / 1100, 0, 1) - st.sf) * Math.min(1, dt * 14);
    render(now);
    if (Math.abs(st.tx - st.x) < 0.2 && Math.abs(st.v) < 3 && st.sf < 0.01 && Math.abs(st.tw - st.w) < 0.2) { st.run = false; snap(); return; }
    requestAnimationFrame(loop);
  }
  function snap() { st.x = st.tx; st.w = st.tw; st.v = 0; st.sf = 0; st.hist = []; render(performance.now()); }
  function sync() {
    const box = $("asset-tabs"), t = box && box.querySelector(".tab.active");
    if (!t || !t.offsetWidth) { if (st.el) st.el.style.display = "none"; return; }
    ensure(box); box.classList.add("has-ind");
    [st.el, ...st.gh].forEach((e) => { e.style.display = ""; e.style.top = t.offsetTop + "px"; e.style.height = t.offsetHeight + "px"; });
    st.tx = t.offsetLeft; st.tw = t.offsetWidth;
    const changed = st.id !== null && st.id !== S.asset; st.id = S.asset;
    if (!st.w || !animOn() || (!changed && !st.run)) snap();
    else if (!st.run) { st.run = true; st.last = performance.now(); requestAnimationFrame(loop); }
  }
  return { sync, el: () => st.el };
})();
function renderTabs() {
  const box = $("asset-tabs");
  // Тик идёт 4 раза в секунду и раньше каждый раз пересоздавал все вкладки — это забивало main-поток и рвало кадры анимаций.
  // Теперь пересобираем, только если что-то реально изменилось (вкладки, активная, число/сторона/прибыль сделок, ширина).
  if (!renderTabs._keep) {
    const sig = [S.asset, animOn() ? 1 : 0, box.clientWidth, S.currency, S.tabs.map((id) => { const o = S.trades.filter((t) => t.asset === id);
      return id + ":" + o.length + ":" + (o[0] ? o[0].direction : "") + ":" + signed(o.reduce((s, t) => s + t.pnl, 0)); }).join("|")].join("#");
    if (sig === renderTabs._sig && box.querySelector(".tab")) return;
    renderTabs._sig = sig;
  } else renderTabs._sig = null;
  const prevIds = renderTabs._ids, prevAct = renderTabs._act;
  renderTabs._ids = new Set(S.tabs); renderTabs._act = S.asset;
  // вкладка, которая прямо сейчас «собирается» (анимация ~1,4 с), не пересоздаётся: тик перерисовывает вкладки несколько раз в секунду и оборвал бы анимацию
  let keep = renderTabs._keep;
  if (keep && !(Date.now() < keep.until && keep.el.parentNode === box && S.tabs.includes(keep.id) && (keep.out || keep.el.classList.contains("active") === (keep.id === S.asset)))) keep = renderTabs._keep = null;
  [...box.children].forEach((ch) => { if (ch.classList.contains("tab-ind")) return; if (!keep || ch !== keep.el) ch.remove(); });
  let keepSeen = false;
  const put = (el) => (keep && !keepSeen ? box.insertBefore(el, keep.el) : box.appendChild(el));
  const add = document.createElement("button");
  add.className = "tab add"; add.textContent = "+"; add.onclick = openAssetPicker;
  put(add);
  S.tabs.forEach((id) => {
    const a = assetById(id); if (!a) return;
    if (keep && id === keep.id) { keepSeen = true; return; }
    const open = S.trades.filter((t) => t.asset === id);
    const pnl = open.reduce((s, t) => s + t.pnl, 0);
    const b = document.createElement("button");
    b.className = "tab" + (id === S.asset ? " active" : "");
    b.dataset.id = id;
    if (animOn()) {
      if (prevIds && !prevIds.has(id)) b.classList.add("tab-new");     // сборка по шагам — только когда монета действительно добавлена; при смене монет/бирж ничего не играет
    }
    b.innerHTML = `<span class="tab-name">${assetIcon(a, 20)}<span>${open.length ? `<span class="${open[0].direction === "up" ? "green" : "red"}">${open[0].direction === "up" ? "↑" : "↓"}</span> ` : ""}${esc(a.name)}</span></span>` +
      (open.length ? `<small class="pnl ${pnl >= 0 ? "green" : "red"}">${signed(pnl)}</small>` : `<small>${kindLabel(a)}</small>`);
    b.onclick = () => selectAsset(id);
    if (id === S.asset && S.tabs.length > 1) {
      const x = document.createElement("span"); x.className = "x"; x.textContent = "×";
      x.onclick = (e) => { e.stopPropagation(); closeTabAnimated(id, b); };
      b.appendChild(x);
    }
    if (b.classList.contains("tab-new")) renderTabs._keep = { id, el: b, until: Date.now() + AKs(1500) };
    put(b);
  });
  tabInd.sync();
}
function selectAsset(id) {
  storeCfg();                                   // запомнить настройки уходящей монеты
  S.asset = id; if (!S.tabs.includes(id)) S.tabs.push(id);
  loadCfg();                                    // и подтянуть настройки новой
  S.quote = null; renderAll(); saveUi(); tick();
}
// Удаление вкладки: красная рамка сразу уходит на соседнюю монету, а удаляемая вкладка разбирается в обратную сторону
// (подпись → текст → иконки → база), и только потом реально убирается.
function closeTabAnimated(id, el) {
  if (!el || el.classList.contains("tab-out")) return;
  const rest = S.tabs.filter((t) => t !== id);
  if (!rest.length) return;
  if (!animOn()) { closeTab(id); return; }
  const D = AKs(1060);
  el.classList.remove("active"); const x = el.querySelector(".x"); if (x) x.remove();
  el.classList.add("tab-out");
  renderTabs._keep = { id, el, out: true, until: Date.now() + D + 400 };      // тик не должен пересоздать вкладку посреди анимации
  if (S.asset === id) afterPaint(() => { if (S.asset === id) selectAsset(rest[0]); }); else renderTabs();   // рамка (tabInd) едет на новую монету сразу после первого кадра анимации
  setTimeout(() => {
    if (renderTabs._keep && renderTabs._keep.el === el) renderTabs._keep = null;
    // FLIP: запоминаем, где стояли остальные вкладки, убираем удалённую и плавно «довозим» их (и рамку) на новое место
    const box = $("asset-tabs"), was = new Map();
    box.querySelectorAll(".tab[data-id]").forEach((t) => { if (t !== el) was.set(t.dataset.id, t.getBoundingClientRect().left); });
    S.tabs = S.tabs.filter((t) => t !== id); renderTabs(); saveUi();
    box.querySelectorAll(".tab[data-id]").forEach((t) => {
      const o = was.get(t.dataset.id); if (o == null) return;
      const d = o - t.getBoundingClientRect().left; if (Math.abs(d) < 0.5) return;
      const kf = [{ translate: d + "px 0" }, { translate: "0 0" }], opt = { duration: AKs(420), easing: "cubic-bezier(.22,.9,.24,1)" };
      t.animate(kf, opt);
      if (t.dataset.id === S.asset) { const ind = tabInd.el(); if (ind) ind.animate(kf, opt); }
    });
  }, D);
}
function closeTab(id) {
  S.tabs = S.tabs.filter((t) => t !== id);
  if (S.asset === id) selectAsset(S.tabs[0]); else { renderTabs(); saveUi(); }
}
function renderQuote() {
  const a = assetById(S.asset), q = S.quote;
  const qi = $("q-icon"); if (qi.dataset.a !== a.id) { qi.dataset.a = a.id; qi.innerHTML = assetIcon(a, 32); }
  $("price").textContent = q ? "$" + q.price.toLocaleString("ru-RU", { minimumFractionDigits: a.decimals, maximumFractionDigits: a.decimals }) : "—";
  { const pe = $("price"), cur = q ? q.price : null, key = a.id + "|" + (S.ex || "");
    if (pe._k === key && pe._v != null && cur != null && cur !== pe._v && animOn()) { replay(pe, cur > pe._v ? "fl-up" : "fl-dn"); pe.classList.remove(cur > pe._v ? "fl-dn" : "fl-up"); }
    pe._k = key; pe._v = cur; }
  const ch = $("change");
  if (q && q.change !== null && q.change !== undefined) {
    const up = q.change >= 0; ch.className = "change " + (up ? "green" : "red");
    ch.textContent = `${up ? "↑" : "↓"} ${Math.abs(q.change).toFixed(a.decimals)} (${Math.abs(q.change_pct).toFixed(2)}%)`;
  } else { ch.textContent = ""; }
  $("sim-badge").hidden = !(q && !q.live);
  const pill = $("ex-pill");
  const shown = S.ex || (q && q.src && q.src !== "sim" ? q.src : "auto");
  { const h = exIcon(shown, 16) + esc((S.ex ? exName(S.ex) : q && q.src && q.src !== "sim" ? "Авто · " + exName(q.src) : "Авто") + " ⌄");
    if (pill._h !== h) { pill._h = h; pill.innerHTML = h; } }          // перерисовываем только при изменении — иначе тик 4 раза в секунду стирал бы кольца капли
  pill.hidden = !assetExchanges().length;
  const pv = $("ex-prev"), cur = S.ex || "auto";
  pv.hidden = !assetExchanges().length || !S.pex || S.pex === cur;
  if (!pv.hidden) { const h = "↩ " + exIcon(S.pex, 14) + esc(S.pex === "auto" ? "Авто" : exName(S.pex)); if (pv._h !== h) { pv._h = h; pv.innerHTML = h; } }
}
const setH = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };
const setT = (el, t) => { if (el._t !== t) { el._t = t; el.textContent = t; } };
function renderPosition() {
  arbTipRender();
  if (typeof domSync === "function") domSync();          // кнопка «DOM» (у всех, только у крипты)
  const open = S.trades.filter(onThisMarket);
  syncTpslBtn();
  $("dir-row").hidden = open.length > 0; $("pos-row").hidden = open.length === 0;
  { const sp = isSpot(assetById(S.asset));               // спот: шорта и плеча нет — только «Вверх»
    $("btn-down").hidden = sp; $("lev-btn").disabled = sp; setT($("lev-btn"), "×" + levOf()); }
  $("open-badge").hidden = S.trades.length === 0; $("open-badge").textContent = S.trades.length;
  if (!open.length) return;
  const a = assetById(S.asset), pnl = open.reduce((s, t) => s + t.pnl, 0), t0 = open[0];
  setH($("pos-name"), `<span class="${t0.direction === "up" ? "green" : "red"}">${t0.direction === "up" ? "↑" : "↓"}</span> ${esc(a.name)}` +
    (S.ex || open[0].exchange ? ` · ${esc(exName(open[0].exchange || S.ex))}` : "") + ` <span class="lvl">×${t0.multiplier}</span>` + (open.length > 1 ? ` (${open.length})` : ""));
  setT($("pos-time"), new Date(t0.opened_at * 1000).toLocaleString("ru-RU") + " · ставка " + money(open.reduce((s, t) => s + t.stake, 0)));
  const p = $("pos-pnl"); setT(p, signed(pnl)); const pc = "pos-pnl " + (pnl >= 0 ? "green" : "red"); if (p.className !== pc) p.className = pc;
}
function fmtBalance(usd, full) {
  const cur = S.currency, rate = cur === "USD" ? 1 : S.rates[cur];
  if (!rate) return full ? money(usd) : money(usd).replace(/[,.]00$/, "");
  if (cur === "USD") return full ? money(usd) : money(usd).replace(/[,.]00$/, "");
  const v = usd * rate, digits = full || Math.abs(v) < 100 ? 2 : 0;
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch (e) { return v.toFixed(digits) + " " + cur; }
}
let balAnim = 0;
function renderBalance() {
  const to = S.balance, from = renderBalance._v;
  const paint = (v) => { $("balance").textContent = fmtBalance(v, false); $("p-balance").textContent = fmtBalance(v, true); };
  cancelAnimationFrame(balAnim);
  if (from === undefined || !isFinite(from) || !isFinite(to) || Math.abs(to - from) < 0.005 || !animOn()) { renderBalance._v = to; paint(to); return; }
  // сумма «пересчитывается» плавно (OutCubic, как списки в Quickshell) + короткая вспышка зелёным/красным
  replay($("balance"), to > from ? "fl-up" : "fl-dn"); $("balance").classList.remove(to > from ? "fl-dn" : "fl-up");
  const t0 = performance.now(), dur = AKs(650);
  const step = (t) => {
    const k = Math.min((t - t0) / dur, 1), v = from + (to - from) * (1 - Math.pow(1 - k, 3));
    renderBalance._v = v; paint(v);
    if (k < 1) balAnim = requestAnimationFrame(step); else { renderBalance._v = to; paint(to); }
  };
  balAnim = requestAnimationFrame(step);
}
function renderAll() { renderTabs(); renderQuote(); renderPosition(); renderBalance(); renderChart(); }

// ---- связь: баннер «нет связи», сам дозагружает график после возврата сети
const NET = { fails: 0, down: false, reload: false };
function netBanner(show) {
  let b = $("net-banner");
  if (!b) { b = document.createElement("div"); b.id = "net-banner"; b.textContent = "⚠️ Нет связи — переподключаюсь…"; document.body.appendChild(b); }
  b.hidden = !show;
}
function netFail() { if (++NET.fails >= 2 && !NET.down) { NET.down = true; netBanner(true); } }
function netOk() {
  NET.fails = 0;
  if (!NET.down) return;
  NET.down = false; netBanner(false);
  if (NET.reload || S.chartMode === "own") { NET.reload = false; if (S.chartMode === "own" && lwOk) loadOwnCandles(); }   // закрыть дыру в свечах
  loadRates();
}
window.addEventListener("online", () => tick());
window.addEventListener("offline", () => { NET.fails = 2; netFail(); });

let tickBusy = false;
async function tick() {
  if (document.hidden || tickBusy) return;
  tickBusy = true;
  try {
    const exAtReq = S.ex, d = await api("/api/tick?asset=" + S.asset + exQ());
    if (d.auto_closed && d.auto_closed.length) notifyAutoClosed(d.auto_closed);   // до проверки ниже, чтобы не потерять событие
    if (d.orders_filled && d.orders_filled.length && typeof domFilled === "function") domFilled(d.orders_filled);
    if (exAtReq !== S.ex || (d.quote && d.quote.asset !== S.asset)) return;       // ответ на уже закрытую вкладку
    netOk();
    S.quote = d.quote; S.balance = d.balance; S.trades = d.open_trades;
    if (d.quote) (S.qcache = S.qcache || {})[S.asset + "|" + (S.ex || "")] = d.quote;
    if (!d.quote && S.ex) { if (++S.exMiss === 8) toast(exName(S.ex) + " не отвечает по " + (assetById(S.asset) || {}).name + " — пробую снова.\nМожно выбрать другую биржу или «Авто»."); } else S.exMiss = 0;
    if (S.chartMode === "own" && lwOk) { updateLive(d.quote); syncLines(); }
    const nb = $("alert-badge"); nb.hidden = !d.alerts_active; nb.textContent = d.alerts_active;
    if (d.fired && d.fired.length) toast(d.fired.map((f) => { const x = assetById(f.asset); return `🔔 ${x ? x.name : f.asset} достиг ${fmtPrice(x || { decimals: 5 }, f.target)}` + (f.comment ? "\n" + f.comment : ""); }).join("\n"));
    renderTabs(); renderQuote(); renderPosition(); renderBalance(); updateTradesLive();
  } catch (e) { if (e.net) netFail(); /* сеть моргнула — следующий тик */ }
  finally { tickBusy = false; }
}

// Авто TP/SL для ножки арбитража (сдвиг цены от входа, %). Считает сервер от реальной цены входа.
//  Ф+Ф: цены сходятся к середине → TP = половина спреда (чистыми, после комиссии), SL = ширина спреда.
//  Ф+С: ножки страхуют друг друга, доход — funding → ценового TP нет, только SL обеих ножек на 80% расстояния до ликвидации фьючерса.
// Сервер дополнительно не пускает стоп дальше 90% расстояния до ликвидации.
function arbLevels(direction) {
  const p = ARB.plan; if (!p || S.arbHints === false || !S.isAdmin) return null;
  const hit = arbSteps(p).find((st) => {
    const as = st.kind === "spot" ? spotAssetOf(p.coin) : futAssetOf(p.coin);
    return as && as.id === S.asset && st.dir === direction;
  });
  if (!hit) return null;
  if (p.src === "ff") return p.spr > 0 ? { tp_move: +(p.spr / 2).toFixed(4), sl_move: +p.spr.toFixed(4) } : null;
  return { sl_move: +Math.min(Math.max((0.8 * 100) / S.leverage, 0.05), 50).toFixed(4) };
}
async function openTrade(direction) {
  try {
    const body = { asset: S.asset, direction, stake: S.stake, leverage: S.leverage, exchange: S.ex };
    const lv = arbLevels(direction);
    if (lv) Object.assign(body, lv);                                                       // арбитраж: уровни из сигнала вместо «по умолчанию»
    else {
      if (S.pre.on !== false && S.pre.tp) body.tp_pnl = Math.max(0.01, Math.round(S.stake * S.pre.tp) / 100);     // % от ставки -> $
      if (S.pre.on !== false && S.pre.sl) body.sl_pnl = Math.max(0.01, Math.round(S.stake * S.pre.sl) / 100);
    }
    await api("/api/trade/open", body);
    hap("medium", true);
    tick();
  } catch (e) { toast(e.message); }
}
async function stopTrades() {
  const open = S.trades.filter(onThisMarket);
  try { for (const t of open) await api("/api/trade/close", { trade_id: t.id }); tick(); }
  catch (e) { toast(e.message); }
}

// ставка
function setStake(v) {
  v = Math.min(Math.max(Math.round(v * 100) / 100, S.cfg.min_stake), S.cfg.max_stake);
  S.stake = v; $("stake").value = v.toFixed(2); stakeDrumSet(v.toFixed(2)); saveUi();
}
const stepFor = (v) => (v < 1 ? 0.1 : v < 10 ? 1 : v < 100 ? 10 : 100);

// ---- ставка: цифры крутятся как барабан револьвера (3D-цилиндр на каждую цифру, см. .reel/.cyl в style.css)
const REEL_DEG = 36;                                    // 10 граней по 36°
function mkReel() {
  const reel = document.createElement("span"), cyl = document.createElement("span");
  reel.className = "reel"; cyl.className = "cyl";
  cyl.innerHTML = Array.from({ length: 10 }, (_, n) => `<i style="--n:${n}">${n}</i>`).join("");
  const flat = document.createElement("span"); flat.className = "flat"; flat.textContent = "0";   // то, что видно в покое
  reel.className = "reel rest"; reel.append(cyl, flat); reel._cyl = cyl; reel._flat = flat; reel._ang = 0; reel._val = 0; reel._digit = true;
  cyl.addEventListener("transitionend", (e) => {
    if (e.target !== cyl || e.propertyName !== "transform") return;
    flat.textContent = reel._val; reel.classList.add("rest");
    reel._ang = ((reel._ang % 360) + 360) % 360;                                      // угол не копится бесконечно (в покое барабан скрыт — скачка не видно)
    cyl.style.transitionDuration = "0s"; cyl.style.transitionDelay = "0s";
    cyl.style.transform = `translateZ(calc(var(--r) * -1)) rotateX(${reel._ang}deg)`;
  });
  return reel;
}
// dir >= 0 — барабан вращается так, что цифры едут вверх (число растёт), dir < 0 — вниз. Возвращает true, если цифра меняется.
function reelTo(reel, d, dir, delay, instant) {
  const cur = reel._val, steps = dir >= 0 ? (d - cur + 10) % 10 : -((cur - d + 10) % 10);
  if (!steps) return false;
  // как у револьвера: барабан делает полный оборот и «защёлкивается» на нужной цифре (с лёгким перелётом в easing)
  reel._ang += steps * REEL_DEG + (instant ? 0 : (dir >= 0 ? 1 : -1) * REEL_DEG * 10); reel._val = d;
  const st = reel._cyl.style;
  st.transitionDuration = instant ? "0s" : AKt(0.7 + 0.05 * Math.abs(steps));         // чем дальше крутить, тем дольше
  st.transitionDelay = instant ? "0s" : AKt(delay);
  st.transform = `translateZ(calc(var(--r) * -1)) rotateX(${reel._ang}deg)`;
  if (instant) { reel._flat.textContent = d; reel.classList.add("rest"); }            // без вращения сразу плоская цифра
  else reel.classList.remove("rest");                                                 // вращаем: показываем 3D-барабан
  return true;
}
function drumSet(text, dir, instant) {
  const box = $("stake-drum"); if (!box) return;
  const chars = [...text], old = box._nodes || [];
  let keep = 0;                                         // сколько узлов справа переиспользуем (выравнивание по правому краю)
  while (keep < chars.length && keep < old.length && old[old.length - 1 - keep]._digit === /\d/.test(chars[chars.length - 1 - keep])) keep++;
  old.slice(0, old.length - keep).forEach((n) => n.remove());
  const fresh = chars.slice(0, chars.length - keep).map((ch) => {
    if (/\d/.test(ch)) return mkReel();
    const dot = document.createElement("span"); dot.className = "dot"; dot.textContent = ch; dot._digit = false; return dot;
  });
  if (fresh.length) { box.prepend(...fresh); void box.offsetWidth; }     // новые барабаны стартуют с «0», поэтому им нужен отрисованный кадр
  const nodes = fresh.concat(old.slice(old.length - keep)); box._nodes = nodes;
  let moved = 0;
  for (let i = chars.length - 1; i >= 0; i--) {         // справа налево: младший разряд первым, остальные — каскадом
    if (nodes[i]._digit && reelTo(nodes[i], +chars[i], dir, moved * 0.045, instant)) moved++;
  }
  if (moved && !instant) hap("sel");
}
let stakePending = null;
function stakeDrumSet(text) {
  const wrap = $("stake-wrap"), box = $("stake-drum"); if (!wrap || !box) return;
  if (wrap.classList.contains("editing")) { stakePending = text; return; }           // пока печатаешь — барабан не крутим, покажем после ввода
  const first = !box._nodes, dir = first ? 0 : Math.sign(Number(text) - Number(box._shown));
  box._shown = text; drumSet(text, dir, first || !animOn());
}
// кнопки − / +: нажатие «пружинит», по краю расходится волна, при удержании ставка листается всё быстрее
// капля: кольца от точки касания + «плюх» плашки биржи
function dropRipple(btn, e) {
  if (!btn || !animOn()) return;
  const r = btn.getBoundingClientRect(), x = e && e.clientX ? e.clientX - r.left : r.width / 2, y = e && e.clientY ? e.clientY - r.top : r.height / 2;
  ["", "r2", "r3"].forEach((k) => {
    const d = document.createElement("span"); d.className = "drop-ring " + k;
    d.style.left = x + "px"; d.style.top = y + "px"; d.style.setProperty("--s", Math.max(r.width, r.height) * 1.8 / 8);
    btn.appendChild(d); setTimeout(() => d.remove(), 1200);
  });
}
// быстрая смена биржи («↩ предыдущая»): плашки проходят СКВОЗЬ друг друга и меняются местами, на ходу вытягиваясь и сплющиваясь, как капли.
// FLIP: до смены запоминаем положение плашек, после — запускаем их из старых мест в новые.
function pillsSnap() {
  const a = $("ex-pill"), b = $("ex-prev");
  return a && b && !a.hidden && !b.hidden ? { a: a.getBoundingClientRect(), b: b.getBoundingClientRect() } : null;
}
// «жидкое стекло»: плашки подпрыгивают и светятся, вытягиваются в капли, между ними тянется скрученная лента-«восьмёрка»,
// на пересечении летят брызги, на финише — пружинистая посадка. Позиции плашек считает WAAPI, лента и брызги рисуются
// в rAF по реальным getBoundingClientRect() плашек — поэтому всё идёт синхронно, даже при смене --ak.
let swapFx = null;
function swapFxStop() {
  if (!swapFx) return;
  cancelAnimationFrame(swapFx.raf);
  swapFx.anims.forEach((x) => { try { x.cancel(); } catch (e) {} });
  if (swapFx.svg && swapFx.svg.parentNode) swapFx.svg.remove();
  [swapFx.a, swapFx.b].forEach((el) => { el.style.zIndex = ""; });
  swapFx = null;
}
function swapPills(snap) {
  const a = $("ex-pill"), b = $("ex-prev");
  if (!snap || !animOn() || !a || !b || a.hidden || b.hidden || !a.animate) return;
  swapFxStop();
  const row = a.parentNode, ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const cx = (r) => r.left + r.width / 2;
  // новая «текущая» (a) стартует там, где стояла «предыдущая» (b), и наоборот
  const dxA = cx(snap.b) - cx(ra), dxB = cx(snap.a) - cx(rb);
  const dur = AKs(950), MOVE = 0.78;                      // 0…MOVE — полёт, MOVE…1 — пружинистая посадка
  // цвета свечения — из темы приложения (--up / --down: те же, что у кнопок «Вверх/Вниз»), а не зашитые синий и оранжевый
  const themeRgb = (v, fb) => {
    const c = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const h = /^#([0-9a-f]{6})$/i.exec(c), r = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);
    return h ? [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4), 16)] : r ? [+r[1], +r[2], +r[3]] : fb;
  };
  const BLUE = themeRgb("--up", [46, 158, 58]), ORANGE = themeRgb("--down", [224, 53, 0]);   // a = биржа, на которую перешли; b = та, с которой ушли (имена — историческое)
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  const rgba = (c, al) => `rgba(${c[0]},${c[1]},${c[2]},${al.toFixed(3)})`;
  const glowAt = (T) => (T < 0.12 ? T / 0.12 : T < MOVE ? 1 : 1 - 0.75 * clamp01((T - MOVE) / (1 - MOVE)));
  // покадровые ключи (линейные между кадрами): путь по «восьмёрке», вытяжение, свечение
  const frames = (dx, sgn, col) => {
    const out = [], N = 40;
    for (let i = 0; i <= N; i++) {
      const T = i / N, M = clamp01(T / MOVE), e = ease(M), st = Math.sin(Math.PI * e), S = clamp01((T - MOVE) / (1 - MOVE));
      const spring = Math.exp(-4.5 * S) * Math.sin(2 * Math.PI * 1.6 * S);
      const lift = T < 0.14 ? Math.sin((T / 0.14) * Math.PI / 2) : 1;                       // подъём в начале
      const x = dx * (1 - e), y = sgn * 7 * Math.sin(2 * Math.PI * e) - 2.5 * lift * (1 - M) ;
      const rot = sgn * 9 * Math.cos(2 * Math.PI * e) * st;
      const sx = (1 + 0.06 * lift * (1 - M)) * (1 + 0.5 * st) * (1 + 0.14 * spring), sy = (1 + 0.06 * lift * (1 - M)) * (1 - 0.32 * st) * (1 - 0.1 * spring);
      const g = glowAt(T);
      out.push({
        transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`,
        opacity: +(1 - 0.28 * st).toFixed(3),
        borderColor: rgba(col, 0.35 + 0.65 * g),
        boxShadow: `0 0 ${(18 * g).toFixed(1)}px ${(3 * g).toFixed(1)}px ${rgba(col, 0.7 * g)}, inset 0 1px 0 ${rgba([255, 255, 255], 0.35 * g)}, inset 0 0 ${(10 * g).toFixed(1)}px ${rgba(col, 0.35 * g)}`,
        offset: T, easing: "linear",
      });
    }
    return out;
  };
  a.style.zIndex = 2; b.style.zIndex = 1;
  const anims = [a.animate(frames(dxA, -1, BLUE), { duration: dur }), b.animate(frames(dxB, 1, ORANGE), { duration: dur })];

  // слой ленты поверх строки с плашками
  const NS = "http://www.w3.org/2000/svg", PADX = 16, PADY = 22;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "swap-fx");
  svg.innerHTML = `<defs>
    <filter id="swap-goo" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/>
      <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"/></filter>
    <linearGradient id="swap-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${rgba(BLUE, 0.85)}"/><stop offset="1" stop-color="${rgba(ORANGE, 0.85)}"/></linearGradient></defs>
    <g filter="url(#swap-goo)"><path id="swap-rib" fill="url(#swap-grad)" fill-opacity=".62" stroke="rgba(255,255,255,.55)" stroke-width="1" stroke-linejoin="round"/><g id="swap-drops"></g></g>
    <g id="swap-arrows"></g>`;
  row.appendChild(svg);
  const rib = svg.querySelector("#swap-rib"), drops = svg.querySelector("#swap-drops"), arrows = svg.querySelector("#swap-arrows"), grad = svg.querySelector("#swap-grad");
  // брызги: заранее задаём, чья капля, когда вылетает и куда летит
  const rnd = (() => { let x = 7; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); })();
  const sparks = Array.from({ length: 9 }, (_, i) => ({
    own: i % 2 ? b : a, col: i % 2 ? ORANGE : BLUE, ts: 0.22 + rnd() * 0.5, vx: (rnd() - 0.5) * 46, vy: -14 - rnd() * 26, r: 1.2 + rnd() * 1.8, el: null, x0: 0, y0: 0, on: false,
  }));
  sparks.forEach((sp) => { sp.el = document.createElementNS(NS, "circle"); sp.el.setAttribute("r", 0); sp.el.setAttribute("fill", rgba(sp.col, 0.9)); drops.appendChild(sp.el); });
  const dirA = dxA > 0 ? -1 : 1;   // a едет от старого места к новому — против знака смещения
  const arrow = (x, y, dir, col) => `<path d="M${x - 9 * dir},${y} L${x + 9 * dir},${y} M${x + 4 * dir},${y - 3.5} L${x + 9 * dir},${y} L${x + 4 * dir},${y + 3.5}" fill="none" stroke="${rgba(col, 0.9)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const t0 = performance.now(); let hMid = false, hEnd = false;
  const haptic = (k) => hap(k, true);
  haptic("light");
  const fx = (swapFx = { a, b, svg, anims, raf: 0 });
  const frame = (now) => {
    if (swapFx !== fx) return;
    const T = clamp01((now - t0) / dur);
    const R = row.getBoundingClientRect(), A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    const ox = R.left - PADX, oy = R.top - PADY;
    svg.setAttribute("width", R.width + PADX * 2); svg.setAttribute("height", R.height + PADY * 2);
    const ax = cx(A) - ox, ay = A.top + A.height / 2 - oy, bx = cx(B) - ox, by = B.top + B.height / 2 - oy;
    // лента: появляется после подъёма, исчезает к посадке
    const env = Math.pow(Math.sin(Math.PI * clamp01((T - 0.12) / (MOVE - 0.12 + 0.06))), 1.1);
    if (env > 0.02) {
      const N = 30, top = [], bot = [], twist = T * 9;
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = ax + (bx - ax) * u, y = ay + (by - ay) * u + 6 * env * Math.sin(2 * Math.PI * u + T * 8) * Math.sin(Math.PI * u);
        const h = env * 10 * Math.cos(Math.PI * u * 1.5 + twist * 0.35) * (0.45 + 0.55 * Math.sin(Math.PI * u));   // знак меняется → лента скручивается
        top.push(`${x.toFixed(1)},${(y - h).toFixed(1)}`); bot.push(`${x.toFixed(1)},${(y + h).toFixed(1)}`);
      }
      rib.setAttribute("d", "M" + top.join(" L") + " L" + bot.reverse().join(" L") + "Z");
      grad.setAttribute("x1", ax); grad.setAttribute("x2", bx === ax ? ax + 1 : bx);
      rib.setAttribute("opacity", 1);
    } else rib.setAttribute("opacity", 0);
    // брызги
    sparks.forEach((sp) => {
      if (!sp.on && T >= sp.ts) { const r = sp.own.getBoundingClientRect(); sp.on = true; sp.x0 = cx(r) - ox + (rnd() - 0.5) * r.width * 0.5; sp.y0 = r.top + r.height / 2 - oy; }
      const age = (T - sp.ts) / 0.24;
      if (!sp.on || age < 0 || age > 1) { sp.el.setAttribute("r", 0); return; }
      sp.el.setAttribute("cx", (sp.x0 + sp.vx * age).toFixed(1)); sp.el.setAttribute("cy", (sp.y0 + sp.vy * age + 46 * age * age).toFixed(1));
      sp.el.setAttribute("r", (sp.r * (1 - age * 0.7)).toFixed(2));
    });
    // стрелки направления в самом начале
    const aa = T < 0.3 ? Math.sin(Math.PI * clamp01(T / 0.3)) : 0;
    arrows.innerHTML = aa > 0.02 ? `<g opacity="${aa.toFixed(2)}" transform="translate(${(dirA * T * 24).toFixed(1)},0)">${arrow(ax, A.bottom - oy + 6, dirA, BLUE)}</g><g opacity="${aa.toFixed(2)}" transform="translate(${(-dirA * T * 24).toFixed(1)},0)">${arrow(bx, B.bottom - oy + 6, -dirA, ORANGE)}</g>` : "";
    if (!hMid && T > 0.45) { hMid = true; haptic("soft"); }
    if (!hEnd && T > MOVE) { hEnd = true; haptic("medium"); }
    if (T < 1) fx.raf = requestAnimationFrame(frame); else swapFxStop();
  };
  fx.raf = requestAnimationFrame(frame);
}
function bindStep(id, dir) {
  const b = $(id); if (!b) return;
  b.dataset.nohap = "1";
  let t = 0, loopT = 0;
  const fire = () => {
    setStake(dir > 0 ? S.stake + stepFor(S.stake) : S.stake - stepFor(S.stake - 0.001));
    if (animOn()) { replay(b, "bump"); replay(b, "pop"); }
    hap("sel", true);
  };
  const stop = () => { clearTimeout(t); clearTimeout(loopT); t = loopT = 0; };
  b.addEventListener("pointerdown", (e) => {
    if (e.button) return; e.preventDefault(); stop(); fire();
    t = setTimeout(() => { let d = 150; const loop = () => { fire(); d = Math.max(40, d * 0.92); loopT = setTimeout(loop, d); }; loop(); }, 380);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => b.addEventListener(ev, stop));
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
}
function bindStakeDrum() {
  const wrap = $("stake-wrap"), inp = $("stake"); if (!wrap) return;
  inp.addEventListener("focus", () => { wrap.classList.add("editing"); setTimeout(() => { try { inp.select(); } catch (e) {} }, 0); });
  inp.addEventListener("blur", () => { wrap.classList.remove("editing"); if (stakePending !== null) { const t = stakePending; stakePending = null; stakeDrumSet(t); } });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
}


// ---------------------------------------------------------------- выбор биржи
let exTimer = null;
function openExchanges() {
  const a = assetById(S.asset); if (!a || !a.exchanges.length) return;
  const render = (rows) => {
    const ok = rows.filter((r) => r.ok), lo = ok.length ? Math.min(...ok.map((r) => r.price)) : 0, hi = ok.length ? Math.max(...ok.map((r) => r.price)) : 0;
    const spread = ok.length > 1 && lo > 0 ? (hi / lo - 1) * 100 : null;
    const row = (id, name, r) => {
      const price = r && r.ok ? fmtPrice(a, r.price) : r ? "нет данных" : "…";
      const diff = r && r.ok && lo > 0 && ok.length > 1 ? (r.price === lo ? "дешевле всех" : r.price === hi ? "дороже всех" : "") + " " + (r.price / lo * 100 - 100 >= 0 ? "+" : "") + (r.price / lo * 100 - 100).toFixed(3) + "%" : "";
      const cls = r && r.ok && ok.length > 1 ? (r.price === lo ? "green" : r.price === hi ? "red" : "") : "";
      return `<div class="row ${id === (S.ex || "") ? "sel" : ""}" data-ex="${id}">${exIcon(id, 28)}<div class="grow">${esc(name)}<div class="sub ${cls}">${esc(diff.trim())}</div></div>
        <b class="${r && r.ok ? "" : "muted"}">${price}</b></div>`;
    };
    $("sheet-body").innerHTML = `<div class="hint" style="padding-top:0">${esc(a.name)} · цены обновляются сами${spread != null ? `<br>Разница между биржами: <b class="${spread > 0.05 ? "green" : ""}">${spread.toFixed(3)}%</b>` : ""}</div>` +
      row("", "Авто (первая доступная)", null).replace("…", "").replace('<b class="muted"></b>', "") +
      [...a.exchanges].sort((x, y) => (rows.some((r) => r.id === x && r.ok) ? 0 : 1) - (rows.some((r) => r.id === y && r.ok) ? 0 : 1))   // рабочие биржи сверху
        .map((id) => row(id, exName(id), rows.find((r) => r.id === id))).join("") +
      `<div class="hint">Сделка считается по цене выбранной биржи и ликвидируется по ней же. Можно открыть «Вверх» на одной бирже и «Вниз» на другой.<br>USDT и USD — разные котировки, небольшая разница нормальна.</div>`;
    $("sheet-body").querySelectorAll("[data-ex]").forEach((el) => (el.onclick = () => pickExchange(el.dataset.ex || null)));
  };
  openSheet("Биржа", '<div class="hint">Загружаю цены бирж…</div>');
  $("sheet").dataset.kind = "ex";
  const load = () => {
    if ($("sheet").hidden || $("sheet").dataset.kind !== "ex") { clearInterval(exTimer); exTimer = null; return; }
    api("/api/exchanges?asset=" + S.asset).then((d) => { if (!$("sheet").hidden && $("sheet").dataset.kind === "ex") render(d.exchanges); }).catch(() => {});
  };
  clearInterval(exTimer); load(); exTimer = setInterval(load, 2500);
  render(a.exchanges.map((id) => ({ id, ok: false, loading: true })).map(() => null).filter(Boolean));
}
function pickExchange(id) {
  clearInterval(exTimer); closeSheet();
  if ((S.ex || null) === (id || null)) return;
  const snap = S.pex && S.pex === (id || "auto") ? pillsSnap() : null;   // вернулись на предыдущую биржу, обе плашки на экране → меняем их местами
  S.pex = S.ex || "auto";   // запоминаем, с какой биржи ушли
  storeCfg(); S.ex = id; S.quote = (S.qcache && S.qcache[S.asset + "|" + (id || "")]) || null; S.exMiss = 0;   // последняя известная цена этой биржи — до первого тика
  LW.sel = -1; LW.key = ""; saveUi(); renderAll(); tick();
  if (snap) swapPills(snap);              // быстрый возврат на прошлую биржу — жидкий обмен плашек; обычный выбор биржи — без анимации появления
}

// ---------------------------------------------------------------- плечо
const lvLiq = (x) => (100 / x < 10 ? (100 / x).toFixed(2) : (100 / x).toFixed(1)).replace(/\.?0+$/, "");
function setLeverage(v) {
  v = Math.min(Math.max(Math.round(Number(v) || 1), 1), S.cfg.max_leverage || 500);
  S.leverage = v; $("lev-btn").textContent = "×" + v; saveUi();
}
function openLeverage() {
  if (isSpot(assetById(S.asset))) { toast("На споте плеча нет — ×1"); return; }
  const max = S.cfg.max_leverage || 500, presets = S.cfg.leverage_presets || [1, 2, 5, 10, 20, 50, 100];
  openSheet("Плечо", `
    <div class="lev-big" id="lev-big"></div>
    <div class="chips lev-chips">${presets.map((p) => `<button class="chip" data-lv="${p}">×${p}</button>`).join("")}</div>
    <input id="lev-range" type="range" min="1" max="${max}" step="1" value="${S.leverage}" class="lev-range">
    <div class="kv"><span>Ставка (маржа)</span><span>${money(S.stake)}</span></div>
    <div class="kv"><span>Размер позиции</span><span id="lev-pos"></span></div>
    <div class="kv"><span>Ликвидация при движении цены</span><span class="red" id="lev-liq"></span></div>
    <div class="hint">Прибыль и убыток умножаются на плечо. Когда убыток достигает ставки, позиция закрывается сама. Плечо фиксируется в момент открытия сделки.</div>
    <button class="btn-green" id="lev-ok">Готово</button>`);
  $("sheet").dataset.kind = "lev";
  const rg = $("lev-range"), chips = $("sheet-body").querySelectorAll("[data-lv]");
  // меняем только цифры и подсветку — сам ползунок не пересоздаётся, поэтому тянется плавно
  const sync = () => {
    const v = S.leverage;
    $("lev-big").textContent = "×" + v; $("lev-pos").textContent = money(S.stake * v); $("lev-liq").textContent = "−" + lvLiq(v) + "%";
    if (Number(rg.value) !== v) rg.value = v;
    rg.style.setProperty("--p", (max > 1 ? ((v - 1) / (max - 1)) * 100 : 0) + "%");
    chips.forEach((el) => el.classList.toggle("on", Number(el.dataset.lv) === v));
  };
  chips.forEach((el) => (el.onclick = () => { setLeverage(el.dataset.lv); sync(); hap("medium", true); }));
  // «щелчки» ползунка: тик на каждом шаге, лёгкий удар на каждом 10-м, сильный — на пресетах и краях
  let lastV = S.leverage;
  rg.oninput = (e) => {
    const before = lastV; setLeverage(e.target.value); sync();
    const v = S.leverage; if (v === before) return;
    const crossed = (x) => (before < x && v >= x) || (before > x && v <= x);
    const detent = [1, max].concat(presets).some((p) => v === p || crossed(p));
    if (v === 1 || v === max) hap("rigid", true);
    else if (detent) hap("medium", true);
    else if (Math.floor(v / 10) !== Math.floor(before / 10) || crossed(Math.round(v / 10) * 10)) hap("light", true);
    else hap("sel");
    lastV = v;
  };
  $("lev-ok").onclick = closeSheet;
  sync();
}

// ---------------------------------------------------------------- шторки
let sheetTimer = null;
// в APK тут синхронизировался цвет нативной статус-бара; в PWA/браузере делать нечего (без этой заглушки шторки падали с ReferenceError и список бирж не рисовался)
function syncNativeStatusBar() {}
const sheetMobile = () => { const g = document.querySelector("#sheet .grab"); return !!g && getComputedStyle(g).display !== "none"; };   // шторка снизу (на ПК — окно по центру)
function openSheet(title, html) {
  const sh = $("sheet"), bk = $("sheet-back"), wasOpen = !sh.hidden;
  clearTimeout(sheetTimer); sheetTimer = null;
  sh.dataset.kind = "";
  $("sheet-title").textContent = title; $("sheet-body").innerHTML = html;
  sh.hidden = false; bk.hidden = false; syncNativeStatusBar();
  sh.style.transition = "none"; bk.style.transition = "none";
  sh.style.translate = ""; sh.style.opacity = ""; bk.style.opacity = "";
  if (wasOpen) { if (animOn()) replay(sh, "swap"); return; }   // одна шторка сменила другую — мягкая подмена содержимого
  sh.scrollTop = 0;
  const mob = sheetMobile();
  if (animOn()) { sh.classList.remove("swap"); replay(sh, "opening"); clearTimeout(sh._ot); sh._ot = setTimeout(() => sh.classList.remove("opening"), AKs(750)); }
  if (mob) sh.style.translate = "0 100%"; else { sh.style.opacity = "0"; sh.style.scale = ".9"; }
  bk.style.opacity = "0";
  void sh.offsetHeight;                                  // зафиксировать стартовое положение
  // снизу — плавный «expo-out» без перелёта (иначе под шторкой мелькнёт щель); на ПК — «выскакивание» из 90% с лёгким перелётом
  sh.style.transition = mob ? `translate ${AKt(.44)} cubic-bezier(.16,1,.3,1)` : `opacity ${AKt(.2)}, scale ${AKt(.36)} cubic-bezier(.34,1.35,.64,1)`; bk.style.transition = `opacity ${AKt(.26)}`;
  sh.style.translate = ""; sh.style.opacity = ""; sh.style.scale = ""; bk.style.opacity = "";
  setTimeout(() => { if (!sheetTimer) { sh.style.transition = ""; bk.style.transition = ""; } }, AKs(480));
}
function closeSheet() {
  const sh = $("sheet"), bk = $("sheet-back");
  sh.dataset.kind = ""; clearInterval(exTimer); exTimer = null;
  if (sh.hidden || sheetTimer) return;
  const mob = sheetMobile();
  sh.style.transition = mob ? `translate ${AKt(.22)} cubic-bezier(.55,.085,.68,.53)` : `opacity ${AKt(.15)}, scale ${AKt(.18)} cubic-bezier(.55,.085,.68,.53)`; bk.style.transition = `opacity ${AKt(.22)}`;
  if (mob) sh.style.translate = "0 100%"; else { sh.style.opacity = "0"; sh.style.scale = ".94"; }
  bk.style.opacity = "0";
  sheetTimer = setTimeout(() => {
    sheetTimer = null; sh.hidden = true; bk.hidden = true;
    sh.style.transition = ""; sh.style.translate = ""; sh.style.opacity = ""; sh.style.scale = ""; bk.style.transition = ""; bk.style.opacity = "";
    sh.classList.remove("opening", "swap");
    syncNativeStatusBar();
  }, AKs(250));
}
// свайп шторки вниз: идёт за пальцем, отпустил далеко/резко — уезжает, иначе возвращается на место
(function sheetDrag() {
  const sh = $("sheet"), bk = $("sheet-back");
  let y0 = 0, t0 = 0, dy = 0, drag = false, ok = false, head = false;
  sh.addEventListener("touchstart", (e) => {
    const t = e.target;
    ok = e.touches.length === 1 && !sheetTimer && sheetMobile() && !(t.closest && t.closest('input[type="range"],input,textarea,select'));
    if (!ok) return;
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0; drag = false;
    head = !!(t.closest && t.closest(".grab,#sheet-title"));
  }, { passive: true });
  sh.addEventListener("touchmove", (e) => {
    if (!ok) return;
    const y = e.touches[0].clientY;
    if (!drag) {
      const d = y - y0;
      if (d < -8) { ok = false; return; }                // потянули вверх — это обычная прокрутка
      if (d > 8 && (sh.scrollTop <= 0 || head)) { drag = true; y0 = y; t0 = Date.now(); sh.style.transition = "none"; bk.style.transition = "none"; }
      else return;
    }
    e.preventDefault();
    dy = Math.max(0, y - y0);
    sh.style.translate = "0 " + dy + "px";
    bk.style.opacity = String(Math.max(0, 1 - dy / Math.max(sh.offsetHeight, 1)));
  }, { passive: false });
  const end = () => {
    if (!ok || !drag) { ok = false; return; }
    ok = false; drag = false;
    const v = dy / Math.max(Date.now() - t0, 1);         // px/мс
    if (dy > 110 || (dy > 30 && v > 0.5)) { closeSheet(); return; }
    sh.style.transition = `translate ${AKt(.22)} cubic-bezier(.2,.8,.2,1)`; bk.style.transition = `opacity ${AKt(.22)}`;
    sh.style.translate = ""; bk.style.opacity = "";
    setTimeout(() => { if (!sheetTimer) { sh.style.transition = ""; bk.style.transition = ""; } }, AKs(240));
  };
  sh.addEventListener("touchend", end, { passive: true });
  sh.addEventListener("touchcancel", end, { passive: true });
})();
$("sheet-back").onclick = closeSheet;

const CAT_LABEL = { forex: "Форекс", crypto: "Крипто", metal: "Металлы" };
// Крипто-монета бывает двух видов — это РАЗНЫЕ активы: фьючерс (BTC/USD: «Вверх»/«Вниз», плечо, funding) и спот (BTC/USD спот: только «Вверх», ×1)
const isSpot = (a) => !!a && a.market === "spot";
const levOf = () => (isSpot(assetById(S.asset)) ? 1 : S.leverage);
const kindLabel = (a) => (isSpot(a) ? "Спот" : a.market === "fut" ? "Фьючерс" : CAT_LABEL[a.cat] || "Форекс");
function openAssetPicker() {
  const sections = [["Форекс", "forex"], ["Металлы и нефть", "metal"], ["Крипто · Фьючерсы", "crypto", "fut"], ["Крипто · Спот", "crypto", "spot"]];
  let spot = false;                                   // галочка «Спот»: добавить монету по тикеру с спот-бирж
  const render = (q) => {
    q = q.trim().toLowerCase();
    let head = "";
    const tk = q.replace(/(usdt|usd)$/, "").toUpperCase();
    if (spot) {
      if (!q) head = `<div class="hint">Спот: напиши тикер монеты (например PEPE) — найду её на спот-биржах и добавлю в список</div>`;
      else if (/^[A-Z0-9]{2,12}$/.test(tk) && !assetById(tk + "SPOT") && !assetById(tk + "USD"))
        head = `<div class="row" data-spot="${tk}"><div class="grow">➕ Добавить ${esc(tk)}/USD <span class="sub">спот</span></div></div>`;
    }
    const body = sections.map(([title, cat, mk]) => {
      const list = S.assets.filter((a) => a.cat === cat && (!mk || a.market === mk) && (!q || (a.name + " " + a.id + " " + (a.title || "")).toLowerCase().includes(q)));
      if (!list.length) return "";
      return `<div class="muted" style="margin:8px 6px">${title} · ${list.length}</div>` + list.map((a) =>
        `<div class="row ${a.id === S.asset ? "sel" : ""}" data-asset="${a.id}">${assetIcon(a, 30)}<div class="grow">${esc(a.name)}${a.title && a.title !== a.name ? ` <span class="sub">${esc(a.title)}</span>` : ""}</div></div>`).join("");
    }).join("");
    return head + (body || (head ? "" : `<div class="muted" style="padding:16px">Ничего не найдено</div>`));
  };
  openSheet("Выбор актива", `<div class="search"><input id="as-q" placeholder="Поиск: BTC, Pepe, золото, EUR…" autocomplete="off" enterkeyhint="search">
    <label class="spot-row"><span class="spot-t">Спот <span class="sub">— добавить новую монету по тикеру</span></span><input type="checkbox" id="as-spot" class="spot-in" role="switch"><span class="spot-sw"></span></label></div><div id="as-list">${render("")}</div>`);
  const pick = (id) => {
    closeSheet(); const isNew = !S.tabs.includes(id); selectAsset(id);
    if (isNew && assetExchanges().length > 1) setTimeout(openExchanges, AKs(250));
  };
  const bind = () => {
    $("as-list").querySelectorAll("[data-asset]").forEach((el) => (el.onclick = () => pick(el.dataset.asset)));
    $("as-list").querySelectorAll("[data-spot]").forEach((el) => (el.onclick = async () => {
      el.style.opacity = ".5"; el.firstElementChild.textContent = "Ищу " + el.dataset.spot + " на биржах…";
      try {
        const r = await api("/api/spot/add", { ticker: el.dataset.spot });
        if (!assetById(r.asset.id)) S.assets.push(r.asset);
        pick(r.asset.id);
      } catch (e) { toast(e.message); el.style.opacity = ""; el.firstElementChild.textContent = "➕ Добавить " + el.dataset.spot + "/USD спот"; }
    }));
  };
  const redraw = () => { $("as-list").innerHTML = render($("as-q").value); bind(); };
  bind();
  $("as-q").oninput = redraw;
  $("as-spot").onchange = (e) => { spot = e.target.checked; redraw(); };
}

function openTfPicker() {
  openSheet("Таймфрейм", TIMEFRAMES.map(([l, v]) => `<div class="row ${v === S.tf ? "sel" : ""}" data-tf="${v}">${l}</div>`).join(""));
  $("sheet-body").querySelectorAll("[data-tf]").forEach((el) => (el.onclick = () => {
    S.tf = el.dataset.tf; $("btn-tf").textContent = TIMEFRAMES.find((t) => t[1] === S.tf)[0];
    closeSheet(); renderChart(); saveUi();
  }));
}

let indFilter = "all";
function disableIndicator(id) {
  S.indicators = S.indicators.filter((x) => x !== id);
  if (id === "trend") { stopPlace(); LW.sel = -1; drawTrends(); }
  if (id === "sr") LW.srN = -1;
  saveUi(); renderChart();
}
function openIndicators() {
  const own = S.chartMode === "own" && lwOk !== false;
  const list = INDICATORS.filter((i) => indFilter === "all" || (indFilter === "fav" ? S.favorites.includes(i.id) : S.indicators.includes(i.id)));
  const chips = [["all", "Все"], ["fav", "Избранные"], ["act", "Активные"]]
    .map(([k, l]) => `<button class="chip ${indFilter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("");
  openSheet("Индикаторы", `<div class="chips">${chips}</div>` + list.map((i) =>
    `<div class="row" data-i="${i.id}"><div class="grow ${S.indicators.includes(i.id) ? "green" : ""}">${esc(i.name)}${!own && !i.study && !i.tvStudy && !i.tvTools ? ' <span class="sub">только «свой» график</span>' : ""}</div>
     <button data-info="${i.id}" class="muted">ⓘ</button>
     ${own ? `<button data-set="${i.id}" class="muted gear" aria-label="Настройки">⚙</button>` : ""}
     <button data-fav="${i.id}" class="star ${S.favorites.includes(i.id) ? "on" : ""}">★</button></div>`).join(""));
  const body = $("sheet-body");
  body.querySelectorAll("[data-f]").forEach((el) => (el.onclick = () => { indFilter = el.dataset.f; openIndicators(); }));
  body.querySelectorAll("[data-fav]").forEach((el) => (el.onclick = (e) => {
    e.stopPropagation(); const id = el.dataset.fav;
    S.favorites = S.favorites.includes(id) ? S.favorites.filter((x) => x !== id) : [...S.favorites, id]; saveUi(); openIndicators();
  }));
  body.querySelectorAll("[data-info]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); toast(INDICATORS.find((i) => i.id === el.dataset.info).info); }));
  body.querySelectorAll("[data-set]").forEach((el) => (el.onclick = (e) => { e.stopPropagation(); openIndSettings(el.dataset.set); }));
  body.querySelectorAll("[data-i]").forEach((el) => (el.onclick = () => {
    const ind = INDICATORS.find((i) => i.id === el.dataset.i);
    if (!own && !ind.study) return toast("Этот индикатор есть только на «своём» графике: Профиль → Настройки → Тип графика");
    if (S.indicators.includes(ind.id)) { disableIndicator(ind.id); openIndicators(); return; }
    if (own) return openIndSettings(ind.id);                    // при включении сначала спрашиваем настройки
    S.indicators = [...S.indicators, ind.id]; saveUi(); renderChart(); openIndicators();   // виджет TradingView: настроек нет
  }));
}

// окно «Настройки» индикатора: числа, цвета, толщина; «Применить» включает индикатор
function ddInner(t, v) {
  const body = t === "color" ? `<span class="sw" style="background:${v}"></span>` : t === "width" ? `<span class="ln" style="height:${v * 1.5}px"></span>` : `<span class="tx">${esc(v)}</span>`;
  return body + "<i>⌄</i>";
}
function fieldHtml(f, v) {
  if (f.t === "num") return `<div class="set-f"><label>${f.label}</label><input data-n="${f.k}" inputmode="decimal" value="${v}"></div>`;
  const opts = (f.t === "color" ? PALETTE : f.t === "width" ? WIDTHS : f.opts).map((o) =>
    `<div class="dd-o" data-v="${o}">${f.t === "color" ? `<span class="sw" style="background:${o}"></span>` : f.t === "width" ? `<span class="ln" style="height:${o * 1.5}px"></span>` : esc(o)}</div>`).join("");
  return `<div class="set-f"><label>${f.label}</label><div class="dd" data-dd="${f.k}" data-t="${f.t}"><button type="button" class="dd-b">${ddInner(f.t, v)}</button><div class="dd-l" hidden>${opts}</div></div></div>`;
}
function openIndSettings(id) {
  const ind = INDICATORS.find((i) => i.id === id), schema = SCHEMA[id];
  let cur = { ...DEF[id], ...(S.indSet[id] || {}) };
  const fields = schema.flatMap((b) => b.f);
  const draw = () => {
    openSheet("Настройки", `<div class="hint" style="padding-top:0">${esc(ind.name)}</div>` + schema.map((b) =>
      `${b.title ? `<div class="set-t">${b.title}</div>` : ""}<div class="set-g" style="--c:${Math.min(3, b.f.length)}">${b.f.map((f) => fieldHtml(f, cur[f.k])).join("")}</div>`).join("") +
      `<button class="btn-green" id="set-apply" style="margin-top:22px">Применить</button>
       <button class="btn-link" id="set-def">Применить настройки по умолчанию</button>`);
    const body = $("sheet-body");
    body.querySelectorAll("[data-n]").forEach((el) => (el.oninput = () => (cur[el.dataset.n] = el.value)));
    body.querySelectorAll(".dd").forEach((dd) => {
      const k = dd.dataset.dd, t = dd.dataset.t, list = dd.querySelector(".dd-l"), btn = dd.querySelector(".dd-b");
      btn.onclick = () => { const was = list.hidden; body.querySelectorAll(".dd-l").forEach((l) => (l.hidden = true)); list.hidden = !was; };
      list.querySelectorAll(".dd-o").forEach((o) => (o.onclick = () => {
        cur[k] = t === "width" ? Number(o.dataset.v) : o.dataset.v; btn.innerHTML = ddInner(t, cur[k]); list.hidden = true;
      }));
    });
    $("set-def").onclick = () => { cur = { ...DEF[id] }; draw(); };
    $("set-apply").onclick = () => {
      const out = { ...cur };
      fields.filter((f) => f.t === "num").forEach((f) => {
        let v = parseFloat(String(cur[f.k]).replace(",", "."));
        if (isNaN(v)) v = DEF[id][f.k];
        v = Math.min(Math.max(v, f.min), f.max); out[f.k] = f.dec ? Math.round(v * 10) / 10 : Math.round(v);
      });
      if (id === "macd" && out.fast >= out.slow) { const x = out.fast; out.fast = out.slow - 1 > 1 ? out.slow - 1 : 2; out.slow = Math.max(x, out.fast + 1); }
      S.indSet[id] = out;
      const wasOn = S.indicators.includes(id);
      if (!wasOn) S.indicators = [...S.indicators, id];
      if (id === "sr") LW.srN = -1;
      resetOverlays(); saveUi(); renderChart(); closeSheet();
      if (id === "trend") { drawTrends(); startPlace(); }
    };
  };
  draw();
}

async function openStats() {
  try {
    const { by_asset } = await api("/api/stats");
    openSheet("Статистика по парам", by_asset.length ? by_asset.map((r) => {
      const a = assetById(r.asset);
      return `<div class="row"><div class="grow">${esc(a ? a.name : r.asset)}
        <div class="sub">сделок ${r.trades} · винрейт ${Math.round((r.wins / r.trades) * 100)}%</div></div>
        <b class="${r.pnl >= 0 ? "green" : "red"}">${signed(r.pnl)}</b></div>`;
    }).join("") : '<div class="muted" style="text-align:center;padding:24px">Данных пока нет</div>');
  } catch (e) { toast(e.message); }
}
function openSettings() {
  openSheet("Настройки", `
    <div class="row"><div class="grow">Тип графика<div class="sub">«Свой» — с линией входа и без рассинхрона цен</div></div>
      <button class="pill ${S.chartMode === "own" ? "on" : ""}" data-cm="own">Свой</button>
      <button class="pill ${S.chartMode === "tv" ? "on" : ""}" data-cm="tv">TradingView</button></div>
    <div class="row tap" id="set-theme"><div class="grow">Тема оформления<div class="sub">${esc(THEMES[S.theme].name)} · нажми, чтобы изменить</div></div><span class="muted">›</span></div>
    <div class="row tap" id="set-cur"><div class="grow">Валюта баланса<div class="sub">${esc(S.currency)} · нажми, чтобы изменить</div></div><span class="muted">›</span></div>
    <label class="row tap set-sw"><div class="grow">Показывать подсказки<div class="sub">Знаки «?» рядом с кнопками</div></div><input type="checkbox" id="set-hints" class="spot-in" ${hintsOn() ? "checked" : ""}><span class="spot-sw"></span></label>
    ${HAS_HAPTIC ? `<label class="row tap set-sw"><div class="grow">Тактильный отклик<div class="sub">Вибрация при нажатиях, на ползунках и при перетаскивании</div></div><input type="checkbox" id="set-haptic" class="spot-in" ${hapOn() ? "checked" : ""}><span class="spot-sw"></span></label>` : ""}
    ${S.isAdmin ? `<label class="row tap set-sw set-sub"><div class="grow">Подсказки арбитража<div class="sub">Из сигналов Ф+Ф и Ф+С: где купить («Вверх») и где продать («Вниз»)</div></div><input type="checkbox" id="set-arb" class="spot-in" ${S.arbHints !== false ? "checked" : ""}><span class="spot-sw"></span></label>` : ""}
    ${IN_TG ? `<div class="row" style="flex-wrap:wrap"><div class="grow" style="flex-basis:100%">Режим окна<div class="sub">Компакт — низкое окно · Обычный — на весь рост · Весь экран — без шапки Telegram</div></div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">${[["compact", "Компакт"], ["full", "Обычный"], ["fs", "Весь экран"]].map(([k, t]) => `<button class="pill ${winMode() === k ? "on" : ""}" data-win="${k}">${t}</button>`).join("")}</div></div>` : ""}
    <label class="row tap set-sw"><div class="grow">Плавные анимации<div class="sub">Выключи, если интерфейс тормозит</div></div><input type="checkbox" id="set-anim" class="spot-in" ${S.anim !== false ? "checked" : ""}><span class="spot-sw"></span></label>`);
  if ($("set-haptic")) $("set-haptic").onchange = (e) => { S.haptic = e.target.checked; try { localStorage.setItem("haptic", S.haptic ? "1" : "0"); } catch (x) {} if (S.haptic) hap("medium", true); api("/api/ui", { haptic: S.haptic }).catch(() => {}); saveUi(); };
  $("set-hints").onchange = (e) => { setHints(e.target.checked); };
  if ($("set-arb")) $("set-arb").onchange = (e) => { S.arbHints = e.target.checked; if (!S.arbHints) arbTipClose(); saveUi(); };
  $("set-anim").onchange = (e) => { if (winBusy()) { e.target.checked = S.anim !== false; return; } S.anim = e.target.checked; document.documentElement.classList.toggle("no-anim", !S.anim); saveUi(); };
  $("sheet-body").querySelectorAll("[data-win]").forEach((el) => (el.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const k = el.dataset.win; try { localStorage.setItem(WIN_KEY, k); } catch (err) {}
    winTs = Date.now(); winApply();
    $("sheet-body").querySelectorAll("[data-win]").forEach((b) => b.classList.toggle("on", b.dataset.win === k));   // обновляем на месте, шторку не перерисовываем
    if (k === "compact") toast("Компакт включится при следующем открытии: Telegram не умеет сжимать окно на лету");
  }));
  $("set-cur").onclick = openCurrency; $("set-theme").onclick = openThemes;
  $("sheet-body").querySelectorAll("[data-cm]").forEach((el) => (el.onclick = () => {
    S.chartMode = el.dataset.cm; if (S.chartMode === "own") lwOk = null; saveUi(); renderChart(true); openSettings();
  }));
}
function openThemes() {
  const sw = (id) => { const v = resolveTheme(id).v, bt = id === "custom" ? customColors().btn : v.muted; return `<span class="theme-sw"><i style="background:${v.bg}"></i><i style="background:${v.card}"></i><i style="background:${v.text}"></i><i style="background:${bt}"></i></span>`; };
  const cc = customColors();
  openSheet("Тема оформления", Object.keys(THEMES).filter((id) => IN_TG || !THEMES[id].tgOnly).map((id) =>
    `<div class="row tap theme-row" data-th="${id}">${sw(id)}<div class="grow">${esc(THEMES[id].name)}${id === "default" ? '<div class="sub">по умолчанию</div>' : id === "telegram" ? '<div class="sub">цвета твоего Telegram</div>' : id === "custom" ? '<div class="sub">выбери фон и цвет кнопок</div>' : ""}</div>${S.theme === id ? '<span class="ck">✓</span>' : ""}</div>`).join("")
    + `<div class="theme-pick"><label>Фон<input type="color" id="cp-bg" value="${cc.bg}"><input type="text" id="cx-bg" class="hex-in" value="${cc.bg}" maxlength="7" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="Код цвета фона"></label><label>Кнопки<input type="color" id="cp-btn" value="${cc.btn}"><input type="text" id="cx-btn" class="hex-in" value="${cc.btn}" maxlength="7" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="Код цвета кнопок"></label></div>`);
  $("sheet-body").querySelectorAll("[data-th]").forEach((el) => (el.onclick = () => { applyTheme(el.dataset.th, true); saveUi(); openThemes(); }));
  // выбор цвета: пока тянешь — тема меняется на лету (без тяжёлой перерисовки), при отпускании — полностью и сохраняется
  let raf = 0;
  const live = () => {
    S.custom = { bg: $("cp-bg").value, btn: $("cp-btn").value };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      applyTheme("custom", false);
      if (LW.chart) { try { LW.chart.applyOptions(lwTheme()); } catch (e) {} }
      const row = $("sheet-body").querySelector('[data-th="custom"] .theme-sw'); if (row) row.outerHTML = sw("custom");
    });
  };
  const done = () => {
    S.custom = { bg: $("cp-bg").value, btn: $("cp-btn").value };
    try { localStorage.setItem("themeCustom", JSON.stringify(S.custom)); } catch (e) {}
    cancelAnimationFrame(raf); applyTheme("custom", true); saveUi();
    $("sheet-body").querySelectorAll(".theme-row").forEach((r) => { const on = r.dataset.th === "custom", ck = r.querySelector(".ck"); if (on && !ck) r.insertAdjacentHTML("beforeend", '<span class="ck">✓</span>'); if (!on && ck) ck.remove(); });
  };
  ["cp-bg", "cp-btn"].forEach((id) => { $(id).addEventListener("input", live); $(id).addEventListener("change", done); });
  // точный код цвета (например #292929): вводишь — тема меняется сразу, поле подсвечивается красным, пока код неверный
  [["cp-bg", "cx-bg"], ["cp-btn", "cx-btn"]].forEach(([pid, tid]) => {
    $(pid).addEventListener("input", () => { $(tid).value = $(pid).value; $(tid).classList.remove("bad"); });
    $(tid).addEventListener("input", () => { const h = normHex($(tid).value); $(tid).classList.toggle("bad", !h); if (h) { $(pid).value = h; live(); } });
    $(tid).addEventListener("change", () => { const h = normHex($(tid).value); if (h) { $(pid).value = h; $(tid).value = h; done(); } else { $(tid).value = $(pid).value; $(tid).classList.remove("bad"); } });
  });
}
function openFeedback() {
  const url = S.cfg.feedback_url || "https://t.me/e3to_ya";
  if (tg && tg.openTelegramLink && url.startsWith("https://t.me")) tg.openTelegramLink(url); else window.open(url, "_blank");
}
function topupText() {
  const c = S.cfg || {}, usd = c.topup_amount || 5000, st = c.topup_stars || 10;
  return { usd: usd.toLocaleString("ru-RU") + " $", st };
}
// пополнение за звёзды Telegram: окно с описанием → оплата через родной счёт Telegram
function topup() {
  const t = topupText();
  if (!IN_TG) {   // вне Telegram звёзд нет — демо-счёт пополняется бесплатно на любую сумму в любой валюте
    const opts = CURRENCIES.filter(([code]) => code === "USD" || S.rates[code]).map(([code, , name]) => `<option value="${code}" ${code === S.currency ? "selected" : ""}>${code} — ${esc(name)}</option>`).join("");
    openSheet("Пополнить счёт", `<div style="padding:4px 4px 8px;line-height:1.5;text-align:center">Введи сумму пополнения демо-счёта.<br><span class="muted">Это учебные деньги, настоящих списаний нет.</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><input id="tp-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="Сумма" value="${t.usd.replace(/[^\d]/g, "")}" style="flex:1 1 120px;min-width:0;padding:12px;border-radius:10px;border:1px solid var(--border2);background:var(--card2);color:var(--text);font-size:18px;font-weight:600">
        <select id="tp-cur" style="flex:1 1 160px;min-width:0;padding:12px;border-radius:10px;border:1px solid var(--border2);background:var(--card2);color:var(--text);font-size:15px">${opts}</select></div>
      <div class="hint" id="tp-hint"></div>
      <button class="btn-green" id="pay-free">Пополнить</button>`);
    const usdOf = () => {
      const v = parseFloat($("tp-amt").value.replace(/\s/g, "").replace(",", ".")), c = $("tp-cur").value, r = c === "USD" ? 1 : S.rates[c];
      return Number.isFinite(v) && v > 0 && r > 0 ? { v, c, usd: v / r } : null;
    };
    const upd = () => { const x = usdOf(); $("tp-hint").textContent = !x ? "Введи сумму больше нуля" : x.c === "USD" ? "" : "≈ " + money(x.usd).replace("$", "") + " $ по текущему курсу"; };
    $("tp-amt").oninput = upd; $("tp-cur").onchange = upd; upd();
    $("pay-free").onclick = async () => {
      const x = usdOf(), b = $("pay-free");
      if (!x) { toast("Введи сумму больше нуля"); return; }
      if (x.usd > 100000000) { toast("Слишком большая сумма"); return; }
      if (b.disabled) return; b.disabled = true;
      try { const d = await api("/api/balance/topup", { amount: x.usd }); S.balance = d.balance; closeSheet(); toast("✅ Зачислено: +" + x.v.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " " + x.c); tick(); }
      catch (e) { b.disabled = false; toast(e.message); }
    };
    return;
  }
  openSheet("Пополнить счёт", `<div style="text-align:center;padding:6px 8px 16px;line-height:1.5">
      Получи <b>${t.usd}</b> на демо-счёт<br>за <b>⭐ ${t.st}</b> звёзд Telegram.</div>
    <button class="btn-green" id="pay-stars">Оплатить ⭐ ${t.st}</button>`);
  $("pay-stars").onclick = payStars;
}
async function payStars() {
  const btn = $("pay-stars"); if (btn.disabled) return;
  if (!(tg && tg.openInvoice)) { toast("Оплата доступна только в Telegram"); return; }
  btn.disabled = true;
  try {
    const d = await api("/api/balance/topup", {});
    tg.openInvoice(d.link, (status) => {
      btn.disabled = false;
      if (status === "paid") {
        closeSheet(); toast("Оплата прошла, зачисляю…");
        const before = S.balance; let n = 0;
        const w = setInterval(() => {
          tick();                                             // баланс приходит с каждым опросом
          if (S.balance > before) { clearInterval(w); toast("✅ Зачислено: +" + topupText().usd); }
          else if (++n > 25) { clearInterval(w); toast("Оплата получена, баланс обновится через минуту"); }
        }, 1000);
      } else if (status === "failed") toast("Оплата не прошла");
    });
  } catch (e) { btn.disabled = false; toast(e.message); }
}

// ---------------------------------------------------------------- экран «Сделки» (портфель / История)
const TR = { filter: "all", closed: [], expanded: new Set(), openKey: "" };
const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return (m > 10 && m < 20) ? c : d === 1 ? a : (d > 1 && d < 5) ? b : c; };
const fmtPrice = (a, v) => v == null ? "—" : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: a.decimals, maximumFractionDigits: a.decimals });
const p2 = (n) => String(n).padStart(2, "0");
const fmtDate = (ts) => { if (!ts) return "—"; const d = new Date(ts * 1000); return `${p2(d.getHours())}:${p2(d.getMinutes())} ${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${String(d.getFullYear()).slice(2)}`; };
const moneyShort = (n) => Math.abs(n) >= 1000 ? "$" + Math.round(Math.abs(n)).toLocaleString("ru-RU") : money(Math.abs(n));
const signedShort = (n) => (n >= 0 ? "+ " : "− ") + moneyShort(n);

async function loadClosed() {
  try { TR.closed = (await api("/api/history?limit=200")).trades; } catch (e) { toast(e.message); }
  TR.openKey = S.trades.map((t) => t.id).join();
}
async function openTrades() {
  showAnimated($("trades-view"));
  if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(closeTrades); }
  await loadClosed(); renderTrades(); enterAnim($("tr-list"));
}
function closeTrades() {
  hideAnimated($("trades-view"));
  if (tg && tg.BackButton) { tg.BackButton.offClick(closeTrades); tg.BackButton.hide(); }
}
function trList() {
  const open = [...S.trades].sort((a, b) => b.opened_at - a.opened_at);
  return TR.filter === "open" ? open : TR.filter === "closed" ? TR.closed : [...open, ...TR.closed];
}
function renderTrades() {
  $("tr-chips").innerHTML = [["all", "Все"], ["open", "Открытые"], ["closed", "Закрытые"]]
    .map(([k, l]) => `<button class="chip ${TR.filter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("");
  $("tr-chips").querySelectorAll("[data-f]").forEach((el) => (el.onclick = () => { TR.filter = el.dataset.f; renderTrades(); enterAnim($("tr-list")); }));
  const list = trList();
  $("tr-list").innerHTML = list.length ? list.map((t) => {
    const a = assetById(t.asset) || { title: t.asset, badge: "?", color: "#555", decimals: 2 };
    const isOpen = t.status === "open", exp = TR.expanded.has(t.id);
    const body = !exp ? "" : `<div class="tr-body">
      <div class="kv"><span>Направление</span><span>${t.direction === "up" ? "↑ Вверх" : "↓ Вниз"}</span></div>
      <div class="kv"><span>Ставка</span><span>${money(t.stake)}</span></div>
      ${feeRows(t)}
      <div class="kv"><span>Цена открытия</span><span>${fmtPrice(a, t.entry_price)}</span></div>
      ${t.tp != null ? `<div class="kv"><span>Тейк-профит</span><span class="green">${fmtPrice(a, t.tp)}</span></div>` : ""}
      ${t.sl != null ? `<div class="kv"><span>Стоп-лосс</span><span class="red">${fmtPrice(a, t.sl)}</span></div>` : ""}
      <div class="kv"><span>${isOpen ? "Текущая цена" : "Цена закрытия"}</span><span data-cur="${t.id}">${fmtPrice(a, isOpen ? t.price : t.exit_price)}</span></div>
      <div class="kv"><span>Дата открытия</span><span>${fmtDate(t.opened_at)}</span></div>
      <div class="kv"><span>Дата закрытия</span><span>${isOpen ? "—" : fmtDate(t.closed_at)}</span></div>
      <div class="tr-btns"><button class="more" data-more="${t.id}">Подробнее</button><button class="share" data-share="${t.id}" aria-label="Поделиться">⤴</button></div></div>`;
    return `<div class="tr-row"><button class="tr-head" data-toggle="${t.id}">
      <span class="tr-st ${isOpen ? "live" : ""}">${isOpen ? "●" : "✓"}</span>
      ${assetIcon(a, 28)}
      <span class="tr-name">${esc(a.title)}<small class="tr-ex">${t.exchange ? esc(exName(t.exchange)) + " · " : ""}×${t.multiplier}${t.close_reason === "tp" ? " · 🎯 TP" : t.close_reason === "sl" ? " · 🛑 SL" : ""}</small></span>
      <span class="tr-pnl ${t.pnl >= 0 ? "green" : "red"}" data-pnl="${t.id}">${signed(t.pnl)}</span>
      <span class="tr-chev">${exp ? "⌃" : "⌄"}</span></button>${body}</div>`;
  }).join("") : '<div class="tr-empty">Сделок пока нет</div>';
  const byId = new Map(list.map((t) => [t.id, t]));
  $("tr-list").querySelectorAll("[data-toggle]").forEach((el) => (el.onclick = () => {
    const id = Number(el.dataset.toggle); TR.expanded.has(id) ? TR.expanded.delete(id) : TR.expanded.add(id); renderTrades();
  }));
  $("tr-list").querySelectorAll("[data-more]").forEach((el) => (el.onclick = () => tradeDetails(byId.get(Number(el.dataset.more)))));
  $("tr-list").querySelectorAll("[data-share]").forEach((el) => (el.onclick = () => shareTrade(byId.get(Number(el.dataset.share)))));
  updateTradesTotal(list);
}
function updateTradesTotal(list) {
  list = list || trList();
  const sum = list.reduce((s, t) => s + t.pnl, 0);
  $("tr-count").textContent = `${list.length} ${plural(list.length, "сделка", "сделки", "сделок")}`;
  const el = $("tr-sum"); el.textContent = signedShort(sum); el.className = "tr-sum " + (sum >= 0 ? "green" : "red");
}
// вызывается каждый тик, пока экран открыт: обновляем только цифры, чтобы не сбрасывать прокрутку
function updateTradesLive() {
  if ($("trades-view").hidden) return;
  if (S.trades.map((t) => t.id).join() !== TR.openKey) { loadClosed().then(renderTrades); return; }   // сделка закрылась/открылась
  S.trades.forEach((t) => {
    const el = document.querySelector(`[data-pnl="${t.id}"]`);
    if (el) { el.textContent = signed(t.pnl); el.className = "tr-pnl " + (t.pnl >= 0 ? "green" : "red"); }
    const cur = document.querySelector(`[data-cur="${t.id}"]`), a = assetById(t.asset);
    if (cur && a) cur.textContent = fmtPrice(a, t.price);
  });
  updateTradesTotal();
}
// комиссия круга (вход+выход) и funding — те же формулы, что в боте для Termux (см. fees.py на сервере)
function feeRows(t) {
  const a = assetById(t.asset);
  if (!a || (a.market !== "fut" && a.market !== "spot")) return "";
  const fund = t.status === "open" ? t.funding_now : t.funding;
  return `<div class="kv"><span>Комиссия (вход+выход)</span><span class="red">−${money(t.fee || 0)}</span></div>` +
    (a.market === "fut" ? `<div class="kv"><span>Funding (${t.fund_rate != null ? (t.fund_rate >= 0 ? "+" : "") + Number(t.fund_rate).toFixed(4) + "% / 8 ч" : "—"})</span><span class="${(fund || 0) >= 0 ? "green" : "red"}">${signed(fund || 0)}</span></div>` : "");
}
function tradeDetails(t) {
  if (!t) return;
  const a = assetById(t.asset) || { title: t.asset, decimals: 2 }, isOpen = t.status === "open";
  const dur = Math.max(0, Math.round(((isOpen ? Date.now() / 1000 : t.closed_at) - t.opened_at)));
  const durTxt = dur >= 3600 ? `${Math.floor(dur / 3600)} ч ${Math.floor(dur % 3600 / 60)} мин` : dur >= 60 ? `${Math.floor(dur / 60)} мин ${dur % 60} с` : `${dur} с`;
  const reason = { manual: "вручную", liquidation: "автоматически (убыток достиг ставки)", tp: "по тейк-профиту", sl: "по стоп-лоссу" }[t.close_reason] || "—";
  openSheet(a.title, `
    <div class="kv"><span>Результат</span><b class="${t.pnl >= 0 ? "green" : "red"}">${signed(t.pnl)} (${(t.pnl / t.stake * 100).toFixed(1)}%)</b></div>
    <div class="kv"><span>Направление</span><span>${t.direction === "up" ? "↑ Вверх" : "↓ Вниз"}</span></div>
    <div class="kv"><span>Ставка</span><span>${money(t.stake)}</span></div>
    <div class="kv"><span>Плечо</span><span>×${t.multiplier}</span></div>
    ${feeRows(t)}
    <div class="kv"><span>Биржа</span><span>${t.exchange ? esc(exName(t.exchange)) : "авто"}</span></div>
    ${t.tp != null ? `<div class="kv"><span>Тейк-профит</span><span class="green">${fmtPrice(a, t.tp)}</span></div>` : ""}
    ${t.sl != null ? `<div class="kv"><span>Стоп-лосс</span><span class="red">${fmtPrice(a, t.sl)}</span></div>` : ""}
    <div class="kv"><span>Длительность</span><span>${durTxt}</span></div>
    <div class="kv"><span>Закрыта</span><span>${isOpen ? "ещё открыта" : reason}</span></div>
    <div class="tr-btns"><button class="more" id="d-chart">Открыть график</button>${isOpen ? '<button class="more" id="d-lv">TP / SL</button><button class="more" id="d-stop">Закрыть</button>' : ""}</div>`);
  if (isOpen) $("d-lv").onclick = () => openTpslTrade(t);
  $("d-chart").onclick = () => { closeSheet(); closeTrades(); showPage("trade"); selectAsset(t.asset); };
  if (isOpen) $("d-stop").onclick = async () => {
    try { await api("/api/trade/close", { trade_id: t.id }); closeSheet(); await tick(); } catch (e) { toast(e.message); }
  };
}
function shareTrade(t) {
  if (!t) return;
  const a = assetById(t.asset) || { title: t.asset, decimals: 2 };
  const text = `${a.title} ${t.direction === "up" ? "↑ Вверх" : "↓ Вниз"}: ${signed(t.pnl)}\nВход ${fmtPrice(a, t.entry_price)} → ${t.status === "open" ? "сейчас " + fmtPrice(a, t.price) : fmtPrice(a, t.exit_price)}`;
  const link = "https://t.me/share/url?url=%20&text=" + encodeURIComponent(text);
  if (tg && tg.openTelegramLink) tg.openTelegramLink(link); else window.open(link, "_blank");
}

// ---------------------------------------------------------------- валюта баланса
const flagOf = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
const norm = (t) => String(t).toLowerCase().replace(/ё/g, "е").trim();
function openCurrency() {
  const ready = Object.keys(S.rates).length > 0;
  openSheet("Показать баланс в", `<div class="search"><input id="cur-q" placeholder="Поиск: валюта, страна или код (RUB)" autocomplete="off" enterkeyhint="search"></div>
    <div id="cur-list"></div>
    <div class="hint">${ready ? (S.ratesLive ? "Курсы обновляются автоматически" : "Курсы приблизительные (нет связи с источником)") : "Курсы загружаются…"}.<br>Сделки и ставки всегда считаются в долларах.</div>`);
  const draw = () => {
    const q = norm($("cur-q").value);
    const list = CURRENCIES.filter(([code, , name, kw]) => (code === "USD" || S.rates[code]) &&
      (!q || norm(code).includes(q) || norm(name).includes(q) || norm(kw).includes(q)));
    $("cur-list").innerHTML = list.length ? list.map(([code, cc, name]) =>
      `<div class="cur-row ${code === S.currency ? "sel" : ""}" data-c="${code}"><span class="fl">${flagOf(cc)}</span>
       <span class="nm">${code} - ${esc(name)}</span>${code === S.currency ? '<span class="ck">✓</span>' : ""}</div>`).join("")
      : '<div class="hint">Ничего не найдено</div>';
    $("cur-list").querySelectorAll("[data-c]").forEach((el) => (el.onclick = () => {
      S.currency = el.dataset.c; saveUi(); renderBalance(); closeSheet();
    }));
  };
  $("cur-q").oninput = draw; draw();
}
async function loadRates() {
  try { const d = await api("/api/rates"); S.rates = d.rates; S.ratesLive = d.live; renderBalance(); } catch (e) { /* не критично */ }
}

// ---------------------------------------------------------------- уведомления о цене
function openAlerts() {
  const a = assetById(S.asset), p0 = S.quote && S.quote.price;
  if (!p0) return toast("Цена ещё загружается, попробуй через секунду");
  const f = (v) => v.toFixed(a.decimals);
  api("/api/alerts?asset=" + S.asset).then(({ alerts }) => {
    const rows = alerts.map((t) => `<div class="row alert-row"><span>${t.above ? "↑" : "↓"}</span>
      <div class="grow">${fmtPrice(a, t.target)}<div class="sub">${t.comment ? esc(t.comment) + " · " : ""}${t.status === "triggered" ? "✓ сработало " + fmtDate(t.triggered_at) : "ждёт"}</div></div>
      <button class="x" data-del="${t.id}" aria-label="Удалить">✕</button></div>`).join("");
    openSheet("Уведомления", `
      <div class="asset-card">${assetIcon(a, 30)}<span class="grow">${esc(a.name)}</span><span class="px">${f(p0)}</span></div>
      ${rows}
      <div class="new-alert"><span>＋</span>Новое уведомление</div>
      <div class="presets">${[[-1, "−", "1.0%"], [-0.1, "−", "0.1%"], [0.1, "+", "0.1%"], [1, "+", "1.0%"]]
        .map(([v, sg, t]) => `<button class="preset ${v < 0 ? "dn" : "upc"}" data-p="${v}"><small>${sg}</small>${t}</button>`).join("")}</div>
      <div class="fields">
        <div class="fld"><label>Изменение цены (%)</label><input id="al-pct" inputmode="decimal" value="0"></div>
        <div class="fld"><label>Цена</label><input id="al-price" inputmode="decimal" value="${f(p0)}"></div>
      </div>
      <div class="comment"><label>Комментарий</label><input id="al-note" maxlength="100" placeholder="Комментарий для уведомления..."></div>
      <button class="btn-green" id="al-add">Добавить уведомление</button>`);
    const num = (el) => parseFloat(el.value.replace(",", ".").replace("%", ""));
    const setPct = (pct) => { $("al-pct").value = String(Math.round(pct * 100) / 100); $("al-price").value = f(p0 * (1 + pct / 100)); };
    $("sheet-body").querySelectorAll("[data-p]").forEach((el) => (el.onclick = () => setPct(Number(el.dataset.p))));
    $("al-pct").oninput = () => { const v = num($("al-pct")); if (!isNaN(v)) $("al-price").value = f(p0 * (1 + v / 100)); };
    $("al-price").oninput = () => { const v = num($("al-price")); if (!isNaN(v) && v > 0) $("al-pct").value = String(Math.round((v / p0 - 1) * 10000) / 100); };
    $("sheet-body").querySelectorAll("[data-del]").forEach((el) => (el.onclick = async () => {
      try { await api("/api/alerts/delete", { id: Number(el.dataset.del) }); openAlerts(); tick(); } catch (e) { toast(e.message); }
    }));
    $("al-add").onclick = async () => {
      const price = num($("al-price"));
      if (isNaN(price)) return toast("Укажи цену или изменение в %");
      try {
        await api("/api/alerts/add", { asset: S.asset, price, comment: $("al-note").value });
        toast("Уведомление добавлено"); openAlerts(); tick();
      } catch (e) { toast(e.message); }
    };
  }).catch((e) => toast(e.message));
}

// ---------------------------------------------------------------- страницы
// Переход между страницами: старая и новая едут рядом (слайд). Вперёд по меню — справа налево, назад — слева направо.
// Нет анимаций (Настройки / «уменьшить движение») — меняем сразу.
// выполнить fn после того, как браузер уже отрисовал первый кадр анимации: тяжёлая работа до этого откладывает старт анимации — это и есть «фриз» на первом нажатии
const afterPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
let slideRun = null;
function slideFinish() { if (slideRun) { const r = slideRun; slideRun = null; r.anims.forEach((a) => { try { a.cancel(); } catch (e) {} }); r.cleanup(); } }
function slidePages(from, to, swap, heavy) {
  slideFinish();
  const a = $("page-" + from), b = $("page-" + to), app = $("app");
  if (!a || !b || !a.animate || !app) { swap(); if (heavy) heavy(); return; }
  const ORDER = ["trade", "learn", "analytics", "profile"], dir = ORDER.indexOf(to) >= ORDER.indexOf(from) ? 1 : -1;
  swap();                                                           // новая страница встаёт на своё место в разметке — меню и всё остальное не двигаются
  const br = b.getBoundingClientRect(), ar = app.getBoundingClientRect(), W = br.width || app.clientWidth;
  // уходящая страница — поверх, точно в тех же границах, что и новая (из потока убираем только её)
  a.style.cssText = "top:" + (br.top - ar.top - app.clientTop) + "px;left:" + (br.left - ar.left - app.clientLeft) + "px;width:" + br.width + "px;height:" + br.height + "px";
  a.classList.add("active", "slide-out"); b.classList.add("slide-in");
  const D = AKs(460), easing = "cubic-bezier(.22,.9,.24,1)", o = { duration: D, easing, fill: "both" };
  const anims = [                                                   // уходящая: сдвиг + нарастающее размытие и затухание
    a.animate([{ transform: "translate3d(0,0,0)", filter: "blur(0px)", opacity: 1 },
               { transform: "translate3d(" + (-dir * W * 0.35) + "px,0,0)", filter: "blur(10px)", opacity: 0 }], o),
    b.animate([{ transform: "translate3d(" + (dir * W) + "px,0,0)", filter: "blur(10px)", opacity: 0.4 },     // входящая: заезжает и «наводится на резкость»
               { transform: "translate3d(0,0,0)", filter: "blur(0px)", opacity: 1 }], o),
  ];
  const cleanup = () => {
    a.classList.remove("slide-out"); b.classList.remove("slide-in"); a.style.cssText = "";
    if (a.id !== "page-" + S.page) a.classList.remove("active");
  };
  slideRun = { anims, cleanup };
  if (heavy) afterPaint(heavy);                                     // перерисовка графика/виджетов — уже после старта анимации (она идёт на GPU и не ждёт main-поток)
  anims[1].onfinish = () => { if (slideRun && slideRun.anims === anims) { slideRun = null; anims.forEach((x) => { try { x.cancel(); } catch (e) {} }); cleanup(); } };
}
function showPage(name) {
  const cur = document.querySelector(".nav button.active"), from = cur ? cur.dataset.page : S.page;   // последняя «заявленная» страница
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
  if (window.navGlassSync) navGlassSync(true);                                        // ползунок меню едет сразу
  const swap = () => {                                                                // лёгкая часть: просто показать нужную страницу
    S.page = name;
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + name));
  };
  const heavy = () => {                                                               // тяжёлая часть: графики, виджеты, подсказки
    if (S.page !== name) return;
    if (name === "analytics") renderAnalytics();
    if (name === "trade") renderChart(true);
    hintsSync();
  };
  if (from !== name && animOn()) slidePages(S.page, name, swap, heavy); else { slideFinish(); swap(); heavy(); }
}
let anKey = "";
function renderAnalytics(force) {
  const a = assetById(S.asset); $("an-asset").textContent = "Технический анализ · " + a.name;
  const dark = S.chartTheme !== "light", key = a.tv + "|" + (dark ? "d" : "l") + "|" + (S.themeBg || "");
  if (!force && anKey === key) return;         // виджеты уже загружены для этого актива и темы — открываем мгновенно
  anKey = key;
  // isTransparent: виджет прозрачный и показывает фон приложения (var(--bg)), а не собственный серый/белый
  mountTV($("tv-technical"), "embed-widget-technical-analysis.js", {
    interval: "5m", width: "100%", height: "100%", isTransparent: true, symbol: a.tv, showIntervalTabs: true,
    displayMode: "single", locale: "ru", colorTheme: dark ? "dark" : "light" });
  mountTV($("tv-events"), "embed-widget-events.js", {
    colorTheme: dark ? "dark" : "light", isTransparent: true, width: "100%", height: "100%", locale: "ru",
    importanceFilter: "-1,0,1", countryFilter: "us,eu,gb,jp,ru" });
}

// ---------------------------------------------------------------- тейк-профит / стоп-лосс (как в TradingView)
// Уровни — это ЦЕНЫ. На графике рисуются пунктирной линией с «пилюлей» (TP +$5.00 · 50%): пилюлю можно тянуть вверх/вниз,
// тап открывает окно с точными значениями, ✕ убирает уровень. Рисуем в SVG поверх графика (как линии тренда),
// чтобы далёкий уровень не растягивал шкалу цены. Сервер сам закроет сделку, когда цена дойдёт до уровня.
const LV_COL = { tp: "#2e9e3a", sl: "#e03500" };
const LV_NAME = { tp: "Тейк-профит", sl: "Стоп-лосс" };
const tradeSign = (t) => (t.direction === "up" ? 1 : -1);
const netAdj = (t) => -(t.fee || 0) + (t.funding_now || 0);                  // комиссия круга и funding уже начисленный (как на сервере)
const pnlAt = (t, p) => Math.max(t.stake * t.multiplier * tradeSign(t) * (p / t.entry_price - 1) + netAdj(t), -t.stake);
const priceForPnl = (t, pnl) => t.entry_price * (1 + (tradeSign(t) * (pnl - netAdj(t))) / (t.stake * t.multiplier));
const liqOf = (t) => t.liq != null ? t.liq : t.entry_price * (1 - tradeSign(t) / t.multiplier);
const roundTo = (a, v) => Number(Number(v).toFixed(a.decimals));
const marketTrades = () => S.trades.filter(onThisMarket);

function syncLevels() { LW.lvKey = ""; }          // вызывается при смене сделок/свечей: пересобрать слой
function syncTpslBtn() {
  const b = $("btn-tpsl"); if (!b) return;
  const has = marketTrades().some((t) => t.tp != null || t.sl != null) || (!marketTrades().length && S.pre.on !== false && (S.pre.tp || S.pre.sl));
  b.classList.toggle("on", !!has);
}
const lvText = (t, k, v) => { const pnl = pnlAt(t, v), pc = pnl / t.stake * 100; return `${k.toUpperCase()}  ${signed(pnl)} · ${pc > 0 ? "+" : pc < 0 ? "−" : ""}${Math.abs(pc).toFixed(0)}%`; };
// допустимый диапазон уровня при перетаскивании (как на сервере): TP — по ту сторону текущей цены, где прибыль;
// SL — между текущей ценой и ликвидацией. Иначе при протяжке через цену «100% → 0 → снова 100%» (убыток показывался как прибыль).
function lvClamp(t, k, p) {
  const a = assetById(t.asset), tick = Math.pow(10, -a.decimals), up = t.direction === "up";
  const px = t.price != null ? t.price : t.entry_price, liq = liqOf(t);
  let lo = 0, hi = Infinity;
  if (k === "tp") { if (up) lo = px + tick; else hi = px - tick; }
  else if (up) { lo = liq + tick; hi = px - tick; } else { lo = px + tick; hi = liq - tick; }
  if (lo > hi) return null;
  return Math.min(Math.max(p, lo), hi);
}

// TP/SL: пока их трогают (и 5 с после) видны пилюли и цены; потом остаются только цветные линии.
// Вернуть пилюли — коснуться графика у самой линии.
const LV_IDLE_MS = 5000;
function lvWake() { LW.lvWake = performance.now(); }
function lvAwake() { return !!LW.drag2 || performance.now() - (LW.lvWake || 0) < LV_IDLE_MS; }
function bindLvWake() {
  if (LW.wakeBound) return; const box = $("lw-chart"); if (!box) return;
  LW.wakeBound = true;
  box.addEventListener("pointerdown", (e) => {
    if (!LW.lvEls || !LW.lvEls.length) return;
    const y = e.clientY - box.getBoundingClientRect().top;
    if (LW.lvEls.some((el) => el.yNow != null && Math.abs(el.yNow - y) < 30)) lvWake();
  }, true);
}
function rebuildLevels(items) {
  const svg = $("tpsl-svg"); svg.innerHTML = ""; LW.lvEls = [];
  items.forEach((it) => {
    const col = LV_COL[it.k], g = svgEl("g", {});
    const line = svgEl("line", { stroke: col, "stroke-width": 1, "stroke-dasharray": "5 4", "pointer-events": "none" });
    const tagBg = svgEl("rect", { rx: 3, height: 18, fill: col, "pointer-events": "none" });
    const tag = svgEl("text", { fill: "#fff", "font-size": 11, "font-weight": 600, "pointer-events": "none" });
    const pill = svgEl("g", { class: "lv-hit", "pointer-events": "all", style: "cursor:ns-resize;touch-action:none" });
    const bg = svgEl("rect", { rx: 9, height: 22, fill: S.themeBg, "fill-opacity": 0.6, stroke: col, "stroke-opacity": 0.75, "stroke-width": 1 });
    const txt = svgEl("text", { fill: "#fff", "font-size": 12, "font-weight": 600, y: 15, x: 10 });
    const xBg = svgEl("circle", { r: 7, fill: col, "fill-opacity": 0.8, cy: 11 });
    const xTx = svgEl("text", { fill: "#fff", "font-size": 11, "font-weight": 700, "text-anchor": "middle", y: 15, "pointer-events": "none" });
    xTx.textContent = "✕";
    const xHit = svgEl("circle", { r: 14, fill: "transparent", cy: 11, "pointer-events": "all", style: "cursor:pointer" });
    pill.append(bg, txt, xBg, xTx, xHit); g.append(line, tagBg, tag, pill); svg.append(g);
    pill.addEventListener("pointerdown", (e) => { if (e.target === xHit) return; startLvDrag(e, it.t.id, it.k); });
    pill.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    xHit.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); clearLevel(it.t.id, it.k); });
    LW.lvEls.push({ it, line, tagBg, tag, pill, bg, txt, xBg, xTx, xHit });
  });
}
function tpslFrame() {
  requestAnimationFrame(tpslFrame);
  if (!LW.chart || !LW.series || document.hidden || S.page !== "trade" || S.chartMode !== "own") return;
  const items = [], D = LW.drag2;
  marketTrades().forEach((t) => ["tp", "sl"].forEach((k) => {
    const v = D && D.id === t.id && D.k === k ? D.price : t[k];
    if (v != null) items.push({ t, k, v });
  }));
  const key = items.map((i) => i.t.id + i.k).join() + "|" + S.asset + "|" + S.tf;
  const sig = items.map((i) => i.t.id + i.k + i.v).join() + "|" + S.asset + "|" + S.tf;
  if (sig !== LW.lvSig) { LW.lvSig = sig; lvWake(); }
  if (!D && key !== LW.lvKey) { LW.lvKey = key; rebuildLevels(items); }
  if (!LW.lvEls) return;
  bindLvWake();
  const awake = lvAwake();
  const W = $("lw-chart").clientWidth, top = 14, bot = mainBottom() - 14, GAP = 26;
  const act = [];
  LW.lvEls.forEach((el) => {
    const live = items.find((i) => i.t.id === el.it.t.id && i.k === el.it.k);
    if (!live) { el.line.style.display = el.tagBg.style.display = el.tag.style.display = el.pill.style.display = "none"; return; }
    const yRaw = LW.series.priceToCoordinate(live.v), vis = yRaw == null ? "none" : "";
    el.line.style.display = vis;
    [el.tagBg, el.tag, el.pill].forEach((n) => (n.style.display = awake ? vis : "none"));   // без касаний — только линия, без цены
    el.yNow = yRaw;
    if (yRaw == null) return;
    act.push({ el, live, yRaw, y: Math.min(Math.max(yRaw, top), bot) });
  });
  // пилюли близких уровней не должны налезать друг на друга (иначе нижняя перекрывает верхнюю и её не ухватить):
  // раздвигаем их по вертикали, сами линии остаются ровно на своих ценах
  const sorted = act.slice().sort((p, q) => p.y - q.y);
  sorted.forEach((it, i) => {
    it.py = i && it.y < sorted[i - 1].py + GAP ? sorted[i - 1].py + GAP : it.y;
    it.ty = i && it.y < sorted[i - 1].ty + 20 ? sorted[i - 1].ty + 20 : it.y;      // метки цены на оси — свой, более плотный шаг
  });
  const over = sorted.length ? sorted[sorted.length - 1].py - bot : 0;
  if (over > 0) sorted.forEach((it) => { it.py -= over; it.ty -= over; });         // упёрлись в низ — сдвигаем всю стопку вверх
  act.forEach(({ el, live, yRaw, y, py, ty }) => {
    const a = assetById(live.t.asset), off = yRaw < top ? "↑" : yRaw > bot ? "↓" : "";
    el.line.setAttribute("x1", 0); el.line.setAttribute("x2", W); el.line.setAttribute("y1", y); el.line.setAttribute("y2", y);
    el.line.setAttribute("opacity", off ? 0.3 : 0.75);
    el.tagBg.setAttribute("fill-opacity", 0.8);
    const label = fmtPrice(a, live.v), tw = label.length * 6.6 + 10;
    el.tag.textContent = label; el.tag.setAttribute("x", W - tw - 2 + 5); el.tag.setAttribute("y", ty + 4);
    el.tagBg.setAttribute("x", W - tw - 2); el.tagBg.setAttribute("y", ty - 9); el.tagBg.setAttribute("width", tw);
    const text = (off ? off + " " : "") + lvText(live.t, live.k, live.v);
    el.txt.textContent = text;
    const w = text.length * 6.9 + 38;
    el.bg.setAttribute("width", w); el.xBg.setAttribute("cx", w - 13); el.xTx.setAttribute("x", w - 13); el.xHit.setAttribute("cx", w - 13);
    el.pill.setAttribute("transform", `translate(${Math.max(56, Math.min(W * 0.5 - w / 2, W - w - 70))},${py - 11})`);
  });
}
function startLvDrag(e, id, k) {
  e.preventDefault(); e.stopPropagation(); lvWake();
  const t = S.trades.find((x) => x.id === id); if (!t || LW.drag2) return;
  LW.drag2 = { id, k, price: t[k], moved: false, y0: e.clientY }; hap("light", true);
  window.addEventListener("pointermove", lvMove); window.addEventListener("pointerup", lvEnd); window.addEventListener("pointercancel", lvEnd);
}
function lvMove(e) {
  const D = LW.drag2; if (!D) return;
  lvWake();
  if (Math.abs(e.clientY - D.y0) > 4) D.moved = true;
  if (!D.moved) return;
  const t = S.trades.find((x) => x.id === D.id), r = evXY(e); if (!t) return;
  const p = LW.series.coordinateToPrice(Math.min(Math.max(r.y, 0), mainBottom()));
  if (p != null && p > 0) { const c = lvClamp(t, D.k, p); if (c != null && c > 0) { const np = roundTo(assetById(t.asset), c); if (np !== D.price) { D.price = np; hap("sel"); } if (Math.abs(c - p) > 1e-12 * Math.abs(p) && !D.edge) { D.edge = true; hap("rigid", true); } else if (Math.abs(c - p) <= 1e-12 * Math.abs(p)) D.edge = false; } }
}
async function lvEnd() {
  window.removeEventListener("pointermove", lvMove); window.removeEventListener("pointerup", lvEnd); window.removeEventListener("pointercancel", lvEnd);
  const D = LW.drag2; if (!D) return;
  const t = S.trades.find((x) => x.id === D.id);
  if (!D.moved || !t) { LW.drag2 = null; if (t) openTpslTrade(t); return; }
  try {
    const { trade } = await api("/api/trade/levels", { trade_id: D.id, [D.k]: D.price });
    Object.assign(t, { tp: trade.tp, sl: trade.sl });
    hap("light", true);
  } catch (e) { toast(e.message); }
  LW.drag2 = null; LW.lvKey = ""; syncTpslBtn(); lvWake();
}
async function clearLevel(id, k) {
  const t = S.trades.find((x) => x.id === id);
  try {
    const { trade } = await api("/api/trade/levels", { trade_id: id, [k]: null });
    if (t) Object.assign(t, { tp: trade.tp, sl: trade.sl });
    LW.lvKey = ""; syncTpslBtn(); toast(LV_NAME[k] + " убран");
  } catch (e) { toast(e.message); }
}
function notifyAutoClosed(list) {
  const lines = list.map((t) => {
    const a = assetById(t.asset), name = a ? a.name : t.asset, r = t.close_reason;
    return (r === "tp" ? "🎯 Тейк-профит: " : r === "sl" ? "🛑 Стоп-лосс: " : "⚠️ Ликвидация: ") + `${name} ${signed(t.pnl)}`;
  });
  toast(lines.join("\n"));
  hap(list.some((t) => t.pnl < 0) ? "warn" : "ok", true);
  LW.lvKey = "";
}

// Кнопка TP/SL: если по этой паре есть сделка — настраиваем её, иначе задаём заготовку для следующих сделок.
function openTpsl() {
  const open = marketTrades();
  if (open.length) return openTpslTrade(open[0]);
  openTpslPre();
}
const numOf = (el) => { const v = parseFloat(String(el.value).replace(",", ".").replace("%", "")); return isFinite(v) ? v : NaN; };

function openTpslPre() {
  const draw = () => {
    const st = S.stake, lev = levOf();
    const hint = (pct, sg) => (pct ? `${sg}${money(st * pct / 100)} · цена пройдёт ${(pct / lev).toFixed(pct / lev < 1 ? 3 : 2).replace(/\.?0+$/, "")}%` : "не задан");
    openSheet("Тейк-профит и стоп-лосс", `
      <div class="lv-info"><div class="kv"><span>Ставка</span><span>${money(st)}</span></div><div class="kv"><span>Плечо</span><span class="lvl">×${lev}</span></div></div>
      <div class="hint" style="text-align:left;padding:6px 2px">Сделок по ${esc(assetById(S.asset).name)} сейчас нет. Задай, сколько прибыли/убытка закрыть автоматически — уровни будут стоять на каждой новой сделке. Потом их можно двигать прямо на графике.</div>
      <label class="dom-tap" style="margin:6px 2px 2px"><span>Включить TP/SL для новых сделок и заявок</span><input type="checkbox" id="pre-on" class="spot-in" ${S.pre.on !== false ? "checked" : ""}><span class="spot-sw"></span></label>
      <div class="lv-sec"><span class="lv-dot" style="background:${LV_COL.tp}"></span>Тейк-профит</div>
      <div class="fld"><label>Прибыль, % от ставки</label><input id="pre-tp" inputmode="decimal" value="${S.pre.tp || ""}" placeholder="например 50"></div>
      <div class="chips lv-chips">${[25, 50, 100, 200].map((v) => `<button class="chip ${S.pre.tp === v ? "on" : ""}" data-tp="${v}">${v}%</button>`).join("")}</div>
      <div class="lv-hint" id="pre-tp-h">${hint(S.pre.tp, "+")}</div>
      <div class="lv-sec"><span class="lv-dot" style="background:${LV_COL.sl}"></span>Стоп-лосс</div>
      <div class="fld"><label>Убыток, % от ставки (1–99)</label><input id="pre-sl" inputmode="decimal" value="${S.pre.sl || ""}" placeholder="например 30"></div>
      <div class="chips lv-chips">${[10, 25, 50, 75].map((v) => `<button class="chip ${S.pre.sl === v ? "on" : ""}" data-sl="${v}">${v}%</button>`).join("")}</div>
      <div class="lv-hint" id="pre-sl-h">${hint(S.pre.sl, "−")}</div>
      <button class="btn-green" id="pre-ok" style="margin-top:22px">Сохранить</button>
      <button class="btn-link" id="pre-off">Отключить оба</button>`);
    $("sheet-body").querySelectorAll("[data-tp]").forEach((el) => (el.onclick = () => { S.pre.tp = Number(el.dataset.tp); draw(); }));
    $("sheet-body").querySelectorAll("[data-sl]").forEach((el) => (el.onclick = () => { S.pre.sl = Number(el.dataset.sl); draw(); }));
    $("pre-tp").oninput = () => { const v = numOf($("pre-tp")); $("pre-tp-h").textContent = hint(v > 0 ? v : 0, "+"); };
    $("pre-sl").oninput = () => { const v = numOf($("pre-sl")); $("pre-sl-h").innerHTML = v >= 100 ? '<span class="bad">Стоп должен быть меньше 100% — там ликвидация</span>' : hint(v > 0 ? v : 0, "−"); };
    $("pre-off").onclick = () => { S.pre = { tp: null, sl: null, on: S.pre.on !== false }; saveUi(); if (typeof domTpslSync === "function") domTpslSync(); syncTpslBtn(); closeSheet(); toast("TP/SL для новых сделок выключены"); };
    $("pre-ok").onclick = () => {
      const tp = numOf($("pre-tp")), sl = numOf($("pre-sl"));
      if (sl >= 100) return toast("Стоп-лосс должен быть меньше 100% ставки");
      S.pre = { tp: tp > 0 ? Math.round(tp * 100) / 100 : null, sl: sl > 0 ? Math.round(sl * 100) / 100 : null, on: $("pre-on") ? $("pre-on").checked : true };
      saveUi(); syncTpslBtn(); if (typeof domTpslSync === "function") domTpslSync(); closeSheet();
      toast(S.pre.tp || S.pre.sl ? "Сохранено: уровни встанут на новые сделки" : "TP/SL выключены");
    };
  };
  draw();
}

function openTpslTrade(t0) {
  const a = assetById(t0.asset), t = S.trades.find((x) => x.id === t0.id) || t0;
  const up = t.direction === "up", liq = liqOf(t), px = t.price != null ? t.price : t.entry_price;
  const val = { tp: t.tp, sl: t.sl };
  const row = (k) => `
    <div class="lv-sec"><span class="lv-dot" style="background:${LV_COL[k]}"></span>${LV_NAME[k]}<button class="lv-rm" data-rm="${k}">Убрать</button></div>
    <div class="fields">
      <div class="fld"><label>Цена</label><input id="lv-${k}-p" inputmode="decimal" value="${val[k] != null ? val[k].toFixed(a.decimals) : ""}" placeholder="${fmtPrice(a, k === "tp" ? (up ? px * 1.002 : px * 0.998) : (up ? px * 0.998 : px * 1.002))}"></div>
      <div class="fld"><label>${k === "tp" ? "Прибыль, $" : "Убыток, $"}</label><input id="lv-${k}-m" inputmode="decimal" value="${val[k] != null ? Math.abs(pnlAt(t, val[k])).toFixed(2) : ""}" placeholder="0.00"></div>
    </div>
    <div class="chips lv-chips">${(k === "tp" ? [25, 50, 100, 200] : [10, 25, 50, 75]).map((v) => `<button class="chip" data-pc="${k}:${v}">${v}%</button>`).join("")}</div>
    <div class="lv-hint" id="lv-${k}-h"></div>`;
  openSheet("TP / SL", `
    <div class="lv-info">
      <div class="kv"><span>${esc(a.name)} · ${up ? "↑ Вверх" : "↓ Вниз"}</span><span class="lvl">×${t.multiplier}</span></div>
      <div class="kv"><span>Цена входа</span><span>${fmtPrice(a, t.entry_price)}</span></div>
      <div class="kv"><span>Сейчас</span><span id="lv-now">${fmtPrice(a, px)}</span></div>
      <div class="kv"><span>Ликвидация</span><span class="red">${fmtPrice(a, liq)}</span></div>
    </div>` + row("tp") + row("sl") + `
    <div class="hint" style="text-align:left;padding:10px 2px">Тейк-профит закрывает сделку в плюс, стоп-лосс — ограничивает убыток. Закрытие идёт по цене уровня. Уровни можно тянуть пальцем прямо на графике.</div>
    <button class="btn-green" id="lv-ok" style="margin-top:6px">Сохранить</button>`);
  const body = $("sheet-body");
  const hintFor = (k) => {
    const v = val[k], h = $(`lv-${k}-h`); if (!h) return;
    if (v == null) { h.textContent = "не задан"; return; }
    const bad = k === "tp" ? (up ? v <= px : v >= px) : (up ? v >= px || v <= liq : v <= px || v >= liq);
    h.innerHTML = bad ? `<span class="bad">${k === "tp" ? "Должен быть " + (up ? "выше" : "ниже") + " текущей цены" : "Должен быть " + (up ? "ниже" : "выше") + " текущей цены, но не дальше ликвидации"}</span>`
      : `${signed(pnlAt(t, v))} (${(pnlAt(t, v) / t.stake * 100).toFixed(0)}% ставки) · цена ${((v / t.entry_price - 1) * 100).toFixed(3)}% от входа`;
  };
  const fromPrice = (k) => { const v = numOf($(`lv-${k}-p`)); val[k] = v > 0 ? v : null; $(`lv-${k}-m`).value = val[k] != null ? Math.abs(pnlAt(t, val[k])).toFixed(2) : ""; hintFor(k); };
  const fromMoney = (k) => {
    const m = numOf($(`lv-${k}-m`)); if (!(m > 0)) { val[k] = null; hintFor(k); return; }
    val[k] = roundTo(a, priceForPnl(t, k === "tp" ? m : -m)); $(`lv-${k}-p`).value = val[k] > 0 ? val[k].toFixed(a.decimals) : ""; if (!(val[k] > 0)) val[k] = null; hintFor(k);
  };
  ["tp", "sl"].forEach((k) => { $(`lv-${k}-p`).oninput = () => fromPrice(k); $(`lv-${k}-m`).oninput = () => fromMoney(k); hintFor(k); });
  body.querySelectorAll("[data-pc]").forEach((el) => (el.onclick = () => {
    const [k, v] = el.dataset.pc.split(":"); $(`lv-${k}-m`).value = (t.stake * Number(v) / 100).toFixed(2); fromMoney(k);
  }));
  body.querySelectorAll("[data-rm]").forEach((el) => (el.onclick = () => { const k = el.dataset.rm; val[k] = null; $(`lv-${k}-p`).value = ""; $(`lv-${k}-m`).value = ""; hintFor(k); }));
  $("lv-ok").onclick = async () => {
    try {
      const { trade } = await api("/api/trade/levels", { trade_id: t.id, tp: val.tp, sl: val.sl });
      Object.assign(t, { tp: trade.tp, sl: trade.sl }); LW.lvKey = ""; syncTpslBtn(); closeSheet(); toast("TP/SL сохранены");
    } catch (e) { toast(e.message); }
  };
}

// ---------------------------------------------------------------- админка
const AD = { tab: "users", sort: "last_seen", q: "", timer: null, busy: false };
const AD_SORTS = [["last_seen", "По заходу"], ["balance", "По балансу"], ["created", "Новые"], ["visits", "По числу заходов"]];
function whoName(u) { return u.username ? "@" + u.username : u.name || String(u.id); }
function ago(ts, now) {
  if (!ts) return "ещё не заходил";
  const d = Math.max(0, (now || Date.now() / 1000) - ts);
  if (d < 60) return "только что";
  if (d < 3600) return Math.floor(d / 60) + " мин назад";
  if (d < 86400) return Math.floor(d / 3600) + " ч назад";
  return fmtDate(ts);
}
function openAdmin() {
  if (!S.isAdmin) return;
  showAnimated($("admin-view"));
  if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(closeAdmin); }
  loadAdmin(); clearInterval(AD.timer); AD.timer = setInterval(() => { if ($("sheet").hidden) loadAdmin(); }, 10000);
}
function closeAdmin() {
  hideAnimated($("admin-view")); clearInterval(AD.timer); AD.timer = null;
  if (tg && tg.BackButton) { tg.BackButton.offClick(closeAdmin); tg.BackButton.hide(); }
}
async function loadAdmin() {
  if (AD.busy) return; AD.busy = true;
  const tabs = $("ad-tabs");
  tabs.innerHTML = [["users", "Пользователи"], ["visits", "Заходы"]].map(([k, l]) => `<button class="chip ${AD.tab === k ? "on" : ""}" data-t="${k}">${l}</button>`).join("");
  tabs.querySelectorAll("[data-t]").forEach((el) => (el.onclick = () => { AD.tab = el.dataset.t; loadAdmin(); }));
  $("ad-tools").hidden = AD.tab !== "users";
  $("ad-sorts").innerHTML = AD_SORTS.map(([k, l]) => `<button class="chip ${AD.sort === k ? "on" : ""}" data-s="${k}">${l}</button>`).join("");
  $("ad-sorts").querySelectorAll("[data-s]").forEach((el) => (el.onclick = () => { AD.sort = el.dataset.s; loadAdmin(); }));
  try {
    if (AD.tab === "users") {
      const d = await api(`/api/admin/users?sort=${AD.sort}&limit=200&q=${encodeURIComponent(AD.q)}`), sm = d.summary;
      $("ad-sum").innerHTML = [[sm.users, "всего"], [sm.online, "онлайн"], [sm.active_24h, "за 24 ч"], [sm.new_24h, "новых 24 ч"]]
        .map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join("");
      $("ad-list").innerHTML = d.users.map((u) => `
        <button class="ad-row" data-u="${u.id}">
          <span class="ad-av ${u.online ? "on" : ""}">${esc((whoName(u).replace("@", "")[0] || "?").toUpperCase())}</span>
          <span class="ad-main"><b>${esc(whoName(u))}${u.banned ? " 🚫" : ""}</b><small>${u.online ? "онлайн" : ago(u.last_seen, d.now)} · заходов ${u.visits}</small></span>
          <span class="ad-right"><b>${money(u.balance)}</b><small>${u.open_trades ? "открыто: " + u.open_trades : "id " + u.id}</small></span>
        </button>`).join("") + `<div class="ad-note">Показано ${d.users.length} из ${d.total} · обновляется само раз в 10 с<br>Сумма балансов: ${money(sm.total_balance)}</div>`;
      $("ad-list").querySelectorAll("[data-u]").forEach((el) => (el.onclick = () => openAdminUser(Number(el.dataset.u))));
      if (!d.users.length) $("ad-list").innerHTML = '<div class="tr-empty">Никого не найдено</div>';
    } else {
      const d = await api("/api/admin/visits?limit=200"), kinds = { app: "открыл приложение", start: "написал /start" };
      $("ad-sum").innerHTML = "";
      $("ad-list").innerHTML = d.visits.map((v) => `
        <button class="ad-row" data-u="${v.user_id}">
          <span class="ad-av">${esc((whoName({ username: v.username, name: v.name, id: v.user_id }).replace("@", "")[0] || "?").toUpperCase())}</span>
          <span class="ad-main"><b>${esc(whoName({ username: v.username, name: v.name, id: v.user_id }))}</b><small>${kinds[v.kind] || esc(v.kind)}</small></span>
          <span class="ad-right"><b>${money(v.balance || 0)}</b><small>${fmtDate(v.ts)}</small></span>
        </button>`).join("") || '<div class="tr-empty">Заходов пока нет</div>';
      $("ad-list").querySelectorAll("[data-u]").forEach((el) => (el.onclick = () => openAdminUser(Number(el.dataset.u))));
    }
  } catch (e) { toast(e.message); }
  finally { AD.busy = false; }
}
async function openAdminUser(id) {
  try {
    const d = await api("/api/admin/user?id=" + id), u = d.user, st = d.stats, kinds = { app: "приложение", start: "/start" };
    openSheet(whoName(u), `
      <div class="kv"><span>Telegram id</span><span>${u.id}</span></div>
      <div class="kv"><span>Баланс</span><b>${money(u.balance)}</b></div>
      <div class="kv"><span>Последний заход</span><span>${ago(u.last_seen, d.now)}</span></div>
      <div class="kv"><span>Первый заход</span><span>${fmtDate(u.created_at)}</span></div>
      <div class="kv"><span>Всего заходов</span><span>${u.visits}</span></div>
      <div class="kv"><span>Сделки</span><span>открыто ${st.open} · закрыто ${st.closed}</span></div>
      <div class="kv"><span>Результат закрытых</span><b class="${st.pnl >= 0 ? "green" : "red"}">${signed(st.pnl)}</b></div>
      <div class="kv"><span>Винрейт</span><span>${st.closed ? Math.round((st.wins / st.closed) * 100) + "%" : "—"}</span></div>
      <div class="set-t">Последние заходы</div>
      ${d.visits.length ? d.visits.slice(0, 15).map((v) => `<div class="kv"><span>${fmtDate(v.ts)}</span><span>${kinds[v.kind] || esc(v.kind)}</span></div>`).join("") : '<div class="hint">Заходов нет</div>'}
      ${u.username ? `<button class="btn-link" id="ad-chat">Написать @${esc(u.username)}</button>` : ""}`);
    if (u.username) $("ad-chat").onclick = () => { const l = "https://t.me/" + u.username; if (tg && tg.openTelegramLink) tg.openTelegramLink(l); else window.open(l, "_blank"); };
  } catch (e) { toast(e.message); }
}

// ---------------------------------------------------------------- старт
// ПК: колесом мыши прокручивать вкладки активов по горизонтали
(() => { const t = $("asset-tabs"); if (t) t.addEventListener("wheel", (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { t.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); })();

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 20000 && S.chartMode === "own" && LW.chart) loadOwnCandles();   // за паузу график устарел
  hiddenAt = 0;
});

function bindAnalyticsRefresh() {
  const b = $("an-refresh"); if (!b) return;
  b.onclick = () => {
    b.classList.add("spin"); setTimeout(() => b.classList.remove("spin"), AKs(900));
    anKey = ""; renderAnalytics(true);
  };
}

// ---------------------------------------------------------------- ссылка из бота (только админ)
// Кнопка под сообщением сканера открывает приложение как /?add=PEPE&ex=bybit,okx&src=yersh[&cmp=1]:
//   add — тикер: если монеты нет, добавляем со спот-бирж (как галочка «Спот»), затем открываем её;
//   ex  — биржи по приоритету: берём первую, где монета есть (иначе остаётся «Авто»);
//   cmp — сразу показать сравнение цен по биржам (для режима «фьючерс+фьючерс»);
//   src — какой сканер прислал (только для подписи).
const DL_SRC = { yersh: "🧹 Ёршик", sf: "⚖️ Спот+Фьючерс", ff: "📡 Ф+Ф" };
async function handleDeepLink() {
  const qs = new URLSearchParams(location.search);
  if ((qs.get("addall") || "").trim()) return handleDeepLinkAll(qs);
  const coin = (qs.get("add") || "").trim().toUpperCase();
  if (!coin) return;
  const qs0 = new URLSearchParams(qs.toString());      // копия параметров: ниже qs чистим от add/ex/cmp/src
  const want = (qs.get("ex") || "").split(",").map((x) => x.trim()).filter(Boolean), cmp = qs.get("cmp") === "1", src = qs.get("src"), dom = qs.get("dom") === "1";
  ["add", "ex", "cmp", "src", "dom"].forEach((k) => qs.delete(k));          // чтобы перезагрузка не повторяла действие
  try { history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "")); } catch (e) {}
  if (!S.isAdmin || !/^[A-Z0-9]{2,12}$/.test(coin)) return;
  const plan = src === "ff" || src === "sf" ? { src, coin, buy: qs0.get("buy"), sell: qs0.get("sell"), bn: qs0.get("bn"), sn: qs0.get("sn"), ex: want[0] || null, fr: qs0.get("fr"), spr: parseFloat(qs0.get("spr")) || null } : null;
  const futOnly = src === "yersh" || src === "ff";    // ёршик и Ф+Ф — только фьючерс: на спот не откатываемся
  const pick = () => (src === "sf" ? spotAssetOf(coin) || futAssetOf(coin) : futOnly ? futAssetOf(coin) : futAssetOf(coin) || spotAssetOf(coin));
  let a = pick();
  // нужные рынки: С+Ф — спот и фьючерс, Ф+Ф и ёршик — только фьючерс (спот в этом случае не трогаем и вкладкой не открываем)
  const legs = () => (src === "sf" ? [spotAssetOf(coin), futAssetOf(coin)] : [futAssetOf(coin)]);
  // нет монеты, нужного рынка ИЛИ нужной биржи — просим сервер найти монету и докинуть эти биржи (want)
  if (!a || legs().some((x) => !x) || (want.length && !want.some((x) => a.exchanges.includes(x)))) {
    toast(a ? "Ищу " + coin + " на нужной бирже…" : "Добавляю " + coin + ": ищу на биржах…");
    try {
      const r = await api("/api/spot/add", { ticker: coin, want });
      for (const x of [r.asset, r.fut]) if (x) { const cur = assetById(x.id); if (cur) cur.exchanges = x.exchanges; else S.assets.push(x); }
      a = pick();
    } catch (e) { if (!a) { toast(coin + ": " + e.message + "\n(возможно, монета есть только на фьючерсах)"); return; } }
  }
  if (!a) { toast(coin + ": фьючерса на нужных биржах не нашёл"); return; }
  if (plan) legs().forEach((x) => { if (x && !S.tabs.includes(x.id)) S.tabs.push(x.id); });   // нужные ножки сразу во вкладках
  closeSheet(); if (S.page !== "trade") showPage("trade");
  selectAsset(a.id);
  const ex = want.find((x) => a.exchanges.includes(x));
  if (ex) pickExchange(ex);
  if (src === "ff" && ex) {                       // быстрая плашка «↩» — вторая биржа пары: купил на одной, одним тапом на другую
    const other = want.find((x) => x !== ex && a.exchanges.includes(x));
    if (other) { S.pex = other; storeCfg(); renderQuote(); }
  }
  const label = (DL_SRC[src] || "Из бота") + ": " + a.name + (ex ? " · " + exName(ex) : "");
  toast(want.length && !ex ? label + "\n" + want.map(exName).join(", ") + ": у монеты этой биржи не нашлось — стоит «Авто»" : label);
  if (plan && S.arbHints !== false) arbTipOpen(plan);
  // сигнал из бота (dom=1): сразу стакан этой монеты на выбранной бирже; подсказка арбитража (z-index выше) остаётся поверх него
  if (dom && a.cat === "crypto" && typeof openDom === "function") openDom();
  else if (cmp && a.exchanges.length > 1) setTimeout(openExchanges, AKs(300));
}

// Кнопка «Открыть все монеты» под сообщением ёршиков: /?addall=STRK:htx.bybit,PEPE:okx&src=yersh
// Все прежние вкладки (любая валюта) закрываются, остаются только эти монеты и только фьючерс — без спота.
async function handleDeepLinkAll(qs) {
  const raw = (qs.get("addall") || "").trim();
  ["addall", "src", "dom"].forEach((k) => qs.delete(k));
  try { history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "")); } catch (e) {}
  if (!S.isAdmin) return;
  const items = raw.split(",").map((part) => {
    const [c, e = ""] = part.split(":");
    return { coin: (c || "").trim().toUpperCase(), want: e.split(".").map((x) => x.trim()).filter(Boolean) };
  }).filter((it) => /^[A-Z0-9]{2,12}$/.test(it.coin)).slice(0, 12);
  if (!items.length) return;
  toast("Открываю " + items.length + " монет…");
  const ready = [];
  for (const it of items) {
    let a = futAssetOf(it.coin);
    if (!a || (it.want.length && !it.want.some((x) => a.exchanges.includes(x)))) {
      try {
        const r = await api("/api/spot/add", { ticker: it.coin, want: it.want });
        for (const x of [r.asset, r.fut]) if (x) { const cur = assetById(x.id); if (cur) cur.exchanges = x.exchanges; else S.assets.push(x); }
        a = futAssetOf(it.coin);
      } catch (e) {}
    }
    if (a && !ready.some((r) => r.a.id === a.id)) ready.push({ a, ex: it.want.find((x) => a.exchanges.includes(x)) || null });
  }
  if (!ready.length) { toast("Ни одной из этих монет нет на фьючерсах"); return; }
  closeSheet(); if (S.page !== "trade") showPage("trade");
  S.tabs = [];                                                  // закрываем все прежние вкладки, любая валюта
  ready.forEach(({ a, ex }) => { selectAsset(a.id); pickExchange(ex); });
  selectAsset(ready[0].a.id);
  toast("🧹 Открыто монет: " + ready.length + (ready.length < items.length ? " из " + items.length + " (остальных нет на фьючерсах)" : ""));
}

// ---------------------------------------------------------------- подсказка арбитража (где купить / где продать)
// Сигнал Ф+Ф: купить («Вверх») фьючерс на дешёвой бирже и продать («Вниз») на дорогой.
// Сигнал Ф+С: на одной бирже купить спот («Вверх») и продать («Вниз») фьючерс — доход funding. Включается в Настройках.
const futAssetOf = (c) => { const x = assetById(c + "USD") || assetById(c + "PERP"); return x && x.market === "fut" ? x : assetById(c + "PERP") || null; };
const spotAssetOf = (c) => assetById(c + "SPOT") || (() => { const x = assetById(c + "USD"); return x && x.market === "spot" ? x : null; })();
const ARB = { plan: null };
function arbSteps(p) {
  const nm = (id, n) => (id ? exName(id) : n || "Авто");
  if (p.src === "ff") return [
    { n: 1, kind: "fut", dir: "up", ex: p.buy || null, name: nm(p.buy, p.bn), verb: "Купить", note: "дешевле" },
    { n: 2, kind: "fut", dir: "down", ex: p.sell || null, name: nm(p.sell, p.sn), verb: "Продать", note: "дороже" }];
  return [
    { n: 1, kind: "spot", dir: "up", ex: p.ex, name: nm(p.ex, p.bn), verb: "Купить", note: "лонг" },
    { n: 2, kind: "fut", dir: "down", ex: p.ex, name: nm(p.ex, p.bn), verb: "Продать", note: "шорт" }];
}
function arbTipOpen(p) { ARB.plan = p; ARB.min = false; arbTipRender(true); }
function arbTipClose() { ARB.plan = null; const el = $("arb-tip"); if (el) el.remove(); }
function arbTipRender(force) {
  const p = ARB.plan; let el = $("arb-tip");
  if (!p || S.arbHints === false || !S.isAdmin) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "arb-tip"; el.className = "arb-tip"; document.body.appendChild(el); force = true; }
  const steps = arbSteps(p), done = (st, as) => as && S.trades.some((t) => t.asset === as.id && t.direction === st.dir && (!st.ex || (t.exchange || t.via) === st.ex));
  const rows = steps.map((st) => {
    const as = st.kind === "spot" ? spotAssetOf(p.coin) : futAssetOf(p.coin), here = as && S.asset === as.id && (S.ex || null) === (st.ex || null);
    const dn = done(st, as), arrow = st.dir === "up" ? "↗ Вверх" : "↘ Вниз", kind = st.kind === "spot" ? "спот" : "фьючерс";
    return `<button class="arb-step ${here ? "here" : ""} ${dn ? "done" : ""}" data-st="${st.n}" ${as ? "" : "disabled"}>
      <span class="arb-n">${dn ? "✓" : st.n}</span>
      <span class="arb-t"><b>${st.verb}</b> · ${kind} ${esc(p.coin)} на <b>${esc(st.name)}</b> <small>(${st.note})</small><br><span class="${st.dir === "up" ? "green" : "red"}">жми «${arrow}»</span>${as ? "" : " — этого рынка нет в приложении"}</span></button>`;
  }).join("");
  const title = p.src === "ff" ? "📡 Фьючерс + Фьючерс" : "⚖️ Спот + Фьючерс";
  const foot = p.src === "sf" ? `<div class="arb-f">Доход — funding${p.fr ? " " + (Number(p.fr) >= 0 ? "+" : "") + p.fr + "% / 8 ч" : ""}: шорт получает его, пока ставка положительная. Открой обе ноги на одной бирже. Стоп-лосс ставится сам (на ${(0.8 * 100 / S.leverage).toFixed(2)}% от входа, до ликвидации не дойдёт), тейк-профита нет — доход идёт по времени.</div>`
    : `<div class="arb-f">Заработок — на сходимости цен. TP/SL ставятся сами: ${p.spr ? `TP ≈ +${(p.spr / 2).toFixed(2)}% цены, SL ≈ ${p.spr.toFixed(2)}%` : "по спреду"}. Закрой обе позиции вместе.</div>`;
  const h = `<div class="arb-h"><b>${title} · ${esc(p.coin)}</b><button class="arb-x" data-a="min">${ARB.min ? "⌄" : "⌃"}</button><button class="arb-x" data-a="close">✕</button></div>${ARB.min ? "" : rows + foot}`;
  if (el._h !== h) {
    el._h = h; el.innerHTML = h;
    el.querySelector('[data-a="close"]').onclick = arbTipClose;
    el.querySelector('[data-a="min"]').onclick = () => { ARB.min = !ARB.min; arbTipRender(); };
    el.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => {
      const st = steps[Number(b.dataset.st) - 1], as = st.kind === "spot" ? spotAssetOf(p.coin) : futAssetOf(p.coin);
      if (!as) return;
      if (S.asset !== as.id) selectAsset(as.id);
      const ex = st.ex && as.exchanges.includes(st.ex) ? st.ex : null;
      pickExchange(ex);
      if (typeof domRetarget === "function") domRetarget();        // стакан открыт — переключаем и его на этот рынок/биржу
      if (st.ex && !ex) toast(exName(st.ex) + " нет для " + as.name + " — стоит «Авто»");
    }));
  }
}

// ---------------------------------------------------------------- подсказки «?»
// Маленькие «?» рядом с кнопками: нажал — появилось короткое объяснение. Включаются/выключаются галочкой в Настройках
// (хранится в ui.hints). Значки рисуются отдельным слоем поверх страницы и привязываются к элементам по селектору —
// поэтому не ломаются, когда приложение перерисовывает кнопки.
// pos: tr — правый верхний угол элемента (по умолчанию), tl — левый верхний, rc — справа по центру (dx — отступ от края).
const HINTS = [
  { sel: ".balance", pos: "tl", text: "Твой демо-баланс. Нажми на сумму — выберешь валюту отображения. Кнопка «+» пополняет счёт." },
  { sel: "#btn-open-trades", text: "Сделки: открытые позиции и история. Значок показывает, сколько позиций открыто." },
  { sel: "#asset-tabs .tab.add", text: "Добавить актив во вкладки: форекс, металлы, крипто. Переключатель «Спот» в поиске добавит любую монету по тикеру. ✕ на вкладке убирает её." },
  { sel: "#btn-indicators", text: "Индикаторы на графике (скользящие средние, RSI и другие) помогают оценить, куда может пойти цена." },
  { sel: "#btn-alerts", text: IN_TG ? "Уведомление: бот напишет в Telegram, когда цена дойдёт до выбранного уровня." : "Уведомление: приложение покажет сообщение, когда цена дойдёт до выбранного уровня (пока оно открыто)." },
  { sel: "#btn-tpsl", text: "Тейк-профит закроет сделку в плюсе, стоп-лосс — в минусе, когда цена дойдёт до заданного уровня." },
  { sel: "#btn-tf", text: "Таймфрейм — сколько времени занимает одна свеча на графике (1 минута, 5 минут, час и т. д.)." },
  { sel: ".stake-row", pos: "tl", text: "Ставка — сколько $ ты вкладываешь в сделку. Меняй кнопками − / + или впиши сумму вручную." },
  { sel: "#lev-btn", text: "Плечо увеличивает и прибыль, и убыток. Если убыток дойдёт до размера ставки, позиция закроется автоматически." },
  { sel: "#btn-down", pos: "tl", text: "«Вниз» — открыть сделку на падение цены: заработаешь, если цена снизится." },
  { sel: "#btn-up", text: "«Вверх» — открыть сделку на рост цены: заработаешь, если цена вырастет." },
  { sel: "#btn-stop", text: "СТОП закрывает открытую позицию по этому активу по текущей цене." },
  { sel: "#btn-stats", pos: "rc", dx: 22, text: "Статистика по валютным парам: на чём ты зарабатываешь и теряешь." },
  { sel: "#m-admin", pos: "rc", dx: 40, text: "Панель администратора: игроки, балансы, заходы." },
  { sel: "#m-history", pos: "rc", dx: 40, text: "История: все твои сделки — открытые и закрытые." },
  { sel: "#m-settings", pos: "rc", dx: 40, text: "Настройки: тип графика, тема оформления, валюта баланса и подсказки «?»." },
  { sel: "#m-feedback", pos: "rc", dx: 40, text: "Написать автору приложения в Telegram: идеи, ошибки, вопросы." },
  { sel: "#an-refresh", text: "Обновить виджеты аналитики и календаря событий." },
];
const hintsEl = { layer: null, pop: null, nodes: [], open: -1 };
const hintsOn = () => S.hints !== false;

function hintHide() { if (hintsEl.pop) hintsEl.pop.hidden = true; hintsEl.open = -1; }

function hintShow(i) {
  const pop = hintsEl.pop, node = hintsEl.nodes[i], h = HINTS[i];
  if (hintsEl.open === i && !pop.hidden) return hintHide();            // повторное нажатие закрывает
  pop.innerHTML = `<div class="hp-text">${esc(h.text)}</div><button type="button" class="hp-off">Отключить подсказки</button>`;
  pop.querySelector(".hp-off").onclick = () => { setHints(false); toast("Подсказки выключены. Включить: Профиль → Настройки"); };
  pop.hidden = false; hintsEl.open = i;
  const q = node.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  pop.style.maxWidth = Math.min(300, vw - 24) + "px";
  const tw = pop.offsetWidth, th = pop.offsetHeight, cx = q.left + q.width / 2;
  pop.style.left = Math.round(Math.min(Math.max(cx - tw / 2, 12), vw - tw - 12)) + "px";
  const below = vh - q.bottom, top = below >= th + 16 || q.top < th + 16 ? q.bottom + 6 : q.top - th - 6;
  pop.style.top = Math.round(Math.min(Math.max(top, 8), vh - th - 8)) + "px";
}

function hintsBuild() {
  if (hintsEl.layer) return;
  const layer = document.createElement("div"); layer.id = "hints"; layer.hidden = true;
  HINTS.forEach((h, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "qm"; b.hidden = true; b.setAttribute("aria-label", "Подсказка"); b.innerHTML = "<i>?</i>";
    b.onclick = (e) => { e.stopPropagation(); e.preventDefault(); hintShow(i); };
    layer.appendChild(b); hintsEl.nodes.push(b);
  });
  const pop = document.createElement("div"); pop.id = "hint-pop"; pop.hidden = true;
  document.body.appendChild(layer); document.body.appendChild(pop);
  hintsEl.layer = layer; hintsEl.pop = pop;
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest(".qm"))) hintHide();
  }, true);
  let raf = 0;
  const sched = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; hintsSync(); }); };
  window.addEventListener("resize", sched); document.addEventListener("scroll", sched, true);
  setInterval(() => { if (!document.hidden && !slideRun) hintsSync(); }, 400);
}

function hintsSync() {
  if (!hintsEl.layer) return;
  const on = hintsOn();
  hintsEl.layer.hidden = !on;
  if (!on) return hintHide();
  const vw = window.innerWidth, vh = window.innerHeight;
  HINTS.forEach((h, i) => {
    const node = hintsEl.nodes[i], el = document.querySelector(h.sel), q = el && el.getBoundingClientRect();
    if (!q || q.width < 2 || q.height < 2 || q.bottom < 0 || q.top > vh || q.right < 0 || q.left > vw) { node.hidden = true; if (hintsEl.open === i) hintHide(); return; }
    let x, y;
    if (h.pos === "tl") { x = q.left + 4; y = q.top + 2; }
    else if (h.pos === "rc") { x = q.right - (h.dx || 30); y = (q.top + q.bottom) / 2; }
    else { x = q.right - 4; y = q.top + 2; }
    node.hidden = false;
    node.style.transform = `translate(${Math.round(Math.min(Math.max(x, 12), vw - 12) - 11)}px,${Math.round(Math.max(y, 12) - 11)}px)`;
  });
}

function setHints(on) {
  S.hints = !!on;
  try { localStorage.setItem("hints", S.hints ? "1" : "0"); } catch (e) {}   // сразу на устройство: не ждём отложенного сохранения
  document.documentElement.classList.toggle("no-hints", !S.hints);
  saveUi(); hintsSync();
}

// ---------------------------------------------------------------- обучение по навигации (тур по приложению)
// Показывается один раз каждому игроку (флаг tour_done хранится на сервере в его настройках ui — поэтому не повторяется
// ни при новом /start, ни при смене адреса туннеля). Заново — вкладка «Обучение» → «Пройти обучение по навигации».
// Кнопка «Пропустить» справа вверху завершает тур и тоже запоминается.
const TOUR = [
  { title: "Добро пожаловать! 👋", text: "Короткое обучение по навигации: покажу, где что находится. Это займёт около минуты. Пропустить можно в любой момент — кнопка справа вверху." },
  { sel: ".balance, #btn-topup", pad: 10, title: "Баланс", text: "Твой демо-баланс. Нажми на сумму — выберешь валюту отображения. Кнопка «+» пополняет счёт." },
  { sel: "#btn-open-trades", pad: 6, title: "Сделки", text: "💼 — все твои сделки: открытые позиции и история. Красный значок показывает, сколько позиций сейчас открыто." },
  { sel: "#asset-tabs", pad: 4, title: "Вкладки активов", text: "Здесь пары и монеты, с которыми ты работаешь. «+» — добавить новую (форекс, металлы, крипто; переключатель «Спот» добавит любую монету по тикеру). ✕ на вкладке — убрать её." },
  { sel: ".quote", pad: 6, title: "Цена и биржа", text: "Текущая цена и изменение за сутки. Справа можно выбрать биржу, по цене которой считаются твои сделки (по умолчанию «Авто»)." },
  { sel: ".chart-tools", pad: 6, title: "Инструменты графика", text: "〰️ индикаторы · 🔔 уведомление, когда цена дойдёт до нужного уровня · TP/SL — тейк-профит и стоп-лосс · кнопка с таймфреймом (например «5 м») меняет масштаб свечей." },
  { sel: ".stake-row", pad: 6, title: "Ставка и плечо", text: "Задай сумму ставки кнопками − / + или впиши вручную. Справа — плечо (×100): чем оно выше, тем больше и возможная прибыль, и риск." },
  { sel: "#dir-row:not([hidden]), #pos-row:not([hidden])", pad: 6, title: "Вверх / Вниз", text: "Думаешь, цена вырастет — жми «Вверх», упадёт — «Вниз». Когда сделка открыта, тут появятся прибыль и кнопка «СТОП», она закрывает позицию." },
  { sel: ".nav", pad: 6, title: "Нижнее меню", text: "📊 Торговля — график и сделки\n🎓 Обучение — уроки и это обучение заново\n📈 Аналитика — технический анализ и календарь событий\n👤 Профиль — баланс, статистика, история и настройки" },
  { title: "Готово! 🎉", text: "Теперь ты знаешь, где что находится. Захочешь повторить — открой вкладку «Обучение» и нажми «Пройти обучение по навигации»." },
];
const tourState = { on: false, i: 0, steps: [] };

function tourRect(sel) {
  if (!sel) return null;
  let l = 1e9, t = 1e9, r = -1e9, b = -1e9, n = 0;
  document.querySelectorAll(sel).forEach((el) => {
    const q = el.getBoundingClientRect();
    if (q.width < 2 || q.height < 2) return;                      // скрытый элемент
    l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); n++;
  });
  return n ? { l, t, r, b } : null;
}

function tourBuild() {
  if (!$("tour")) {
    const d = document.createElement("div");
    d.id = "tour"; d.hidden = true;
    d.innerHTML = '<div id="tour-hole"></div><button id="tour-skip" type="button">Пропустить</button>' +
      '<div id="tour-tip"><div class="tt-title" id="tt-title"></div><div class="tt-text" id="tt-text"></div>' +
      '<div class="tt-foot"><span class="tt-step" id="tt-step"></span><span class="tt-btns">' +
      '<button type="button" id="tt-back">Назад</button><button type="button" id="tt-next" class="primary">Далее</button></span></div></div>';
    document.body.appendChild(d);
    $("tour-skip").onclick = () => tourEnd();
    $("tt-back").onclick = () => tourGo(tourState.i - 1);
    $("tt-next").onclick = () => (tourState.i >= tourState.steps.length - 1 ? tourEnd() : tourGo(tourState.i + 1));
    window.addEventListener("resize", () => { if (tourState.on) tourRender(); });
    window.addEventListener("orientationchange", () => setTimeout(() => { if (tourState.on) tourRender(); }, 250));
  }
}

function tourRender() {
  const st = tourState.steps[tourState.i], hole = $("tour-hole"), tip = $("tour-tip"), root = $("tour");
  const last = tourState.i >= tourState.steps.length - 1;
  if (animOn()) replay($("tour-tip"), "swap");
  $("tt-title").textContent = st.title;
  $("tt-text").textContent = st.text;
  $("tt-step").textContent = (tourState.i + 1) + " / " + tourState.steps.length;
  $("tt-back").style.visibility = tourState.i ? "visible" : "hidden";
  $("tt-next").textContent = tourState.i === 0 ? "Поехали" : last ? "Готово" : "Далее";
  $("tour-skip").hidden = last;
  const rect = tourRect(st.sel), pad = st.pad || 6, vw = window.innerWidth, vh = window.innerHeight;
  root.classList.toggle("center", !rect);
  tip.style.maxWidth = Math.min(360, vw - 24) + "px";
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left, top;
  if (!rect) {
    hole.style.cssText = "";
    left = (vw - tw) / 2; top = (vh - th) / 2;
  } else {
    hole.style.left = rect.l - pad + "px"; hole.style.top = rect.t - pad + "px";
    hole.style.width = rect.r - rect.l + pad * 2 + "px"; hole.style.height = rect.b - rect.t + pad * 2 + "px";
    const below = vh - rect.b - pad, above = rect.t - pad, cx = (rect.l + rect.r) / 2;
    left = Math.min(Math.max(cx - tw / 2, 12), vw - tw - 12);
    if (rect.b - rect.t > vh * 0.6 && rect.r + pad + tw + 24 < vw) {               // высокая узкая панель слева (широкий экран)
      left = rect.r + pad + 12; top = Math.min(Math.max((rect.t + rect.b) / 2 - th / 2, 12), vh - th - 12);
    } else if (below >= th + 16) top = rect.b + pad + 12;
    else if (above >= th + 16) top = rect.t - pad - th - 12;
    else top = below > above ? vh - th - 12 : 12;                                    // места нет — прижимаем к краю
  }
  tip.style.left = Math.round(left) + "px"; tip.style.top = Math.round(top) + "px";
}

function tourGo(i) {
  if (i < 0 || i >= tourState.steps.length) return;
  tourState.i = i; tourRender();
}

function tourDoneSave() {
  S.ui = S.ui || {}; S.ui.tour_done = 1;
  try { localStorage.setItem("tour_done", "1"); } catch (e) {}
  api("/api/ui", { tour_done: 1 }).catch(() => {});
}

function tourEnd() {
  tourState.on = false;
  const root = $("tour"); if (root) root.hidden = true;
  tourDoneSave();
}

function startTour() {
  tourBuild();
  closeSheet && closeSheet();
  if (S.page !== "trade") showPage("trade");
  setTimeout(() => {                                            // даём странице отрисоваться, чтобы замерить элементы
    tourState.steps = TOUR.filter((s) => !s.sel || tourRect(s.sel));
    if (!tourState.steps.length) return;
    tourState.on = true; tourState.i = 0;
    $("tour").hidden = false; tourRender();
  }, 250);
}

function maybeStartTour() {
  let seen = false;
  try { seen = localStorage.getItem("tour_done") === "1"; } catch (e) {}
  if ((S.ui && S.ui.tour_done) || seen) return;
  if (/[?&]add=/.test(location.search)) return;                 // пришли по ссылке «добавить монету» — не мешаем
  const sheet = $("sheet"); if (sheet && !sheet.hidden) return;
  setTimeout(startTour, 700);
}

async function main() {
  let init;
  for (;;) {
    try { init = await api("/api/init"); break; }
    catch (e) { if (!e.net) break; netBanner(true); await new Promise((r) => setTimeout(r, 3000)); }
  }
  netBanner(false);
  if (!init) { try { init = await api("/api/init"); } catch (e) { document.body.innerHTML = `<p style="padding:24px;text-align:center">Не удалось войти: ${esc(e.message)}<br><br>Открой приложение из Telegram-бота.</p>`; return; } }
  S.assets = init.assets; S.cfg = init.config; S.exNames = init.exchanges || {}; S.ui = init.ui; S.balance = init.user.balance;
  S.tabs = (S.ui.tabs || S.cfg.default_tabs).filter(assetById);
  if (!S.tabs.length) S.tabs = [S.assets[0].id];
  S.asset = assetById(S.ui.asset) ? S.ui.asset : S.tabs[0];
  if (!S.tabs.includes(S.asset)) S.tabs.push(S.asset);
  S.favorites = S.ui.favorites || [];
  { const pl = S.ui.pre_levels || {}, ok = (v, max) => (typeof v === "number" && isFinite(v) && v > 0 && v < max ? v : null);
    S.pre = { tp: ok(pl.tp, 1e6), sl: ok(pl.sl, 100), on: pl.on !== false }; }
  S.isAdmin = !!(init.user && init.user.is_admin);
  S.currency = (S.ui.currency || "USD").toUpperCase();
  S.arbHints = S.ui.arb_hints !== false;                // подсказки арбитража (где купить/продать) — только админам, по умолчанию включены
  S.hints = S.ui.hints !== false;                       // подсказки «?» включены по умолчанию
  try { const h = localStorage.getItem("hints"); if (h === "0" || h === "1") S.hints = h === "1"; } catch (e) {}   // то, что человек выбрал на этом устройстве, главнее
  document.documentElement.classList.toggle("no-hints", !S.hints);
  let savedHaptic = null;
  try { const value = localStorage.getItem("haptic"); if (value === "0" || value === "1") savedHaptic = value === "1"; } catch (e) {}
  if (LOCAL_DEMO && savedHaptic !== null) S.haptic = savedHaptic;
  else if (S.ui.haptic !== undefined) S.haptic = S.ui.haptic !== false;
  else S.haptic = savedHaptic !== null ? savedHaptic : true;
  try { localStorage.setItem("haptic", S.haptic ? "1" : "0"); } catch (e) {}
  S.anim = S.ui.anim !== false;                         // плавные анимации включены по умолчанию
  document.documentElement.classList.toggle("no-anim", !S.anim);
  S.chartCfg = (S.ui.chart_cfg && typeof S.ui.chart_cfg === "object") ? S.ui.chart_cfg : {};
  if (!S.ui.chart_cfg && (S.ui.tf || S.ui.indicators)) S.chartCfg[S.asset] = { tf: S.ui.tf, indicators: S.ui.indicators };   // миграция старых настроек: только текущей монете
  loadCfg();
  S.chartMode = S.ui.chart_mode === "tv" ? "tv" : "own";
  { const tc = S.ui.theme_custom; if (tc && HEX6.test(tc.bg) && HEX6.test(tc.btn)) { S.custom = { bg: tc.bg, btn: tc.btn }; try { localStorage.setItem("themeCustom", JSON.stringify(S.custom)); } catch (e) {} } }
  if (THEMES[S.ui.theme] && (S.ui.theme !== S.theme || S.ui.theme === "custom")) applyTheme(S.ui.theme);
  S.leverage = Math.min(Math.max(Math.round(Number(S.ui.leverage)) || S.cfg.multiplier || 100, 1), S.cfg.max_leverage || 500); $("lev-btn").textContent = "×" + S.leverage;
  bindStakeDrum(); setStake(Number(S.ui.stake) || S.cfg.default_stake);

  $("lessons").innerHTML = LESSONS.map(([t, d]) => `<div class="item"><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div>`).join("");
  document.querySelectorAll(".nav button").forEach((b) => (b.onclick = () => showPage(b.dataset.page)));
  $("btn-up").onclick = () => openTrade("up"); $("btn-down").onclick = () => openTrade("down");
  $("btn-stop").onclick = stopTrades; $("lev-btn").onclick = openLeverage; $("ex-pill").onclick = (e) => { dropRipple($("ex-pill"), e); openExchanges(); };
  $("ex-prev").onclick = (e) => { dropRipple($("ex-prev"), e); if (S.pex) pickExchange(S.pex === "auto" ? null : S.pex); };
  bindStep("stake-minus", -1); bindStep("stake-plus", 1);
  $("stake").onchange = (e) => { const v = parseFloat(e.target.value.replace(",", ".")); setStake(isNaN(v) ? S.stake : v); };
  $("btn-alerts").onclick = openAlerts; $("btn-undo-trend").onclick = undoTrend;
  $("btn-trend").onclick = () => { if (LW.place) stopPlace(); else startPlace(); };
  $("balance").onclick = openCurrency; $("p-balance").onclick = openCurrency;
  $("btn-indicators").onclick = openIndicators; $("btn-tf").onclick = openTfPicker;
    $("btn-topup").onclick = topup; $("btn-topup2").onclick = topup;
  $("btn-open-trades").onclick = openTrades; $("tr-back").onclick = closeTrades;
  $("btn-stats").onclick = openStats; $("m-history").onclick = openTrades;
  $("m-settings").onclick = openSettings; $("m-feedback").onclick = openFeedback;
  $("btn-tpsl").onclick = openTpsl;
  $("m-admin").hidden = !S.isAdmin; $("m-admin").onclick = openAdmin;
  if (typeof domInit === "function") domInit();             // стакан и заявки (у всех)
  $("ad-back").onclick = closeAdmin; $("ad-refresh").onclick = loadAdmin;
  { let t; $("ad-q").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { AD.q = e.target.value.trim(); loadAdmin(); }, 300); }; }

  renderAll(); tick(); loadRates(); bindAnalyticsRefresh();
  setInterval(() => { if (!document.hidden) tick(); }, 250);   // не грузим туннель, пока приложение свёрнуто
  setInterval(loadRates, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  handleDeepLink();
  $("btn-tour").onclick = startTour;
  hintsBuild(); hintsSync();
  maybeStartTour();
}
main();

// Аналитика: подгружаем виджеты TradingView заранее в фоне, чтобы вкладка открывалась мгновенно
const anPre = setInterval(() => {
  if (S.assets && S.assets.length) { clearInterval(anPre); setTimeout(() => { try { renderAnalytics(); } catch (e) {} }, 1500); }
}, 500);


// ---------------------------------------------------------------- нижняя навигация: стеклянный ползунок
// Скользит к выбранной вкладке; его можно взять пальцем и перетащить — при отпускании встанет на ближайшую.
(function navGlass() {
  const nav = document.querySelector(".nav"), g = nav && nav.querySelector(".nav-glass");
  if (!nav || !g) return;
  const btns = [...nav.querySelectorAll("button")];
  const on = () => getComputedStyle(g).display !== "none";            // в боковой панели ползунка нет
  const cur = () => btns.find((b) => b.classList.contains("active")) || btns[0];
  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
  // слои эффекта: шлейф и «эхо» под стеклом, вспышка и искры поверх
  const mk = (cls, before) => { const el = document.createElement("i"); el.className = "nav-fx " + cls; el.setAttribute("aria-hidden", "true"); before ? nav.insertBefore(el, g) : nav.appendChild(el); return el; };
  const trail = mk("nav-trail", true), ghosts = [mk("nav-ghost", true), mk("nav-ghost", true), mk("nav-ghost", true)];
  const flare = mk("nav-flare"), cv = document.createElement("canvas");
  cv.className = "nav-fx nav-sparks"; nav.appendChild(cv);
  const ctx = cv.getContext("2d"), PAD = 24;
  const sizeCv = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = nav.clientWidth + PAD * 2, h = nav.clientHeight + PAD * 2;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + "px"; cv.style.height = h + "px"; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  // состояние: x/w — позиция и ширина ползунка, v — скорость (px/с), sf — «скоростной» коэффициент 0…1 (растяжение, свечение, шлейф)
  const FLARE_CHANCE = 0.01;                                           // звёздочка-вспышка при посадке: в среднем 1 раз из 100 (0 — никогда, 1 — всегда)
  const st = { x: 0, w: 0, tx: 0, tw: 0, v: 0, sf: 0, dir: 1, travel: 1, drag: false, press: 0, hist: [], parts: [], run: false, last: 0, hi: false, lastPut: 0 };
  const sampleAt = (t) => { let r = st.hist[0]; for (const h of st.hist) { if (h.t <= t) r = h; else break; } return r; };
  function fire(left, w) {                                             // вспышка-звёздочка на «носу» ползунка при посадке
    if (!flare.animate) return;
    flare.style.left = ((st.travel > 0 ? left + w - 6 : left + 6) - 14) + "px";
    flare.animate([{ opacity: 0, transform: "scale(.2) rotate(0deg)" }, { opacity: 1, transform: "scale(1.1) rotate(45deg)", offset: 0.35 }, { opacity: 0, transform: "scale(.5) rotate(90deg)" }], { duration: Math.round(560 * AK), easing: "ease-out" });
  }
  function render(now, dt) {
    const stretch = st.sf * 0.5, w = st.w * (1 + stretch);
    const left = clamp(st.dir > 0 ? st.x - st.w * stretch : st.x, -6, Math.max(nav.clientWidth - w + 6, 0));
    g.style.width = w + "px";
    g.style.transform = `translate3d(${left.toFixed(2)}px,0,0) scale(${(1 + 0.07 * st.press).toFixed(3)})`;
    g.style.setProperty("--gl", st.sf.toFixed(3)); g.style.setProperty("--bl", (st.sf * 3).toFixed(2));
    // «эхо»: полупрозрачные копии ползунка там, где он был 55/110/165 мс назад
    st.hist.push({ t: now, l: left, w }); while (st.hist.length > 2 && now - st.hist[0].t > 320) st.hist.shift();
    ghosts.forEach((el, i) => {
      const h = sampleAt(now - 55 * (i + 1));
      el.style.width = h.w + "px"; el.style.transform = `translate3d(${h.l.toFixed(2)}px,0,0)`; el.style.opacity = (st.sf * (0.65 - i * 0.2)).toFixed(3);
    });
    // шлейф с «полосками скорости» позади
    const len = 24 + 150 * st.sf;
    trail.classList.toggle("l", st.dir < 0);
    const tl = st.dir > 0 ? Math.max(left - len, 6) : left + w, tw = st.dir > 0 ? left - tl : Math.min(len, nav.clientWidth - 6 - tl);   // шлейф не вылезает за капсулу
    trail.style.width = Math.max(tw, 0) + "px"; trail.style.left = tl.toFixed(1) + "px"; trail.style.opacity = Math.min(st.sf * 1.1, 1).toFixed(3);
    // искры
    const H = nav.clientHeight;
    if (st.sf > 0.12 && dt) {
      let n = st.sf * 70 * dt; while (n > 0) { if (Math.random() < n) {
        const fx = st.dir > 0 ? left + Math.random() * w * 0.45 : left + w - Math.random() * w * 0.45;
        st.parts.push({ x: fx, y: H * (0.18 + 0.64 * Math.random()), vx: -st.dir * (10 + 40 * Math.random()), vy: (Math.random() - 0.5) * 24, life: 0.45 + 0.55 * Math.random(), t: 0, r: 0.6 + 1.5 * Math.random() });
      } n -= 1; }
    }
    ctx.clearRect(0, 0, cv.width, cv.height); ctx.globalCompositeOperation = "lighter";
    for (let i = st.parts.length - 1; i >= 0; i--) {
      const p = st.parts[i]; p.t += dt / p.life; if (p.t >= 1) { st.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.fillStyle = `rgba(${FX_RGB},${((1 - p.t) * 0.9).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x + PAD, p.y + PAD, p.r * (1 - p.t * 0.5), 0, 6.2832); ctx.fill();
    }
  }
  function loop(now) {
    const dt = Math.min((now - st.last) / 1000 || 0.016, 0.034); st.last = now;
    if (!st.drag) {                                                    // пружина к целевой вкладке (--ak > 1 замедляет)
      const K = 320 / (AK * AK), C = 25 / AK, a = K * (st.tx - st.x) - C * st.v;
      st.v += a * dt; st.x += st.v * dt; st.w += (st.tw - st.w) * Math.min(1, dt * 18);
    } else if (now - st.lastPut > 50) st.v *= Math.pow(0.001, dt);     // палец замер — скорость гаснет
    if (Math.abs(st.v) > 30) st.dir = st.v > 0 ? 1 : -1;
    st.sf += (clamp(Math.abs(st.v) * AK / 700, 0, 1) - st.sf) * Math.min(1, dt * 16);
    st.press += ((nav.classList.contains("pressed") ? 1 : 0) - st.press) * Math.min(1, dt * 16);
    if (st.sf > 0.55) st.hi = true;
    render(now, dt);
    if (st.hi && st.sf < 0.3 && !st.drag) { st.hi = false; const h = st.hist[st.hist.length - 1]; if (Math.random() < FLARE_CHANCE) fire(h.l, h.w); }
    const idle = !st.drag && Math.abs(st.tx - st.x) < 0.2 && Math.abs(st.v) < 3 && st.sf < 0.01 && !st.parts.length && st.press < 0.01;
    if (idle) { st.x = st.tx; st.v = 0; st.sf = 0; st.press = 0; st.run = false; render(now, 0); return; }
    requestAnimationFrame(loop);
  }
  const kick = () => { if (!st.run) { st.run = true; st.last = performance.now(); requestAnimationFrame(loop); } };
  const snap = () => { st.x = st.tx; st.w = st.tw; st.v = 0; st.sf = 0; st.hist = []; st.parts = []; render(performance.now(), 0); sizeCv(); };

  window.navGlassSync = (animate) => {
    if (!on()) return;
    const b = cur(); if (!b.offsetWidth) return;
    st.tx = b.offsetLeft; st.tw = b.offsetWidth; st.travel = Math.sign(st.tx - st.x) || st.travel; st.drag = false;
    if (!animate || !animOn() || !st.w) snap(); else kick();
  };
  const put = (x, w) => {                                              // перетаскивание пальцем: ползунок идёт за пальцем, скорость считаем сами
    const now = performance.now(), inst = (x - st.x) / Math.max((now - st.lastPut) / 1000, 0.008);
    st.v = st.v * 0.6 + inst * 0.4; st.x = x; st.w = st.tw = w; st.drag = true; st.lastPut = now; kick();
  };
  let d = null, justDragged = false;
  nav.addEventListener("pointerdown", (e) => {
    if (!on() || e.button > 0) return;
    const b = cur(), r = b.getBoundingClientRect();
    const onGlass = e.clientX >= r.left && e.clientX <= r.right;     // схватили ползунок (активную вкладку)
    d = { id: e.pointerId, x0: e.clientX, gx0: b.offsetLeft, moved: false, onGlass };
    nav.classList.add("pressed"); kick();
  });
  nav.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    if (!d.moved) {
      if (!d.onGlass || Math.abs(dx) < 6) return;
      d.moved = true; nav.classList.add("drag");
      try { nav.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const lo = btns[0].offsetLeft, hi = btns[btns.length - 1].offsetLeft;
    put(Math.min(hi, Math.max(lo, d.gx0 + dx)), cur().offsetWidth);
  });
  const end = (e) => {
    if (!d || (e && e.pointerId !== d.id)) return;
    const was = d; d = null; nav.classList.remove("pressed", "drag");
    if (!was.moved) return;
    justDragged = true; setTimeout(() => { justDragged = false; }, 60);
    let best = btns[0], bd = 1e9;
    btns.forEach((b) => { const k = Math.abs(b.offsetLeft + b.offsetWidth / 2 - (st.x + st.w / 2)); if (k < bd) { bd = k; best = b; } });
    st.drag = false;                                                   // отпустили: скорость пальца уходит в пружину → ползунок «долетает» с шлейфом
    if (best.dataset.page !== S.page) showPage(best.dataset.page); else navGlassSync(true);
  };
  nav.addEventListener("pointerup", end);
  nav.addEventListener("pointercancel", end);
  nav.addEventListener("click", (e) => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);   // после перетаскивания не считать это нажатием
  window.addEventListener("resize", () => navGlassSync(false));
  window.addEventListener("orientationchange", () => setTimeout(() => navGlassSync(false), 200));
  window.addEventListener("load", () => navGlassSync(false));
  if (window.ResizeObserver) new ResizeObserver(() => navGlassSync(false)).observe(nav);
  requestAnimationFrame(() => navGlassSync(false));
})();


// ---------------------------------------------------------------- «прогрев» анимаций
// Первый запуск анимации с размытием / clip-path / тенью заставляет браузер собрать шейдеры и слои — отсюда фриз на первом нажатии.
// Один раз после загрузки прогоняем те же эффекты на почти невидимом элементе, чтобы к первому нажатию всё уже было готово.
(function warmAnim() {
  if (!document.body.animate) return;
  const run = () => {
    if (!animOn()) return;
    const w = document.createElement("div"); w.setAttribute("aria-hidden", "true");
    w.style.cssText = "position:fixed;left:0;top:0;width:100%;height:60%;opacity:.02;pointer-events:none;z-index:5;overflow:hidden;background:var(--bg)";
    w.innerHTML = '<div style="margin:20px;height:120px;border:1.5px solid #e03500;border-radius:12px;background:#1f2227;box-shadow:0 0 14px rgba(120,190,255,.5);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)">CriptoForex</div>'
      + '<div style="margin:20px;height:260px;background:#272b32;border-radius:14px"></div>';
    document.body.appendChild(w);
    const o = { duration: 320, easing: "cubic-bezier(.22,.9,.24,1)" }, inner = w.firstChild;
    w.animate([{ transform: "translate3d(60px,0,0)", filter: "blur(10px)", opacity: 0.02 }, { transform: "translate3d(0,0,0)", filter: "blur(0px)", opacity: 0.02 }], o);
    inner.animate([{ translate: "30px 0", clipPath: "inset(0 100% 0 0 round 12px)", filter: "brightness(1.4)", scale: "0.7" }, { translate: "0 0", clipPath: "inset(-8px -8px -8px -8px round 12px)", filter: "none", scale: "1" }], o);
    setTimeout(() => w.remove(), 500);
  };
  const go = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 1500 }) : run()), 900);
  if (document.readyState === "complete") go(); else addEventListener("load", go);
})();
