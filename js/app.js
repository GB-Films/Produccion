window.StorageLayer = (function(){
  const LS_KEY = "prodboard_state_v6";
  const CFG_KEY = "prodboard_cfg_v2";

  function saveLocal(state){
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
  function loadLocal(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch{return null;}
  }

  function saveCfg(cfg){
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }
  function loadCfg(){
    try{
      const raw = localStorage.getItem(CFG_KEY);
      if(!raw) return {binId:"", accessKey:"", autosync:"off", resetKeyHash:""};
      const c = JSON.parse(raw);
      return {
        binId: c.binId || "",
        accessKey: c.accessKey || "",
        autosync: c.autosync || "off",
        resetKeyHash: c.resetKeyHash || ""
      };
    }catch{
      return {binId:"", accessKey:"", autosync:"off", resetKeyHash:""};
    }
  }

  async function jsonbinGet(binId, accessKey){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`;
    const res = await fetch(url, {
      method:"GET",
      headers:{
        "X-Access-Key": accessKey
      }
    });
    if(!res.ok) throw new Error(`GET failed: ${res.status}`);
    const data = await res.json();
    return data && data.record ? data.record : data;
  }

  async function jsonbinPut(binId, accessKey, record){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`;
    const res = await fetch(url, {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(record)
    });
    if(!res.ok) throw new Error(`PUT failed: ${res.status}`);
    return await res.json();
  }

  async function sha256(text){
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(text)));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  return { saveLocal, loadLocal, saveCfg, loadCfg, jsonbinGet, jsonbinPut, sha256 };
})();
