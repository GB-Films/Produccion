window.U = {
  debounce(fn, wait=200){
    let t=null;
    return (...args)=>{
      clearTimeout(t);
      t=setTimeout(()=>fn(...args), wait);
    };
  },

  parseTableText(txt){
    const lines = String(txt||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const rows = [];
    for(const line of lines){
      // soporta TSV, CSV suave, o espacios múltiples
      let parts;
      if(line.includes("\t")) parts = line.split("\t");
      else if(line.includes(",")) parts = line.split(",").map(s=>s.trim());
      else parts = line.split(/\s{2,}/g); // dos o más espacios
      rows.push(parts.map(s=>String(s??"").trim()));
    }
    return rows;
  },

  isHeaderRow(row){
    const r = (row||[]).map(s=>String(s||"").toLowerCase());
    return r.includes("number") || r.includes("slugline") || r.includes("location") || r.includes("timeofday") || r.includes("pages");
  }
};
