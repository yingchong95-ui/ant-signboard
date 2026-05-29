/* ════════════════════════════════════════════════════════════════════════
   A&T — Google Analytics 4 （共享文件，Measurement ID 只在这里维护一处）
   用法：在每个公开页面 <head> 里加： <script src="analytics.js"></script>
   额外：自动追踪 WhatsApp 点击 与 AI 助手打开（自定义事件，方便看转化）。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var ID = 'G-ZHD9GX3W9Q';

  // ── 加载 gtag.js ──
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', ID);

  // ── 自定义事件：WhatsApp 点击（转化信号）──
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    if (a) {
      gtag('event', 'whatsapp_click', {
        link_url: a.href,
        page_path: location.pathname
      });
    }
  }, true);

  // ── 自定义事件：AI 助手按钮被点开 ──
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.atw-fab, #aiFab, .hero-ai-btn');
    if (t) {
      gtag('event', 'ai_assistant_open', { page_path: location.pathname });
    }
  }, true);
})();
