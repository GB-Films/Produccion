window.U = {
  debounce(fn, ms){
    let t = null;
    return (...args)=>{
      clearTimeout(t);
      t = setTimeout(()=>fn(...args), ms);
    };
  },

  parseTableText(txt){
    const lines = (txt||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    return lines.map(l=> l.split(/\t| {2,}|;|,/g).map(x=>x.trim()));
  },

  isHeaderRow(row){
    const h = (row||[]).join(" ").toLowerCase();
    return h.includes("slug") || h.includes("loc") || h.includes("tod") || h.includes("pág") || h.includes("pag");
  }
};
