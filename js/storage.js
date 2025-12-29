window.StorageLayer = (function(){
  // Local storage keys (namespaced per project)
  const KEY_ACTIVE_PROJECT = "gb_active_project_v1";
  const KEY_STATE_PREFIX   = "gb_prod_state_v1__";
  const KEY_CFG            = "gb_prod_cfg_v1";
  const KEY_REMOTE_STAMP_PREFIX = "gb_remote_stamp_v1__";

  // JSONBin (fixed for this repo)
  const ACCESS_KEY = "$2a$10$nzjX1kWtm5vCMZj8qtlSoeP/kUp77ZWnpFE6kWIcnBqe1fDL1lkDi";

  // Two trusted projects (switchable)
  const PROJECTS = [
    { id:"casona", name:"LA CASONA", binId:"6945d8e2ae596e708fa5c4d9", theme:"default" },
    { id:"jyp", name:"JUBILADA Y PELIGROSA", binId:"694b0c25ae596e708fad1e75", theme:"pink" }
  ];

  function getProjects(){
    return PROJECTS.map(p=>({ id:p.id, name:p.name, theme:p.theme, binId:p.binId }));
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
    // Always return fixed credentials, autosync ON, and active project info
    const p = getActiveProject();
    const safe = {
      projectId: p.id,
      projectName: p.name,
      theme: p.theme,
      binId: p.binId,
      accessKey: ACCESS_KEY,
      autosync: "on",
      projects: getProjects()
    };
    try{ localStorage.setItem(KEY_CFG, JSON.stringify(safe)); }catch{}
    return safe;
  }

  function saveCfg(cfg){
    // Ignore custom credentials/autosync; only accept projectId changes
    if(cfg && typeof cfg === "object" && typeof cfg.projectId === "string"){
      if(PROJECTS.some(p=>p.id === cfg.projectId)){
        try{ localStorage.setItem(KEY_ACTIVE_PROJECT, cfg.projectId); }catch{}
      }
    }
    // keep cfg visible for forward compatibility / visibility
    loadCfg();
  }

  async function jsonbinGet(binId, accessKey){
    const res = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}/latest`, {
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
    if(!res.ok) throw new Error(`JSONBin GET failed: ${res.status}`);
    const data = await res.json();
    return data?.record ?? null;
  }

  async function jsonbinPut(binId, accessKey, record){
    const res = await fetch(`https://api.jsonbin.io/v3/b/${encodeURIComponent(binId)}`, {
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
    if(!res.ok) throw new Error(`JSONBin PUT failed: ${res.status}`);
    return await res.json();
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