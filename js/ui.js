// ===== GLOBAL STATE =====
const state = {
  amount: '',
  inputType: 'expense',
  selectedCardId: 'cash',
  selectedCategory: '餐飲',
  selectedIncomeCategory: '獎金',
  reportMonth: new Date(),
  detailMonth: new Date(),
  detailFilter: '全部',
  editingExpenseId: null,
  wizardStep: 1,
  wizardIncomeItems: [],
  wizardFixedExpenseItems: [],
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
  document.getElementById('payment-selector').style.display = state.inputType === 'income' ? 'none' : '';
}

function setInputType(type) {
  state.inputType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  document.getElementById('payment-selector').style.display = type === 'income' ? 'none' : '';
  renderCategoryGrid();
  updateAmountDisplay();
  buildNumpad();
  updateBillingIndicator();
}

function renderPaymentChips() {
  const cards = loadCards();
  document.getElementById('payment-selector').innerHTML = cards.map(c =>
    `<button class="pay-chip${c.id === state.selectedCardId ? ' active' : ''}" data-id="${c.id}" style="${c.id === state.selectedCardId ? `border-color:${c.color};color:${c.color};background:${c.color}18` : ''}" onclick="selectCard('${c.id}')">${c.name.replace('信用卡', '')}</button>`
  ).join('');
}

function renderCategoryGrid() {
  const isIncome = state.inputType === 'income';
  const cats = isIncome ? getAllIncomeCategories() : getAllExpenseCategories();
  const selected = isIncome ? state.selectedIncomeCategory : state.selectedCategory;
  const type = isIncome ? 'income' : 'expense';
  document.getElementById('category-grid').innerHTML = cats.map(c =>
    `<button class="cat-btn${c.name === selected ? ' active' : ''}" data-name="${c.name}" onclick="selectCategory('${c.name}')"><span class="icon">${c.icon}</span>${c.name}</button>`
  ).join('') + `<button class="cat-btn cat-add-btn" onclick="openCategoryEditor('${type}')"><span class="icon">＋</span>新增</button>`;
}

function selectCard(id) {
  state.selectedCardId = id;
  renderPaymentChips();
  updateBillingIndicator();
}

function selectCategory(name) {
  if (state.inputType === 'income') state.selectedIncomeCategory = name;
  else state.selectedCategory = name;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.name === name));
}

function buildNumpad() {
  const isIncome = state.inputType === 'income';
  const keys = ['7','8','9','4','5','6','1','2','3','⌫','0','✓'];
  document.getElementById('numpad').innerHTML = keys.map(k => {
    if (k === '⌫') return `<button class="num-btn del" onclick="numInput('del')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg></button>`;
    if (k === '✓') return `<button class="num-btn confirm${isIncome ? ' income' : ''}" onclick="submitExpense()">${isIncome ? '記收入' : '記帳'}</button>`;
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
  const isIncome = state.inputType === 'income';
  if (!state.amount) {
    el.textContent = isIncome ? '+$0' : '$0';
    el.className = 'value empty' + (isIncome ? ' income' : '');
  } else {
    el.textContent = (isIncome ? '+$' : '$') + Number(state.amount).toLocaleString();
    el.className = 'value' + (isIncome ? ' income' : '');
  }
  updateBillingIndicator();
}

// Compute billing display tag relative to current month (not expense date)
function getBillingDisplayTag(e, refDate) {
  if ((e.type || 'expense') === 'income') return { label: '即時收入', cls: 'income' };
  if (!e.billingMonth) return { label: '即時支出', cls: 'instant' };
  const ref = refDate || new Date();
  const curStr = `${ref.getFullYear()}/${String(ref.getMonth() + 1).padStart(2, '0')}`;
  const nm = ref.getMonth() === 11 ? 0 : ref.getMonth() + 1;
  const ny = ref.getMonth() === 11 ? ref.getFullYear() + 1 : ref.getFullYear();
  const nextStr = `${ny}/${String(nm + 1).padStart(2, '0')}`;
  if (e.billingMonth === curStr) return { label: '本月帳單', cls: 'this-month' };
  if (e.billingMonth === nextStr) return { label: '下月帳單', cls: 'next-month' };
  return { label: e.billingMonth + ' 帳單', cls: 'this-month' };
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthStr() {
  const now = new Date();
  const nm = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  return `${ny}/${String(nm + 1).padStart(2, '0')}`;
}

function updateBillingIndicator() {
  const el = document.getElementById('billing-indicator');
  if (state.inputType === 'income') { el.innerHTML = '<span class="billing-tag income">💰 額外收入</span>'; return; }
  const dateStr = document.getElementById('date-picker').value;
  if (!dateStr) { el.innerHTML = ''; return; }
  const info = getBillingInfo(dateStr, state.selectedCardId);
  if (!info.billingMonth) {
    el.innerHTML = '<span class="billing-tag instant">💵 現金即時支出</span>';
    return;
  }
  const tag = getBillingDisplayTag({ billingMonth: info.billingMonth });
  el.innerHTML = `<span class="billing-tag ${tag.cls}">📋 ${info.billingMonth} 帳單（${tag.label}）→ 繳款 ${info.dueDate}</span>`;
}

function submitExpense() {
  if (!state.amount || state.amount === '0') { showToast('請輸入金額', true); return; }
  const isIncome = state.inputType === 'income';
  const entryData = {
    date: document.getElementById('date-picker').value,
    amount: Number(state.amount),
    category: isIncome ? state.selectedIncomeCategory : state.selectedCategory,
    note: document.getElementById('note-input').value.trim(),
    type: isIncome ? 'income' : 'expense',
  };
  if (!isIncome) entryData.cardId = state.selectedCardId;
  const entry = addExpense(entryData);
  state.amount = '';
  document.getElementById('note-input').value = '';
  updateAmountDisplay();
  showToast(isIncome ? `已記錄收入 +$${entry.amount.toLocaleString()}` : `已記錄 $${entry.amount.toLocaleString()}`);
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

  const incomeLine = r.monthExtraIncome > 0 ? `+ $${r.monthExtraIncome.toLocaleString()} 本月額外收入<br>` : '';
  let html = `<div class="summary-cards">
    <div class="s-card ${savingsClass}">
      <div class="s-label">💰 預估下月可存現金</div>
      <div class="s-value">${fmtSigned(r.estimatedSavings)}</div>
      <div class="s-sub">
        $${r.netIncome.toLocaleString()} 可用餘額<br>
        ${incomeLine}− $${r.nextMonthCardTotal.toLocaleString()} 下月信用卡帳單<br>
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
    </div>${r.monthExtraIncome > 0 ? `
    <div class="s-card">
      <div class="s-label">💰 本月額外收入</div>
      <div class="s-value" style="color:var(--accent)">+$${r.monthExtraIncome.toLocaleString()}</div>
    </div>` : ''}
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
function changeDetailMonth(delta) {
  state.detailMonth.setMonth(state.detailMonth.getMonth() + delta);
  renderDetail();
}

function renderDetail() {
  const dy = state.detailMonth.getFullYear();
  const dm = state.detailMonth.getMonth();
  document.getElementById('detail-month').textContent = `${dy}/${String(dm + 1).padStart(2, '0')}`;

  const cards = loadCards();
  const filters = ['全部', '收入', '本月帳單', '下月帳單', '即時支出', ...cards.map(c => c.id)];
  const filterLabels = { '全部': '全部', '收入': '收入', '本月帳單': '本月帳單', '下月帳單': '下月帳單', '即時支出': '即時支出' };
  cards.forEach(c => filterLabels[c.id] = c.name.replace('信用卡', ''));

  document.getElementById('detail-filters').innerHTML = filters.map(f =>
    `<button class="filter-chip${f === state.detailFilter ? ' active' : ''}" onclick="setFilter('${f}')">${filterLabels[f] || f}</button>`
  ).join('');

  // Use viewed month as reference for billing tags
  const viewedMonthStr = `${dy}/${String(dm + 1).padStart(2, '0')}`;
  const nxtDm = dm === 11 ? 0 : dm + 1;
  const nxtDy = dm === 11 ? dy + 1 : dy;
  const nextMonthOfViewed = `${nxtDy}/${String(nxtDm + 1).padStart(2, '0')}`;

  // Show expenses dated in this month OR billed to this month (same record, no duplicates)
  let data = loadExpenses().filter(e => {
    const d = new Date(e.date);
    const dateInMonth = d.getFullYear() === dy && d.getMonth() === dm;
    const billingInMonth = e.billingMonth === viewedMonthStr;
    return dateInMonth || billingInMonth;
  });

  // Then apply chip filter (relative to viewed month)
  if (state.detailFilter === '收入') {
    data = data.filter(e => (e.type || 'expense') === 'income');
  } else if (state.detailFilter === '本月帳單') {
    data = data.filter(e => e.billingMonth === viewedMonthStr);
  } else if (state.detailFilter === '下月帳單') {
    data = data.filter(e => e.billingMonth === nextMonthOfViewed);
  } else if (state.detailFilter === '即時支出') {
    data = data.filter(e => !e.billingMonth && (e.type || 'expense') !== 'income');
  } else if (state.detailFilter !== '全部') {
    data = data.filter(e => e.cardId === state.detailFilter);
  }

  // Sort by date descending (newest first)
  data.sort((a, b) => b.date.localeCompare(a.date));

  if (!data.length) {
    document.getElementById('tx-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">沒有符合條件的記錄</div></div>';
    return;
  }

  // Group by date
  const groups = [];
  let curGroup = null;
  data.forEach(e => {
    if (!curGroup || curGroup.date !== e.date) {
      curGroup = { date: e.date, items: [] };
      groups.push(curGroup);
    }
    curGroup.items.push(e);
  });

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  document.getElementById('tx-list').innerHTML = groups.map(g => {
    const d = new Date(g.date);
    const dayLabel = `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`;
    const dayTotal = g.items.reduce((s, e) => {
      return s + ((e.type || 'expense') === 'income' ? e.amount : -e.amount);
    }, 0);
    const totalCls = dayTotal >= 0 ? 'income' : '';
    const totalStr = dayTotal >= 0 ? `+$${dayTotal.toLocaleString()}` : `-$${Math.abs(dayTotal).toLocaleString()}`;

    const itemsHtml = g.items.map(e => {
      const isIncome = (e.type || 'expense') === 'income';
      const allCats = [...getAllExpenseCategories(), ...getAllIncomeCategories()];
      const cat = allCats.find(c => c.name === e.category);
      const icon = cat ? cat.icon : '📦';
      const tag = getBillingDisplayTag(e, state.detailMonth);
      const amountHtml = isIncome
        ? `<div class="tx-amount income">+$${e.amount.toLocaleString()}</div>`
        : `<div class="tx-amount">-$${e.amount.toLocaleString()}</div>`;
      const cardSub = isIncome ? '' : `<span style="color:${getCardColor(e.cardId)}">● ${getCardName(e.cardId).replace('信用卡', '')}</span>`;
      return `<div class="tx-item" data-id="${e.id}">
        <div class="tx-icon">${icon}</div>
        <div class="tx-info" onclick="openEditModal('${e.id}')">
          <div class="tx-title">${e.note || e.category} <span class="billing-tag ${tag.cls}">${tag.label}</span></div>
          <div class="tx-sub">${cardSub}${e.billingMonth ? `<span>帳單 ${e.billingMonth}</span>` : ''}</div>
        </div>
        <div class="tx-right">
          ${amountHtml}
          <div class="tx-actions">
            <button class="tx-action-btn edit-btn" onclick="openEditModal('${e.id}')" title="編輯">✏️</button>
            <button class="tx-action-btn del-btn" onclick="confirmDeleteExpense('${e.id}')" title="刪除">🗑️</button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="tx-date-group">
      <div class="tx-date-header">
        <span class="tx-date-label">${dayLabel}</span>
        <span class="tx-date-total ${totalCls}">${totalStr}</span>
      </div>
      ${itemsHtml}
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
  const isIncome = (expense.type || 'expense') === 'income';
  const cats = isIncome ? getAllIncomeCategories() : getAllExpenseCategories();
  const cardFieldHtml = isIncome ? '' : `
    <div class="modal-field">
      <label>付款方式</label>
      <select id="edit-card" class="modal-input">${cards.map(c => `<option value="${c.id}"${c.id === expense.cardId ? ' selected' : ''}>${c.name}</option>`).join('')}</select>
    </div>`;

  document.getElementById('modal-title').textContent = isIncome ? '編輯收入' : '編輯消費';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>日期</label>
      <input type="date" id="edit-date" value="${expense.date}" class="modal-input">
    </div>
    <div class="modal-field">
      <label>金額</label>
      <input type="number" id="edit-amount" value="${expense.amount}" class="modal-input" inputmode="numeric">
    </div>
    ${cardFieldHtml}
    <div class="modal-field">
      <label>分類</label>
      <select id="edit-category" class="modal-input">${cats.map(c => `<option${c.name === expense.category ? ' selected' : ''}>${c.name}</option>`).join('')}</select>
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
  const expense = loadExpenses().find(e => e.id === state.editingExpenseId);
  const isIncome = expense && (expense.type || 'expense') === 'income';
  const updates = {
    date: document.getElementById('edit-date').value,
    amount: Number(document.getElementById('edit-amount').value),
    category: document.getElementById('edit-category').value,
    note: document.getElementById('edit-note').value.trim(),
  };
  if (!isIncome) updates.cardId = document.getElementById('edit-card').value;
  const updated = updateExpense(state.editingExpenseId, updates);
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
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const incomeItems = settings.incomeItems || [];
  const fixedExpenseItems = settings.fixedExpenseItems || [];
  const incomeTotal = incomeItems.reduce((s, i) => s + (i.amount || 0), 0);
  const expenseTotal = fixedExpenseItems.reduce((s, i) => s + (i.amount || 0), 0);
  const netIncome = incomeTotal - expenseTotal;
  const customExpCats = settings.customExpenseCategories || [];
  const customIncCats = settings.customIncomeCategories || [];

  let html = '';
  if (user) {
    html += `
    <div class="settings-group-title">帳號</div>
    <div class="settings-group">
      <div class="setting-row">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="${user.photoURL || ''}" style="width:32px;height:32px;border-radius:50%;background:var(--surface2)" referrerpolicy="no-referrer" alt="">
          <div>
            <div class="setting-label">${user.displayName || '使用者'}</div>
            <div style="font-size:12px;color:var(--text3)">${user.email || ''}</div>
          </div>
        </div>
        <button class="icon-btn" onclick="handleManualSync()" title="手動同步">🔄</button>
      </div>
      <div class="setting-row" style="justify-content:center">
        <button class="add-card-btn" onclick="handleLogout()">登出</button>
      </div>
    </div>`;
  } else if (typeof signInWithGoogle === 'function') {
    html += `
    <div class="settings-group-title">帳號</div>
    <div class="settings-group">
      <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="font-size:13px;color:var(--text2);text-align:center">目前為本地模式，登入後資料將同步至雲端</div>
        <button class="add-card-btn" onclick="handleSettingsLogin()">登入 Google 帳號</button>
      </div>
    </div>`;
  }

  // Help bubble
  html += `
    <div class="settings-help-bubble" id="settings-help">
      <div class="help-bubble-header" onclick="toggleHelpBubble()">
        <span>💡 設定說明</span>
        <span class="help-bubble-toggle" id="help-toggle">▼</span>
      </div>
      <div class="help-bubble-body" id="help-body">
        <div class="help-item"><b>每月收入</b>：設定薪資、接案等固定收入細項</div>
        <div class="help-item"><b>每月固定支出</b>：設定房租、保險等每月固定花費</div>
        <div class="help-item"><b>信用卡管理</b>：新增信用卡並設定結帳日與繳款日，系統會自動計算帳單歸屬月份</div>
        <div class="help-item"><b>自訂分類</b>：新增支出或收入的自訂類別標籤，記帳時可直接選用</div>
      </div>
    </div>`;

  // Income items
  html += `
    <div class="settings-group-title">每月收入</div>
    <div class="settings-group">
      ${incomeItems.map(item => `
        <div class="setting-row">
          <span class="setting-label">${item.label}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="setting-value">$${item.amount.toLocaleString()}</span>
            <button class="icon-btn" onclick="openItemEditor('income','${item.id}')">✏️</button>
            ${incomeItems.length > 1 ? `<button class="icon-btn" onclick="confirmDeleteItem('income','${item.id}','${item.label}')">🗑️</button>` : ''}
          </div>
        </div>
      `).join('')}
      <div class="setting-row"><span class="setting-label" style="font-weight:600">合計</span><span class="setting-value" style="font-weight:600">$${incomeTotal.toLocaleString()}</span></div>
      <div class="setting-row" style="justify-content:center">
        <button class="add-card-btn" onclick="openItemEditor('income')">＋ 新增收入項目</button>
      </div>
    </div>`;

  // Fixed expense items
  html += `
    <div class="settings-group-title">每月固定支出</div>
    <div class="settings-group">
      ${fixedExpenseItems.map(item => `
        <div class="setting-row">
          <span class="setting-label">${item.label}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="setting-value" style="color:var(--red)">$${item.amount.toLocaleString()}</span>
            <button class="icon-btn" onclick="openItemEditor('fixedExpense','${item.id}')">✏️</button>
            ${fixedExpenseItems.length > 1 ? `<button class="icon-btn" onclick="confirmDeleteItem('fixedExpense','${item.id}','${item.label}')">🗑️</button>` : ''}
          </div>
        </div>
      `).join('')}
      <div class="setting-row"><span class="setting-label" style="font-weight:600">合計</span><span class="setting-value" style="color:var(--red);font-weight:600">$${expenseTotal.toLocaleString()}</span></div>
      <div class="setting-row" style="justify-content:center">
        <button class="add-card-btn" onclick="openItemEditor('fixedExpense')">＋ 新增固定支出</button>
      </div>
    </div>`;

  // Net income summary
  html += `
    <div class="settings-group">
      <div class="setting-row"><span class="setting-label" style="font-weight:700">🔄 每月可用餘額</span><span class="setting-value" style="font-weight:700;color:var(--blue)">$${netIncome.toLocaleString()}</span></div>
    </div>`;

  // Credit cards
  html += `
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
    </div>`;

  // Custom categories
  html += `
    <div class="settings-group-title">自訂分類</div>
    <div class="settings-group">
      <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text2)">支出分類</div>
        <div class="custom-cat-list">
          ${CATEGORIES.map(c => `<span class="custom-cat-chip default">${c.icon} ${c.name}</span>`).join('')}
          ${customExpCats.map(c => `<span class="custom-cat-chip editable" onclick="openCategoryEditor('expense','${c.name}')">${c.icon} ${c.name} ✏️</span>`).join('')}
        </div>
        <button class="add-card-btn" onclick="openCategoryEditor('expense')" style="align-self:flex-start">＋ 新增支出分類</button>
      </div>
    </div>
    <div class="settings-group" style="margin-top:-8px">
      <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text2)">收入分類</div>
        <div class="custom-cat-list">
          ${INCOME_CATEGORIES.map(c => `<span class="custom-cat-chip default">${c.icon} ${c.name}</span>`).join('')}
          ${customIncCats.map(c => `<span class="custom-cat-chip editable" onclick="openCategoryEditor('income','${c.name}')">${c.icon} ${c.name} ✏️</span>`).join('')}
        </div>
        <button class="add-card-btn" onclick="openCategoryEditor('income')" style="align-self:flex-start">＋ 新增收入分類</button>
      </div>
    </div>`;

  // Backup & restore
  html += `
    <div class="settings-group-title">備份與還原</div>
    <div class="settings-group">
      <div class="setting-row" style="justify-content:center;gap:10px;flex-wrap:wrap">
        <button class="add-card-btn" onclick="doBackup()">📦 備份所有資料</button>
        <button class="add-card-btn" onclick="document.getElementById('restore-file').click()">📥 還原備份</button>
        <input type="file" id="restore-file" accept=".json" style="display:none" onchange="doRestore(this)">
      </div>${user ? `
      <div class="setting-row">
        <span class="setting-label">同步時自動備份本地資料</span>
        <label class="toggle-switch">
          <input type="checkbox" ${localStorage.getItem('auto_backup_on_sync') === 'true' ? 'checked' : ''} onchange="toggleAutoBackup(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>` : ''}
    </div>

    <div class="settings-group-title">匯出 CSV</div>
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
    <div style="text-align:center;padding:20px 0;color:var(--text3);font-size:12px;">存錢記帳 v3.0<br>${user ? '資料已同步至雲端' : '資料儲存於裝置本地'}</div>
  `;
  document.getElementById('settings-content').innerHTML = html;
}

// ===== ITEM EDITOR (income/fixed expense) =====
function openItemEditor(type, id) {
  const settings = loadSettings();
  const key = type === 'income' ? 'incomeItems' : 'fixedExpenseItems';
  const arr = settings[key] || [];
  const item = id ? arr.find(i => i.id === id) : null;
  const isEdit = !!item;
  const title = isEdit
    ? (type === 'income' ? '編輯收入項目' : '編輯固定支出')
    : (type === 'income' ? '新增收入項目' : '新增固定支出');

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>名稱</label>
      <input type="text" id="item-edit-label" value="${item ? item.label : ''}" class="modal-input" placeholder="${type === 'income' ? '例：薪資' : '例：房租'}" maxlength="10">
    </div>
    <div class="modal-field">
      <label>每月金額</label>
      <input type="number" id="item-edit-amount" value="${item ? item.amount : ''}" class="modal-input" placeholder="0" inputmode="numeric">
    </div>
  `;
  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = isEdit ? '儲存' : '新增';
  saveBtn.onclick = () => saveItemEditor(type, id);
  document.getElementById('modal-overlay').classList.add('show');
}

function saveItemEditor(type, id) {
  const label = document.getElementById('item-edit-label').value.trim();
  const amount = Number(document.getElementById('item-edit-amount').value) || 0;
  if (!label) { showToast('請輸入名稱', true); return; }

  const settings = loadSettings();
  const key = type === 'income' ? 'incomeItems' : 'fixedExpenseItems';
  if (!settings[key]) settings[key] = [];

  if (id) {
    const idx = settings[key].findIndex(i => i.id === id);
    if (idx !== -1) settings[key][idx] = { ...settings[key][idx], label, amount };
  } else {
    settings[key].push({ id: generateId(), label, amount });
  }

  saveSettings(settings);
  closeModal();
  renderSettings();
  showToast(id ? '已更新' : '已新增');
}

function confirmDeleteItem(type, id, label) {
  showDialog('刪除項目', `確定要刪除「${label}」嗎？`, () => {
    const settings = loadSettings();
    const key = type === 'income' ? 'incomeItems' : 'fixedExpenseItems';
    settings[key] = (settings[key] || []).filter(i => i.id !== id);
    saveSettings(settings);
    renderSettings();
    showToast('已刪除');
  }, '刪除');
}

// ===== CATEGORY EDITOR =====
function openCategoryEditor(type, existingName) {
  const s = loadSettings();
  const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
  const existing = existingName ? (s[key] || []).find(c => c.name === existingName) : null;
  const isEdit = !!existing;
  const title = isEdit ? '編輯自訂分類' : '新增自訂分類';

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-field">
      <label>分類名稱</label>
      <input type="text" id="cat-edit-name" value="${existing ? existing.name : ''}" class="modal-input" placeholder="例：寵物" maxlength="6">
    </div>
    <div class="modal-field">
      <label>圖示</label>
      <div class="icon-picker">
        ${CATEGORY_ICONS.map(icon => `<button class="icon-pick-btn${existing && existing.icon === icon ? ' active' : ''}" data-icon="${icon}" onclick="pickCatIcon(this)">${icon}</button>`).join('')}
      </div>
    </div>
    ${isEdit ? `<button class="action-btn danger" style="margin-top:8px" onclick="confirmDeleteCategory('${type}','${existingName}')">刪除此分類</button>` : ''}
  `;
  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = isEdit ? '儲存' : '新增';
  saveBtn.onclick = () => saveCategoryEditor(type, existingName);
  document.getElementById('modal-overlay').classList.add('show');
}

function pickCatIcon(el) {
  document.querySelectorAll('.icon-pick-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function saveCategoryEditor(type, oldName) {
  const name = document.getElementById('cat-edit-name').value.trim();
  const iconEl = document.querySelector('.icon-pick-btn.active');
  const icon = iconEl ? iconEl.dataset.icon : '📦';
  if (!name) { showToast('請輸入分類名稱', true); return; }
  const builtIn = type === 'expense' ? CATEGORIES : INCOME_CATEGORIES;
  if (builtIn.some(c => c.name === name) && name !== oldName) {
    showToast('此名稱與內建分類重複', true); return;
  }
  if (oldName) {
    updateCustomCategory(type, oldName, name, icon);
    showToast('已更新');
  } else {
    const s = loadSettings();
    const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
    if ((s[key] || []).some(c => c.name === name)) {
      showToast('已有相同名稱的自訂分類', true); return;
    }
    addCustomCategory(type, name, icon);
    showToast('已新增');
  }
  closeModal();
  renderSettings();
  renderCategoryGrid();
}

function confirmDeleteCategory(type, name) {
  closeModal();
  showDialog('刪除分類', `確定要刪除「${name}」嗎？已使用此分類的記錄不會被刪除。`, () => {
    deleteCustomCategory(type, name);
    renderSettings();
    renderCategoryGrid();
    showToast('已刪除');
  }, '刪除');
}

function toggleHelpBubble() {
  const body = document.getElementById('help-body');
  const toggle = document.getElementById('help-toggle');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  toggle.textContent = isOpen ? '▼' : '▲';
}

function toggleAutoBackup(on) {
  localStorage.setItem('auto_backup_on_sync', on ? 'true' : 'false');
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

function doBackup() {
  const json = exportBackup();
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `記帳備份_${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('已下載備份檔案');
}

function doRestore(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const count = importBackup(reader.result);
      runMigrations();
      showToast(`已還原 ${count} 筆記錄`);
      renderSettings();
    } catch (e) {
      showToast('還原失敗：檔案格式錯誤', true);
    }
  };
  reader.readAsText(file);
  input.value = '';
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
  const cloudMsg = typeof getCurrentUser === 'function' && getCurrentUser() ? '（包含雲端資料）' : '';
  showDialog('清除所有資料', `這將刪除所有消費記錄${cloudMsg}，此操作無法復原。建議先備份。`, () => {
    saveExpenses([]);
    renderSettings();
    renderDetail();
    showToast('已清除');
  }, '清除');
}

// ===== IN-APP BROWSER HANDLER =====
function openInExternalBrowser() {
  const url = location.href;
  // Android: use intent URL to open in default browser
  if (/Android/i.test(navigator.userAgent)) {
    location.href = 'intent://' + location.host + location.pathname + location.search
      + '#Intent;scheme=https;action=android.intent.action.VIEW;end';
    return;
  }
  // iOS: copy URL to clipboard (no way to programmatically open Safari from WebView)
  _copyUrlToClipboard(url);
}

function _copyUrlToClipboard(url) {
  const btn = document.querySelector('#inapp-warning .login-btn');
  navigator.clipboard.writeText(url).then(() => {
    if (btn) {
      btn.textContent = '已複製！請開啟 Safari 貼上';
      btn.style.background = 'var(--accent)';
      btn.style.color = '#fff';
    }
  }).catch(() => {
    prompt('請複製此網址，到 Safari 開啟：', url);
  });
}

// ===== AUTH HANDLERS =====
async function handleGoogleLogin() {
  const btn = document.getElementById('google-login-btn');
  btn.disabled = true;
  btn.textContent = '登入中...';
  try {
    await signInWithGoogle();
    // onAuthChanged callback handles the rest
  } catch (err) {
    console.error('Login failed:', err);
    showToast('登入失敗，請重試', true);
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> 使用 Google 帳號登入';
  }
}

function skipLogin() {
  document.getElementById('login-screen').style.display = 'none';
  runMigrations();
  if (!isSetupCompleted()) {
    showSetupWizard();
    return;
  }
  document.querySelector('.tab-bar').style.display = 'flex';
  document.querySelectorAll('.page').forEach(p => p.style.visibility = 'visible');
  _initApp();
}

async function handleSettingsLogin() {
  try {
    showLoading(true);
    await signInWithGoogle();
    // onAuthChanged handles sync + re-render
  } catch (err) {
    showLoading(false);
    console.error('Login failed:', err);
    showToast('登入失敗，請重試', true);
  }
}

function handleLogout() {
  showDialog('登出', '登出後資料仍保留在本地，可繼續使用。確定要登出嗎？', async () => {
    await firebaseSignOut();
    // Stay in app (local mode), just re-render settings
    renderSettings();
  }, '登出');
}

function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function handleManualSync() {
  showLoading(true);
  syncFromCloud().then(() => {
    showLoading(false);
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      const pageId = activePage.id.replace('page-', '');
      if (pageId === 'input') initInputPage();
      if (pageId === 'report') renderReport();
      if (pageId === 'detail') renderDetail();
      if (pageId === 'settings') renderSettings();
    }
    showToast('資料已同步');
  });
}

// ===== SETUP WIZARD =====
function showSetupWizard() {
  document.getElementById('setup-wizard').style.display = 'flex';
  document.querySelector('.tab-bar').style.display = 'none';
  document.querySelectorAll('.page').forEach(p => p.style.visibility = 'hidden');
  state.wizardStep = 1;
  state.wizardIncomeItems = [{ id: generateId(), label: '薪資', amount: 0 }];
  state.wizardFixedExpenseItems = [
    { id: generateId(), label: '房租', amount: 0 },
    { id: generateId(), label: '保險費', amount: 0 },
    { id: generateId(), label: '水電瓦斯', amount: 0 },
  ];
  renderWizardStep();
}

function renderWizardStep() {
  document.querySelectorAll('.setup-step').forEach(el => {
    const step = Number(el.dataset.step);
    el.classList.toggle('active', step === state.wizardStep);
    el.classList.toggle('done', step < state.wizardStep);
  });
  const body = document.getElementById('setup-body');
  const footer = document.getElementById('setup-footer');
  if (state.wizardStep === 1) renderWizardIncomeStep(body, footer);
  else if (state.wizardStep === 2) renderWizardExpenseStep(body, footer);
  else if (state.wizardStep === 3) renderWizardCardStep(body, footer);
}

function renderWizardIncomeStep(body, footer) {
  const total = state.wizardIncomeItems.reduce((s, i) => s + (i.amount || 0), 0);
  body.innerHTML = `
    <div class="setup-title">💰 每月收入</div>
    <div class="setup-desc">設定你的固定收入項目（可以先填 $0，之後再改）</div>
    <div class="setup-items">
      ${state.wizardIncomeItems.map((item, idx) => `
        <div class="setup-item-row">
          <input type="text" class="setup-item-label" value="${item.label}" placeholder="收入名稱" maxlength="10" onchange="updateWizardItem('income',${idx},'label',this.value)">
          <input type="number" class="setup-item-amount" value="${item.amount || ''}" placeholder="0" inputmode="numeric" onchange="updateWizardItem('income',${idx},'amount',Number(this.value)||0)">
          ${state.wizardIncomeItems.length > 1 ? `<button class="setup-item-del" onclick="removeWizardItem('income',${idx})">✕</button>` : ''}
        </div>
      `).join('')}
    </div>
    <button class="setup-add-btn" onclick="addWizardItem('income')">＋ 新增收入項目</button>
    <div class="setup-total">合計：$${total.toLocaleString()}/月</div>
  `;
  footer.innerHTML = `<button class="setup-next-btn" onclick="wizardNext()">下一步 →</button>`;
}

function renderWizardExpenseStep(body, footer) {
  const total = state.wizardFixedExpenseItems.reduce((s, i) => s + (i.amount || 0), 0);
  body.innerHTML = `
    <div class="setup-title">🏠 每月固定支出</div>
    <div class="setup-desc">房租、保險、水電等每月固定要花的錢</div>
    <div class="setup-items">
      ${state.wizardFixedExpenseItems.map((item, idx) => `
        <div class="setup-item-row">
          <input type="text" class="setup-item-label" value="${item.label}" placeholder="支出名稱" maxlength="10" onchange="updateWizardItem('expense',${idx},'label',this.value)">
          <input type="number" class="setup-item-amount" value="${item.amount || ''}" placeholder="0" inputmode="numeric" onchange="updateWizardItem('expense',${idx},'amount',Number(this.value)||0)">
          ${state.wizardFixedExpenseItems.length > 1 ? `<button class="setup-item-del" onclick="removeWizardItem('expense',${idx})">✕</button>` : ''}
        </div>
      `).join('')}
    </div>
    <button class="setup-add-btn" onclick="addWizardItem('expense')">＋ 新增固定支出</button>
    <div class="setup-total">合計：$${total.toLocaleString()}/月</div>
  `;
  footer.innerHTML = `
    <button class="setup-back-btn" onclick="wizardBack()">← 上一步</button>
    <button class="setup-next-btn" onclick="wizardNext()">下一步 →</button>
  `;
}

function renderWizardCardStep(body, footer) {
  const cards = loadCards().filter(c => !c.isSystem);
  const incTotal = state.wizardIncomeItems.reduce((s, i) => s + (i.amount || 0), 0);
  const expTotal = state.wizardFixedExpenseItems.reduce((s, i) => s + (i.amount || 0), 0);

  body.innerHTML = `
    <div class="setup-title">💳 信用卡</div>
    <div class="setup-desc">確認你的信用卡設定，或選擇僅使用現金記帳。</div>
    <div class="setup-cards-list">
      ${cards.length ? cards.map(c => `
        <div class="setup-card-item">
          <span class="card-dot" style="background:${c.color}"></span>
          <span>${c.name}</span>
          <span class="card-detail">結帳 ${c.billDay}號 / 繳款 次月${c.dueDay}號</span>
        </div>
      `).join('') : '<div class="setup-no-cards">尚未設定信用卡（僅使用現金記帳）</div>'}
    </div>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
      <button class="add-card-btn" onclick="openCardEditorFromWizard()">＋ 新增信用卡</button>
    </div>
    <div class="setup-summary">
      <div class="setup-summary-title">📊 每月概覽</div>
      <div class="setup-summary-row"><span>收入合計</span><span>$${incTotal.toLocaleString()}</span></div>
      <div class="setup-summary-row"><span>固定支出</span><span>-$${expTotal.toLocaleString()}</span></div>
      <div class="setup-summary-row total"><span>每月可用餘額</span><span>$${(incTotal - expTotal).toLocaleString()}</span></div>
    </div>
  `;
  footer.innerHTML = `
    <button class="setup-back-btn" onclick="wizardBack()">← 上一步</button>
    <button class="setup-finish-btn" onclick="wizardFinish()">開始記帳 🎉</button>
  `;
}

function updateWizardItem(type, idx, field, value) {
  const arr = type === 'income' ? state.wizardIncomeItems : state.wizardFixedExpenseItems;
  if (arr[idx]) arr[idx][field] = value;
  const total = arr.reduce((s, i) => s + (i.amount || 0), 0);
  const totalEl = document.querySelector('.setup-total');
  if (totalEl) totalEl.textContent = `合計：$${total.toLocaleString()}/月`;
}

function addWizardItem(type) {
  const arr = type === 'income' ? state.wizardIncomeItems : state.wizardFixedExpenseItems;
  arr.push({ id: generateId(), label: '', amount: 0 });
  renderWizardStep();
}

function removeWizardItem(type, idx) {
  const arr = type === 'income' ? state.wizardIncomeItems : state.wizardFixedExpenseItems;
  arr.splice(idx, 1);
  renderWizardStep();
}

function wizardNext() {
  if (state.wizardStep === 1) {
    if (!state.wizardIncomeItems.some(i => i.label.trim())) { showToast('請至少填寫一個收入名稱', true); return; }
  }
  if (state.wizardStep === 2) {
    if (!state.wizardFixedExpenseItems.some(i => i.label.trim())) { showToast('請至少填寫一個固定支出名稱', true); return; }
  }
  state.wizardStep++;
  renderWizardStep();
}

function wizardBack() {
  if (state.wizardStep > 1) { state.wizardStep--; renderWizardStep(); }
}

function wizardFinish() {
  const incomeItems = state.wizardIncomeItems
    .filter(i => i.label.trim())
    .map(i => ({ id: i.id, label: i.label.trim(), amount: i.amount || 0 }));
  const fixedExpenseItems = state.wizardFixedExpenseItems
    .filter(i => i.label.trim())
    .map(i => ({ id: i.id, label: i.label.trim(), amount: i.amount || 0 }));

  const s = loadSettings();
  s.setupCompleted = true;
  s.incomeItems = incomeItems;
  s.fixedExpenseItems = fixedExpenseItems;
  if (!s.customExpenseCategories) s.customExpenseCategories = [];
  if (!s.customIncomeCategories) s.customIncomeCategories = [];
  saveSettings(s);

  document.getElementById('setup-wizard').style.display = 'none';
  document.querySelector('.tab-bar').style.display = 'flex';
  document.querySelectorAll('.page').forEach(p => p.style.visibility = 'visible');
  _initApp();
}

function openCardEditorFromWizard() {
  const origClose = closeModal;
  openCardEditor();
  closeModal = function() {
    origClose();
    closeModal = origClose;
    renderWizardStep();
  };
}

function _initApp() {
  runMigrations();
  if (!isSetupCompleted()) {
    showSetupWizard();
    return;
  }
  initInputPage();
  document.getElementById('date-picker').addEventListener('change', updateBillingIndicator);
  document.getElementById('modal-save').onclick = saveEditModal;
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initFirebase === 'function') {
    initFirebase();

    // Detect in-app browser and show warning instead of login button
    if (typeof isInAppBrowser === 'function' && isInAppBrowser()) {
      document.getElementById('google-login-btn').style.display = 'none';
      document.querySelector('#login-screen .login-hint').style.display = 'none';
      document.querySelector('#login-screen > .login-content > .login-skip').style.display = 'none';
      document.getElementById('inapp-warning').style.display = 'block';
    }

    let _appInitialized = false;
    onAuthChanged(async (user) => {
      if (user) {
        // User signed in (from login screen or settings)
        showLoading(true);
        document.getElementById('login-screen').style.display = 'none';

        await syncFromCloud();
        runMigrations();
        showLoading(false);

        if (!_appInitialized) {
          if (!isSetupCompleted()) {
            showSetupWizard();
            _appInitialized = true;
          } else {
            document.querySelector('.tab-bar').style.display = 'flex';
            document.querySelectorAll('.page').forEach(p => p.style.visibility = 'visible');
            _initApp();
            _appInitialized = true;
          }
        } else {
          document.querySelector('.tab-bar').style.display = 'flex';
          document.querySelectorAll('.page').forEach(p => p.style.visibility = 'visible');
        }

        // Re-render visible page
        const activePage = document.querySelector('.page.active');
        if (activePage) {
          const pageId = activePage.id.replace('page-', '');
          if (pageId === 'report') renderReport();
          if (pageId === 'detail') renderDetail();
          if (pageId === 'settings') renderSettings();
        }
      } else if (!_appInitialized) {
        // First load, not signed in — show login screen
        showLoading(false);
      } else {
        // Logged out while using app — stay in app (local mode)
        renderSettings();
      }
    });
  } else {
    // Firebase not loaded — fallback to local-only mode
    _initApp();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
