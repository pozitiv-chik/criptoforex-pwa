# CriptoForex PWA

This folder contains the web files extracted from the v113 APK, adapted for iPhone and other browsers.

## What works

- The app runs in local demo mode. Balance, trades, alerts, and preferences are stored in this browser (localStorage, mirrored to IndexedDB, flushed on hide/close) and are not synced to an account.
- It tries public market-data APIs while online. If a source is blocked or unavailable, it shows simulated training prices.
- The app shell, demo catalog, charts library, and icons are cached for offline launch after the first successful visit.
- TradingView widgets and live market data need an internet connection.
- The bundled Lightweight Charts 4.2.0 library is under Apache License 2.0; its license text is included here.

## Publish with GitHub Pages

1. Create a public repository named `criptoforex-pwa`.
2. Upload the contents of this folder to the repository root.
3. In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/(root)`.
4. Wait for GitHub Pages to show the HTTPS address. The service worker requires HTTPS.

## Add to iPhone Home Screen

1. Open the HTTPS address in Safari on the iPhone.
2. Tap **Share → Add to Home Screen**.
3. Keep **Open as Web App** enabled if iOS shows that option, then tap **Add**.

The app needs to be opened once while online so Safari can install the service worker and cache the offline files.

## v117

- Status bar follows the app theme (dynamic `theme-color`, `black-translucent` on iOS). Reinstall the Home Screen icon once so iOS picks up the new status-bar style.
- Analytics screen uses the app theme colors; TradingView widgets are transparent and re-mounted on theme change.
- State persistence: localStorage + IndexedDB mirror, `navigator.storage.persist()`, save on `visibilitychange`/`pagehide`.

## v118

- DOM screen: 📈 button (bottom-left panel) adds a floating price chart over the order book. Drag the header to move, drag the bottom edge to change height, drag the bottom-right corner to resize; double-tap resets. Position/size/timeframe are remembered.

## v119

- Status bar: theme colour is set in <head> before first paint from the saved theme and re-asserted on resume/focus/after load (Android relaunch showed the manifest grey).
- Analytics: TradingView widgets are opaque again with the theme background and matching colour scheme; load watchdog retries and shows a hint if the widget fails to load.
- DOM: floating chart is now candlesticks (drag to scroll, pinch/wheel to zoom, double-tap = latest). The tools panel (rows / price step / chart / to price) has a ⌄ button that collapses it.

## v120

- DOM: the floating chart can now be resized from any of its 4 edges and 4 corners, so width and height are adjusted independently (left/top edges move the window as well). Double-tap on a handle resets the size. Touch hit areas are larger on phones.

## v121

- DOM: the floating chart can be dragged anywhere on the DOM screen (including over the right-hand controls panel), not only over the order book. Saved position was reset (new storage key).
