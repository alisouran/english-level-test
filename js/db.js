/* ═══════════════════════════════════════════
   LingoQuest — IndexedDB Persistence Layer
   User profiles, test results, seen-question tracking
   ═══════════════════════════════════════════ */

const DB_NAME = "LingoQuestDB";
const DB_VERSION = 1;
const PROFILES_STORE = "profiles";
const RESULTS_STORE = "results";

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(RESULTS_STORE)) {
        const store = db.createObjectStore(RESULTS_STORE, { keyPath: "resultId" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function initDB() {
  if (_db) return _db;
  return openDB();
}

/* ── User ID ───────────────────────────── */
export function getUserId() {
  let uid = localStorage.getItem("lingoquest_userId");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("lingoquest_userId", uid);
  }
  return uid;
}

export function clearUserId() {
  localStorage.removeItem("lingoquest_userId");
}

/* ── Profile ───────────────────────────── */
export async function getOrCreateProfile(userId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, "readwrite");
    const store = tx.objectStore(PROFILES_STORE);
    const getReq = store.get(userId);
    getReq.onsuccess = () => {
      if (getReq.result) {
        resolve(getReq.result);
      } else {
        const profile = {
          userId,
          name: "",
          createdAt: Date.now(),
          totalTests: 0,
          lastTestDate: null,
          latestTheta: null,
          latestCefr: null,
          thetaHistory: [],
          cefrHistory: [],
          lastResultId: null,
        };
        store.put(profile);
        resolve(profile);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function updateProfile(userId, updates) {
  const db = await initDB();
  const profile = await getOrCreateProfile(userId);
  Object.assign(profile, updates);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROFILES_STORE, "readwrite");
    tx.objectStore(PROFILES_STORE).put(profile);
    tx.oncomplete = () => resolve(profile);
    tx.onerror = () => reject(tx.error);
  });
}

/* ── Results ───────────────────────────── */
export async function saveResult(resultData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULTS_STORE, "readwrite");
    tx.objectStore(RESULTS_STORE).put(resultData);
    tx.oncomplete = () => resolve(resultData);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getResultsByUser(userId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULTS_STORE, "readonly");
    const index = tx.objectStore(RESULTS_STORE).index("userId");
    const req = index.getAll(userId);
    req.onsuccess = () => {
      const results = req.result || [];
      results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getResultById(resultId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULTS_STORE, "readonly");
    const req = tx.objectStore(RESULTS_STORE).get(resultId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* ── Seen questions ────────────────────── */
export async function getSeenQuestionIds(userId) {
  const results = await getResultsByUser(userId);
  const ids = new Set();
  for (const r of results) {
    if (r.responses && Array.isArray(r.responses)) {
      for (const resp of r.responses) {
        if (resp.qId) ids.add(resp.qId);
      }
    }
  }
  return ids;
}

/* ── Clear all data ────────────────────── */
export async function clearAllData() {
  if (_db) _db.close();
  _db = null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}