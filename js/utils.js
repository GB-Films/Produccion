window.U = (function(){
  function debounce(fn, wait=300){
    let t=null;
    return (...args)=>{
      clearTimeout(t);
      t=setTimeout(()=>fn(...args), wait);
    };
  }

  function safeJsonParse(str, fallback=null){
    if(str === null || str === undefined || str === "") return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function parseTableText(text){
    const rows = (text||"").trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    return rows.map(line=>{
      // detect TSV vs CSV-ish
      if(line.includes("\t")) return line.split("\t").map(x=>x.trim());
      // CSV simple
      return line.split(",").map(x=>x.trim());
    });
  }

  function isHeaderRow(row){
    const s = (row||[]).join(" ").toLowerCase();
    return s.includes("slug") || s.includes("location") || s.includes("time") || s.includes("summary");
  }

  return { debounce, safeJsonParse, parseTableText, isHeaderRow };
})();
