// idb.js — helpers mínimos IndexedDB para guardar/restaurar handles

const DB_NAME = 'ms_fs_handles';
const STORE = 'handles';

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function idbSet(key, value){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

export async function idbGet(key){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(STORE,'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
