window.StorageLayer = (function(){
  const KEY_STATE = "gb_prod_state_v1";
  const KEY_CFG   = "gb_prod_cfg_v1";

  // JSONBin (fixed for this repo)
  const DEFAULT_BIN_ID = "6945d8e2ae596e708fa5c4d9";
  const DEFAULT_ACCESS_KEY = "$2a$10$nzjX1kWtm5vCMZj8qtlSoeP/kUp77ZWnpFE6kWIcnBqe1fDL1lkDi";

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
    // Always return fixed credentials and autosync ON
    try{
      // keep a copy in localStorage for forward compatibility / visibility
      const safe = { binId: DEFAULT_BIN_ID, accessKey: DEFAULT_ACCESS_KEY, autosync: "on" };
      localStorage.setItem(KEY_CFG, JSON.stringify(safe));
      return safe;
    }catch{
      return { binId: DEFAULT_BIN_ID, accessKey: DEFAULT_ACCESS_KEY, autosync: "on" };
    }
  }
  function saveCfg(_cfg){
    // Ignore custom cfg; keep it fixed
    const safe = { binId: DEFAULT_BIN_ID, accessKey: DEFAULT_ACCESS_KEY, autosync: "on" };
    localStorage.setItem(KEY_CFG, JSON.stringify(safe));
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
    // still used internally for rare recovery scripts
    localStorage.removeItem(KEY_STATE);
  }

  return { loadLocal, saveLocal, loadCfg, saveCfg, jsonbinGet, jsonbinPut, hardResetLocal };
})();
