/**
 * SBA监测 - iOS PWA 版
 * 100% 复刻 Android 版功能
 */
(function(){
'use strict';

// ─── DOM refs ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const serverUrl = $('serverUrl');
const intervalInput = $('interval');
const btnToggle = $('btnToggle');
const btnRefresh = $('btnRefresh');
const statusText = $('statusText');
const statusDot = $('statusDot');
const container = $('tablesContainer');

// ─── State ──────────────────────────────────────────────────
let running = false;
let timerId = null;

// 5 个数据组定义（与 Android 版完全一致）
const groups = [
  { id:'flux_outliers',   title:'① flux 超出 ±2σ(从大到小)', hl:'flux' },
  { id:'smallest_fluxR',  title:'② fluxR 最小的前100行',     hl:'fluxR' },
  { id:'smallest_co2',    title:'③ co2 最小的前100行',       hl:'co2' },
  { id:'largest_boxh',    title:'④ boxh 最大的前100行',      hl:'boxh' },
  { id:'largest_yacha',   title:'⑤ yacha 最大的前100行',     hl:'yacha' },
];

// 列宽定义（dp → px by CSS, unit=px at 1x）
const colW = {
  recv_time:148, WD:88, AB:44, flux:64, fluxR:56,
  wflux:56, wfluxR:56, co2:56, p:48, boxt:48, boxh:48, yacha:48
};
const skipCol = new Set(['date','client_ip']);

// 缓存的表头（跨请求保持一致）
let cachedHeader = [];

// ─── 构建5张表格卡片 ──────────────────────────────────────
groups.forEach((g, idx) => {
  const card = document.createElement('div');
  card.className = 'table-card';
  card.dataset.idx = idx;

  // 标题行
  const titleRow = document.createElement('div');
  titleRow.className = 'table-title';
  const titleText = document.createElement('span');
  titleText.textContent = g.title;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = '0';
  badge.id = `badge-${idx}`;
  titleRow.appendChild(titleText);
  titleRow.appendChild(badge);

  // 分割线
  const div = document.createElement('div');
  div.className = 'divider';

  // 表格区域
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';

  // 表头行（可横滚）
  const thScroll = document.createElement('div');
  thScroll.className = 'th-scroll';
  thScroll.id = `th-scroll-${idx}`;
  const thRow = document.createElement('div');
  thRow.className = 'th-row';
  thRow.id = `th-row-${idx}`;
  thScroll.appendChild(thRow);

  // 分割线
  const div2 = document.createElement('div');
  div2.className = 'divider';

  // 数据体（横滚+纵滚）
  const tbWrap = document.createElement('div');
  tbWrap.className = 'tb-wrap';
  const tbScroll = document.createElement('div');
  tbScroll.className = 'tb-scroll';
  tbScroll.id = `tb-scroll-${idx}`;
  tbWrap.appendChild(tbScroll);

  wrap.appendChild(thScroll);
  wrap.appendChild(div2);
  wrap.appendChild(tbWrap);

  card.appendChild(titleRow);
  card.appendChild(div);
  card.appendChild(wrap);
  container.appendChild(card);

  // 同步横向滚动
  tbScroll.addEventListener('scroll', () => {
    thScroll.scrollLeft = tbScroll.scrollLeft;
  });
});

// ─── 显示列序（去掉 date/client_ip，强调列提到二位） ────
function dispOrder(header, hlCol) {
  let base = header.map((n,i) => i).filter(i => !skipCol.has(header[i]));
  const recv = header.indexOf('recv_time');
  if (recv === -1) return base;
  const hl = header.indexOf(hlCol);
  const r = [recv];
  if (hl !== recv && hl >= 0) r.push(hl);
  for (const i of base) if (i !== recv && i !== hl) r.push(i);
  return r;
}

// ─── 网络请求（与 Android 完全一致） ─────────────────────
function fetch() {
  const url = serverUrl.value.trim();
  if (!url) return;
  setStatus('正在查询…', false);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.timeout = 10000;
  xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
  xhr.onload = () => {
    if (xhr.status !== 200) {
      setStatus(`请求失败：HTTP ${xhr.status}`, false);
      return;
    }
    try {
      const obj = JSON.parse(xhr.responseText);
      render(obj);
    } catch(e) {
      setStatus(`解析失败：${e.message}`, false);
    }
  };
  xhr.onerror = () => setStatus('请求失败：网络错误', false);
  xhr.ontimeout = () => setStatus('请求失败：超时', false);
  xhr.send('WD=Android_ASK');
}

// ─── 定时器 ─────────────────────────────────────────────────
function toggle() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  if (running) {
    running = false;
    btnToggle.className = 'btn btn-play';
    btnToggle.innerHTML =
      '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg><span>启动</span>';
    setStatus('已停止', false);
    return;
  }
  running = true;
  btnToggle.className = 'btn btn-stop';
  btnToggle.innerHTML =
    '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg><span>停止</span>';
  fetch();
  scheduleNext();
}

function intervalMs() {
  const sec = Math.max(2, parseInt(intervalInput.value, 10) || 60);
  return sec * 1000;
}

function scheduleNext() {
  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(() => {
    fetch();
    if (running) scheduleNext();
  }, intervalMs());
}

function manualRefresh() {
  fetch();
  if (running) {
    if (timerId) clearTimeout(timerId);
    scheduleNext();
  }
}

// ─── 渲染（与 Android 完全一致） ──────────────────────────
function render(obj) {
  const header = cachedHeader = parseHeader(obj.header);
  const total = obj.total_rows || 0;

  // 状态栏
  const file = obj.file || '-';
  const mu = obj.flux_mean;
  const sigma = obj.flux_std;
  const ts = new Date().toLocaleTimeString('zh-CN', {hour12:false});
  let status = `${file}  共 ${total} 行`;
  if (mu != null && !isNaN(mu) && sigma != null && !isNaN(sigma)) {
    status += `  |  flux μ=${Number(mu).toFixed(4)} σ=${Number(sigma).toFixed(4)}`;
  }
  status += `  |  ${ts}`;
  setStatus(status, true);

  // 逐表渲染
  groups.forEach((g, idx) => {
    const order = dispOrder(header, g.hl);
    const hlPos = 1;  // 强调列在显示顺序中固定为下标 1
    const rows = obj[g.id];
    const badge = $(`badge-${idx}`);
    badge.textContent = rows ? rows.length : 0;

    const thRow = $(`th-row-${idx}`);
    const tbScroll = $(`tb-scroll-${idx}`);

    // 清空
    thRow.innerHTML = '';
    tbScroll.innerHTML = '';

    // 表头
    order.forEach((origIdx, pos) => {
      const name = header[origIdx];
      const w = colW[name] || 56;
      const cell = document.createElement('div');
      cell.className = 'th-cell' + (pos === hlPos ? ' hl' : '');
      cell.textContent = name;
      cell.style.width = w + 'px';
      cell.style.minWidth = w + 'px';
      cell.style.maxWidth = w + 'px';
      thRow.appendChild(cell);
    });

    // 数据
    if (!rows || rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = '(无数据)';
      tbScroll.appendChild(empty);
      return;
    }

    // recv_time 逆序排列
    const recvIdx = header.indexOf('recv_time');
    let rowList = Array.from(rows);
    if (recvIdx >= 0) {
      rowList.sort((a,b) => {
        const va = a[recvIdx] || '';
        const vb = b[recvIdx] || '';
        return vb.localeCompare(va);
      });
    }

    rowList.forEach((row, ri) => {
      const tr = document.createElement('div');
      tr.className = 'tr-row';
      // Android: 偶数行是 stripe (index%2==1)
      // tr-row:nth-child(even) already handles this
      order.forEach((origIdx, pos) => {
        const name = header[origIdx];
        const w = colW[name] || 56;
        const val = (origIdx < row.length) ? (row[origIdx] != null ? String(row[origIdx]) : '') : '';
        const cell = document.createElement('div');
        cell.className = 'td-cell' + (pos === hlPos ? ' hl' : '');
        cell.textContent = val;
        cell.style.width = w + 'px';
        cell.style.minWidth = w + 'px';
        cell.style.maxWidth = w + 'px';
        tr.appendChild(cell);
      });
      tbScroll.appendChild(tr);
    });
  });
}

function parseHeader(hdr) {
  if (Array.isArray(hdr)) return hdr;
  if (hdr && typeof hdr === 'object' && hdr.length != null) return Array.from(hdr);
  return cachedHeader;
}

function setStatus(text, ok) {
  statusText.textContent = text;
  statusDot.className = 'dot ' + (ok ? 'dot-green' : 'dot-gray');
}

// ─── 事件绑定 ──────────────────────────────────────────────
btnToggle.addEventListener('click', toggle);
btnRefresh.addEventListener('click', manualRefresh);

// 启动即开始定时查询并立即刷新一次（与 Android 一致）
toggle();

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

})();
