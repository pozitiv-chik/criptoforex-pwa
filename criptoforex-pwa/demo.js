/* Local-only demo API. Trades, funds, alerts and preferences never leave this device. */
(function (global) {
  "use strict";

  const STORE_KEY = "criptoforex.local-demo.v1";
  const START_BALANCE = 1000;
  const CACHE_LIMIT = 400;
  let catalog = null, state = null;
  const publicCache = new Map(), inflight = new Map();
  const quoteCache = new Map(), providerCooldown = new Map(), shortHistory = new Map();

  const nowSeconds = () => Date.now() / 1000;
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
  const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };

  function enabled() {
    return true;
  }

  function defaultState() {
    return { version: 1, balance: START_BALANCE, ui: {}, trades: [], orders: [], alerts: [], customAssets: [],
      nextTradeId: 1, nextOrderId: 1, nextAlertId: 1 };
  }

  function normalizeState(saved) {
    const base = defaultState();
    if (!saved || typeof saved !== "object" || saved.version !== 1) return null;
    return { ...base, ...saved, balance: finite(saved.balance) ? saved.balance : START_BALANCE,
      ui: saved.ui && typeof saved.ui === "object" ? saved.ui : {},
      trades: Array.isArray(saved.trades) ? saved.trades : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
      alerts: Array.isArray(saved.alerts) ? saved.alerts : [],
      customAssets: Array.isArray(saved.customAssets) ? saved.customAssets : [] };
  }

  // ---- второе хранилище: IndexedDB (дублирует localStorage; переживает его очистку/сбой и надёжнее на iOS/Android)
  const IDB_NAME = "criptoforex-local", IDB_STORE = "kv";
  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error("no indexedDB"));
      const req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet() {
    try {
      const db = await idbOpen();
      return await new Promise((resolve) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(STORE_KEY);
        req.onsuccess = () => { db.close(); resolve(req.result || null); };
        req.onerror = () => { db.close(); resolve(null); };
      });
    } catch (error) { return null; }
  }
  let idbQueue = Promise.resolve();
  function idbPut(json) {
    idbQueue = idbQueue.then(async () => {
      try {
        const db = await idbOpen();
        await new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          tx.objectStore(IDB_STORE).put(json, STORE_KEY);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = tx.onabort = () => { db.close(); resolve(); };
        });
      } catch (error) { /* IndexedDB недоступен — остаётся localStorage */ }
    });
    return idbQueue;
  }

  // читаем оба хранилища и берём более свежую копию (по savedAt)
  async function loadState() {
    let fromLs = null, fromIdb = null;
    try { fromLs = normalizeState(JSON.parse(localStorage.getItem(STORE_KEY) || "null")); } catch (error) { fromLs = null; }
    try { const raw = await idbGet(); fromIdb = raw ? normalizeState(JSON.parse(raw)) : null; } catch (error) { fromIdb = null; }
    const best = fromLs && fromIdb ? ((fromIdb.savedAt || 0) > (fromLs.savedAt || 0) ? fromIdb : fromLs) : (fromLs || fromIdb);
    return best || defaultState();
  }

  function saveState() {
    if (!state) return false;
    state.savedAt = Date.now();
    let json, ok = false;
    try { json = JSON.stringify(state); } catch (error) { return false; }
    try { localStorage.setItem(STORE_KEY, json); ok = true; }
    catch (error) { console.warn("Local demo data could not be saved to localStorage", error); }
    idbPut(json);                                   // дубль в IndexedDB (асинхронно)
    return ok;
  }

  let readyPromise = null;
  function ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        const response = await fetch("demo-catalog.json", { cache: "no-cache" });
        if (!response.ok) throw new Error("Не удалось загрузить список активов");
        const loaded = await response.json();
        const st = await loadState();
        st.trades.forEach((trade) => { st.nextTradeId = Math.max(st.nextTradeId, Number(trade.id) + 1 || 1); });
        st.orders.forEach((order) => { st.nextOrderId = Math.max(st.nextOrderId, Number(order.id) + 1 || 1); });
        st.alerts.forEach((alert) => { st.nextAlertId = Math.max(st.nextAlertId, Number(alert.id) + 1 || 1); });
        catalog = loaded; state = st;
        saveState();                                // синхронизируем оба хранилища
        // просим браузер не выселять данные приложения при нехватке места
        try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (error) {}
        return catalog;
      })().catch((error) => { readyPromise = null; throw error; });   // при ошибке загрузки можно повторить
    }
    return readyPromise;
  }

  // при сворачивании/закрытии — ещё раз сбрасываем состояние на диск (открытые сделки, баланс)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveState(); });
  global.addEventListener("pagehide", () => saveState());

  function allAssets() {
    const merged = new Map((catalog.assets || []).map((asset) => [asset.id, asset]));
    (state.customAssets || []).forEach((asset) => merged.set(asset.id, asset));
    return [...merged.values()];
  }

  function assetById(id) { return allAssets().find((asset) => asset.id === id); }
  function sourceList(asset, exchange) {
    const list = Array.isArray(asset.sources) ? asset.sources : [];
    return exchange ? list.filter((source) => source.provider === exchange) : list;
  }
  function assetPayload(asset) {
    const { id, name, cat, tv, decimals, title, badge, color, market } = asset;
    return { id, name, cat, tv, decimals, title, badge, color, market,
      exchanges: (asset.sources || []).map((source) => source.provider) };
  }

  function queryUrl(base, params) {
    const query = new URLSearchParams();
    Object.keys(params || {}).forEach((key) => {
      const value = params[key];
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    const text = query.toString();
    return base + (text ? (base.includes("?") ? "&" : "?") + text : "");
  }

  function getJson(url, ttl = 1500) {
    const cached = publicCache.get(url);
    if (cached && cached.expires > Date.now()) return Promise.resolve(clone(cached.value));
    if (inflight.has(url)) return inflight.get(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const promise = fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const text = await response.text();
        let data;
        try { data = JSON.parse(text || "null"); }
        catch (error) { throw new Error("Биржа вернула некорректные данные"); }
        if (!response.ok) {
          const message = data && (data.msg || data.error || data.message);
          throw new Error(message || "Ошибка публичного API: " + response.status);
        }
        publicCache.set(url, { value: data, expires: Date.now() + ttl });
        while (publicCache.size > CACHE_LIMIT) publicCache.delete(publicCache.keys().next().value);
        return clone(data);
      })
      .catch((error) => {
        if (error.name === "AbortError") throw new Error("Истёк срок ожидания публичного API");
        throw error;
      })
      .finally(() => { clearTimeout(timer); inflight.delete(url); });
    inflight.set(url, promise);
    return promise;
  }

  function providerUrl(source) {
    const symbol = encodeURIComponent(source.symbol);
    const p = source.provider;
    switch (p) {
      case "binance": return queryUrl("https://api.binance.com/api/v3/ticker/24hr", { symbol: source.symbol });
      case "okx": return queryUrl("https://www.okx.com/api/v5/market/ticker", { instId: source.symbol });
      case "bybit": return queryUrl("https://api.bybit.com/v5/market/tickers", { category: "spot", symbol: source.symbol });
      case "coinbase": return "https://api.coinbase.com/v2/prices/" + symbol + "/spot";
      case "kraken": return queryUrl("https://api.kraken.com/0/public/Ticker", { pair: source.symbol });
      case "kucoin": return queryUrl("https://api.kucoin.com/api/v1/market/stats", { symbol: source.symbol });
      case "mexc": return queryUrl("https://api.mexc.com/api/v3/ticker/24hr", { symbol: source.symbol });
      case "gateio": return queryUrl("https://api.gateio.ws/api/v4/spot/tickers", { currency_pair: source.symbol });
      case "bitget": return queryUrl("https://api.bitget.com/api/v2/spot/market/tickers", { symbol: source.symbol });
      case "htx": return queryUrl("https://api.huobi.pro/market/detail/merged", { symbol: source.symbol });
      case "bitfinex": return "https://api-pub.bitfinex.com/v2/ticker/" + symbol;
      case "bitstamp": return "https://www.bitstamp.net/api/v2/ticker/" + symbol + "/";
      case "cryptocom": return queryUrl("https://api.crypto.com/exchange/v1/public/get-tickers", { instrument_name: source.symbol });
      case "yahoo": return queryUrl("https://query1.finance.yahoo.com/v8/finance/chart/" + symbol, { interval: "1m", range: "1d" });
      default: throw new Error("Неизвестный источник котировок: " + p);
    }
  }

  async function providerQuote(source) {
    const key = source.provider + "|" + source.symbol, blocked = providerCooldown.get(key) || 0;
    if (blocked > Date.now()) throw new Error("Источник временно недоступен");
    const data = await getJson(providerUrl(source), 1600);
    let price = null, ref = null, row;
    switch (source.provider) {
      case "binance": price = Number(data.lastPrice); ref = Number(data.openPrice); break;
      case "okx": row = data.data && data.data[0]; price = Number(row && row.last); ref = Number(row && row.open24h); break;
      case "bybit": row = data.result && data.result.list && data.result.list[0]; price = Number(row && row.lastPrice); ref = Number(row && row.prevPrice24h); break;
      case "coinbase": price = Number(data.data && data.data.amount); break;
      case "kraken": row = data.result && Object.values(data.result).find((value) => value && value.c); price = Number(row && row.c && row.c[0]); ref = Number(row && row.o); break;
      case "kucoin": row = data.data; price = Number(row && row.last); ref = row && row.changePrice != null ? Number(row.last) - Number(row.changePrice) : null; break;
      case "mexc": price = Number(data.lastPrice); ref = Number(data.openPrice); break;
      case "gateio": row = Array.isArray(data) && data[0]; price = Number(row && row.last); ref = row && row.change_percentage ? price / (1 + Number(row.change_percentage) / 100) : null; break;
      case "bitget": row = data.data && data.data[0]; price = Number(row && row.lastPr); ref = Number(row && row.open); break;
      case "htx": row = data.tick; price = Number(row && row.close); ref = Number(row && row.open); break;
      case "bitfinex": price = Number(Array.isArray(data) && data[6]); ref = Number(Array.isArray(data) && data[6]) - Number(Array.isArray(data) && data[4]); break;
      case "bitstamp": price = Number(data.last); ref = Number(data.open); break;
      case "cryptocom": row = data.result && data.result.data && data.result.data[0]; price = Number(row && row.a); ref = row && row.c != null ? price / (1 + Number(row.c)) : null; break;
      case "yahoo": row = data.chart && data.chart.result && data.chart.result[0]; price = Number(row && row.meta && row.meta.regularMarketPrice); ref = Number(row && row.meta && row.meta.chartPreviousClose); break;
    }
    if (!Number.isFinite(price) || price <= 0) {
      providerCooldown.set(key, Date.now() + 15000);
      throw new Error("Нет котировки от " + source.provider);
    }
    providerCooldown.delete(key);
    return { price, ref: Number.isFinite(ref) && ref > 0 ? ref : null };
  }

  function quoteResult(asset, price, ref, provider, live, ts) {
    const change = ref ? price - ref : null;
    return { asset: asset.id, price, live, ts, src: provider,
      change, change_pct: change == null ? null : change / ref * 100 };
  }

  function recordShortCandle(assetId, quote) {
    if (!quote || !(quote.price > 0)) return;
    const time = Math.floor(quote.ts / 15) * 15;
    const rows = shortHistory.get(assetId) || [];
    let last = rows[rows.length - 1];
    if (!last || last.time !== time) {
      last = { time, open: quote.price, high: quote.price, low: quote.price, close: quote.price };
      rows.push(last);
    } else {
      last.high = Math.max(last.high, quote.price);
      last.low = Math.min(last.low, quote.price);
      last.close = quote.price;
    }
    if (rows.length > 500) rows.splice(0, rows.length - 500);
    shortHistory.set(assetId, rows);
  }

  function shortCandles(assetId, tf) {
    const seconds = { "15s": 15, "1": 60, "5": 300, "15": 900, "60": 3600, D: 86400 }[tf];
    const source = shortHistory.get(assetId) || [];
    if (!seconds) return [];
    if (seconds === 15) return clone(source);
    const merged = new Map();
    source.forEach((candle) => {
      const time = Math.floor(candle.time / seconds) * seconds, row = merged.get(time);
      if (!row) merged.set(time, { time, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
      else { row.high = Math.max(row.high, candle.high); row.low = Math.min(row.low, candle.low); row.close = candle.close; }
    });
    return [...merged.values()];
  }

  async function readQuote(assetId, exchange) {
    const asset = assetById(assetId);
    if (!asset) fail("Неизвестный актив");
    const key = assetId + "@" + (exchange || "auto"), cached = quoteCache.get(key);
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    if (cached && age < 2500) return { ...cached.quote, live: cached.quote.live && age < 30000 };
    const sources = sourceList(asset, exchange);
    if (exchange && !sources.length) fail("Этой монеты нет на выбранной бирже");
    const available = sources.filter((source) => (providerCooldown.get(source.provider + "|" + source.symbol) || 0) <= Date.now());
    const preferred = cached && cached.quote.src && cached.quote.src !== "sim"
      ? sources.find((source) => source.provider === cached.quote.src) : null;
    const primary = exchange ? sources.slice(0, 1) : preferred && available.includes(preferred) ? [preferred] : available.slice(0, 3);
    const fallback = exchange ? [] : available.filter((source) => !primary.includes(source)).slice(0, 3);
    const attempt = (candidates) => new Promise((resolve) => {
      if (!candidates.length) return resolve(null);
      let remaining = candidates.length, done = false;
      candidates.forEach((source) => providerQuote(source).then((result) => {
        if (done) return;
        done = true;
        resolve({ source, result });
      }).catch(() => {
        providerCooldown.set(source.provider + "|" + source.symbol, Date.now() + 15000);
        if (--remaining === 0 && !done) resolve(null);
      }));
    });
    const winner = await attempt(primary) || await attempt(fallback);
    if (winner) {
      const ts = nowSeconds(), quote = quoteResult(asset, winner.result.price, winner.result.ref, winner.source.provider, true, ts);
      quoteCache.set(key, { quote, fetchedAt: Date.now() });
      recordShortCandle(assetId, quote);
      return quote;
    }
    if (cached && cached.quote.src !== "sim" && age < 60000) {
      const quote = { ...cached.quote, live: false };
      quoteCache.set(key, { quote, fetchedAt: Date.now() - 1000 });
      return quote;
    }
    const base = cached && cached.quote.price > 0 ? cached.quote.price : Number(asset.sim_base) || 1;
    const previous = cached ? cached.quote.price : base;
    const price = Math.max(10 ** -(asset.decimals || 2), previous * (1 + (Math.random() - 0.5) * 0.00016));
    const quote = quoteResult(asset, price, base, "sim", false, nowSeconds());
    quoteCache.set(key, { quote, fetchedAt: Date.now() });
    recordShortCandle(assetId, quote);
    return quote;
  }

  function coinOf(assetId) { return assetId.replace(/(SPOT|USD|PERP)$/, ""); }
  function feeFor(asset, exchange, stake, leverage) {
    if (asset.market !== "fut" && asset.market !== "spot") return 0;
    const coin = coinOf(asset.id), notional = stake * leverage;
    const top = new Set(["BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX"]).has(coin);
    const slip = (top ? 0.02 * (1 + notional / 500000) : 0.05 * (1 + notional / 30000));
    const name = (catalog.exchanges || {})[exchange] || exchange || "Binance";
    const taker = asset.market === "spot" ? 0.1 : ({ Binance: 0.05, Bybit: 0.055, OKX: 0.05, Bitget: 0.06,
      KuCoin: 0.06, Coinbase: 0.03, MEXC: 0.02, HTX: 0.05 }[name] || 0.05);
    return round(notional * (2 * taker + 2 * slip) / 100);
  }

  function liqPrice(trade) {
    const sign = trade.direction === "up" ? 1 : -1;
    const room = trade.stake ? Math.max(0, 1 - (trade.fee || 0) / trade.stake) : 1;
    return trade.entry_price * (1 - sign * room / trade.multiplier);
  }

  function calcPnl(trade, price) {
    const sign = trade.direction === "up" ? 1 : -1;
    const gross = trade.stake * trade.multiplier * sign * (price / trade.entry_price - 1);
    return round(Math.max(gross - (trade.fee || 0), -trade.stake));
  }

  function checkLevels(direction, price, liq, tp, sl, decimals) {
    const up = direction === "up";
    if (tp != null && !(up ? tp > price : tp < price)) fail("Тейк-профит должен быть " + (up ? "выше" : "ниже") + " текущей цены");
    if (sl != null) {
      if (!(up ? sl < price : sl > price)) fail("Стоп-лосс должен быть " + (up ? "ниже" : "выше") + " текущей цены");
      if (!(up ? sl > liq : sl < liq)) fail("Стоп-лосс дальше уровня ликвидации");
    }
    if (tp != null && round(tp, decimals) <= 0) fail("Некорректная цена тейк-профита");
  }

  async function openTrade(body, entryPrice, prepaid = false) {
    const asset = assetById(body.asset);
    if (!asset) fail("Неизвестный актив");
    if (body.direction !== "up" && body.direction !== "down") fail("Некорректное направление сделки");
    if (asset.market === "spot" && body.direction !== "up") fail("На споте можно только «Вверх»");
    const stake = round(Number(body.stake), 2);
    if (!Number.isFinite(stake) || stake < catalog.config.min_stake || stake > catalog.config.max_stake) {
      fail("Ставка должна быть от $" + Number(catalog.config.min_stake).toFixed(2) + " до $" + Number(catalog.config.max_stake).toLocaleString("ru-RU"));
    }
    const leverage = asset.market === "spot" ? 1 : Math.round(Number(body.leverage) || catalog.config.multiplier);
    if (leverage < 1 || leverage > catalog.config.max_leverage) fail("Плечо от ×1 до ×" + catalog.config.max_leverage);
    const openCount = state.trades.filter((trade) => trade.status === "open").length;
    if (openCount >= catalog.config.max_open_trades) fail("Не больше " + catalog.config.max_open_trades + " открытых сделок");
    if (!prepaid && state.balance + 1e-8 < stake) fail("Недостаточно средств");
    const exchange = body.exchange || null;
    const quote = await readQuote(asset.id, exchange);
    const price = Number(entryPrice || quote.price);
    if (!Number.isFinite(price) || price <= 0) fail("Нет цены для открытия сделки");
    const fee = feeFor(asset, exchange || (quote.src === "sim" ? null : quote.src), stake, leverage);
    const sign = body.direction === "up" ? 1 : -1, decimals = asset.decimals || 2;
    const parseLevel = (value, label) => {
      if (value == null || value === "") return null;
      const result = Number(value);
      if (!Number.isFinite(result) || result <= 0) fail("Некорректная цена " + label);
      return round(result, decimals);
    };
    let tp = parseLevel(body.tp, "тейк-профита"), sl = parseLevel(body.sl, "стоп-лосса");
    const tpPnl = body.tp_pnl == null ? null : Number(body.tp_pnl);
    const slPnl = body.sl_pnl == null ? null : Number(body.sl_pnl);
    if (tpPnl != null && (!Number.isFinite(tpPnl) || tpPnl <= 0)) fail("Некорректная сумма тейк-профита");
    if (slPnl != null && (!Number.isFinite(slPnl) || slPnl <= 0)) fail("Некорректная сумма стоп-лосса");
    if (tp == null && tpPnl != null) tp = round(price * (1 + sign * (tpPnl + fee) / (stake * leverage)), decimals);
    if (sl == null && slPnl != null) {
      if (slPnl <= fee) fail("Стоп-лосс меньше комиссии и сработает сразу");
      sl = round(price * (1 + sign * (-(slPnl - fee)) / (stake * leverage)), decimals);
    }
    const trade = { id: state.nextTradeId++, asset: asset.id, direction: body.direction, stake, multiplier: leverage,
      entry_price: price, opened_at: nowSeconds(), exchange, tp, sl, fee, fund_rate: 0, funding: 0,
      status: "open", close_reason: null };
    checkLevels(trade.direction, price, liqPrice(trade), tp, sl, decimals);
    if (!prepaid) state.balance = round(state.balance - stake);
    state.trades.push(trade);
    saveState();
    return tradeView(trade, quote);
  }

  function tradeView(trade, quote) {
    const price = quote && quote.price > 0 ? quote.price : trade.entry_price;
    return { ...trade, price, pnl: trade.status === "open" ? calcPnl(trade, price) : trade.pnl,
      funding_now: 0, market: (assetById(trade.asset) || {}).market || "fx", liq: liqPrice(trade),
      via: trade.exchange || (quote && quote.src !== "sim" ? quote.src : null) };
  }

  async function closeTrade(tradeId, reason = "manual", forcedPrice = null) {
    const trade = state.trades.find((item) => Number(item.id) === Number(tradeId));
    if (!trade || trade.status !== "open") fail("Открытая сделка не найдена");
    const quote = await readQuote(trade.asset, trade.exchange);
    const price = forcedPrice == null ? quote.price : Number(forcedPrice);
    const pnl = calcPnl(trade, price);
    Object.assign(trade, { status: "closed", exit_price: price, closed_at: nowSeconds(), pnl,
      close_reason: reason, funding: 0 });
    state.balance = round(state.balance + trade.stake + pnl);
    saveState();
    return trade;
  }

  async function setTradeLevels(body) {
    const trade = state.trades.find((item) => Number(item.id) === Number(body.trade_id) && item.status === "open");
    if (!trade) fail("Открытая сделка не найдена");
    const asset = assetById(trade.asset), quote = await readQuote(trade.asset, trade.exchange);
    const tp = Object.prototype.hasOwnProperty.call(body, "tp") ? (body.tp == null ? null : round(Number(body.tp), asset.decimals)) : trade.tp;
    const sl = Object.prototype.hasOwnProperty.call(body, "sl") ? (body.sl == null ? null : round(Number(body.sl), asset.decimals)) : trade.sl;
    if (tp != null && (!Number.isFinite(tp) || tp <= 0)) fail("Некорректная цена тейк-профита");
    if (sl != null && (!Number.isFinite(sl) || sl <= 0)) fail("Некорректная цена стоп-лосса");
    checkLevels(trade.direction, quote.price, liqPrice(trade),
      Object.prototype.hasOwnProperty.call(body, "tp") ? tp : null,
      Object.prototype.hasOwnProperty.call(body, "sl") ? sl : null, asset.decimals);
    trade.tp = tp; trade.sl = sl;
    saveState();
    return { trade: tradeView(trade, quote) };
  }

  function orderView(order) {
    return { ...order };
  }

  async function placeOrder(body) {
    const asset = assetById(body.asset);
    if (!asset || asset.cat !== "crypto") fail("Стакан доступен только для криптовалют");
    const exchange = body.exchange || "binance";
    if (exchange !== "binance" || !sourceList(asset, "binance").length) fail("Лимитные демо-заявки доступны через Binance");
    const price = round(Number(body.price), asset.decimals), quote = await readQuote(asset.id, exchange);
    const stake = round(Number(body.stake), 2), direction = body.direction;
    if (!Number.isFinite(price) || price <= 0) fail("Некорректная цена заявки");
    if (direction !== "up" && direction !== "down") fail("Некорректное направление заявки");
    if (asset.market === "spot" && direction !== "up") fail("На споте можно только купить");
    if (Math.abs(price / quote.price - 1) > 0.5) fail("Цена заявки слишком далека от рынка");
    if (!Number.isFinite(stake) || stake < catalog.config.min_stake || stake > catalog.config.max_stake) fail("Некорректная ставка");
    const leverage = asset.market === "spot" ? 1 : Math.round(Number(body.leverage) || catalog.config.multiplier);
    if (leverage < 1 || leverage > catalog.config.max_leverage) fail("Некорректное плечо");
    const bodyTrade = { asset: asset.id, direction, stake, leverage, exchange,
      tp_pnl: body.tp_pnl, sl_pnl: body.sl_pnl };
    if ((direction === "up" && price >= quote.price) || (direction === "down" && price <= quote.price)) {
      return { order: null, trade: await openTrade(bodyTrade) };
    }
    if (state.orders.length >= 20) fail("Не больше 20 ожидающих заявок");
    if (state.balance + 1e-8 < stake) fail("Недостаточно средств");
    state.balance = round(state.balance - stake);
    const order = { id: state.nextOrderId++, asset: asset.id, exchange, direction, price, stake, leverage,
      tp_pnl: bodyTrade.tp_pnl == null ? null : Number(bodyTrade.tp_pnl),
      sl_pnl: bodyTrade.sl_pnl == null ? null : Number(bodyTrade.sl_pnl), created_at: nowSeconds(),
      fee: feeFor(asset, exchange, stake, leverage), status: "pending" };
    state.orders.push(order);
    saveState();
    return { order: orderView(order), trade: null };
  }

  function cancelOrders(body) {
    const selected = state.orders.filter((order) => body.id != null
      ? Number(order.id) === Number(body.id)
      : body.all && (!body.asset || body.asset === order.asset));
    selected.forEach((order) => { state.balance = round(state.balance + order.stake); });
    state.orders = state.orders.filter((order) => !selected.includes(order));
    if (selected.length) saveState();
    return { cancelled: selected.length };
  }

  function checkOrderFill(order, price) {
    return order.direction === "up" ? price <= order.price : price >= order.price;
  }

  function checkTradeClose(trade, price) {
    if (calcPnl(trade, price) <= -trade.stake) return ["liquidation", null];
    const up = trade.direction === "up";
    if (trade.sl != null && (up ? price <= trade.sl : price >= trade.sl)) return ["sl", trade.sl];
    if (trade.tp != null && (up ? price >= trade.tp : price <= trade.tp)) return ["tp", trade.tp];
    return null;
  }

  async function tickResponse(url) {
    const assetId = url.searchParams.get("asset"), exchange = url.searchParams.get("ex") || null;
    if (!assetById(assetId)) fail("Неизвестный актив");
    const quoteKeys = new Map([[assetId + "@" + (exchange || "auto"), [assetId, exchange]]]);
    state.trades.filter((trade) => trade.status === "open").forEach((trade) => quoteKeys.set(trade.asset + "@" + (trade.exchange || "auto"), [trade.asset, trade.exchange]));
    state.orders.forEach((order) => quoteKeys.set(order.asset + "@" + (order.exchange || "auto"), [order.asset, order.exchange]));
    state.alerts.filter((alert) => alert.status === "pending").forEach((alert) => quoteKeys.set(alert.asset + "@auto", [alert.asset, null]));
    const quotes = new Map();
    await Promise.all([...quoteKeys.entries()].map(async ([key, pair]) => quotes.set(key, await readQuote(pair[0], pair[1]))));
    const autoClosed = [], ordersFilled = [], fired = [];
    for (const trade of [...state.trades]) {
      if (trade.status !== "open") continue;
      const q = quotes.get(trade.asset + "@" + (trade.exchange || "auto"));
      const hit = q && checkTradeClose(trade, q.price);
      if (hit) autoClosed.push(await closeTrade(trade.id, hit[0], hit[1] == null ? q.price : hit[1]));
    }
    for (const order of [...state.orders]) {
      const q = quotes.get(order.asset + "@" + (order.exchange || "auto"));
      if (!q || !checkOrderFill(order, q.price)) continue;
      state.orders = state.orders.filter((item) => item.id !== order.id);
      try {
        const trade = await openTrade({ ...order, leverage: order.leverage }, order.price, true);
        ordersFilled.push({ order: { ...order, status: "filled" }, trade });
      } catch (error) {
        state.balance = round(state.balance + order.stake);
        ordersFilled.push({ order: { ...order, status: "cancelled", note: error.message }, trade: null });
      }
      saveState();
    }
    for (const alert of state.alerts) {
      if (alert.status !== "pending") continue;
      const q = quotes.get(alert.asset + "@auto");
      if (!q || !(alert.above ? q.price >= alert.target : q.price <= alert.target)) continue;
      Object.assign(alert, { status: "triggered", triggered_at: nowSeconds() });
      fired.push({ ...alert });
    }
    if (fired.length) saveState();
    const selectedQuote = quotes.get(assetId + "@" + (exchange || "auto")) || null;
    return { quote: selectedQuote, balance: state.balance,
      open_trades: state.trades.filter((trade) => trade.status === "open").map((trade) => tradeView(trade, quotes.get(trade.asset + "@" + (trade.exchange || "auto")))),
      alerts_active: state.alerts.filter((alert) => alert.status === "pending" && alert.asset === assetId).length,
      fired, auto_closed: autoClosed, orders_filled: ordersFilled };
  }

  function candleRows(source, tf) {
    const intervals = { "1": ["1m", "1", "60", "1min"], "5": ["5m", "5", "300", "5min"],
      "15": ["15m", "15", "900", "15min"], "60": ["1h", "60", "3600", "1hour"],
      D: ["1d", "D", "86400", "1day"] };
    const values = intervals[tf], p = source.provider, symbol = encodeURIComponent(source.symbol);
    if (!values) return null;
    if (p === "binance") return queryUrl("https://api.binance.com/api/v3/klines", { symbol: source.symbol, interval: values[0], limit: 500 });
    if (p === "okx") return queryUrl("https://www.okx.com/api/v5/market/candles", { instId: source.symbol, bar: values[1], limit: 300 });
    if (p === "bybit") return queryUrl("https://api.bybit.com/v5/market/kline", { category: "spot", symbol: source.symbol, interval: values[1], limit: 500 });
    if (p === "coinbase") return queryUrl("https://api.exchange.coinbase.com/products/" + symbol + "/candles", { granularity: values[2] });
    if (p === "kraken") return queryUrl("https://api.kraken.com/0/public/OHLC", { pair: source.symbol, interval: values[1] === "D" ? 1440 : Number(values[1]) });
    if (p === "yahoo") {
      const yf = { "1": ["1m", "5d"], "5": ["5m", "1mo"], "15": ["15m", "1mo"], "60": ["60m", "6mo"], D: ["1d", "5y"] }[tf];
      return queryUrl("https://query1.finance.yahoo.com/v8/finance/chart/" + symbol, { interval: yf[0], range: yf[1] });
    }
    return null;
  }

  async function providerCandles(source, tf) {
    const url = candleRows(source, tf);
    if (!url) return [];
    const data = await getJson(url, 20000), rows = [];
    switch (source.provider) {
      case "binance":
        (Array.isArray(data) ? data : []).forEach((r) => rows.push({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }));
        break;
      case "okx":
        ((data.data || []).slice().reverse()).forEach((r) => rows.push({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }));
        break;
      case "bybit":
        (((data.result || {}).list || []).slice().reverse()).forEach((r) => rows.push({ time: Math.floor(Number(r[0]) / 1000), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }));
        break;
      case "coinbase":
        (Array.isArray(data) ? data.slice().reverse() : []).forEach((r) => rows.push({ time: Number(r[0]), open: Number(r[3]), high: Number(r[2]), low: Number(r[1]), close: Number(r[4]) }));
        break;
      case "kraken": {
        const result = data.result || {}, key = Object.keys(result).find((name) => name !== "last");
        (key && Array.isArray(result[key]) ? result[key] : []).forEach((r) => rows.push({ time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]) }));
        break;
      }
      case "yahoo": {
        const chart = data.chart && data.chart.result && data.chart.result[0], q = chart && chart.indicators && chart.indicators.quote && chart.indicators.quote[0];
        if (chart && q) (chart.timestamp || []).forEach((time, i) => {
          const values = [q.open && q.open[i], q.high && q.high[i], q.low && q.low[i], q.close && q.close[i]].map(Number);
          if (values.every(Number.isFinite)) rows.push({ time: Number(time), open: values[0], high: values[1], low: values[2], close: values[3] });
        });
        break;
      }
    }
    return rows.filter((row) => row.time > 0 && [row.open, row.high, row.low, row.close].every((v) => Number.isFinite(v) && v > 0)).slice(-1000);
  }

  async function candlesFor(assetId, tf, exchange) {
    if (tf === "15s") return shortCandles(assetId, tf);
    const asset = assetById(assetId);
    if (!asset || !["1", "5", "15", "60", "D"].includes(tf)) fail("Некорректный актив или таймфрейм");
    for (const source of sourceList(asset, exchange)) {
      try {
        const candles = await providerCandles(source, tf);
        if (candles.length) return candles;
      } catch (error) { if (exchange) break; }
    }
    return shortCandles(assetId, tf);
  }

  async function exchangeRows(assetId) {
    const asset = assetById(assetId);
    if (!asset) fail("Неизвестный актив");
    return Promise.all((asset.sources || []).map(async (source) => {
      const started = Date.now();
      try {
        const result = await providerQuote(source);
        const ref = result.ref, change = ref ? (result.price - ref) / ref * 100 : null;
        return { id: source.provider, name: (catalog.exchanges || {})[source.provider] || source.provider,
          ok: true, price: result.price, change_pct: change, ms: Date.now() - started };
      } catch (error) {
        return { id: source.provider, name: (catalog.exchanges || {})[source.provider] || source.provider, ok: false };
      }
    }));
  }

  async function ratesResponse() {
    try {
      const data = await getJson("https://open.er-api.com/v6/latest/USD", 30 * 60 * 1000);
      if (data.result !== "success" || !data.rates) throw new Error("Rates unavailable");
      return { rates: { USD: 1, ...data.rates }, live: true };
    } catch (error) { return { rates: { USD: 1 }, live: false }; }
  }

  async function addSpot(body) {
    const ticker = String(body.ticker || "").toUpperCase().replace(/(USDT|USD)$/, "");
    if (!/^[A-Z0-9]{2,12}$/.test(ticker)) fail("Укажи тикер монеты от 2 до 12 символов");
    const existing = assetById(ticker + "SPOT");
    if (existing) return { asset: assetPayload(existing), fut: assetById(ticker + "USD") ? assetPayload(assetById(ticker + "USD")) : null };
    const source = { provider: "binance", symbol: ticker + "USDT" };
    let result;
    try { result = await providerQuote(source); }
    catch (error) { fail("Монета не найдена на Binance или её цена недоступна"); }
    const decimals = result.price >= 100 ? 2 : result.price >= 1 ? 3 : result.price >= 0.01 ? 5 : 8;
    const spot = { id: ticker + "SPOT", name: ticker + "/USD спот", cat: "crypto", tv: "BINANCE:" + ticker + "USDT",
      decimals, title: ticker + " · спот", badge: ticker.slice(0, 1), color: "#5f7a99", market: "spot",
      sim_base: result.price, sources: [source] };
    let fut = assetById(ticker + "USD");
    if (!fut) {
      fut = { ...spot, id: ticker + "USD", name: ticker + "/USD", title: ticker + " · фьючерс", market: "fut" };
      state.customAssets.push(fut);
    }
    state.customAssets.push(spot);
    saveState();
    return { asset: assetPayload(spot), fut: assetPayload(fut) };
  }

  async function getBook(url) {
    const assetId = url.searchParams.get("asset"), asset = assetById(assetId);
    if (!asset || asset.cat !== "crypto") fail("Стакан доступен только для криптовалют");
    const source = sourceList(asset, "binance")[0];
    if (!source) fail("Для этой монеты нет стакана Binance");
    const depth = Math.min(100, Math.max(5, Number(url.searchParams.get("depth")) || 30));
    const futures = asset.market !== "spot";
    const base = futures ? "https://fapi.binance.com/fapi/v1/depth" : "https://api.binance.com/api/v3/depth";
    const data = await getJson(queryUrl(base, { symbol: source.symbol, limit: 100 }), 650);
    if (!Array.isArray(data.bids) || !Array.isArray(data.asks)) fail("Стакан Binance недоступен");
    const quote = await readQuote(assetId, "binance");
    return { ex: "binance", market: asset.market, symbol: source.symbol,
      bids: data.bids.slice(0, depth).map((row) => [Number(row[0]), Number(row[1])]),
      asks: data.asks.slice(0, depth).map((row) => [Number(row[0]), Number(row[1])]),
      ts: nowSeconds(), price: quote.price, exchanges: ["binance"],
      orders: state.orders.filter((order) => order.asset === assetId && order.exchange === "binance").map(orderView) };
  }

  async function marketTrades(url) {
    const assetId = url.searchParams.get("asset"), asset = assetById(assetId), source = asset && sourceList(asset, "binance")[0];
    if (!source || asset.cat !== "crypto") return { ex: "binance", ok: false, trades: [], ver: 0 };
    // лента сделок: для фьючерса сначала фьючерсный Binance (тот же рынок, что и стакан), затем спот и зеркало данных; первый ответивший выигрывает
    const urls = [];
    if (asset.market !== "spot") urls.push(queryUrl("https://fapi.binance.com/fapi/v1/trades", { symbol: source.symbol, limit: 500 }));
    urls.push(queryUrl("https://api.binance.com/api/v3/trades", { symbol: source.symbol, limit: 500 }));
    urls.push(queryUrl("https://data-api.binance.vision/api/v3/trades", { symbol: source.symbol, limit: 500 }));
    let data = null, lastError = null;
    for (const u of urls) {
      try { const d = await getJson(u, 900); if (Array.isArray(d)) { data = d; break; } }
      catch (error) { lastError = error; }
    }
    if (!data) throw lastError || new Error("Лента сделок Binance недоступна");
    const since = Number(url.searchParams.get("since")) || 0;
    const trades = data.map((row) => [Number(row.id), Number(row.time), Number(row.price), Number(row.qty), row.isBuyerMaker ? -1 : 1])
      .filter((row) => Number.isFinite(row[1]) && Number.isFinite(row[2]) && Number.isFinite(row[3]) && (!since || row[1] >= since)).sort((a, b) => a[1] - b[1]);
    return { ex: "binance", ok: true, trades, ver: Date.now() };
  }

  async function api(path, body) {
    await ready();
    const url = new URL(path, location.href), data = body && typeof body === "object" ? body : {};
    switch (url.pathname) {
      case "/api/auth/options": return { registration_enabled: false, admin_setup_enabled: false };
      case "/api/init":
        return { user: { id: "local-demo", name: "Демо на этом устройстве", balance: state.balance, is_admin: false },
          ui: clone(state.ui), assets: allAssets().map(assetPayload), exchanges: catalog.exchanges || {}, config: catalog.config };
      case "/api/tick": return tickResponse(url);
      case "/api/candles": return { candles: await candlesFor(url.searchParams.get("asset"), url.searchParams.get("tf"), url.searchParams.get("ex") || null) };
      case "/api/exchanges": return { exchanges: await exchangeRows(url.searchParams.get("asset")) };
      case "/api/rates": return ratesResponse();
      case "/api/alerts":
        return { alerts: state.alerts.filter((alert) => alert.asset === url.searchParams.get("asset")).sort((a, b) => b.created_at - a.created_at).map(clone) };
      case "/api/alerts/add": {
        const asset = assetById(data.asset), target = Number(data.price), quote = asset && await readQuote(asset.id, null);
        if (!asset || !Number.isFinite(target) || target <= 0) fail("Укажи корректную цену уведомления");
        const alert = { id: state.nextAlertId++, asset: asset.id, target: round(target, asset.decimals),
          above: target > quote.price, comment: String(data.comment || "").trim().slice(0, 100), status: "pending", created_at: nowSeconds() };
        state.alerts.push(alert); saveState(); return { id: alert.id };
      }
      case "/api/alerts/delete": {
        const before = state.alerts.length;
        state.alerts = state.alerts.filter((alert) => alert.id !== Number(data.id));
        if (state.alerts.length !== before) saveState();
        return { ok: true };
      }
      case "/api/spot/add": return addSpot(data);
      case "/api/trade/open": return { trade: await openTrade(data) };
      case "/api/trade/close": return { trade: await closeTrade(data.trade_id) };
      case "/api/trade/levels": return setTradeLevels(data);
      case "/api/history": {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        return { trades: state.trades.filter((trade) => trade.status === "closed").sort((a, b) => b.closed_at - a.closed_at).slice(0, limit).map(clone) };
      }
      case "/api/stats": {
        const grouped = new Map();
        state.trades.filter((trade) => trade.status === "closed").forEach((trade) => {
          const row = grouped.get(trade.asset) || { asset: trade.asset, trades: 0, wins: 0, pnl: 0 };
          row.trades++; if (trade.pnl > 0) row.wins++; row.pnl += trade.pnl; grouped.set(trade.asset, row);
        });
        return { by_asset: [...grouped.values()].map((row) => ({ ...row, pnl: round(row.pnl, 2) })).sort((a, b) => b.trades - a.trades) };
      }
      case "/api/balance/topup":
      {
        const asked = Number(data.amount), amount = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 1e8) : catalog.config.topup_amount;
        state.balance = round(state.balance + amount, 2); saveState();
        return { balance: state.balance, amount };
      }
      case "/api/ui": {
        if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 30000) fail("Некорректные настройки");
        const allowed = new Set(["tabs", "asset", "tf", "indicators", "favorites", "stake", "chart_cfg", "chart_mode", "theme", "currency", "leverage", "pre_levels", "tour_done", "hints", "arb_hints", "anim", "haptic", "theme_custom", "dom"]);
        Object.keys(body).forEach((key) => { if (allowed.has(key)) state.ui[key] = body[key]; });
        saveState(); return { ok: true };
      }
      case "/api/book": return getBook(url);
      case "/api/trades": return marketTrades(url);
      case "/api/orders":
        return { orders: state.orders.filter((order) => !url.searchParams.get("asset") || order.asset === url.searchParams.get("asset")).map(orderView) };
      case "/api/orders/place": return placeOrder(data);
      case "/api/orders/cancel": return cancelOrders(data);
      case "/api/feedback": fail("Отправка отзывов недоступна без сервера"); break;
      case "/api/auth/logout": return { ok: true };
      case "/api/auth/password": fail("У локального демо нет пароля или аккаунта"); break;
      default: fail("Этот раздел недоступен в локальном демо");
    }
  }

  global.LocalDemo = { enabled, api };
})(window);
