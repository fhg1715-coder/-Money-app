// ── Storage ──────────────────────────────────────────────
const DB = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

const uid = () => Math.random().toString(36).slice(2, 10);

// ── State ────────────────────────────────────────────────
let accounts = DB.get('accounts');
let cards    = DB.get('cards');
let records  = DB.get('records');
let goal     = parseInt(localStorage.getItem('goal')) || 100000;
let firebaseUrl = localStorage.getItem('firebase-url') || '';
let syncPin     = localStorage.getItem('sync-pin') || '';

function save() {
  DB.set('accounts', accounts);
  DB.set('cards', cards);
  DB.set('records', records);
  localStorage.setItem('goal', goal);
  localStorage.setItem('last-saved', new Date().toISOString());
  cloudSave();
}

// ── Cloud Sync (Firebase REST API) ───────────────────────
async function cloudSave() {
  if (!firebaseUrl || !syncPin) return;
  try {
    const data = { accounts, cards, records, goal, savedAt: new Date().toISOString() };
    await fetch(`${firebaseUrl}/backups/${syncPin}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    updateSyncStatus('✅ 已同步');
  } catch(e) {
    updateSyncStatus('⚠️ 同步失敗');
  }
}

async function cloudLoad() {
  if (!firebaseUrl || !syncPin) return false;
  try {
    const res = await fetch(`${firebaseUrl}/backups/${syncPin}.json`);
    const data = await res.json();
    if (!data || !data.accounts) return false;
    accounts = data.accounts || [];
    cards    = data.cards    || [];
    records  = data.records  || [];
    goal     = parseInt(data.goal) || 100000;
    DB.set('accounts', accounts);
    DB.set('cards', cards);
    DB.set('records', records);
    localStorage.setItem('goal', goal);
    localStorage.setItem('last-saved', data.savedAt);
    updateSyncStatus('✅ 已同步');
    return true;
  } catch(e) { return false; }
}

function updateSyncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 3000); }
}

// ── Navigation ───────────────────────────────────────────
const pages = document.querySelectorAll('.page');
const navItems = document.querySelectorAll('.nav-item');

function goTo(id) {
  pages.forEach(p => p.classList.toggle('active', p.id === id));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === id));
  if (id === 'page-home') renderHome();
  if (id === 'page-accounts') renderAccounts();
  if (id === 'page-cards') renderCards();
  if (id === 'page-history') renderHistory();
}

navItems.forEach(n => n.addEventListener('click', () => goTo(n.dataset.page)));

// ── Sheets ───────────────────────────────────────────────
function openSheet(id) {
  document.getElementById(id).classList.add('open');
}
function closeSheet(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.sheet-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) closeSheet(el.id);
  });
});

// ── Helpers ──────────────────────────────────────────────
function formatAmount(n) {
  return Number(n).toLocaleString('zh-TW');
}

function accountTypeLabel(t) {
  const map = { savings: '存款帳戶', checking: '薪轉帳戶', investment: '證券帳戶', stock: '股票', cash: '現金', other: '其他' };
  return map[t] || t;
}

// 是否為投資型帳戶（有市值／股數／成本／損益）
function isInvestType(t) { return t === 'investment' || t === 'stock'; }

// 本月結餘 = 資產總額 − 已登錄信用卡費
function recordNet(r) { return r.total - (r.totalCardFees || 0); }

function thisYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYearMonth(ym) {
  const [y, m] = ym.split('-');
  return `${y} 年 ${parseInt(m)} 月`;
}

// ── Page: Home ───────────────────────────────────────────
function renderHome() {
  const ym = thisYearMonth();
  const latest = records.filter(r => r.ym === ym)[0];
  const totalEl = document.getElementById('home-total');
  const chipRow = document.getElementById('home-chips');
  const recordBtn = document.getElementById('home-record-btn');

  const goalEl = document.getElementById('home-goal');
  if (latest) {
    const net = recordNet(latest);
    totalEl.textContent = `NT$ ${formatAmount(net)}`;
    let chipsHtml = accounts.map(a => {
      const val = latest.balances[a.id] ?? 0;
      return `<div class="chip">${a.name} <span>${formatAmount(val)}</span></div>`;
    }).join('');
    if (latest.totalCardFees > 0) {
      chipsHtml += `<div class="chip" style="background:#fff3e0;color:#e65100">信用卡費 <span style="color:#e65100">-${formatAmount(latest.totalCardFees)}</span></div>`;
    }
    chipRow.innerHTML = chipsHtml;
    recordBtn.textContent = '更新本月記錄';

    // 進度條（以結餘計算）
    const pct = Math.min((net / goal) * 100, 100).toFixed(1);
    const done = net >= goal;
    const remaining = goal - net;
    goalEl.innerHTML = `
      <div class="progress-wrap">
        <div class="progress-meta">
          <span>目標 NT$ ${formatAmount(goal)}</span>
          <span>${done ? '🎉 已達標！' : `還差 NT$ ${formatAmount(remaining)}`}</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill ${done ? 'done' : ''}" style="width:${pct}%"></div>
        </div>
      </div>`;
  } else {
    totalEl.textContent = '尚未記錄';
    chipRow.innerHTML = '';
    recordBtn.textContent = '記錄本月資產';
    if (goal > 0) {
      goalEl.innerHTML = `
        <div class="progress-wrap">
          <div class="progress-meta">
            <span>目標 NT$ ${formatAmount(goal)}</span>
            <span style="color:var(--muted)">記錄本月資產後顯示進度</span>
          </div>
          <div class="progress-bg"><div class="progress-fill" style="width:0%"></div></div>
        </div>`;
    } else {
      goalEl.innerHTML = '';
    }
  }

  scheduleReminders();
  renderMiniChart();
}

document.getElementById('home-record-btn').addEventListener('click', openRecordSheet);

// ── Record Sheet ─────────────────────────────────────────
function openRecordSheet() {
  const body = document.getElementById('record-inputs');
  const ym = thisYearMonth();
  const existing = records.find(r => r.ym === ym);

  document.getElementById('record-title').textContent = `記錄 ${formatYearMonth(ym)}`;
  document.getElementById('record-note').value = existing?.note || '';

  body.innerHTML = accounts.length === 0
    ? '<p style="color:var(--muted);text-align:center;padding:16px 0">請先新增帳戶</p>'
    : accounts.map(a => `
      <div class="form-group">
        <label class="form-label">${a.name}（${accountTypeLabel(a.type)}）</label>
        <input class="form-input" type="number" inputmode="numeric"
          placeholder="${isInvestType(a.type) ? '目前市值' : '帳戶餘額'}"
          data-account-id="${a.id}"
          value="${existing ? (existing.balances[a.id] ?? '') : ''}">
        ${isInvestType(a.type) ? `
        <input class="form-input" type="number" inputmode="numeric" placeholder="持有股數（選填）"
          style="margin-top:6px;background:#f0f4ff;border-color:#c7d7ff"
          data-shares-id="${a.id}"
          value="${existing?.shares ? (existing.shares[a.id] ?? '') : ''}">
        <input class="form-input" type="number" inputmode="numeric" placeholder="投入成本（選填）"
          style="margin-top:6px;background:#f0f4ff;border-color:#c7d7ff"
          data-cost-id="${a.id}"
          value="${existing?.costBases ? (existing.costBases[a.id] ?? '') : ''}">
        ` : ''}
        <input class="form-input" type="number" inputmode="numeric" placeholder="信用卡費（選填）"
          style="margin-top:6px;background:#fff8f0;border-color:#ffe4c4"
          data-fee-id="${a.id}"
          value="${existing?.cardFees ? (existing.cardFees[a.id] ?? '') : ''}">
      </div>
    `).join('');

  openSheet('sheet-record');
}

document.getElementById('record-save-btn').addEventListener('click', () => {
  const balanceInputs = document.querySelectorAll('#record-inputs input[data-account-id]');
  const feeInputs    = document.querySelectorAll('#record-inputs input[data-fee-id]');
  const costInputs   = document.querySelectorAll('#record-inputs input[data-cost-id]');
  const sharesInputs = document.querySelectorAll('#record-inputs input[data-shares-id]');
  const balances = {}, cardFees = {}, costBases = {}, shares = {};
  let total = 0, totalCardFees = 0;

  balanceInputs.forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    balances[inp.dataset.accountId] = val;
    total += val;
  });
  feeInputs.forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    if (val > 0) cardFees[inp.dataset.feeId] = val;
    totalCardFees += val;
  });
  costInputs.forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    if (val > 0) costBases[inp.dataset.costId] = val;
  });
  sharesInputs.forEach(inp => {
    const val = parseFloat(inp.value) || 0;
    if (val > 0) shares[inp.dataset.sharesId] = val;
  });

  const note = document.getElementById('record-note').value.trim();
  const ym = thisYearMonth();
  const idx = records.findIndex(r => r.ym === ym);
  const rec = { id: uid(), ym, balances, total, cardFees, totalCardFees, costBases, shares, note, updatedAt: new Date().toISOString() };
  if (idx >= 0) records[idx] = rec; else records.push(rec);
  records.sort((a, b) => b.ym.localeCompare(a.ym));
  save();
  closeSheet('sheet-record');
  renderHome();
});

document.getElementById('record-cancel-btn').addEventListener('click', () => closeSheet('sheet-record'));

// ── Mini chart (home) ─────────────────────────────────────
function renderMiniChart() {
  const canvas = document.getElementById('home-chart');
  const wrap = canvas.parentElement;
  if (records.length < 2) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  const sorted = [...records].sort((a, b) => a.ym.localeCompare(b.ym)).slice(-12);
  const labels = sorted.map(r => {
    const [, m] = r.ym.split('-');
    return `${parseInt(m)}月`;
  });
  const data = sorted.map(r => recordNet(r));

  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth || 350;
  const H = 160;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padL = 52, padR = 16, padT = 16, padB = 32;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const min = Math.min(...data) * 0.95;
  const max = Math.max(...data) * 1.05;

  const xStep = cW / (data.length - 1);
  const yScale = v => padT + cH - ((v - min) / (max - min)) * cH;

  // grid lines
  ctx.strokeStyle = '#e5e5ea';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (cH / 3) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const val = max - ((max - min) / 3) * i;
    ctx.fillStyle = '#86868b';
    ctx.font = `${11 * dpr / dpr}px -apple-system`;
    ctx.textAlign = 'right';
    ctx.fillText(val >= 10000 ? (val / 10000).toFixed(0) + '萬' : val.toFixed(0), padL - 6, y + 4);
  }

  // gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  grad.addColorStop(0, 'rgba(0,113,227,0.15)');
  grad.addColorStop(1, 'rgba(0,113,227,0)');
  ctx.beginPath();
  ctx.moveTo(padL, yScale(data[0]));
  data.forEach((v, i) => ctx.lineTo(padL + i * xStep, yScale(v)));
  ctx.lineTo(padL + (data.length - 1) * xStep, padT + cH);
  ctx.lineTo(padL, padT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.strokeStyle = '#0071e3';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  data.forEach((v, i) => {
    if (i === 0) ctx.moveTo(padL + i * xStep, yScale(v));
    else ctx.lineTo(padL + i * xStep, yScale(v));
  });
  ctx.stroke();

  // dots + labels
  labels.forEach((lbl, i) => {
    const x = padL + i * xStep;
    const y = yScale(data[i]);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0071e3';
    ctx.fill();
    ctx.fillStyle = '#86868b';
    ctx.font = `${11}px -apple-system`;
    ctx.textAlign = 'center';
    ctx.fillText(lbl, x, H - 6);
  });
}

// ── Drag Sort ────────────────────────────────────────────
function initDragSort(wrapperEl) {
  let dragging = null;

  wrapperEl.addEventListener('touchstart', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    dragging = handle.closest('.list-item');
    dragging.classList.add('is-dragging');
  }, { passive: false });

  wrapperEl.addEventListener('touchmove', e => {
    if (!dragging) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    const siblings = [...wrapperEl.querySelectorAll('.list-item:not(.is-dragging)')];
    const after = siblings.find(s => {
      const box = s.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    if (after) wrapperEl.insertBefore(dragging, after);
    else wrapperEl.appendChild(dragging);
  }, { passive: false });

  wrapperEl.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    const ids = [...wrapperEl.querySelectorAll('.list-item')].map(el => el.dataset.id);
    const reordered = ids.map(id => accounts.find(a => a.id === id)).filter(Boolean);
    accounts.length = 0;
    reordered.forEach(a => accounts.push(a));
    save();
    dragging = null;
  });
}

// ── Page: Accounts ───────────────────────────────────────
function renderAccounts() {
  const list = document.getElementById('accounts-list');
  const total = accounts.reduce((s, a) => {
    const latest = [...records].sort((x, y) => y.ym.localeCompare(x.ym))[0];
    return s + (latest ? (latest.balances[a.id] || 0) : 0);
  }, 0);

  document.getElementById('accounts-total').textContent = `NT$ ${formatAmount(total)}`;

  if (accounts.length === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🏦</div><p>還沒有帳戶<br>點右上角 + 新增</p></div>`;
    return;
  }

  const latest = [...records].sort((a, b) => b.ym.localeCompare(a.ym))[0];
  list.innerHTML = `<div class="list-wrapper" id="accounts-sortable">` + accounts.map(a => {
    const bal = latest ? (latest.balances[a.id] ?? null) : null;
    return `
      <div class="list-item" data-id="${a.id}" onclick="openEditAccount('${a.id}')">
        <span class="drag-handle" onclick="event.stopPropagation()">☰</span>
        <div class="item-left" style="flex:1">
          <span class="item-name">${a.name}</span>
          <span class="item-sub">${accountTypeLabel(a.type)}</span>
        </div>
        <div class="item-right">
          <span class="item-amount">${bal !== null ? 'NT$ ' + formatAmount(bal) : '—'}</span>
          <span class="item-chevron">›</span>
        </div>
      </div>
    `;
  }).join('') + `</div>`;

  const sortable = document.getElementById('accounts-sortable');
  if (sortable) initDragSort(sortable);
}

// Add account
document.getElementById('account-add-btn').addEventListener('click', () => {
  document.getElementById('account-sheet-title').textContent = '新增帳戶';
  document.getElementById('account-name-input').value = '';
  document.getElementById('account-type-select').value = 'savings';
  document.getElementById('account-delete-btn').style.display = 'none';
  document.getElementById('account-save-btn').dataset.editId = '';
  openSheet('sheet-account');
});

function openEditAccount(id) {
  const a = accounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('account-sheet-title').textContent = '編輯帳戶';
  document.getElementById('account-name-input').value = a.name;
  document.getElementById('account-type-select').value = a.type;
  document.getElementById('account-delete-btn').style.display = 'block';
  document.getElementById('account-save-btn').dataset.editId = id;
  openSheet('sheet-account');
}

document.getElementById('account-save-btn').addEventListener('click', () => {
  const name = document.getElementById('account-name-input').value.trim();
  const type = document.getElementById('account-type-select').value;
  if (!name) return;
  const editId = document.getElementById('account-save-btn').dataset.editId;
  if (editId) {
    const a = accounts.find(x => x.id === editId);
    if (a) { a.name = name; a.type = type; }
  } else {
    accounts.push({ id: uid(), name, type });
  }
  save();
  closeSheet('sheet-account');
  renderAccounts();
});

document.getElementById('account-delete-btn').addEventListener('click', () => {
  const id = document.getElementById('account-save-btn').dataset.editId;
  if (!id) return;
  if (!confirm('確定刪除此帳戶？')) return;
  accounts = accounts.filter(a => a.id !== id);
  save();
  closeSheet('sheet-account');
  renderAccounts();
});

document.getElementById('account-cancel-btn').addEventListener('click', () => closeSheet('sheet-account'));

// ── Page: Cards ──────────────────────────────────────────
function renderCards() {
  const list = document.getElementById('cards-list');
  if (cards.length === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">💳</div><p>還沒有信用卡<br>點右上角 + 新增</p></div>`;
    return;
  }
  list.innerHTML = `<div class="list-wrapper">` + cards.map(c => `
    <div class="list-item" onclick="openEditCard('${c.id}')">
      <div class="item-left">
        <span class="item-name">${c.name}</span>
        <div style="display:flex;gap:6px;margin-top:4px">
          <span class="badge badge-blue">帳單日 ${c.billingDay} 日</span>
          <span class="badge badge-orange">繳費日 ${c.dueDay} 日</span>
        </div>
      </div>
      <span class="item-chevron">›</span>
    </div>
  `).join('') + `</div>`;
}

document.getElementById('card-add-btn').addEventListener('click', () => {
  document.getElementById('card-sheet-title').textContent = '新增信用卡';
  document.getElementById('card-name-input').value = '';
  document.getElementById('card-billing-input').value = '';
  document.getElementById('card-due-input').value = '';
  document.getElementById('card-delete-btn').style.display = 'none';
  document.getElementById('card-save-btn').dataset.editId = '';
  openSheet('sheet-card');
});

function openEditCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c) return;
  document.getElementById('card-sheet-title').textContent = '編輯信用卡';
  document.getElementById('card-name-input').value = c.name;
  document.getElementById('card-billing-input').value = c.billingDay;
  document.getElementById('card-due-input').value = c.dueDay;
  document.getElementById('card-delete-btn').style.display = 'block';
  document.getElementById('card-save-btn').dataset.editId = id;
  openSheet('sheet-card');
}

document.getElementById('card-save-btn').addEventListener('click', () => {
  const name = document.getElementById('card-name-input').value.trim();
  const billingDay = parseInt(document.getElementById('card-billing-input').value);
  const dueDay = parseInt(document.getElementById('card-due-input').value);
  if (!name || !billingDay || !dueDay) return;
  const editId = document.getElementById('card-save-btn').dataset.editId;
  if (editId) {
    const c = cards.find(x => x.id === editId);
    if (c) { c.name = name; c.billingDay = billingDay; c.dueDay = dueDay; }
  } else {
    cards.push({ id: uid(), name, billingDay, dueDay });
  }
  save();
  closeSheet('sheet-card');
  renderCards();
});

document.getElementById('card-delete-btn').addEventListener('click', () => {
  const id = document.getElementById('card-save-btn').dataset.editId;
  if (!id) return;
  if (!confirm('確定刪除此信用卡？')) return;
  cards = cards.filter(c => c.id !== id);
  save();
  closeSheet('sheet-card');
  renderCards();
});

document.getElementById('card-cancel-btn').addEventListener('click', () => closeSheet('sheet-card'));

// ── Page: History ────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  if (records.length === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><p>還沒有記錄<br>從總覽頁面新增</p></div>`;
    return;
  }
  const sorted = [...records].sort((a, b) => b.ym.localeCompare(a.ym));
  list.innerHTML = `<div class="list-wrapper">` + sorted.map(r => {
    const prev = sorted.find(x => x.ym < r.ym);
    const diff = prev ? recordNet(r) - recordNet(prev) : null;
    const diffStr = diff !== null
      ? `<span style="color:${diff >= 0 ? '#30d158' : '#ff3b30'}">${diff >= 0 ? '+' : ''}NT$ ${formatAmount(diff)}</span>`
      : '';
    return `
      <div class="list-item" onclick="openHistoryDetail('${r.ym}')">
        <div class="item-left">
          <span class="item-name">${formatYearMonth(r.ym)}</span>
          <span class="item-sub">${diffStr || '無上月比較'}</span>
        </div>
        <div class="item-right">
          <span class="item-amount">NT$ ${formatAmount(recordNet(r))}</span>
          <span class="item-chevron">›</span>
        </div>
      </div>
    `;
  }).join('') + `</div>`;

  // 顯示有備註的記錄標記
  document.querySelectorAll('#history-list .list-item').forEach((el, i) => {
    const r = sorted[i];
    if (r?.note) {
      const sub = el.querySelector('.item-sub');
      if (sub) sub.innerHTML += ` &nbsp;📝`;
    }
  });
}

function openHistoryDetail(ym) {
  const r = records.find(x => x.ym === ym);
  if (!r) return;
  document.getElementById('history-detail-title').textContent = formatYearMonth(ym);
  const body = document.getElementById('history-detail-body');
  const hasCardFees = r.totalCardFees > 0;
  body.innerHTML = accounts.map(a => {
    const bal = r.balances[a.id];
    const fee = r.cardFees?.[a.id];
    const cost = r.costBases?.[a.id];
    if (bal === undefined && !fee) return '';

    const shareCount = r.shares?.[a.id];
    let investHtml = '';
    if (isInvestType(a.type)) {
      if (shareCount) {
        investHtml += `
          <div class="card-row" style="margin-top:3px">
            <span style="font-size:12px;color:var(--muted)">持有股數</span>
            <span style="font-size:13px;color:var(--muted)">${shareCount.toLocaleString()} 股</span>
          </div>`;
      }
      if (cost) {
        const pnl = bal - cost;
        const pct = ((pnl / cost) * 100).toFixed(1);
        const color = pnl >= 0 ? '#30d158' : '#ff3b30';
        const sign = pnl >= 0 ? '+' : '';
        investHtml += `
          <div class="card-row" style="margin-top:3px">
            <span style="font-size:12px;color:var(--muted)">投入成本</span>
            <span style="font-size:13px;color:var(--muted)">NT$ ${formatAmount(cost)}</span>
          </div>
          <div class="card-row" style="margin-top:3px">
            <span style="font-size:12px;color:var(--muted)">損益</span>
            <span style="font-size:13px;font-weight:600;color:${color}">${sign}NT$ ${formatAmount(pnl)}（${sign}${pct}%）</span>
          </div>`;
      }
    }

    return `
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="card-row">
          <span style="font-size:15px">${a.name}</span>
          <span style="font-size:15px;font-weight:600">${bal !== undefined ? 'NT$ ' + formatAmount(bal) : '—'}</span>
        </div>
        ${investHtml}
        ${fee ? `<div class="card-row" style="margin-top:3px">
          <span style="font-size:12px;color:var(--muted)">信用卡費</span>
          <span style="font-size:13px;color:#e65100;font-weight:600">-NT$ ${formatAmount(fee)}</span>
        </div>` : ''}
      </div>
    `;
  }).join('') + `
    <div class="card-row" style="padding:10px 0;border-bottom:${hasCardFees ? '1px solid var(--border)' : 'none'}">
      <span style="font-size:16px;font-weight:700">資產總計</span>
      <span style="font-size:18px;font-weight:700;color:var(--accent)">NT$ ${formatAmount(r.total)}</span>
    </div>
    ${hasCardFees ? `
    <div class="card-row" style="padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:16px;font-weight:700">信用卡費總計</span>
      <span style="font-size:18px;font-weight:700;color:#e65100">-NT$ ${formatAmount(r.totalCardFees)}</span>
    </div>
    <div class="card-row" style="padding:10px 0;border-bottom:none">
      <span style="font-size:16px;font-weight:700">本月結餘</span>
      <span style="font-size:18px;font-weight:700;color:var(--accent)">NT$ ${formatAmount(recordNet(r))}</span>
    </div>` : ''}
  `;
  if (r.note) {
    const noteDiv = document.createElement('div');
    noteDiv.style.cssText = 'margin-top:12px;padding:10px 14px;background:var(--bg);border-radius:10px;font-size:14px;color:var(--muted);line-height:1.5';
    noteDiv.textContent = '📝 ' + r.note;
    document.getElementById('history-detail-body').appendChild(noteDiv);
  }
  openSheet('sheet-history-detail');
}

document.getElementById('history-detail-close').addEventListener('click', () => closeSheet('sheet-history-detail'));

// ── Settings ─────────────────────────────────────────────
document.getElementById('settings-btn').addEventListener('click', () => {
  document.getElementById('goal-input').value = goal;
  document.getElementById('firebase-url-input').value = firebaseUrl;
  document.getElementById('sync-pin-input').value = syncPin;
  openSheet('sheet-settings');
});

document.getElementById('cloud-save-btn').addEventListener('click', async () => {
  const url = document.getElementById('firebase-url-input').value.trim().replace(/\/$/, '');
  const pin = document.getElementById('sync-pin-input').value.trim();
  if (!url || pin.length < 4) {
    alert('請填入資料庫網址和至少 4 位的 PIN');
    return;
  }
  firebaseUrl = url;
  syncPin = pin;
  localStorage.setItem('firebase-url', firebaseUrl);
  localStorage.setItem('sync-pin', syncPin);
  await cloudSave();
  alert('✅ 設定完成！資料已同步到雲端');
});

document.getElementById('cloud-load-btn').addEventListener('click', async () => {
  const url = document.getElementById('firebase-url-input').value.trim().replace(/\/$/, '');
  const pin = document.getElementById('sync-pin-input').value.trim();
  if (!url || pin.length < 4) {
    alert('請填入資料庫網址和至少 4 位的 PIN');
    return;
  }
  firebaseUrl = url;
  syncPin = pin;
  localStorage.setItem('firebase-url', firebaseUrl);
  localStorage.setItem('sync-pin', syncPin);
  const ok = await cloudLoad();
  if (!ok) {
    alert('❌ 找不到備份，請確認網址和 PIN 是否正確');
  } else {
    alert('✅ 資料已從雲端還原！');
    location.reload();
  }
});

document.getElementById('goal-save-btn').addEventListener('click', () => {
  const val = parseInt(document.getElementById('goal-input').value);
  if (val > 0) { goal = val; save(); }
  closeSheet('sheet-settings');
  renderHome();
});

document.getElementById('export-btn').addEventListener('click', () => {
  const data = { accounts, cards, records, exportedAt: new Date().toISOString() };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `資產管理備份_${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.accounts || !data.records) throw new Error();
      if (!confirm(`確定要匯入備份嗎？\n這會覆蓋目前所有資料，無法復原。`)) return;
      accounts = data.accounts || [];
      cards = data.cards || [];
      records = data.records || [];
      save();
      closeSheet('sheet-settings');
      goTo('page-home');
      alert('匯入成功！');
    } catch {
      alert('檔案格式錯誤，請選擇正確的備份檔案。');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ── Notifications & Reminders ────────────────────────────

function getDaysUntil(dueDay) {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  const nextDue = dueDay >= d
    ? new Date(y, m, dueDay)
    : new Date(y, m + 1, dueDay);
  return Math.round((nextDue - new Date(y, m, d)) / 86400000);
}

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function getActiveReminders() {
  const day = new Date().getDate();
  const ym = thisYearMonth();
  const list = [];

  // 信用卡繳費提醒（截止日前 3 天內）
  cards.forEach(card => {
    const days = getDaysUntil(card.dueDay);
    if (days >= 0 && days <= 3) {
      const dayStr = days === 0 ? '就是今天！' : days === 1 ? '明天到期' : `還有 ${days} 天`;
      list.push({
        id: `card-${card.id}`,
        title: `💳 ${card.name} 信用卡繳費`,
        desc: dayStr,
        urgent: days <= 1
      });
    }
  });

  // 每月記錄提醒（1號和5號）
  if ([1, 5].includes(day) && !records.some(r => r.ym === ym)) {
    list.push({
      id: 'record-monthly',
      title: '📋 本月資產還沒記錄',
      desc: '點下方按鈕記錄本月資產',
      urgent: false
    });
  }

  return list;
}

async function showOsNotifications(reminders) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const todayKey = 'notif-shown-' + new Date().toISOString().slice(0, 10);
  const shown = JSON.parse(localStorage.getItem(todayKey) || '[]');
  for (const r of reminders) {
    if (shown.includes(r.id)) continue;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(r.title, { body: r.desc, icon: '/icons/icon-192.png' });
    } catch (e) {}
    shown.push(r.id);
  }
  localStorage.setItem(todayKey, JSON.stringify(shown));
}

function scheduleReminders() {
  const reminders = getActiveReminders();

  // 顯示 in-app 提醒橫幅（隨時）
  const el = document.getElementById('home-reminders');
  if (reminders.length > 0) {
    el.innerHTML = reminders.map(r => `
      <div class="card" style="border-left:3px solid ${r.urgent ? 'var(--danger)' : '#ff9500'};
        padding:12px 16px;margin-bottom:0">
        <div style="font-size:14px;font-weight:600;
          color:${r.urgent ? 'var(--danger)' : '#ff9500'}">${r.title}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:2px">${r.desc}</div>
      </div>
    `).join('');
  } else {
    el.innerHTML = '';
  }

  // OS 通知：開啟 App 時立即顯示
  showOsNotifications(reminders);
}

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ── Preset Data ──────────────────────────────────────────
function loadPresetData() {
  // 只有在完全空白時才載入，不覆蓋已有資料
  if (accounts.length > 0 || records.length > 0) return;

  const A = {
    yushan:   { id: 'acc-yushan',   name: '玉山',      type: 'savings' },
    ctbc:     { id: 'acc-ctbc',     name: '中信',      type: 'savings' },
    fubon:    { id: 'acc-fubon',    name: '富邦',      type: 'savings' },
    taishin:  { id: 'acc-taishin',  name: '台新',      type: 'savings' },
    linepay:  { id: 'acc-linepay',  name: 'Line Pay',  type: 'other'   },
    linebank: { id: 'acc-linebank', name: 'Line Bank', type: 'savings' }
  };

  accounts = Object.values(A);

  cards = [
    { id: 'card-ctbc',   name: '中信', billingDay: 24, dueDay: 1  },
    { id: 'card-taishin',name: '台新', billingDay: 7,  dueDay: 22 },
    { id: 'card-fubon',  name: '富邦', billingDay: 1,  dueDay: 18 },
    { id: 'card-cathay', name: '國泰', billingDay: 16, dueDay: 2  },
  ];

  records = [
    {
      id: 'rec-202502', ym: '2025-02',
      balances: { [A.ctbc.id]: 41409, [A.fubon.id]: 4528, [A.taishin.id]: 11996, [A.linepay.id]: 0, [A.linebank.id]: 0 },
      total: 57933, updatedAt: '2025-02-28T00:00:00.000Z'
    },
    {
      id: 'rec-202505', ym: '2025-05',
      balances: { [A.yushan.id]: 12130, [A.ctbc.id]: 11255, [A.fubon.id]: 5435, [A.taishin.id]: 800, [A.linepay.id]: 0 },
      total: 29620, updatedAt: '2025-05-26T00:00:00.000Z'
    },
    {
      id: 'rec-202507', ym: '2025-07',
      balances: { [A.yushan.id]: 8332, [A.ctbc.id]: 15448, [A.fubon.id]: 10526, [A.taishin.id]: 10151, [A.linepay.id]: 0 },
      total: 44457, updatedAt: '2025-07-21T00:00:00.000Z'
    },
    {
      id: 'rec-202508', ym: '2025-08',
      balances: { [A.yushan.id]: 7378, [A.ctbc.id]: 13819, [A.fubon.id]: 3237, [A.taishin.id]: 2383, [A.linepay.id]: 3203 },
      total: 30020, updatedAt: '2025-08-25T00:00:00.000Z'
    },
    {
      id: 'rec-202509', ym: '2025-09',
      balances: { [A.yushan.id]: 3000, [A.ctbc.id]: 1246, [A.fubon.id]: 12990, [A.taishin.id]: 770, [A.linepay.id]: 3951 },
      total: 21957, updatedAt: '2025-09-28T00:00:00.000Z'
    },
    {
      id: 'rec-202511', ym: '2025-11',
      balances: { [A.yushan.id]: 31683, [A.ctbc.id]: 5222, [A.fubon.id]: 13543, [A.taishin.id]: 7222, [A.linepay.id]: 196 },
      total: 57866, updatedAt: '2025-11-12T00:00:00.000Z'
    },
    {
      id: 'rec-202512', ym: '2025-12',
      balances: { [A.yushan.id]: 22275, [A.ctbc.id]: 6906, [A.fubon.id]: 3218, [A.taishin.id]: 1040, [A.linepay.id]: 196 },
      total: 33635, updatedAt: '2025-12-22T00:00:00.000Z'
    },
    {
      id: 'rec-202602', ym: '2026-02',
      balances: { [A.yushan.id]: 45332, [A.ctbc.id]: 19328, [A.fubon.id]: 15902, [A.taishin.id]: 16424, [A.linepay.id]: 0 },
      total: 96986, updatedAt: '2026-02-25T00:00:00.000Z'
    },
    {
      id: 'rec-202604', ym: '2026-04',
      balances: { [A.yushan.id]: 76205, [A.ctbc.id]: 9559, [A.fubon.id]: 16852, [A.taishin.id]: 13592, [A.linepay.id]: 0 },
      total: 116208,
      cardFees: { [A.ctbc.id]: 132, [A.fubon.id]: 10083, [A.taishin.id]: 7200 },
      totalCardFees: 17415,
      updatedAt: '2026-04-05T00:00:00.000Z'
    },
    {
      id: 'rec-202605', ym: '2026-05',
      balances: { [A.yushan.id]: 63333, [A.ctbc.id]: 4860, [A.fubon.id]: 16769, [A.taishin.id]: 23135, [A.linepay.id]: 0 },
      total: 108097,
      cardFees: { [A.ctbc.id]: 586, [A.fubon.id]: 11049, [A.taishin.id]: 13937 },
      totalCardFees: 25572,
      updatedAt: '2026-05-06T00:00:00.000Z'
    }
  ];

  save();
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  loadPresetData();
  await cloudLoad();
  requestNotificationPermission();
  goTo('page-home');
}
init();
