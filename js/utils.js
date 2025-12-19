(function(){
  function uid(prefix="id"){
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function nowISO(){
    return new Date().toISOString();
  }

  function debounce(fn, ms){
    let t = null;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=>fn.apply(this,args), ms);
    };
  }

  function safeJsonParse(str, fallback=null){
    if (str === null || str === undefined || str === "") return fallback;
    try{ return JSON.parse(str); }catch{ return fallback; }
  }


  function parseTableText(text){
    // Acepta CSV simple o TSV. Separa por \n y detecta separador por primera línea.
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if(!lines.length) return [];
    const sep = (lines[0].includes("\t")) ? "\t" : ",";
    return lines.map(line => line.split(sep).map(c => c.trim()));
  }

  function isHeaderRow(row){
    const joined = row.join(" ").toLowerCase();
    return ["number","slugline","location","timeofday","pages","summary"].some(k => joined.includes(k));
  }

  function moneyARS(n){
    const v = Number(n || 0);
    return v.toLocaleString("es-AR", { style:"currency", currency:"ARS", maximumFractionDigits: 0 });
  }

  window.U = { uid, nowISO, debounce, safeJsonParse, parseTableText, isHeaderRow, moneyARS };
})();

