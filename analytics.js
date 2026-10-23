/* ════════════════════════════════════════════════════════════════════════
   A&T — Google Analytics 4 （共享文件，Measurement ID 只在这里维护一处）
   用法：在每个公开页面 <head> 里加： <script src="analytics.js"></script>

   追踪的事件：
     whatsapp_click     按 WhatsApp
     ai_assistant_open  打开 AI 助手
     add_to_cart        加入购物车（8 个产品页统一在这里监听）
     purchase           购物车下单成功（cart.html 呼叫 atTrack）
     generate_lead      招牌询价送出（ant-signboard-order-v2.html 呼叫 atTrack）
   其他页面要送事件：window.atTrack('事件名', { 参数 })
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var ID = 'G-ZHD9GX3W9Q';

  /* 只有正式网站才送资料。本机 localhost、netlify 预览网址的测试都不算，
     不然自己测试的点击、下单会混进真实数据（GA4 的 Direct 被灌水）。
     本机测试时事件印在 console，方便确认有触发。 */
  var LIVE = location.hostname === 'shop.jbsignboard.com';

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }

  if (LIVE) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', ID);
  } else {
    window.gtag = function () {};
  }

  function send(name, params) {
    if (LIVE) gtag('event', name, params || {});
    else if (window.console) console.info('[GA4 测试，未送出]', name, params || {});
  }
  window.atTrack = send;

  // ── WhatsApp 点击（转化信号）──
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
    if (a) send('whatsapp_click', { link_url: a.href, page_path: location.pathname });
  }, true);

  // ── AI 助手按钮被点开 ──
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.atw-fab, #aiFab, .hero-ai-btn');
    if (t) send('ai_assistant_open', { page_path: location.pathname });
  }, true);

  /* ── 加入购物车 ──
     各产品页都把购物车存在 localStorage 的 antCart。
     在这里比对「存之前」和「存之后」：同一种商品（名称 + 单价）数量变多 = 加入购物车。
     只看变多的部分，所以改数量、删除商品都不会被误算。 */
  function totals(list) {
    var t = {};
    (list || []).forEach(function (i) {
      var k = (i.name || '') + '|' + (Number(i.price) || 0);
      if (!t[k]) t[k] = { item_name: i.name || '', price: Number(i.price) || 0, quantity: 0 };
      t[k].quantity += Number(i.qty) || 1;
    });
    return t;
  }
  try {
    var _set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'antCart' && this === window.localStorage) {
        try {
          var before = totals(JSON.parse(this.getItem('antCart') || '[]'));
          var after  = totals(JSON.parse(v || '[]'));
          var added = [], value = 0;
          Object.keys(after).forEach(function (key) {
            var q = after[key].quantity - (before[key] ? before[key].quantity : 0);
            if (q > 0) {
              added.push({ item_name: after[key].item_name, price: after[key].price, quantity: q });
              value += after[key].price * q;
            }
          });
          if (added.length) send('add_to_cart', { currency: 'MYR', value: value, items: added });
        } catch (e) {}
      }
      return _set.apply(this, arguments);
    };
  } catch (e) {}
})();
