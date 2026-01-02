// fs.js — File System Access helpers
import { toCSV, parseCSV } from './csv.js';
import { idbGet, idbSet } from './idb.js';

export let dirHandle = null;     // cuando se trabaja con carpeta
export let fileHandle = null;    // cuando se trabaja con archivo directo
let mode = null;                 // 'dir' | 'file' | null
const KEY = 'ms_activity_handle'; // clave en IndexedDB
const FILENAME = 'activities.csv';

async function ensurePermission(handle, write=false){
  if(!handle) return false;
  const opts = write ? {mode:'readwrite'} : {};
  const q = await handle.queryPermission?.(opts);
  if(q === 'granted') return true;
  const r = await handle.requestPermission?.(opts);
  return r === 'granted';
}

export async function pickFolder(){
  if(!('showDirectoryPicker' in window) && !('showOpenFilePicker' in window) && !('showSaveFilePicker' in window)){
    throw new Error('File System Access API no soportada');
  }

  // 1) Intento CARPETA
  try{
    if('showDirectoryPicker' in window){
      dirHandle = await window.showDirectoryPicker();
      fileHandle = await dirHandle.getFileHandle(FILENAME, {create:true});
      const ok = await ensurePermission(fileHandle, true);
      if(!ok) throw new Error('Permiso denegado');
      mode = 'dir';
      await idbSet(KEY, {mode, handle: dirHandle});
      return {mode};
    }
  }catch(e){
    if(e.name === 'AbortError') throw e; // usuario canceló
    // sigue a fallback
  }

  // 2) Intento ABRIR archivo existente
  try{
    if('showOpenFilePicker' in window){
      const [fh] = await window.showOpenFilePicker({
        multiple:false,
        types:[{description:'CSV', accept:{'text/csv':['.csv']}}]
      });
      fileHandle = fh; dirHandle = null; mode='file';
      const ok = await ensurePermission(fileHandle,true);
      if(!ok) throw new Error('Permiso denegado');
      await idbSet(KEY,{mode, handle:fileHandle});
      return {mode};
    }
  }catch(e){
    if(e.name === 'AbortError') throw e;
  }

  // 3) Guardar como NUEVO
  const fh = await window.showSaveFilePicker({
    suggestedName: FILENAME,
    types:[{description:'CSV', accept:{'text/csv':['.csv']}}]
  });
  fileHandle = fh; dirHandle = null; mode='file';
  const ok = await ensurePermission(fileHandle,true);
  if(!ok) throw new Error('Permiso denegado');
  await idbSet(KEY,{mode, handle:fileHandle});
  return {mode};
}

export async function tryReconnect(setFolderUI){
  const saved = await idbGet(KEY);
  if(!saved) return false;

  try{
    if(saved.mode === 'dir' && saved.handle){
      const ok = await ensurePermission(saved.handle,false);
      if(ok){
        dirHandle = saved.handle;
        mode = 'dir';
        // obtener fileHandle
        try{
          fileHandle = await dirHandle.getFileHandle(FILENAME, {create:true});
        }catch{ fileHandle = await dirHandle.getFileHandle(FILENAME, {create:true}); }
        setFolderUI?.(true,'reconectada');
        return true;
      }
    }
    if(saved.mode === 'file' && saved.handle){
      const ok = await ensurePermission(saved.handle,false);
      if(ok){
        fileHandle = saved.handle;
        dirHandle = null;
        mode='file';
        setFolderUI?.(true,'reconectado archivo');
        return true;
      }
    }
  }catch(ex){
    console.warn('tryReconnect error', ex);
  }
  return false;
}

export function isConnected(){ return !!(fileHandle || dirHandle); }
export function connectionLabel(){ return mode==='dir' ? 'Carpeta conectada' : (mode==='file' ? 'Archivo conectado' : '—'); }

export async function loadCsvFromFolder(){
  if(!isConnected()) return null;

  try{
    let file;
    if(mode==='dir'){
      try{ const fh = await dirHandle.getFileHandle(FILENAME, {create:false}); file = await fh.getFile(); }
      catch{ return []; } // si no existe, devolvemos vacío
    }else{
      file = await fileHandle.getFile();
    }
    const text = await file.text();
    return parseCSV(text);
  }catch(ex){
    console.error('loadCsvFromFolder error:', ex);
    return [];
  }
}

export async function saveAllFiles(allRows){
  if(!isConnected()) return false;
  const csv = toCSV(allRows);
  if(mode==='dir'){
    const fh = await dirHandle.getFileHandle(FILENAME, {create:true});
    const w = await fh.createWritable();
    await w.write(csv); await w.close();
    return true;
  }else{
    const w = await fileHandle.createWritable();
    await w.write(csv); await w.close();
    return true;
  }
}
