// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: 'AIzaSyClVIU98HyvXOm_T9RS-bfIasFSr9M44PQ',
  authDomain: 'expense-tracker-964b2.firebaseapp.com',
  projectId: 'expense-tracker-964b2',
  storageBucket: 'expense-tracker-964b2.firebasestorage.app',
  messagingSenderId: '189816387543',
  appId: '1:189816387543:web:fcc3ab514c8a9a072a7d92',
};

// ===== STATE =====
let _db = null;
let _auth = null;
let _currentUser = null;

// ===== INITIALIZATION =====
function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  _auth = firebase.auth();
  _db = firebase.firestore();
  _db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    console.warn('Firestore persistence failed:', err.code);
  });
}

// ===== AUTH =====
function getCurrentUser() {
  return _currentUser;
}

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  return _auth.signInWithPopup(provider);
}

function firebaseSignOut() {
  return _auth.signOut();
}

function onAuthChanged(callback) {
  _auth.onAuthStateChanged(user => {
    _currentUser = user;
    callback(user);
  });
}

// ===== FIRESTORE SYNC =====
function _userDoc(name) {
  if (!_currentUser) return null;
  return _db.collection('users').doc(_currentUser.uid).collection('store').doc(name);
}

async function syncToCloud() {
  if (!_currentUser) return;
  try {
    const expenses = loadExpenses();
    const cards = loadCards();
    const settings = loadSettings();
    await Promise.all([
      _userDoc('expenses').set({ items: expenses }),
      _userDoc('cards').set({ items: cards }),
      _userDoc('settings').set(settings),
    ]);
  } catch (err) {
    console.error('syncToCloud failed:', err);
  }
}

async function syncFromCloud() {
  if (!_currentUser) return false;
  try {
    const [expSnap, cardSnap, setSnap] = await Promise.all([
      _userDoc('expenses').get(),
      _userDoc('cards').get(),
      _userDoc('settings').get(),
    ]);

    const cloudHasData = expSnap.exists && expSnap.data().items && expSnap.data().items.length > 0;
    const localHasData = loadExpenses().length > 0;

    if (!cloudHasData && localHasData) {
      // First login migration: push local data to cloud
      await syncToCloud();
      return true;
    }

    if (cloudHasData) {
      if (localHasData && localStorage.getItem('auto_backup_on_sync') === 'true') {
        _autoBackupLocal();
      }
      localStorage.setItem(DB_KEY, JSON.stringify(expSnap.data().items));
    }
    if (cardSnap.exists && cardSnap.data().items) {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cardSnap.data().items));
    }
    if (setSnap.exists) {
      const setData = setSnap.data();
      if (setData.monthlyIncome !== undefined) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(setData));
      }
    }
    return true;
  } catch (err) {
    console.error('syncFromCloud failed:', err);
    return false;
  }
}

function _autoBackupLocal() {
  try {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `記帳備份_auto_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    console.warn('Auto backup failed:', e);
  }
}

// Debounced sync: avoid hammering Firestore on rapid edits
let _syncTimer = null;
function scheduleSyncToCloud() {
  if (!_currentUser) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => syncToCloud(), 1000);
}

// Best-effort sync on page unload
window.addEventListener('beforeunload', () => {
  if (_currentUser && _syncTimer) {
    clearTimeout(_syncTimer);
    syncToCloud();
  }
});
