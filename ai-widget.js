/* ════════════════════════════════════════════════════════════════════════
   A&T AI 询价助手 — 可复用聊天组件
   用法：在任意订单页 </body> 前加一行： <script src="ai-widget.js" defer></script>
   功能：浮动按钮 + 聊天面板，连接 /api/gemini（Claude Sonnet + calculate_price 工具），
        可在对话中推荐产品并算出精确价格。所有样式/ID 用 atw- 前缀，避免与页面冲突。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__atwLoaded) return;            // 防重复加载
  window.__atwLoaded = true;

  var WA = 'https://wa.me/60197901150';

  var PRODUCTS = [
    { name: 'Acrylic Printing',            url: 'ant-acrylic-order.html' },
    { name: 'Foamboard Printing',          url: 'ant-foamboard-order.html' },
    { name: 'Inkjet Printing',             url: 'ant-inkjet-order.html' },
    { name: 'Display Set with Printing',   url: 'ant-display-set-order.html' },
    { name: 'Bomba / Fire Safety Signage', url: 'ant-bomba-signage-order.html' },
    { name: 'Custom Signboard',            url: 'ant-signboard-order-v2.html' },
    { name: 'LED Neon Sign',               url: 'ant-neon-order.html' }
  ];

  var SYSTEM_PROMPT =
    '你是 A&T Signboard & Printing 的 AI 询价助手。公司位于 Ulu Tiram (JB)、Subang Jaya (KL) 和 Singapore，主营招牌、印刷、展示产品。\n\n' +
    '产品（可推荐并附链接 [名称](url)）：\n' +
    PRODUCTS.map(function (p) { return '- ' + p.name + '：' + p.url; }).join('\n') + '\n\n' +
    '回答规则：\n' +
    '1. 用简体中文或英文（跟用户语言一致）\n' +
    '2. 闲聊或推荐时简洁（100 字内）；报价时可分行列出明细\n' +
    '3. 用户想知道价格时：先问清必要参数（尺寸、材料、数量、款式、是否安装等），参数齐了再调用 calculate_price 工具算出精确价格，并讲清单价、面积、明细、总价。不要凭空报价\n' +
    '4. 报价后务必说明这是估价，最终以 WhatsApp (+60 19-790 1150) 确认为准\n' +
    '5. 超出产品范围的问题，礼貌说明并引导联系客服';

  var ICON = '<svg viewBox="0 0 28 28" fill="none"><path d="M14 3C14 3 15.5 9.5 19 13C22.5 16.5 26 14 26 14C26 14 22.5 15.5 19 19C15.5 22.5 14 26 14 26C14 26 12.5 22.5 9 19C5.5 15.5 2 14 2 14C2 14 5.5 12.5 9 9C12.5 5.5 14 3 14 3Z" fill="white"/></svg>';

  // ── 样式 ──
  var css = ''
    + '.atw-fab{position:fixed;bottom:84px;right:18px;z-index:9000;width:54px;height:54px;'
    + 'background:linear-gradient(135deg,#4285f4,#1a73e8);border:none;border-radius:50%;cursor:pointer;'
    + 'display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(66,133,244,.45);'
    + 'transition:transform .2s}'
    + '.atw-fab:hover{transform:scale(1.1)}.atw-fab svg{width:26px;height:26px}'
    + '.atw-dot{position:absolute;top:2px;right:2px;width:12px;height:12px;background:#e63946;border-radius:50%;border:2px solid #fff;display:none}'
    + '.atw-dot.on{display:block}'
    + '.atw-panel{position:fixed;bottom:148px;right:18px;z-index:9001;width:360px;max-width:calc(100vw - 2rem);'
    + 'background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(13,31,60,.25),0 0 0 1px rgba(13,31,60,.07);'
    + 'display:flex;flex-direction:column;overflow:hidden;max-height:min(520px,80vh);'
    + 'transform:scale(.9) translateY(20px);opacity:0;pointer-events:none;'
    + 'transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;font-family:inherit}'
    + '.atw-panel.on{transform:scale(1) translateY(0);opacity:1;pointer-events:all}'
    + '.atw-head{background:linear-gradient(135deg,#0d1f3c,#1a3560);padding:14px 16px;display:flex;align-items:center;gap:10px}'
    + '.atw-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#4285f4,#34a853);display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    + '.atw-av svg{width:17px;height:17px}'
    + '.atw-name{font-size:14px;font-weight:700;color:#fff;line-height:1.1}'
    + '.atw-status{font-size:11px;color:rgba(255,255,255,.55)}'
    + '.atw-x{margin-left:auto;background:rgba(255,255,255,.12);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1}'
    + '.atw-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:200px;background:#f6f8fc}'
    + '.atw-msg{display:flex;gap:8px;max-width:88%}.atw-msg.u{align-self:flex-end;flex-direction:row-reverse}'
    + '.atw-msg.b{align-self:flex-start}'
    + '.atw-bub{padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word}'
    + '.atw-msg.b .atw-bub{background:#fff;border:1px solid #e3e7ef;color:#0d1f3c;border-bottom-left-radius:4px}'
    + '.atw-msg.u .atw-bub{background:#1a73e8;color:#fff;border-bottom-right-radius:4px}'
    + '.atw-bub a{color:#1a73e8;text-decoration:underline}.atw-msg.u .atw-bub a{color:#fff}'
    + '.atw-mav{width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#4285f4,#34a853);flex-shrink:0;display:flex;align-items:center;justify-content:center}'
    + '.atw-mav svg{width:12px;height:12px}'
    + '.atw-quick{display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px}'
    + '.atw-q{background:#e8f0fe;border:1px solid rgba(66,133,244,.3);color:#1a73e8;font-size:12px;font-weight:600;padding:5px 11px;border-radius:12px;cursor:pointer;font-family:inherit}'
    + '.atw-q:hover{background:#1a73e8;color:#fff}'
    + '.atw-in{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #e3e7ef}'
    + '.atw-in input{flex:1;border:1px solid #e3e7ef;border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;outline:none}'
    + '.atw-in input:focus{border-color:#1a73e8}'
    + '.atw-send{width:38px;height:38px;background:#1a73e8;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    + '.atw-send svg{width:16px;height:16px;color:#fff}'
    + '.atw-typing span{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9aa3b2;margin:0 1px;animation:atwb .8s infinite}'
    + '.atw-typing span:nth-child(2){animation-delay:.15s}.atw-typing span:nth-child(3){animation-delay:.3s}'
    + '@keyframes atwb{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}'
    + '@media(max-width:600px){.atw-panel{right:12px;left:12px;width:auto;bottom:142px}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── DOM ──
  var fab = document.createElement('button');
  fab.className = 'atw-fab';
  fab.setAttribute('aria-label', '打开 AI 询价助手');
  fab.innerHTML = '<span class="atw-dot" id="atwDot"></span>' + ICON;

  var panel = document.createElement('div');
  panel.className = 'atw-panel';
  panel.innerHTML =
    '<div class="atw-head"><div class="atw-av">' + ICON + '</div>'
    + '<div><div class="atw-name">A&T AI 询价助手</div><div class="atw-status">Powered by Claude · 可在线算价</div></div>'
    + '<button class="atw-x" id="atwX" aria-label="关闭">✕</button></div>'
    + '<div class="atw-msgs" id="atwMsgs"><div class="atw-msg b"><div class="atw-mav">' + ICON + '</div>'
    + '<div class="atw-bub">你好！我是 A&T 的 AI 助手 👋<br>告诉我你要做什么标牌/印刷品，以及尺寸、数量等，我可以帮你推荐并算出价格。</div></div></div>'
    + '<div class="atw-quick" id="atwQuick">'
    + '<button class="atw-q">这个产品怎么算价？</button>'
    + '<button class="atw-q">最小尺寸/起订量？</button>'
    + '<button class="atw-q">有没有安装服务？</button></div>'
    + '<div class="atw-in"><input id="atwInput" type="text" placeholder="输入你的问题…" autocomplete="off" aria-label="输入你的问题"/>'
    + '<button class="atw-send" id="atwSend" aria-label="发送"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var msgs = panel.querySelector('#atwMsgs');
  var input = panel.querySelector('#atwInput');
  var open = false, history = [];

  function toggle() {
    open = !open;
    panel.classList.toggle('on', open);
    document.getElementById('atwDot').classList.remove('on');
    if (open) setTimeout(function () { input.focus(); }, 250);
  }
  function fmt(t) {
    return t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/\n/g, '<br>');
  }
  function add(role, html) {
    var d = document.createElement('div');
    d.className = 'atw-msg ' + (role === 'user' ? 'u' : 'b');
    d.innerHTML = (role === 'user' ? '' : '<div class="atw-mav">' + ICON + '</div>') + '<div class="atw-bub">' + html + '</div>';
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  function typing() {
    var d = add('bot', '<span class="atw-typing"><span></span><span></span><span></span></span>');
    return d;
  }
  async function send() {
    var m = input.value.trim(); if (!m) return;
    input.value = '';
    var q = panel.querySelector('#atwQuick'); if (q) q.style.display = 'none';
    add('user', m.replace(/</g, '&lt;'));
    history.push({ role: 'user', content: m });
    var t = typing();
    try {
      var res = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: SYSTEM_PROMPT, messages: history, max_tokens: 800, enable_pricing: true })
      });
      if (!res.ok) throw new Error('api');
      var data = await res.json();
      var reply = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n') || '抱歉，我暂时无法回答。';
      history.push({ role: 'assistant', content: reply });
      t.remove(); add('bot', fmt(reply));
    } catch (e) {
      t.remove();
      add('bot', '网络繁忙，请稍后再试，或直接 <a href="' + WA + '" target="_blank" rel="noopener">WhatsApp 联系</a> 我们。');
    }
  }

  fab.addEventListener('click', toggle);
  panel.querySelector('#atwX').addEventListener('click', toggle);
  panel.querySelector('#atwSend').addEventListener('click', send);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
  Array.prototype.forEach.call(panel.querySelectorAll('.atw-q'), function (b) {
    b.addEventListener('click', function () { input.value = b.textContent; send(); });
  });
  setTimeout(function () { if (!open) document.getElementById('atwDot').classList.add('on'); }, 4000);
})();
