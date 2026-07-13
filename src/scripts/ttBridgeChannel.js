/**
 * Общая фабрика MAIN↔ISOLATED моста на MessageChannel.
 *
 * Важно: в MAIN world этот файл не должен оставлять API на window —
 * следующий скрипт в том же js[] забирает фабрику в локальную область
 * и сразу удаляет globalThis.__TT_BRIDGE_FACTORY__.
 *
 * Скрипты одного content_scripts.js[] выполняются синхронно подряд,
 * страница между ними не получает управление.
 */
(function (global) {
  'use strict';

  const OFFER_TYPE = 'tundra_toolkit_bridge_offer';
  const HELLO_TYPE = 'tundra_toolkit_bridge_hello';
  const ACK_TYPE = 'tundra_toolkit_bridge_ack';
  const VERSION = 1;

  // Растянутые повторы на ~10с: страница/другой world могут инициализироваться
  // с задержкой, и первых 1-2 попыток может не хватить, чтобы поймать друг друга.
  const RETRY_DELAYS = [ 50, 120, 250, 500, 1000, 2000, 4000, 7000, 10000 ];
  const MAX_OFFERS = RETRY_DELAYS.length + 1;

  /** MAIN → ISOLATED */
  const TO_ISOLATED = new Set([
    'tundra_toolkit_init_data',
    'tundra_toolkit_forum_markers',
    'tundra_toolkit_update_ignore_list',
    'tundra_toolkit_update_topic_ignore_list',
  ]);

  /** ISOLATED → MAIN */
  const TO_MAIN = new Set([
    'tundra_toolkit_init_ignore',
    'tundra_toolkit_init_topic_ignore',
    'tundra_toolkit_ignore_toggle',
    'tundra_toolkit_controls_visibility',
    'tundra_toolkit_insert_sticker',
    'tundra_toolkit_enable_unsafe',
    'tundra_toolkit_disable_unsafe',
    'tundra_toolkit_open_post_counter',
    'tundra_toolkit_request_init',
    'tundra_toolkit_forum_markers_request',
  ]);

  const isIsolatedWorld = () =>
    typeof chrome !== 'undefined' && typeof chrome.runtime?.id === 'string';

  const stripMeta = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const clean = { ...payload };
    delete clean.__tt;
    delete clean.__ttPort;
    return clean;
  };

  const createBridge = (role) => {
    const outboundAllow = role === 'isolated' ? TO_MAIN : TO_ISOLATED;
    const inboundAllow = role === 'isolated' ? TO_ISOLATED : TO_MAIN;

    let port = null;
    let ready = false;
    let acked = false;
    let offerCount = 0;
    const queue = [];
    const listeners = new Set();
    const readyWaiters = new Set();

    const flushReady = () => {
      readyWaiters.forEach((fn) => {
        try { fn(); } catch (e) { /* ignore */ }
      });
      readyWaiters.clear();
    };

    const emit = (data) => {
      listeners.forEach((fn) => {
        try { fn(data); } catch (e) { /* ignore */ }
      });
    };

    const attachPort = (nextPort) => {
      if (!nextPort || port) return false;

      port = nextPort;
      port.start?.();

      port.onmessage = (event) => {
        const data = event?.data;
        if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

        if (data.type === ACK_TYPE) {
          acked = true;
          return;
        }

        if (!inboundAllow.has(data.type)) return;
        emit(data);
      };

      port.onmessageerror = () => {};

      ready = true;
      while (queue.length && port) {
        port.postMessage(queue.shift());
      }
      flushReady();
      return true;
    };

    const post = (payload) => {
      const clean = stripMeta(payload);
      if (!clean || typeof clean.type !== 'string') return false;
      if (!outboundAllow.has(clean.type)) return false;

      if (ready && port) {
        try {
          port.postMessage(clean);
          return true;
        } catch (e) {
          return false;
        }
      }

      queue.push(clean);
      return true;
    };

    const subscribe = (fn) => {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    };

    const whenReady = (fn) => {
      if (typeof fn !== 'function') return;
      if (ready) {
        fn();
        return;
      }
      readyWaiters.add(fn);
    };

    if (role === 'main') {
      const onOffer = (event) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;

        const data = event.data;
        if (!data || data.type !== OFFER_TYPE || data.v !== VERSION) return;

        const offered = event.ports?.[0];
        if (!offered) return;

        // Не отдаём порт слушателям страницы
        event.stopImmediatePropagation();

        if (!attachPort(offered)) return;

        window.removeEventListener('message', onOffer, true);

        try {
          port.postMessage({ type: ACK_TYPE, v: VERSION });
        } catch (e) { /* ignore */ }
      };

      // capture: true — раньше bubble-слушателей страницы
      window.addEventListener('message', onOffer, true);

      // Просим isolated отдать порт (без секретов в сообщении)
      const sendHello = () => {
        if (ready) return;
        try {
          window.postMessage({ type: HELLO_TYPE, v: VERSION }, window.location.origin);
        } catch (e) { /* ignore */ }
      };
      sendHello();
      RETRY_DELAYS.forEach((delay) => setTimeout(sendHello, delay));
    }

    if (role === 'isolated') {
      const offer = () => {
        if (acked) return;
        // Уже ждём ack по текущему порту — не рвём его новым offer
        if (port) return;
        if (offerCount >= MAX_OFFERS) return;

        offerCount += 1;

        const channel = new MessageChannel();
        attachPort(channel.port1);

        try {
          window.postMessage(
            { type: OFFER_TYPE, v: VERSION },
            window.location.origin,
            [channel.port2],
          );
        } catch (e) {
          try { channel.port1.close(); } catch (err) { /* ignore */ }
          port = null;
          ready = false;
        }
      };

      const reofferIfNeeded = () => {
        if (acked) return;
        if (port) {
          try { port.close(); } catch (e) { /* ignore */ }
          port = null;
          ready = false;
        }
        offer();
      };

      const onHello = (event) => {
        if (event.source !== window) return;
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== HELLO_TYPE || data.v !== VERSION) return;
        if (acked) return;
        // Hello до первого offer или после потери — не закрываем живой порт без таймаута
        if (!port) offer();
      };

      window.addEventListener('message', onHello);
      offer();
      // Если MAIN не успел поймать первый offer — мягкий retry с нарастающей задержкой
      RETRY_DELAYS.forEach((delay) => setTimeout(reofferIfNeeded, delay));
    }

    return {
      post,
      subscribe,
      whenReady,
      isReady: () => ready,
      isAcked: () => acked,
      role,
    };
  };

  const role = isIsolatedWorld() ? 'isolated' : 'main';

  global.__TT_BRIDGE_FACTORY__ = {
    createBridge,
    isIsolatedWorld,
    OFFER_TYPE,
    HELLO_TYPE,
    VERSION,
    // Сразу поднимаем мост — capture-listener / offer до следующих скриптов
    bridge: createBridge(role),
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
