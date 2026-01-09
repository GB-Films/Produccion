window.StorageLayer = (function(){
  // Local storage keys (namespaced per project)
  const KEY_ACTIVE_PROJECT = "gb_active_project_v1";
  const KEY_STATE_PREFIX   = "gb_prod_state_v1__";
  const KEY_CFG            = "gb_prod_cfg_v1";
  const KEY_REMOTE_STAMP_PREFIX = "gb_remote_stamp_v1__";
  const KEY_ACCESS_OVERRIDE_PREFIX = "gb_access_key_v1__";
  const KEY_AUTOSYNC_PREF = "gb_autosync_pref_v1";

  // JSONBin (fixed for this repo)
  const ACCESS_KEY = "$2a$10$nzjX1kWtm5vCMZj8qtlSoeP/kUp77ZWnpFE6kWIcnBqe1fDL1lkDi";

  // Two trusted projects (switchable)
  const PROJECTS = [
    { id:"casona", name:"LA CASONA", binId:"6945d8e2ae596e708fa5c4d9", scriptBinId:"69605c5dae596e708fcee467", theme:"default" },
    { id:"jyp", name:"JUBILADA Y PELIGROSA", binId:"694b0c25ae596e708fad1e75", scriptBinId:"69605cc5ae596e708fcee544", theme:"pink" }
  ];

  function getProjects(){
    return PROJECTS.map(p=>({ id:p.id, name:p.name, theme:p.theme, binId:p.binId, scriptBinId: p.scriptBinId || "" }));
  }

  function getActiveProjectId(){
    try{
      const raw = localStorage.getItem(KEY_ACTIVE_PROJECT);
      const ok = PROJECTS.some(p=>p.id === raw);
      return ok ? raw : PROJECTS[0].id;
    }catch{
      return PROJECTS[0].id;
    }
  }

  function setActiveProjectId(id){
    if(!PROJECTS.some(p=>p.id === id)) return;
    try{ localStorage.setItem(KEY_ACTIVE_PROJECT, id); }catch{}
    // keep cfg visible for debug
    saveCfg({});
  }

  function getActiveProject(){
    const id = getActiveProjectId();
    return PROJECTS.find(p=>p.id === id) || PROJECTS[0];
  }

  function keyState(){
    const p = getActiveProject();
    // Use binId in case project ids change
    return KEY_STATE_PREFIX + p.binId;
  }

  function loadLocal(){
    try{
      const raw = localStorage.getItem(keyState());
      return raw ? JSON.parse(raw) : null;
    }catch{ return null; }
  }

  function saveLocal(state){
    try{ localStorage.setItem(keyState(), JSON.stringify(state)); }
    catch(e){ /* ignore (quota/private mode) */ }
  }

  function loadCfg(){
    // Return active project info + credentials.
    // Access key can be overridden locally to avoid redeploys when JSONBin keys rotate.
    const p = getActiveProject();
    const accessOverride = getAccessKeyOverride(p.binId);
    const autosyncPref = getAutosyncPref();
    const safe = {
      projectId: p.id,
      projectName: p.name,
      theme: p.theme,
      binId: p.binId,
      scriptBinId: p.scriptBinId || "",
      accessKey: accessOverride || ACCESS_KEY,
      autosync: autosyncPref,
      projects: getProjects()
    };
    try{ localStorage.setItem(KEY_CFG, JSON.stringify(safe)); }catch{}
    return safe;
  }

  function saveCfg(cfg){
    // Accept projectId changes. Optionally accept accessKey/autosync prefs.
    if(cfg && typeof cfg === "object"){
      if(typeof cfg.projectId === "string" && PROJECTS.some(p=>p.id === cfg.projectId)){
        try{ localStorage.setItem(KEY_ACTIVE_PROJECT, cfg.projectId); }catch{}
      }

      // Store access key override per-bin (optional)
      if(typeof cfg.accessKey === "string"){
        const p = getActiveProject();
        setAccessKeyOverride(p.binId, cfg.accessKey);
      }

      // Store autosync preference
      if(typeof cfg.autosync === "string"){
        setAutosyncPref(cfg.autosync);
      }
    }
    // keep cfg visible for forward compatibility / visibility
    loadCfg();
  }

  function keyAccessOverride(binId){
    return KEY_ACCESS_OVERRIDE_PREFIX + String(binId||"");
  }
  function getAccessKeyOverride(binId){
    try{ return localStorage.getItem(keyAccessOverride(binId)) || ""; }catch{ return ""; }
  }
  function setAccessKeyOverride(binId, key){
    try{
      const k = String(key||"").trim();
      if(!k){ localStorage.removeItem(keyAccessOverride(binId)); return; }
      localStorage.setItem(keyAccessOverride(binId), k);
    }catch{}
  }
  function getAutosyncPref(){
    try{
      const v = (localStorage.getItem(KEY_AUTOSYNC_PREF) || "on").trim().toLowerCase();
      return (v === "off" || v === "0" || v === "false") ? "off" : "on";
    }catch{ return "on"; }
  }
  function setAutosyncPref(v){
    try{
      const norm = String(v||"").trim().toLowerCase();
      localStorage.setItem(KEY_AUTOSYNC_PREF, (norm === "off" || norm === "0" || norm === "false") ? "off" : "on");
    }catch{}
  }

  async function jsonbinRequest(url, opts){
    const res = await fetch(url, opts);
    const txt = await res.text().catch(()=>"");
    let json = null;
    try{ json = txt ? JSON.parse(txt) : null; }catch(_e){}

    if(!res.ok){
      const msg = (json && (json.message || json.error)) ? String(json.message || json.error) : String(txt||"");
      const extra = msg ? (" - " + msg) : "";
      throw new Error(`JSONBin ${opts?.method||'GET'} failed: ${res.status}${extra}`);
    }
    return json;
  }

  async function jsonbinGet(binId, accessKey){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`;
    const data = await jsonbinRequest(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "X-Access-Key": accessKey,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
    return data?.record ?? null;
  }

  async function jsonbinPut(binId, accessKey, record){
    const url = `https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`;
    return await jsonbinRequest(url, {
      method:"PUT",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers:{
        "Content-Type":"application/json",
        "Accept": "application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(record)
    });
  }


  function keyRemoteStamp(binId){
    return KEY_REMOTE_STAMP_PREFIX + String(binId||"");
  }
  function getRemoteStamp(binId){
    try{ return localStorage.getItem(keyRemoteStamp(binId)) || ""; }catch{ return ""; }
  }
  function setRemoteStamp(binId, stamp){
    try{ localStorage.setItem(keyRemoteStamp(binId), String(stamp||"")); }catch{}
  }

  function hardResetLocal(){
    try{ localStorage.removeItem(keyState()); }catch(e){}
  }

  return {
    loadLocal, saveLocal,
    loadCfg, saveCfg,
    jsonbinGet, jsonbinPut,
    getRemoteStamp, setRemoteStamp,
    hardResetLocal,
    getProjects, getActiveProjectId, setActiveProjectId, getActiveProject
  };
})();