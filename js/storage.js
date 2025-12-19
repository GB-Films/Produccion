(function(){
  const LS_STATE_KEY = "prodboard_state_v1";
  const LS_CFG_KEY   = "prodboard_jsonbin_cfg_v1";
  const LS_RESET_KEY = "prodboard_reset_key_v1";

  function loadLocal(){
    const raw = localStorage.getItem(LS_STATE_KEY);
    return window.U.safeJsonParse(raw, null);
  }

  function saveLocal(state){
    localStorage.setItem(LS_STATE_KEY, JSON.stringify(state));
  }

  function loadCfg(){
    return window.U.safeJsonParse(localStorage.getItem(LS_CFG_KEY), {
      binId: "",
      accessKey: "",
      autosync: "on"
    });
  }

  function saveCfg(cfg){
    localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));
  }

  function setResetKey(key){
    localStorage.setItem(LS_RESET_KEY, key || "");
  }

  function getResetKey(){
    return localStorage.getItem(LS_RESET_KEY) || "";
  }

  async function jsonbinGet(binId, accessKey){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Access-Key": accessKey
      }
    });
    const txt = await res.text();
    if(!res.ok) throw new Error(`JSONBin GET ${res.status}: ${txt}`);
    const data = JSON.parse(txt);
    // JSONBin devuelve {record, metadata}
    return data && data.record ? data.record : data;
  }

  async function jsonbinPut(binId, accessKey, record){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(record)
    });
    const txt = await res.text();
    if(!res.ok) throw new Error(`JSONBin PUT ${res.status}: ${txt}`);
    return JSON.parse(txt);
  }

  async function testJsonbin(binId, accessKey){
    const r = await jsonbinGet(binId, accessKey);
    return !!r;
  }

  window.StorageLayer = {
    loadLocal, saveLocal,
    loadCfg, saveCfg,
    setResetKey, getResetKey,
    jsonbinGet, jsonbinPut, testJsonbin
  };
})();
