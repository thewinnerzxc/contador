// csv.js — utilidades CSV (ahora incluye 'estado')

export function toCSV(arr){
  const header = ['id','fecha','tipo','email','whatsapp','estado','comentario'];
  const lines = [header.join(',')];
  for(const r of arr){
    lines.push([
      r.id,
      q(r.fecha),
      q(r.tipo),
      q(r.email),
      q(r.whatsapp),
      q(r.estado ? 'completado' : 'pendiente'),
      q(r.comentario)
    ].join(','));
  }
  return lines.join('\n');

  function q(v){
    const s = (v ?? '').toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }
}

export function parseCSV(text){
  if(!text?.trim()) return [];
  const rows = [];
  const re = /("([^"]|"")*"|[^,\n\r]*)(,|\r?\n|$)/g;
  const lines = text.replace(/\r\n/g,'\n').split('\n');
  const header = lines.shift()?.split(',').map(s=>s.trim()) || [];
  const idx = (k)=> header.findIndex(h=>h.toLowerCase()===k);
  const idI=idx('id'), fI=idx('fecha'), tI=idx('tipo'), eI=idx('email'),
        wI=idx('whatsapp'), sI=idx('estado'), cI=idx('comentario');

  function splitCSV(line){
    const out=[]; let m; re.lastIndex=0;
    while((m=re.exec(line))){ let cell=m[1]||''; if(cell.startsWith('"')) cell=cell.slice(1,-1).replace(/""/g,'"'); out.push(cell); if(!m[3]) break; if(m[3]==='\n' || m[3]==='') break; }
    return out;
  }

  const isDone = (v)=>{
    const x = (v||'').toString().trim().toLowerCase();
    return x==='1' || x==='true' || x==='si' || x==='sí' || x==='ok' || x==='done' || x==='completado';
  };

  for(const ln of lines){
    if(!ln.trim()) continue;
    const parts = splitCSV(ln);
    rows.push({
      id: +((idI>=0?parts[idI]:rows.length+1) || rows.length+1),
      fecha: (fI>=0?parts[fI]:new Date().toISOString().replace('T',' ').slice(0,19)),
      tipo:  (tI>=0?parts[tI]:''),
      email: (eI>=0?parts[eI]:''),
      whatsapp: (wI>=0?parts[wI]:''),
      estado: (sI>=0 ? isDone(parts[sI]) : true), // retro-compatible: si no hay columna, queda pendiente
      comentario: (cI>=0?parts[cI]:'')
    });
  }
  return rows;
}
