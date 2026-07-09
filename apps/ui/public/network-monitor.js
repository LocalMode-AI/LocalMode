/**
 * network-monitor.js — vanilla fetch instrumentation for the /blocks toolbar.
 *
 * Loaded as a plain <script> (no bundler / no imports). Patches window.fetch
 * once, records every request into a capped ring buffer, and exposes a tiny
 * pub/sub surface (window.__networkMonitor) that the <NetworkStatus /> React
 * component reads. Writes globals; the React side only reads them.
 *
 * Entry shape:
 *   {
 *     id, timestamp: Date, type: 'download' | 'upload',
 *     url, method, state: 'pending' | 'in-progress' | 'completed' | 'failed',
 *     category, status?, statusText?, responseSize?, duration?, progress?, error?
 *   }
 */
(function () {
  if (typeof window === 'undefined' || window.__networkMonitorInit) return;
  window.__networkMonitorInit = true;

  var MAX_LOGS = 200;

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  window.__networkLogs = [];
  window.__networkListeners = new Set();

  function notify(entry) {
    window.__networkListeners.forEach(function (cb) {
      try {
        cb(entry);
      } catch (e) {
        // A throwing listener must not break the others.
        console.error(e);
      }
    });
  }

  function getCategory(url) {
    if (
      url.includes('huggingface.co') ||
      url.includes('cdn-lfs') ||
      url.includes('storage.googleapis.com/mediapipe')
    ) {
      return 'Model';
    }
    if (url.includes('_next/static') || url.includes('_next/image') || url.includes('_rsc')) {
      return 'App';
    }
    if (url.includes('__nextjs') || url.includes('webpack-hmr') || url.includes('.map')) {
      return 'Dev';
    }
    if (url.includes('/api/')) return 'API';
    if (url.includes('fonts.')) return 'Asset';
    return 'Other';
  }

  var originalFetch = window.fetch;

  window.fetch = function (input, init) {
    var url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    var method = init && init.method ? init.method.toUpperCase() : 'GET';
    var id = genId();
    var startTime = performance.now();

    var entry = {
      id: id,
      timestamp: new Date(),
      type: method === 'GET' || method === 'HEAD' ? 'download' : 'upload',
      url: url,
      method: method,
      state: 'pending',
      category: getCategory(url),
    };

    window.__networkLogs.push(entry);
    if (window.__networkLogs.length > MAX_LOGS) {
      window.__networkLogs = window.__networkLogs.slice(-MAX_LOGS);
    }
    notify(entry);

    entry.state = 'in-progress';
    notify(Object.assign({}, entry));

    return originalFetch.apply(this, arguments).then(
      function (response) {
        var duration = performance.now() - startTime;
        var size = response.headers.get('content-length');

        Object.assign(entry, {
          state: 'completed',
          status: response.status,
          statusText: response.statusText,
          responseSize: size ? parseInt(size, 10) : undefined,
          duration: duration,
          progress: 100,
        });
        notify(Object.assign({}, entry));

        return response;
      },
      function (error) {
        var duration = performance.now() - startTime;

        Object.assign(entry, {
          state: 'failed',
          error: (error && error.message) || String(error),
          duration: duration,
        });
        notify(Object.assign({}, entry));

        throw error;
      }
    );
  };

  window.__networkMonitor = {
    getLogs: function () {
      return window.__networkLogs.slice();
    },
    subscribe: function (cb) {
      window.__networkListeners.add(cb);
      return function () {
        window.__networkListeners.delete(cb);
      };
    },
    clear: function () {
      window.__networkLogs = [];
    },
  };
})();
