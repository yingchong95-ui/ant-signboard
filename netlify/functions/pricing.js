// netlify/functions/pricing.js
// ─────────────────────────────────────────────────────────────────────────
// A&T Signboard — 共享计价模块（聊天 AI 的精准报价用）
// 公式与费率严格对应各订单页的计算器，是 calculate_price 工具的唯一计算源。
// ⚠️ 改价时：这里 + 对应订单页两处都要同步更新。
// ─────────────────────────────────────────────────────────────────────────

const r2 = (n) => Math.round(n * 100) / 100;

// ── 费率表 ────────────────────────────────────────────────────────────────
const INKJET_MATERIALS = {
  'white-vinyl-matt':   { name: 'White vinyl sticker + matt lam',          rate: 8 },
  'white-vinyl-gloss':  { name: 'White vinyl sticker + gloss lam',         rate: 8 },
  'transparent-matt':   { name: 'Transparent sticker + matt lam',          rate: 8 },
  'transparent-gloss':  { name: 'Transparent sticker + gloss lam',         rate: 8 },
  'transparent-reverse':{ name: 'Transparent reverse print + white lam',   rate: 10 },
  'lightbox-sticker':   { name: 'Lightbox sticker + matt lam',             rate: 12 },
  'synthetic-paper':    { name: 'Synthetic paper printing',                rate: 15 },
  'frosted':            { name: 'Frosted sticker printing',                rate: 8 },
  'wall-sticker':       { name: 'Wall sticker + matt lam',                 rate: 12 },
  'grey-base':          { name: 'Grey base sticker + matt lam',            rate: 10 },
};

const FOAMBOARD = {
  sticker:   { name: 'Foamboard with Sticker Printing', rates: { 3: 10, 5: 20, 10: 35 } },
  cutshape:  { name: 'Foamboard Cut to Shape',          rates: { 3: 8,  5: 18, 10: 32 } },
  lettering: { name: 'Foamboard Cut Out Lettering',     rates: { 3: 20, 5: 40, 10: 65 } },
  frame:     { name: 'Foamboard with Silver Frame (5mm)', flatRate: 30 },
};

const ACRYLIC_POSTER = { // size → [frame, posterAddon]
  a5: [40, 20], a4: [55, 25], a3: [90, 40], a2: [200, 50], a1: [350, 60], a0: [550, 80],
};
const ACRYLIC_LIGHTBOX = { '2x2': 500, '3x3': 750, '4x4': 900 }; // + install RM200/pc optional
const ACRYLIC_CUTOUT  = { 3: 35, 5: 60, 10: 120 }; // RM/sqf
const ACRYLIC_SIGNAGE = { 3: 20, 4: 35, 5: 50 };   // RM/sqf

const BOMBA = {
  flat:   { name: 'Flat Wall Signage',  sizes: { '150x150': 40, '200x200': 60 } },
  vshape: { name: 'V Shape Signage',    sizes: { '200x200': 120 } },
  room:   { name: 'Room Name Signage',  sizes: { '250x60': 25 } },
};

const DISPLAY_SET = { // group → variant → price/unit
  rollup:    { standard: 130, deluxe: 210, double: 280, 'double-deluxe': 350 },
  bunting:   { tripod: 50, roundplate: 65 },
  jumbo:     { standard: 400 },
  beachflag: { '3m': 400, '5m': 600 },
  poptable:  { standard: 650 },
  menu:      { single: 300, double: 420 },
  easel:     { a0: 350, a1: 300, a2: 250 },
};

const SIGNBOARD_PRICING = { // [min,max] at 80 sqft (20ft×4ft) reference
  'flat-nonlit': [2300, 3500], 'flat-frontlit': [3300, 5500], 'flat-backlit': [2800, 4000],
  'alum-nonlit': [2800, 4000], 'alum-frontlit': [4000, 6000], 'alum-backlit': [3500, 4800],
  lightbox: [2500, 2500], wall: [1300, 2400],
};

// ── 给 AI 的产品指南（注入工具说明 + 系统提示）────────────────────────────
const PRICING_GUIDE = `你可以调用 calculate_price 工具算出精确价格（与官网下单页同一套公式）。调用前请先把缺少的参数问清楚，不要自己瞎猜尺寸或选项。所有金额单位为马币 RM。

product 取值及所需 params：

1) "inkjet" 喷画（按面积，每片最少计 2 平方尺）
   params: { material, width_ft, height_ft, qty, install_jb }
   material 选项: ${Object.keys(INKJET_MATERIALS).join(', ')}
   install_jb: true=新山区安装(+RM3/sqf)，false=自取/寄送

2) "neon" LED 霓虹灯
   params: { tube_length_m, location, board_width_ft?, board_height_ft? }
   location: "indoor"(RM15/m) 或 "outdoor"(RM28/m)
   选填透明亚克力底板(RM18/sqf)：给 board_width_ft 和 board_height_ft

3) "foamboard" 泡沫板（按面积）
   params: { variant, thickness_mm, width_ft, height_ft, qty }
   variant: sticker / cutshape / lettering / frame
   thickness_mm: 3, 5, 10（frame 银框固定 5mm，无需厚度）

4) "acrylic_poster" 亚克力夹板海报框
   params: { size, qty, with_poster }
   size: a5,a4,a3,a2,a1,a0 ; with_poster: 是否含海报打印

5) "acrylic_lightbox" 亚克力 LED 灯箱
   params: { size, qty, with_install }
   size: 2x2, 3x3, 4x4 ; with_install: 是否含新山区安装(+RM200/pc)

6) "acrylic_cutout" 亚克力切字（含喷漆）
   params: { thickness_mm, width_ft, height_ft, qty } ; thickness_mm: 3,5,10

7) "acrylic_signage" 亚克力招牌（含贴纸）
   params: { thickness_mm, width_ft, height_ft, qty } ; thickness_mm: 3,4,5

8) "bomba" 消防安全标志（固定价）
   params: { type, size, qty }
   type=flat size=150x150|200x200 ; type=vshape size=200x200 ; type=room size=250x60

9) "display_set" 展示架（可多件求和）
   params: { items: [ { group, variant, qty } ] }
   group/variant: rollup(standard/deluxe/double/double-deluxe), bunting(tripod/roundplate),
   jumbo(standard), beachflag(3m/5m), poptable(standard), menu(single/double), easel(a0/a1/a2)

10) "signboard" 定制招牌（给出价格区间，按面积缩放）
   params: { board, light, width_ft, height_ft }
   board: flat / alum / lightbox / wall
   light: frontlit / backlit / nonlit （lightbox 和 wall 不需要 light）

得到结果后，用自然语言把单价、面积、明细和总价讲清楚，并提醒这是估价、最终以 WhatsApp (+60 19-790 1150) 确认为准。`;

const PRODUCT_ENUM = [
  'inkjet', 'neon', 'foamboard', 'acrylic_poster', 'acrylic_lightbox',
  'acrylic_cutout', 'acrylic_signage', 'bomba', 'display_set', 'signboard',
];

// ── 计算器 ───────────────────────────────────────────────────────────────
function err(msg, needed) { return { ok: false, error: msg, needed: needed || [] }; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
function posInt(v) { const n = parseInt(v, 10); return (isNaN(n) || n < 1) ? 1 : n; }

function calculatePrice(product, params) {
  params = params || {};
  try {
    switch (product) {
      case 'inkjet': {
        const mat = INKJET_MATERIALS[String(params.material || '').toLowerCase()];
        if (!mat) return err('material 无效', ['material(' + Object.keys(INKJET_MATERIALS).join('/') + ')']);
        const w = num(params.width_ft), h = num(params.height_ft);
        if (!w || !h) return err('需要尺寸', ['width_ft', 'height_ft']);
        const qty = posInt(params.qty);
        const installRate = params.install_jb ? 3 : 0;
        const sqfPc = w * h;
        const minApplied = sqfPc < 2;
        const billable = Math.max(sqfPc, 2) * qty;
        const printCost = billable * mat.rate;
        const installCost = billable * installRate;
        const total = printCost + installCost;
        const lines = [
          ['Material', mat.name + ' (RM' + mat.rate + '/sqf)'],
          ['Size', w + 'ft × ' + h + 'ft = ' + r2(sqfPc) + ' sqf/pc' + (minApplied ? ' (min 2 sqf applied)' : '')],
          ['Billable area', r2(billable) + ' sqf × ' + qty + ' pc(s)'],
          ['Print cost', 'RM ' + r2(printCost)],
        ];
        if (installRate) lines.push(['Installation (JB)', 'RM ' + r2(installCost)]);
        return { ok: true, currency: 'RM', total: r2(total), lines };
      }
      case 'neon': {
        const len = num(params.tube_length_m);
        if (!len || len <= 0) return err('需要灯管长度', ['tube_length_m']);
        const loc = String(params.location || '').toLowerCase();
        const rate = loc === 'outdoor' ? 28 : loc === 'indoor' ? 15 : null;
        if (!rate) return err('需要 location', ['location(indoor/outdoor)']);
        const neonCost = len * rate;
        const lines = [['Neon tube', len + ' m × RM' + rate + '/m = RM ' + r2(neonCost)]];
        let total = neonCost;
        const bw = num(params.board_width_ft), bh = num(params.board_height_ft);
        if (bw && bh) {
          const boardCost = bw * bh * 18;
          lines.push(['Clear acrylic board', bw + 'ft × ' + bh + 'ft = RM ' + r2(boardCost)]);
          total += boardCost;
        }
        return { ok: true, currency: 'RM', total: r2(total), lines };
      }
      case 'foamboard': {
        const v = FOAMBOARD[String(params.variant || '').toLowerCase()];
        if (!v) return err('variant 无效', ['variant(sticker/cutshape/lettering/frame)']);
        const w = num(params.width_ft), h = num(params.height_ft);
        if (!w || !h) return err('需要尺寸', ['width_ft', 'height_ft']);
        const qty = posInt(params.qty);
        let rate, thickLabel;
        if (v.flatRate) { rate = v.flatRate; thickLabel = '5mm (fixed)'; }
        else {
          const t = parseInt(params.thickness_mm, 10);
          rate = v.rates[t];
          if (!rate) return err('厚度无效', ['thickness_mm(3/5/10)']);
          thickLabel = t + 'mm';
        }
        const sqf = w * h, total = sqf * rate * qty;
        return { ok: true, currency: 'RM', total: r2(total), lines: [
          [v.name, thickLabel + ' · RM' + rate + '/sqf'],
          ['Size', w + 'ft × ' + h + 'ft = ' + r2(sqf) + ' sqf × ' + qty + ' pc(s)'],
        ] };
      }
      case 'acrylic_poster': {
        const sz = ACRYLIC_POSTER[String(params.size || '').toLowerCase()];
        if (!sz) return err('size 无效', ['size(a5..a0)']);
        const qty = posInt(params.qty);
        const frameCost = sz[0] * qty;
        const withPoster = !!params.with_poster;
        const posterCost = withPoster ? sz[1] * qty : 0;
        const lines = [['Frame (' + String(params.size).toUpperCase() + ')', 'RM' + sz[0] + ' × ' + qty + ' = RM ' + r2(frameCost)]];
        if (withPoster) lines.push(['Poster printing', 'RM' + sz[1] + ' × ' + qty + ' = RM ' + r2(posterCost)]);
        return { ok: true, currency: 'RM', total: r2(frameCost + posterCost), lines };
      }
      case 'acrylic_lightbox': {
        const price = ACRYLIC_LIGHTBOX[String(params.size || '').toLowerCase()];
        if (!price) return err('size 无效', ['size(2x2/3x3/4x4)']);
        const qty = posInt(params.qty);
        const unit = price * qty;
        const withInstall = !!params.with_install;
        const install = withInstall ? 200 * qty : 0;
        const lines = [['Lightbox ' + params.size, 'RM' + price + ' × ' + qty + ' = RM ' + r2(unit)]];
        if (withInstall) lines.push(['Installation (JB)', 'RM200 × ' + qty + ' = RM ' + r2(install)]);
        return { ok: true, currency: 'RM', total: r2(unit + install), lines };
      }
      case 'acrylic_cutout':
      case 'acrylic_signage': {
        const table = product === 'acrylic_cutout' ? ACRYLIC_CUTOUT : ACRYLIC_SIGNAGE;
        const t = parseInt(params.thickness_mm, 10);
        const rate = table[t];
        if (!rate) return err('厚度无效', ['thickness_mm(' + Object.keys(table).join('/') + ')']);
        const w = num(params.width_ft), h = num(params.height_ft);
        if (!w || !h) return err('需要尺寸', ['width_ft', 'height_ft']);
        const qty = posInt(params.qty);
        const sqf = w * h, total = sqf * rate * qty;
        const label = product === 'acrylic_cutout' ? 'Acrylic Cut Out Lettering' : 'Acrylic Signage';
        return { ok: true, currency: 'RM', total: r2(total), lines: [
          [label, t + 'mm · RM' + rate + '/sqf'],
          ['Size', w + 'ft × ' + h + 'ft = ' + r2(sqf) + ' sqf × ' + qty + ' pc(s)'],
        ] };
      }
      case 'bomba': {
        const cat = BOMBA[String(params.type || '').toLowerCase()];
        if (!cat) return err('type 无效', ['type(flat/vshape/room)']);
        const price = cat.sizes[String(params.size || '').toLowerCase()];
        if (!price) return err('size 无效', ['size(' + Object.keys(cat.sizes).join('/') + ')']);
        const qty = posInt(params.qty);
        return { ok: true, currency: 'RM', total: r2(price * qty), lines: [
          [cat.name, params.size + ' · RM' + price + ' × ' + qty + ' pc(s)'],
        ] };
      }
      case 'display_set': {
        const items = Array.isArray(params.items) ? params.items : (params.group ? [params] : null);
        if (!items || !items.length) return err('需要 items 列表', ['items[{group,variant,qty}]']);
        const lines = []; let total = 0;
        for (const it of items) {
          const grp = DISPLAY_SET[String(it.group || '').toLowerCase()];
          if (!grp) return err('group 无效: ' + it.group, ['group(' + Object.keys(DISPLAY_SET).join('/') + ')']);
          const price = grp[String(it.variant || '').toLowerCase()];
          if (!price) return err('variant 无效: ' + it.variant + ' (' + it.group + ')', ['variant(' + Object.keys(grp).join('/') + ')']);
          const qty = posInt(it.qty);
          const sub = price * qty; total += sub;
          lines.push([it.group + ' / ' + it.variant, 'RM' + price + ' × ' + qty + ' = RM ' + r2(sub)]);
        }
        return { ok: true, currency: 'RM', total: r2(total), lines };
      }
      case 'signboard': {
        const board = String(params.board || '').toLowerCase();
        let key;
        if (board === 'lightbox') key = 'lightbox';
        else if (board === 'wall') key = 'wall';
        else if (board === 'flat' || board === 'alum') key = board + '-' + String(params.light || '').toLowerCase();
        else return err('board 无效', ['board(flat/alum/lightbox/wall)']);
        const base = SIGNBOARD_PRICING[key];
        if (!base) return err('需要 light（frontlit/backlit/nonlit）', ['light']);
        const w = num(params.width_ft), h = num(params.height_ft);
        if (!w || !h) return err('需要尺寸', ['width_ft', 'height_ft']);
        const sqft = w * h, ratio = sqft / 80;
        const min = Math.round(base[0] * ratio / 100) * 100;
        const max = Math.round(base[1] * ratio / 100) * 100;
        return { ok: true, currency: 'RM', isRange: true, min, max,
          total: min === max ? min : null,
          lines: [
            ['Type', key],
            ['Size', w + 'ft × ' + h + 'ft = ' + r2(sqft) + ' sq ft (ref 80 sq ft)'],
            ['Estimate', min === max ? ('RM ' + min) : ('RM ' + min + ' — RM ' + max)],
          ] };
      }
      default:
        return err('未知 product: ' + product, ['product(' + PRODUCT_ENUM.join('/') + ')']);
    }
  } catch (e) {
    return err('计算出错: ' + e.message);
  }
}

module.exports = { calculatePrice, PRICING_GUIDE, PRODUCT_ENUM };
