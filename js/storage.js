window.StorageLayer = (function(){
  const LS_STATE_KEY = "prodboard_state_v2";
  const LS_CFG_KEY   = "prodboard_jsonbin_cfg_v1";
  const LS_RESET_KEY = "prodboard_reset_key_v1";

  function loadLocal(){
    return window.U.safeJsonParse(localStorage.getItem(LS_STATE_KEY), null);
  }
  function saveLocal(state){
    localStorage.setItem(LS_STATE_KEY, JSON.stringify(state));
  }

  function loadCfg(){
    const parsed = window.U.safeJsonParse(localStorage.getItem(LS_CFG_KEY), null);
    return (parsed && typeof parsed === "object")
      ? parsed
      : { binId:"", accessKey:"", autosync:"on" };
  }
  function saveCfg(cfg){
    localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));
  }

  function setResetKey(k){ localStorage.setItem(LS_RESET_KEY, k); }
  function getResetKey(){ return localStorage.getItem(LS_RESET_KEY) || ""; }

  async function jsonbinGet(binId, accessKey){
    const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`,{
      headers: { "X-Access-Key": accessKey }
    });
    if(!r.ok) throw new Error(`GET ${r.status}`);
    const j = await r.json();
    return j.record;
  }

  async function jsonbinPut(binId, accessKey, record){
    const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}`,{
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(record)
    });
    if(!r.ok) throw new Error(`PUT ${r.status}`);
    const j = await r.json();
    return j;
  }

  async function testJsonbin(binId, accessKey){
    const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`,{
      headers: { "X-Access-Key": accessKey }
    });
    if(!r.ok) throw new Error(`TEST ${r.status}`);
    return true;
  }

  return {
    loadLocal, saveLocal,
    loadCfg, saveCfg,
    setResetKey, getResetKey,
    jsonbinGet, jsonbinPut, testJsonbin
  };
})();
