// ===== STORAGE KEYS =====
const DB_KEY = 'expense_tracker_data_v3';
const CARDS_KEY = 'expense_tracker_cards_v3';
const SETTINGS_KEY = 'expense_tracker_settings_v3';

// ===== CATEGORIES (built-in, non-deletable) =====
const CATEGORIES = [
  { name: '餐飲', icon: '🍜' },
  { name: '交通', icon: '⛽' },
  { name: '購物', icon: '🛒' },
  { name: '娛樂', icon: '🎬' },
  { name: '醫療', icon: '🏥' },
  { name: '日用', icon: '🏠' },
  { name: '保險', icon: '🛡️' },
  { name: '其他', icon: '📦' },
];

const INCOME_CATEGORIES = [
  { name: '獎金', icon: '🎁' },
  { name: '退款', icon: '💳' },
  { name: '代墊回收', icon: '🤝' },
  { name: '副業', icon: '💼' },
  { name: '利息', icon: '🏦' },
  { name: '其他收入', icon: '💵' },
];

const CATEGORY_ICONS = [
  '🐱','🐶','🎵','🎮','🏋️','✈️','📚','🎨','👶','💅',
  '🚗','🏫','📱','🎁','☕','🍰','💊','🔧','📈','🏖️',
];

// ===== DEFAULT CARDS =====
const DEFAULT_CARDS = [
  { id: 'cash', name: '現金花費', billDay: 0, dueDay: 0, color: '#27ae60', isSystem: true },
];

const CARD_COLORS = ['#e74c3c','#2980b9','#e67e22','#8e44ad','#16a085','#d35400','#2c3e50','#c0392b','#7f8c8d','#f39c12'];

// ===== GENERIC HELPERS =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function safeJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

// ===== EXPENSES CRUD =====
function loadExpenses() { return safeJSON(DB_KEY, []); }
function saveExpenses(data) {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
  if (typeof scheduleSyncToCloud === 'function') scheduleSyncToCloud();
}

function addExpense(expense) {
  const data = loadExpenses();
  const isIncome = expense.type === 'income';
  const billing = isIncome
    ? { billingStatus: '即時收入', billingMonth: null, dueDate: null }
    : getBillingInfo(expense.date, expense.cardId);
  const entry = { id: generateId(), type: isIncome ? 'income' : 'expense', ...expense, ...billing, createdAt: Date.now() };
  if (isIncome) delete entry.cardId;
  data.push(entry);
  saveExpenses(data);
  return entry;
}

function updateExpense(id, updates) {
  const data = loadExpenses();
  const idx = data.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const merged = { ...data[idx], ...updates };
  const isIncome = (merged.type || 'expense') === 'income';
  // recalc billing if date or card changed
  if (updates.date || updates.cardId) {
    const billing = isIncome
      ? { billingStatus: '即時收入', billingMonth: null, dueDate: null }
      : getBillingInfo(merged.date, merged.cardId);
    Object.assign(updates, billing);
  }
  data[idx] = { ...data[idx], ...updates };
  saveExpenses(data);
  return data[idx];
}

function deleteExpense(id) {
  const data = loadExpenses();
  saveExpenses(data.filter(e => e.id !== id));
}

// ===== CARDS CRUD =====
function loadCards() { return safeJSON(CARDS_KEY, DEFAULT_CARDS); }
function saveCards(cards) {
  localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  if (typeof scheduleSyncToCloud === 'function') scheduleSyncToCloud();
}

function addCard(card) {
  const cards = loadCards();
  const entry = { id: generateId(), isSystem: false, ...card };
  cards.push(entry);
  saveCards(cards);
  return entry;
}

function updateCard(id, updates) {
  const cards = loadCards();
  const idx = cards.findIndex(c => c.id === id);
  if (idx === -1) return;
  cards[idx] = { ...cards[idx], ...updates };
  saveCards(cards);
  // recalc all expenses using this card
  recalcExpensesForCard(id);
}

function deleteCard(id) {
  const cards = loadCards();
  saveCards(cards.filter(c => c.id !== id));
}

function getCardById(id) {
  return loadCards().find(c => c.id === id) || null;
}

function getCardColor(cardId) {
  const card = getCardById(cardId);
  return card ? card.color : '#888';
}

function getCardName(cardId) {
  const card = getCardById(cardId);
  return card ? card.name : '未知';
}

function recalcExpensesForCard(cardId) {
  const data = loadExpenses();
  let changed = false;
  data.forEach(e => {
    if (e.cardId === cardId && (e.type || 'expense') !== 'income') {
      const billing = getBillingInfo(e.date, e.cardId);
      Object.assign(e, billing);
      changed = true;
    }
  });
  if (changed) saveExpenses(data);
}

// ===== SETTINGS =====
function loadSettings() {
  return safeJSON(SETTINGS_KEY, {
    setupCompleted: false,
    incomeItems: [],
    fixedExpenseItems: [],
    customExpenseCategories: [],
    customIncomeCategories: [],
  });
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  if (typeof scheduleSyncToCloud === 'function') scheduleSyncToCloud();
}

// ===== SETTINGS MIGRATION =====
function migrateSettings() {
  const raw = safeJSON(SETTINGS_KEY, null);
  if (!raw) return;
  if (Array.isArray(raw.incomeItems)) return; // already migrated
  const migrated = {
    setupCompleted: true,
    incomeItems: [{ id: generateId(), label: '薪資', amount: raw.monthlyIncome || 0 }],
    fixedExpenseItems: [{ id: generateId(), label: '固定支出', amount: raw.fixedExpense || 0 }],
    customExpenseCategories: raw.customExpenseCategories || [],
    customIncomeCategories: raw.customIncomeCategories || [],
  };
  saveSettings(migrated);
}

function runMigrations() {
  migrateSettings();
  const s = loadSettings();
  if (!s.setupCompleted) {
    const hasData = loadExpenses().length > 0;
    const hasCards = loadCards().some(c => !c.isSystem);
    if (hasData || hasCards) {
      s.setupCompleted = true;
      saveSettings(s);
    }
  }
}

// ===== COMPUTED TOTALS =====
function getTotalMonthlyIncome() {
  return (loadSettings().incomeItems || []).reduce((sum, i) => sum + (i.amount || 0), 0);
}
function getTotalFixedExpense() {
  return (loadSettings().fixedExpenseItems || []).reduce((sum, i) => sum + (i.amount || 0), 0);
}
function getNetIncome() {
  return getTotalMonthlyIncome() - getTotalFixedExpense();
}
function isSetupCompleted() {
  return !!loadSettings().setupCompleted;
}

// ===== CUSTOM CATEGORIES =====
function getAllExpenseCategories() {
  return [...CATEGORIES, ...(loadSettings().customExpenseCategories || [])];
}
function getAllIncomeCategories() {
  return [...INCOME_CATEGORIES, ...(loadSettings().customIncomeCategories || [])];
}
function addCustomCategory(type, name, icon) {
  const s = loadSettings();
  const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
  if (!s[key]) s[key] = [];
  s[key].push({ name, icon });
  saveSettings(s);
}
function updateCustomCategory(type, oldName, newName, newIcon) {
  const s = loadSettings();
  const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
  const arr = s[key] || [];
  const idx = arr.findIndex(c => c.name === oldName);
  if (idx !== -1) {
    arr[idx] = { name: newName, icon: newIcon };
    saveSettings(s);
    if (oldName !== newName) {
      const data = loadExpenses();
      let changed = false;
      data.forEach(e => { if (e.category === oldName) { e.category = newName; changed = true; } });
      if (changed) saveExpenses(data);
    }
  }
}
function deleteCustomCategory(type, name) {
  const s = loadSettings();
  const key = type === 'expense' ? 'customExpenseCategories' : 'customIncomeCategories';
  s[key] = (s[key] || []).filter(c => c.name !== name);
  saveSettings(s);
}

// ===== BILLING LOGIC =====
function getBillingInfo(dateStr, cardId) {
  const card = getCardById(cardId);
  if (!card || card.billDay === 0) {
    return { billingStatus: '即時支出', billingMonth: null, dueDate: null };
  }
  const d = new Date(dateStr);
  const day = d.getDate(), month = d.getMonth(), year = d.getFullYear();

  let bYear, bMonth;
  if (day <= card.billDay) {
    bYear = year; bMonth = month;
  } else {
    if (month === 11) { bYear = year + 1; bMonth = 0; }
    else { bYear = year; bMonth = month + 1; }
  }

  let dueYear = bYear, dueMonth = bMonth + 1;
  if (dueMonth > 11) { dueYear++; dueMonth = 0; }

  return {
    billingStatus: (bYear === year && bMonth === month) ? '本月帳單' : '下月帳單',
    billingMonth: `${bYear}/${String(bMonth + 1).padStart(2, '0')}`,
    dueDate: `${dueYear}/${String(dueMonth + 1).padStart(2, '0')}/${String(card.dueDay).padStart(2, '0')}`,
  };
}

// ===== REPORT HELPERS =====
function getMonthExpenses(year, month) {
  return loadExpenses().filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function getReportData(year, month) {
  const monthStr = `${year}/${String(month + 1).padStart(2, '0')}`;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthStr = `${prevYear}/${String(prevMonth + 1).padStart(2, '0')}`;
  const allData = loadExpenses();
  const netIncome = getNetIncome();
  const monthExpenses = getMonthExpenses(year, month);

  // Bills with billingMonth = this month → paid NEXT month
  const billsDueNextMonth = allData.filter(e => e.billingMonth === monthStr);
  let nextMonthCardTotal = 0;
  const nextMonthByCard = {};
  billsDueNextMonth.forEach(e => {
    nextMonthCardTotal += e.amount;
    nextMonthByCard[e.cardId] = (nextMonthByCard[e.cardId] || 0) + e.amount;
  });

  // Bills with billingMonth = prev month → paid THIS month
  const billsDueThisMonth = allData.filter(e => e.billingMonth === prevMonthStr);
  let thisMonthCardTotal = 0;
  const thisMonthByCard = {};
  billsDueThisMonth.forEach(e => {
    thisMonthCardTotal += e.amount;
    thisMonthByCard[e.cardId] = (thisMonthByCard[e.cardId] || 0) + e.amount;
  });

  // Cash this month & extra income
  let cashSpend = 0;
  let monthExtraIncome = 0;
  const byCard = {};
  monthExpenses.forEach(e => {
    if ((e.type || 'expense') === 'income') {
      monthExtraIncome += e.amount;
      return;
    }
    const card = getCardById(e.cardId);
    if (card && card.billDay === 0) cashSpend += e.amount;
    byCard[e.cardId] = (byCard[e.cardId] || 0) + e.amount;
  });

  const estimatedSavings = netIncome + monthExtraIncome - nextMonthCardTotal - cashSpend;

  return {
    monthStr, netIncome, monthExpenses, cashSpend, monthExtraIncome,
    nextMonthCardTotal, nextMonthByCard,
    thisMonthCardTotal, thisMonthByCard, byCard, estimatedSavings,
    billsDueNextMonth, billsDueThisMonth,
  };
}

// ===== CSV EXPORT =====
function exportMonthCSV(year, month) {
  const data = getMonthExpenses(year, month);
  if (!data.length) return null;
  const monthStr = `${year}_${String(month + 1).padStart(2, '0')}`;
  const report = getReportData(year, month);

  let csv = '\ufeff';  // BOM for Excel
  csv += `${year}年${month + 1}月 記帳明細\n`;
  csv += '日期,類型,類別,備註,金額,付款方式,帳單狀態,帳單歸屬月份,繳款期限\n';
  data.sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const isIncome = (e.type || 'expense') === 'income';
    const typeLabel = isIncome ? '收入' : '支出';
    const amtStr = isIncome ? `+${e.amount}` : `${e.amount}`;
    const cardLabel = isIncome ? '' : getCardName(e.cardId);
    csv += `${e.date},${typeLabel},${e.category},${(e.note || '').replace(/,/g, '，')},${amtStr},${cardLabel},${e.billingStatus},${e.billingMonth || ''},${e.dueDate || ''}\n`;
  });

  csv += `\n--- 月度摘要 ---\n`;
  const expenseOnly = data.filter(e => (e.type || 'expense') !== 'income');
  csv += `本月消費總額,${expenseOnly.reduce((s, e) => s + e.amount, 0)}\n`;
  csv += `本月額外收入,${report.monthExtraIncome}\n`;
  csv += `現金支出,${report.cashSpend}\n`;
  csv += `下月需繳信用卡帳單,${report.nextMonthCardTotal}\n`;
  csv += `每月可用餘額,${report.netIncome}\n`;
  csv += `預估下月可存現金,${report.estimatedSavings}\n`;

  return { csv, filename: `記帳_${monthStr}.csv` };
}

// ===== BACKUP & RESTORE =====
function exportBackup() {
  return JSON.stringify({
    version: 3,
    timestamp: new Date().toISOString(),
    data: loadExpenses(),
    cards: loadCards(),
    settings: loadSettings(),
  });
}

function importBackup(jsonStr) {
  const backup = JSON.parse(jsonStr);
  if (!backup.version || !backup.data) throw new Error('無效的備份檔案');
  localStorage.setItem(DB_KEY, JSON.stringify(backup.data));
  if (backup.cards) localStorage.setItem(CARDS_KEY, JSON.stringify(backup.cards));
  if (backup.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
  if (typeof scheduleSyncToCloud === 'function') scheduleSyncToCloud();
  return backup.data.length;
}

// ===== DATA STATS =====
function getDataStats() {
  const data = loadExpenses();
  const raw = localStorage.getItem(DB_KEY) || '';
  return { count: data.length, sizeKB: Math.round(raw.length / 1024 * 10) / 10 };
}
