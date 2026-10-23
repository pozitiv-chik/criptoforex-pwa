/* Стакан (DOM) и заявки — для всех игроков. Кнопка «DOM» слева на графике крипто-монеты, под кнопкой таймфрейма.
   Использует общее состояние app.js (S, api, toast, setStake, openTrade …) и подключается после него.
   Сервер: /api/book, /api/orders/place, /api/orders/cancel (нужна обычная авторизация Telegram). */
"use strict";
const DOM = { open: false, asset: "", ex: null, exchanges: [], book: null, busy: false, timer: 0, touchAt: 0,
              sel: null, oneTap: true, err: "", placing: false, depth: 30, prev: null, synced: false, grp: 1, kEff: 1, kMin: 1, centered: false,
              wide: true, trSeen: new Map(), trFirst: true, tf: "1", candles: [], cKey: "", cAt: 0, cBusy: false, cw: 6, pan: 0,
              trades: [], tSeen: new Set(), tSince: 0, tVer: -1, tKey: "", tBusy: false, tOk: true, path: [], candlesOn: false, rt: 0, rowH: 20 };

const domAsset = () => assetById(DOM.asset || S.asset);
const domUsd = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0));
const domSameP = (a, b, dec) => Number(a).toFixed(dec) === Number(b).toFixed(dec);

function domInit() {
  DOM.oneTap = !(S.ui && S.ui.dom && S.ui.dom.oneTap === false);
  $("btn-dom").onclick = openDom;
  $("dom-back").onclick = closeDom;
  $("dom-ex").onclick = domPickEx;
  $("dom-minus").onclick = () => { setStake(S.stake - stepFor(S.stake - 0.001)); domRender(); };
  $("dom-plus").onclick = () => { setStake(S.stake + stepFor(S.stake)); domRender(); };
  $("dom-stake").onchange = (e) => { const v = parseFloat(String(e.target.value).replace(",", ".")); setStake(isNaN(v) ? S.stake : v); domRender(); };
  $("dom-lev").onclick = () => { if (isSpot(domAsset())) toast("На споте плеча нет — ×1"); else openLeverage(); };
  $("dom-tap").checked = DOM.oneTap;
  $("dom-tap").onchange = (e) => {
    DOM.oneTap = e.target.checked; DOM.sel = null; domRender();
    const ui = S.ui = S.ui || {}; ui.dom = { oneTap: DOM.oneTap };
    api("/api/ui", { dom: ui.dom }).catch(() => {});
    toast(DOM.oneTap ? "1 тап: заявка уходит сразу" : "С подтверждением: тап выбирает уровень, отправка — кнопкой");
  };
  // выбор уровня: делегирование (стакан перерисовывается раз в секунду)
  const lad = $("dom-ladder");
  // Тап по стакану: ЛЕВАЯ половина строки — купить по этой цене, ПРАВАЯ — продать (как в MetaScalp).
  // Строку и половину запоминаем в момент КАСАНИЯ, а не в момент «клика»: стакан обновляется раз в секунду, и если строки успели сдвинуться,
  // клик попадал на соседнюю цену (нажал 100 — встала 90). Пока палец на стакане, он не перерисовывается.
  let tap = null, doneAt = 0;
  const rowAt = (e) => {
    const r = e.target.closest ? e.target.closest("[data-p]") : null; if (!r) return null;
    const rc = r.getBoundingClientRect();
    return { p: Number(r.dataset.p), half: e.clientX < rc.left + rc.width / 2 ? "bid" : "ask", x: e.clientX, y: e.clientY, t: Date.now(), top: lad.scrollTop };
  };
  lad.addEventListener("pointerdown", (e) => { DOM.touchAt = Date.now(); DOM.down = true; tap = rowAt(e); }, { passive: true });
  lad.addEventListener("touchstart", () => { DOM.touchAt = Date.now(); DOM.down = true; }, { passive: true });
  ["pointercancel", "touchend", "touchcancel"].forEach((ev) => lad.addEventListener(ev, () => { DOM.down = false; DOM.touchAt = Date.now(); }, { passive: true }));
  // заявку ставим по ОТПУСКАНИЮ пальца, но по строке, что была под ним при касании (не по «клику»: если стакан успел перерисоваться, браузер клик теряет или даёт соседнюю цену)
  lad.addEventListener("pointerup", (e) => {
    DOM.down = false; DOM.touchAt = Date.now();
    if (e.button > 0 || !tap || Date.now() - tap.t > 800 || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10 || Math.abs(lad.scrollTop - tap.top) > 3) return;   // прокрутка/перетаскивание — не тап
    const pick = tap; tap = null; doneAt = Date.now();
    if (pick.p > 0) domPick(pick.p, pick.half);
  }, { passive: true });
  lad.addEventListener("click", (e) => {
    if (Date.now() - doneAt < 700) return;      // этот тап уже обработан по отпусканию
    const now = rowAt(e); let pick = null;
    if (tap && Date.now() - tap.t < 2500 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 16) pick = tap;      // тот же тап — берём то, что было под пальцем сразу
    else if (now) pick = now;
    tap = null; DOM.touchAt = 0; DOM.down = false;
    if (pick && pick.p > 0) domPick(pick.p, pick.half);
  });
  $("dom-tpsl").onchange = (e) => {
    S.pre.on = e.target.checked; saveUi(); syncTpslBtn();
    if (S.pre.on && !S.pre.tp && !S.pre.sl) { openTpslPre(); } else toast(S.pre.on ? "TP/SL включены для новых заявок" : "TP/SL выключены");
    domTpslSync();
  };
  $("dom-tpsl-set").onclick = () => openTpslPre();
  domScrollZoomInit(lad);
  domChartInit(lad);
  $("dom-orders").addEventListener("click", (e) => {
    const c = e.target.closest("[data-oc]"), all = e.target.closest("[data-oall]");
    if (c) domCancel({ id: Number(c.dataset.oc) }); else if (all) domCancel({ all: true, asset: DOM.asset });
  });
  $("dom-confirm").addEventListener("click", (e) => {
    if (e.target.closest("[data-ok]") && DOM.sel) domPlace(DOM.sel.price, DOM.sel.dir);
    else if (e.target.closest("[data-no]")) { DOM.sel = null; domRender(); }
  });
  $("dom-pos").addEventListener("click", async (e) => { if (e.target.closest("[data-stop]")) { await stopTrades(); domLoad(); } });
  $("dom-up").onclick = async () => { await openTrade("up"); domLoad(); };
  $("dom-down").onclick = async () => { await openTrade("down"); domLoad(); };
}

// кнопка «DOM» на графике: у всех игроков, но только у крипто-монет (у форекса и металлов стакана нет)
function domSync() {
  const b = $("btn-dom"); if (!b) return;
  const a = assetById(S.asset), show = !!(a && a.cat === "crypto");
  if (b.hidden === show) b.hidden = !show;
}

function openDom() {
  const a = assetById(S.asset);
  if (!a || a.cat !== "crypto") return;
  Object.assign(DOM, { open: true, asset: a.id, ex: S.ex || null, book: null, err: "", sel: null, synced: false, prev: null, centered: false, candles: [], cKey: "", cAt: 0, pan: 0, mapMid: null, tKey: "", trSeen: new Map(), trFirst: true });
  showAnimated($("dom-view")); domZoomSet(); domTpslSync(); domChartTimer();
  if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(closeDom); }
  domRender(); domLoad();
  clearInterval(DOM.timer); DOM.timer = setInterval(() => domLoad(), 300);
}
// стакан уже открыт, а активный рынок/биржа сменились (шаг подсказки арбитража) — переключаем стакан на них, не закрывая
function domRetarget() {
  const a = assetById(S.asset);
  if (!DOM.open || !a || a.cat !== "crypto") return;
  Object.assign(DOM, { asset: a.id, ex: S.ex || null, book: null, err: "", sel: null, synced: false, prev: null, centered: false, candles: [], cKey: "", cAt: 0, pan: 0, mapMid: null, tKey: "", trSeen: new Map(), trFirst: true });
  domRender(); domLoad();
}
function closeDom() {
  DOM.open = false; clearInterval(DOM.timer); DOM.timer = 0; clearInterval(DOM.rt); DOM.rt = 0;
  hideAnimated($("dom-view"));
  if (tg && tg.BackButton) { tg.BackButton.offClick(closeDom); tg.BackButton.hide(); }
}

async function domLoad(force) {
  if (!DOM.open || document.hidden) return;
  if (DOM.busy) { if (force) DOM.again = true; return; }       // после заявки/отмены обновим стакан сразу, как только закончится текущий запрос
  DOM.busy = true;
  const asset = DOM.asset, ex = DOM.ex;
  try {
    const d = await api(`/api/book?asset=${asset}&depth=${DOM.depth}` + (ex ? "&ex=" + ex : ""));
    if (!DOM.open || asset !== DOM.asset || ex !== DOM.ex) return;               // пока ждали — сменили биржу/закрыли
    DOM.err = ""; DOM.exchanges = d.exchanges || [];
    if (DOM.book && DOM.book.price != null) DOM.prev = DOM.bookMid != null ? DOM.bookMid : DOM.book.price;
    DOM.book = d;
    if (DOM.ex !== d.ex) DOM.ex = d.ex;                                          // сервер подобрал биржу со стаканом
    if (!DOM.synced) { DOM.synced = true; if ((S.ex || null) !== d.ex) pickExchange(d.ex); }   // график и сделки — на той же бирже, что стакан
    if (d.asks.length && d.bids.length) { DOM.path.push([Date.now(), (d.asks[0][0] + d.bids[0][0]) / 2]); if (DOM.path.length > 1500) DOM.path.splice(0, 300); }
    domChartLive(d.price); domCandles(); if (Date.now() - (DOM.trAt || 0) > 700) { DOM.trAt = Date.now(); domTrades(); }
    domRender();
  } catch (e) {
    DOM.err = e.message; domRender();
  } finally { DOM.busy = false; if (DOM.again) { DOM.again = false; domLoad(); } }
}

function domPickEx() {
  const list = DOM.exchanges.length ? DOM.exchanges : [];
  if (!list.length) { toast("Стакан ещё не загрузился"); return; }
  openSheet("Биржа (стакан)", list.map((id) => `<div class="row ${id === DOM.ex ? "sel" : ""}" data-ex="${id}">${exIcon(id, 28)}<div class="grow">${esc(exName(id))}</div></div>`).join("")
    + `<div class="hint">Заявки и сделки из стакана считаются по цене выбранной биржи. График переключится на неё же.</div>`);
  $("sheet-body").querySelectorAll("[data-ex]").forEach((el) => (el.onclick = () => {
    const id = el.dataset.ex; closeSheet();
    if (id === DOM.ex) return;
    DOM.ex = id; DOM.book = null; DOM.err = ""; DOM.sel = null; DOM.prev = null; DOM.synced = true; DOM.centered = false; DOM.candles = []; DOM.cKey = "";
    pickExchange(id); domRender(); domLoad();
  }));
}

// ---------------------------------------------------------------- действия
function domFlash(price) {
  const el = $("dom-ladder").querySelector(`[data-p="${price}"]`); if (!el) return;
  el.classList.add("tapflash"); setTimeout(() => el.classList.remove("tapflash"), 350);
}
function domPick(price, side) {
  const a = domAsset(), dir = side === "bid" ? "up" : "down";
  if (!(price > 0)) return;
  if (dir === "down" && isSpot(a)) { toast("На споте нет шорта: продать можно только купленное.\nЗакрой позицию кнопкой СТОП."); return; }
  if (DOM.oneTap) { domPlace(price, dir); return; }
  DOM.sel = { price, dir }; domRender();
}

async function domPlace(price, dir) {
  // заявки не блокируют друг друга: отсекаем только двойной тап по той же цене (раньше пока шла одна заявка, остальные тапы молча терялись)
  const pk = dir + "|" + price, pn = Date.now();
  if (DOM.lastPk === pk && pn - (DOM.lastPt || 0) < 300) return;
  DOM.lastPk = pk; DOM.lastPt = pn;
  DOM.placing = (DOM.placing || 0) + 1;
  hap("light", true);      // мгновенный отклик, не дожидаясь сервера
  domFlash(price);
  const a = domAsset();
  try {
    const body = { asset: DOM.asset, direction: dir, price, stake: S.stake, leverage: S.leverage, exchange: DOM.ex };
    if (S.pre.on !== false && S.pre.tp) body.tp_pnl = Math.max(0.01, Math.round(S.stake * S.pre.tp) / 100);          // заготовка TP/SL из «TP SL» — как у обычной сделки (если включена)
    if (S.pre.on !== false && S.pre.sl) body.sl_pnl = Math.max(0.01, Math.round(S.stake * S.pre.sl) / 100);
    const r = await api("/api/orders/place", body);
    hap("medium", true);
    toast(r.trade ? `⚡ Цена уже на рынке — исполнено сразу по ${fmtPrice(a, r.trade.entry_price != null ? r.trade.entry_price : price)}` + (r.trade.entry_price != null && Math.abs(r.trade.entry_price - price) > 1e-9 ? ` (не по ${fmtPrice(a, price)})` : "") : `${dir === "up" ? "↗ Покупка" : "↘ Продажа"} · заявка ${fmtPrice(a, price)}`);
    DOM.sel = null; tick(); domLoad(true);
  } catch (e) { toast(e.message); }
  finally { DOM.placing = Math.max(0, (DOM.placing || 1) - 1); }
}

async function domCancel(body) {
  try {
    const r = await api("/api/orders/cancel", body);
    toast(r.cancelled ? (r.cancelled > 1 ? `Отменено заявок: ${r.cancelled}` : "Заявка отменена") : "Заявка уже исполнена или отменена");
    tick(); domLoad(true);
  } catch (e) { toast(e.message); }
}

// из tick(): заявки, исполненные движком
function domFilled(list) {
  list.forEach((f) => {
    const o = f.order, a = assetById(o.asset) || { name: o.asset, decimals: 2 };
    if (f.trade) toast(`✅ Заявка исполнена: ${a.name}\n${o.direction === "up" ? "↗ Вверх" : "↘ Вниз"} по ${fmtPrice(a, o.price)}`);
    else toast(`Заявка ${a.name} по ${fmtPrice(a, o.price)} отменена: ${o.note || "не удалось открыть сделку"}\nСтавка возвращена.`);
  });
  if (DOM.open) domLoad(true);
}

// ---------------------------------------------------------------- отрисовка
function domRender() {
  if (!DOM.open) return;
  const a = domAsset(), b = DOM.book, spot = isSpot(a);
  setT($("dom-title"), a.name);
  setT($("dom-sub"), DOM.err ? "нет данных" : b ? `${spot ? "спот" : "фьючерс"} · ${exName(b.ex)}` : "загрузка…");
  setH($("dom-ex"), DOM.ex ? exIcon(DOM.ex, 24) + "<i>⌄</i>" : "<i>⌄</i>");
  if (document.activeElement !== $("dom-stake")) $("dom-stake").value = S.stake.toFixed(2);
  setT($("dom-lev"), "×" + (spot ? 1 : S.leverage)); $("dom-lev").disabled = spot;
  $("dom-down").hidden = spot;

  // позиция по этой монете и бирже
  const open = S.trades.filter(onThisMarket), pe = $("dom-pos");
  pe.hidden = !open.length;
  if (open.length) {
    const pnl = open.reduce((s, t) => s + t.pnl, 0), t0 = open[0];
    setH(pe, `<span class="${t0.direction === "up" ? "green" : "red"}">${t0.direction === "up" ? "↗" : "↘"}</span> <b>×${t0.multiplier}</b>${open.length > 1 ? ` (${open.length})` : ""}
      <span class="muted">вход ${fmtPrice(a, t0.entry_price)}</span><b class="${pnl >= 0 ? "green" : "red"} dom-pnl">${signed(pnl)}</b><button class="stop" data-stop>СТОП</button>`);
  }

  if (DOM.err && !b) { setH($("dom-ladder"), `<div class="dom-err">${esc(DOM.err)}</div>`); domRenderOrders(); domRenderConfirm(); return; }
  if (!b) { setH($("dom-ladder"), `<div class="dom-err">Загрузка стакана…</div>`); domRenderOrders(); domRenderConfirm(); return; }
  // стакан перерисовываем только когда данные реально изменились (одинаковый ответ из кэша сервера не трогаем) и палец не на нём
  const sig = [b.ts, (b.orders || []).map((o) => o.id).join(), S.trades.map((t) => t.id).join(), DOM.sel ? DOM.sel.price + DOM.sel.dir : "", DOM.centered ? 1 : 0].join("|");
  const idle = !(DOM.down && Date.now() - DOM.touchAt < 3000) && Date.now() - DOM.touchAt > 450;
  if ((idle && sig !== DOM.sig) || !$("dom-ladder").children.length) { DOM.sig = sig; domLadder(a, b); }   // пока палец на стакане — не перерисовываем, иначе тап потеряется
  domRenderOrders(); domRenderConfirm();
}

function domLadder(a, b) {
  if (DOM.wide) return domLadderGrid(a, b);
  const dec = a.decimals, asks = b.asks.slice(0, DOM.depth), bids = b.bids.slice(0, DOM.depth);
  const usd = (r) => r[0] * r[1], max = Math.max(1e-9, ...asks.map(usd), ...bids.map(usd));
  const marks = {};
  (b.orders || []).forEach((o) => { const k = Number(o.price).toFixed(dec); (marks[k] = marks[k] || []).push(o); });
  const row = (r, side) => {
    const k = Number(r[0]).toFixed(dec), mk = (marks[k] || []).map((o) => `<em class="mk ${o.direction === "up" ? "up" : "dn"}">${o.direction === "up" ? "↗" : "↘"} $${Number(o.stake).toFixed(o.stake < 10 ? 2 : 0)}</em>`).join("");
    const sel = DOM.sel && domSameP(DOM.sel.price, r[0], dec) ? " sel" : "";
    return `<div class="dr ${side}${sel}" data-p="${r[0]}" data-side="${side}"><i class="bar" style="--w:${Math.max(2, usd(r) / max * 100).toFixed(1)}"></i>` +
           `<span class="mk-c">${mk}</span><b class="px">${fmtPrice(a, r[0])}</b><span class="qt">${domUsd(usd(r))}</span></div>`;
  };
  const bestA = asks[0][0], bestB = bids[0][0], spr = bestA - bestB, sprPct = bestB > 0 ? spr / bestB * 100 : 0;
  const px = b.price != null ? b.price : (bestA + bestB) / 2;
  const dirCls = DOM.prev == null || px === DOM.prev ? "" : px > DOM.prev ? " fl-up" : " fl-dn";
  const html = asks.slice().reverse().map((r) => row(r, "ask")).join("") +
    `<div class="dr mid${dirCls}"><b>${fmtPrice(a, px)}</b><span class="muted">спред ${spr.toFixed(Math.min(dec, 8))} · ${sprPct.toFixed(3)}%</span></div>` +
    bids.map((r) => row(r, "bid")).join("");
  const el = $("dom-ladder"), st = el.scrollTop;
  setH(el, html);
  if (!DOM.centered) { DOM.centered = true; domCenter(false); } else el.scrollTop = st;      // скролл пользователя не сбрасываем
  domChartDraw();
}

// ---------------------------------------------------------------- прокрутка и масштаб по X
function domCenter(smooth) {
  const el = $("dom-ladder"), m = el.querySelector(".bestA") || el.querySelector(".mid"); if (!m) return;
  const bb = el.querySelector(".bestB"), edge = bb ? (m.offsetTop + m.offsetHeight + bb.offsetTop) / 2 : m.offsetTop + m.offsetHeight;   // граница ask|bid
  el.scrollTo({ top: edge - el.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
}
// группировка цен: ×1 — каждый тик биржи (1000, 1001, 1002), ×10 — шаг 10 (1000, 1010, 1020) и т.д.; объёмы соседних уровней суммируются
const money2 = (v) => { const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100; return String(n).replace(".", ",") + "$"; };
// плашка внизу, как в MetaScalp: цена монеты сейчас | сумма позиции (зелёный лонг, красный шорт; залита — заявка исполнена, это уже позиция) | комиссия и funding
function domPlate(b) {
  const el = $("dom-plate"); if (!el || !b) return;
  const tr = S.trades.filter(onThisMarket), od = b.orders || [], a = domAsset();
  const last = DOM.trades.length ? DOM.trades[DOM.trades.length - 1][2] : DOM.bookMid;
  let state = "none", net = 0, cost = 0, fresh = false;
  if (tr.length) {
    state = "lit";
    tr.forEach((t) => { net += (t.direction === "up" ? 1 : -1) * t.stake; cost += -(t.fee || 0) + (t.funding_now || 0);
      if (!DOM.trSeen.has(t.id)) DOM.trSeen.set(t.id, DOM.trFirst ? 0 : Date.now()); if (DOM.trSeen.get(t.id) > 0 && Date.now() - DOM.trSeen.get(t.id) < 3000) fresh = true; });
  } else if (od.length) { state = "wait"; od.forEach((o) => { net += (o.direction === "up" ? 1 : -1) * Number(o.stake); cost -= Number(o.fee) || 0; }); }
  DOM.trFirst = false;
  const dir = net > 0 ? "up" : net < 0 ? "dn" : "";
  setH(el, `<b class="pl-px">${last != null ? fmtPrice(a, last) : "—"}</b><b class="pl-sz">${state === "none" ? money2(S.stake) : money2(Math.abs(net))}</b><b class="pl-fee${cost < 0 ? " neg" : cost > 0 ? " pos" : ""}">${state === "none" ? "—" : money2(cost)}</b>`);
  el.className = `dom-plate s-${state} ${dir}${fresh ? " fresh" : ""}`;
}
function domTpslSync() {
  const c = $("dom-tpsl"); if (!c) return;
  c.checked = S.pre.on !== false && !!(S.pre.tp || S.pre.sl);
  const lab = $("dom-tpsl-lab"); if (lab) lab.title = S.pre.tp || S.pre.sl ? `TP ${S.pre.tp ? "+" + S.pre.tp + "%" : "—"} · SL ${S.pre.sl ? "−" + S.pre.sl + "%" : "—"} от ставки` : "TP/SL не заданы — нажми ⚙";
}
function domZoomSet(dir, quiet) {
  if (dir !== undefined) {
    const i = Math.max(0, DOM_NICE.indexOf(DOM.kEff || 1));
    const j = dir === 0 ? 0 : Math.max(0, Math.min(DOM_NICE.length - 1, i + (dir > 0 ? 1 : -1)));
    DOM.grp = DOM_NICE[j];
  }
  setT($("dom-zv"), "×" + Math.max(DOM.grp, DOM.kMin || 1));
  if (dir !== undefined && DOM.open && DOM.book) { DOM.centered = false; domLadder(domAsset(), DOM.book); }
}
function domScrollZoomInit(lad) {
  $("dom-zp").onclick = () => domZoomSet(1);      // крупнее шаг цены
  $("dom-zm").onclick = () => domZoomSet(-1);     // мельче шаг цены
  $("dom-zv").onclick = () => domZoomSet(0);
  $("dom-ctr").onclick = () => domCenter(true);
  // пока стакан крутят (в т.ч. по инерции) — не перерисовываем
  lad.addEventListener("scroll", () => { DOM.touchAt = Date.now(); }, { passive: true });
  // Ctrl/Shift + колесо: колесо вверх — мельче шаг цены, вниз — крупнее; обычное колесо — прокрутка
  let wAt = 0;
  lad.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      if (Date.now() - wAt < 150) return; wAt = Date.now();
      domZoomSet((e.deltaY || e.deltaX) < 0 ? -1 : 1);
    }
  }, { passive: false });
  // щипок двумя пальцами: разводим — мельче шаг цены, сводим — крупнее
  let d0 = 0;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  lad.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); DOM.sel = null; } }, { passive: true });
  lad.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && d0 > 0) {
      e.preventDefault(); const r = dist(e.touches) / d0;
      if (r > 1.4) { d0 = dist(e.touches); domZoomSet(-1); } else if (r < 0.71) { d0 = dist(e.touches); domZoomSet(1); }
    }
  }, { passive: false });
  lad.addEventListener("touchend", (e) => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
}

function domRenderOrders() {
  const a = domAsset(), el = $("dom-orders"), list = (DOM.book && DOM.book.orders) || [];
  el.hidden = !list.length;
  if (!list.length) return;
  setH(el, `<div class="do-head"><b>Заявки (${list.length})</b><button data-oall>Отменить все</button></div>` +
    `<div class="do-list">` + list.map((o) => `<div class="do-row"><span class="${o.direction === "up" ? "green" : "red"}">${o.direction === "up" ? "↗ Buy" : "↘ Sell"}</span>` +
      `<b>${fmtPrice(a, o.price)}</b><small>$${Number(o.stake).toFixed(2)} ×${o.leverage}</small><button data-oc="${o.id}" aria-label="Отменить">✕</button></div>`).join("") + `</div>`);
}

function domRenderConfirm() {
  const el = $("dom-confirm"), s = DOM.sel, a = domAsset();
  el.hidden = !s;
  if (!s) return;
  setH(el, `<div><b class="${s.dir === "up" ? "green" : "red"}">${s.dir === "up" ? "↗ Купить лимит" : "↘ Продать лимит"}</b> по <b>${fmtPrice(a, s.price)}</b>` +
    `<small>$${S.stake.toFixed(2)} ×${isSpot(a) ? 1 : S.leverage}</small></div><button class="ok" data-ok>Отправить</button><button class="no" data-no aria-label="Отмена">✕</button>`);
}

// ---------------------------------------------------------------- стакан-«лесенка» с равным шагом цены (широкий режим)
// Каждая цена — своя строка, пустые уровни тоже: тогда ось цены линейная, и график справа ложится ровно на строки (как в MetaScalp).
const DOM_NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
function domLadderGrid(a, b) {
  const dec = a.decimals, asks = b.asks, bids = b.bids;
  if (!asks.length || !bids.length) return;
  const pr = asks.map((r) => r[0]).concat(bids.map((r) => r[0])).sort((x, y) => x - y);
  let tick = Infinity;
  for (let i = 1; i < pr.length; i++) { const d = pr[i] - pr[i - 1]; if (d > pr[i] * 1e-9 && d < tick) tick = d; }
  const minTick = Math.pow(10, -dec);
  if (!isFinite(tick) || tick < minTick * 0.999) tick = minTick;
  const hiP = pr[pr.length - 1], loP = pr[0];
  let kA = DOM_NICE[DOM_NICE.length - 1];
  for (const k of DOM_NICE) { if ((hiP - loP) / (tick * k) <= 220) { kA = k; break; } }
  const kk = Math.max(kA, DOM.grp), step = tick * kk;
  DOM.kMin = kA; DOM.kEff = kk; setT($("dom-zv"), "×" + kk);
  const A = new Map(), B = new Map(), eps = 1e-7;
  asks.forEach((r) => { const i = Math.ceil(r[0] / step - eps); A.set(i, (A.get(i) || 0) + r[0] * r[1]); });
  const a0 = Math.min(...A.keys());
  bids.forEach((r) => { const i = Math.min(Math.floor(r[0] / step + eps), a0 - 1); B.set(i, (B.get(i) || 0) + r[0] * r[1]); });
  const aHi = Math.max(...A.keys()), b0 = Math.max(...B.keys()), bLo = Math.min(...B.keys());
  // шкала полос: по «типичному» уровню (80-й перцентиль), а не по самой жирной стене — иначе остальные уровни не видны; стены обрезаются и красятся оранжевым
  const vals = [...A.values(), ...B.values()].filter((v) => v > 0).sort((x, y) => x - y);
  const ref = Math.max(1e-9, (vals[Math.floor(vals.length * 0.8)] || vals[vals.length - 1] || 1) * 1.6);
  const hexA = (h, al, f) => { h = String(h || "").trim(); const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h); if (!m) return f; let x = m[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${al})`; };
  const rs = getComputedStyle(document.documentElement);
  // три оттенка на сторону: плотный у цифр, мягче к концу полосы и яркая тонкая кромка на конце — полоса читается чётко, а не «плоским блоком»
  const pal = (v, fb) => ({ hi: hexA(rs.getPropertyValue(v), 0.40, fb + ",.40)"), lo: hexA(rs.getPropertyValue(v), 0.18, fb + ",.18)"), edge: hexA(rs.getPropertyValue(v), 0.70, fb + ",.70)") });
  const PAL = { ask: pal("--red", "rgba(224,53,0"), bid: pal("--green", "rgba(46,158,58"), big: { hi: "rgba(245,158,11,.82)", lo: "rgba(245,158,11,.48)", edge: "rgba(255,200,70,1)" } };
  const marks = {};
  (b.orders || []).forEach((o) => { const i = Math.round(o.price / step); (marks[i] = marks[i] || []).push({ direction: o.direction, stake: Number(o.stake), cost: -(Number(o.fee) || 0), entry: false }); });
  S.trades.filter(onThisMarket).forEach((t) => { const i = Math.round(t.entry_price / step); const m = marks[i] = marks[i] || [], e = m.find((x) => x.entry); if (e) e.stake += t.stake; else m.push({ direction: t.direction, stake: t.stake, entry: true }); });
  const a0i = a0, b0i = b0;
  const lastPx = (DOM.trades && DOM.trades.length) ? DOM.trades[DOM.trades.length - 1][2] : null;
  const row = (i, side, usd) => {
    const price = Number((i * step).toFixed(Math.max(dec, 0))), mk = (marks[i] || []).map((o) => `<em class="mk ${o.direction === "up" ? "up" : "dn"}">${o.entry ? "▶" : o.direction === "up" ? "↗" : "↘"} $${Number(o.stake).toFixed(o.stake < 10 ? 2 : 0)}</em>`).join("");
    const sel = DOM.sel && domSameP(DOM.sel.price, price, dec) ? " sel" : "";
    // как в MetaScalp: лучший ask / лучший bid — яркие строки; пустые строки спреда от лучшего bid до последней цены — яркая «зона» цены
    const best = i === a0i ? " best bestA" : i === b0i ? " best bestB" : "";
    const zone = side === "gap" && lastPx != null && i * step <= lastPx + step / 2 ? " zone" : "";
    // полоса объёма — градиентом на самой строке (background-image, чтобы не затирать заливку стороны)
    const big = usd > ref * 2.2, w = usd ? Math.max(3, Math.min(100, usd / ref * 100)) : 0, pc = big ? PAL.big : PAL[side === "gap" ? "ask" : side];
    const wf = w.toFixed(1), we = Math.max(0, w - 0.7).toFixed(1);
    return `<div class="dr ${side}${sel}${big ? " big" : ""}${best}${zone}${mk ? " has-mk" : ""}" data-p="${price}" data-side="${side}"` + (usd ? ` style="background-image:linear-gradient(90deg,transparent ${we}%,${pc.edge} ${we}%,${pc.edge} ${wf}%,transparent ${wf}%),linear-gradient(90deg,${pc.hi} 0%,${pc.lo} ${wf}%,transparent ${wf}%)"` : "") + `>` +
           `<span class="qt">${usd ? domUsd(usd) : ""}</span><span class="mk-c">${mk}</span><b class="px">${fmtPrice(a, price)}</b></div>`;
  };
  // середина считается по самому стакану (лучшая покупка/продажа), а не по общей цене монеты: у разных бирж они расходятся
  const bestA = Math.min(...asks.map((r) => r[0])), bestB = Math.max(...bids.map((r) => r[0])), px = (bestA + bestB) / 2;
  DOM.bookMid = px;
  const dirCls = DOM.prev == null || px === DOM.prev ? "" : px > DOM.prev ? " fl-up" : " fl-dn";
  const spr = bestA - bestB;
  // сплошная сетка цен без вставных строк: asks сверху, пустые строки спреда, bids снизу — граница между лучшим ask и лучшим bid и есть «середина»
  let html = "";
  for (let i = aHi; i >= a0; i--) html += row(i, "ask", A.get(i) || 0);
  for (let i = a0 - 1; i > b0; i--) html += row(i, "gap", 0);
  for (let i = b0; i >= bLo; i--) html += row(i, "bid", B.get(i) || 0);
  DOM.mapMid = (a0 * step + b0 * step) / 2;
  const el = $("dom-ladder"), st = el.scrollTop;
  setH(el, html);
  if (!DOM.centered) { DOM.centered = true; domCenter(false); } else el.scrollTop = st;
  domPlate(b);
  domChartDraw();
}

// ---------------------------------------------------------------- «пузыри» и график слева от стакана (планшет/ноутбук/ПК, только горизонтально)
// Ось цены общая со стаканом (пузырь/свеча стоит на уровне строки своей цены и скроллится вместе со стаканом), ось времени — по горизонтали.
const DOM_WIDE_Q = "(min-width:900px) and (min-height:560px) and (orientation:landscape)";
const DOM_TF_SEC = { "15s": 15, "1": 60, "5": 300 };
function domLs(k, v) { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} return null; }
// размеры окон: ширина стакана, ширина правой панели, высота строки — тянутся разделителями / кнопками ↕, запоминаются (отдельно для горизонтали и вертикали)
function domSizesInit() {
  const view = $("dom-view"), lw = $("dom-ladder");
  const land = () => window.matchMedia("(min-width:640px) and (orientation:landscape)").matches;
  const kk = (k) => k + (land() ? "" : "P");
  const rightW = () => { const bar = document.querySelector(".dom-bar"); return bar ? bar.getBoundingClientRect().width : 0; };
  const setLw = (w) => { view.style.setProperty("--dom-lw", Math.round(w) + "px"); };
  const setRp = (w) => { view.style.setProperty("--dom-rp", Math.round(w) + "px"); };
  const setRh = (h) => { DOM.rowH = Math.max(12, Math.min(44, Math.round(h))); view.style.setProperty("--rh", DOM.rowH + "px"); domLs(kk("domRh"), String(DOM.rowH)); requestAnimationFrame(domChartDraw); };
  const applySizes = () => {
    const a = Number(domLs(kk("domLw"))), b = Number(domLs(kk("domRp"))), c = Number(domLs(kk("domRh")));
    if (a >= 120) setLw(a); else view.style.removeProperty("--dom-lw");
    if (b >= 240) setRp(b); else view.style.removeProperty("--dom-rp");
    DOM.rowH = c >= 12 ? c : (land() ? 20 : 18); view.style.setProperty("--rh", DOM.rowH + "px");
  };
  applySizes();
  const mq = window.matchMedia("(min-width:640px) and (orientation:landscape)");
  (mq.addEventListener ? mq.addEventListener("change", applySizes) : mq.addListener(applySizes));
  $("dom-rm").onclick = () => setRh(DOM.rowH - 2); $("dom-rp").onclick = () => setRh(DOM.rowH + 2);
  const drag = (el, onMove, onEnd) => {
    let lastUp = 0;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      let x0 = e.clientX, w0 = 0, r0 = 0;
      try { w0 = lw.getBoundingClientRect().width; r0 = rightW(); el.setPointerCapture(e.pointerId); } catch (x) {}
      el.classList.add("drag");
      const mv = (m) => { try { onMove(m.clientX - x0, w0, r0); } catch (x) {} requestAnimationFrame(domChartDraw); };
      const up = () => {
        el.classList.remove("drag"); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
        const now = Date.now(), moved = Math.abs(lastX - x0) > 4; lastUp = now;
        if (!moved && now - dtap < 350) { dtap = 0; onEnd(true); } else { if (!moved) dtap = now; else dtap = 0; onEnd(); }
      };
      let lastX = x0; el.addEventListener("pointermove", (m) => { lastX = m.clientX; });
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
    let dtap = 0;
  };
  // разделитель график | стакан: вправо — стакан уже, график шире
  drag($("dom-split1"), (dx, w0) => { const tot = $("dom-chartbox").getBoundingClientRect().width + w0; setLw(Math.max(120, Math.min(tot - 100, w0 - dx))); },
    (reset) => { if (reset) { view.style.removeProperty("--dom-lw"); domLs(kk("domLw"), null); } else domLs(kk("domLw"), String(Math.round(lw.getBoundingClientRect().width))); });
  // разделитель стакан | правая панель (только горизонтально): вправо — панель уже
  drag($("dom-split2"), (dx, w0, r0) => { setRp(Math.max(240, Math.min(window.innerWidth * 0.6, r0 - dx))); },
    (reset) => { if (reset) { view.style.removeProperty("--dom-rp"); domLs(kk("domRp"), null); } else domLs(kk("domRp"), String(Math.round(rightW()))); });
}
function domChartInit(lad) {
  domSizesInit();
  const mq = window.matchMedia("(orientation:landscape)");
  const sync = () => {
    DOM.wide = true; DOM.depth = window.innerWidth >= 900 ? 100 : 60; DOM.centered = false;
    if (DOM.open) { DOM.book = null; domChartTimer(); domLoad(); }
  };
  sync(); (mq.addEventListener ? mq.addEventListener("change", sync) : mq.addListener(sync));
  window.addEventListener("resize", () => { if (DOM.open) requestAnimationFrame(domChartDraw); });
  lad.addEventListener("scroll", () => { if (DOM.wide) requestAnimationFrame(domChartDraw); }, { passive: true });
  $("dom-tfs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cd != null) DOM.candlesOn = !DOM.candlesOn;
    else if (b.dataset.tf) { DOM.tf = b.dataset.tf; DOM.candlesOn = true; }
    DOM.candles = []; DOM.cKey = ""; domCandles(true); domChartDraw();
  });
  const cv = $("dom-chart"); let drag = null;
  cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: DOM.pan, top: lad.scrollTop }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (drag) { DOM.pan = Math.max(0, drag.pan + (e.clientX - drag.x) / DOM.cw); lad.scrollTop = drag.top - (e.clientY - drag.y); domChartDraw(); } });
  ["pointerup", "pointercancel"].forEach((ev) => cv.addEventListener(ev, () => { drag = null; }));
  cv.addEventListener("dblclick", () => { DOM.pan = 0; domChartDraw(); });
  // колесо: Ctrl/Shift — масштаб по времени (пикселей на секунду), обычное — прокрутка стакана вместе с графиком
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.shiftKey) { DOM.cw = Math.max(1.5, Math.min(60, DOM.cw * Math.exp(-(e.deltaY || e.deltaX) * 0.003))); domChartDraw(); }
    else lad.scrollTop += e.deltaY;
  }, { passive: false });
  // щипок двумя пальцами по графику — масштаб по времени
  let d0 = 0, c0 = 6; const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  cv.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { d0 = dist(e.touches); c0 = DOM.cw; drag = null; } }, { passive: true });
  cv.addEventListener("touchmove", (e) => { if (e.touches.length === 2 && d0 > 0) { e.preventDefault(); DOM.cw = Math.max(1.5, Math.min(60, c0 * dist(e.touches) / d0)); domChartDraw(); } }, { passive: false });
  cv.addEventListener("touchend", (e) => { if (e.touches.length < 2) d0 = 0; }, { passive: true });
}
// пока стакан открыт в широком режиме — график перерисовывается ~10 раз в секунду, чтобы пузыри плавно уезжали влево
function domChartTimer() {
  clearInterval(DOM.rt); DOM.rt = 0;
  if (DOM.open && DOM.wide) DOM.rt = setInterval(() => { if (!document.hidden) domChartDraw(); }, 100);
}
async function domTrades() {
  if (!DOM.open || !DOM.wide || DOM.tBusy || document.hidden) return;
  const key = DOM.asset + "|" + (DOM.ex || "");
  if (key !== DOM.tKey) { Object.assign(DOM, { tKey: key, trades: [], tSeen: new Set(), tSince: 0, tVer: -1, tOk: true, path: [] }); }
  if (!DOM.tOk) return;
  DOM.tBusy = true;
  try {
    const d = await api(`/api/trades?asset=${DOM.asset}&since=${DOM.tSince}&ver=${DOM.tVer}` + (DOM.ex ? "&ex=" + DOM.ex : ""));
    if (key !== DOM.asset + "|" + (DOM.ex || "")) return;
    if (!d.ok) { DOM.tOk = false; return; }
    let added = false;
    d.trades.forEach((r) => { if (!DOM.tSeen.has(r[0])) { DOM.tSeen.add(r[0]); DOM.trades.push(r); added = true; } });
    if (added && d.ver !== DOM.tVer) DOM.trades.sort((p, q) => p[1] - q[1]);       // история пришла целиком (в т.ч. задним числом) — упорядочить
    DOM.tFail = 0;
    DOM.tVer = d.ver != null ? d.ver : DOM.tVer;
    if (d.trades.length) DOM.tSince = d.trades[d.trades.length - 1][1] - 3000;      // небольшой нахлёст, дубли отсекает tSeen
    const cut = Date.now() - 20 * 60 * 1000;
    if (DOM.trades.length > 24000 || (DOM.trades[0] && DOM.trades[0][1] < cut)) {
      DOM.trades = DOM.trades.filter((r) => r[1] >= cut).slice(-24000); DOM.tSeen = new Set(DOM.trades.map((r) => r[0]));
    }
  } catch (e) { DOM.tFail = (DOM.tFail || 0) + 1; /* лента моргнула — повторим на следующем тике; при долгом молчании покажем причину на графике */ }
  finally { DOM.tBusy = false; }
}
async function domCandles(force) {
  if (!DOM.open || !DOM.wide || !DOM.candlesOn || DOM.cBusy || document.hidden) return;
  const key = DOM.asset + "|" + DOM.tf + "|" + (DOM.ex || "");
  if (!force && key === DOM.cKey && Date.now() - DOM.cAt < 5000) return;
  DOM.cBusy = true;
  try {
    const { candles } = await api(`/api/candles?asset=${DOM.asset}&tf=${DOM.tf}` + (DOM.ex ? "&ex=" + DOM.ex : ""));
    if (DOM.open && key === DOM.asset + "|" + DOM.tf + "|" + (DOM.ex || "")) { DOM.candles = candles.slice(-300); DOM.cKey = key; DOM.cAt = Date.now(); domChartDraw(); }
  } catch (e) { DOM.cAt = Date.now(); }
  finally { DOM.cBusy = false; }
}
// последняя свеча живёт на цене стакана (раз в секунду)
function domChartLive(px) {
  const cs = DOM.candles, last = cs[cs.length - 1]; if (!last || px == null) return;
  const sec = DOM_TF_SEC[DOM.tf] || 60, now = Math.floor(Date.now() / 1000);
  if (now >= last.time + sec) {
    const t = last.time + Math.floor((now - last.time) / sec) * sec;
    cs.push({ time: t, open: last.close, high: Math.max(last.close, px), low: Math.min(last.close, px), close: px });
  } else { last.high = Math.max(last.high, px); last.low = Math.min(last.low, px); last.close = px; }
}
// цена -> y: линейно по центрам строк стакана (шаг цены равный, поэтому без искажений)
function domYMap(lad) {
  const ys = [], ps = [];
  lad.querySelectorAll(".dr").forEach((r) => {
    const p = Number(r.dataset.p);
    if (p > 0 && isFinite(p) && (!ps.length || p < ps[ps.length - 1])) { ys.push(r.offsetTop + r.offsetHeight / 2 - lad.scrollTop); ps.push(p); }
  });
  if (ys.length < 3) return null;
  return (price) => {
    let i = 0; while (i < ps.length - 2 && price < ps[i + 1]) i++;
    return ys[i] + (ps[i] - price) / (ps[i] - ps[i + 1]) * (ys[i + 1] - ys[i]);
  };
}
function domChartDraw() {
  const box = $("dom-chartbox"), cv = $("dom-chart"), lad = $("dom-ladder"), b = DOM.book;
  if (!DOM.open || !DOM.wide || !b || !box.clientWidth || DOM.mapMid == null) return;
  const W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const Y = domYMap(lad); if (!Y) return;
  const cs = getComputedStyle(document.documentElement), col = (n, f) => (cs.getPropertyValue(n) || f).trim() || f;
  const green = col("--green", "#2ea84a"), red = col("--red", "#e5483a"), line = col("--line", "#2e3239"), muted = col("--muted", "#888"), text = col("--text", "#fff");
  const a = domAsset(), pps = DOM.cw, pad = 10, nowMs = Date.now();
  // линии строго по сетке физических пикселей (на экранах с DPR 2–3 полсекундные «+0.5» давали размытые линии): толщина — целое число пикселей, центр — на пикселе
  const lwPx = Math.max(1, Math.round(dpr)), lw1 = lwPx / dpr, sn = (v) => (Math.floor(v * dpr) + (lwPx % 2 ? 0.5 : 0)) / dpr;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.lineJoin = "round";
  const X = (tMs) => W - pad - ((nowMs - tMs) / 1000 - DOM.pan) * pps;
  // сетка по строкам стакана (каждая 5-я) и по времени (каждые 10 секунд)
  ctx.strokeStyle = line; ctx.lineWidth = lw1; ctx.globalAlpha = 0.45; ctx.beginPath();
  lad.querySelectorAll(".dr").forEach((r, i) => { if (i % 5 === 0) { const y = sn(r.offsetTop - lad.scrollTop); ctx.moveTo(0, y); ctx.lineTo(W, y); } });
  const gs = pps >= 4 ? 10 : pps >= 2 ? 30 : 60;
  for (let t = Math.floor(nowMs / 1000 / gs) * gs; X(t * 1000) > 0; t -= gs) { const x = sn(X(t * 1000)); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // свечи (по кнопке «Свечи»): та же ось времени
  if (DOM.candlesOn) {
    const sec = DOM_TF_SEC[DOM.tf] || 60, bw = Math.max(1, Math.round(sec * pps * 0.7));
    DOM.candles.forEach((c) => {
      const x = X((c.time + sec / 2) * 1000); if (x < -bw || x > W + bw) return;
      const clr = c.close >= c.open ? green : red, yH = Y(c.high), yL = Y(c.low), yO = Y(c.open), yC = Y(c.close);
      ctx.globalAlpha = 0.55; ctx.strokeStyle = ctx.fillStyle = clr; ctx.lineWidth = lw1;
      ctx.beginPath(); ctx.moveTo(sn(x), yH); ctx.lineTo(sn(x), yL); ctx.stroke();
      ctx.fillRect(Math.round(x - bw / 2), Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO))); ctx.globalAlpha = 1;
    });
  }
  // линия цены без сделок на ленте (у бирж без ленты) — по середине стакана
  if (!DOM.trades.length && DOM.path.length > 1) {
    ctx.strokeStyle = text; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.beginPath();
    DOM.path.forEach(([t, p], i) => { const x = X(t), y = Y(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  // пузыри как в MetaScalp: сделки режутся на отрезки времени; пузырь — овал, вытянутый по диапазону цен отрезка (от мин. до макс.), число внутри — сумма в $,
  // цвет — кто давил (зелёный покупатели, красный продавцы); тонкая линия тянется через пузыри
  const sliceMs = Math.max(1500, Math.min(8000, Math.round(26 / pps * 1000))), sliceW = sliceMs / 1000 * pps, slices = new Map();
  const lo = Math.max(0, DOM.trades.findIndex((r) => (nowMs - r[1]) / 1000 - DOM.pan <= W / pps + 12));
  for (let i = lo; i < DOM.trades.length; i++) {
    const r = DOM.trades[i];
    if ((nowMs - r[1]) / 1000 < DOM.pan - 12) continue;
    const k = Math.floor(r[1] / sliceMs), usd = r[2] * r[3];
    let g = slices.get(k);
    if (!g) { g = { t: (k + 0.5) * sliceMs, lo: r[2], hi: r[2], buy: 0, sell: 0, n: 0, last: r[2] }; slices.set(k, g); }
    g.lo = Math.min(g.lo, r[2]); g.hi = Math.max(g.hi, r[2]); g.last = r[2]; g.n++;
    if (r[4] > 0) g.buy += usd; else g.sell += usd;
  }
  const bubbles = [...slices.values()].map((g) => ({ ...g, usd: g.buy + g.sell })), bySize = bubbles.slice().sort((p, q) => q.usd - p.usd);
  const refUsd = Math.max(10, bySize.length ? bySize[Math.min(bySize.length - 1, Math.floor(bySize.length * 0.05))].usd : 10);      // крупный пузырь окна = 95-й перцентиль
  if (bubbles.length > 1) {
    ctx.strokeStyle = text; ctx.globalAlpha = 0.4; ctx.lineWidth = lw1; ctx.beginPath();
    bubbles.forEach((g, i) => { const x = X(g.t), y = Y(g.last); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  bubbles.forEach((g) => {
    const cx = X(g.t), yTop = Y(g.hi), yBot = Y(g.lo), cy = (yTop + yBot) / 2;
    const rx = Math.max(4, Math.min(sliceW * 0.55, 4 + sliceW * 0.5 * Math.sqrt(g.usd / refUsd))), ry = Math.max(rx, Math.abs(yBot - yTop) / 2 + rx * 0.7);
    if (cx < -rx || cx > W + rx || cy + ry < 0 || cy - ry > H) return;
    ctx.globalAlpha = 0.78; ctx.fillStyle = g.buy >= g.sell ? green : red; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = lw1; ctx.stroke();
    if (rx >= 8) { ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.min(12, Math.round(rx * 0.85))}px system-ui,sans-serif`; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(domUsd(g.usd), cx, cy + 0.5); ctx.fillText(domUsd(g.usd), cx, cy + 0.5); }
  });
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  const hline = (price, color, label, dash, mine) => {
    const y = Y(price); if (!(y > -20 && y < H + 20)) return;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = mine ? lw1 * 2 : lw1; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(0, sn(y)); ctx.lineTo(W, sn(y)); ctx.stroke(); ctx.setLineDash([]);
    if (label) { ctx.font = "600 11px system-ui,sans-serif"; const tw = ctx.measureText(label).width + 8; ctx.fillRect(W - tw, y - 8, tw, 16); ctx.fillStyle = color === text ? col("--bg", "#111") : "#fff"; ctx.fillText(label, W - tw + 4, y + 4); }
  };
  const mid = DOM.bookMid != null ? DOM.bookMid : DOM.mapMid;
  hline(mid, text, fmtPrice(a, mid), [4, 3]);
  const stk = (v) => "$" + Number(v).toFixed(v < 10 ? 2 : 0);
  (b.orders || []).forEach((o) => hline(Number(o.price), o.direction === "up" ? green : red, (o.direction === "up" ? "↗ лимит " : "↘ лимит ") + stk(o.stake) + " ×" + o.leverage, [5, 3], true));
  S.trades.filter(onThisMarket).forEach((t) => {
    hline(t.entry_price, t.direction === "up" ? green : red, "вход " + stk(t.stake) + " ×" + t.multiplier, null, true);
    if (t.tp != null) hline(t.tp, green, "TP", [6, 4]);
    if (t.sl != null) hline(t.sl, red, "SL", [6, 4]);
  });
  if (!DOM.trades.length && DOM.tOk) { ctx.fillStyle = muted; ctx.font = "13px system-ui,sans-serif"; ctx.fillText((DOM.tFail || 0) >= 3 ? "Лента сделок Binance недоступна (сеть или блокировка) — пузыри появятся, когда связь восстановится" : "Жду сделки…", 14, 64); }
  if (!DOM.tOk && !DOM.candlesOn) { ctx.fillStyle = muted; ctx.font = "13px system-ui,sans-serif"; ctx.fillText("У этой биржи нет ленты сделок — включи «Свечи»", 14, 64); }
  const tf = $("dom-tfs"); tf.querySelectorAll("[data-tf]").forEach((x) => x.classList.toggle("on", DOM.candlesOn && x.dataset.tf === DOM.tf));
  tf.querySelector("[data-cd]").classList.toggle("on", DOM.candlesOn);
}
