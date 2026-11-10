/**
 * Instagram Lock - Content Loader (document_start)
 * Immediately injects a fail-closed, blurred anti-FOUC preloader veil
 * so Instagram content is never visible before authentication verification.
 */

(() => {
  if (document.getElementById('ig-lock-preloader-overlay')) return;

  const style = document.createElement('style');
  style.id = 'ig-lock-preloader-shield';
  style.textContent = `
    #ig-lock-preloader-overlay {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(10, 10, 10, 0.96) !important;
      backdrop-filter: blur(35px) !important;
      -webkit-backdrop-filter: blur(35px) !important;
      z-index: 2147483646 !important;
      pointer-events: auto !important;
      transition: opacity 0.2s ease !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #f5f5f5 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
    #ig-lock-preloader-overlay.ig-lock-fade-out {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  const overlay = document.createElement('div');
  overlay.id = 'ig-lock-preloader-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const target = document.documentElement || document.head;
  if (target) {
    target.appendChild(style);
    target.appendChild(overlay);
  }

  // Register fail-closed fallback inside Isolated World for content-bundle.js
  globalThis.__igLockFailClosed = () => {
    overlay.removeAttribute('aria-hidden');
    overlay.classList.remove('ig-lock-fade-out');
    overlay.innerHTML = `
      <div style="text-align:center;max-width:360px;padding:32px;background:#141414;border:1px solid #2b2b2b;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,0.8);">
        <h2 style="margin:0 0 10px 0;font-size:20px;color:#ffffff;">Instagram Lock Protected</h2>
        <p style="margin:0 0 18px 0;font-size:14px;color:#a0a0a0;line-height:1.45;">
          Extension security shield could not initialize cleanly. Instagram remains locked for your safety.
        </p>
        <button id="ig-lock-fail-reload" style="padding:10px 20px;background:#e1306c;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          Reload Page
        </button>
      </div>
    `;
    const btn = overlay.querySelector('#ig-lock-fail-reload');
    if (btn) {
      btn.addEventListener('click', () => window.location.reload());
    }
  };
})();
