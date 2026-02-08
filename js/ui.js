// ===== GLOBAL STATE =====
const state = {
  amount: '',
  selectedCardId: 'cash',
  selectedCategory: '餐飲',
  reportMonth: new Date(),
  detailFilter: '全部',
  editingExpenseId: null,
};

// ===== NAVIGATION =====
function switchTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
  if (name === 'report') renderReport();
  if (name === 'detail') renderDetail();
  if (name === 'settings') renderSettings();
}

// ===== TOAST =====
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), 2000);
}

// ===== DIALOG =====
function showDialog(title, msg, onConfirm, confirmLabel = '確定') {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-msg').textContent = msg;
  const btn = document.getElementById('dialog-confirm');
  btn.textContent = confirmLabel;
  btn.onclick = () => { onConfirm(); closeDialog(); };
  document.getElementById('dialog-overlay').classList.add('show');
}
function closeDialog() { document.getElementById('dialog-overlay').classList.remove('show'); }

// ===== PAGE 1: INPUT =====
function initInputPage() {
  renderPaymentChips();
  renderCategoryGrid();
  document.getElementById('date-picker').value = new Date().toISOString().split('T')[0];
  buildNumpad();
  updateAmountDisplay();
}

function renderPaymentChips() {
  const cards = loadCards();
  document.getElementById('payment-selector').innerHTML = cards.map(c =>
    `<button class="pay-chip${c.id === state.selectedCardId ? ' active' : ''}" data-id="${c.id}" style="${c.id === state.selectedCardId ? `border-color:${c.color};color:${c.color};background:${c.color}18` : ''}" onclick="selectCard('${c.id}')">${c.name.replace('信用卡', '')}</button>`
  ).join('');
}

function renderCategoryGrid() {
  document.getElementById('category-grid').innerHTML = CATEGORIES.map(c =>
    `<button class="cat-btn${c.name === state.selectedCategory ? ' active' : ''}" data-name="${c.name}" onclick="selectCategory('${c.name}')"><span class="icon">${c.icon}</span>${c.name}</button>`
  ).join('');
}

function selectCard(id) {
  state.selectedCardId = id;
  renderPaymentChips();
  updateBillingIndicator();
}

function selectCategory(name) {
  state.selectedCategory = name;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.name === name));
}

function buildNumpad() {
  const keys = ['7','8','9','4','5','6','1','2','3','⌫','0','✓'];
  document.getElementById('numpad').innerHTML = keys.map(k => {
    if (k === '⌫') return `<button class="num-btn del" onclick="numInput('del')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg></button>`;
    if (k === '✓') return `<button class="num-btn confirm" onclick="submitExpense()">記帳</button>`;
    return `<button class="num-btn" onclick="numInput('${k}')">${k}</button>`;
  }).join('');
}

function numInput(key) {
  if (key === 'del') state.amount = state.amount.slice(0, -1);
  else if (state.amount.length < 7) state.amount += key;
  updateAmountDisplay();
}

function updateAmountDisplay() {
  const el = document.getElementById('amount-display');
  if (!state.amount) { el.textContent = '$0'; el.classList.add('empty'); }
  else { el.textContent = '$' + Number(state.amount).toLocaleString(); el.classList.remove('empty'); }
  updateBillingIndicator();
}

function updateBillingIndicator() {
  const el = document.getElementById('billing-indicator');
  const dateStr = document.getElementById('date-picker').value;
  if (!dateStr) { el.innerHTML = ''; return; }
  const info = getBillingInfo(dateStr, state.selectedCardId);
  const map = {
    '即時支出': `<span class="billing-tag instant">💵 現金即時支出</span>`,
    '本月帳單': `<span class="billing-tag this-month">📋 ${info.billingMonth} 帳單 → 繳款 ${info.dueDate}</span>`,
    '下月帳單': `<span class="billing-tag next-month">📋 ${info.billingMonth} 帳單 → 繳款 ${info.dueDate}</span>`,
  };
  el.innerHTML = map[info.billingStatus] || '';
}

function submitExpense() {
  if (!state.amount || state.amount === '0') { showToast('請輸入金額', true); return; }
  const entry = addExpense({
    date: document.getElementById('date-picker').value,
    amount: Number(state.amount),
    cardId: state.selectedCardId,
    category: state.selectedCategory,
    note: document.getElementById('note-input').value.trim(),
  });
  state.amount = '';
  document.getElementById('note-input').value = '';
  updateAmountDisplay();
  showToast(`已記錄 $${entry.amount.toLocaleString()}`);
}

// ===== PAGE 2: REPORT =====
function changeMonth(delta) {
  state.reportMonth.setMonth(state.reportMonth.getMonth() + delta);
  renderReport();
}

function renderReport() {
  const y = state.reportMonth.getFullYear();
  const m = state.reportMonth.getMonth();
  document.getElementById('report-month').textContent = `${y}/${String(m + 1).padStart(2, '0')}`;

  const r = getReportData(y, m);
  const savingsClass = r.estimatedSavings >= 0 ? 'highlight' : 'warn';

  let html = `<div class="summary-cards">
    <div class="s-card ${savingsClass}">
      <div class="s-label">💰 預估下月可存現金</div>
      <div class="s-value">${fmtSigned(r.estimatedSavings)}</div>
      <div class="s-sub">
        $${r.netIncome.toLocaleString()} 可用餘額<br>
        − $${r.nextMonthCardTotal.toLocaleString()} 下月信用卡帳單<br>
        − $${r.cashSpend.toLocaleString()} 本月現金支出<br>
        ＝ ${fmtSigned(r.estimatedSavings)}
      </div>
    </div>
    <div class="s-card${r.nextMonthCardTotal > r.netIncome ? ' warn' : ''}">
      <div class="s-label">📋 下月需繳信用卡帳單 <span class="s-hint">帳單歸屬 ${r.monthStr}</span></div>
      <div class="s-value" style="color:var(--red)">$${r.nextMonthCardTotal.toLocaleString()}</div>
    </div>
    <div class="s-card">
      <div class="s-label">💵 本月現金支出</div>
      <div class="s-value">$${r.cashSpend.toLocaleString()}</div>
    </div>
    <div class="s-card">
      <div class="s-label">🔄 每月可用餘額（收入−固定）</div>
      <div class="s-value" style="color:var(--blue)">$${r.netIncome.toLocaleString()}</div>
    </div>
  </div>`;

  // Next month card breakdown
  const nextCards = Object.entries(r.nextMonthByCard);
  if (nextCards.length) {
    html += `<div class="breakdown-section">
      <div class="breakdown-title"><span class="billing-tag next-month">下月待繳</span> 各卡明細</div>
      <div class="breakdown-list">${nextCards.sort((a, b) => b[1] - a[1]).map(([cid, amt]) =>
        `<div class="bd-item"><div class="bd-left"><div class="bd-dot" style="background:${getCardColor(cid)}"></div><span class="bd-name">${getCardName(cid)}</span></div><span class="bd-amount">$${amt.toLocaleString()}</span></div>`
      ).join('')}</div></div>`;
  }

  // This month spending by card
  const byCards = Object.entries(r.byCard);
  if (byCards.length) {
    html += `<div class="breakdown-section">
      <div class="breakdown-title">📊 本月消費明細（依付款方式）</div>
      <div class="breakdown-list">${byCards.sort((a, b) => b[1] - a[1]).map(([cid, amt]) =>
        `<div class="bd-item"><div class="bd-left"><div class="bd-dot" style="background:${getCardColor(cid)}"></div><span class="bd-name">${getCardName(cid)}</span></div><span class="bd-amount">$${amt.toLocaleString()}</span></div>`
      ).join('')}</div></div>`;
  }

  if (!r.monthExpenses.length && !r.billsDueNextMonth.length) {
    html += '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">本月尚無消費記錄</div></div>';
  }

  document.getElementById('report-content').innerHTML = html;
}

function fmtSigned(n) {
  return (n >= 0 ? '' : '-') + '$' + Math.abs(n).toLocaleString();
}

// ===== PAGE 3: DETAIL =====
function renderDetail() {
  const cards = loadCards();
  const filters = ['全部', '本月帳單', '下月帳單', '即時支出', ...cards.map(c => c.id)];
  const filterLabels = { '全部': '全部', '本月帳單': '本月帳單', '下月帳單': '下月帳單', '即時支出': '即時支出' };
  cards.forEach(c => filterLabels[c.id] = c.name.replace('信用卡', ''));

  document.getElementById('detail-filters').innerHTML = filters.map(f =>
    `<button class="filter-chip${f === state.detailFilter ? ' active' : ''}" onclick="setFilter('${f}')">${filterLabels[f] || f}</button>`
  ).join('');

  let data = [...loadExpenses()].reverse();
  if (['本月帳單', '下月帳單', '即時支出'].includes(state.detailFilter)) {
    data = data.filter(e => e.billingStatus === state.detailFilter);
  } else if (state.detailFilter !== '全部') {
    data = data.filter(e => e.cardId === state.detailFilter);
  }

  if (!data.length) {
    document.getElementById('tx-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">沒有符合條件的記錄</div></div>';
    return;
  }

  document.getElementById('tx-list').innerHTML = data.map(e => {
    const cat = CATEGORIES.find(c => c.name === e.category);
    const icon = cat ? cat.icon : '📦';
    const tagClass = e.billingStatus === '本月帳單' ? 'this-month' : e.billingStatus === '下月帳單' ? 'next-month' : 'instant';
    return `<div class="tx-item" data-id="${e.id}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-info" onclick="openEditModal('${e.id}')">
        <div class="tx-title">${e.note || e.category} <span class="billing-tag ${tagClass}">${e.billingStatus}</span></div>
        <div class="tx-sub"><span>${e.date}</span><span style="color:${getCardColor(e.cardId)}">● ${getCardName(e.cardId).replace('信用卡', '')}</span>${e.billingMonth ? `<span>帳單 ${e.billingMonth}</span>` : ''}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount">-$${e.amount.toLocaleString()}</div>
        <div class="tx-actions">
          <button class="tx-action-btn edit-btn" onclick="openEditModal('${e.id}')" title="編輯">✏️</button>
          <button class="tx-action-btn del-btn" onclick="confirmDeleteExpense('${e.id}')" title="刪除">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function setFilter(f) { state.detailFilter = f; renderDetail(); }

function confirmDeleteExpense(id) {
  showDialog('刪除記錄', '確定要刪除這筆消費記錄嗎？', () => {
    deleteExpense(id);
    renderDetail();
    showToast('已刪除');
  }, '刪除');
}

// ===== EDIT EXPENSE MODAL =====
function openEditModal(id) {
  const expense = loadExpenses().find(e => e.id === id);
  if (!expense) return;
  state.editingExpenseId = id;
  const cards = loadCards();

  document.getElementById('modal-title').textContent = '編輯消費';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>日期</label>
      <input type="date" id="edit-date" value="${expense.date}" class="modal-input">
    </div>
    <div class="modal-field">
      <label>金額</label>
      <input type="number" id="edit-amount" value="${expense.amount}" class="modal-input" inputmode="numeric">
    </div>
    <div class="modal-field">
      <label>付款方式</label>
      <select id="edit-card" class="modal-input">${cards.map(c => `<option value="${c.id}"${c.id === expense.cardId ? ' selected' : ''}>${c.name}</option>`).join('')}</select>
    </div>
    <div class="modal-field">
      <label>分類</label>
      <select id="edit-category" class="modal-input">${CATEGORIES.map(c => `<option${c.name === expense.category ? ' selected' : ''}>${c.name}</option>`).join('')}</select>
    </div>
    <div class="modal-field">
      <label>備註</label>
      <input type="text" id="edit-note" value="${expense.note || ''}" class="modal-input" placeholder="選填" maxlength="30">
    </div>
  `;
  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = '儲存';
  saveBtn.onclick = saveEditModal;
  document.getElementById('modal-overlay').classList.add('show');
}

function saveEditModal() {
  if (!state.editingExpenseId) return;
  const updated = updateExpense(state.editingExpenseId, {
    date: document.getElementById('edit-date').value,
    amount: Number(document.getElementById('edit-amount').value),
    cardId: document.getElementById('edit-card').value,
    category: document.getElementById('edit-category').value,
    note: document.getElementById('edit-note').value.trim(),
  });
  closeModal();
  if (updated) { renderDetail(); showToast('已更新'); }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  state.editingExpenseId = null;
}

// ===== PAGE 4: SETTINGS =====
function renderSettings() {
  const settings = loadSettings();
  const cards = loadCards();
  const stats = getDataStats();

  let html = `
    <div class="settings-group-title">收入設定</div>
    <div class="settings-group">
      <div class="setting-row"><span class="setting-label">每月基本收入</span><input class="setting-input" type="number" value="${settings.monthlyIncome}" onchange="saveSetting('monthlyIncome',this.value)"></div>
      <div class="setting-row"><span class="setting-label">每月固定支出</span><input class="setting-input" type="number" value="${settings.fixedExpense}" onchange="saveSetting('fixedExpense',this.value)"></div>
      <div class="setting-row"><span class="setting-label">每月可用餘額</span><span class="setting-value">$${(settings.monthlyIncome - settings.fixedExpense).toLocaleString()}</span></div>
    </div>

    <div class="settings-group-title">信用卡管理</div>
    <div class="settings-group">
      ${cards.filter(c => !c.isSystem).map(c => `
        <div class="setting-row card-row">
          <div class="card-info">
            <span class="card-dot" style="background:${c.color}"></span>
            <span class="setting-label">${c.name}</span>
            <span class="card-detail">結帳 ${c.billDay}號 / 繳款 次月${c.dueDay}號</span>
          </div>
          <div class="card-actions">
            <button class="icon-btn" onclick="openCardEditor('${c.id}')">✏️</button>
            <button class="icon-btn" onclick="confirmDeleteCard('${c.id}','${c.name}')">🗑️</button>
          </div>
        </div>
      `).join('')}
      <div class="setting-row" style="justify-content:center">
        <button class="add-card-btn" onclick="openCardEditor()">＋ 新增信用卡</button>
      </div>
    </div>

    <div class="settings-group-title">匯出資料</div>
    <div class="settings-group" id="export-section">
      <div class="setting-row">
        <span class="setting-label">選擇月份</span>
        <input type="month" id="export-month" class="setting-input" style="width:150px" value="${new Date().toISOString().slice(0, 7)}">
      </div>
      <div class="setting-row" style="justify-content:center">
        <button class="add-card-btn" onclick="doExport()">📤 匯出該月 CSV</button>
      </div>
    </div>

    <div class="settings-group-title">資料狀態</div>
    <div class="settings-group">
      <div class="setting-row"><span class="setting-label">記錄筆數</span><span class="setting-value">${stats.count} 筆</span></div>
      <div class="setting-row"><span class="setting-label">佔用空間</span><span class="setting-value">${stats.sizeKB} KB / 5,120 KB</span></div>
    </div>

    <button class="action-btn danger" onclick="confirmClearAllData()">🗑️ 清除所有消費記錄</button>
    <div style="text-align:center;padding:20px 0;color:var(--text3);font-size:12px;">存錢記帳 v2.0<br>資料儲存於裝置本地</div>
  `;
  document.getElementById('settings-content').innerHTML = html;
}

function saveSetting(key, val) {
  const s = loadSettings();
  s[key] = Number(val);
  saveSettings(s);
  renderSettings();
}

function doExport() {
  const val = document.getElementById('export-month').value;
  if (!val) { showToast('請選擇月份', true); return; }
  const [y, m] = val.split('-').map(Number);
  const result = exportMonthCSV(y, m - 1);
  if (!result) { showToast('該月沒有資料', true); return; }
  const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已匯出 CSV');
}

// ===== CARD EDITOR MODAL =====
function openCardEditor(id) {
  const card = id ? getCardById(id) : null;
  const isEdit = !!card;
  const title = isEdit ? '編輯信用卡' : '新增信用卡';

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>信用卡名稱</label>
      <input type="text" id="card-edit-name" value="${card ? card.name : ''}" class="modal-input" placeholder="例：玉山信用卡" maxlength="20">
    </div>
    <div class="modal-field">
      <label>結帳日（每月幾號）</label>
      <input type="number" id="card-edit-billday" value="${card ? card.billDay : ''}" class="modal-input" min="1" max="28" placeholder="1-28" inputmode="numeric">
    </div>
    <div class="modal-field">
      <label>繳款截止日（次月幾號）</label>
      <input type="number" id="card-edit-dueday" value="${card ? card.dueDay : ''}" class="modal-input" min="1" max="28" placeholder="1-28" inputmode="numeric">
    </div>
    <div class="modal-field">
      <label>顏色</label>
      <div class="color-picker">${CARD_COLORS.map(c =>
        `<button class="color-dot${card && card.color === c ? ' active' : ''}" style="background:${c}" data-color="${c}" onclick="pickColor(this)"></button>`
      ).join('')}</div>
    </div>
  `;

  // Rewrite save button behavior
  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = isEdit ? '儲存' : '新增';
  saveBtn.onclick = () => saveCardEditor(id);
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-overlay').classList.add('show');
}

function pickColor(el) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
}

function saveCardEditor(id) {
  const name = document.getElementById('card-edit-name').value.trim();
  const billDay = Number(document.getElementById('card-edit-billday').value);
  const dueDay = Number(document.getElementById('card-edit-dueday').value);
  const colorEl = document.querySelector('.color-dot.active');
  const color = colorEl ? colorEl.dataset.color : CARD_COLORS[0];

  if (!name) { showToast('請輸入名稱', true); return; }
  if (!billDay || billDay < 1 || billDay > 28) { showToast('結帳日請輸入 1-28', true); return; }
  if (!dueDay || dueDay < 1 || dueDay > 28) { showToast('繳款日請輸入 1-28', true); return; }

  if (id) {
    updateCard(id, { name, billDay, dueDay, color });
    showToast('已更新');
  } else {
    addCard({ name, billDay, dueDay, color });
    showToast('已新增');
  }
  closeModal();
  renderSettings();
  renderPaymentChips();
}

function confirmDeleteCard(id, name) {
  showDialog('刪除信用卡', `確定要刪除「${name}」嗎？使用此卡的消費記錄不會被刪除。`, () => {
    deleteCard(id);
    renderSettings();
    renderPaymentChips();
    showToast('已刪除');
  }, '刪除');
}

function confirmClearAllData() {
  showDialog('清除所有資料', '這將刪除所有消費記錄，此操作無法復原。', () => {
    saveExpenses([]);
    renderSettings();
    renderDetail();
    showToast('已清除');
  }, '清除');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initInputPage();
  document.getElementById('date-picker').addEventListener('change', updateBillingIndicator);
  // Reset modal save button default
  document.getElementById('modal-save').onclick = saveEditModal;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
