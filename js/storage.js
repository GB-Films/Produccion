window.StorageLayer = (function(){
  const KEY_STATE = "gb_prod_state_v1";
  const KEY_CFG   = "gb_prod_cfg_v1";

  function loadLocal(){
    try{
      const raw = localStorage.getItem(KEY_STATE);
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  }
  function saveLocal(state){
    localStorage.setItem(KEY_STATE, JSON.stringify(state));
  }

  function loadCfg(){
    try{
      const raw = localStorage.getItem(KEY_CFG);
      return raw ? JSON.parse(raw) : { binId:"", accessKey:"", autosync:"off", resetKey:"" };
    }catch{
      return { binId:"", accessKey:"", autosync:"off", resetKey:"" };
    }
  }
  function saveCfg(cfg){
    localStorage.setItem(KEY_CFG, JSON.stringify(cfg));
  }

  async function jsonbinGet(binId, accessKey){
    const res = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`, {
      headers: { "X-Access-Key": accessKey }
    });
    if(!res.ok) throw new Error(`JSONBin GET failed: ${res.status}`);
    const data = await res.json();
    return data?.record ?? null;
  }

  async function jsonbinPut(binId, accessKey, record){
    const res = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`, {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(record)
    });
    if(!res.ok) throw new Error(`JSONBin PUT failed: ${res.status}`);
    return await res.json();
  }

  function hardResetLocal(){
    localStorage.removeItem(KEY_STATE);
  }

  return { loadLocal, saveLocal, loadCfg, saveCfg, jsonbinGet, jsonbinPut, hardResetLocal };
})();
