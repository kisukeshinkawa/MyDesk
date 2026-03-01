import React, { useState, useEffect, useRef } from "react";

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:""};}
  static getDerivedStateFromError(e){return{hasError:true,error:e?.message||String(e)};}
  componentDidCatch(e,info){console.error("ErrorBoundary caught:",e,info);}
  render(){
    if(this.state.hasError){
      return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,padding:"2rem",textAlign:"center"}}>
          <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:"1rem",color:"#dc2626",marginBottom:"0.5rem"}}>表示エラーが発生しました</div>
          <div style={{fontSize:"0.78rem",color:"#6b7280",marginBottom:"1.5rem",maxWidth:300}}>{this.state.error}</div>
          <button onClick={()=>this.setState({hasError:false,error:""})}
            style={{padding:"0.625rem 1.5rem",borderRadius:"0.75rem",border:"none",background:"#2563eb",color:"white",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            ← 戻る / 再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["未着手","進行中","先方待ち","保留","完了"];
const STATUS_META = {
  "未着手":  { color:"#475569", bg:"#f1f5f9", dot:"#94a3b8" },
  "進行中":  { color:"#1d4ed8", bg:"#dbeafe", dot:"#3b82f6" },
  "先方待ち":{ color:"#1d4ed8", bg:"#fef3c7", dot:"#f59e0b" },
  "保留":    { color:"#4b5563", bg:"#f3f4f6", dot:"#9ca3af" },
  "完了":    { color:"#065f46", bg:"#d1fae5", dot:"#10b981" },
};
const C = {
  bg:"#f0f5ff", surface:"#ffffff",
  border:"#dbe4f5", borderLight:"#eef2fb",
  text:"#0f172a", textSub:"#64748b", textMuted:"#94a3b8",
  accent:"#2563eb", accentDark:"#1d4ed8", accentBg:"#eff6ff",
  blue:"#2563eb", blueBg:"#eff6ff",
  shadow:"0 1px 4px rgba(0,0,0,0.07)",
  shadowMd:"0 8px 30px rgba(0,0,0,0.12)",
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const SESSION_KEY = "mydesk_session_v2";

// ─── SUPABASE 設定 ────────────────────────────────────────────────────────────
const SB_URL = "https://lnzczkwnvkjacrmkhyft.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuemN6a3dudmtqYWNybWtoeWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDQwOTUsImV4cCI6MjA4NzcyMDA5NX0.Jx89KsMXlDQCNvuxeRyfLsfAkmkVB5-MeabMq9g1j4Y";
const SB_HEADERS = {
  "apikey": SB_KEY,
  "Authorization": `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(id) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.${encodeURIComponent(id)}&select=data`, { headers: SB_HEADERS });
    const rows = await r.json();
    return rows?.[0]?.data ?? null;
  } catch { return null; }
}

async function sbSet(id, data) {
  try {
    await fetch(`${SB_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id, data, updated_at: new Date().toISOString() }),
    });
  } catch {}
}

const INIT = { tasks:[], projects:[], emails:[], emailStyles:[], prefectures:[], municipalities:[], vendors:[], companies:[], notifications:[], changeLogs:[], analytics:{} };

// ─── SALES CONSTANTS ──────────────────────────────────────────────────────────
const DUSTALK_STATUS = {
  "展開":   { color:"#059669", bg:"#d1fae5", icon:"✅" },
  "未展開": { color:"#6b7280", bg:"#f3f4f6", icon:"⬜" },
};
const TREATY_STATUS = {
  "未接触": { color:"#6b7280", bg:"#f3f4f6" },
  "電話済": { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中": { color:"#d97706", bg:"#fef3c7" },
  "協定済": { color:"#059669", bg:"#d1fae5" },
};
const VENDOR_STATUS = {
  "未接触":  { color:"#6b7280", bg:"#f3f4f6" },
  "電話済":  { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中":  { color:"#d97706", bg:"#fef3c7" },
  "加入済":  { color:"#059669", bg:"#d1fae5" },
  "断り":    { color:"#dc2626", bg:"#fee2e2" },
};
const COMPANY_STATUS = {
  "未接触":  { color:"#6b7280", bg:"#f3f4f6" },
  "電話済":  { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中":  { color:"#d97706", bg:"#fef3c7" },
  "成約":    { color:"#059669", bg:"#d1fae5" },
  "断り":    { color:"#dc2626", bg:"#fee2e2" },
};
const MUNI_STATUS = {
  "未接触": { color:"#6b7280", bg:"#f3f4f6" },
  "電話済": { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中": { color:"#d97706", bg:"#fef3c7" },
  "協定済": { color:"#059669", bg:"#d1fae5" },
};
const VENDOR_LOG_TYPES = ["電話","訪問","資料送付","メール","WEB会議","その他"];
const VENDOR_LOG_ICON  = {"電話":"📞","訪問":"🚗","資料送付":"📄","メール":"✉️","WEB会議":"💻","その他":"📝"};


// ─── NOTIFICATION HELPER ─────────────────────────────────────────────────────
function addNotif(data, {type, title, body, toUserIds=[], fromUserId=null, entityId=null}) {
  // type: "task_assign" | "task_status" | "task_comment" | "mention" | "deadline" | "sales_assign"
  if(!toUserIds.length) return data;
  const newN = toUserIds.map(uid=>({
    id: Date.now()+Math.random(),
    toUserId: uid,
    fromUserId,
    type,
    title,
    body: body||"",
    date: new Date().toISOString(),
    read: false,
    entityId: entityId||null,
  }));
  return {...data, notifications:[...(data.notifications||[]), ...newN]};
}

async function loadData() {
  try { const d = await sbGet("main"); if(d) return {...INIT, ...d}; } catch{}
  return INIT;
}
async function saveData(d) { await sbSet("main", d); }

async function loadUsers() {
  try { const d = await sbGet("users"); if(Array.isArray(d)) return d; } catch{}
  return [];
}
async function saveUsers(u) { sbSet("users", u); }

function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); } catch{ return null; } }
function setSession(u) { u ? localStorage.setItem(SESSION_KEY,JSON.stringify(u)) : localStorage.removeItem(SESSION_KEY); }

// Base64URL → Uint8Array（VAPID公開鍵変換用）
function urlBase64ToUint8(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function hashPass(s) { let h=5381; for(let i=0;i<s.length;i++){h=((h<<5)+h)+s.charCodeAt(i);h|=0;} return h.toString(36); }

function canSee(item, uid) {
  if (!item || !uid) return !item?.isPrivate;
  if (item.isPrivate) return item.createdBy === uid;
  const assigned = item.assignees || item.members || [];
  if (assigned.length === 0) return true;
  return assigned.includes(uid) || item.createdBy === uid;
}

function isNearDue(task) {
  if (!task.dueDate || task.status==="完了") return false;
  const diff = (new Date(task.dueDate) - new Date()) / (1000*60*60*24);
  return diff <= 2;
}

// ─── BASE COMPONENTS ──────────────────────────────────────────────────────────
const Card = ({children, style={}, onClick}) => (
  <div onClick={onClick} style={{background:C.surface,borderRadius:"0.875rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,...style}}>{children}</div>
);

const Btn = ({children,onClick,variant="primary",size="md",style={},disabled=false}) => {
  const base = {border:"none",borderRadius:"0.75rem",fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,transition:"opacity 0.15s",...style};
  const sz   = size==="sm"?{padding:"0.35rem 0.875rem",fontSize:"0.78rem"}:size==="lg"?{padding:"0.875rem 1.25rem",fontSize:"1rem"}:{padding:"0.55rem 1rem",fontSize:"0.85rem"};
  const vc   = variant==="primary"?{background:C.accent,color:"white",boxShadow:`0 2px 10px ${C.accent}44`}
             : variant==="secondary"?{background:C.bg,color:C.textSub,border:`1.5px solid ${C.border}`}
             : variant==="danger"?{background:"#fee2e2",color:"#dc2626"}
             : {background:"transparent",color:C.textSub};
  return <button onClick={disabled?undefined:onClick} style={{...base,...sz,...vc}}>{children}</button>;
};

const Input = ({style={},...p}) => (
  <input {...p} style={{width:"100%",padding:"0.65rem 0.875rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.9rem",color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"inherit",...style}}/>
);

const Textarea = ({style={},...p}) => (
  <textarea {...p} style={{width:"100%",padding:"0.75rem 0.875rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.88rem",color:C.text,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.6,...style}}/>
);

const SelectEl = ({children,style={},...p}) => (
  <select {...p} style={{width:"100%",padding:"0.65rem 0.875rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.9rem",color:C.text,outline:"none",background:"white",fontFamily:"inherit",...style}}>{children}</select>
);

const FieldLbl = ({label,children}) => (
  <div style={{marginBottom:"1rem"}}>
    <label style={{display:"block",fontSize:"0.78rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>{label}</label>
    {children}
  </div>
);

function Sheet({title,onClose,children}) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)"}}/>
      <div style={{position:"relative",background:"white",borderRadius:"1.5rem 1.5rem 0 0",padding:"1.5rem 1.25rem calc(5rem + env(safe-area-inset-bottom,16px))",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
          <h3 style={{margin:0,fontSize:"1.05rem",fontWeight:800,color:C.text}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:"1.4rem",color:C.textMuted,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusPill({status,onChange}) {
  const [open,setOpen]=useState(false);
  const btnRef=useRef(null);
  const [pos,setPos]=useState({top:0,right:0});
  const meta=STATUS_META[status]||STATUS_META["未着手"];
  const handleOpen=(e)=>{e.stopPropagation();const r=btnRef.current.getBoundingClientRect();setPos({top:r.bottom+4,right:window.innerWidth-r.right});setOpen(true);};
  return (
    <>
      <button ref={btnRef} onClick={handleOpen}
        style={{padding:"0.2rem 0.625rem",borderRadius:999,border:`1.5px solid ${meta.color}50`,background:meta.bg,color:meta.color,fontSize:"0.72rem",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
        {status} ▾
      </button>
      {open && <>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:199}}/>
        <div style={{position:"fixed",top:pos.top,right:pos.right,zIndex:200,background:"white",borderRadius:"0.875rem",boxShadow:C.shadowMd,border:`1px solid ${C.border}`,overflow:"hidden",minWidth:130}}>
          {STATUS_OPTIONS.map(s=>{const m=STATUS_META[s];return(
            <button key={s} onClick={e=>{e.stopPropagation();onChange(s);setOpen(false);}}
              style={{display:"flex",alignItems:"center",gap:"0.5rem",width:"100%",padding:"0.625rem 0.875rem",border:"none",background:s===status?m.bg:"white",cursor:"pointer",fontFamily:"inherit",fontWeight:s===status?700:500,color:s===status?m.color:C.text,fontSize:"0.83rem",textAlign:"left"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:m.dot,flexShrink:0}}/>
              {s}
            </button>
          );})}
        </div>
      </>}
    </>
  );
}


// ─── DUPLICATE DETECT MODAL ─────────────────────────────────────────────

// ─── FILE SECTION ─────────────────────────────────────────────────────────────
// Supabase Storage を使ったファイルアップロード
// 事前準備: Supabaseダッシュボード → Storage → New bucket → "mydesk-files" (Public)
const STORAGE_BUCKET = "mydesk-files";

async function uploadFileToSupabase(file, entityType, entityId) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u3000-\u9fff\u30A0-\u30FF\u3040-\u309F]/g, "_");
  const path = `${entityType}/${entityId}/${Date.now()}_${safeName}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) { const e = await res.text(); throw new Error("HTTP " + res.status + ": " + e); }
  return {
    id: Date.now() + Math.random(),
    name: file.name,
    url: `${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`,
    path,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
  };
}

async function deleteFileFromSupabase(path) {
  await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "DELETE",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
}

function FileSection({ files=[], onAdd, onDelete, currentUserId, readOnly=false }) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileInputRef = React.useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("20MB以下のファイルを選択してください"); return; }
    setUploading(true); setError("");
    try {
      const result = await uploadFileToSupabase(file, "tasks", currentUserId || "shared");
      onAdd({ ...result, uploadedBy: currentUserId });
    } catch (err) {
      setError("アップロード失敗: " + (err?.message || String(err)));
    } finally { setUploading(false); if(fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const fmt = (bytes) => bytes > 1024*1024 ? `${(bytes/1024/1024).toFixed(1)}MB` : `${(bytes/1024).toFixed(0)}KB`;
  const icon = (type="") => type.startsWith("image/") ? "🖼" : type.includes("pdf") ? "📄" : type.includes("spreadsheet") || type.includes("excel") ? "📊" : type.includes("word") || type.includes("document") ? "📝" : "📎";

  return (
    <div>
      {files.length === 0 && <div style={{textAlign:"center",padding:"1.25rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem",marginBottom:"0.75rem"}}>ファイルがありません</div>}
      <div style={{display:"flex",flexDirection:"column",gap:"0.4rem",marginBottom:"0.75rem"}}>
        {files.map(f => (
          <div key={f.id||f.url} style={{display:"flex",alignItems:"center",gap:"0.625rem",background:"white",border:`1px solid ${C.border}`,borderRadius:"0.75rem",padding:"0.5rem 0.75rem",boxShadow:C.shadow}}>
            <span style={{fontSize:"1.2rem",flexShrink:0}}>{icon(f.type)}</span>
            <div style={{flex:1,minWidth:0}}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{fontWeight:600,fontSize:"0.85rem",color:C.accent,textDecoration:"none",display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</a>
              <div style={{fontSize:"0.65rem",color:C.textMuted}}>{f.size?fmt(f.size)+""  :""}{f.uploadedAt?" · "+new Date(f.uploadedAt).toLocaleDateString("ja-JP"):""}</div>
            </div>
            {!readOnly && (
              <button onClick={async()=>{if(!window.confirm("削除しますか？"))return; if(f.path){try{await deleteFileFromSupabase(f.path);}catch(e){}} onDelete(f.id||f.url);}}
                style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"0.85rem",padding:"0.2rem",flexShrink:0}}>✕</button>
            )}
          </div>
        ))}
      </div>
      {error && <div style={{color:"#dc2626",fontSize:"0.75rem",marginBottom:"0.5rem",padding:"0.5rem",background:"#fee2e2",borderRadius:"0.5rem"}}>{error}</div>}
      {!readOnly && (
        <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem",border:`2px dashed ${uploading?C.accent:C.border}`,borderRadius:"0.875rem",padding:"0.875rem",cursor:"pointer",background:uploading?C.accentBg:C.bg,color:uploading?C.accentDark:C.textSub,fontWeight:700,fontSize:"0.82rem"}}>
          {uploading ? "⏳ アップロード中..." : "📎 ファイルを追加（最大20MB）"}
          <input ref={fileInputRef} type="file" onChange={handleFile} disabled={uploading} style={{display:"none"}}/>
        </label>
      )}
    </div>
  );
}


// ─── REVIEW REQUEST ───────────────────────────────────────────────────────────
function ReviewRequestSection({ task, users=[], uid, allTasks=[], onRequestReview, onRejectReview }) {
  const [showPicker, setShowPicker] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [note, setNote] = React.useState("");
  const [showRejectForm, setShowRejectForm] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");

  // このタスクへの確認依頼タスク一覧
  const reviewTasks = allTasks.filter(t => t.reviewOf?.taskId === task.id);
  // このタスク自体が確認依頼タスクの場合、元タスクを取得
  const originalTask = task.reviewOf ? allTasks.find(t => t.id === task.reviewOf.taskId) : null;
  const originalUser = task.reviewOf ? users.find(u => u.id === task.reviewOf.fromUserId) : null;
  const isRejected = task.reviewOf?.rejected;
  const candidates = users.filter(u => u.id !== uid);

  // 元タスクの差し戻し状況（依頼者が見る）
  const rejectedReview = reviewTasks.find(rt => rt.reviewOf?.rejected);

  return (
    <div style={{marginTop:"1rem"}}>

      {/* ── 確認依頼タスク側（確認者が見る）── */}
      {task.reviewOf && (
        <div>
          {/* 差し戻し済みバナー */}
          {isRejected ? (
            <div style={{background:"#fee2e2",border:"1.5px solid #fca5a5",borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.72rem",fontWeight:800,color:"#991b1b",marginBottom:"0.35rem"}}>↩️ 差し戻し済み</div>
              <div style={{fontSize:"0.82rem",color:"#7f1d1d",marginBottom:"0.25rem"}}>
                依頼元：<strong>{originalUser?.name || "不明"}</strong>
              </div>
              <div style={{fontSize:"0.78rem",color:"#991b1b",marginBottom:"0.25rem"}}>
                元タスク：{originalTask?.title || task.reviewOf.taskTitle || "（削除済み）"}
              </div>
              {task.reviewOf.rejectNote && (
                <div style={{fontSize:"0.78rem",color:"#7f1d1d",background:"#fecaca",borderRadius:"0.5rem",padding:"0.4rem 0.625rem",marginTop:"0.35rem"}}>
                  💬 差し戻し理由：{task.reviewOf.rejectNote}
                </div>
              )}
              <div style={{fontSize:"0.68rem",color:"#b91c1c",marginTop:"0.5rem"}}>このタスクは差し戻しとして処理されました</div>
            </div>
          ) : (
            /* 通常の確認依頼バナー */
            <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:"0.875rem",padding:"0.75rem 1rem",marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.68rem",fontWeight:700,color:"#92400e",marginBottom:"0.3rem"}}>📋 確認依頼タスク</div>
              <div style={{fontSize:"0.82rem",color:"#78350f",marginBottom:"0.25rem"}}>
                依頼元：<strong>{originalUser?.name || "不明"}</strong>
              </div>
              <div style={{fontSize:"0.78rem",color:"#92400e"}}>
                元タスク：{originalTask?.title || task.reviewOf.taskTitle || "（削除済み）"}
              </div>
              {task.reviewOf.note && (
                <div style={{fontSize:"0.75rem",color:"#92400e",marginTop:"0.25rem",whiteSpace:"pre-wrap"}}>💬 {task.reviewOf.note}</div>
              )}
            </div>
          )}

          {/* 差し戻しボタン（未差し戻し・未完了のときのみ表示） */}
          {!isRejected && task.status !== "完了" && (
            <div style={{marginBottom:"0.75rem"}}>
              {!showRejectForm ? (
                <button onClick={() => setShowRejectForm(true)}
                  style={{width:"100%",padding:"0.625rem",borderRadius:"0.75rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
                  ↩️ 差し戻す
                </button>
              ) : (
                <div style={{background:"#fff1f2",border:"1.5px solid #fca5a5",borderRadius:"0.875rem",padding:"0.875rem"}}>
                  <div style={{fontWeight:700,fontSize:"0.82rem",color:"#dc2626",marginBottom:"0.625rem"}}>↩️ 差し戻し</div>
                  <div style={{fontSize:"0.75rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>差し戻し理由（任意）</div>
                  <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)}
                    placeholder="修正してほしい点を記入してください..." rows={3}
                    style={{width:"100%",padding:"0.5rem",borderRadius:"0.625rem",border:`1.5px solid #fca5a5`,fontSize:"0.82rem",fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:"0.75rem"}}/>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <button onClick={()=>{setShowRejectForm(false);setRejectNote("");}}
                      style={{flex:1,padding:"0.5rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.82rem"}}>
                      キャンセル
                    </button>
                    <button onClick={()=>{onRejectReview(task.id, rejectNote); setShowRejectForm(false); setRejectNote("");}}
                      style={{flex:2,padding:"0.5rem",borderRadius:"0.75rem",border:"none",background:"#dc2626",color:"white",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.82rem"}}>
                      差し戻しを確定する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 元タスク側（依頼者が見る）── */}
      {/* 差し戻しされた通知 */}
      {rejectedReview && (
        <div style={{background:"#fee2e2",border:"1.5px solid #fca5a5",borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"0.75rem"}}>
          <div style={{fontSize:"0.72rem",fontWeight:800,color:"#991b1b",marginBottom:"0.35rem"}}>↩️ 確認依頼が差し戻されました</div>
          <div style={{fontSize:"0.82rem",color:"#7f1d1d",marginBottom:"0.25rem"}}>
            差し戻し者：<strong>{users.find(u=>(rejectedReview.assignees||[]).includes(u.id))?.name || "不明"}</strong>
          </div>
          {rejectedReview.reviewOf?.rejectNote && (
            <div style={{fontSize:"0.78rem",color:"#7f1d1d",background:"#fecaca",borderRadius:"0.5rem",padding:"0.4rem 0.625rem",marginTop:"0.35rem"}}>
              💬 理由：{rejectedReview.reviewOf.rejectNote}
            </div>
          )}
          <div style={{fontSize:"0.68rem",color:"#b91c1c",marginTop:"0.5rem"}}>タスクのステータスが「進行中」に戻されました。修正後、再度確認依頼を送ってください。</div>
        </div>
      )}

      {/* 送信済み確認依頼一覧 */}
      {reviewTasks.length > 0 && (
        <div style={{marginBottom:"0.75rem"}}>
          <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>📨 確認依頼済み</div>
          {reviewTasks.map(rt => {
            const assignee = users.find(u => (rt.assignees||[]).includes(u.id));
            const isRej = rt.reviewOf?.rejected;
            const statusColor = isRej ? "#dc2626" : rt.status === "完了" ? "#059669" : rt.status === "進行中" ? "#2563eb" : "#6b7280";
            const statusBg = isRej ? "#fee2e2" : rt.status === "完了" ? "#d1fae5" : rt.status === "進行中" ? "#dbeafe" : "#f3f4f6";
            const label = isRej ? "差し戻し" : rt.status;
            return (
              <div key={rt.id} style={{background:"white",border:`1px solid ${isRej?"#fca5a5":C.border}`,borderRadius:"0.75rem",padding:"0.5rem 0.875rem",marginBottom:"0.35rem",display:"flex",alignItems:"center",gap:"0.625rem"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"0.82rem",fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rt.title}</div>
                  <div style={{fontSize:"0.68rem",color:C.textMuted}}>担当：{assignee?.name || "未設定"}</div>
                  {isRej && rt.reviewOf?.rejectNote && (
                    <div style={{fontSize:"0.68rem",color:"#dc2626",marginTop:"0.15rem"}}>💬 {rt.reviewOf.rejectNote}</div>
                  )}
                </div>
                <span style={{fontSize:"0.68rem",fontWeight:700,background:statusBg,color:statusColor,borderRadius:999,padding:"0.1rem 0.45rem",flexShrink:0,whiteSpace:"nowrap"}}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 確認依頼ボタン（完了タスクのみ・差し戻しがない場合 or 差し戻し後に再送可） */}
      {task.status === "完了" && !task.reviewOf && (
        <div>
          {!showPicker ? (
            <button onClick={() => setShowPicker(true)}
              style={{width:"100%",padding:"0.625rem",borderRadius:"0.75rem",border:"1.5px solid #f59e0b",background:"#fef3c7",color:"#92400e",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
              📨 確認依頼を送る
            </button>
          ) : (
            <div style={{background:"#fffbeb",border:"1.5px solid #fbbf24",borderRadius:"0.875rem",padding:"0.875rem"}}>
              <div style={{fontWeight:700,fontSize:"0.82rem",color:"#92400e",marginBottom:"0.625rem"}}>確認依頼を送る</div>
              <div style={{fontSize:"0.75rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>依頼先</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem",marginBottom:"0.75rem"}}>
                {candidates.map(u => (
                  <button key={u.id} onClick={() => setSelectedUser(u.id === selectedUser ? null : u.id)}
                    style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",
                      border:`1.5px solid ${selectedUser===u.id?"#f59e0b":C.border}`,
                      background:selectedUser===u.id?"#fef3c7":"white",
                      color:selectedUser===u.id?"#92400e":C.textSub}}>
                    {selectedUser===u.id?"✓ ":""}{u.name}
                  </button>
                ))}
                {candidates.length===0&&<span style={{fontSize:"0.78rem",color:C.textMuted}}>他のユーザーがいません</span>}
              </div>
              <div style={{fontSize:"0.75rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>メッセージ（任意）</div>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="確認をお願いします..." rows={2}
                style={{width:"100%",padding:"0.5rem",borderRadius:"0.625rem",border:`1.5px solid ${C.border}`,fontSize:"0.82rem",fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:"0.75rem"}}/>
              <div style={{display:"flex",gap:"0.5rem"}}>
                <button onClick={()=>{setShowPicker(false);setSelectedUser(null);setNote("");}}
                  style={{flex:1,padding:"0.5rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.82rem"}}>
                  キャンセル
                </button>
                <button onClick={()=>{if(!selectedUser)return; onRequestReview(selectedUser,note); setShowPicker(false);setSelectedUser(null);setNote("");}}
                  disabled={!selectedUser}
                  style={{flex:2,padding:"0.5rem",borderRadius:"0.75rem",border:"none",background:selectedUser?"#f59e0b":"#e5e7eb",color:selectedUser?"white":"#9ca3af",fontWeight:700,cursor:selectedUser?"pointer":"not-allowed",fontFamily:"inherit",fontSize:"0.82rem"}}>
                  依頼を送る
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── GSHEET IMPORT ────────────────────────────────────────────────────────────
// Googleスプレッドシートから自治体・業者を一括インポート
// ファイル名=都道府県名、シート名=自治体名、中身=業者名+メモ
function GSheetImportWizard({ data, onSave, onClose, prefs, munis, vendors }) {
  const STEPS = ["入力", "取得中", "確認", "完了"];
  const [step, setStep] = React.useState(0);
  const [sheetId, setSheetId] = React.useState("1q8cRuQWVevMrBq1qQsl-z2ByYIoV1xp_KhPsjrjsXXU");
  const [prefName, setPrefName] = React.useState("");
  const [sheetList, setSheetList] = React.useState([]); // [{name, gid}]
  const [sheetData, setSheetData] = React.useState([]); // [{muniName, vendors:[{name,memo,...}]}]
  const [err, setErr] = React.useState("");
  const [progress, setProgress] = React.useState("");
  const [importResult, setImportResult] = React.useState(null);

  // URLからシートIDを抽出
  const extractId = (s) => {
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : s.trim();
  };

  // Googleスプレッドシートのシート一覧を取得（gviz API）
  const fetchSheetList = async (id) => {
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("スプレッドシートを取得できません。公開設定を確認してください。");
    const text = await res.text();
    // gvizレスポンスからJSONを抽出（google.visualization.Query.setResponse({...})形式）
    const jsonStr = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")"));
    const json = JSON.parse(jsonStr);
    // シート一覧: json.table の cols/rows でなく、response自体にsheetが入らないため
    // HTML取得で代替
    return json;
  };

  // シート名一覧をHTML parsingで取得
  const fetchSheetNames = async (id) => {
    const url = `https://docs.google.com/spreadsheets/d/${id}/htmlview`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`スプレッドシートへのアクセスに失敗しました (HTTP ${res.status})。\nシートが「リンクを知っている全員」に公開されているか確認してください。`);
    const html = await res.text();
    // シートタブ名を抽出 data-sheet-id と名前
    const matches = [...html.matchAll(/id="sheet-button-([^"]+)"[^>]*>([^<]+)</g)];
    if (matches.length > 0) {
      return matches.map(m => ({ gid: m[1], name: m[2].trim() }));
    }
    // 別パターン: class="docs-sheet-tab-name"
    const matches2 = [...html.matchAll(/class="[^"]*docs-sheet-tab-name[^"]*"[^>]*>([^<]+)</g)];
    if (matches2.length > 0) {
      return matches2.map((m, i) => ({ gid: String(i), name: m[1].trim() }));
    }
    throw new Error("シート名の取得に失敗しました。スプレッドシートの公開設定を確認してください。");
  };

  // 各シートのCSVデータを取得
  const fetchSheetCsv = async (id, sheetName) => {
    const enc = encodeURIComponent(sheetName);
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${enc}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return text;
  };

  // CSVパース（BOM除去・クォート対応）
  const parseCsv = (text) => {
    const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = clean.split("\n").filter(l => l.trim());
    const parseRow = line => {
      const cols = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') { inQ = true; }
        else if (ch === ',') { cols.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    };
    return lines.map(parseRow);
  };

  // メイン取得処理
  const fetchAll = async () => {
    setStep(1); setErr(""); setProgress("シート一覧を取得中...");
    try {
      const id = extractId(sheetId);
      let sheets = [];

      // シート名取得を試みる
      try {
        setProgress("シートタブ名を取得中...");
        sheets = await fetchSheetNames(id);
      } catch (e) {
        // HTMLパース失敗の場合、gviz JSONから1シート目のみ取得
        setProgress("シート名取得に失敗。gvizAPIで再試行...");
        await fetchSheetList(id);
        sheets = [{ gid: "0", name: "シート1" }];
      }

      if (sheets.length === 0) throw new Error("シートが見つかりませんでした");
      setSheetList(sheets);
      setProgress(`${sheets.length}シートを検出。データを取得中...`);

      // 各シートのデータを取得
      const results = [];
      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        setProgress(`シートを取得中... ${i+1}/${sheets.length}: ${s.name}`);
        try {
          const csvText = await fetchSheetCsv(id, s.name);
          const rows = parseCsv(csvText);
          // ヘッダー行をスキップ（1行目が「業者名」「メモ」などの場合）
          const headerKeywords = ["業者名","vendor","name","メモ","備考","note","会社","担当"];
          const dataRows = rows.filter((r, idx) => {
            if (idx === 0 && r[0] && headerKeywords.some(k => r[0].toLowerCase().includes(k.toLowerCase()))) return false;
            return r[0] && r[0].trim();
          });
          const vList = dataRows.map(r => ({
            name: (r[0] || "").trim(),
            memo: (r[1] || "").trim(),
            status: (r[2] || "").trim(),
            phone: (r[3] || "").trim(),
            email: (r[4] || "").trim(),
          })).filter(v => v.name);
          results.push({ muniName: s.name, vendors: vList, rawCount: rows.length });
        } catch(e) {
          results.push({ muniName: s.name, vendors: [], error: e.message });
        }
        // レートリミット回避
        await new Promise(r => setTimeout(r, 150));
      }
      setSheetData(results);
      setStep(2);
    } catch(e) {
      setErr(e.message || "取得に失敗しました");
      setStep(0);
    }
  };

  // インポート実行
  const doImport = () => {
    const id = extractId(sheetId);
    let nd = { ...data };
    let newMuniCount = 0, newVendorCount = 0, skipMuni = 0, skipVendor = 0;

    // 都道府県を探す or 作成
    let pref = (nd.prefectures || []).find(p => p.name === prefName || p.name === prefName + "県" || p.name === prefName + "府" || p.name === prefName + "都" || p.name === prefName + "道");
    if (!pref) {
      // 名前で部分一致
      pref = (nd.prefectures || []).find(p => p.name.includes(prefName) || prefName.includes(p.name.replace(/[都道府県]$/, "")));
    }
    if (!pref) {
      setErr(`都道府県「${prefName}」がMyDeskに見つかりません。設定から都道府県を先に追加してください。`);
      return;
    }

    const normStr = s => (s || "").replace(/[\s\u3000]/g, "").toLowerCase();

    sheetData.forEach(sheet => {
      if (!sheet.muniName || sheet.error) return;
      // 自治体を探す or 作成
      let muni = (nd.municipalities || []).find(m =>
        m.prefectureId === pref.id && normStr(m.name) === normStr(sheet.muniName)
      );
      if (!muni) {
        muni = {
          id: Date.now() + Math.random(),
          prefectureId: pref.id,
          name: sheet.muniName,
          dustalk: "未展開",
          status: "未接触",
          treatyStatus: "未接触",
          artBranch: "",
          assigneeIds: [],
          memos: [],
          chat: [],
          files: [],
          createdAt: new Date().toISOString(),
        };
        nd = { ...nd, municipalities: [...(nd.municipalities || []), muni] };
        newMuniCount++;
      } else {
        skipMuni++;
      }

      // 業者を追加
      sheet.vendors.forEach(v => {
        const existVendor = (nd.vendors || []).find(ev => normStr(ev.name) === normStr(v.name));
        if (!existVendor) {
          const newVendor = {
            id: Date.now() + Math.random(),
            name: v.name,
            status: v.status || "未接触",
            phone: v.phone || "",
            email: v.email || "",
            municipalityIds: [muni.id],
            memos: v.memo ? [{ id: Date.now() + Math.random(), text: v.memo, userId: null, date: new Date().toISOString() }] : [],
            chat: [],
            files: [],
            createdAt: new Date().toISOString(),
          };
          nd = { ...nd, vendors: [...(nd.vendors || []), newVendor] };
          newVendorCount++;
        } else {
          // 既存業者に自治体IDを追加（紐付け）
          if (!(existVendor.municipalityIds || []).includes(muni.id)) {
            nd = { ...nd, vendors: (nd.vendors || []).map(ev =>
              ev.id === existVendor.id
                ? { ...ev, municipalityIds: [...(ev.municipalityIds || []), muni.id] }
                : ev
            )};
          }
          skipVendor++;
        }
      });
    });

    onSave(nd);
    setImportResult({ newMuniCount, newVendorCount, skipMuni, skipVendor });
    setStep(3);
  };

  const totalVendors = sheetData.reduce((s, d) => s + d.vendors.length, 0);
  const PREF_LIST_ALL = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

  return (
    <Sheet title="📊 スプレッドシート一括取込" onClose={onClose}>
      {/* ステッパー */}
      <div style={{display:"flex",gap:"0.25rem",marginBottom:"1.25rem"}}>
        {STEPS.map((s,i)=>(
          <div key={s} style={{flex:1,textAlign:"center"}}>
            <div style={{width:24,height:24,borderRadius:"50%",margin:"0 auto 0.2rem",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:"0.72rem",
              background:i<=step?"#2563eb":"#e2e8f0",color:i<=step?"white":"#94a3b8"}}>
              {i<step?"✓":i+1}
            </div>
            <div style={{fontSize:"0.6rem",color:i===step?"#2563eb":"#94a3b8",fontWeight:i===step?700:400}}>{s}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 0: 入力 ── */}
      {step===0&&(
        <div>
          <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem",fontSize:"0.78rem",color:"#1e40af",lineHeight:1.7}}>
            📋 <strong>スプレッドシートの構成：</strong><br/>
            ・シート名 = 自治体名<br/>
            ・A列 = 業者名　B列 = メモ　C列 = ステータス（任意）<br/>
            ・シートは「リンクを知っている全員が閲覧可」に設定してください
          </div>

          <div style={{marginBottom:"0.875rem"}}>
            <div style={{fontSize:"0.78rem",fontWeight:700,color:"#374151",marginBottom:"0.35rem"}}>スプレッドシートID または URL</div>
            <input value={sheetId} onChange={e=>setSheetId(e.target.value)}
              placeholder="1q8cRuQ...またはhttps://docs.google.com/..."
              style={{width:"100%",padding:"0.625rem 0.75rem",borderRadius:"0.625rem",border:"1.5px solid #e2e8f0",fontSize:"0.82rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>

          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.78rem",fontWeight:700,color:"#374151",marginBottom:"0.35rem"}}>都道府県名（このスプレッドシートの都道府県）</div>
            <select value={prefName} onChange={e=>setPrefName(e.target.value)}
              style={{width:"100%",padding:"0.625rem 0.75rem",borderRadius:"0.625rem",border:"1.5px solid #e2e8f0",fontSize:"0.82rem",fontFamily:"inherit",outline:"none",background:"white"}}>
              <option value="">-- 選択してください --</option>
              {PREF_LIST_ALL.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {err&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:"0.625rem",padding:"0.625rem 0.875rem",fontSize:"0.78rem",color:"#991b1b",marginBottom:"0.875rem",whiteSpace:"pre-wrap"}}>{err}</div>}

          <button onClick={fetchAll} disabled={!sheetId.trim()||!prefName}
            style={{width:"100%",padding:"0.875rem",borderRadius:"0.875rem",border:"none",
              background:sheetId.trim()&&prefName?"#2563eb":"#e2e8f0",
              color:sheetId.trim()&&prefName?"white":"#94a3b8",
              fontWeight:800,fontSize:"0.9rem",cursor:sheetId.trim()&&prefName?"pointer":"not-allowed",fontFamily:"inherit"}}>
            📥 データを取得する
          </button>
        </div>
      )}

      {/* ── STEP 1: 取得中 ── */}
      {step===1&&(
        <div style={{textAlign:"center",padding:"2rem 1rem"}}>
          <div style={{fontSize:"2.5rem",marginBottom:"0.75rem",animation:"spin 1s linear infinite"}}>⏳</div>
          <div style={{fontWeight:700,fontSize:"0.9rem",color:"#1e3a5f",marginBottom:"0.5rem"}}>取得中...</div>
          <div style={{fontSize:"0.78rem",color:"#64748b",lineHeight:1.6}}>{progress}</div>
          {err&&<div style={{marginTop:"1rem",background:"#fee2e2",borderRadius:"0.625rem",padding:"0.625rem",fontSize:"0.78rem",color:"#991b1b"}}>{err}</div>}
        </div>
      )}

      {/* ── STEP 2: 確認 ── */}
      {step===2&&(
        <div>
          <div style={{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem"}}>
            <div style={{fontWeight:800,color:"#065f46",fontSize:"0.88rem",marginBottom:"0.25rem"}}>✅ {sheetData.length}自治体 / {totalVendors}業者 を検出</div>
            <div style={{fontSize:"0.75rem",color:"#047857"}}>都道府県：{prefName}　インポート先を確認してください</div>
          </div>

          <div style={{maxHeight:320,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:"0.875rem",marginBottom:"1rem"}}>
            {sheetData.map((d,i)=>(
              <div key={i} style={{borderBottom:"1px solid #f1f5f9",padding:"0.625rem 0.875rem"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:d.vendors.length?0:"0"}}>
                  <span style={{fontWeight:700,fontSize:"0.85rem",color:"#1e3a5f"}}>🏛 {d.muniName}</span>
                  <div style={{display:"flex",gap:"0.35rem",alignItems:"center"}}>
                    {d.error&&<span style={{fontSize:"0.65rem",color:"#dc2626",background:"#fee2e2",borderRadius:999,padding:"0.1rem 0.4rem"}}>取得失敗</span>}
                    <span style={{fontSize:"0.72rem",fontWeight:700,color:"#2563eb",background:"#dbeafe",borderRadius:999,padding:"0.1rem 0.5rem"}}>{d.vendors.length}業者</span>
                  </div>
                </div>
                {d.vendors.length>0&&(
                  <div style={{marginTop:"0.35rem",paddingLeft:"0.5rem"}}>
                    {d.vendors.slice(0,5).map((v,j)=>(
                      <div key={j} style={{fontSize:"0.72rem",color:"#374151",padding:"0.1rem 0",display:"flex",gap:"0.5rem"}}>
                        <span>🏢 {v.name}</span>
                        {v.memo&&<span style={{color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.memo.slice(0,30)}</span>}
                      </div>
                    ))}
                    {d.vendors.length>5&&<div style={{fontSize:"0.68rem",color:"#94a3b8"}}>...他{d.vendors.length-5}件</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {err&&<div style={{background:"#fee2e2",borderRadius:"0.625rem",padding:"0.625rem",fontSize:"0.78rem",color:"#991b1b",marginBottom:"0.875rem"}}>{err}</div>}

          <div style={{display:"flex",gap:"0.625rem"}}>
            <button onClick={()=>setStep(0)}
              style={{flex:1,padding:"0.75rem",borderRadius:"0.875rem",border:"1.5px solid #e2e8f0",background:"white",color:"#64748b",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.85rem"}}>
              戻る
            </button>
            <button onClick={doImport}
              style={{flex:2,padding:"0.75rem",borderRadius:"0.875rem",border:"none",background:"#2563eb",color:"white",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:"0.85rem"}}>
              📥 {prefName}にインポート
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: 完了 ── */}
      {step===3&&importResult&&(
        <div style={{textAlign:"center",padding:"1.5rem 0"}}>
          <div style={{fontSize:"3rem",marginBottom:"0.75rem"}}>🎉</div>
          <div style={{fontWeight:800,fontSize:"1rem",color:"#1e3a5f",marginBottom:"1rem"}}>インポート完了！</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"1.25rem"}}>
            {[
              ["🏛 新規自治体", importResult.newMuniCount+"件追加"],
              ["🏢 新規業者", importResult.newVendorCount+"件追加"],
              ["⏭ 既存自治体", importResult.skipMuni+"件スキップ"],
              ["⏭ 既存業者", importResult.skipVendor+"件（自治体紐付け）"],
            ].map(([k,v])=>(
              <div key={k} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"0.75rem",padding:"0.625rem 0.5rem",textAlign:"center"}}>
                <div style={{fontSize:"0.72rem",color:"#64748b",marginBottom:"0.15rem"}}>{k}</div>
                <div style={{fontWeight:800,fontSize:"0.9rem",color:"#1e3a5f"}}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose}
            style={{width:"100%",padding:"0.875rem",borderRadius:"0.875rem",border:"none",background:"#2563eb",color:"white",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:"0.9rem"}}>
            閉じる
          </button>
        </div>
      )}
    </Sheet>
  );
}

function DupModal({existing, incoming, onKeepBoth, onUseExisting, onCancel}) {
  // existing は {name, status?, phone?, email?, address?, notes?, title?, dueDate?, assignees?} 等
  const rows = [
    existing.title   && ["タイトル",   existing.title],
    existing.name    && ["名前",       existing.name],
    existing.status  && ["ステータス", existing.status],
    existing.phone   && ["電話",       existing.phone],
    existing.email   && ["メール",     existing.email],
    existing.address && ["住所",       existing.address],
    existing.notes   && ["備考",       existing.notes.slice(0,40)+(existing.notes.length>40?"…":"")],
    existing.dueDate && ["期限",       existing.dueDate],
    existing.assigneesText && ["担当者", existing.assigneesText],
    existing.membersText   && ["メンバー", existing.membersText],
  ].filter(Boolean);
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",padding:"1rem"}}>
      <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem 1.25rem",maxWidth:380,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.25)",maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:"1rem"}}>
          <div style={{fontSize:"1.8rem",marginBottom:"0.4rem"}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>同じ名前が既に存在します</div>
          <div style={{fontSize:"0.78rem",color:C.textMuted,marginTop:"0.2rem"}}>登録しようとした名前</div>
          <div style={{fontWeight:700,fontSize:"0.95rem",color:"#dc2626",background:"#fee2e2",borderRadius:"0.625rem",padding:"0.5rem 0.875rem",marginTop:"0.4rem"}}>「{incoming}」</div>
        </div>
        <div style={{background:C.bg,borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"1.25rem"}}>
          <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.5rem"}}>📋 既に登録されているデータ</div>
          {rows.length===0
            ? <div style={{fontSize:"0.82rem",color:C.textMuted}}>（詳細情報なし）</div>
            : rows.map(([label,val])=>(
              <div key={label} style={{display:"flex",gap:"0.5rem",padding:"0.3rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                <span style={{fontSize:"0.75rem",fontWeight:700,color:C.textSub,flexShrink:0,minWidth:60}}>{label}</span>
                <span style={{fontSize:"0.82rem",color:C.text,wordBreak:"break-all"}}>{val}</span>
              </div>
            ))
          }
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
          {onUseExisting&&(
            <button onClick={onUseExisting} style={{padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.9rem"}}>
              既存のものを開く
            </button>
          )}
          <button onClick={onKeepBoth} style={{padding:"0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.accent}`,background:"white",color:C.accent,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.9rem"}}>
            それでも新規追加する
          </button>
          <button onClick={onCancel} style={{padding:"0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:"0.85rem"}}>
            キャンセル（入力に戻る）
          </button>
        </div>
      </div>
    </div>
  );
}
function UserPicker({users=[],selected=[],onChange,label="担当者"}) {
  return (
    <div style={{marginBottom:"1rem"}}>
      <label style={{display:"block",fontSize:"0.78rem",fontWeight:700,color:C.textSub,marginBottom:"0.45rem"}}>{label}（複数選択可）</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
        {users.length===0 && <span style={{fontSize:"0.78rem",color:C.textMuted}}>登録ユーザーがいません</span>}
        {users.map(u=>{const on=selected.includes(u.id);return(
          <button key={u.id} onClick={()=>onChange(on?selected.filter(i=>i!==u.id):[...selected,u.id])}
            style={{padding:"0.35rem 0.875rem",borderRadius:999,fontSize:"0.8rem",fontWeight:700,cursor:"pointer",
              border:`1.5px solid ${on?C.accent:C.border}`,background:on?C.accentBg:"white",color:on?C.accentDark:C.textSub}}>
            {on?"✓ ":""}{u.name}
          </button>
        );})}
      </div>
    </div>
  );
}

function PrivateToggle({value,onChange}) {
  return (
    <div onClick={()=>onChange(!value)}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.75rem 1rem",background:value?"#fff1f2":"#f8fafc",borderRadius:"0.75rem",border:`1.5px solid ${value?"#fca5a5":C.border}`,marginBottom:"1rem",cursor:"pointer"}}>
      <div>
        <div style={{fontSize:"0.85rem",fontWeight:700,color:value?"#dc2626":C.text}}>🔒 プライベート</div>
        <div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.1rem"}}>ONにすると自分だけに表示</div>
      </div>
      <div style={{width:44,height:24,borderRadius:999,background:value?"#dc2626":C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:value?22:2,width:20,height:20,borderRadius:"50%",background:"white",boxShadow:"0 1px 4px rgba(0,0,0,0.2)",transition:"left 0.2s"}}/>
      </div>
    </div>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────────
// ↓ EmailJSの設定をここに入力してください（設定方法は下記参照）
const EMAILJS = {
  serviceId:  "YOUR_SERVICE_ID",    // EmailJS > Email Services でコピー
  templateId: "YOUR_TEMPLATE_ID",   // EmailJS > Email Templates でコピー
  publicKey:  "YOUR_PUBLIC_KEY",    // EmailJS > Account > Public Key でコピー
  fromEmail:  "bm-dx@beetle-ems.com",
};

async function sendEmail({ toEmail, toName, subject, body }) {
  if (EMAILJS.serviceId === "YOUR_SERVICE_ID") {
    // 未設定の場合はコンソールに表示して開発確認用
    console.log("📧 [EmailJS未設定] 送信予定:", { toEmail, subject, body });
    return { ok: true, dev: true };
  }
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:  EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id:     EMAILJS.publicKey,
        template_params: {
          to_email:   toEmail,
          to_name:    toName || toEmail,
          from_name:  "MyDesk",
          subject,
          body,
          reply_to:   EMAILJS.fromEmail,
        },
      }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const RESET_KEY = "reset_tokens";
async function saveResetToken(email, code) {
  const expires = Date.now() + 15 * 60 * 1000;
  const tokens = (await sbGet(RESET_KEY)) || {};
  tokens[email] = { code, expires };
  await sbSet(RESET_KEY, tokens);
}
async function verifyResetToken(email, code) {
  try {
    const tokens = (await sbGet(RESET_KEY)) || {};
    const t = tokens[email];
    if (!t || Date.now() > t.expires) return false;
    return t.code === code;
  } catch { return false; }
}

// ─── AUTH HELPER COMPONENTS (defined outside to prevent remount) ──────────────
const authInputStyle = {width:"100%",padding:"0.75rem 1rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.95rem",color:C.text,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
const authLblStyle   = {display:"block",fontSize:"0.78rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"};
const authFwStyle    = {marginBottom:"1rem"};

function AuthWrap({children}) {
  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,#eff6ff,#dbeafe,#e0f2fe)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem",fontFamily:"-apple-system,'Hiragino Kaku Gothic ProN',sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{width:64,height:64,borderRadius:"1.25rem",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem",margin:"0 auto 1rem",boxShadow:`0 8px 32px ${C.accent}44`}}>⚡</div>
          <div style={{fontSize:"1.6rem",fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>MyDesk</div>
          <div style={{fontSize:"0.82rem",color:C.textSub,marginTop:"0.25rem"}}>チーム業務管理</div>
        </div>
        <div style={{background:"white",borderRadius:"1.25rem",padding:"2rem",boxShadow:"0 8px 40px rgba(0,0,0,0.1)"}}>
          {children}
        </div>
      </div>
    </div>
  );
}
function AuthErrBox({msg}) {
  if (!msg) return null;
  return <div style={{background:"#fff1f2",border:"1px solid #fca5a5",borderRadius:"0.625rem",padding:"0.625rem 0.875rem",fontSize:"0.82rem",color:"#dc2626",marginBottom:"1rem"}}>{msg}</div>;
}
function AuthInfoBox({msg}) {
  if (!msg) return null;
  return <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:"0.625rem",padding:"0.625rem 0.875rem",fontSize:"0.82rem",color:"#166534",marginBottom:"1rem"}}>{msg}</div>;
}
function AuthBigBtn({onClick,disabled,children}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{width:"100%",padding:"0.875rem",borderRadius:"0.875rem",border:"none",cursor:"pointer",fontFamily:"inherit",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,color:"white",fontWeight:800,fontSize:"1rem",boxShadow:`0 4px 20px ${C.accent}55`,opacity:disabled?0.7:1}}>
      {children}
    </button>
  );
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({onLogin}) {
  const [mode,       setMode]       = useState("login");
  const [f,          setF]          = useState({name:"",email:"",phone:"",password:"",confirm:""});
  const [touched,    setTouched]    = useState({});   // which fields were attempted
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode,  setResetCode]  = useState("");
  const [newPass,    setNewPass]    = useState("");
  const [newPassC,   setNewPassC]   = useState("");
  const [error,      setError]      = useState("");
  const [info,       setInfo]       = useState("");
  const [loading,    setLoading]    = useState(false);

  const goMode = m => { setMode(m); setError(""); setInfo(""); setTouched({}); };

  const is  = (extra={}) => ({...authInputStyle, ...extra});
  const lbl = authLblStyle;
  const fw  = authFwStyle;

  // inline error helper
  const ferr = (msg) => (
    <div style={{fontSize:"0.72rem",color:"#dc2626",fontWeight:600,marginTop:"0.3rem"}}>{msg}</div>
  );

  const submit = async () => {
    // mark all required fields touched to show inline errors
    setTouched({name:true,email:true,password:true,confirm:true});
    setError(""); setLoading(true);
    const users = await loadUsers();
    if (mode==="login") {
      const u = users.find(u=>u.email===f.email.trim()&&u.passwordHash===hashPass(f.password));
      if (!u) { setError("メールアドレスまたはパスワードが違います"); setLoading(false); return; }
      setSession(u); onLogin(u);
    } else {
      if (!f.name.trim()||!f.email.trim()||!f.password) { setLoading(false); return; }
      if (f.password!==f.confirm) { setLoading(false); return; }
      if (users.find(u=>u.email===f.email.trim())) { setError("このメールはすでに登録されています"); setLoading(false); return; }
      const nu={id:Date.now(),name:f.name.trim(),email:f.email.trim(),phone:f.phone.trim(),passwordHash:hashPass(f.password),createdAt:new Date().toISOString()};
      const newUsers=[...users,nu];
      await saveUsers(newUsers);
      // 全ユーザーに新規登録通知を送信（データ上）
      const existingData = await loadData();
      const notif={id:Date.now()+Math.random(),type:"new_user",title:`👋 新規ユーザーが登録されました：${nu.name}`,body:nu.email,toUserId:"__all__",read:false,date:new Date().toISOString()};
      const ndWithNotif={...existingData,notifications:[...(existingData.notifications||[]),notif]};
      saveData(ndWithNotif);
      await sendEmail({
        toEmail: f.email.trim(), toName: f.name.trim(),
        subject: "【MyDesk】登録が完了しました",
        body: `${f.name.trim()} さん、MyDeskへの登録が完了しました。\n\nメールアドレス：${f.email.trim()}\n\nこのメールに心当たりがない場合は無視してください。`,
      });
      setSession(nu); onLogin(nu);
    }
    setLoading(false);
  };

  const sendResetCode = async () => {
    setError(""); setLoading(true);
    const users = await loadUsers();
    const u = users.find(u=>u.email===resetEmail.trim());
    if (!u) { setError("登録されていないメールアドレスです"); setLoading(false); return; }
    const code = String(Math.floor(100000+Math.random()*900000));
    await saveResetToken(resetEmail.trim(), code);
    const result = await sendEmail({
      toEmail: resetEmail.trim(), toName: u.name,
      subject: "【MyDesk】パスワード再設定コード",
      body: `パスワード再設定コード：\n\n${code}\n\nこのコードは15分間有効です。`,
    });
    if (result.dev) setInfo(`[開発モード] コード: ${code}`);
    else setInfo(`${resetEmail.trim()} にコードを送信しました`);
    setLoading(false);
    goMode("reset_code");
  };

  const verifyCode = async () => {
    setError(""); setLoading(true);
    const ok = await verifyResetToken(resetEmail.trim(), resetCode.trim());
    if (!ok) { setError("コードが無効か期限切れです"); setLoading(false); return; }
    setLoading(false);
    goMode("reset_pass");
  };

  const resetPassword = async () => {
    setError(""); setLoading(true);
    if (!newPass||newPass!==newPassC) { setError("パスワードが一致しません"); setLoading(false); return; }
    const users = await loadUsers();
    await saveUsers(users.map(u=>u.email===resetEmail.trim()?{...u,passwordHash:hashPass(newPass)}:u));
    setLoading(false);
    setInfo("パスワードを変更しました。ログインしてください。");
    goMode("login");
  };

  if (mode==="forgot") return (
    <AuthWrap>
      <button onClick={()=>goMode("login")} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",marginBottom:"1.25rem",padding:0}}>‹ ログインに戻る</button>
      <div style={{fontWeight:800,fontSize:"1.05rem",color:C.text,marginBottom:"0.5rem"}}>パスワードを忘れた方</div>
      <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1.5rem"}}>登録済みのメールアドレスに確認コードを送信します</div>
      <AuthErrBox msg={error}/>
      <div style={fw}>
        <label style={lbl}>メールアドレス</label>
        <input type="email" inputMode="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendResetCode()} placeholder="登録済みのメールアドレスを入力" style={is()}/>
      </div>
      <AuthBigBtn onClick={sendResetCode} disabled={loading||!resetEmail.trim()}>{loading?"送信中...":"確認コードを送信"}</AuthBigBtn>
    </AuthWrap>
  );

  if (mode==="reset_code") return (
    <AuthWrap>
      <div style={{fontWeight:800,fontSize:"1.05rem",color:C.text,marginBottom:"0.5rem"}}>確認コードを入力</div>
      <AuthInfoBox msg={info}/>
      <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1.5rem"}}>{resetEmail} に送信した6桁のコードを入力してください</div>
      <AuthErrBox msg={error}/>
      <div style={fw}>
        <label style={lbl}>確認コード（6桁）</label>
        <input type="text" inputMode="numeric" value={resetCode} onChange={e=>setResetCode(e.target.value)} onKeyDown={e=>e.key==="Enter"&&verifyCode()} placeholder="123456" style={is({textAlign:"center",fontSize:"1.5rem",letterSpacing:"0.3em",fontWeight:700})}/>
      </div>
      <AuthBigBtn onClick={verifyCode} disabled={loading||resetCode.length!==6}>{loading?"確認中...":"コードを確認"}</AuthBigBtn>
      <button onClick={sendResetCode} style={{width:"100%",marginTop:"0.75rem",padding:"0.5rem",background:"none",border:"none",color:C.textSub,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>コードを再送信</button>
    </AuthWrap>
  );

  if (mode==="reset_pass") return (
    <AuthWrap>
      <div style={{fontWeight:800,fontSize:"1.05rem",color:C.text,marginBottom:"1.5rem"}}>新しいパスワードを設定</div>
      <AuthErrBox msg={error}/>
      <div style={fw}>
        <label style={lbl}>新しいパスワード</label>
        <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="新しいパスワードを入力" style={is()}/>
      </div>
      <div style={fw}>
        <label style={lbl}>確認</label>
        <input type="password" value={newPassC} onChange={e=>setNewPassC(e.target.value)} onKeyDown={e=>e.key==="Enter"&&resetPassword()} placeholder="もう一度入力" style={is(newPassC&&newPass!==newPassC?{border:"1.5px solid #fca5a5"}:{})}/>
        {newPassC&&newPass!==newPassC&&ferr("パスワードが一致しません")}
      </div>
      <AuthBigBtn onClick={resetPassword} disabled={loading||!newPass||newPass!==newPassC}>{loading?"変更中...":"パスワードを変更"}</AuthBigBtn>
    </AuthWrap>
  );

  // ── LOGIN / REGISTER ──────────────────────────────────────────────────────
  return (
    <AuthWrap>
      <div style={{display:"flex",background:C.bg,borderRadius:"0.75rem",padding:"0.25rem",marginBottom:"1.75rem"}}>
        {[["login","ログイン"],["register","新規登録"]].map(([id,lbl2])=>(
          <button key={id} onClick={()=>goMode(id)}
            style={{flex:1,padding:"0.55rem",borderRadius:"0.55rem",border:"none",cursor:"pointer",fontWeight:700,fontSize:"0.85rem",fontFamily:"inherit",
              background:mode===id?"white":"transparent",color:mode===id?C.text:C.textMuted,boxShadow:mode===id?C.shadow:"none"}}>{lbl2}</button>
        ))}
      </div>
      <AuthInfoBox msg={info}/>
      {mode==="register"&&(
        <div style={fw}>
          <label style={lbl}>氏名</label>
          <input type="text" value={f.name} onChange={e=>setF({...f,name:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="氏名を入力してください（必須）"
            style={is(touched.name&&!f.name.trim()?{border:"1.5px solid #fca5a5"}:{})}/>
          {touched.name&&!f.name.trim()&&ferr("氏名を入力してください")}
        </div>
      )}
      <div style={fw}>
        <label style={lbl}>メールアドレス</label>
        <input type="email" inputMode="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="メールアドレスを入力してください（必須）"
          style={is(touched.email&&!f.email.trim()?{border:"1.5px solid #fca5a5"}:{})}/>
        {touched.email&&!f.email.trim()&&ferr("メールアドレスを入力してください")}
        {error==="このメールはすでに登録されています"&&ferr(error)}
        {error==="メールアドレスまたはパスワードが違います"&&ferr(error)}
      </div>
      {mode==="register"&&(
        <div style={fw}>
          <label style={lbl}>電話番号</label>
          <input type="tel" inputMode="numeric" pattern="[0-9]*" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="電話番号（任意・ハイフンなし）" style={is()}/>
        </div>
      )}
      <div style={fw}>
        <label style={lbl}>パスワード</label>
        <input type="password" value={f.password} onChange={e=>setF({...f,password:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="パスワードを入力してください（必須）"
          style={is(touched.password&&!f.password?{border:"1.5px solid #fca5a5"}:{})}/>
        {touched.password&&!f.password&&ferr("パスワードを入力してください")}
      </div>
      {mode==="register"&&(
        <div style={fw}>
          <label style={lbl}>パスワード（確認）</label>
          <input type="password" value={f.confirm} onChange={e=>setF({...f,confirm:e.target.value})} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="パスワードをもう一度入力（必須）"
            style={is(touched.confirm&&f.confirm&&f.password!==f.confirm?{border:"1.5px solid #fca5a5"}:{})}/>
          {touched.confirm&&f.confirm&&f.password!==f.confirm&&ferr("パスワードが一致しません")}
        </div>
      )}
      <AuthBigBtn onClick={submit} disabled={loading}>{loading?"処理中...":mode==="login"?"ログイン":"アカウントを作成"}</AuthBigBtn>
      {mode==="login"&&(
        <button onClick={()=>goMode("forgot")} style={{width:"100%",marginTop:"1rem",padding:"0.5rem",background:"none",border:"none",color:C.textSub,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
          パスワードを忘れた方はこちら
        </button>
      )}
    </AuthWrap>
  );
}

// ─── TASK ROW ─────────────────────────────────────────────────────────────────
function TaskRow({task,onToggle,onStatusChange,onClick,users=[]}) {
  const near = isNearDue(task) && task.status!=="完了";
  const done = task.status==="完了";
  const assignedNames = (task.assignees||[]).map(id=>users.find(u=>u.id===id)?.name).filter(Boolean);
  const salesBadgeColor = {"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[task.salesRef?.type]||C.accent;
  return (
    <div onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:"0.875rem",padding:"0.875rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:near&&!done?"#eff6ff":"white",cursor:"pointer",position:"relative"}}>
      {task.isPrivate&&<span style={{position:"absolute",top:8,right:8,fontSize:"0.65rem",color:"#dc2626"}}>🔒</span>}
      <button onClick={e=>{e.stopPropagation();onToggle();}}
        style={{width:24,height:24,borderRadius:"50%",flexShrink:0,border:`2.5px solid ${done?"#10b981":"#cbd5e1"}`,background:done?"#10b981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
        {done&&<span style={{color:"white",fontSize:"0.65rem",fontWeight:800}}>✓</span>}
      </button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"0.9rem",fontWeight:done?400:600,color:done?C.textMuted:C.text,textDecoration:done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.2rem",flexWrap:"wrap"}}>
          {task.salesRef&&<span style={{fontSize:"0.65rem",fontWeight:700,color:"white",background:salesBadgeColor,borderRadius:999,padding:"0.05rem 0.4rem",flexShrink:0}}>{task.salesRef.type} · {task.salesRef.name}</span>}
          {task.dueDate&&(()=>{const today=new Date().toISOString().slice(0,10);const isOD=!done&&task.dueDate<today;return <span style={{fontSize:"0.7rem",color:isOD?"#dc2626":near&&!done?"#2563eb":C.textMuted,fontWeight:isOD||near&&!done?700:400}}>{isOD?"⚠️":"📅"}{task.dueDate}{isOD?" 期限切れ":""}</span>;})()}
          {assignedNames.length>0&&<span style={{fontSize:"0.68rem",color:C.textSub}}>👤{assignedNames.join("・")}</span>}
        </div>
      </div>
      <div onClick={e=>e.stopPropagation()}>
        <StatusPill status={task.status} onChange={onStatusChange}/>
      </div>
    </div>
  );
}

// ─── PROJECT ROW ──────────────────────────────────────────────────────────────
function ProjectRow({project,tasks,onClick}) {
  const done = tasks.filter(t=>t.status==="完了").length;
  const pct  = tasks.length>0?(done/tasks.length)*100:0;
  const salesBadgeColor = {"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[project.salesRef?.type]||C.accent;
  return (
    <div onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:"0.875rem",padding:"0.875rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:"white",cursor:"pointer",position:"relative"}}>
      {project.isPrivate&&<span style={{position:"absolute",top:8,right:8,fontSize:"0.65rem",color:"#dc2626"}}>🔒</span>}
      <span style={{fontSize:"1.3rem",flexShrink:0}}>🗂</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:"0.9rem",fontWeight:700,color:C.text}}>{project.name}</div>
        {project.salesRef&&<span style={{fontSize:"0.65rem",fontWeight:700,color:"white",background:salesBadgeColor,borderRadius:999,padding:"0.05rem 0.4rem",display:"inline-block",marginTop:"0.15rem"}}>{project.salesRef.type} · {project.salesRef.name}</span>}
        {(()=>{const ts=(project.tasks||[]);if(!ts.length)return null;const done=ts.filter(t=>t.status==="完了").length;const pct=Math.round(done/ts.length*100);return <div style={{marginTop:"0.35rem"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"0.65rem",color:C.textMuted,marginBottom:"0.15rem"}}><span>進捗</span><span>{done}/{ts.length}完了 ({pct}%)</span></div><div style={{height:4,borderRadius:999,background:C.borderLight,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",background:pct===100?"#059669":C.accent,borderRadius:999}}/></div></div>;})()}
        {tasks.length>0?(
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.35rem"}}>
            <div style={{flex:1,maxWidth:120,height:4,background:C.borderLight,borderRadius:999,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${C.accent},${C.accentDark})`,borderRadius:999}}/>
            </div>
            <span style={{fontSize:"0.72rem",color:C.textMuted,fontWeight:600}}>{done}/{tasks.length} 完了</span>
          </div>
        ):<div style={{fontSize:"0.75rem",color:C.textMuted,marginTop:"0.2rem"}}>タスクなし</div>}
      </div>
      <span style={{color:C.textMuted,fontSize:"1rem"}}>›</span>
    </div>
  );
}

// ─── TASK FORM ────────────────────────────────────────────────────────────────
function TaskForm({initial={},onSave,onClose,users=[],currentUserId=null}) {
  const [f,setF]=useState({
    title:initial.title||"",status:initial.status||"未着手",
    dueDate:initial.dueDate||"",notes:initial.notes||"",
    assignees:initial.assignees||(currentUserId?[currentUserId]:[]),
    isPrivate:initial.isPrivate||false,
  });
  return (
    <div>
      <FieldLbl label="タイトル *"><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="タスク名" autoFocus/></FieldLbl>
      <FieldLbl label="ステータス"><SelectEl value={f.status} onChange={e=>setF({...f,status:e.target.value})}>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</SelectEl></FieldLbl>
      <FieldLbl label="期限"><Input type="date" value={f.dueDate} onChange={e=>setF({...f,dueDate:e.target.value})}/></FieldLbl>
      <UserPicker users={users} selected={f.assignees} onChange={v=>setF({...f,assignees:v})} label="担当者"/>
      <PrivateToggle value={f.isPrivate} onChange={v=>setF({...f,isPrivate:v})}/>
      <FieldLbl label="メモ"><Textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} style={{height:80}} placeholder="補足..."/></FieldLbl>
      <div style={{display:"flex",gap:"0.75rem"}}>
        <Btn variant="secondary" style={{flex:1}} onClick={onClose}>キャンセル</Btn>
        <Btn style={{flex:2}} size="lg" onClick={()=>onSave(f)} disabled={!f.title.trim()}>保存する</Btn>
      </div>
    </div>
  );
}

// ─── PROJECT FORM ─────────────────────────────────────────────────────────────
function ProjectForm({initial={},onSave,onClose,users=[],currentUserId=null}) {
  const [f,setF]=useState({
    name:initial.name||"",notes:initial.notes||"",
    members:initial.members||(currentUserId?[currentUserId]:[]),
    isPrivate:initial.isPrivate||false,
  });
  return (
    <div>
      <FieldLbl label="プロジェクト名 *"><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="例：DX推進プロジェクト" autoFocus/></FieldLbl>
      <UserPicker users={users} selected={f.members} onChange={v=>setF({...f,members:v})} label="メンバー"/>
      <PrivateToggle value={f.isPrivate} onChange={v=>setF({...f,isPrivate:v})}/>
      <FieldLbl label="メモ"><Textarea value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} style={{height:80}} placeholder="概要..."/></FieldLbl>
      <div style={{display:"flex",gap:"0.75rem"}}>
        <Btn variant="secondary" style={{flex:1}} onClick={onClose}>キャンセル</Btn>
        <Btn style={{flex:2}} size="lg" onClick={()=>onSave(f)} disabled={!f.name.trim()}>保存する</Btn>
      </div>
    </div>
  );
}

// ─── STATUS COUNT BAR ─────────────────────────────────────────────────────────
function StatusCountBar({tasks}) {
  const targets = STATUS_OPTIONS.filter(s=>s!=="完了");
  const counts  = targets.map(s=>({s,count:tasks.filter(t=>t.status===s).length})).filter(x=>x.count>0);
  if (!counts.length) return null;
  return (
    <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"1rem"}}>
      {counts.map(({s,count})=>{const m=STATUS_META[s];return(
        <div key={s} style={{display:"flex",alignItems:"center",gap:"0.35rem",padding:"0.35rem 0.875rem",borderRadius:999,background:m.bg,border:`1px solid ${m.color}40`}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:m.dot,flexShrink:0}}/>
          <span style={{fontSize:"0.72rem",fontWeight:700,color:m.color}}>{s} {count}</span>
        </div>
      );})}
    </div>
  );
}

// ─── TASK COMMENT INPUT ──────────────────────────────────────────────────────
function TaskCommentInput({taskId, data, setData, users=[], uid}) {
  const [text, setText] = useState("");
  const submit = () => {
    if(!text.trim()) return;
    const task = (data.tasks||[]).find(t=>t.id===taskId);
    if(!task) return;
    const comment = {id:Date.now(), userId:uid, text, date:new Date().toISOString()};
    const tasks = (data.tasks||[]).map(t=>t.id===taskId?{...t,comments:[...(t.comments||[]),comment]}:t);
    let nd = {...data, tasks};
    // 担当者+作成者に通知（自分以外）
    const toIds = [...new Set([...(task.assignees||[]), task.createdBy].filter(i=>i&&i!==uid))];
    if(toIds.length) nd = addNotif(nd,{type:"task_comment",title:`「${task.title}」にコメントが追加されました`,body:text.slice(0,60),toUserIds:toIds,fromUserId:uid});
    // 自己完結保存+プッシュ
    setData(nd); saveData(nd);
    if(toIds.length) {
      fetch('/api/send-push',{method:'POST',headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
        body:JSON.stringify({toUserIds:toIds,title:`「${task.title}」にコメントが追加されました`,body:text.slice(0,60),tag:'task_comment'})
      }).catch(()=>{});
    }
    setText("");
  };
  return (
    <div style={{display:"flex",gap:"0.4rem"}}>
      <input value={text} onChange={e=>setText(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit();}}}
        placeholder="コメントを追加... (@名前 でメンション)"
        style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
      <button onClick={submit} disabled={!text.trim()}
        style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:text.trim()?1:0.4}}>
        送信
      </button>
    </div>
  );
}

// ─── TASK VIEW ────────────────────────────────────────────────────────────────
function TaskView({data,setData,users=[],currentUser=null,taskTab,setTaskTab,pjTab,setPjTab,navTarget,clearNavTarget}) {
  const uid = currentUser?.id;

  // ── State（全て先頭にまとめる）─────────────────────────────────────────
  const [screen,setScreen] = useState("list");
  const [activePjId,setActivePjId] = useState(null);
  const [activeTaskId,setActiveTaskId] = useState(null);
  const [fromProject,setFromProject] = useState(null);
  const [sheet,setSheet] = useState(null);
  const [tMemoIn,setTMemoIn]= useState({});
  const [tChatIn,setTChatIn]= useState({});
  const [doneOpenList,setDoneOpenList]= useState(false);  // タスクリスト完了折り畳み
  const [doneOpenPj,setDoneOpenPj]  = useState(false);   // プロジェクト内完了折り畳み
  const [taskDupModal,setTaskDupModal] = useState(null);  // 重複確認モーダル
  const [showMineOnly, setShowMineOnly] = React.useState(false);

  // ── ローカル保存＋プッシュ（App に依存しない自己完結版）────────────────
  const saveWithPush = React.useCallback((nd, notifsBefore) => {
    if (!nd || typeof nd !== "object") { console.warn("MyDesk: saveWithPush called with invalid data"); return; }
    setData(nd);
    window.__myDeskLastSave = Date.now(); // 競合防止タグ
    saveData(nd); // グローバル関数
    // 新着通知を検出してWeb Push送信
    const newNotifs = (nd.notifications||[]).filter(n=>
      !(notifsBefore||[]).some(o=>o.id===n.id)
    );
    if(!newNotifs.length) return;
    const byUser = {};
    newNotifs.forEach(n=>{
      if(!n.toUserId) return;
      if(!byUser[n.toUserId]) byUser[n.toUserId]={title:n.title,body:n.body||'',tag:n.type||'mydesk'};
    });
    Object.entries(byUser).forEach(([toId,{title,body,tag}])=>{
      const targets = toId==='__all__'
        ? users.filter(u=>u.id!==uid).map(u=>u.id)
        : (toId!==uid ? [toId] : []);
      if(!targets.length) return;
      fetch('/api/send-push',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
        body:JSON.stringify({toUserIds:targets,title,body,tag}),
      }).catch(()=>{});
    });
  }, [setData, users, uid]);

  // 営業など外部からのナビゲーション
  React.useEffect(()=>{
    if(!navTarget) return;
    if(navTarget.type==="task"){
      setActiveTaskId(navTarget.id);
      setFromProject(null);
      setScreen("taskDetail");
      setTaskTab("info");
    } else if(navTarget.type==="project"){
      setActivePjId(navTarget.id);
      setScreen("projectDetail");
    }
    clearNavTarget?.();
  },[navTarget]);

  const allTasks    = data.tasks    || [];
  const allProjects = data.projects || [];

  const visibleTasks    = allTasks.filter(t=>canSee(t,uid));
  const allVisibleProjects = allProjects.filter(p=>canSee(p,uid));
  const visibleProjects = showMineOnly ? allVisibleProjects.filter(p=>(p.members||[]).includes(uid)||p.createdBy===uid) : allVisibleProjects;

  const requestReview = (taskId, toUserId, note) => {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    const toUser = users.find(u => u.id === toUserId);
    const reviewTask = {
      id: Date.now() + Math.random(),
      title: `【確認依頼】${task.title}`,
      status: "未着手",
      dueDate: task.dueDate || "",
      notes: note || "",
      assignees: [toUserId],
      isPrivate: task.isPrivate || false,
      projectId: task.projectId || null,
      createdBy: uid,
      reviewOf: { taskId: task.id, taskTitle: task.title, fromUserId: uid, note: note || "" },
      comments: [], memos: [], chat: [], files: [],
      createdAt: new Date().toISOString(),
    };
    let nd = { ...data, tasks: [...allTasks, reviewTask] };
    nd = addNotif(nd, {
      type: "task_assign",
      title: `「${task.title}」の確認依頼が届きました`,
      body: `依頼者：${users.find(u=>u.id===uid)?.name||""}  ${note?"メッセージ："+note:""}`,
      toUserIds: [toUserId],
      fromUserId: uid,
    });
    saveWithPush(nd, data.notifications);
  };

  // 差し戻し処理
  // reviewTaskId: 確認依頼タスクのID（確認者が持つタスク）
  const rejectReview = (reviewTaskId, rejectNote) => {
    const reviewTask = allTasks.find(t => t.id === reviewTaskId);
    if (!reviewTask?.reviewOf) return;
    const originalTaskId = reviewTask.reviewOf.taskId;
    const originalTask = allTasks.find(t => t.id === originalTaskId);
    const fromUserId = reviewTask.reviewOf.fromUserId;

    // 確認依頼タスクに差し戻しフラグをセット
    let nd = {
      ...data,
      tasks: allTasks.map(t => {
        if (t.id === reviewTaskId) {
          return { ...t, reviewOf: { ...t.reviewOf, rejected: true, rejectNote: rejectNote || "" } };
        }
        // 元タスクのステータスを「進行中」に戻す
        if (t.id === originalTaskId) {
          return { ...t, status: "進行中" };
        }
        return t;
      })
    };

    // 依頼者への通知
    if (fromUserId) {
      nd = addNotif(nd, {
        type: "task_assign",
        title: `「${reviewTask.reviewOf.taskTitle}」が差し戻されました`,
        body: `差し戻し者：${users.find(u=>u.id===uid)?.name||""}  ${rejectNote?"理由："+rejectNote:""}`,
        toUserIds: [fromUserId],
        fromUserId: uid,
      });
    }
    saveWithPush(nd, data.notifications);
  };

  const addFileToTask = (taskId, file) => {
    const nd = { ...data, tasks: allTasks.map(t => t.id === taskId ? { ...t, files: [...(t.files||[]), file] } : t) };
    setData(nd); saveData(nd);
  };
  const removeFileFromTask = (taskId, fileIdOrUrl) => {
    const nd = { ...data, tasks: allTasks.map(t => t.id === taskId ? { ...t, files: (t.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl) } : t) };
    setData(nd); saveData(nd);
  };
  const addFileToPj = (pjId, file) => {
    const nd = { ...data, projects: allProjects.map(p => p.id === pjId ? { ...p, files: [...(p.files||[]), file] } : p) };
    setData(nd); saveData(nd);
  };
  const removeFileFromPj = (pjId, fileIdOrUrl) => {
    const nd = { ...data, projects: allProjects.map(p => p.id === pjId ? { ...p, files: (p.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl) } : p) };
    setData(nd); saveData(nd);
  };

  const updateTask = (id,ch) => {
    const prev = allTasks.find(t=>t.id===id);
    let nd = {...data,tasks:allTasks.map(t=>t.id===id?{...t,...ch}:t)};
    const updated = nd.tasks.find(t=>t.id===id);
    // Notify on status change
    if(ch.status && prev?.status !== ch.status) {
      const toIds=(updated.assignees||[]).filter(i=>i!==uid);
      if(toIds.length) nd=addNotif(nd,{type:"task_status",title:`「${updated.title}」のステータスが変更されました`,body:`${ch.status}`,toUserIds:toIds,fromUserId:uid});
    }
    // Notify on new assignees
    if(ch.assignees) {
      const prev_a=prev?.assignees||[];
      const newlyAdded=(ch.assignees||[]).filter(i=>i!==uid&&!prev_a.includes(i));
      if(newlyAdded.length) nd=addNotif(nd,{type:"task_assign",title:`「${updated.title}」に担当者として追加されました`,body:"",toUserIds:newlyAdded,fromUserId:uid});
    }
    saveWithPush(nd, data.notifications);
  };
  const _doAddTask = (f,pjId=null) => {
    const item={id:Date.now(),...f,projectId:pjId,createdBy:uid,comments:[],memos:[],chat:[],createdAt:new Date().toISOString()};
    let nd={...data,tasks:[...allTasks,item]};
    // Auto-add task assignees to project members
    if(pjId){
      const pj=allProjects.find(p=>p.id===pjId);
      if(pj){
        const newMembers=[...new Set([...(pj.members||[]),...(f.assignees||[])])];
        if(newMembers.length!==(pj.members||[]).length){
          nd={...nd,projects:nd.projects.map(p=>p.id===pjId?{...p,members:newMembers}:p)};
          // プロジェクトに新規追加されたメンバーに通知
          const addedToProject=(f.assignees||[]).filter(i=>!(pj.members||[]).includes(i)&&i!==uid);
          if(addedToProject.length) nd=addNotif(nd,{type:"task_assign",title:`「${pj.name}」のプロジェクトメンバーに追加されました`,body:`タスク「${item.title}」への追加によりメンバーになりました`,toUserIds:addedToProject,fromUserId:uid});
        }
      }
    }
    // Notify assignees on task creation
    const toIds=(f.assignees||[]).filter(i=>i!==uid);
    if(toIds.length) nd=addNotif(nd,{type:"task_assign",title:`「${item.title}」に担当者として追加されました`,body:"",toUserIds:toIds,fromUserId:uid});
    saveWithPush(nd, data.notifications);
    setSheet(null); // 保存後にシートを閉じる
  };
  const addTask = (f, pjId=null, skipDup=false) => {
    if(!skipDup && f.title?.trim()) {
      const norm = s => s.replace(/[\s　]/g,'').toLowerCase();
      const scope = pjId ? allTasks.filter(t=>t.projectId===pjId) : allTasks.filter(t=>!t.projectId);
      const dup = scope.find(t => norm(t.title)===norm(f.title));
      if(dup) {
        setTaskDupModal({
          existing: {...dup, title: dup.title, status: dup.status, dueDate: dup.dueDate||"",
            assigneesText: (dup.assignees||[]).map(id=>users.find(u=>u.id===id)?.name).filter(Boolean).join("、")},
          incoming: f.title,
          onKeepBoth: ()=>{ setTaskDupModal(null); _doAddTask(f,pjId); setSheet(null); },
          onCancel: ()=>setTaskDupModal(null),
        });
        return;
      }
    }
    _doAddTask(f, pjId);
  };
  const deleteTask = id => { const u={...data,tasks:allTasks.filter(t=>t.id!==id)}; setData(u); saveData(u); };
  const _doAddProject = (f) => {
    const item={id:Date.now(),...f,createdBy:uid,memos:[],chat:[],createdAt:new Date().toISOString()};
    let nd={...data,projects:[...allProjects,item]};
    const toIds=(f.members||[]).filter(i=>i!==uid);
    if(toIds.length) nd=addNotif(nd,{type:"task_assign",title:`「${item.name}」プロジェクトのメンバーに追加されました`,body:"",toUserIds:toIds,fromUserId:uid});
    saveWithPush(nd, data.notifications);
    setSheet(null); // 保存後にシートを閉じる
  };
  const addProject = (f, skipDup=false) => {
    if(!skipDup && f.name?.trim()) {
      const norm = s => s.replace(/[\s　]/g,'').toLowerCase();
      const dup = allProjects.find(p => norm(p.name)===norm(f.name));
      if(dup) {
        setTaskDupModal({
          existing: {...dup, name: dup.name, status: dup.status||"",
            notes: dup.notes||"",
            membersText: (dup.members||[]).map(id=>users.find(u=>u.id===id)?.name).filter(Boolean).join("、")},
          incoming: f.name,
          onKeepBoth: ()=>{ setTaskDupModal(null); _doAddProject(f); setSheet(null); },
          onCancel: ()=>setTaskDupModal(null),
        });
        return;
      }
    }
    _doAddProject(f);
  };
  const updateProject = (id,ch) => { const u={...data,projects:allProjects.map(p=>p.id===id?{...p,...ch}:p)}; setData(u); saveData(u); };
  const deleteProject = id => {
    const u={...data,projects:allProjects.filter(p=>p.id!==id),tasks:allTasks.filter(t=>t.projectId!==id)};
    setData(u); saveData(u);
  };

  // ── Memo / Chat for tasks & projects ────────────────────────────────────
  const addTMemo = (entityKey, entityId, text) => {
    if(!text?.trim()) return;
    const memo = {id:Date.now(), userId:uid, text, date:new Date().toISOString()};
    const arr = (data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:[...(x.memos||[]),memo]}:x);
    const entity = (data[entityKey]||[]).find(x=>x.id===entityId);
    let nd = {...data,[entityKey]:arr};
    // 全員に通知（自分以外）
    const toAll = users.filter(u=>u.id!==uid).map(u=>u.id);
    if(toAll.length) nd = addNotif(nd,{type:"memo",title:`「${entity?.title||entity?.name||""}」にメモが追加されました`,body:text.slice(0,60),toUserIds:toAll,fromUserId:uid});
    saveWithPush(nd, data.notifications);
    setTMemoIn(p=>({...p,[entityId]:""}));
  };
  const addTChat = (entityKey, entityId, text) => {
    if(!text?.trim()) return;
    const msg = {id:Date.now(), userId:uid, text, date:new Date().toISOString()};
    const arr = (data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:[...(x.chat||[]),msg]}:x);
    const entity = (data[entityKey]||[]).find(x=>x.id===entityId);
    let nd = {...data,[entityKey]:arr};
    // @メンション通知
    const mentioned = users.filter(u=>u.id!==uid&&text.includes(`@${u.name}`));
    if(mentioned.length) nd = addNotif(nd,{type:"mention",title:`「${entity?.title||entity?.name||""}」でメンションされました`,body:text.slice(0,60),toUserIds:mentioned.map(u=>u.id),fromUserId:uid});
    saveWithPush(nd, data.notifications);
    setTChatIn(p=>({...p,[entityId]:""}));
  };

  // ── Shared sub-components (task/project) ─────────────────────────────────
  const TMemoSection = ({entityKey,entityId,memos=[]}) => (
    <div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"0.625rem"}}>
        {memos.length===0&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:C.bg,borderRadius:"0.75rem",fontSize:"0.82rem"}}>メモなし</div>}
        {[...memos].reverse().map(m=>{
          const mu=users.find(u=>u.id===m.userId);
          return (
            <div key={m.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accentDark}}>{mu?.name||"不明"}</span>
                <span style={{fontSize:"0.65rem",color:C.textMuted}}>{new Date(m.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <div style={{fontSize:"0.85rem",color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:"0.4rem"}}>
        <textarea value={tMemoIn[entityId]||""} onChange={e=>setTMemoIn(p=>({...p,[entityId]:e.target.value}))}
          placeholder="メモを追加..."
          style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",resize:"none",minHeight:60,lineHeight:1.5}}/>
        <button onClick={()=>addTMemo(entityKey,entityId,tMemoIn[entityId]||"")} disabled={!(tMemoIn[entityId]||"").trim()}
          style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-end",opacity:(tMemoIn[entityId]||"").trim()?1:0.4}}>
          追加
        </button>
      </div>
    </div>
  );
  const TChatSection = ({entityKey,entityId,chat=[]}) => {
    const val = tChatIn[entityId]||"";
    // @以降の入力でメンション候補を絞り込む
    const atMatch = val.match(/@([^\s　]*)$/);
    const mentionQuery = atMatch ? atMatch[1].toLowerCase() : null;
    const mentionCandidates = mentionQuery !== null
      ? users.filter(u=>u.id!==uid && u.name.toLowerCase().includes(mentionQuery)).slice(0,5)
      : [];
    const insertMention = (name) => {
      const newVal = val.replace(/@([^\s　]*)$/, `@${name} `);
      setTChatIn(p=>({...p,[entityId]:newVal}));
    };
    return (
    <div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.4rem",marginBottom:"0.625rem"}}>
        {chat.length===0&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:C.bg,borderRadius:"0.75rem",fontSize:"0.82rem"}}>まだコメントがありません</div>}
        {chat.map(m=>{
          const cu=users.find(u=>u.id===m.userId);
          const isMe=m.userId===uid;
          return (
            <div key={m.id} style={{display:"flex",flexDirection:isMe?"row-reverse":"row",gap:"0.4rem",alignItems:"flex-end"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.62rem",fontWeight:800,color:"white",flexShrink:0}}>
                {cu?cu.name.charAt(0):"?"}
              </div>
              <div style={{maxWidth:"75%"}}>
                {!isMe&&<div style={{fontSize:"0.6rem",color:C.textMuted,marginBottom:"0.1rem",fontWeight:600}}>{cu?.name}</div>}
                <div style={{background:isMe?C.accent:"white",color:isMe?"white":C.text,borderRadius:isMe?"0.875rem 0.875rem 0.25rem 0.875rem":"0.875rem 0.875rem 0.875rem 0.25rem",padding:"0.4rem 0.7rem",fontSize:"0.85rem",lineHeight:1.5,border:isMe?"none":`1px solid ${C.border}`,boxShadow:C.shadow}}>
                  {m.text.split(/(@\S+)/g).map((p,i)=>p.startsWith("@")?<span key={i} style={{background:"rgba(255,255,255,0.25)",borderRadius:3,padding:"0 2px",fontWeight:700}}>{p}</span>:p)}
                </div>
                <div style={{fontSize:"0.58rem",color:C.textMuted,marginTop:"0.1rem",textAlign:isMe?"right":"left"}}>{new Date(m.date).toLocaleTimeString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{position:"relative"}}>
        {mentionCandidates.length>0&&(
          <div style={{position:"absolute",bottom:"100%",left:0,right:0,background:"white",border:`1px solid ${C.border}`,borderRadius:"0.75rem",boxShadow:C.shadowMd,zIndex:50,overflow:"hidden",marginBottom:4}}>
            {mentionCandidates.map(u=>(
              <button key={u.id} onMouseDown={e=>{e.preventDefault();insertMention(u.name);}}
                style={{display:"flex",alignItems:"center",gap:"0.5rem",width:"100%",padding:"0.5rem 0.875rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",borderBottom:`1px solid ${C.borderLight}`}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.6rem",fontWeight:800,color:"white",flexShrink:0}}>
                  {u.name.charAt(0)}
                </div>
                <span style={{fontSize:"0.85rem",fontWeight:600,color:C.text}}>@{u.name}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{display:"flex",gap:"0.4rem"}}>
          <input value={val} onChange={e=>setTChatIn(p=>({...p,[entityId]:e.target.value}))}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addTChat(entityKey,entityId,val);}}}
            placeholder="コメント... (@ でメンション)"
            style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
          <button onClick={()=>addTChat(entityKey,entityId,val)} disabled={!val.trim()}
            style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:val.trim()?1:0.4}}>
            送信
          </button>
        </div>
      </div>
    </div>
    );
  };

  const activePj   = allProjects.find(p=>p.id===activePjId);
  const activeTask = allTasks.find(t=>t.id===activeTaskId);

  const myVisibleTasks = showMineOnly ? visibleTasks.filter(t=>(t.assignees||[]).includes(uid)||t.createdBy===uid) : visibleTasks;
    const standaloneTasks = myVisibleTasks.filter(t=>!t.projectId);
  const activeStandalone = standaloneTasks.filter(t=>t.status!=="完了");
  const doneStandalone   = standaloneTasks.filter(t=>t.status==="完了");
  const pjTasks    = activePj ? visibleTasks.filter(t=>t.projectId===activePjId) : [];
  const activePjTasks = pjTasks.filter(t=>t.status!=="完了");
  const donePjTasks   = pjTasks.filter(t=>t.status==="完了");

  // ── TASK DETAIL ────────────────────────────────────────────────────────────
  if (screen==="taskDetail" && activeTask) {
    const meta = STATUS_META[activeTask.status]||STATUS_META["未着手"];
    const parentPj = activeTask.projectId ? allProjects.find(p=>p.id===activeTask.projectId) : null;
    const assignedNames = (activeTask.assignees||[]).map(id=>users.find(u=>u.id===id)?.name).filter(Boolean);
    const taskChatUnread=(data.notifications||[]).filter(n=>n.toUserId===uid&&!n.read&&n.type==="mention"&&n.entityId===activeTask.id).length;
    const TASK_TABS=[["info","📋","情報"],["memo","📝","メモ"],["chat","💬","チャット"],["review","📨","確認依頼"],["files","📎","ファイル"]];
    return (
      <div>
        <button onClick={()=>{setScreen(fromProject?"projectDetail":"list");setTaskTab("info");}}
          style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",marginBottom:"1.25rem",padding:0}}>
          ‹ {fromProject?activePj?.name:"タスク一覧"}
        </button>
        {/* タイトルカード（常時表示） */}
        <Card style={{padding:"1rem 1.25rem",marginBottom:"0.875rem"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:"0.75rem"}}>
            <button onClick={()=>updateTask(activeTask.id,{status:activeTask.status==="完了"?"未着手":"完了"})}
              style={{width:26,height:26,borderRadius:"50%",flexShrink:0,marginTop:2,border:`2.5px solid ${activeTask.status==="完了"?"#10b981":"#cbd5e1"}`,background:activeTask.status==="完了"?"#10b981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
              {activeTask.status==="完了"&&<span style={{color:"white",fontSize:"0.72rem",fontWeight:800}}>✓</span>}
            </button>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:"1rem",fontWeight:700,color:activeTask.status==="完了"?C.textMuted:C.text,textDecoration:activeTask.status==="完了"?"line-through":"none",marginBottom:"0.35rem"}}>{activeTask.title}</div>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap"}}>
                <StatusPill status={activeTask.status} onChange={s=>updateTask(activeTask.id,{status:s})}/>
                {activeTask.isPrivate&&<span style={{fontSize:"0.68rem",color:"#dc2626",fontWeight:700}}>🔒</span>}
              </div>
            </div>
          </div>
        </Card>
        {/* Tabs */}
        <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
          {TASK_TABS.map(([id,icon,lbl])=>(
            <button key={id} onClick={()=>setTaskTab(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.78rem",position:"relative",background:taskTab===id?C.accent:"transparent",color:taskTab===id?"white":C.textSub}}>
              {icon} {lbl}
              {id==="chat"&&taskChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{taskChatUnread}</span>}
            </button>
          ))}
        </div>
        {/* 情報タブ */}
        {taskTab==="info"&&(
          <div>
            {parentPj&&<div style={{background:C.bg,borderRadius:"0.625rem",padding:"0.5rem 0.75rem",marginBottom:"0.75rem",fontSize:"0.8rem",color:C.textSub}}>🗂 {parentPj.name}</div>}
            {activeTask.salesRef&&(()=>{
              const col={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[activeTask.salesRef.type]||C.accent;
              return <div style={{background:col+"15",border:`1px solid ${col}44`,borderRadius:"0.625rem",padding:"0.5rem 0.75rem",marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
                <span style={{fontSize:"0.7rem",fontWeight:700,color:"white",background:col,borderRadius:999,padding:"0.1rem 0.5rem"}}>{activeTask.salesRef.type}</span>
                <span style={{fontSize:"0.82rem",fontWeight:700,color:col}}>{activeTask.salesRef.name}</span>
              </div>;
            })()}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"0.875rem"}}>
              {[["📅 期限",activeTask.dueDate||"未設定"],["👤 担当",assignedNames.length>0?assignedNames.join("・"):"未設定"]].map(([k,v])=>(
                <div key={k} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.625rem",padding:"0.5rem 0.75rem",boxShadow:C.shadow}}>
                  <div style={{fontSize:"0.65rem",color:C.textMuted}}>{k}</div>
                  <div style={{fontSize:"0.82rem",fontWeight:700,color:C.text}}>{v}</div>
                </div>
              ))}
            </div>
            {activeTask.notes&&<div style={{fontSize:"0.85rem",color:C.textSub,lineHeight:1.6,padding:"0.75rem",background:"white",border:`1px solid ${C.border}`,borderRadius:"0.75rem",marginBottom:"0.875rem",boxShadow:C.shadow}}>{activeTask.notes}</div>}
            <div style={{display:"flex",gap:"0.5rem"}}>
              <Btn variant="secondary" onClick={()=>setSheet("editTask")}>✏️ 編集</Btn>
              <Btn variant="danger" onClick={()=>{if(window.confirm("削除しますか？")){deleteTask(activeTask.id);setScreen(fromProject?"projectDetail":"list");}}}>🗑 削除</Btn>
            </div>
          </div>
        )}
        {/* メモタブ */}
        {taskTab==="memo"&&TMemoSection({entityKey:"tasks",entityId:activeTask.id,memos:activeTask.memos||[]})}
        {/* チャットタブ */}
        {taskTab==="chat"&&TChatSection({entityKey:"tasks",entityId:activeTask.id,chat:activeTask.chat||[]})}
        {/* 確認依頼タブ */}
        {taskTab==="review"&&<ReviewRequestSection
          task={activeTask} users={users} uid={uid} allTasks={allTasks}
          onRequestReview={(toUserId,note)=>requestReview(activeTask.id,toUserId,note)}
          onRejectReview={(reviewTaskId,note)=>rejectReview(reviewTaskId,note)}/>}
        {/* ファイルタブ */}
        {taskTab==="files"&&<FileSection
          files={activeTask.files||[]} currentUserId={uid}
          onAdd={f=>addFileToTask(activeTask.id,f)}
          onDelete={fid=>removeFileFromTask(activeTask.id,fid)}/>}
        {sheet==="editTask"&&<Sheet title="タスクを編集" onClose={()=>setSheet(null)}>
          <TaskForm initial={activeTask} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{updateTask(activeTask.id,f);setSheet(null);}}/>
        </Sheet>}
      </div>
    );
  }

  // ── PROJECT DETAIL ──────────────────────────────────────────────────────────
  if (screen==="projectDetail" && activePj) {
    const memberNames = (activePj.members||[]).map(id=>users.find(u=>u.id===id)?.name).filter(Boolean);
    const pjChatUnread=(data.notifications||[]).filter(n=>n.toUserId===uid&&!n.read&&n.type==="mention"&&n.entityId===activePj.id).length;
    const PJ_TABS=[["tasks","📋","タスク"],["memo","📝","メモ"],["chat","💬","チャット"],["files","📎","ファイル"]];
    return (
      <div>
        <button onClick={()=>{setScreen("list");setPjTab("tasks");}}
          style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",marginBottom:"1.25rem",padding:0}}>
          ‹ タスク一覧
        </button>
        <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.5rem"}}>
            <div>
              <div style={{fontSize:"1.15rem",fontWeight:800,color:C.text}}>{activePj.name}</div>
              {memberNames.length>0&&<div style={{fontSize:"0.78rem",color:C.textSub,marginTop:"0.25rem"}}>👥 {memberNames.join("・")}</div>}
              {activePj.isPrivate&&<div style={{fontSize:"0.72rem",color:"#dc2626",fontWeight:700,marginTop:"0.2rem"}}>🔒 プライベート</div>}
            </div>
            <Btn variant="ghost" size="sm" onClick={()=>setSheet("editProject")}>✏️</Btn>
          </div>
          {activePj.notes&&<div style={{fontSize:"0.82rem",color:C.textSub,marginTop:"0.5rem"}}>{activePj.notes}</div>}
        </Card>
        {/* Tabs */}
        <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
          {PJ_TABS.map(([id,icon,lbl])=>(
            <button key={id} onClick={()=>setPjTab(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.78rem",position:"relative",background:pjTab===id?C.accent:"transparent",color:pjTab===id?"white":C.textSub}}>
              {icon} {lbl}
              {id==="chat"&&pjChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{pjChatUnread}</span>}
            </button>
          ))}
        </div>
        {/* タスクタブ */}
        {pjTab==="tasks"&&(
          <div>
            <StatusCountBar tasks={pjTasks}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem"}}>
              <h4 style={{margin:0,fontSize:"0.85rem",fontWeight:800,color:C.text}}>タスク</h4>
              <Btn size="sm" onClick={()=>setSheet("addPjTask")}>＋ タスク追加</Btn>
            </div>
            <Card style={{overflow:"hidden",marginBottom:"1rem"}}>
              {pjTasks.length===0&&(
                <div style={{padding:"2rem",textAlign:"center",color:C.textMuted,fontSize:"0.85rem"}}>タスクなし</div>
              )}
              {STATUS_OPTIONS.map(status=>{
                const group=pjTasks.filter(t=>t.status===status);
                if(!group.length) return null;
                const m=STATUS_META[status];
                const isDone = status==="完了";
                return (
                  <React.Fragment key={status}>
                    <div onClick={isDone?()=>setDoneOpenPj(v=>!v):undefined}
                      style={{padding:"0.35rem 1rem",background:m.bg,borderTop:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",gap:"0.4rem",cursor:isDone?"pointer":undefined}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:m.dot,display:"inline-block",flexShrink:0}}/>
                      <span style={{fontSize:"0.7rem",fontWeight:700,color:m.color,letterSpacing:"0.04em"}}>{status}</span>
                      <span style={{fontSize:"0.7rem",color:m.color,opacity:0.7,marginLeft:"auto"}}>{group.length}件</span>
                      {isDone&&<span style={{fontSize:"0.7rem",color:m.color,marginLeft:"0.25rem"}}>{doneOpenPj?"▲":"▼"}</span>}
                    </div>
                    {(!isDone||doneOpenPj)&&group.map(t=>(
                      <TaskRow key={t.id} task={t} users={users}
                        onToggle={()=>updateTask(t.id,{status:t.status==="完了"?"未着手":"完了"})}
                        onStatusChange={s=>updateTask(t.id,{status:s})}
                        onClick={()=>{setActiveTaskId(t.id);setFromProject(activePjId);setScreen("taskDetail");setTaskTab("info");}}/>
                    ))}
                  </React.Fragment>
                );
              })}
            </Card>
            <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("プロジェクトとタスクをすべて削除しますか？")){deleteProject(activePj.id);setScreen("list");}}}>🗑 プロジェクトを削除</Btn>
          </div>
        )}
        {/* メモタブ */}
        {pjTab==="memo"&&TMemoSection({entityKey:"projects",entityId:activePj.id,memos:activePj.memos||[]})}
        {/* チャットタブ */}
        {pjTab==="chat"&&TChatSection({entityKey:"projects",entityId:activePj.id,chat:activePj.chat||[]})}
        {pjTab==="files"&&<FileSection
          files={activePj.files||[]} currentUserId={uid}
          onAdd={f=>addFileToPj(activePj.id,f)}
          onDelete={fid=>removeFileFromPj(activePj.id,fid)}/>}
        {sheet==="addPjTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
          <TaskForm initial={{status:"未着手"}} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{addTask(f,activePjId);}}/>
        </Sheet>}
        {sheet==="editProject"&&<Sheet title="プロジェクトを編集" onClose={()=>setSheet(null)}>
          <ProjectForm initial={activePj} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{updateProject(activePj.id,f);setSheet(null);}}/>
        </Sheet>}
        {taskDupModal&&<DupModal
          existing={taskDupModal.existing}
          incoming={taskDupModal.incoming}
          onKeepBoth={taskDupModal.onKeepBoth}
          onUseExisting={null}
          onCancel={taskDupModal.onCancel}
        />}
      </div>
    );
  }

  // ── LIST ────────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0,0,0,0);
  const urgentTasks = visibleTasks.filter(t=>{
    if(t.status==="完了"||!t.dueDate) return false;
    const d=new Date(t.dueDate); d.setHours(0,0,0,0);
    return (d-today)/(1000*60*60*24)<=2;
  }).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  return (
    <div>
      {urgentTasks.length>0&&(
        <div style={{marginBottom:"1rem",background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:"0.875rem",overflow:"hidden"}}>
          <div style={{padding:"0.6rem 1rem",display:"flex",alignItems:"center",gap:"0.5rem",borderBottom:"1px solid #fed7aa"}}>
            <span style={{fontSize:"1rem"}}>⏰</span>
            <span style={{fontWeight:800,fontSize:"0.85rem",color:"#c2410c"}}>期限が近いタスク</span>
            <span style={{marginLeft:"auto",fontSize:"0.72rem",background:"#c2410c",color:"white",borderRadius:999,padding:"0.1rem 0.45rem",fontWeight:700}}>{urgentTasks.length}</span>
          </div>
          {urgentTasks.map(t=>{
            const d=new Date(t.dueDate); d.setHours(0,0,0,0);
            const diff=Math.round((d-today)/(1000*60*60*24));
            const label=diff<0?`${-diff}日超過`:diff===0?"今日":diff===1?"明日":`${diff}日後`;
            const col=diff<0?"#dc2626":diff===0?"#ea580c":"#d97706";
            const pj=t.projectId?allProjects.find(p=>p.id===t.projectId):null;
            return (
              <div key={t.id} onClick={()=>{setActiveTaskId(t.id);setFromProject(t.projectId||null);setScreen("taskDetail");setTaskTab("info");}}
                style={{display:"flex",alignItems:"center",padding:"0.55rem 1rem",borderTop:"1px solid #fed7aa",cursor:"pointer",gap:"0.5rem",background:"white"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"0.85rem",fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  {pj&&<div style={{fontSize:"0.65rem",color:C.textMuted}}>🗂 {pj.name}</div>}
                </div>
                <span style={{fontSize:"0.72rem",fontWeight:800,color:col,background:diff<0?"#fee2e2":diff===0?"#fff7ed":"#fef3c7",borderRadius:999,padding:"0.15rem 0.5rem",flexShrink:0,border:`1px solid ${col}33`}}>{label}</span>
                <span style={{color:C.textMuted,fontSize:"0.75rem"}}>›</span>
              </div>
            );
          })}
        </div>
      )}
      <StatusCountBar tasks={standaloneTasks}/>
      <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.75rem",flexWrap:"wrap"}}>
        <button onClick={()=>setShowMineOnly(p=>!p)}
          style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"1.5px solid "+(showMineOnly?"#2563eb":"#e2e8f0"),background:showMineOnly?"#dbeafe":"white",color:showMineOnly?"#1d4ed8":"#64748b",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>
          👤 自分のみ{showMineOnly?" ✓":""}
        </button>
      </div>
      <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem"}}>
        <Btn size="sm" onClick={()=>setSheet("addTask")}>＋ タスク</Btn>
        <Btn size="sm" variant="secondary" onClick={()=>setSheet("addProject")}>＋ プロジェクト</Btn>
      </div>
      <Card style={{overflow:"hidden",marginBottom:"1.5rem"}}>
        {visibleProjects.length===0&&activeStandalone.length===0&&doneStandalone.length===0&&(
          <div style={{padding:"3rem 1rem",textAlign:"center",color:C.textMuted}}>
            <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>📋</div>
            <div style={{fontSize:"0.9rem",fontWeight:600,marginBottom:"0.4rem"}}>まだタスクがありません</div>
            <div style={{fontSize:"0.8rem"}}>「＋ タスク」または「🗂 プロジェクト」から追加</div>
          </div>
        )}
        {visibleProjects.map(pj=>(
          <ProjectRow key={pj.id} project={pj}
            tasks={visibleTasks.filter(t=>t.projectId===pj.id)}
            onClick={()=>{setActivePjId(pj.id);setScreen("projectDetail");}}/>
        ))}
        {visibleProjects.length>0&&standaloneTasks.length>0&&(
          <div style={{padding:"0.4rem 1rem",background:C.bg,borderBottom:`1px solid ${C.borderLight}`}}>
            <span style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em"}}>タスク</span>
          </div>
        )}
        {STATUS_OPTIONS.map(status=>{
          const group=standaloneTasks.filter(t=>t.status===status);
          if(!group.length) return null;
          const m=STATUS_META[status];
          const isDone = status==="完了";
          return (
            <React.Fragment key={status}>
              <div onClick={isDone?()=>setDoneOpenList(v=>!v):undefined}
                style={{padding:"0.35rem 1rem",background:m.bg,borderTop:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",gap:"0.4rem",cursor:isDone?"pointer":undefined}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:m.dot,display:"inline-block",flexShrink:0}}/>
                <span style={{fontSize:"0.7rem",fontWeight:700,color:m.color,letterSpacing:"0.04em"}}>{status}</span>
                <span style={{fontSize:"0.7rem",color:m.color,opacity:0.7,marginLeft:"auto"}}>{group.length}件</span>
                {isDone&&<span style={{fontSize:"0.7rem",color:m.color,marginLeft:"0.25rem"}}>{doneOpenList?"▲":"▼"}</span>}
              </div>
              {(!isDone||doneOpenList)&&group.map(t=>(
                <TaskRow key={t.id} task={t} users={users}
                  onToggle={()=>updateTask(t.id,{status:t.status==="完了"?"未着手":"完了"})}
                  onStatusChange={s=>updateTask(t.id,{status:s})}
                  onClick={()=>{setActiveTaskId(t.id);setFromProject(null);setScreen("taskDetail");}}/>
              ))}
            </React.Fragment>
          );
        })}
      </Card>
      {sheet==="addTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
        <TaskForm initial={{status:"未着手"}} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
          onSave={f=>{addTask(f,null);}}/>
      </Sheet>}
      {sheet==="addProject"&&<Sheet title="プロジェクトを追加" onClose={()=>setSheet(null)}>
        <ProjectForm users={users} currentUserId={uid} onClose={()=>setSheet(null)}
          onSave={f=>{addProject(f);}}/>
      </Sheet>}
      {taskDupModal&&<DupModal
        existing={taskDupModal.existing}
        incoming={taskDupModal.incoming}
        onKeepBoth={taskDupModal.onKeepBoth}
        onUseExisting={null}
        onCancel={taskDupModal.onCancel}
      />}
    </div>
  );
}

// ─── SCHEDULE VIEW ────────────────────────────────────────────────────────────
function ScheduleView() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:"4rem",gap:"1.5rem"}}>
      <div style={{fontSize:"3.5rem"}}>📅</div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"1.1rem",fontWeight:800,color:C.text,marginBottom:"0.5rem"}}>スケジュール管理</div>
        <div style={{fontSize:"0.85rem",color:C.textSub}}>TeamOn でスケジュールを管理しています</div>
      </div>
      <a href="https://teamoncloud.com" target="_blank" rel="noopener noreferrer"
        style={{display:"flex",alignItems:"center",gap:"0.875rem",padding:"1.25rem 2rem",background:`linear-gradient(135deg,${C.blue},#1d4ed8)`,borderRadius:"1rem",textDecoration:"none",boxShadow:"0 4px 20px rgba(37,99,235,0.35)"}}>
        <span style={{fontSize:"1.75rem"}}>📆</span>
        <div>
          <div style={{color:"white",fontWeight:800,fontSize:"1rem"}}>TeamOn を開く</div>
          <div style={{color:"rgba(255,255,255,0.75)",fontSize:"0.78rem"}}>teamoncloud.com</div>
        </div>
      </a>
    </div>
  );
}

// ─── EMAIL VIEW ───────────────────────────────────────────────────────────────
function EmailView({data,setData,currentUser=null}) {
  const uid = currentUser?.id;

  // "reply" = 受信メールへの返信, "compose" = 新規メール作成
  const [mode,setMode]           = useState("reply");
  const [inputText,setInputText] = useState(""); // 受信メール(reply) or 目的・内容(compose)
  const [instruction,setInstruction] = useState("");
  const [generated,setGenerated] = useState("");
  const [loading,setLoading]     = useState(false);
  const [phase,setPhase]         = useState("input"); // "input" | "edit"
  const [copyState,setCopyState] = useState("idle");
  const [styleSheet,setStyleSheet]=useState(false);
  const [styleInput,setStyleInput]=useState("");

  // ユーザー自身のスタイルサンプルと保存済メールだけ参照
  const allStyles = data.emailStyles || [];
  const allEmails = data.emails      || [];
  const myStyles  = allStyles.filter(s=>!s.userId||s.userId===uid);
  const myEmails  = allEmails.filter(e=>!e.userId||e.userId===uid);

  const copyText = (text) => {
    const ok=()=>{setCopyState("ok");setTimeout(()=>setCopyState("idle"),2500);};
    const fail=()=>{setCopyState("fail");setTimeout(()=>setCopyState("idle"),2500);};
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(ok).catch(()=>fallback(text)); }
    else fallback(text);
    function fallback(t){ const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");ok();}catch{fail();}document.body.removeChild(ta); }
  };

  const generate = async () => {
    if (!inputText.trim()||!instruction.trim()) return;
    setLoading(true);
    try {
      const styleRef = myStyles.length>0
        ? "【私の文体サンプル（この語調・トーンで書いてください）】\n"+myStyles.map(s=>s.text).join("\n---\n")+"\n\n" : "";
      const pastRef = myEmails.length>0
        ? "【過去に私が書いたメール参考】\n"+myEmails.slice(-2).map(e=>e.generated.slice(0,300)).join("\n---\n")+"\n\n" : "";

      const prompt = mode==="reply"
        ? `${styleRef}${pastRef}以下の受信メールへの返信文を作成してください。\n\n【返信の指示・方向性】\n${instruction}\n\n【受信メール】\n${inputText}\n\n返信本文のみ出力してください。宛名・署名・件名は不要です。`
        : `${styleRef}${pastRef}以下の目的・内容でメール文書を作成してください。\n\n【メールの指示・方向性】\n${instruction}\n\n【目的・内容・補足】\n${inputText}\n\nメール本文のみ出力してください。宛名・署名は含めてください。件名は不要です。`;

      const res = await fetch("/api/generate-email",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt})
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error||"生成に失敗しました");
      setGenerated((json.text||"生成に失敗しました。").trim());
      setPhase("edit");
    } catch(e) {
      const msg = e.message || "不明なエラー";
      let hint = "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) hint = "\n\n※ネットワークエラーです。接続を確認してください。";
      else if (msg.includes("404")) hint = "\n\n※api/generate-email.js がVercelに未デプロイです。GitHubにファイルを追加してください。";
      else if (msg.includes("500")) hint = "\n\n※サーバーエラーです。VercelにANTHROPIC_API_KEYが設定されているか確認してください。";
      setGenerated("⚠️ 生成に失敗しました。\n\n原因: " + msg + hint);
      setPhase("edit");
    }
    setLoading(false);
  };

  const save = () => {
    const rec={id:Date.now(),mode,inputText,instruction,generated,userId:uid,savedAt:new Date().toISOString()};
    const u={...data,emails:[...allEmails,rec]};
    setData(u); saveData(u);
    alert("保存しました！\n※送信はメールアプリで行ってください。");
  };

  const saveStyle = () => {
    if (!styleInput.trim()) return;
    const item={id:Date.now(),text:styleInput.trim(),userId:uid,savedAt:new Date().toISOString()};
    const u={...data,emailStyles:[...allStyles,item]};
    setData(u); saveData(u); setStyleInput(""); setStyleSheet(false);
  };

  return (
    <div>
      {/* Mode selector */}
      <div style={{display:"flex",background:C.bg,borderRadius:"0.875rem",padding:"0.25rem",marginBottom:"1.25rem",border:`1px solid ${C.border}`}}>
        {[["reply","↩️ 返信文を作成"],["compose","✉️ メール文書を作成"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>{setMode(id);setPhase("input");setGenerated("");}}
            style={{flex:1,padding:"0.625rem 0.5rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:700,fontSize:"0.82rem",
              background:mode===id?C.accent:"transparent",
              color:mode===id?"white":C.textSub,
              boxShadow:mode===id?`0 2px 8px ${C.accent}44`:"none",transition:"all 0.2s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Phase indicator */}
      <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"1.5rem"}}>
        {[["input","① 内容入力"],["edit","② 確認・コピー"]].map(([id,lbl],i)=>(
          <div key={id} style={{display:"flex",alignItems:"center",gap:"0.5rem",flex:1}}>
            <div style={{flex:1,padding:"0.4rem 0.75rem",borderRadius:999,textAlign:"center",
              background:phase===id?C.accent:C.bg,color:phase===id?"white":C.textMuted,
              fontSize:"0.72rem",fontWeight:700,border:`1.5px solid ${phase===id?C.accent:C.border}`}}>{lbl}</div>
            {i===0&&<span style={{color:C.border}}>›</span>}
          </div>
        ))}
      </div>

      {/* ── INPUT PHASE ── */}
      {phase==="input"&&(
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"1rem"}}>
            <button onClick={()=>setStyleSheet(true)}
              style={{padding:"0.35rem 0.875rem",background:myStyles.length>0?C.accentBg:C.bg,border:`1.5px solid ${myStyles.length>0?C.accent:C.border}`,borderRadius:999,cursor:"pointer",fontSize:"0.75rem",fontWeight:700,color:myStyles.length>0?C.accentDark:C.textSub}}>
              ✍️ 文体サンプル {myStyles.length>0?`(${myStyles.length}件)`:"未登録"}
            </button>
          </div>

          <FieldLbl label={mode==="reply"?"受信メールを貼り付け *":"目的・補足情報 *"}>
            <Textarea value={inputText} onChange={e=>setInputText(e.target.value)}
              placeholder={mode==="reply"
                ?"返信したいメールの本文をここに貼り付けてください..."
                :"例：A社の田中部長への初回アポイント依頼。来月の新製品説明会の案内として送りたい。先方とは先月の展示会で名刺交換済み。"}
              style={{height:160}}/>
          </FieldLbl>

          <FieldLbl label={mode==="reply"?"返信の指示・方向性 *":"メールの指示・方向性 *"}>
            <Textarea value={instruction} onChange={e=>setInstruction(e.target.value)}
              placeholder={mode==="reply"
                ?"例：丁重にお断りする / 前向きに検討する旨を伝えて来週返答する"
                :"例：丁寧かつ簡潔に。押しつけがましくなく、相手の都合を優先する姿勢で。"}
              style={{height:100}}/>
            {!instruction.trim()&&inputText.trim()&&(
              <div style={{fontSize:"0.72rem",color:"#dc2626",marginTop:"0.35rem",fontWeight:600}}>⚠️ 指示は必須です</div>
            )}
          </FieldLbl>

          <Btn onClick={generate} size="lg" style={{width:"100%"}} disabled={loading||!inputText.trim()||!instruction.trim()}>
            {loading?"🤖 生成中...":mode==="reply"?"🤖 返信文を生成":"🤖 メール文を生成"}
          </Btn>

          {/* Past emails */}
          {myEmails.length>0&&(
            <div style={{marginTop:"1.75rem"}}>
              <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.75rem"}}>
                保存済みメール — タップで再利用
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                {myEmails.slice(-5).reverse().map(e=>(
                  <Card key={e.id} style={{padding:"0.875rem 1rem",cursor:"pointer"}}
                    onClick={()=>{setGenerated(e.generated);setPhase("edit");}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.3rem"}}>
                      <span style={{fontSize:"0.68rem",fontWeight:700,padding:"0.1rem 0.45rem",borderRadius:999,background:e.mode==="reply"?C.accentBg:C.blueBg,color:e.mode==="reply"?C.accentDark:C.blue}}>
                        {e.mode==="reply"?"返信":"新規"}
                      </span>
                      <span style={{fontSize:"0.68rem",color:C.textMuted}}>{new Date(e.savedAt).toLocaleDateString("ja-JP")}</span>
                    </div>
                    <div style={{fontSize:"0.83rem",color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.generated.slice(0,70)}...</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EDIT PHASE ── */}
      {phase==="edit"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
            <span style={{fontSize:"0.8rem",fontWeight:700,color:C.textSub}}>生成されたメール文</span>
            <button onClick={()=>setPhase("input")} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.82rem",cursor:"pointer"}}>‹ 入力に戻る</button>
          </div>
          <div style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.625rem",padding:"0.625rem 0.875rem",marginBottom:"1rem",fontSize:"0.8rem",color:C.accentDark}}>
            📋 指示：{instruction}
          </div>
          <Textarea value={generated} onChange={e=>setGenerated(e.target.value)} style={{height:320,marginBottom:"1rem"}}/>
          <div style={{display:"flex",gap:"0.75rem"}}>
            <Btn variant="secondary" style={{flex:1}} onClick={save}>💾 保存</Btn>
            <Btn style={{flex:2}} size="lg"
              onClick={()=>copyText(generated)}
              variant={copyState==="ok"?"secondary":copyState==="fail"?"danger":"primary"}
              style={{flex:2,background:copyState==="ok"?"#10b981":copyState==="fail"?"#dc2626":C.accent,color:"white"}}>
              {copyState==="ok"?"✓ コピー完了！":copyState==="fail"?"✗ 失敗":"📋 コピー"}
            </Btn>
          </div>
          <div style={{marginTop:"0.75rem",padding:"0.75rem",background:C.bg,borderRadius:"0.75rem",fontSize:"0.78rem",color:C.textSub}}>
            💡 「コピー」してメールアプリに貼り付けてください。「保存」すると次回の文体学習に活用されます。
          </div>
        </div>
      )}

      {/* Style sample sheet */}
      {styleSheet&&(
        <Sheet title="文体サンプルを登録" onClose={()=>setStyleSheet(false)}>
          <div style={{background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:"0.75rem",padding:"0.875rem",marginBottom:"1rem",fontSize:"0.82rem",color:C.accentDark}}>
            💡 実際に送ったメールや自分らしい文章をそのまま貼り付けてください。AIがあなたの文体・語調を学習します。
          </div>
          <FieldLbl label="サンプル文章">
            <Textarea value={styleInput} onChange={e=>setStyleInput(e.target.value)} style={{height:180}} autoFocus placeholder="実際に送ったメール文章をそのまま貼り付け..."/>
          </FieldLbl>
          {myStyles.length>0&&(
            <div style={{marginBottom:"1rem"}}>
              <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.5rem"}}>登録済みサンプル</div>
              {myStyles.map(s=>(
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"0.625rem 0.875rem",background:C.bg,borderRadius:"0.625rem",marginBottom:"0.35rem"}}>
                  <div style={{fontSize:"0.78rem",color:C.textSub,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.text.slice(0,60)}...</div>
                  <button onClick={()=>{const u={...data,emailStyles:allStyles.filter(x=>x.id!==s.id)};setData(u);saveData(u);}} style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"0.8rem",flexShrink:0,marginLeft:"0.5rem"}}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:"0.75rem"}}>
            <Btn variant="secondary" style={{flex:1}} onClick={()=>setStyleSheet(false)}>キャンセル</Btn>
            <Btn style={{flex:2}} size="lg" onClick={saveStyle} disabled={!styleInput.trim()}>登録する</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ─── MUNICIPALITY SEED DATA ───────────────────────────────────────────────────

// ─── JAPAN REGIONS ────────────────────────────────────────────────────────────
const JAPAN_REGIONS = [
  { region:"北海道",     prefs:["北海道"] },
  { region:"東北",       prefs:["青森県","岩手県","宮城県","秋田県","山形県","福島県"] },
  { region:"関東",       prefs:["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"] },
  { region:"中部",       prefs:["新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県"] },
  { region:"近畿",       prefs:["三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"] },
  { region:"中国",       prefs:["鳥取県","島根県","岡山県","広島県","山口県"] },
  { region:"四国",       prefs:["徳島県","香川県","愛媛県","高知県"] },
  { region:"九州・沖縄", prefs:["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"] },
];
const JAPAN_PREFS_SEED = JAPAN_REGIONS.flatMap(r=>r.prefs.map(name=>({name,region:r.region})));


// ─── MAP TAB ──────────────────────────────────────────────────────────────────
function MapTab({prefs,munis,vendors,companies,prefCoords,onSelectPref}) {
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const [view, setView] = useState("dustalk"); // dustalk | treaty | vendor | company
  const [loaded, setLoaded] = useState(false);
  const [tooltip, setTooltip] = useState(null); // {name, stats, x, y}

  // Load Leaflet CSS + JS
  useEffect(()=>{
    if(document.getElementById("leaflet-css")) { setLoaded(true); return; }
    const css=document.createElement("link");
    css.rel="stylesheet"; css.id="leaflet-css";
    css.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js=document.createElement("script");
    js.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload=()=>setLoaded(true);
    document.head.appendChild(js);
  },[]);

  // Build / refresh map
  useEffect(()=>{
    if(!loaded||!mapRef.current) return;
    const L=window.L;
    if(!L) return;

    // init map once
    if(!leafletRef.current){
      leafletRef.current=L.map(mapRef.current,{
        center:[36.5,137.0], zoom:5,
        zoomControl:true, scrollWheelZoom:true,
        attributionControl:false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{
        maxZoom:18
      }).addTo(leafletRef.current);
    }
    const map=leafletRef.current;

    // clear old markers
    markersRef.current.forEach(m=>map.removeLayer(m));
    markersRef.current=[];

    // color helpers
    const dustalkCol=(p)=>{
      const pm=munis.filter(m=>m.prefectureId===p.id);
      if(!pm.length) return {bg:"#e5e7eb",border:"#d1d5db",text:"#9ca3af"};
      const n=pm.filter(m=>m.dustalk==="展開").length;
      const pct=n/pm.length;
      if(pct===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#6b7280"};
      if(pct<0.3) return {bg:"#dbeafe",border:"#93c5fd",text:"#1d4ed8"};
      if(pct<0.7) return {bg:"#bfdbfe",border:"#3b82f6",text:"#1d4ed8"};
      return {bg:"#d1fae5",border:"#34d399",text:"#065f46"};
    };
    const treatyCol=(p)=>{
      const pm=munis.filter(m=>m.prefectureId===p.id);
      if(!pm.length) return {bg:"#f3f4f6",border:"#d1d5db",text:"#9ca3af"};
      const n=pm.filter(m=>m.treatyStatus==="協定済").length;
      const pct=n/pm.length;
      if(pct===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#6b7280"};
      if(pct<0.1) return {bg:"#ede9fe",border:"#a78bfa",text:"#5b21b6"};
      if(pct<0.3) return {bg:"#ddd6fe",border:"#7c3aed",text:"#4c1d95"};
      return {bg:"#c4b5fd",border:"#6d28d9",text:"#3b0764"};
    };
    const vendorCol=(p)=>{
      const pm=munis.filter(m=>m.prefectureId===p.id);
      const vendCount=pm.reduce((s,m)=>{
        return s+vendors.filter(v=>(v.municipalityIds||[]).includes(m.id)).length;
      },0);
      if(vendCount===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#9ca3af"};
      if(vendCount<3)   return {bg:"#fef3c7",border:"#fcd34d",text:"#92400e"};
      if(vendCount<8)   return {bg:"#fed7aa",border:"#fb923c",text:"#7c2d12"};
      return {bg:"#fca5a5",border:"#f87171",text:"#7f1d1d"};
    };

    prefs.forEach(p=>{
      const coords=prefCoords[p.name];
      if(!coords) return;
      const [lat,lng]=coords;

      const pm=munis.filter(m=>m.prefectureId===p.id);
      const deployed=pm.filter(m=>m.dustalk==="展開").length;
      const treaty=pm.filter(m=>m.treatyStatus==="協定済").length;
      const vendCount=pm.reduce((s,m)=>s+vendors.filter(v=>(v.municipalityIds||[]).includes(m.id)).length,0);
      const compCount=companies.filter(c=>(c.assigneeIds||[]).length>0).length; // placeholder

      let col;
      if(view==="dustalk") col=dustalkCol(p);
      else if(view==="treaty") col=treatyCol(p);
      else if(view==="vendor") col=vendorCol(p);
      else col={bg:"#dbeafe",border:"#3b82f6",text:"#1d4ed8"};

      const size = pm.length===0?28 : Math.max(28, Math.min(52, 28+pm.length/8));

      const icon=L.divIcon({
        className:"",
        iconSize:[size,size],
        iconAnchor:[size/2,size/2],
        html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${col.bg};border:2.5px solid ${col.border};display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:transform 0.15s;font-family:-apple-system,sans-serif">
          <div style="font-size:${size>36?'0.72':'0.6'}rem;font-weight:800;color:${col.text};line-height:1">${
            view==="dustalk"?deployed:view==="treaty"?treaty:view==="vendor"?vendCount:pm.length
          }</div>
          <div style="font-size:0.48rem;color:${col.text};font-weight:600;opacity:0.8;line-height:1;margin-top:1px;max-width:${size-6}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">${p.name.replace(/[都道府県]/,"")}</div>
        </div>`,
      });

      const marker=L.marker([lat,lng],{icon}).addTo(map);
      marker.on("click",()=>{ if(onSelectPref) onSelectPref(p.id); });
      marker.on("mouseover",(e)=>{
        const el=e.originalEvent?.target;
        const rect=mapRef.current?.getBoundingClientRect();
        const relX=e.containerPoint?.x; const relY=e.containerPoint?.y;
        setTooltip({
          name:p.name, total:pm.length, deployed, treaty, vendCount,
          x:relX||0, y:relY||0,
        });
      });
      marker.on("mouseout",()=>setTooltip(null));
      markersRef.current.push(marker);
    });
  },[loaded,view,prefs,munis,vendors,prefCoords]);

  // cleanup on unmount
  useEffect(()=>()=>{
    if(leafletRef.current){leafletRef.current.remove();leafletRef.current=null;}
  },[]);

  const VIEW_OPTS=[
    ["dustalk","✅ ダストーク展開","展開数","#059669"],
    ["treaty","🤝 連携協定","協定済","#7c3aed"],
    ["vendor","🔧 業者数","登録数","#d97706"],
  ];

  const totalMunis=munis.length;
  const totalDeployed=munis.filter(m=>m.dustalk==="展開").length;
  const totalTreaty=munis.filter(m=>m.treatyStatus==="協定済").length;
  const totalVend=vendors.length;

  return (
    <div>
      {/* View selector */}
      <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.75rem",flexWrap:"wrap"}}>
        {VIEW_OPTS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setView(id)}
            style={{padding:"0.4rem 0.75rem",borderRadius:999,border:`1.5px solid ${view===id?"#2563eb":C.border}`,background:view===id?"#eff6ff":"white",color:view===id?"#1d4ed8":C.textSub,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.625rem"}}>
        {[["✅","展開",`${totalDeployed}/${totalMunis}`,"#059669","#d1fae5"],["🤝","協定済",`${totalTreaty}/${totalMunis}`,"#7c3aed","#ede9fe"],["🔧","業者",totalVend,"#d97706","#fef3c7"]].map(([icon,lbl,val,col,bg])=>(
          <div key={lbl} style={{flex:1,background:bg,borderRadius:"0.625rem",padding:"0.4rem 0.5rem",textAlign:"center"}}>
            <div style={{fontSize:"0.6rem",color:col,fontWeight:600}}>{icon} {lbl}</div>
            <div style={{fontSize:"0.88rem",fontWeight:800,color:col}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Map container */}
      <div style={{position:"relative",borderRadius:"1rem",overflow:"hidden",border:`1.5px solid ${C.border}`,boxShadow:C.shadowMd}}>
        {!loaded&&(
          <div style={{height:480,display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,flexDirection:"column",gap:"0.75rem"}}>
            <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
            <div style={{fontSize:"0.82rem",color:C.textMuted}}>地図を読み込み中...</div>
          </div>
        )}
        <div ref={mapRef} style={{height:480,display:loaded?"block":"none"}}/>
        {/* Tooltip */}
        {tooltip&&(
          <div style={{position:"absolute",left:Math.min(tooltip.x+12, 260),top:Math.max(tooltip.y-80,8),zIndex:500,background:"white",borderRadius:"0.75rem",boxShadow:"0 4px 20px rgba(0,0,0,0.18)",border:`1px solid ${C.border}`,padding:"0.625rem 0.875rem",pointerEvents:"none",minWidth:150}}>
            <div style={{fontWeight:800,fontSize:"0.88rem",color:C.text,marginBottom:"0.35rem"}}>{tooltip.name}</div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:"1rem"}}>
                <span style={{fontSize:"0.72rem",color:C.textMuted}}>自治体数</span>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.text}}>{tooltip.total}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:"1rem"}}>
                <span style={{fontSize:"0.72rem",color:"#059669"}}>✅ 展開</span>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:"#059669"}}>{tooltip.deployed} / {tooltip.total}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:"1rem"}}>
                <span style={{fontSize:"0.72rem",color:"#7c3aed"}}>🤝 協定済</span>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:"#7c3aed"}}>{tooltip.treaty} / {tooltip.total}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",gap:"1rem"}}>
                <span style={{fontSize:"0.72rem",color:"#d97706"}}>🔧 業者</span>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:"#d97706"}}>{tooltip.vendCount}</span>
              </div>
            </div>
            <div style={{marginTop:"0.4rem",fontSize:"0.65rem",color:C.textMuted}}>クリックで自治体一覧へ</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{marginTop:"0.625rem",padding:"0.625rem 0.875rem",background:"white",borderRadius:"0.75rem",border:`1px solid ${C.border}`}}>
        {view==="dustalk"&&(
          <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"0.65rem",fontWeight:700,color:C.textMuted}}>展開率</span>
            {[["0%",{bg:"#f3f4f6",border:"#d1d5db"}],["1〜29%",{bg:"#dbeafe",border:"#93c5fd"}],["30〜69%",{bg:"#bfdbfe",border:"#3b82f6"}],["70%〜",{bg:"#d1fae5",border:"#34d399"}]].map(([lbl,c])=>(
              <span key={lbl} style={{display:"flex",alignItems:"center",gap:"0.25rem"}}>
                <span style={{width:12,height:12,borderRadius:"50%",background:c.bg,border:`2px solid ${c.border}`,display:"inline-block"}}/>
                <span style={{fontSize:"0.65rem",color:C.textSub}}>{lbl}</span>
              </span>
            ))}
          </div>
        )}
        {view==="treaty"&&(
          <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"0.65rem",fontWeight:700,color:C.textMuted}}>協定率</span>
            {[["0%",{bg:"#f3f4f6",border:"#d1d5db"}],["〜9%",{bg:"#ede9fe",border:"#a78bfa"}],["10〜29%",{bg:"#ddd6fe",border:"#7c3aed"}],["30%〜",{bg:"#c4b5fd",border:"#6d28d9"}]].map(([lbl,c])=>(
              <span key={lbl} style={{display:"flex",alignItems:"center",gap:"0.25rem"}}>
                <span style={{width:12,height:12,borderRadius:"50%",background:c.bg,border:`2px solid ${c.border}`,display:"inline-block"}}/>
                <span style={{fontSize:"0.65rem",color:C.textSub}}>{lbl}</span>
              </span>
            ))}
          </div>
        )}
        {view==="vendor"&&(
          <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:"0.65rem",fontWeight:700,color:C.textMuted}}>業者数</span>
            {[["0",{bg:"#f3f4f6",border:"#d1d5db"}],["1〜2",{bg:"#fef3c7",border:"#fcd34d"}],["3〜7",{bg:"#fed7aa",border:"#fb923c"}],["8〜",{bg:"#fca5a5",border:"#f87171"}]].map(([lbl,c])=>(
              <span key={lbl} style={{display:"flex",alignItems:"center",gap:"0.25rem"}}>
                <span style={{width:12,height:12,borderRadius:"50%",background:c.bg,border:`2px solid ${c.border}`,display:"inline-block"}}/>
                <span style={{fontSize:"0.65rem",color:C.textSub}}>{lbl}</span>
              </span>
            ))}
          </div>
        )}
        <div style={{marginTop:"0.35rem",fontSize:"0.62rem",color:C.textMuted}}>◉ 円の大きさ = 自治体数　クリックで自治体タブへ移動</div>
      </div>
    </div>
  );
}

// ─── SALES TASK PANEL (top-level component to satisfy React hooks rules) ────────
function SalesTaskPanel({ entityType, entityId, entityName, data, onSave, currentUser, users=[], onNavigateToTask, onNavigateToProject }) {
  const uid = currentUser?.id;
  const allTasks    = data.tasks    || [];
  const allProjects = data.projects || [];
  const linked    = allTasks.filter(t=>t.salesRef?.id===entityId);
  const linkedPjs = allProjects.filter(p=>p.salesRef?.id===entityId);
  const [addMode,setAddMode] = useState(null);
  const [tf,setTf] = useState({title:entityName,dueDate:"",notes:"",assignees:uid?[uid]:[]});
  const [pf,setPf] = useState({name:entityName,notes:"",members:uid?[uid]:[]});
  const STATUS_META_MINI={
    "未着手":{color:"#6b7280",bg:"#f3f4f6"},
    "進行中":{color:"#2563eb",bg:"#dbeafe"},
    "先方待ち":{color:"#1d4ed8",bg:"#fef3c7"},
    "完了":{color:"#059669",bg:"#d1fae5"},
    "保留":{color:"#9333ea",bg:"#f3e8ff"},
  };

  const doAddTask = () => {
    if(!tf.title.trim()) return;
    const task = {
      id: Date.now()+Math.random(), title: tf.title, status:"未着手",
      dueDate: tf.dueDate||"", notes: tf.notes||"",
      assignees: tf.assignees, isPrivate:false, projectId:null,
      createdBy: uid, salesRef:{type:entityType,id:entityId,name:entityName},
      comments:[], memos:[], chat:[], createdAt:new Date().toISOString(),
    };
    onSave({...data, tasks:[...allTasks, task]});
    setAddMode(null);
    setTf({title:entityName,dueDate:"",notes:"",assignees:uid?[uid]:[]});
  };

  const doAddProject = () => {
    if(!pf.name.trim()) return;
    const pj = {
      id: Date.now()+Math.random(), name: pf.name, notes: pf.notes||"",
      members: pf.members, isPrivate:false, createdBy:uid,
      salesRef:{type:entityType,id:entityId,name:entityName},
      memos:[], chat:[], createdAt:new Date().toISOString(),
    };
    onSave({...data, projects:[...(data.projects||[]), pj]});
    setAddMode(null);
    setPf({name:entityName,notes:"",members:uid?[uid]:[]});
  };

  return (
    <div>
      {/* プロジェクト一覧 */}
      {linkedPjs.length>0&&(
        <div style={{marginBottom:"0.875rem"}}>
          <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>🗂 プロジェクト</div>
          {linkedPjs.map(pj=>{
            const pjTasks=allTasks.filter(t=>t.projectId===pj.id);
            const done=pjTasks.filter(t=>t.status==="完了").length;
            return (
              <div key={pj.id} onClick={()=>onNavigateToProject?.(pj.id)}
                style={{background:C.bg,borderRadius:"0.75rem",padding:"0.625rem 0.875rem",marginBottom:"0.4rem",border:`1px solid ${C.border}`,cursor:onNavigateToProject?"pointer":"default"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.2rem"}}>
                  <div style={{fontWeight:700,fontSize:"0.85rem",color:C.text}}>{pj.name}</div>
                  {onNavigateToProject&&<span style={{fontSize:"0.68rem",color:C.textMuted}}>›</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                  <div style={{flex:1,height:4,background:C.borderLight,borderRadius:999,overflow:"hidden"}}>
                    <div style={{width:pjTasks.length?`${(done/pjTasks.length)*100}%`:"0%",height:"100%",background:"#059669",borderRadius:999,transition:"width 0.3s"}}/>
                  </div>
                  <span style={{fontSize:"0.68rem",color:C.textMuted}}>{done}/{pjTasks.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* タスク一覧 */}
      {linked.length>0&&(
        <div style={{marginBottom:"0.875rem"}}>
          <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>✅ タスク</div>
          {linked.map(t=>{
            const m=STATUS_META_MINI[t.status]||STATUS_META_MINI["未着手"];
            const today=new Date(); today.setHours(0,0,0,0);
            const due=t.dueDate?new Date(t.dueDate):null;
            const overdue=due&&due<today&&t.status!=="完了";
            return (
              <div key={t.id} onClick={()=>onNavigateToTask?.(t.id)}
                style={{background:"white",borderRadius:"0.75rem",padding:"0.625rem 0.875rem",marginBottom:"0.4rem",border:`1px solid ${overdue?"#fca5a5":C.border}`,display:"flex",alignItems:"center",gap:"0.625rem",cursor:onNavigateToTask?"pointer":"default"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:"0.85rem",color:t.status==="完了"?C.textMuted:C.text,textDecoration:t.status==="完了"?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  {t.dueDate&&<div style={{fontSize:"0.65rem",color:overdue?"#dc2626":C.textMuted,marginTop:"0.1rem"}}>{overdue?"⚠️ ":""}期限：{t.dueDate}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"0.35rem",flexShrink:0}}>
                  <span style={{fontSize:"0.68rem",fontWeight:700,background:m.bg,color:m.color,borderRadius:999,padding:"0.1rem 0.45rem"}}>{t.status}</span>
                  {onNavigateToTask&&<span style={{fontSize:"0.7rem",color:C.textMuted}}>›</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {linked.length===0&&linkedPjs.length===0&&(
        <div style={{textAlign:"center",padding:"1.5rem 0",color:C.textMuted,fontSize:"0.82rem"}}>タスク・プロジェクトはまだありません</div>
      )}
      {/* 追加ボタン */}
      {addMode===null&&(
        <div style={{display:"flex",gap:"0.5rem"}}>
          <Btn size="sm" style={{flex:1}} onClick={()=>{setTf({title:entityName,dueDate:"",notes:"",assignees:uid?[uid]:[]});setAddMode("task");}}>＋ タスク</Btn>
          <Btn size="sm" variant="secondary" style={{flex:1}} onClick={()=>{setPf({name:entityName,notes:"",members:uid?[uid]:[]});setAddMode("project");}}>＋ プロジェクト</Btn>
        </div>
      )}
      {/* タスク追加フォーム */}
      {addMode==="task"&&(
        <div style={{background:C.bg,borderRadius:"0.875rem",padding:"0.875rem",border:`1px solid ${C.border}`}}>
          <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>✅ タスクを追加</div>
          <FieldLbl label="タイトル"><Input value={tf.title} onChange={e=>setTf({...tf,title:e.target.value})} autoFocus/></FieldLbl>
          <FieldLbl label="期限"><Input type="date" value={tf.dueDate} onChange={e=>setTf({...tf,dueDate:e.target.value})}/></FieldLbl>
          <FieldLbl label="担当者">
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
              {users.map(u=>{const on=tf.assignees.includes(u.id);return(
                <button key={u.id} onClick={()=>setTf({...tf,assignees:on?tf.assignees.filter(i=>i!==u.id):[...tf.assignees,u.id]})}
                  style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",border:`1.5px solid ${on?C.accent:C.border}`,background:on?C.accentBg:"white",color:on?C.accentDark:C.textSub}}>
                  {on?"✓ ":""}{u.name}
                </button>
              );})}
            </div>
          </FieldLbl>
          <FieldLbl label="メモ（任意）"><Textarea value={tf.notes} onChange={e=>setTf({...tf,notes:e.target.value})} style={{height:56}}/></FieldLbl>
          <div style={{display:"flex",gap:"0.5rem"}}>
            <Btn variant="secondary" style={{flex:1}} onClick={()=>setAddMode(null)}>キャンセル</Btn>
            <Btn style={{flex:2}} onClick={doAddTask} disabled={!tf.title.trim()}>作成する</Btn>
          </div>
        </div>
      )}
      {/* プロジェクト追加フォーム */}
      {addMode==="project"&&(
        <div style={{background:C.bg,borderRadius:"0.875rem",padding:"0.875rem",border:`1px solid ${C.border}`}}>
          <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>🗂 プロジェクトを追加</div>
          <FieldLbl label="プロジェクト名"><Input value={pf.name} onChange={e=>setPf({...pf,name:e.target.value})} autoFocus/></FieldLbl>
          <FieldLbl label="メンバー">
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
              {users.map(u=>{const on=pf.members.includes(u.id);return(
                <button key={u.id} onClick={()=>setPf({...pf,members:on?pf.members.filter(i=>i!==u.id):[...pf.members,u.id]})}
                  style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",border:`1.5px solid ${on?C.accent:C.border}`,background:on?C.accentBg:"white",color:on?C.accentDark:C.textSub}}>
                  {on?"✓ ":""}{u.name}
                </button>
              );})}
            </div>
          </FieldLbl>
          <FieldLbl label="メモ（任意）"><Textarea value={pf.notes} onChange={e=>setPf({...pf,notes:e.target.value})} style={{height:56}}/></FieldLbl>
          <div style={{display:"flex",gap:"0.5rem"}}>
            <Btn variant="secondary" style={{flex:1}} onClick={()=>setAddMode(null)}>キャンセル</Btn>
            <Btn style={{flex:2}} onClick={doAddProject} disabled={!pf.name.trim()}>作成する</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SALES VIEW ───────────────────────────────────────────────────────────────
function SalesView({ data, setData, currentUser, users=[], salesTab, setSalesTab, onNavigateToTask, onNavigateToProject }) {
  // salesTab managed by App for persistence
  const [muniScreen,   setMuniScreen]   = useState("top"); // top|muniDetail
  const [prevTab,      setPrevTab]      = useState(null);   // for back navigation
  const [activePref,   setActivePref]   = useState(null);
  const [activeMuni,   setActiveMuni]   = useState(null);
  const [muniPickerPref, setMuniPickerPref] = useState(""); // stable state for MuniPicker
  const [activeVendor, setActiveVendor] = useState(null);
  const [activeCompany,setActiveCompany]= useState(null);
  const [sheet,        setSheet]        = useState(null);
  const [showGSheetImport, setShowGSheetImport] = useState(false);
  const [form,         setForm]         = useState({});
  const [bulkText,     setBulkText]     = useState("");
  const [dupQueue,     setDupQueue]     = useState([]);
  const [dupIdx,       setDupIdx]       = useState(0);
  const [bulkDone,     setBulkDone]     = useState(null);
  const [openRegions,  setOpenRegions]  = useState({});
  const [openPrefs,    setOpenPrefs]    = useState({});
  const [compSearch,   setCompSearch]   = useState("");
  const [compFilter,   setCompFilter]   = useState({status:"",assignee:""});
  const [vendSearch,   setVendSearch]   = useState("");
  const [openCompGrp,  setOpenCompGrp]  = useState(new Set(Object.keys(COMPANY_STATUS)));
  const [openVendGrp,  setOpenVendGrp]  = useState(new Set(Object.keys(VENDOR_STATUS)));
  const toggleGrp=(setter,key)=>setter(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const [muniTopSearch,setMuniTopSearch]= useState("");
  const [chatInputs,   setChatInputs]   = useState({});
  const [memoInputs,   setMemoInputs]   = useState({});
  const [activeDetail, setActiveDetail] = useState("memo"); // memo|chat
  // bulk select
  const [bulkMode,     setBulkMode]     = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkStatus,   setBulkStatus]   = useState("");
  const [bulkTarget,   setBulkTarget]   = useState(""); // "company"|"vendor"|"muni"
  // vendor linking from muni
  const [linkVendorSearch,setLinkVendorSearch]=useState("");
  // dashboard period filter (must be top-level, not inside conditional)
  const [dashPeriod,setDashPeriod]=useState("month"); // today|week|month|all
  // CSV import preview/error state (must be top-level, not inside IIFE)
  const [importPreview,setImportPreview]=useState(null);
  const [importErr,setImportErr]=useState("");
  // duplicate detection modal
  const [dupModal,setDupModal]=useState(null); // {existing, incoming, onKeepBoth, onSave}
  // scroll position tracking for back navigation
  const savedScrollPos = useRef({});
  const saveSalesScroll = (key) => {
    const el = document.querySelector('[data-sales-scroll]');
    if(el) savedScrollPos.current[key] = el.scrollTop;
  };
  const restoreSalesScroll = (key) => {
    requestAnimationFrame(()=>{
      const el = document.querySelector('[data-sales-scroll]');
      if(el) el.scrollTop = savedScrollPos.current[key]||0;
    });
  };

  const prefs     = data.prefectures    || [];
  const munis     = data.municipalities || [];
  const vendors   = data.vendors        || [];
  const companies = data.companies      || [];


  // ── Seed 47 prefectures on first load (municipalities are managed externally) ──
  useEffect(()=>{
    let ndPrefs = [...prefs];
    if(prefs.length===0){
      ndPrefs = JAPAN_PREFS_SEED.map((p,i)=>({id:i+10000,name:p.name,region:p.region,createdAt:new Date().toISOString()}));
      const u={...data,prefectures:ndPrefs};setData(u);saveData(u);
    } else if(prefs.some(p=>!p.region)){
      ndPrefs = prefs.map(p=>{if(p.region)return p;const s=JAPAN_PREFS_SEED.find(x=>x.name===p.name);return s?{...p,region:s.region}:p;});
      if(JSON.stringify(ndPrefs)!==JSON.stringify(prefs)){const u={...data,prefectures:ndPrefs};setData(u);saveData(u);}
    }
  },[]);

  const addFileToEntity = (entityKey, entityId, file) => {
    const nd = { ...data, [entityKey]: (data[entityKey]||[]).map(e => e.id===entityId ? {...e, files:[...(e.files||[]),file]} : e) };
    save(nd);
  };
  const removeFileFromEntity = (entityKey, entityId, fileIdOrUrl) => {
    const nd = { ...data, [entityKey]: (data[entityKey]||[]).map(e => e.id===entityId ? {...e, files:(e.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl)} : e) };
    save(nd);
  };

  const save = (d) => {
    window.__myDeskLastSave = Date.now(); // 競合防止タグ
    // 新しく追加された通知を検出してWeb Push送信
    const notifsBefore = data.notifications || [];
    const newNotifs = (d.notifications||[]).filter(n=>!notifsBefore.some(o=>o.id===n.id));
    setData(d); saveData(d);
    // 他ユーザーへWeb Push（バックグラウンド通知）
    if(newNotifs.length) {
      const byUser = {};
      newNotifs.forEach(n=>{ if(n.toUserId && !byUser[n.toUserId]) byUser[n.toUserId]={title:n.title,body:n.body,tag:n.type}; });
      Object.entries(byUser).forEach(([uid,{title,body,tag}])=>{
        const targets = uid==='__all__'
          ? users.filter(u=>u.id!==currentUser?.id).map(u=>u.id)
          : (uid!==currentUser?.id ? [uid] : []);
        if(targets.length) {
          fetch('/api/send-push', {
            method:'POST', headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
            body: JSON.stringify({toUserIds:targets, title, body:body||'', tag:tag||'mydesk'}),
          }).catch(()=>{});
        }
      });
    }
  };

  // ── 営業エンティティからタスク/プロジェクトを生成 ─────────────────────────
  const addTaskFromSales = (entityType, entityId, entityName, extraFields={}) => {
    const uid = currentUser?.id;
    const task = {
      id: Date.now()+Math.random(),
      title: extraFields.title || entityName,
      status: "未着手",
      dueDate: extraFields.dueDate || "",
      notes: extraFields.notes || "",
      assignees: extraFields.assignees || (uid?[uid]:[]),
      isPrivate: false,
      projectId: null,
      createdBy: uid,
      salesRef: { type: entityType, id: entityId, name: entityName },
      comments:[], memos:[], chat:[],
      createdAt: new Date().toISOString(),
    };
    save({...data, tasks:[...(data.tasks||[]), task]});
    return task;
  };

  const addProjectFromSales = (entityType, entityId, entityName, extraFields={}) => {
    const uid = currentUser?.id;
    const pj = {
      id: Date.now()+Math.random(),
      name: extraFields.name || entityName,
      notes: extraFields.notes || "",
      members: extraFields.members || (uid?[uid]:[]),
      isPrivate: false,
      createdBy: uid,
      salesRef: { type: entityType, id: entityId, name: entityName },
      memos:[], chat:[],
      createdAt: new Date().toISOString(),
    };
    save({...data, projects:[...(data.projects||[]), pj]});
    return pj;
  };

  // ── CSV ダウンロード / アップロード ユーティリティ ──────────────────────────
  const downloadCSV = (filename, headers, rows) => {
    const bom = "\uFEFF";
    const escape = v => {
      const s = String(v==null?"":v);
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const csv = [headers, ...rows].map(r=>r.map(escape).join(",")).join("\n");
    const blob = new Blob([bom+csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=filename; a.click();
  };

  const parseCSV = (text) => {
    // BOM除去・改行正規化
    const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
    const lines = clean.split("\n").filter(l => l.trim());
    if (!lines.length) return [];
    const parseRow = line => {
      const cols = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') {
          inQ = true;
        } else if (ch === ',') {
          cols.push(cur.trim()); cur = "";
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      return cols;
    };
    return lines.map(parseRow);
  };;

  // CSV文字コード自動判定（UTF-8/Shift-JIS両対応）
  const readFileAsText = (file) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = rej;
    reader.onload = (e) => {
      const buf = e.target.result;
      const bytes = new Uint8Array(buf);
      // BOM チェック (UTF-8 BOM: EF BB BF)
      if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        res(new TextDecoder("utf-8").decode(buf)); return;
      }
      // Shift-JIS 判定
      let maySjis = false;
      for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
        const b = bytes[i];
        if ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC)) { maySjis = true; break; }
      }
      if (maySjis) {
        try {
          const sjisText = new TextDecoder("shift-jis").decode(buf);
          const badCount = (sjisText.match(/\uFFFD/g) || []).length;
          if (badCount < 10) { res(sjisText); return; }
        } catch(e) {}
      }
      res(new TextDecoder("utf-8").decode(buf));
    };
    reader.readAsArrayBuffer(file);
  });


  const prefOf     = id=>prefs.find(p=>p.id===id);

  // ── Excel seed import ─────────────────────────────────────────────────────
  const muniOf     = id=>munis.find(m=>m.id===id);
  const vendorOf   = id=>vendors.find(v=>v.id===id);
  const companyOf  = id=>companies.find(c=>c.id===id);
  const muniVendors= mid=>vendors.filter(v=>(v.municipalityIds||[]).includes(mid));
  const vendorMunis= v=>(v.municipalityIds||[]).map(muniOf).filter(Boolean);
  const checkDup   = (name,list)=>list.find(x=>x.name?.trim()===name?.trim());
  const uName      = id=>{const u=users.find(u=>u.id===id);return u?u.name:"—";};
  const uInit      = id=>{const u=users.find(u=>u.id===id);return u?u.name.charAt(0):"?";};



  // ── Memo & Chat ───────────────────────────────────────────────────────────
  const addMemo=(entityKey,entityId,text)=>{
    if(!text?.trim()) return;
    const memo={id:Date.now(),userId:currentUser?.id,text,date:new Date().toISOString()};
    const arr=(data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:[...(x.memos||[]),memo]}:x);
    const entity=(data[entityKey]||[]).find(x=>x.id===entityId);
    let nd={...data,[entityKey]:arr};
    // メモ投稿は全員に通知（自分以外）
    const toAll=users.filter(u=>u.id!==currentUser?.id).map(u=>u.id);
    if(toAll.length) nd=addNotif(nd,{type:"memo",title:`「${entity?.name||""}」にメモが追加されました`,body:text.slice(0,60),toUserIds:toAll,fromUserId:currentUser?.id});
    save(nd);
    setMemoInputs(p=>({...p,[entityId]:""}));
  };
  const addChat=(entityKey,entityId,text)=>{
    if(!text?.trim()) return;
    const msg={id:Date.now(),userId:currentUser?.id,text,date:new Date().toISOString()};
    const arr=(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:[...(x.chat||[]),msg]}:x);
    const entity=(data[entityKey]||[]).find(x=>x.id===entityId);
    let nd={...data,[entityKey]:arr};
    // Notify @mentioned users
    const mentioned=users.filter(u=>u.id!==currentUser?.id&&text.includes(`@${u.name}`));
    if(mentioned.length) nd=addNotif(nd,{type:"mention",title:`「${entity?.name||""}」でメンションされました`,body:text.slice(0,60),toUserIds:mentioned.map(u=>u.id),fromUserId:currentUser?.id});
    save(nd);
    setChatInputs(p=>({...p,[entityId]:""}));
  };

  // ── 活動ログ追加ヘルパー ─────────────────────────────────────────────────
  const addChangeLog=(nd,{entityType,entityId,entityName,field,oldVal,newVal,userId})=>{
    const log={id:Date.now()+Math.random(),entityType,entityId,entityName,field,oldVal:oldVal||"",newVal:newVal||"",userId:userId||currentUser?.id,date:new Date().toISOString()};
    return {...nd,changeLogs:[...(nd.changeLogs||[]),log]};
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const saveCompany=(skipDupCheck=false)=>{
    if(!form.name?.trim())return;
    // 新規追加時の重複チェック
    if(!form.id && !skipDupCheck){
      const normName = s => (s||"").replace(/[\s　]/g,"").toLowerCase();
      const dup=companies.find(c=>normName(c.name)===normName(form.name));
      if(dup){setDupModal({existing:dup,incoming:form.name.trim(),
        onKeepBoth:()=>{setDupModal(null);saveCompany(true);},
        onUseExisting:()=>{setActiveCompany(dup.id);setDupModal(null);setSheet(null);}
      });return;}
    }
    let nd={...data};
    if(form.id){
      const old=companies.find(c=>c.id===form.id);
      nd={...nd,companies:companies.map(c=>c.id===form.id?{...c,...form}:c)};
      // 変更ログ
      const fields=[["status","ステータス"],["name","企業名"]];
      fields.forEach(([f,label])=>{
        if(old&&old[f]!==form[f]) nd=addChangeLog(nd,{entityType:"企業",entityId:form.id,entityName:form.name,field:label,oldVal:old[f],newVal:form[f]});
      });
      // 担当者追加通知
      const prevIds=(old?.assigneeIds||[]); const newIds=(form.assigneeIds||[]);
      const added=newIds.filter(id=>!prevIds.includes(id));
      if(added.length) nd=addNotif(nd,{type:"sales_assign",title:`「${form.name}」の担当者に追加されました`,body:"企業",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newComp={id:Date.now(),...form,status:form.status||"未接触",assigneeIds:form.assigneeIds||[],memos:[],chat:[],createdAt:new Date().toISOString()};
      nd={...nd,companies:[...companies,newComp]};
      nd=addChangeLog(nd,{entityType:"企業",entityId:newComp.id,entityName:newComp.name,field:"登録",oldVal:"",newVal:"新規登録"});
    }
    save(nd); setSheet(null);
  };
  const deleteCompany=id=>{save({...data,companies:companies.filter(c=>c.id!==id)});setActiveCompany(null);};
  const saveMuni=(skipDupCheck=false)=>{
    if(!form.name?.trim())return;
    if(!form.id && !skipDupCheck){
      const normName = s => (s||"").replace(/[\s　]/g,"").toLowerCase();
      const dup=munis.find(m=>m.prefectureId===activePref&&normName(m.name)===normName(form.name));
      if(dup){setDupModal({existing:dup,incoming:form.name.trim(),
        onKeepBoth:()=>{setDupModal(null);saveMuni(true);},
        onUseExisting:()=>{setActiveMuni(dup.id);setMuniScreen("detail");setDupModal(null);setSheet(null);}
      });return;}
    }
    let nd={...data};
    if(form.id){
      const old=munis.find(m=>m.id===form.id);
      // dustalk が「展開」に変わった or 手動更新日設定
      const updAt = (form.dustalk==="展開" && old?.dustalk!=="展開")
        ? new Date().toISOString().slice(0,10)
        : (form.updatedAt||old?.updatedAt||"");
      nd={...nd,municipalities:munis.map(m=>m.id===form.id?{...m,...form,updatedAt:updAt}:m)};
      const fields=[["status","アプローチ"],["dustalk","ダストーク"],["treatyStatus","連携協定"],["artBranch","管轄支店"]];
      fields.forEach(([f,label])=>{
        if(old&&old[f]!==form[f]) nd=addChangeLog(nd,{entityType:"自治体",entityId:form.id,entityName:form.name,field:label,oldVal:old[f],newVal:form[f]});
      });
      const prevIds=(old?.assigneeIds||[]); const newIds=(form.assigneeIds||[]);
      const added=newIds.filter(id=>!prevIds.includes(id));
      if(added.length) nd=addNotif(nd,{type:"sales_assign",title:`「${form.name}」の担当者に追加されました`,body:"自治体",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newMuni={id:Date.now(),prefectureId:activePref,...form,dustalk:form.dustalk||"未展開",status:form.status||"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()};
      nd={...nd,municipalities:[...munis,newMuni]};
      nd=addChangeLog(nd,{entityType:"自治体",entityId:newMuni.id,entityName:newMuni.name,field:"登録",oldVal:"",newVal:"新規登録"});
    }
    save(nd); setSheet(null);
  };
  const deleteMuni=id=>{
    save({...data,municipalities:munis.filter(m=>m.id!==id),vendors:vendors.map(v=>({...v,municipalityIds:(v.municipalityIds||[]).filter(mid=>mid!==id)}))});
    setMuniScreen("top");setActiveMuni(null);
  };
  const saveVendor=(skipDupCheck=false)=>{
    if(!form.name?.trim())return;
    if(!form.id && !skipDupCheck){
      const normName = s => (s||"").replace(/[\s　]/g,"").toLowerCase();
      const dup=vendors.find(v=>normName(v.name)===normName(form.name));
      if(dup){setDupModal({existing:dup,incoming:form.name.trim(),
        onKeepBoth:()=>{setDupModal(null);saveVendor(true);},
        onUseExisting:()=>{setActiveVendor(dup.id);setDupModal(null);setSheet(null);}
      });return;}
    }
    let nd={...data};
    if(form.id){
      const old=vendors.find(v=>v.id===form.id);
      nd={...nd,vendors:vendors.map(v=>v.id===form.id?{...v,...form}:v)};
      const fields=[["status","ステータス"]];
      fields.forEach(([f,label])=>{
        if(old&&old[f]!==form[f]) nd=addChangeLog(nd,{entityType:"業者",entityId:form.id,entityName:form.name,field:label,oldVal:old[f],newVal:form[f]});
      });
      const prevIds=(old?.assigneeIds||[]); const newIds=(form.assigneeIds||[]);
      const added=newIds.filter(id=>!prevIds.includes(id));
      if(added.length) nd=addNotif(nd,{type:"sales_assign",title:`「${form.name}」の担当者に追加されました`,body:"業者",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newVend={id:Date.now(),...form,status:form.status||"未接触",municipalityIds:form.municipalityIds||[],assigneeIds:form.assigneeIds||[],memos:[],chat:[],createdAt:new Date().toISOString()};
      nd={...nd,vendors:[...vendors,newVend]};
      nd=addChangeLog(nd,{entityType:"業者",entityId:newVend.id,entityName:newVend.name,field:"登録",oldVal:"",newVal:"新規登録"});
    }
    save(nd); setSheet(null);
  };
  const deleteVendor=id=>{save({...data,vendors:vendors.filter(v=>v.id!==id)});setActiveVendor(null);};
  const runBulk=()=>{
    const lines=bulkText.split("\n").map(l=>l.trim()).filter(Boolean);
    if(!lines.length)return;
    const queue=[],toAdd=[];
    const targetList=munis.filter(m=>m.prefectureId===activePref);
    lines.forEach(name=>{const ex=checkDup(name,targetList);if(ex)queue.push({name,existing:ex});else toAdd.push(name);});
    let nd={...data,municipalities:[...(data.municipalities||[]),...toAdd.map(n=>({id:Date.now()+Math.random(),prefectureId:activePref,name:n,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()}))]};
    save(nd);setBulkDone({added:toAdd.length,dupes:queue.length});
    if(queue.length>0){setDupQueue(queue);setDupIdx(0);}else{setBulkText("");setSheet("bulkDone");}
  };
  const handleDupChoice=choice=>{
    const item=dupQueue[dupIdx];
    if(choice==="edit"){setForm({...item.existing});setSheet("editMuni");setDupQueue([]);return;}
    save({...data,municipalities:[...munis,{id:Date.now(),prefectureId:activePref,name:item.name,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()}]});
    const n=dupIdx+1;
    if(n>=dupQueue.length){setDupQueue([]);setSheet("bulkDone");}else setDupIdx(n);
  };

  // ── Common UI ─────────────────────────────────────────────────────────────
  const resetBulk=()=>{setBulkMode(false);setBulkSelected(new Set());setBulkStatus("");};
  const applyBulkMuni=()=>{
    if(!bulkStatus||bulkSelected.size===0)return;
    const isField=["dustalk","treatyStatus"].includes(bulkTarget)||!bulkTarget;
    const field=bulkTarget||"status";
    save({...data,municipalities:munis.map(m=>bulkSelected.has(m.id)?{...m,[field]:bulkStatus}:m)});
    resetBulk();
  };
  const applyBulkVend=()=>{
    if(!bulkStatus||bulkSelected.size===0)return;
    save({...data,vendors:vendors.map(v=>bulkSelected.has(v.id)?{...v,status:bulkStatus}:v)});
    resetBulk();
  };
  const applyBulkComp=()=>{
    if(!bulkStatus||bulkSelected.size===0)return;
    save({...data,companies:companies.map(c=>bulkSelected.has(c.id)?{...c,status:bulkStatus}:c)});
    resetBulk();
  };
  const BulkBar=({statusMap,applyFn,field,extraFields})=>(
    bulkMode?(
      <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:"0.875rem",padding:"0.75rem",marginBottom:"0.875rem",display:"flex",flexWrap:"wrap",gap:"0.5rem",alignItems:"center"}}>
        <span style={{fontSize:"0.78rem",fontWeight:700,color:"#1d4ed8"}}>{bulkSelected.size}件選択中</span>
        {extraFields&&extraFields.map(([fld,lbl,map])=>(
          <select key={fld} value={bulkTarget===fld?bulkStatus:""} onChange={e=>{setBulkTarget(fld);setBulkStatus(e.target.value);}}
            style={{padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:"1px solid #93c5fd",fontSize:"0.75rem",fontFamily:"inherit",background:"white"}}>
            <option value="">── {lbl} ──</option>
            {Object.keys(map).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        ))}
        {!extraFields&&(
          <select value={bulkStatus} onChange={e=>{setBulkTarget(field||"status");setBulkStatus(e.target.value);}}
            style={{padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:"1px solid #93c5fd",fontSize:"0.75rem",fontFamily:"inherit",background:"white"}}>
            <option value="">── ステータス選択 ──</option>
            {Object.keys(statusMap).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <Btn size="sm" onClick={applyFn} disabled={!bulkStatus||bulkSelected.size===0}>✅ 一括変更</Btn>
        <Btn size="sm" variant="secondary" onClick={resetBulk}>キャンセル</Btn>
      </div>
    ):null
  );
  const TopTabs=()=>(
    <div style={{display:"flex",background:"white",borderRadius:"0.875rem",padding:"0.25rem",marginBottom:"1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,position:"relative"}}>
      {[["dash","📊","概況"],["map","🗺️","地図"],["company","🏢","企業"],["muni","🏛️","自治体"],["vendor","🔧","業者"]].map(([id,icon,lbl])=>(
        <button key={id} onClick={()=>{
          setSalesTab(id);
          setActiveCompany(null);setActiveVendor(null);
          setActiveMuni(null);setMuniScreen("top");
          setPrevTab(null);resetBulk();
          localStorage.setItem("md_salesTab",id);
        }}
          style={{flex:1,padding:"0.55rem 0.15rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:700,fontSize:"0.75rem",transition:"all 0.15s",position:"relative",
            background:salesTab===id?C.accent:"transparent",color:salesTab===id?"white":C.textSub,
            boxShadow:salesTab===id?`0 2px 8px ${C.accent}44`:"none"}}>
          {icon} {lbl}
        </button>
      ))}
    </div>
  );

  const BackBtn=({label,onClick})=>(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",marginBottom:"1rem",padding:0}}>
      ‹ {label}
    </button>
  );

  const SChip=({s,map})=>{
    const safeMap=map||VENDOR_STATUS;
    const label=s||"未接触";
    const m=safeMap[label]||Object.values(safeMap)[0]||{color:"#6b7280",bg:"#f3f4f6"};
    return <span style={{padding:"0.15rem 0.5rem",borderRadius:999,fontSize:"0.7rem",fontWeight:700,background:m.bg,color:m.color,whiteSpace:"nowrap"}}>{label}</span>;
  };

  const AssigneeRow=({ids=[]})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"0.25rem"}}>
      {(ids||[]).map(id=>{const u=users.find(u=>u.id===id);return u?<span key={id} style={{fontSize:"0.7rem",background:C.accentBg,color:C.accentDark,padding:"0.1rem 0.4rem",borderRadius:999,fontWeight:600}}>{u.name}</span>:null;})}
      {(!ids||ids.length===0)&&<span style={{fontSize:"0.7rem",color:C.textMuted}}>未設定</span>}
    </div>
  );

  const AssigneePicker=({ids=[],onChange})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
      {users.map(u=>{const sel=(ids||[]).includes(u.id);return(
        <button key={u.id} onClick={()=>onChange(sel?(ids||[]).filter(i=>i!==u.id):[...(ids||[]),u.id])}
          style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",border:`1.5px solid ${sel?C.accent:C.border}`,background:sel?C.accentBg:"white",color:sel?C.accentDark:C.textSub}}>
          {u.name}
        </button>);
      })}
      {users.length===0&&<span style={{fontSize:"0.78rem",color:C.textMuted}}>ユーザーが登録されていません</span>}
    </div>
  );

  const StatusPicker=({map,value,onChange})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
      {Object.entries(map).map(([s,m])=>(
        <button key={s} onClick={()=>onChange(s)}
          style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",border:`1.5px solid ${value===s?m.color:C.border}`,background:value===s?m.bg:"white",color:value===s?m.color:C.textSub}}>
          {s}
        </button>
      ))}
    </div>
  );

  const DustalkPicker=({value,onChange})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
      {Object.entries(DUSTALK_STATUS).map(([s,m])=>(
        <button key={s} onClick={()=>onChange&&onChange(s)}
          style={{padding:"0.3rem 0.875rem",borderRadius:999,fontSize:"0.82rem",fontWeight:700,cursor:onChange?"pointer":"default",border:`1.5px solid ${value===s?m.color:C.border}`,background:value===s?m.bg:"white",color:value===s?m.color:C.textSub}}>
          {m.icon} {s}
        </button>
      ))}
    </div>
  );
  const TreatyPicker=({value,onChange})=>(
    <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
      {Object.entries(TREATY_STATUS).map(([s,m])=>(
        <button key={s} onClick={()=>onChange&&onChange(s)}
          style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.78rem",fontWeight:700,cursor:onChange?"pointer":"default",border:`1.5px solid ${value===s?m.color:C.border}`,background:value===s?m.bg:"white",color:value===s?m.color:C.textSub}}>
          {s}
        </button>
      ))}
    </div>
  );

  // MuniPicker - 都道府県→自治体チェックボックス複数選択
  // selPref は親stateを使用（コンポーネント再定義でリセットされない）
  const MuniPicker=({ids=[],onChange})=>{
    const prefMunis=muniPickerPref?munis.filter(m=>m.prefectureId===Number(muniPickerPref)):[]; 
    const selectedMunis=(ids||[]).map(muniOf).filter(Boolean);
    const toggleMuni=(mid)=>{
      if((ids||[]).includes(mid)) onChange((ids||[]).filter(i=>i!==mid));
      else onChange([...(ids||[]),mid]);
    };
    const selectAll=()=>onChange([...(ids||[]),...prefMunis.map(m=>m.id).filter(id=>!(ids||[]).includes(id))]);
    const deselectAll=()=>onChange((ids||[]).filter(id=>!prefMunis.some(m=>m.id===id)));
    const allSelected=prefMunis.length>0&&prefMunis.every(m=>(ids||[]).includes(m.id));
    return (
      <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
        {/* 都道府県ドロップダウン */}
        <select value={muniPickerPref} onChange={e=>setMuniPickerPref(e.target.value)}
          style={{width:"100%",padding:"0.45rem 0.625rem",borderRadius:"0.625rem",border:`1.5px solid ${C.border}`,fontSize:"0.82rem",fontFamily:"inherit",outline:"none",background:"white",cursor:"pointer"}}>
          <option value="">── 都道府県を選択 ──</option>
          {prefs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* 自治体チェックボックスグリッド */}
        {muniPickerPref&&(
          <div style={{border:`1.5px solid ${C.accent}`,borderRadius:"0.75rem",overflow:"hidden",background:"white"}}>
            {/* ヘッダー：全選択・全解除 */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.4rem 0.625rem",background:C.accentBg,borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accentDark}}>{prefs.find(p=>p.id===Number(muniPickerPref))?.name} の自治体</span>
              <div style={{display:"flex",gap:"0.35rem"}}>
                <button onClick={selectAll} disabled={allSelected}
                  style={{fontSize:"0.68rem",fontWeight:700,padding:"0.15rem 0.45rem",borderRadius:999,border:`1px solid ${C.accent}`,background:"white",color:C.accent,cursor:"pointer",fontFamily:"inherit",opacity:allSelected?0.4:1}}>全選択</button>
                <button onClick={deselectAll}
                  style={{fontSize:"0.68rem",fontWeight:700,padding:"0.15rem 0.45rem",borderRadius:999,border:`1px solid ${C.border}`,background:"white",color:C.textSub,cursor:"pointer",fontFamily:"inherit"}}>解除</button>
              </div>
            </div>
            {/* 自治体チェックボックスリスト */}
            <div style={{maxHeight:220,overflowY:"auto",padding:"0.35rem 0.5rem",display:"flex",flexDirection:"column",gap:"0.2rem"}}>
              {prefMunis.length===0&&<div style={{padding:"0.75rem",fontSize:"0.78rem",color:C.textMuted,textAlign:"center"}}>自治体が登録されていません</div>}
              {prefMunis.map(m=>{
                const sel=(ids||[]).includes(m.id);
                return (
                  <label key={m.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.35rem 0.5rem",borderRadius:"0.5rem",cursor:"pointer",background:sel?C.accentBg:"transparent",transition:"background 0.1s"}}>
                    <input type="checkbox" checked={sel} onChange={()=>toggleMuni(m.id)}
                      style={{width:15,height:15,accentColor:C.accent,flexShrink:0,cursor:"pointer"}}/>
                    <span style={{fontSize:"0.83rem",fontWeight:sel?700:500,color:sel?C.accentDark:C.text}}>{m.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {/* 選択済み自治体タグ */}
        {selectedMunis.length>0&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.3rem"}}>
            {selectedMunis.map(m=>{
              const pn=prefs.find(p=>p.id===m.prefectureId)?.name||"";
              return (
                <span key={m.id} style={{display:"flex",alignItems:"center",gap:"0.2rem",background:C.accentBg,color:C.accentDark,borderRadius:999,padding:"0.2rem 0.5rem 0.2rem 0.625rem",fontSize:"0.78rem",fontWeight:700}}>
                  <span style={{fontSize:"0.62rem",opacity:0.7}}>{pn}</span> {m.name}
                  <button onClick={()=>onChange((ids||[]).filter(i=>i!==m.id))}
                    style={{background:"none",border:"none",cursor:"pointer",color:C.accentDark,fontWeight:800,fontSize:"0.9rem",lineHeight:1,padding:0,marginLeft:2}}>×</button>
                </span>
              );
            })}
          </div>
        )}
        {munis.length===0&&<span style={{fontSize:"0.78rem",color:C.textMuted}}>自治体が登録されていません</span>}
      </div>
    );
  };

  // ── Memo section ──────────────────────────────────────────────────────────
  const MemoSection=({memos=[],entityKey,entityId})=>(
    <div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"0.75rem"}}>
        {[...(memos||[])].reverse().map(m=>(
          <div key={m.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.35rem"}}>
              <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accentDark}}>{uName(m.userId)}</span>
              <span style={{fontSize:"0.65rem",color:C.textMuted}}>{new Date(m.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
            <div style={{fontSize:"0.87rem",color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>
        ))}
        {!(memos||[]).length&&<div style={{textAlign:"center",padding:"1.25rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem"}}>メモがありません</div>}
      </div>
      <div style={{display:"flex",gap:"0.5rem"}}>
        <textarea value={memoInputs[entityId]||""} onChange={e=>setMemoInputs(p=>({...p,[entityId]:e.target.value}))}
          placeholder="メモを追加..." rows={2}
          style={{flex:1,padding:"0.625rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"vertical",outline:"none",lineHeight:1.5}}/>
        <button onClick={()=>addMemo(entityKey,entityId,memoInputs[entityId]||"")} disabled={!(memoInputs[entityId]||"").trim()}
          style={{alignSelf:"flex-end",padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:(memoInputs[entityId]||"").trim()?1:0.4}}>
          追加
        </button>
      </div>
    </div>
  );

  // ── Chat section ──────────────────────────────────────────────────────────
  const ChatSection=({chat=[],entityKey,entityId})=>{
    const val = chatInputs[entityId]||"";
    const atMatch = val.match(/@([^\s　]*)$/);
    const mentionQuery = atMatch ? atMatch[1].toLowerCase() : null;
    const mentionCandidates = mentionQuery !== null
      ? users.filter(u=>u.id!==currentUser?.id && u.name.toLowerCase().includes(mentionQuery)).slice(0,5)
      : [];
    const insertMention = (name) => {
      const newVal = val.replace(/@([^\s　]*)$/, `@${name} `);
      setChatInputs(p=>({...p,[entityId]:newVal}));
    };
    const renderMsg=text=>text.split(/(@[^\s　]+)/g).map((p,i)=>
      p.startsWith("@")?<span key={i} style={{background:C.accentBg,color:C.accentDark,borderRadius:4,padding:"0 3px",fontWeight:700}}>{p}</span>:p
    );
    return (
      <div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"0.75rem",maxHeight:400,overflowY:"auto",padding:"0.25rem 0"}}>
          {[...(chat||[])].map(m=>{
            const isMe=m.userId===currentUser?.id;
            return (
              <div key={m.id} style={{display:"flex",flexDirection:isMe?"row-reverse":"row",gap:"0.4rem",alignItems:"flex-end"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.68rem",fontWeight:800,color:"white",flexShrink:0}}>
                  {uInit(m.userId)}
                </div>
                <div style={{maxWidth:"72%"}}>
                  {!isMe&&<div style={{fontSize:"0.62rem",color:C.textMuted,marginBottom:"0.1rem",fontWeight:600}}>{uName(m.userId)}</div>}
                  <div style={{background:isMe?C.accent:"white",color:isMe?"white":C.text,borderRadius:isMe?"0.875rem 0.875rem 0.25rem 0.875rem":"0.875rem 0.875rem 0.875rem 0.25rem",padding:"0.45rem 0.7rem",fontSize:"0.87rem",lineHeight:1.5,border:isMe?"none":`1px solid ${C.border}`,boxShadow:C.shadow}}>
                    {renderMsg(m.text)}
                  </div>
                  <div style={{fontSize:"0.58rem",color:C.textMuted,marginTop:"0.1rem",textAlign:isMe?"right":"left"}}>{new Date(m.date).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
              </div>
            );
          })}
          {!(chat||[]).length&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem"}}>まだメッセージがありません</div>}
        </div>
        <div style={{background:C.bg,borderRadius:"0.875rem",padding:"0.5rem"}}>
          <div style={{position:"relative"}}>
            {mentionCandidates.length>0&&(
              <div style={{position:"absolute",bottom:"100%",left:0,right:0,background:"white",border:`1px solid ${C.border}`,borderRadius:"0.75rem",boxShadow:C.shadowMd,zIndex:50,overflow:"hidden",marginBottom:4}}>
                {mentionCandidates.map(u=>(
                  <button key={u.id} onMouseDown={e=>{e.preventDefault();insertMention(u.name);}}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",width:"100%",padding:"0.5rem 0.875rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",borderBottom:`1px solid ${C.borderLight}`}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.6rem",fontWeight:800,color:"white",flexShrink:0}}>
                      {u.name.charAt(0)}
                    </div>
                    <span style={{fontSize:"0.85rem",fontWeight:600,color:C.text}}>@{u.name}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:"0.4rem"}}>
              <input value={val} onChange={e=>setChatInputs(p=>({...p,[entityId]:e.target.value}))}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addChat(entityKey,entityId,val);}}}
                placeholder="メッセージ... (@ でメンション)"
                style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
              <button onClick={()=>addChat(entityKey,entityId,val)} disabled={!val.trim()}
                style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:val.trim()?1:0.4}}>
                送信
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };



  // ── DUP popup ─────────────────────────────────────────────────────────────
  if(dupQueue.length>0&&dupIdx<dupQueue.length){
    const item=dupQueue[dupIdx];
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1.5rem"}}>
        <div style={{background:"white",borderRadius:"1.25rem",padding:"1.75rem",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:"1.5rem",textAlign:"center",marginBottom:"0.625rem"}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:"0.93rem",color:C.text,textAlign:"center",marginBottom:"0.25rem"}}>重複する名前があります</div>
          <div style={{fontSize:"0.7rem",color:C.textMuted,textAlign:"center",marginBottom:"0.75rem"}}>{dupIdx+1}/{dupQueue.length}件</div>
          <div style={{background:C.accentBg,borderRadius:"0.75rem",padding:"0.75rem",marginBottom:"1rem",textAlign:"center",fontWeight:700,color:C.text}}>「{item.name}」</div>
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            <button onClick={()=>handleDupChoice("edit")} style={{padding:"0.75rem",borderRadius:"0.875rem",border:`1.5px solid ${C.accent}`,background:C.accentBg,color:C.accentDark,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>✏️ 既存を編集</button>
            <button onClick={()=>handleDupChoice("new")} style={{padding:"0.75rem",borderRadius:"0.875rem",border:`1.5px solid ${C.border}`,background:"white",color:C.text,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>➕ 新規登録</button>
            <button onClick={()=>{const n=dupIdx+1;if(n>=dupQueue.length){setDupQueue([]);setSheet("bulkDone");}else setDupIdx(n);}} style={{padding:"0.5rem",border:"none",background:"none",color:C.textMuted,cursor:"pointer",fontFamily:"inherit"}}>スキップ</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 概況ダッシュボード ──────────────────────────────────────────────────
  // ── マップタブ ─────────────────────────────────────────────────────────────
  if(salesTab==="map"){
    // 都道府県 緯度経度データ
    const PREF_COORDS = {
      "北海道":[43.064,141.347],"青森県":[40.824,140.740],"岩手県":[39.703,141.153],
      "宮城県":[38.269,140.872],"秋田県":[39.718,140.103],"山形県":[38.240,140.363],
      "福島県":[37.750,140.468],"茨城県":[36.341,140.447],"栃木県":[36.566,139.883],
      "群馬県":[36.391,139.060],"埼玉県":[35.857,139.649],"千葉県":[35.605,140.123],
      "東京都":[35.690,139.692],"神奈川県":[35.448,139.642],"新潟県":[37.902,139.023],
      "富山県":[36.695,137.211],"石川県":[36.594,136.626],"福井県":[36.065,136.222],
      "山梨県":[35.664,138.568],"長野県":[36.651,138.181],"岐阜県":[35.391,136.722],
      "静岡県":[34.977,138.383],"愛知県":[35.180,136.907],"三重県":[34.730,136.509],
      "滋賀県":[35.005,135.869],"京都府":[35.021,135.756],"大阪府":[34.686,135.520],
      "兵庫県":[34.691,135.183],"奈良県":[34.685,135.833],"和歌山県":[34.226,135.168],
      "鳥取県":[35.504,134.238],"島根県":[35.474,133.051],"岡山県":[34.662,133.935],
      "広島県":[34.396,132.459],"山口県":[34.186,131.471],"徳島県":[34.066,134.559],
      "香川県":[34.340,134.043],"愛媛県":[33.842,132.766],"高知県":[33.560,133.531],
      "福岡県":[33.607,130.418],"佐賀県":[33.249,130.299],"長崎県":[32.745,129.874],
      "熊本県":[32.790,130.742],"大分県":[33.238,131.613],"宮崎県":[31.911,131.424],
      "鹿児島県":[31.560,130.558],"沖縄県":[26.212,127.681],
    };

    return (
      <div>
        <TopTabs/>
        <ErrorBoundary key="map-tab">
          <MapTab
            prefs={prefs} munis={munis} vendors={vendors} companies={companies}
            prefCoords={PREF_COORDS}
            onSelectPref={(prefId)=>{setActivePref(prefId);setSalesTab("muni");setMuniScreen("top");}}
          />
        </ErrorBoundary>
      </div>
    );
  }

  if(salesTab==="dash"){
    // ── 日付フィルター ────────────────────────────────────────────────────
    const now=new Date();
    const periodStart=dashPeriod==="today"?new Date(now.getFullYear(),now.getMonth(),now.getDate())
      :dashPeriod==="week"?new Date(now-6*24*60*60*1000)
      :dashPeriod==="month"?new Date(now.getFullYear(),now.getMonth(),1)
      :null;
    const inPeriod=d=>!periodStart||new Date(d)>=periodStart;

    const allChangeLogs=(data.changeLogs||[]).filter(l=>inPeriod(l.date));

    const totalMuni=munis.length;
    const deployed=munis.filter(m=>m.dustalk==="展開").length;
    const treatyDone=munis.filter(m=>m.treatyStatus==="協定済").length;
    const totalVend=vendors.length;
    const vendJoined=vendors.filter(v=>v.status==="加入済").length;
    const totalComp=companies.length;
    const compClosed=companies.filter(c=>c.status==="成約").length;

    // 期間内の活動数
    const periodActivity=allChangeLogs.length;
    const periodTreaty=allChangeLogs.filter(l=>l.field==="連携協定"&&l.newVal==="協定済").length;
    const periodJoined=allChangeLogs.filter(l=>l.entityType==="業者"&&l.field==="ステータス"&&l.newVal==="加入済").length;
    const periodClosed=allChangeLogs.filter(l=>l.entityType==="企業"&&l.field==="ステータス"&&l.newVal==="成約").length;

    const muniByTreaty=Object.keys(TREATY_STATUS).map(s=>({s,n:munis.filter(m=>(m.treatyStatus||"未接触")===s).length}));
    const vendByStatus=Object.keys(VENDOR_STATUS).map(s=>({s,n:vendors.filter(v=>v.status===s).length}));
    const compByStatus=Object.keys(COMPANY_STATUS).map(s=>({s,n:companies.filter(c=>c.status===s).length}));
    const prefDeploy=prefs.map(p=>({name:p.name,n:munis.filter(m=>m.prefectureId===p.id&&m.dustalk==="展開").length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,6);

    const assigneeStats=users.map(u=>({
      u,
      muniTotal: munis.filter(m=>(m.assigneeIds||[]).includes(u.id)).length,
      muniDone:  munis.filter(m=>(m.assigneeIds||[]).includes(u.id)&&m.treatyStatus==="協定済").length,
      vendTotal: vendors.filter(v=>(v.assigneeIds||[]).includes(u.id)).length,
      vendDone:  vendors.filter(v=>(v.assigneeIds||[]).includes(u.id)&&v.status==="加入済").length,
      compTotal: companies.filter(c=>(c.assigneeIds||[]).includes(u.id)).length,
      compDone:  companies.filter(c=>(c.assigneeIds||[]).includes(u.id)&&c.status==="成約").length,
    })).filter(x=>x.muniTotal+x.vendTotal+x.compTotal>0);

    const recentMemos=[
      ...munis.flatMap(m=>(m.memos||[]).map(memo=>({...memo,entityName:m.name,entityType:"自治体"}))),
      ...vendors.flatMap(v=>(v.memos||[]).map(memo=>({...memo,entityName:v.name,entityType:"業者"}))),
      ...companies.flatMap(c=>(c.memos||[]).map(memo=>({...memo,entityName:c.name,entityType:"企業"}))),
    ].filter(m=>inPeriod(m.date)).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,10);

    const KPI=({label,val,sub,col="#2563eb",icon,badge=null})=>(
      <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.875rem",boxShadow:C.shadow,flex:1,minWidth:0,position:"relative"}}>
        <div style={{fontSize:"0.65rem",color:C.textMuted,fontWeight:600,marginBottom:"0.2rem"}}>{label}</div>
        <div style={{display:"flex",alignItems:"baseline",gap:"0.3rem"}}>
          <span style={{fontSize:"1.6rem",fontWeight:800,color:col,lineHeight:1}}>{icon||""}{val}</span>
          {sub&&<span style={{fontSize:"0.68rem",color:C.textMuted}}>{sub}</span>}
        </div>
        {badge!=null&&<div style={{position:"absolute",top:"0.5rem",right:"0.75rem",fontSize:"0.62rem",fontWeight:700,background:col+"18",color:col,borderRadius:999,padding:"0.1rem 0.4rem"}}>+{badge} 期間</div>}
      </div>
    );
    const FunnelBar=({items,statusMap})=>{
      const max=Math.max(...items.map(x=>x.n),1);
      return (
        <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
          {items.map(({s,n})=>{
            const m=(statusMap||VENDOR_STATUS)[s]||Object.values(statusMap||VENDOR_STATUS)[0];
            return (
              <div key={s} style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:m.color,width:56,flexShrink:0,textAlign:"right"}}>{s}</span>
                <div style={{flex:1,height:18,background:C.bg,borderRadius:999,overflow:"hidden"}}>
                  <div style={{width:`${(n/max)*100}%`,height:"100%",background:m.color,borderRadius:999,minWidth:n>0?4:0,transition:"width 0.4s"}}/>
                </div>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.text,width:28,textAlign:"right"}}>{n}</span>
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <div>
        <TopTabs/>
        {/* 日付フィルター */}
        <div style={{display:"flex",gap:"0.3rem",marginBottom:"1rem",background:"white",borderRadius:"0.875rem",padding:"0.25rem",border:`1px solid ${C.border}`,boxShadow:C.shadow}}>
          {[["today","今日"],["week","7日間"],["month","今月"],["all","全期間"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setDashPeriod(id)}
              style={{flex:1,padding:"0.45rem 0.2rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",transition:"all 0.15s",background:dashPeriod===id?C.accent:"transparent",color:dashPeriod===id?"white":C.textSub}}>
              {lbl}
            </button>
          ))}
        </div>

        {/* 期間内の活動サマリー */}
        {dashPeriod!=="all"&&(
          <div style={{background:"linear-gradient(135deg,#1e40af,#2563eb)",borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"1rem",color:"white"}}>
            <div style={{fontSize:"0.65rem",fontWeight:700,opacity:0.8,marginBottom:"0.5rem"}}>
              {dashPeriod==="today"?"今日":dashPeriod==="week"?"過去7日間":"今月"}の活動
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem"}}>
              {[["変更","件",periodActivity,"white"],["協定済","+",periodTreaty,"#6ee7b7"],["加入済","+",periodJoined,"#c4b5fd"],["成約","+",periodClosed,"#fcd34d"]].map(([lbl,unit,val,col])=>(
                <div key={lbl} style={{textAlign:"center"}}>
                  <div style={{fontSize:"1.3rem",fontWeight:800,color:col,lineHeight:1}}>{val}</div>
                  <div style={{fontSize:"0.6rem",opacity:0.8,marginTop:"0.15rem"}}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPIカード */}
        <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.5rem"}}>
          <KPI label="ダストーク展開" val={deployed} sub={`/ ${totalMuni}`} col="#059669" icon="✅" badge={dashPeriod!=="all"?allChangeLogs.filter(l=>l.field==="ダストーク"&&l.newVal==="展開").length:null}/>
          <KPI label="連携協定済" val={treatyDone} sub={`/ ${totalMuni}`} col="#2563eb" icon="🤝" badge={dashPeriod!=="all"?periodTreaty:null}/>
        </div>
        <div style={{display:"flex",gap:"0.5rem",marginBottom:"1.25rem"}}>
          <KPI label="業者 加入済" val={vendJoined} sub={`/ ${totalVend}`} col="#7c3aed" badge={dashPeriod!=="all"?periodJoined:null}/>
          <KPI label="企業 成約" val={compClosed} sub={`/ ${totalComp}`} col="#d97706" badge={dashPeriod!=="all"?periodClosed:null}/>
        </div>

        {/* 担当者別進捗 */}
        {assigneeStats.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
            <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.875rem"}}>👤 担当者別 進捗</div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.625rem"}}>
              {assigneeStats.map(({u,muniTotal,muniDone,vendTotal,vendDone,compTotal,compDone})=>(
                <div key={u.id} style={{padding:"0.75rem",background:C.bg,borderRadius:"0.75rem"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:800,color:"white",flexShrink:0}}>{u.name.charAt(0)}</div>
                    <span style={{fontWeight:700,fontSize:"0.85rem",color:C.text}}>{u.name}</span>
                    {dashPeriod!=="all"&&(()=>{
                      const acts=allChangeLogs.filter(l=>l.userId===u.id).length;
                      return acts>0?<span style={{marginLeft:"auto",fontSize:"0.65rem",background:"#dbeafe",color:"#1d4ed8",borderRadius:999,padding:"0.1rem 0.4rem",fontWeight:700}}>{acts}件の活動</span>:null;
                    })()}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.35rem"}}>
                    {[[muniDone,muniTotal,"🏛️自治体","#2563eb"],[vendDone,vendTotal,"🔧業者","#7c3aed"],[compDone,compTotal,"🏢企業","#d97706"]].map(([done,total,lbl,col])=>(
                      <div key={lbl} style={{background:"white",borderRadius:"0.5rem",padding:"0.4rem 0.5rem"}}>
                        <div style={{fontSize:"0.62rem",color:C.textMuted,marginBottom:"0.15rem"}}>{lbl}</div>
                        <div style={{fontSize:"0.85rem",fontWeight:800,color:col}}>{done}<span style={{fontSize:"0.65rem",color:C.textMuted,fontWeight:500}}>/{total}</span></div>
                        {total>0&&<div style={{height:3,background:C.borderLight,borderRadius:999,marginTop:"0.25rem",overflow:"hidden"}}>
                          <div style={{width:`${(done/total)*100}%`,height:"100%",background:col,borderRadius:999}}/>
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ファネル */}
        <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>🏛️ 自治体 連携協定ステータス</div>
          <FunnelBar items={muniByTreaty} statusMap={TREATY_STATUS}/>
        </div>
        <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>🔧 業者 ステータス</div>
          <FunnelBar items={vendByStatus} statusMap={VENDOR_STATUS}/>
        </div>
        <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>🏢 企業 パイプライン</div>
          <FunnelBar items={compByStatus} statusMap={COMPANY_STATUS}/>
        </div>

        {/* 都道府県別展開 */}
        {prefDeploy.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
            <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>📍 都道府県別 展開数（上位）</div>
            {prefDeploy.map(({name,n})=>(
              <div key={name} style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.35rem"}}>
                <span style={{fontSize:"0.78rem",color:C.text,width:72,flexShrink:0}}>{name}</span>
                <div style={{flex:1,height:14,background:C.bg,borderRadius:999,overflow:"hidden"}}>
                  <div style={{width:`${(n/prefDeploy[0].n)*100}%`,height:"100%",background:C.accent,borderRadius:999}}/>
                </div>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accent,width:24,textAlign:"right"}}>{n}</span>
              </div>
            ))}
          </div>
        )}

        {/* 変更履歴タイムライン */}
        {allChangeLogs.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
            <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>🔄 変更履歴</div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {[...allChangeLogs].reverse().slice(0,15).map((l,i,arr)=>{
                const u=users.find(x=>x.id===l.userId);
                const typeCol=l.entityType==="自治体"?"#2563eb":l.entityType==="業者"?"#7c3aed":"#d97706";
                return (
                  <div key={l.id} style={{display:"flex",gap:"0.625rem",padding:"0.625rem 0",borderBottom:i<arr.length-1?`1px solid ${C.borderLight}`:"none"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,width:18}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:typeCol,flexShrink:0,marginTop:4}}/>
                      {i<arr.length-1&&<div style={{flex:1,width:1,background:C.borderLight,margin:"3px 0"}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:"0.3rem",alignItems:"center",marginBottom:"0.1rem",flexWrap:"wrap"}}>
                        <span style={{fontSize:"0.62rem",fontWeight:700,background:typeCol+"18",color:typeCol,borderRadius:999,padding:"0 0.35rem"}}>{l.entityType}</span>
                        <span style={{fontSize:"0.8rem",fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{l.entityName}</span>
                        <span style={{fontSize:"0.72rem",color:C.textSub}}>{l.field}</span>
                      </div>
                      {l.oldVal&&l.newVal?(
                        <div style={{display:"flex",alignItems:"center",gap:"0.3rem",fontSize:"0.75rem"}}>
                          <span style={{color:C.textMuted,textDecoration:"line-through"}}>{l.oldVal}</span>
                          <span style={{color:C.textMuted}}>→</span>
                          <span style={{fontWeight:700,color:typeCol}}>{l.newVal}</span>
                        </div>
                      ):(
                        <div style={{fontSize:"0.75rem",color:typeCol,fontWeight:600}}>{l.newVal||l.oldVal}</div>
                      )}
                      <div style={{fontSize:"0.6rem",color:C.textMuted,marginTop:"0.1rem"}}>{u?.name||"—"} · {new Date(l.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* メモ活動ログ */}
        {recentMemos.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",boxShadow:C.shadow}}>
            <div style={{fontWeight:800,fontSize:"0.82rem",color:C.text,marginBottom:"0.75rem"}}>📝 活動メモ</div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {recentMemos.map((m,i)=>{
                const u=users.find(x=>x.id===m.userId);
                const typeCol=m.entityType==="自治体"?"#2563eb":m.entityType==="業者"?"#7c3aed":"#d97706";
                return (
                  <div key={m.id} style={{display:"flex",gap:"0.625rem",padding:"0.625rem 0",borderBottom:i<recentMemos.length-1?`1px solid ${C.borderLight}`:"none"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,width:18}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:typeCol,flexShrink:0,marginTop:4}}/>
                      {i<recentMemos.length-1&&<div style={{flex:1,width:1,background:C.borderLight,margin:"3px 0"}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",gap:"0.35rem",alignItems:"center",marginBottom:"0.1rem"}}>
                        <span style={{fontSize:"0.62rem",fontWeight:700,background:typeCol+"18",color:typeCol,borderRadius:999,padding:"0 0.35rem"}}>{m.entityType}</span>
                        <span style={{fontSize:"0.8rem",fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.entityName}</span>
                      </div>
                      <div style={{fontSize:"0.78rem",color:C.textSub,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.text}</div>
                      <div style={{fontSize:"0.6rem",color:C.textMuted,marginTop:"0.1rem"}}>{u?.name} · {new Date(m.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
  // ── 企業タブ ──────────────────────────────────────────────────────────────
  if(salesTab==="company"){
    // Detail view
    if(activeCompany){
      const comp=companyOf(activeCompany);
      if(!comp) {setActiveCompany(null);return null;}
      const compChatUnread=(data.notifications||[]).filter(n=>n.toUserId===currentUser?.id&&!n.read&&n.type==="mention"&&n.entityId===comp.id).length;
      return (
        <div>
          <div style={{display:"flex",alignItems:"center",marginBottom:"1rem",gap:"0.5rem"}}>
            <button onClick={()=>{setActiveCompany(null);restoreSalesScroll("company");}} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0}}>‹ 一覧</button>
            <span style={{flex:1}}/>
    
          </div>
          {/* Header card */}
          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.75rem"}}>
              <div>
                <div style={{fontSize:"1.15rem",fontWeight:800,color:C.text}}>{comp.name}</div>
                <div style={{marginTop:"0.35rem"}}><SChip s={comp.status} map={COMPANY_STATUS}/></div>
              </div>
              <button onClick={()=>{setForm({...comp});setSheet("editCompany");}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.625rem",padding:"0.35rem 0.625rem",cursor:"pointer",fontSize:"0.82rem",color:C.textSub}}>✏️</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",fontSize:"0.78rem"}}>
              {comp.phone&&<div><span style={{color:C.textMuted}}>📞 </span>{comp.phone}</div>}
              {comp.email&&<div><span style={{color:C.textMuted}}>✉️ </span>{comp.email}</div>}
              {comp.address&&<div style={{gridColumn:"1/-1"}}><span style={{color:C.textMuted}}>📍 </span>{comp.address}</div>}
            </div>
            {(comp.assigneeIds||[]).length>0&&<div style={{marginTop:"0.5rem"}}><AssigneeRow ids={comp.assigneeIds}/></div>}
          </Card>
          {/* Status quick-change */}
          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ステータス変更</div>
            <StatusPicker map={COMPANY_STATUS} value={comp.status} onChange={s=>{
              let nd={...data,companies:companies.map(c=>c.id===comp.id?{...c,status:s}:c)};
              nd=addChangeLog(nd,{entityType:"企業",entityId:comp.id,entityName:comp.name,field:"ステータス",oldVal:comp.status,newVal:s});
              save(nd);
            }}/>
          </div>
          {/* Sub-tabs: メモ・チャット・タスク */}
          <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
            {[["memo","📝","メモ"],["chat","💬","チャット"],["tasks","✅","タスク"],["files","📎","ファイル"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&compChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{compChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===comp.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>
          {activeDetail==="memo"&&MemoSection({memos:comp.memos,entityKey:"companies",entityId:comp.id})}
          {activeDetail==="chat"&&ChatSection({chat:comp.chat,entityKey:"companies",entityId:comp.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="企業" entityId={comp.id} entityName={comp.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/>}
          {activeDetail==="files"&&<FileSection files={comp.files||[]} currentUserId={currentUser?.id}
            onAdd={f=>addFileToEntity("companies",comp.id,f)}
            onDelete={fid=>removeFileFromEntity("companies",comp.id,fid)}/>}
          {sheet==="editCompany"&&(
            <Sheet title="企業を編集" onClose={()=>setSheet(null)}>
              <FieldLbl label="企業名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
              <FieldLbl label="ステータス"><StatusPicker map={COMPANY_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
              <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
              <FieldLbl label="電話番号（任意）"><Input value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="000-0000-0000"/></FieldLbl>
              <FieldLbl label="メールアドレス（任意）"><Input value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} placeholder="example@mail.com"/></FieldLbl>
              <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
              <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:70}}/></FieldLbl>
              <div style={{display:"flex",gap:"0.625rem"}}>
                <button onClick={()=>{if(window.confirm("削除しますか？")){deleteCompany(comp.id);setSheet(null);}}} style={{padding:"0.75rem",borderRadius:"0.875rem",border:`1.5px solid #fee2e2`,background:"#fee2e2",color:"#dc2626",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🗑</button>
                <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
                <Btn style={{flex:2}} onClick={saveCompany} disabled={!form.name?.trim()}>保存</Btn>
              </div>
            </Sheet>
          )}
        </div>
      );
    }
    // List view - grouped by status
    const compsByStatus = Object.keys(COMPANY_STATUS).map(s=>({
      status:s, meta:COMPANY_STATUS[s],
      items:companies.filter(c=>(c.status||"未接触")===s&&(!compSearch||normSearch(c.name).includes(normSearch(compSearch))))
    })).filter(g=>g.items.length>0||(compSearch&&companies.some(c=>(c.status||"未接触")===s)));
    const normSearch = s => (s||"").replace(/[\s\u3000]/g,"").toLowerCase();
    const searchedComps = compSearch ? companies.filter(c=>normSearch(c.name).includes(normSearch(compSearch))) : null;
    return (
      <div>
        <TopTabs/>
        <BulkBar statusMap={COMPANY_STATUS} applyFn={applyBulkComp}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem",gap:"0.5rem"}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",left:"0.625rem",top:"50%",transform:"translateY(-50%)",color:C.textMuted,fontSize:"0.85rem",pointerEvents:"none"}}>🔍</span>
            <input value={compSearch} onChange={e=>setCompSearch(e.target.value)} placeholder="企業名で検索"
              style={{width:"100%",padding:"0.5rem 0.5rem 0.5rem 2rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button onClick={()=>setBulkMode(v=>{if(v){resetBulk();return false;}setBulkSelected(new Set());return true;})}
            style={{padding:"0.45rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${bulkMode?"#2563eb":C.border}`,background:bulkMode?"#eff6ff":"white",color:bulkMode?"#1d4ed8":C.textSub,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>☑️</button>
          <button onClick={()=>setSheet("importCompany")}
            style={{padding:"0.45rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>📥</button>
          <Btn size="sm" onClick={()=>{setForm({status:"未接触",assigneeIds:[]});setSheet("addCompany");}}>＋</Btn>
        </div>
        {companies.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 1rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
            <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🏢</div>
            <div style={{fontWeight:700,marginBottom:"0.25rem",fontSize:"0.9rem"}}>企業が登録されていません</div>
            <div style={{fontSize:"0.8rem"}}>「＋」から追加してください</div>
          </div>
        )}
        {/* Search results: flat list */}
        {compSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {(searchedComps||[]).map(c=>{
              const lastMemo=(c.memos||[]).slice(-1)[0];
              return (
                <div key={c.id} onClick={()=>{saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("memo");}}
                  style={{background:"white",border:`1.5px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.875rem 1rem",cursor:"pointer",boxShadow:C.shadow}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.3rem"}}>
                    <span style={{fontWeight:700,fontSize:"0.93rem",color:C.text,flex:1}}>{c.name}</span>
                    <SChip s={c.status} map={COMPANY_STATUS}/>
                  </div>
                  <AssigneeRow ids={c.assigneeIds}/>
                  {lastMemo&&<div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.2rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {lastMemo.text}</div>}
                </div>
              );
            })}
            {!searchedComps?.length&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,fontSize:"0.85rem"}}>該当する企業がありません</div>}
          </div>
        )}
        {/* Grouped view */}
        {!compSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.625rem"}}>
            {Object.entries(COMPANY_STATUS).map(([s,meta])=>{
              const items=companies.filter(c=>(c.status||"未接触")===s);
              const isOpen=openCompGrp.has(s);
              return (
                <div key={s} style={{background:"white",borderRadius:"0.875rem",border:`1.5px solid ${C.border}`,overflow:"hidden",boxShadow:C.shadow}}>
                  {/* Group header */}
                  <button onClick={()=>toggleGrp(setOpenCompGrp,s)}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.75rem 1rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:meta.color,flexShrink:0,display:"inline-block"}}/>
                    <span style={{fontWeight:800,fontSize:"0.88rem",color:C.text,flex:1}}>{s}</span>
                    <span style={{fontSize:"0.75rem",fontWeight:700,color:C.textMuted,background:C.bg,borderRadius:999,padding:"0.1rem 0.5rem"}}>{items.length}</span>
                    <span style={{fontSize:"0.75rem",color:C.textMuted,transition:"transform 0.2s",display:"inline-block",transform:isOpen?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
                  </button>
                  {/* Items */}
                  {isOpen&&items.length>0&&(
                    <div style={{borderTop:`1px solid ${C.borderLight}`}}>
                      {items.map((c,i)=>{
                        const lastMemo=(c.memos||[]).slice(-1)[0];
                        return (
                          <div key={c.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n;});return;}saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("memo");}}
                            style={{padding:"0.75rem 1rem",cursor:"pointer",borderTop:i>0?`1px solid ${C.borderLight}`:"none",background:bulkSelected.has(c.id)?"#eff6ff":"white",display:"flex",alignItems:"flex-start",gap:"0.5rem",transition:"background 0.1s"}}
                            onMouseEnter={e=>{if(!bulkSelected.has(c.id))e.currentTarget.style.background=C.bg;}}
                            onMouseLeave={e=>{if(!bulkSelected.has(c.id))e.currentTarget.style.background="white";}}>
                            {bulkMode&&<input type="checkbox" checked={bulkSelected.has(c.id)} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0,marginTop:2}}/>}
                            <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.2rem"}}>
                              <span style={{fontWeight:700,fontSize:"0.9rem",color:C.text,flex:1}}>{c.name}</span>
                              <AssigneeRow ids={c.assigneeIds}/>
                            </div>
                            {(c.phone||c.email)&&<div style={{fontSize:"0.68rem",color:C.textMuted,marginBottom:"0.15rem"}}>{c.phone||c.email}</div>}
                            {lastMemo&&<div style={{fontSize:"0.7rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {lastMemo.text}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen&&items.length===0&&(
                    <div style={{borderTop:`1px solid ${C.borderLight}`,padding:"0.75rem 1rem",fontSize:"0.78rem",color:C.textMuted,textAlign:"center"}}>なし</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {sheet==="addCompany"&&(
          <Sheet title="企業を追加" onClose={()=>setSheet(null)}>
            <FieldLbl label="企業名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
            <FieldLbl label="ステータス"><StatusPicker map={COMPANY_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
            <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
            <FieldLbl label="電話番号（任意）"><Input value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="000-0000-0000"/></FieldLbl>
            <FieldLbl label="メールアドレス（任意）"><Input value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} placeholder="example@mail.com"/></FieldLbl>
            <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
            <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:70}} placeholder="メモ、特記事項など"/></FieldLbl>
            <div style={{display:"flex",gap:"0.625rem"}}>
              <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
              <Btn style={{flex:2}} onClick={saveCompany} disabled={!form.name?.trim()}>追加する</Btn>
            </div>
          </Sheet>
        )}
        {sheet==="importCompany"&&(()=>{
          const preview=importPreview; const setPreview=setImportPreview;
          const err=importErr; const setErr=setImportErr;
          const handleFile=async(e)=>{
            const file=e.target.files?.[0]; if(!file)return;
            try{
              const text=await readFileAsText(file);
              const rows=parseCSV(text);
              // Skip header rows: find first row where col0 looks like a company name (not header text)
              const headerKeywords=["企業名","会社名","name","company"];
              const dataRows=rows.filter(r=>r[0]&&!headerKeywords.some(k=>r[0].toLowerCase().includes(k.toLowerCase())));
              const mapped=dataRows.map(r=>({
                name:r[0]?.trim()||"",
                status:Object.keys(COMPANY_STATUS).includes(r[1]?.trim())?r[1].trim():"未接触",
                assigneeName:r[2]?.trim()||"",
                notes:r[3]?.trim()||"",
                phone:r[4]?.trim()||"",
                email:r[5]?.trim()||"",
                address:r[6]?.trim()||"",
              })).filter(r=>r.name);
              setPreview(mapped); setErr("");
            }catch(e){setErr("ファイルの読み込みに失敗しました。CSVファイルを確認してください。");}
          };
          const doImport=()=>{
            if(!preview?.length)return;
            const existNames=new Set(companies.map(c=>(c.name||"").trim()));
            const toAdd=preview.filter(r=>r.name&&!existNames.has((r.name||"").trim())).map(r=>({
              id:Date.now()+Math.random(),
              name:(r.name||"").trim(), status:r.status||"未接触",
              phone:r.phone, email:r.email, address:r.address||"",
              assigneeIds:[], memos:r.notes?[{id:Date.now()+Math.random(),text:r.notes,userId:currentUser?.id,date:new Date().toISOString()}]:[],
              chat:[], createdAt:new Date().toISOString()
            }));
            save({...data,companies:[...companies,...toAdd]});
            setBulkDone({added:toAdd.length,dupes:preview.length-toAdd.length});
            setSheet("importDone");
          };
          return (
            <Sheet title="企業をインポート" onClose={()=>{setSheet(null);setImportPreview(null);setImportErr("");}}>
              {/* Download template */}
              <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:"#1d4ed8",marginBottom:"0.5rem"}}>📥 テンプレートをダウンロード</div>
                <div style={{fontSize:"0.75rem",color:"#3730a3",marginBottom:"0.625rem"}}>テンプレートに入力してCSV形式で保存後、アップロードしてください</div>
                <button onClick={()=>downloadCSV("企業インポートテンプレート.csv",
                  ["企業名 *","ステータス","担当者名","メモ","電話番号","メールアドレス","住所"],
                  [["株式会社サンプルA","商談中","田中太郎","来週再アポ予定","03-1234-5678","tanaka@sample.co.jp","東京都千代田区〇〇1-2-3"],
                   ["サンプル商事B","電話済","鈴木花子","","06-9876-5432","","大阪府大阪市〇〇2-3-4"],
                   ["","","","","","",""]])}
                  style={{background:"#2563eb",border:"none",borderRadius:"0.625rem",color:"white",fontWeight:700,fontSize:"0.78rem",padding:"0.45rem 0.875rem",cursor:"pointer",fontFamily:"inherit"}}>
                  ⬇️ CSVテンプレートをダウンロード
                </button>
              </div>
              {/* Upload */}
              <div style={{marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.5rem"}}>📤 CSVファイルをアップロード</div>
                <label style={{display:"block",border:`2px dashed ${C.border}`,borderRadius:"0.875rem",padding:"1.25rem",textAlign:"center",cursor:"pointer",background:C.bg}}>
                  <div style={{fontSize:"1.5rem",marginBottom:"0.35rem"}}>📂</div>
                  <div style={{fontSize:"0.8rem",fontWeight:600,color:C.textSub}}>クリックしてCSVを選択</div>
                  <div style={{fontSize:"0.7rem",color:C.textMuted,marginTop:"0.2rem"}}>UTF-8 / Shift-JIS 両対応 (.csv)</div>
                  <input type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}}/>
                </label>
                {err&&<div style={{marginTop:"0.5rem",fontSize:"0.78rem",color:"#dc2626",background:"#fff1f2",borderRadius:"0.5rem",padding:"0.5rem 0.75rem"}}>{err}</div>}
              </div>
              {/* Preview */}
              {preview&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
                    <span style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>プレビュー</span>
                    <span style={{background:"#d1fae5",color:"#065f46",borderRadius:999,fontSize:"0.7rem",fontWeight:700,padding:"0.1rem 0.5rem"}}>{preview.length}件</span>
                    <span style={{fontSize:"0.7rem",color:C.textMuted}}>既存と重複する場合はスキップ</span>
                  </div>
                  <div style={{maxHeight:220,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:"0.75rem",overflow:"hidden"}}>
                    {preview.slice(0,20).map((r,i)=>{
                      const dup=companies.some(c=>c.name===r.name);
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",padding:"0.5rem 0.75rem",borderBottom:`1px solid ${C.borderLight}`,background:dup?"#fef9c3":"white",gap:"0.5rem"}}>
                          <span style={{flex:1,fontSize:"0.82rem",fontWeight:600,color:C.text}}>{r.name}</span>
                          <span style={{fontSize:"0.68rem",background:COMPANY_STATUS[r.status]?.bg||C.bg,color:COMPANY_STATUS[r.status]?.color||C.textMuted,borderRadius:999,padding:"0.1rem 0.4rem",fontWeight:700}}>{r.status}</span>
                          {dup&&<span style={{fontSize:"0.65rem",color:"#92400e",background:"#fef3c7",borderRadius:999,padding:"0.1rem 0.35rem"}}>重複</span>}
                        </div>
                      );
                    })}
                    {preview.length>20&&<div style={{padding:"0.5rem",textAlign:"center",fontSize:"0.75rem",color:C.textMuted}}>...他{preview.length-20}件</div>}
                  </div>
                  <div style={{display:"flex",gap:"0.625rem",marginTop:"0.75rem"}}>
                    <Btn variant="secondary" style={{flex:1}} onClick={()=>setPreview(null)}>クリア</Btn>
                    <Btn style={{flex:2}} onClick={doImport} disabled={!preview.filter(r=>!companies.some(c=>c.name===r.name)).length}>
                      {preview.filter(r=>!companies.some(c=>c.name===r.name)).length}件をインポート
                    </Btn>
                  </div>
                </div>
              )}
            </Sheet>
          );
        })()}
        {sheet==="importDone"&&(
          <Sheet title="インポート完了" onClose={()=>setSheet(null)}>
            <div style={{textAlign:"center",padding:"1.5rem 0"}}>
              <div style={{fontSize:"3rem",marginBottom:"0.5rem"}}>✅</div>
              <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>{bulkDone?.added||0}件を登録しました</div>
              {bulkDone?.dupes>0&&<div style={{fontSize:"0.82rem",color:C.textMuted,marginTop:"0.35rem"}}>{bulkDone.dupes}件は重複のためスキップ</div>}
            </div>
            <Btn style={{width:"100%"}} onClick={()=>setSheet(null)}>閉じる</Btn>
          </Sheet>
        )}
      </div>
    );
  }

  // ── 業者タブ ──────────────────────────────────────────────────────────────
  if(salesTab==="vendor"){
    if(activeVendor){
      const v=vendorOf(activeVendor);
      if(!v){setActiveVendor(null);return null;}
      const vmunis=vendorMunis(v);
      const vendChatUnread=(data.notifications||[]).filter(n=>n.toUserId===currentUser?.id&&!n.read&&n.type==="mention"&&n.entityId===v.id).length;
      return (
        <div>
          <div style={{display:"flex",alignItems:"center",marginBottom:"1rem",gap:"0.5rem"}}>
            <button onClick={()=>{
              if(prevTab?.tab==="muni"){setSalesTab("muni");setActiveMuni(prevTab.muniId);setActivePref(prevTab.prefId);setMuniScreen("muniDetail");setPrevTab(null);}
              else {setActiveVendor(null);restoreSalesScroll("vendor");}
            }} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0}}>
              ‹ {prevTab?.tab==="muni"?(muniOf(prevTab.muniId)?.name||"自治体"):"一覧"}
            </button>
            <span style={{flex:1}}/>
          </div>
          <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.75rem"}}>
              <div>
                <div style={{fontSize:"1.15rem",fontWeight:800,color:C.text}}>{v.name}</div>
                <div style={{marginTop:"0.35rem"}}><SChip s={v.status} map={VENDOR_STATUS}/></div>
              </div>
              <button onClick={()=>{setForm({...v});setSheet("editVendor");}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.625rem",padding:"0.35rem 0.625rem",cursor:"pointer",fontSize:"0.82rem",color:C.textSub}}>✏️</button>
            </div>
            {vmunis.length>0&&(
              <div style={{marginBottom:"0.5rem"}}>
                <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.3rem"}}>許可エリア</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.25rem"}}>{vmunis.map(m=><span key={m.id} style={{fontSize:"0.7rem",background:C.accentBg,color:C.accentDark,padding:"0.1rem 0.4rem",borderRadius:999,fontWeight:600}}>{m.name}</span>)}</div>
              </div>
            )}
            <AssigneeRow ids={v.assigneeIds}/>
            {v.address&&<div style={{fontSize:"0.78rem",color:C.textSub,marginTop:"0.4rem"}}>📍 {v.address}</div>}
          </Card>
          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ステータス変更</div>
            <StatusPicker map={VENDOR_STATUS} value={v.status} onChange={s=>{
              let nd={...data,vendors:vendors.map(x=>x.id===v.id?{...x,status:s}:x)};
              nd=addChangeLog(nd,{entityType:"業者",entityId:v.id,entityName:v.name,field:"ステータス",oldVal:v.status,newVal:s});
              save(nd);
            }}/>
          </div>
          {/* 削除ボタン */}
          <div style={{marginBottom:"0.75rem",display:"flex",justifyContent:"flex-end"}}>
            <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm(`${v.name}を削除しますか？`))deleteVendor(v.id);}}>🗑 削除</Btn>
          </div>
          {/* Sub-tabs: メモ・チャット・タスク */}
          <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
            {[["memo","📝","メモ"],["chat","💬","チャット"],["tasks","✅","タスク"],["files","📎","ファイル"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&vendChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{vendChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===v.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>
          {activeDetail==="memo"&&MemoSection({memos:v.memos,entityKey:"vendors",entityId:v.id})}
          {activeDetail==="chat"&&ChatSection({chat:v.chat,entityKey:"vendors",entityId:v.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="業者" entityId={v.id} entityName={v.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/>}
          {activeDetail==="files"&&<FileSection files={v.files||[]} currentUserId={currentUser?.id}
            onAdd={f=>addFileToEntity("vendors",v.id,f)}
            onDelete={fid=>removeFileFromEntity("vendors",v.id,fid)}/>}
          {sheet==="editVendor"&&(
            <Sheet title="業者を編集" onClose={()=>setSheet(null)}>
              <FieldLbl label="業者名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
              <FieldLbl label="ステータス"><StatusPicker map={VENDOR_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
              <FieldLbl label="許可エリア（自治体）">
                <MuniPicker ids={form.municipalityIds||[]} onChange={ids=>setForm({...form,municipalityIds:ids})}/>
              </FieldLbl>
              <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
              <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
              <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:70}}/></FieldLbl>
              <div style={{display:"flex",gap:"0.625rem"}}>
                <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
                <Btn style={{flex:2}} onClick={saveVendor} disabled={!form.name?.trim()}>保存</Btn>
              </div>
            </Sheet>
          )}
        </div>
      );
    }
    // Vendor list - grouped by status
    const normVSearch = s => (s||"").replace(/[\s\u3000]/g,"").toLowerCase();
    const searchedVendors = vendSearch ? vendors.filter(v=>normVSearch(v.name).includes(normVSearch(vendSearch))) : null;
    return (
      <div>
        <TopTabs/>
        <BulkBar statusMap={VENDOR_STATUS} applyFn={applyBulkVend}/>
        <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.75rem",alignItems:"center"}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",left:"0.625rem",top:"50%",transform:"translateY(-50%)",color:C.textMuted,fontSize:"0.85rem",pointerEvents:"none"}}>🔍</span>
            <input value={vendSearch} onChange={e=>setVendSearch(e.target.value)} placeholder="業者名で検索"
              style={{width:"100%",padding:"0.5rem 0.5rem 0.5rem 2rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button onClick={()=>setBulkMode(v=>{if(v){resetBulk();return false;}setBulkSelected(new Set());return true;})}
            style={{padding:"0.45rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${bulkMode?"#2563eb":C.border}`,background:bulkMode?"#eff6ff":"white",color:bulkMode?"#1d4ed8":C.textSub,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>☑️</button>
          <button onClick={()=>setSheet("importVendor")}
            style={{padding:"0.45rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>📥</button>
          <Btn size="sm" onClick={()=>{setForm({status:"未接触",municipalityIds:[],assigneeIds:[]});setSheet("addVendor");}}>＋</Btn>
        </div>
        {vendors.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 1rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
            <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>🔧</div>
            <div style={{fontSize:"0.85rem",fontWeight:600,marginBottom:"0.25rem"}}>業者が登録されていません</div>
            <div style={{fontSize:"0.78rem"}}>「＋」から追加してください</div>
          </div>
        )}
        {/* Search results: flat */}
        {vendSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {(searchedVendors||[]).map(v=>{
              const vmunis2=vendorMunis(v);
              const lastMemo=(v.memos||[]).slice(-1)[0];
              return (
                <div key={v.id} onClick={()=>{saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("memo");}}
                  style={{background:"white",border:`1.5px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.875rem 1rem",cursor:"pointer",boxShadow:C.shadow}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.3rem"}}>
                    <span style={{fontWeight:700,fontSize:"0.93rem",color:C.text,flex:1}}>{v.name}</span>
                    <SChip s={v.status} map={VENDOR_STATUS}/>
                  </div>
                  {vmunis2.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"0.2rem",marginBottom:"0.2rem"}}>{vmunis2.slice(0,3).map(m=><span key={m.id} style={{fontSize:"0.62rem",background:C.accentBg,color:C.accentDark,padding:"0.05rem 0.35rem",borderRadius:999}}>{m.name}</span>)}{vmunis2.length>3&&<span style={{fontSize:"0.62rem",color:C.textMuted}}>+{vmunis2.length-3}</span>}</div>}
                  {lastMemo&&<div style={{fontSize:"0.7rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {lastMemo.text}</div>}
                </div>
              );
            })}
            {!searchedVendors?.length&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,fontSize:"0.85rem"}}>該当する業者がありません</div>}
          </div>
        )}
        {/* Grouped view */}
        {!vendSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.625rem"}}>
            {Object.entries(VENDOR_STATUS).map(([s,meta])=>{
              const items=vendors.filter(v=>v.status===s);
              const isOpen=openVendGrp.has(s);
              return (
                <div key={s} style={{background:"white",borderRadius:"0.875rem",border:`1.5px solid ${C.border}`,overflow:"hidden",boxShadow:C.shadow}}>
                  <button onClick={()=>toggleGrp(setOpenVendGrp,s)}
                    style={{width:"100%",display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.75rem 1rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:meta.color,flexShrink:0,display:"inline-block"}}/>
                    <span style={{fontWeight:800,fontSize:"0.88rem",color:C.text,flex:1}}>{s}</span>
                    <span style={{fontSize:"0.75rem",fontWeight:700,color:C.textMuted,background:C.bg,borderRadius:999,padding:"0.1rem 0.5rem"}}>{items.length}</span>
                    <span style={{fontSize:"0.75rem",color:C.textMuted,transition:"transform 0.2s",display:"inline-block",transform:isOpen?"rotate(0deg)":"rotate(-90deg)"}}>▼</span>
                  </button>
                  {isOpen&&items.length>0&&(
                    <div style={{borderTop:`1px solid ${C.borderLight}`}}>
                      {items.map((v,i)=>{
                        const vmunis2=vendorMunis(v);
                        const lastMemo=(v.memos||[]).slice(-1)[0];
                        return (
                          <div key={v.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(v.id)?n.delete(v.id):n.add(v.id);return n;});return;}saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("memo");}}
                            style={{padding:"0.75rem 1rem",cursor:"pointer",borderTop:i>0?`1px solid ${C.borderLight}`:"none",background:bulkSelected.has(v.id)?"#eff6ff":"white",display:"flex",alignItems:"flex-start",gap:"0.5rem",transition:"background 0.1s"}}
                            onMouseEnter={e=>{if(!bulkSelected.has(v.id))e.currentTarget.style.background=C.bg;}}
                            onMouseLeave={e=>{if(!bulkSelected.has(v.id))e.currentTarget.style.background="white";}}>
                            {bulkMode&&<input type="checkbox" checked={bulkSelected.has(v.id)} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0,marginTop:2}}/>}
                            <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.2rem"}}>
                              <span style={{fontWeight:700,fontSize:"0.9rem",color:C.text,flex:1}}>{v.name}</span>
                              <AssigneeRow ids={v.assigneeIds}/>
                            </div>
                            {vmunis2.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"0.2rem",marginBottom:"0.2rem"}}>{vmunis2.slice(0,3).map(m=><span key={m.id} style={{fontSize:"0.62rem",background:C.accentBg,color:C.accentDark,padding:"0.05rem 0.35rem",borderRadius:999}}>{m.name}</span>)}{vmunis2.length>3&&<span style={{fontSize:"0.62rem",color:C.textMuted}}>+{vmunis2.length-3}</span>}</div>}
                            {lastMemo&&<div style={{fontSize:"0.7rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {lastMemo.text}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen&&items.length===0&&(
                    <div style={{borderTop:`1px solid ${C.borderLight}`,padding:"0.75rem 1rem",fontSize:"0.78rem",color:C.textMuted,textAlign:"center"}}>なし</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {sheet==="addVendor"&&(
          <Sheet title="業者を追加" onClose={()=>setSheet(null)}>
            <FieldLbl label="業者名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
            <FieldLbl label="ステータス"><StatusPicker map={VENDOR_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
            <FieldLbl label="許可エリア（自治体）">
              <MuniPicker ids={form.municipalityIds||[]} onChange={ids=>setForm({...form,municipalityIds:ids})}/>
            </FieldLbl>
            <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
            <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
            <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:60}}/></FieldLbl>
            <div style={{display:"flex",gap:"0.625rem"}}>
              <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
              <Btn style={{flex:2}} onClick={saveVendor} disabled={!form.name?.trim()}>追加する</Btn>
            </div>
          </Sheet>
        )}
        {sheet==="importVendor"&&(()=>{
          const preview=importPreview; const setPreview=setImportPreview;
          const err=importErr; const setErr=setImportErr;
          const handleFile=async(e)=>{
            const file=e.target.files?.[0]; if(!file)return;
            try{
              const text=await readFileAsText(file);
              const rows=parseCSV(text);
              const skip=["業者名","名前","name","vendor"];
              const dataRows=rows.filter(r=>r[0]&&!skip.some(k=>r[0].toLowerCase().includes(k.toLowerCase())));
              const mapped=dataRows.map(r=>({
                name:r[0]?.trim()||"",
                status:Object.keys(VENDOR_STATUS).includes(r[1]?.trim())?r[1].trim():"未接触",
                prefName:r[2]?.trim()||"",
                muniNames:(r[3]?.trim()||"").split(",").map(s=>s.trim()).filter(Boolean),
                assigneeName:r[4]?.trim()||"",
                phone:r[5]?.trim()||"",
                notes:r[6]?.trim()||"",
                address:r[7]?.trim()||"",
              })).filter(r=>r.name);
              setPreview(mapped); setErr("");
            }catch(e){setErr("ファイルの読み込みに失敗しました。");}
          };
          const doImport=()=>{
            if(!preview?.length)return;
            const existNames=new Set(vendors.map(v=>(v.name||"").trim()));
            const toAdd=preview.filter(r=>!existNames.has(r.name)).map(r=>{
              // Resolve municipality IDs from names
              const mids=r.muniNames.map(mn=>munis.find(m=>m.name===mn)?.id).filter(Boolean);
              return {
                id:Date.now()+Math.random(),
                name:r.name, status:r.status||"未接触",
                phone:r.phone||"",
                municipalityIds:mids, assigneeIds:[],
                address:r.address||"",
                memos:r.notes?[{id:Date.now()+Math.random(),text:r.notes,userId:currentUser?.id,date:new Date().toISOString()}]:[],
                chat:[], createdAt:new Date().toISOString()
              };
            });
            save({...data,vendors:[...vendors,...toAdd]});
            setBulkDone({added:toAdd.length,dupes:preview.length-toAdd.length});
            setSheet("importDone");
          };
          return (
            <Sheet title="業者をインポート" onClose={()=>{setSheet(null);setImportPreview(null);setImportErr("");}}>
              <div style={{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:"#5b21b6",marginBottom:"0.5rem"}}>📥 テンプレートをダウンロード</div>
                <div style={{fontSize:"0.75rem",color:"#6d28d9",marginBottom:"0.625rem"}}>テンプレートに入力してCSV形式で保存後、アップロードしてください</div>
                <button onClick={()=>downloadCSV("業者インポートテンプレート.csv",
                  ["業者名 *","ステータス","都道府県","自治体名（複数はカンマ区切り）","担当者名","電話番号","メモ","住所"],
                  [["株式会社クリーンA","加入済","福岡県","福岡市,北九州市","山田一郎","092-111-2222","","福岡県福岡市〇〇1-2-3"],
                   ["環境サービスB","商談中","東京都","新宿区","","","来月契約予定",""],
                   ["","","","","","","",""]])}
                  style={{background:"#7c3aed",border:"none",borderRadius:"0.625rem",color:"white",fontWeight:700,fontSize:"0.78rem",padding:"0.45rem 0.875rem",cursor:"pointer",fontFamily:"inherit"}}>
                  ⬇️ CSVテンプレートをダウンロード
                </button>
              </div>
              <div style={{marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.5rem"}}>📤 CSVファイルをアップロード</div>
                <label style={{display:"block",border:`2px dashed ${C.border}`,borderRadius:"0.875rem",padding:"1.25rem",textAlign:"center",cursor:"pointer",background:C.bg}}>
                  <div style={{fontSize:"1.5rem",marginBottom:"0.35rem"}}>📂</div>
                  <div style={{fontSize:"0.8rem",fontWeight:600,color:C.textSub}}>クリックしてCSVを選択</div>
                  <input type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}}/>
                </label>
                {err&&<div style={{marginTop:"0.5rem",fontSize:"0.78rem",color:"#dc2626",background:"#fff1f2",borderRadius:"0.5rem",padding:"0.5rem 0.75rem"}}>{err}</div>}
              </div>
              {preview&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
                    <span style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>プレビュー</span>
                    <span style={{background:"#d1fae5",color:"#065f46",borderRadius:999,fontSize:"0.7rem",fontWeight:700,padding:"0.1rem 0.5rem"}}>{preview.length}件</span>
                  </div>
                  <div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:"0.75rem",overflow:"hidden"}}>
                    {preview.slice(0,20).map((r,i)=>{
                      const dup=vendors.some(v=>v.name===r.name);
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",padding:"0.5rem 0.75rem",borderBottom:`1px solid ${C.borderLight}`,background:dup?"#fef9c3":"white",gap:"0.5rem"}}>
                          <span style={{flex:1,fontSize:"0.82rem",fontWeight:600}}>{r.name}</span>
                          <span style={{fontSize:"0.68rem",background:VENDOR_STATUS[r.status]?.bg||C.bg,color:VENDOR_STATUS[r.status]?.color||C.textMuted,borderRadius:999,padding:"0.1rem 0.4rem",fontWeight:700}}>{r.status}</span>
                          {r.muniNames.length>0&&<span style={{fontSize:"0.65rem",color:C.textMuted}}>{r.muniNames.join("・")}</span>}
                          {dup&&<span style={{fontSize:"0.65rem",color:"#92400e",background:"#fef3c7",borderRadius:999,padding:"0.1rem 0.35rem"}}>重複</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",gap:"0.625rem",marginTop:"0.75rem"}}>
                    <Btn variant="secondary" style={{flex:1}} onClick={()=>setPreview(null)}>クリア</Btn>
                    <Btn style={{flex:2}} onClick={doImport} disabled={!preview.filter(r=>!vendors.some(v=>v.name===r.name)).length}>
                      {preview.filter(r=>!vendors.some(v=>v.name===r.name)).length}件をインポート
                    </Btn>
                  </div>
                </div>
              )}
            </Sheet>
          );
        })()}
      </div>
    );
  }

  // ── 自治体タブ ────────────────────────────────────────────────────────────
  if(activeMuni&&muniScreen==="muniDetail"){
    const muni=muniOf(activeMuni);
    if(!muni){setActiveMuni(null);setMuniScreen("top");return null;}
    const pref=prefOf(muni.prefectureId);
    const mvend=muniVendors(activeMuni);
    const joined=mvend.filter(v=>v.status==="加入済").length;
    const ds=DUSTALK_STATUS[muni.dustalk]||DUSTALK_STATUS["未展開"];
    const muniChatUnread=(data.notifications||[]).filter(n=>n.toUserId===currentUser?.id&&!n.read&&n.type==="mention"&&n.entityId===muni.id).length;
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",marginBottom:"1rem",gap:"0.5rem"}}>
          <button onClick={()=>{setMuniScreen("top");setActiveMuni(null);restoreSalesScroll("muni");}} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0}}>‹ {pref?.name||"一覧"}</button>
          <span style={{flex:1}}/>
        </div>
        <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.875rem"}}>
            <div>
              <div style={{fontSize:"1.15rem",fontWeight:800,color:C.text}}>{muni.name}</div>
              <div style={{fontSize:"0.75rem",color:C.textSub,marginTop:"0.15rem"}}>{pref?.name}</div>
            </div>
            <button onClick={()=>{setForm({...muni});setSheet("editMuni");}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.625rem",padding:"0.35rem 0.625rem",cursor:"pointer",fontSize:"0.82rem",color:C.textSub}}>✏️</button>
          </div>
          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.35rem",marginBottom:"0.875rem"}}>
            {[["業者数",mvend.length,"#2563eb"],["加入済",joined,"#059669"],["断り",mvend.filter(v=>v.status==="断り").length,"#dc2626"],["商談中",mvend.filter(v=>v.status==="商談中").length,"#d97706"]].map(([l,n,c])=>(
              <div key={l} style={{background:C.bg,borderRadius:"0.5rem",padding:"0.4rem",textAlign:"center"}}>
                <div style={{fontSize:"0.58rem",color:C.textMuted}}>{l}</div>
                <div style={{fontSize:"1rem",fontWeight:800,color:c}}>{n}</div>
              </div>
            ))}
          </div>
          {/* Key badges */}
          <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{padding:"0.2rem 0.5rem",borderRadius:999,fontSize:"0.7rem",fontWeight:700,background:ds.bg,color:ds.color}}>{ds.icon} {muni.dustalk||"未展開"}</div>
            {(()=>{const ts=TREATY_STATUS[muni.treatyStatus];return ts?<span style={{padding:"0.2rem 0.5rem",borderRadius:999,fontSize:"0.7rem",fontWeight:700,background:ts.bg,color:ts.color}}>🤝 {muni.treatyStatus}</span>:null;})()}
            <SChip s={muni.status||"未接触"} map={MUNI_STATUS}/>
            {muni.updatedAt&&<span style={{fontSize:"0.7rem",color:C.textMuted,marginLeft:"0.4rem"}}>更新：{muni.updatedAt}</span>}
          </div>
          {muni.artBranch&&<div style={{marginTop:"0.5rem",fontSize:"0.75rem",color:C.textSub}}>🏢 アート引越センター 管轄支店：{muni.artBranch}</div>}
          {muni.address&&<div style={{marginTop:"0.35rem",fontSize:"0.75rem",color:C.textSub}}>📍 {muni.address}</div>}
          {(muni.assigneeIds||[]).length>0&&<div style={{marginTop:"0.5rem"}}><AssigneeRow ids={muni.assigneeIds}/></div>}
        </Card>
        {/* Quick change dustalk + treaty */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1rem"}}>
          <div>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ダストーク展開</div>
            <DustalkPicker value={muni.dustalk||"未展開"} onChange={s=>{
              let nd={...data,municipalities:munis.map(m=>m.id===activeMuni?{...m,dustalk:s}:m)};
              nd=addChangeLog(nd,{entityType:"自治体",entityId:muni.id,entityName:muni.name,field:"ダストーク",oldVal:muni.dustalk,newVal:s});
              save(nd);
            }}/>

          </div>
          <div>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>連携協定</div>
            <TreatyPicker value={muni.treatyStatus||"未接触"} onChange={s=>{
              let nd={...data,municipalities:munis.map(m=>m.id===activeMuni?{...m,treatyStatus:s}:m)};
              nd=addChangeLog(nd,{entityType:"自治体",entityId:muni.id,entityName:muni.name,field:"連携協定",oldVal:muni.treatyStatus,newVal:s});
              save(nd);
            }}/>
          </div>
        </div>
        {/* 業者一覧（常時表示） */}
        <div style={{marginBottom:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
            <span style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em"}}>業者一覧</span>
            <div style={{display:"flex",gap:"0.35rem"}}>
              <Btn size="sm" variant="secondary" onClick={()=>{setLinkVendorSearch("");setSheet("linkVendor");}}>🔗 紐付け</Btn>
              <Btn size="sm" onClick={()=>{setForm({municipalityIds:[activeMuni],status:"未接触",assigneeIds:[]});setSalesTab("vendor");setActiveVendor(null);setSheet("addVendorFromMuni");}}>＋ 新規</Btn>
            </div>
          </div>
          {mvend.length===0&&<div style={{textAlign:"center",padding:"1rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem"}}>業者が登録されていません</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
            {mvend.map(v=>(
              <div key={v.id} onClick={()=>{setPrevTab({tab:"muni",muniId:activeMuni,prefId:activePref});setSalesTab("vendor");setActiveVendor(v.id);setActiveDetail("memo");}}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.625rem 0.875rem",background:"white",border:`1.5px solid ${C.border}`,borderRadius:"0.75rem",cursor:"pointer",gap:"0.5rem"}}>
                <span style={{fontWeight:600,fontSize:"0.88rem",color:C.text,flex:1}}>{v.name}</span>
                <SChip s={v.status} map={VENDOR_STATUS}/>
              </div>
            ))}
          </div>
        </div>
        {/* Sub-tabs: メモ・チャット・タスク */}
        <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
          {[["memo","📝","メモ"],["chat","💬","チャット"],["tasks","✅","タスク"]].map(([id,icon,lbl])=>(
            <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.78rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
              {icon} {lbl}
              {id==="chat"&&muniChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{muniChatUnread}</span>}
              {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===muni.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
            </button>
          ))}
        </div>
        {activeDetail==="memo"&&MemoSection({memos:muni.memos,entityKey:"municipalities",entityId:muni.id})}
        {activeDetail==="chat"&&ChatSection({chat:muni.chat,entityKey:"municipalities",entityId:muni.id})}
        {activeDetail==="tasks"&&<SalesTaskPanel entityType="自治体" entityId={muni.id} entityName={muni.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/>}
        {activeDetail==="files"&&<FileSection files={muni.files||[]} currentUserId={currentUser?.id}
          onAdd={f=>addFileToEntity("municipalities",muni.id,f)}
          onDelete={fid=>removeFileFromEntity("municipalities",muni.id,fid)}/>}
        <div style={{marginTop:"1rem"}}>
          <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm(`${muni.name}を削除しますか？`))deleteMuni(muni.id);}}>🗑 自治体を削除</Btn>
        </div>
        {/* 展開済み自治体 CSV出力 */}
        {sheet===null&&salesTab==="muni"&&munis.filter(m=>m.dustalk==="展開").length>0&&(
          <div style={{marginBottom:"0.5rem",textAlign:"right"}}>
            <button onClick={()=>{
              const rows=munis.filter(m=>m.dustalk==="展開").map(m=>{
                const pref=PREFECTURES.find(p=>p.id===m.prefectureId);
                return [pref?.name||"",m.name,m.status||"",m.dustalk||"",m.treatyStatus||"",m.updatedAt||"",m.notes||""];
              });
              downloadCSV("展開済み自治体.csv",["都道府県","自治体名","ステータス","ダストーク展開","連携協定","更新日","備考"],rows);
            }} style={{padding:"0.35rem 0.75rem",borderRadius:"0.625rem",border:"1.5px solid #059669",background:"#d1fae5",color:"#059669",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>
              📥 展開済みCSV出力 ({munis.filter(m=>m.dustalk==="展開").length}件)
            </button>
          </div>
        )}
        {sheet==="editMuni"&&(
          <Sheet title="自治体を編集" onClose={()=>setSheet(null)}>
            <FieldLbl label="自治体名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
            <FieldLbl label="ステータス"><StatusPicker map={MUNI_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
            <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
            <FieldLbl label="展開ステータス（ダストーク）"><DustalkPicker value={form.dustalk||"未展開"} onChange={s=>setForm({...form,dustalk:s})}/></FieldLbl>
            <FieldLbl label="アート引越センター 管轄支店"><Input value={form.artBranch||""} onChange={e=>setForm({...form,artBranch:e.target.value})} placeholder="例：福岡支店"/></FieldLbl>
            <FieldLbl label="連携協定ステータス"><TreatyPicker value={form.treatyStatus||"未接触"} onChange={s=>setForm({...form,treatyStatus:s})}/></FieldLbl>
            <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
            <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:70}} placeholder="メモ、特記事項など"/></FieldLbl>
            <FieldLbl label="更新日（任意）"><Input type="date" value={form.updatedAt||""} onChange={e=>setForm({...form,updatedAt:e.target.value})}/></FieldLbl>
            <div style={{display:"flex",gap:"0.625rem"}}>
              <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
              <Btn style={{flex:2}} onClick={saveMuni} disabled={!form.name?.trim()}>保存</Btn>
            </div>
          </Sheet>
        )}
        {sheet==="addVendorFromMuni"&&(
          <Sheet title="業者を追加" onClose={()=>{setSheet(null);setSalesTab("muni");}}>
            <FieldLbl label="業者名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
            <FieldLbl label="ステータス"><StatusPicker map={VENDOR_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
            <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
            <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
            <FieldLbl label="備考"><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} style={{height:70}} placeholder="メモ、特記事項など"/></FieldLbl>
            <div style={{display:"flex",gap:"0.625rem"}}>
              <Btn variant="secondary" style={{flex:1}} onClick={()=>{setSheet(null);setSalesTab("muni");}}>キャンセル</Btn>
              <Btn style={{flex:2}} onClick={()=>{saveVendor();setSalesTab("muni");}} disabled={!form.name?.trim()}>追加する</Btn>
            </div>
          </Sheet>
        )}
        {sheet==="linkVendor"&&(()=>{
          const already=mvend.map(v=>v.id);
          const linkable=vendors.filter(v=>!already.includes(v.id)&&((v.name||"").includes(linkVendorSearch)||!linkVendorSearch));
          const doLink=(vid)=>{
            save({...data,vendors:vendors.map(v=>v.id===vid?{...v,municipalityIds:[...(v.municipalityIds||[]),activeMuni]}:v)});
            setSheet(null);
          };
          return (
            <Sheet title="既存業者を紐付け" onClose={()=>setSheet(null)}>
              <Input value={linkVendorSearch} onChange={e=>setLinkVendorSearch(e.target.value)} placeholder="業者名で絞り込み" style={{marginBottom:"0.75rem"}}/>
              <div style={{display:"flex",flexDirection:"column",gap:"0.35rem",maxHeight:300,overflowY:"auto"}}>
                {linkable.length===0&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,fontSize:"0.82rem"}}>紐付け可能な業者がありません</div>}
                {linkable.map(v=>(
                  <div key={v.id} style={{display:"flex",alignItems:"center",padding:"0.625rem 0.75rem",border:`1.5px solid ${C.border}`,borderRadius:"0.75rem",background:"white",gap:"0.5rem"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:"0.88rem",color:C.text}}>{v.name}</div>
                      <div style={{fontSize:"0.65rem",color:C.textMuted}}>{(v.municipalityIds||[]).map(id=>muniOf(id)?.name).filter(Boolean).join("・")||"未紐付け"}</div>
                    </div>
                    <SChip s={v.status} map={VENDOR_STATUS}/>
                    <button onClick={()=>doLink(v.id)}
                      style={{background:C.accent,border:"none",borderRadius:"0.5rem",color:"white",fontSize:"0.75rem",fontWeight:700,padding:"0.3rem 0.625rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>紐付け</button>
                  </div>
                ))}
              </div>
              <div style={{marginTop:"0.75rem"}}>
                <Btn variant="secondary" style={{width:"100%"}} onClick={()=>setSheet(null)}>閉じる</Btn>
              </div>
            </Sheet>
          );
        })()}
      </div>
    );
  }

  // ── 自治体トップビュー（地方→都道府県→自治体 折りたたみ）─────────────────
  // 一括変更ヘルパー
  return (
    <div>
      <TopTabs/>
      {/* Search row */}
      <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.625rem",alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <span style={{position:"absolute",left:"0.625rem",top:"50%",transform:"translateY(-50%)",color:C.textMuted,fontSize:"0.85rem",pointerEvents:"none"}}>🔍</span>
          <input value={muniTopSearch} onChange={e=>setMuniTopSearch(e.target.value)} placeholder="自治体名で検索"
            style={{width:"100%",padding:"0.5rem 0.5rem 0.5rem 2rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>{setBulkMode(v=>{if(v){resetBulk();return false;}setBulkSelected(new Set());setBulkTarget("dustalk");setBulkStatus("");return true;});}}
          style={{padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${bulkMode?"#2563eb":C.border}`,background:bulkMode?"#eff6ff":"white",color:bulkMode?"#1d4ed8":C.textSub,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>
          ☑️ 一括
        </button>
        <button onClick={()=>setSheet("importMuni")}
          style={{padding:"0.5rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>📥</button>
        <button onClick={()=>setShowGSheetImport(true)}
          style={{padding:"0.5rem 0.625rem",borderRadius:"0.75rem",border:"1.5px solid #bfdbfe",background:"#eff6ff",color:"#2563eb",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>📊 GSheet</button>
      </div>
      <BulkBar statusMap={MUNI_STATUS} applyFn={applyBulkMuni}
        extraFields={[["dustalk","ダストーク展開",DUSTALK_STATUS],["treatyStatus","連携協定",TREATY_STATUS],["status","アプローチ",MUNI_STATUS]]}/>
      {/* Global dustalk summary */}
      {munis.length>0&&!muniTopSearch&&(
        <Card style={{padding:"0.875rem",marginBottom:"1rem"}}>
          <div style={{fontSize:"0.68rem",fontWeight:800,color:C.textSub,marginBottom:"0.5rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>全国 ダストーク / 連携協定</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"0.3rem"}}>
            {Object.entries(DUSTALK_STATUS).map(([s,m])=>(
              <div key={s} style={{background:m.bg,borderRadius:"0.5rem",padding:"0.4rem 0.25rem",textAlign:"center"}}>
                <div style={{fontSize:"0.85rem"}}>{m.icon}</div>
                <div style={{fontSize:"0.95rem",fontWeight:800,color:m.color}}>{munis.filter(x=>x.dustalk===s).length}</div>
                <div style={{fontSize:"0.55rem",fontWeight:700,color:m.color}}>{s}</div>
              </div>
            ))}
            <div style={{background:"#d1fae5",borderRadius:"0.5rem",padding:"0.4rem 0.25rem",textAlign:"center"}}>
              <div style={{fontSize:"0.85rem"}}>🤝</div>
              <div style={{fontSize:"0.95rem",fontWeight:800,color:"#059669"}}>{munis.filter(x=>x.treatyStatus==="協定済").length}</div>
              <div style={{fontSize:"0.55rem",fontWeight:700,color:"#059669"}}>協定済</div>
            </div>
          </div>
        </Card>
      )}

      {/* Flat search results */}
      {muniTopSearch&&(()=>{
        const hits=munis.filter(m=>m.name.includes(muniTopSearch));
        return (
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {hits.length===0&&<div style={{textAlign:"center",padding:"2rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",fontSize:"0.85rem",border:`1.5px dashed ${C.border}`}}>「{muniTopSearch}」に一致する自治体はありません</div>}
            {hits.map(m=>{
              const pref=prefOf(m.prefectureId);
              const ds=DUSTALK_STATUS[m.dustalk]||DUSTALK_STATUS["未展開"];
              const mv=muniVendors(m.id);
              return (
                <div key={m.id} onClick={()=>{setActivePref(m.prefectureId);setActiveMuni(m.id);setMuniScreen("muniDetail");setActiveDetail("memo");}}
                  style={{background:"white",border:`1.5px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.875rem 1rem",cursor:"pointer",boxShadow:C.shadow}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.25rem"}}>
                    <div>
                      <span style={{fontWeight:700,fontSize:"0.93rem",color:C.text}}>{m.name}</span>
                      <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"0.4rem"}}>{pref?.name}</span>
                    </div>
                    <div style={{display:"flex",gap:"0.25rem",alignItems:"center"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:"0.15rem",alignItems:"flex-end"}}>
                        <span style={{padding:"0.1rem 0.4rem",borderRadius:999,fontSize:"0.65rem",fontWeight:700,background:ds.bg,color:ds.color,whiteSpace:"nowrap"}}>{ds.icon}{m.dustalk||"未展開"}</span>
                        {(()=>{const ts=TREATY_STATUS[m.treatyStatus||"未接触"];return ts?<span style={{fontSize:"0.6rem",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700,background:ts.bg,color:ts.color,whiteSpace:"nowrap"}}>🤝{m.treatyStatus||"未接触"}</span>:null;})()}
                      </div>
                    </div>
                  </div>
                  <div style={{fontSize:"0.72rem",color:C.textMuted}}>業者{mv.length}件</div>
                </div>
              );
            })}
          </div>
        );
      })()}
      {/* Hierarchy view */}
      {!muniTopSearch&&<div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
        {JAPAN_REGIONS.map(rg=>{
          const rOpen=openRegions[rg.region]!==false;
          const rPrefs=prefs.filter(p=>p.region===rg.region||(!p.region&&rg.prefs.includes(p.name)));
          const rMunis=rPrefs.flatMap(p=>munis.filter(m=>m.prefectureId===p.id));
          const rTreaty=rMunis.filter(m=>m.treatyStatus==="協定済").length;
          const rDeploy=rMunis.filter(m=>m.dustalk==="展開").length;
          return (
            <div key={rg.region} style={{background:"white",borderRadius:"1rem",border:`1.5px solid ${C.border}`,overflow:"hidden",boxShadow:C.shadow}}>
              <button onClick={()=>setOpenRegions(o=>({...o,[rg.region]:!rOpen}))}
                style={{width:"100%",display:"flex",alignItems:"center",padding:"0.8rem 1rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",gap:"0.5rem"}}>
                <span style={{fontSize:"0.93rem",fontWeight:800,color:C.text,flex:1,textAlign:"left"}}>{rg.region}</span>
                {rMunis.length>0&&(
                  <div style={{display:"flex",gap:"0.35rem",flexShrink:0}}>
                    <span style={{fontSize:"0.62rem",background:"#d1fae5",color:"#059669",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700}}>展開{rDeploy}</span>
                    {rTreaty>0&&<span style={{fontSize:"0.62rem",background:"#d1fae5",color:"#059669",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700}}>協定{rTreaty}</span>}
                    <span style={{fontSize:"0.62rem",color:C.textMuted}}>自治体{rMunis.length}</span>
                  </div>
                )}
                <span style={{fontSize:"0.75rem",color:C.textMuted,transform:rOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.2s",display:"inline-block",flexShrink:0}}>▼</span>
              </button>
              {rOpen&&rPrefs.length>0&&(
                <div style={{borderTop:`1px solid ${C.borderLight}`}}>
                  {rPrefs.map(pref=>{
                    const pOpen=openPrefs[pref.id]!==false;
                    const pMunis=munis.filter(m=>m.prefectureId===pref.id);
                    const pTreaty=pMunis.filter(m=>m.treatyStatus==="協定済").length;
                    const pDeploy=pMunis.filter(m=>m.dustalk==="展開").length;
                    return (
                      <div key={pref.id} style={{borderBottom:`1px solid ${C.borderLight}`}}>
                        <div style={{display:"flex",alignItems:"center",padding:"0.5rem 1rem 0.5rem 1.5rem",background:C.bg,gap:"0.5rem"}}>
                          <button onClick={()=>setOpenPrefs(o=>({...o,[pref.id]:!pOpen}))}
                            style={{flex:1,display:"flex",alignItems:"center",gap:"0.5rem",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0}}>
                            <span style={{fontSize:"0.85rem",fontWeight:700,color:C.text}}>{pref.name}</span>
                            {pMunis.length>0&&(
                              <div style={{display:"flex",gap:"0.25rem"}}>
                                <span style={{fontSize:"0.6rem",background:"#d1fae5",color:"#059669",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:700}}>展{pDeploy}</span>
                                {pTreaty>0&&<span style={{fontSize:"0.6rem",background:"#d1fae5",color:"#059669",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:700}}>協{pTreaty}</span>}
                                <span style={{fontSize:"0.6rem",color:C.textMuted}}>計{pMunis.length}</span>
                              </div>
                            )}
                            <span style={{fontSize:"0.7rem",color:C.textMuted,marginLeft:"auto",transform:pOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
                          </button>
                          <button onClick={e=>{e.stopPropagation();setActivePref(pref.id);setForm({prefectureId:pref.id,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:""});setSheet(`am_${pref.id}`);}}
                            style={{background:C.accent,border:"none",borderRadius:"0.4rem",color:"white",fontSize:"0.75rem",fontWeight:700,padding:"0.2rem 0.45rem",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>＋</button>
                        </div>
                        {pOpen&&(
                          <div>
                            {pMunis.length===0&&<div style={{padding:"0.5rem 1rem 0.5rem 2.5rem",fontSize:"0.75rem",color:C.textMuted}}>自治体が未登録です</div>}
                            {pMunis.map(m=>{
                              const ds2=DUSTALK_STATUS[m.dustalk]||DUSTALK_STATUS["未展開"];
                              const mv=muniVendors(m.id);
                              return (
                                <div key={m.id}
                                  onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(m.id)?n.delete(m.id):n.add(m.id);return n;});return;}setActivePref(pref.id);setActiveMuni(m.id);setMuniScreen("muniDetail");setActiveDetail("memo");}}
                                  style={{display:"flex",alignItems:"center",padding:"0.5rem 1rem 0.5rem 2.5rem",borderTop:`1px solid ${C.borderLight}`,cursor:"pointer",gap:"0.4rem",background:bulkSelected.has(m.id)?"#eff6ff":"transparent"}}>
                                  {bulkMode&&<input type="checkbox" checked={bulkSelected.has(m.id)} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0,cursor:"pointer"}}/>}
                                  <div style={{flex:1,minWidth:0}}>
                                    <span style={{fontSize:"0.85rem",fontWeight:600,color:C.text}}>{m.name}</span>
                                    <span style={{fontSize:"0.62rem",color:C.textMuted,marginLeft:"0.35rem"}}>業者{mv.length}</span>
                                  </div>
                                  <div style={{display:"flex",flexDirection:"column",gap:"0.15rem",alignItems:"flex-end",flexShrink:0}}>
                                    <span style={{padding:"0.1rem 0.4rem",borderRadius:999,fontSize:"0.6rem",fontWeight:700,background:ds2.bg,color:ds2.color,whiteSpace:"nowrap"}}>{ds2.icon}{m.dustalk||"未展開"}</span>
                                    {(()=>{const ts=TREATY_STATUS[m.treatyStatus||"未接触"];return ts?<span style={{fontSize:"0.58rem",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700,background:ts.bg,color:ts.color,whiteSpace:"nowrap"}}>🤝{m.treatyStatus||"未接触"}</span>:null;})()}
                                  </div>
                                  <span style={{color:C.textMuted,fontSize:"0.78rem",flexShrink:0}}>›</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Add muni sheet per pref */}
                        {sheet===`am_${pref.id}`&&(()=>{
                          const pm=munis.filter(m=>m.prefectureId===pref.id);
                          return (
                            <Sheet title={`自治体を追加（${pref.name}）`} onClose={()=>setSheet(null)}>
                              <FieldLbl label="自治体名 *">
                                <Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus
                                  onBlur={()=>{const d=checkDup(form.name||"",pm);setForm(f=>({...f,_dup:d||null}));}}/>
                                {form._dup&&<div style={{marginTop:"0.35rem",padding:"0.4rem 0.625rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"0.5rem",fontSize:"0.75rem",color:"#1d4ed8"}}>⚠️「{form._dup.name}」はすでに登録されています</div>}
                              </FieldLbl>
                              <FieldLbl label="ステータス"><StatusPicker map={MUNI_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
                              <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
                              <FieldLbl label="展開ステータス（ダストーク）"><DustalkPicker value={form.dustalk||"未展開"} onChange={s=>setForm({...form,dustalk:s})}/></FieldLbl>
                              <FieldLbl label="アート引越センター 管轄支店"><Input value={form.artBranch||""} onChange={e=>setForm({...form,artBranch:e.target.value})} placeholder="例：福岡支店"/></FieldLbl>
                              <FieldLbl label="連携協定ステータス"><TreatyPicker value={form.treatyStatus||"未接触"} onChange={s=>setForm({...form,treatyStatus:s})}/></FieldLbl>
                              <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
                              <div style={{display:"flex",gap:"0.625rem"}}>
                                <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
                                <Btn style={{flex:2}} onClick={saveMuni} disabled={!form.name?.trim()}>追加する</Btn>
                              </div>
                            </Sheet>
                          );
                        })()}
                      </div>
                    );
                  })}
                  {/* Bulk import */}
                  {sheet==="bulkMuni"&&activePref&&(()=>{
                    const pn=prefOf(activePref)?.name||"";
                    return (
                      <Sheet title={`一括登録（${pn}）`} onClose={()=>setSheet(null)}>
                        <div style={{background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:"0.75rem",padding:"0.75rem",marginBottom:"0.875rem",fontSize:"0.8rem",color:C.accentDark}}>💡 自治体名を1行1件で入力してください。</div>
                        <FieldLbl label="自治体名リスト（1行1件）"><Textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} style={{height:180}} placeholder={"○○市\n△△町\n□□村"} autoFocus/></FieldLbl>
                        <div style={{marginBottom:"0.875rem",fontSize:"0.78rem",color:C.textSub}}>{bulkText.split("\n").filter(l=>l.trim()).length}件 入力中</div>
                        <div style={{display:"flex",gap:"0.625rem"}}>
                          <Btn variant="secondary" style={{flex:1}} onClick={()=>setSheet(null)}>キャンセル</Btn>
                          <Btn style={{flex:2}} onClick={runBulk} disabled={!bulkText.trim()}>一括登録する</Btn>
                        </div>
                      </Sheet>
                    );
                  })()}
                  {sheet==="bulkDone"&&(
                    <Sheet title="登録完了" onClose={()=>setSheet(null)}>
                      <div style={{textAlign:"center",padding:"1.5rem 0"}}>
                        <div style={{fontSize:"3rem",marginBottom:"0.625rem"}}>✅</div>
                        <div style={{fontWeight:800,color:C.text,marginBottom:"0.35rem"}}>登録完了！</div>
                        {bulkDone&&<div style={{fontSize:"0.85rem",color:C.textSub}}>{bulkDone.added}件追加{bulkDone.dupes>0?` / ${bulkDone.dupes}件重複確認済`:""}</div>}
                      </div>
                      <Btn style={{width:"100%"}} onClick={()=>setSheet(null)}>閉じる</Btn>
                    </Sheet>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>}
      {sheet==="importMuni"&&(()=>{
        const preview=importPreview; const setPreview=setImportPreview;
        const err=importErr; const setErr=setImportErr;
        const handleFile=async(e)=>{
          const file=e.target.files?.[0]; if(!file)return;
          try{
            const text=await readFileAsText(file);
            const rows=parseCSV(text);
            const skip=["都道府県","自治体名","prefecture","name"];
            const dataRows=rows.filter(r=>r[0]&&r[1]&&!skip.some(k=>r[0].toLowerCase().includes(k.toLowerCase())));
            const mapped=dataRows.map(r=>({
              prefName:r[0]?.trim()||"",
              name:r[1]?.trim()||"",
              dustalk:r[2]?.trim()==="展開"?"展開":"未展開",
              treatyStatus:Object.keys(TREATY_STATUS).includes(r[3]?.trim())?r[3].trim():"未接触",
              status:Object.keys(MUNI_STATUS).includes(r[4]?.trim())?r[4].trim():"未接触",
              artBranch:r[5]?.trim()||"",
              notes:r[7]?.trim()||"",
              address:r[8]?.trim()||"",
            })).filter(r=>r.name&&r.prefName);
            setPreview(mapped); setErr("");
          }catch(e){setErr("ファイルの読み込みに失敗しました。CSVファイルを確認してください。");}
        };
        const doImport=()=>{
          if(!preview?.length)return;
          const toAdd=[]; const skipped=[];
          preview.forEach(r=>{
            const pref=prefs.find(p=>p.name===r.prefName);
            if(!pref){skipped.push(r);return;}
            const dup=munis.some(m=>m.prefectureId===pref.id&&m.name===r.name);
            if(dup){skipped.push(r);return;}
            toAdd.push({
              id:Date.now()+Math.random(),
              prefectureId:pref.id,
              name:r.name, dustalk:r.dustalk,
              treatyStatus:r.treatyStatus, status:r.status,
              artBranch:r.artBranch, address:r.address||"", assigneeIds:[],
              memos:r.notes?[{id:Date.now()+Math.random(),text:r.notes,userId:currentUser?.id,date:new Date().toISOString()}]:[],
              chat:[], createdAt:new Date().toISOString()
            });
          });
          save({...data,municipalities:[...munis,...toAdd]});
          setBulkDone({added:toAdd.length,dupes:skipped.length});
          setSheet("importMuniDone");
        };
        return (
          <Sheet title="自治体をインポート" onClose={()=>{setSheet(null);setImportPreview(null);setImportErr("");}}>
            {/* Download template */}
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:"0.82rem",color:"#1d4ed8",marginBottom:"0.35rem"}}>📥 CSVテンプレートをダウンロード</div>
              <div style={{fontSize:"0.72rem",color:"#3730a3",marginBottom:"0.625rem",lineHeight:1.5}}>
                テンプレートに沿って入力 → CSV(UTF-8)で保存 → アップロード
              </div>
              <div style={{background:"white",border:"1px solid #bfdbfe",borderRadius:"0.625rem",padding:"0.5rem 0.75rem",marginBottom:"0.625rem",fontSize:"0.72rem",color:"#374151",lineHeight:1.8}}>
                <div style={{fontWeight:700,marginBottom:"0.2rem",color:"#1d4ed8"}}>📋 列の説明</div>
                <div>A列: <b>都道府県</b>（例: 福岡県）必須</div>
                <div>B列: <b>自治体名</b>（例: 福岡市）必須</div>
                <div>C列: <b>ダストーク展開</b>（展開 または 未展開）</div>
                <div>D列: <b>連携協定ステータス</b>（未接触/電話済/資料送付/商談中/協定済）</div>
                <div>E列: <b>アプローチステータス</b>（未接触/電話済/資料送付/商談中/協定済）</div>
                <div>F列: <b>管轄支店</b>（例: 福岡支店）</div>
                <div>G列: <b>担当者名</b>（任意）</div>
                <div>H列: <b>メモ</b>（任意）</div>
                <div>I列: <b>住所</b>（任意）</div>
              </div>
              <button onClick={()=>downloadCSV("自治体インポートテンプレート.csv",
                ["都道府県 *","自治体名 *","ダストーク展開","連携協定ステータス","アプローチステータス","管轄支店","担当者名","メモ","住所"],
                [["福岡県","福岡市","展開","協定済","協定済","福岡支店","田中","","福岡県福岡市〇〇1-2-3"],
                 ["福岡県","北九州市","未展開","商談中","電話済","北九州支店","","",""],
                 ["東京都","新宿区","展開","未接触","資料送付","東京支店","山田","来週面談","東京都新宿区〇〇2-3-4"],
                 ["","","","","","","","",""]])}
                style={{background:"#2563eb",border:"none",borderRadius:"0.625rem",color:"white",fontWeight:700,fontSize:"0.78rem",padding:"0.45rem 0.875rem",cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                ⬇️ CSVテンプレートをダウンロード
              </button>
            </div>
            {/* Upload */}
            <div style={{marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.5rem"}}>📤 CSVファイルをアップロード</div>
              <label style={{display:"block",border:`2px dashed ${C.border}`,borderRadius:"0.875rem",padding:"1.5rem",textAlign:"center",cursor:"pointer",background:C.bg}}>
                <div style={{fontSize:"1.75rem",marginBottom:"0.35rem"}}>📂</div>
                <div style={{fontSize:"0.82rem",fontWeight:600,color:C.textSub}}>クリックしてCSVを選択</div>
                <div style={{fontSize:"0.7rem",color:C.textMuted,marginTop:"0.2rem"}}>UTF-8 CSV形式 (.csv)</div>
                <input type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}}/>
              </label>
              {err&&<div style={{marginTop:"0.5rem",fontSize:"0.78rem",color:"#dc2626",background:"#fff1f2",borderRadius:"0.5rem",padding:"0.5rem 0.75rem"}}>{err}</div>}
            </div>
            {/* Preview */}
            {preview&&(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem",flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>プレビュー</span>
                  <span style={{background:"#d1fae5",color:"#065f46",borderRadius:999,fontSize:"0.7rem",fontWeight:700,padding:"0.1rem 0.5rem"}}>{preview.length}件</span>
                  <span style={{fontSize:"0.7rem",color:C.textMuted}}>既存と名前が一致する場合はスキップ</span>
                </div>
                <div style={{maxHeight:240,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:"0.75rem",overflow:"hidden"}}>
                  {preview.slice(0,30).map((r,i)=>{
                    const pref=prefs.find(p=>p.name===r.prefName);
                    const dup=pref&&munis.some(m=>m.prefectureId===pref.id&&m.name===r.name);
                    const noPref=!pref;
                    const ds=DUSTALK_STATUS[r.dustalk]||DUSTALK_STATUS["未展開"];
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",padding:"0.45rem 0.75rem",borderBottom:`1px solid ${C.borderLight}`,background:dup||noPref?"#fef9c3":"white",gap:"0.4rem"}}>
                        <span style={{fontSize:"0.7rem",color:C.textMuted,width:52,flexShrink:0}}>{r.prefName}</span>
                        <span style={{flex:1,fontSize:"0.82rem",fontWeight:600,color:C.text}}>{r.name}</span>
                        <span style={{fontSize:"0.65rem",background:ds.bg,color:ds.color,borderRadius:999,padding:"0.05rem 0.35rem",fontWeight:700,flexShrink:0}}>{r.dustalk}</span>
                        {dup&&<span style={{fontSize:"0.62rem",color:"#92400e",background:"#fef3c7",borderRadius:999,padding:"0.05rem 0.3rem",flexShrink:0}}>重複</span>}
                        {noPref&&<span style={{fontSize:"0.62rem",color:"#dc2626",background:"#fee2e2",borderRadius:999,padding:"0.05rem 0.3rem",flexShrink:0}}>都道府県不明</span>}
                      </div>
                    );
                  })}
                  {preview.length>30&&<div style={{padding:"0.5rem",textAlign:"center",fontSize:"0.75rem",color:C.textMuted}}>...他{preview.length-30}件</div>}
                </div>
                <div style={{display:"flex",gap:"0.625rem",marginTop:"0.75rem"}}>
                  <Btn variant="secondary" style={{flex:1}} onClick={()=>{setPreview(null);setErr("");}}>クリア</Btn>
                  <Btn style={{flex:2}} onClick={doImport}
                    disabled={!preview.filter(r=>{const p=prefs.find(x=>x.name===r.prefName);return p&&!munis.some(m=>m.prefectureId===p.id&&m.name===r.name);}).length}>
                    {preview.filter(r=>{const p=prefs.find(x=>x.name===r.prefName);return p&&!munis.some(m=>m.prefectureId===p.id&&m.name===r.name);}).length}件をインポート
                  </Btn>
                </div>
              </div>
            )}
          </Sheet>
        );
      })()}
      {showGSheetImport&&<GSheetImportWizard
        data={data} prefs={prefs} munis={munis} vendors={vendors}
        onSave={(nd)=>{save(nd);}}
        onClose={()=>setShowGSheetImport(false)}/>}
      {sheet==="importMuniDone"&&(
        <Sheet title="インポート完了" onClose={()=>setSheet(null)}>
          <div style={{textAlign:"center",padding:"1.5rem 0"}}>
            <div style={{fontSize:"3rem",marginBottom:"0.5rem"}}>✅</div>
            <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>{bulkDone?.added||0}件を登録しました</div>
            {bulkDone?.dupes>0&&<div style={{fontSize:"0.82rem",color:C.textMuted,marginTop:"0.35rem"}}>{bulkDone.dupes}件は重複または都道府県不明のためスキップ</div>}
          </div>
          <Btn style={{width:"100%"}} onClick={()=>setSheet(null)}>閉じる</Btn>
        </Sheet>
      )}
        {/* 重複検出モーダル */}
        {dupModal&&<DupModal existing={dupModal.existing} incoming={dupModal.incoming} onKeepBoth={dupModal.onKeepBoth} onUseExisting={dupModal.onUseExisting} onCancel={()=>setDupModal(null)}/>}
    </div>
  );
}


// ─── MYPAGE VIEW ─────────────────────────────────────────────────────────────
function MyPageView({currentUser, setCurrentUser, users, setUsers, onLogout, pushEnabled, setPushEnabled, subscribePush, unsubscribePush}) {
  const [profileForm, setProfileForm] = useState({name:currentUser?.name||"",email:currentUser?.email||"",phone:currentUser?.phone||""});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [pwForm, setPwForm] = useState({cur:"",next:"",next2:""});
  const [pwMsg, setPwMsg] = useState("");
  const [section, setSection] = useState("profile"); // profile | links | account
  const [contractModal, setContractModal] = useState(null); // null | 'upload' | 'generate'

  const saveProfile = async () => {
    if(!profileForm.name.trim()) return;
    setProfileSaving(true);
    const updated = {...currentUser, name:profileForm.name.trim(), email:profileForm.email.trim(), phone:profileForm.phone.trim()};
    const newUsers = users.map(u=>u.id===currentUser.id?updated:u);
    await saveUsers(newUsers);
    setCurrentUser(updated);
    setUsers(newUsers);
    setSession(updated);
    setProfileMsg("✅ 保存しました");
    setProfileSaving(false);
    setTimeout(()=>setProfileMsg(""),3000);
  };

  const changePassword = async () => {
    if(!pwForm.cur||!pwForm.next||!pwForm.next2) {setPwMsg("❌ 全項目を入力してください"); return;}
    if(pwForm.next!==pwForm.next2) {setPwMsg("❌ 新しいパスワードが一致しません"); return;}
    if(pwForm.next.length < 6) {setPwMsg("❌ 6文字以上で設定してください"); return;}
    const me = users.find(u=>u.id===currentUser.id);
    if(me?.passwordHash!==hashPass(pwForm.cur)) {setPwMsg("❌ 現在のパスワードが違います"); return;}
    const newUsers = users.map(u=>u.id===currentUser.id?{...u,passwordHash:hashPass(pwForm.next)}:u);
    await saveUsers(newUsers);
    setUsers(newUsers);
    setPwMsg("✅ パスワードを変更しました");
    setPwForm({cur:"",next:"",next2:""});
    setTimeout(()=>setPwMsg(""),3000);
  };


  const menuItems = [
    {id:"profile",  icon:"👤", label:"プロフィール設定"},
    {id:"links",    icon:"🔗", label:"外部サービス連携"},
    {id:"contract", icon:"📜", label:"契約書確認"},
    {id:"account",  icon:"🔑", label:"パスワード変更"},
  ];

  return (
    <div style={{paddingBottom:"1rem"}}>
      <div style={{fontWeight:800,fontSize:"1.1rem",color:C.text,marginBottom:"1.25rem"}}>⚙️ 設定</div>

      {/* Section Tabs */}
      <div style={{display:"flex",gap:"0.375rem",marginBottom:"1.25rem",background:"white",borderRadius:"0.875rem",padding:"0.25rem",border:"1px solid "+C.border}}>
        {menuItems.map(m=>(
          <button key={m.id} onClick={()=>setSection(m.id)}
            style={{flex:1,padding:"0.5rem 0.25rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.72rem",fontWeight:section===m.id?800:500,background:section===m.id?C.accent:"transparent",color:section===m.id?"white":C.textSub,display:"flex",flexDirection:"column",alignItems:"center",gap:"0.2rem"}}>
            <span style={{fontSize:"1.1rem",lineHeight:1}}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* ── プロフィール設定 ── */}
      {section==="profile"&&(
        <div style={{background:"white",borderRadius:"1rem",padding:"1.25rem",border:"1px solid "+C.border,boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"1rem"}}>👤 自分の情報</div>
          <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.25rem"}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,"+C.accent+","+C.accentDark+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.5rem",fontWeight:800,color:"white",flexShrink:0}}>
              {(profileForm.name||currentUser?.name||"?").charAt(0)}
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:"0.95rem",color:C.text}}>{currentUser?.name}</div>
              <div style={{fontSize:"0.75rem",color:C.textMuted}}>{currentUser?.email}</div>
            </div>
          </div>
          {[["氏名 *","name","田中太郎","text"],["メールアドレス","email","example@mail.com","email"],["電話番号","phone","090-0000-0000","tel"]].map(([label,field,ph,type])=>(
            <div key={field} style={{marginBottom:"0.875rem"}}>
              <div style={{fontSize:"0.78rem",fontWeight:700,color:C.textSub,marginBottom:"0.3rem"}}>{label}</div>
              <input type={type} value={profileForm[field]||""} onChange={e=>setProfileForm(p=>({...p,[field]:e.target.value}))} placeholder={ph}
                style={{width:"100%",padding:"0.625rem 0.75rem",borderRadius:"0.625rem",border:"1.5px solid "+C.border,fontSize:"0.9rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          {profileMsg&&<div style={{marginBottom:"0.75rem",fontSize:"0.82rem",color:profileMsg.startsWith("✅")?"#059669":"#dc2626"}}>{profileMsg}</div>}
          <button onClick={saveProfile} disabled={profileSaving||!profileForm.name.trim()}
            style={{width:"100%",padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit",opacity:profileSaving?0.6:1}}>
            {profileSaving?"保存中...":"保存する"}
          </button>

          {/* プッシュ通知 */}
          <div style={{marginTop:"1.25rem",paddingTop:"1.25rem",borderTop:"1px solid "+C.borderLight}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:"0.87rem",fontWeight:700,color:C.text}}>🔔 プッシュ通知</div>
                <div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.15rem"}}>{pushEnabled?"有効 — 端末に通知が届きます":"無効"}</div>
              </div>
              <button onClick={async()=>{
                if(pushEnabled){await unsubscribePush(currentUser.id);setPushEnabled(false);}
                else{const ok=await subscribePush(currentUser.id);if(ok)setPushEnabled(true);}
              }} style={{padding:"0.4rem 1rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.82rem",background:pushEnabled?"#d1fae5":"#2563eb",color:pushEnabled?"#065f46":"white"}}>
                {pushEnabled?"ON ✓":"ONにする"}
              </button>
            </div>
          </div>

          {/* ログアウト */}
          <button onClick={onLogout}
            style={{width:"100%",marginTop:"1rem",padding:"0.75rem",borderRadius:"0.75rem",border:"1.5px solid #fee2e2",background:"white",color:"#dc2626",fontWeight:700,fontSize:"0.87rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
            🚪 ログアウト
          </button>
        </div>
      )}

      {/* ── 外部サービス連携 ── */}
      {section==="links"&&(
        <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
          {/* iOS通知案内 */}
          {/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.matchMedia('(display-mode: standalone)').matches&&(
            <div style={{background:"#fffbeb",border:"1.5px solid #f59e0b",borderRadius:"1rem",padding:"1rem 1.125rem"}}>
              <div style={{fontWeight:800,fontSize:"0.87rem",color:"#92400e",marginBottom:"0.5rem"}}>📱 iPhoneで通知を受け取るには</div>
              <div style={{fontSize:"0.8rem",color:"#78350f",lineHeight:1.6}}>
                SafariのMyDeskページで<br/>
                <b>①</b> 下の共有ボタン（□↑）をタップ<br/>
                <b>②</b>「ホーム画面に追加」を選択<br/>
                <b>③</b> ホーム画面のアイコンから起動<br/>
                <b>④</b> 通知をONにする
              </div>
            </div>
          )}
          <div style={{background:"white",borderRadius:"1rem",border:"1px solid "+C.border,boxShadow:C.shadow,overflow:"hidden"}}>
            <div style={{padding:"0.875rem 1rem",background:"linear-gradient(135deg,#1e40af,#2563eb)",color:"white"}}>
              <div style={{fontWeight:800,fontSize:"0.9rem"}}>📋 Jobcan 勤怠管理</div>
              <div style={{fontSize:"0.72rem",opacity:0.85,marginTop:"0.2rem"}}>出退勤・休暇申請はこちらから</div>
            </div>
            <div style={{padding:"1rem"}}>
              <a href="https://ssl.jobcan.jp/login/mb-employee?client_id=nhd&lang_code=ja" target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.75rem 1rem",borderRadius:"0.75rem",background:C.accentBg,border:"1.5px solid "+C.accent+"40",color:C.accentDark,fontWeight:700,fontSize:"0.9rem",textDecoration:"none"}}>
                <span>🕐 勤怠打刻・申請を開く</span>
                <span style={{fontSize:"0.9rem"}}>↗</span>
              </a>
            </div>
          </div>

          <div style={{background:"white",borderRadius:"1rem",border:"1px solid "+C.border,boxShadow:C.shadow,overflow:"hidden"}}>
            <div style={{padding:"0.875rem 1rem",background:"linear-gradient(135deg,#5b21b6,#7c3aed)",color:"white"}}>
              <div style={{fontWeight:800,fontSize:"0.9rem"}}>📝 Jobcan ワークフロー（稟議）</div>
              <div style={{fontSize:"0.72rem",opacity:0.85,marginTop:"0.2rem"}}>各種申請・承認はこちらから</div>
            </div>
            <div style={{padding:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem",padding:"0.5rem 0.75rem",background:"#f5f3ff",borderRadius:"0.625rem",border:"1px solid #ddd6fe"}}>
                <span style={{fontSize:"0.75rem",color:"#6d28d9",fontWeight:600}}>🪪 社員ID</span>
                <span style={{fontSize:"0.88rem",color:"#5b21b6",fontWeight:800,letterSpacing:"0.05em"}}>C15348-28852-43733</span>
              </div>
              <a href="https://id.jobcan.jp/users/sign_in?app_key=wf" target="_blank" rel="noopener noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.75rem 1rem",borderRadius:"0.75rem",background:"#f5f3ff",border:"1.5px solid #ddd6fe",color:"#5b21b6",fontWeight:700,fontSize:"0.9rem",textDecoration:"none"}}>
                <span>📄 稟議・申請を開く</span>
                <span style={{fontSize:"0.9rem"}}>↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── 契約書確認 ── */}
      {section==="contract"&&(
        <div style={{display:"flex",flexDirection:"column",gap:"0.875rem"}}>
          {/* ヘッダー */}
          <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",borderRadius:"1rem",padding:"1.25rem 1.25rem 1rem",color:"white",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",right:-20,top:-20,fontSize:"5rem",opacity:0.08}}>📜</div>
            <div style={{fontSize:"1.1rem",fontWeight:800,marginBottom:"0.25rem"}}>📜 契約書確認</div>
            <div style={{fontSize:"0.78rem",opacity:0.85,lineHeight:1.5}}>契約書のアップロード・生成・管理ができます</div>
          </div>

          {/* アクションカード：契約書をアップロード */}
          <div style={{background:"white",borderRadius:"1rem",border:"1px solid "+C.border,boxShadow:C.shadow,overflow:"hidden"}}>
            <div style={{padding:"0.75rem 1rem",background:"linear-gradient(135deg,#065f46,#059669)",color:"white",display:"flex",alignItems:"center",gap:"0.5rem"}}>
              <span style={{fontSize:"1.2rem"}}>📁</span>
              <div>
                <div style={{fontWeight:800,fontSize:"0.88rem"}}>契約書をアップロード</div>
                <div style={{fontSize:"0.7rem",opacity:0.85}}>既存の契約書PDFを保存・管理</div>
              </div>
            </div>
            <div style={{padding:"1rem"}}>
              <div style={{fontSize:"0.8rem",color:C.textSub,marginBottom:"0.875rem",lineHeight:1.6}}>
                PDFや画像形式の契約書をアップロードして、チーム内で共有・確認できます。
                署名済み契約書の保管にも使用できます。
              </div>
              <button onClick={()=>setContractModal("upload")}
                style={{width:"100%",padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:"#059669",color:"white",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                📤 契約書をアップロード
              </button>
            </div>
          </div>

          {/* アクションカード：契約書を生成 */}
          <div style={{background:"white",borderRadius:"1rem",border:"1px solid "+C.border,boxShadow:C.shadow,overflow:"hidden"}}>
            <div style={{padding:"0.75rem 1rem",background:"linear-gradient(135deg,#4c1d95,#7c3aed)",color:"white",display:"flex",alignItems:"center",gap:"0.5rem"}}>
              <span style={{fontSize:"1.2rem"}}>✨</span>
              <div>
                <div style={{fontWeight:800,fontSize:"0.88rem"}}>契約書を自動生成</div>
                <div style={{fontSize:"0.7rem",opacity:0.85}}>必要情報を入力して契約書を作成</div>
              </div>
            </div>
            <div style={{padding:"1rem"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"0.875rem"}}>
                {[
                  {icon:"🏢", label:"取引先情報（会社名・担当者）"},
                  {icon:"📋", label:"契約種別・契約内容の概要"},
                  {icon:"📅", label:"契約期間・支払条件"},
                  {icon:"💰", label:"金額・振込先情報"},
                ].map(item=>(
                  <div key={item.label} style={{display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.5rem 0.625rem",background:C.bg,borderRadius:"0.625rem",border:"1px solid "+C.borderLight}}>
                    <span style={{fontSize:"1rem",flexShrink:0}}>{item.icon}</span>
                    <span style={{fontSize:"0.78rem",color:C.textSub,fontWeight:500}}>{item.label}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>setContractModal("generate")}
                style={{width:"100%",padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:"linear-gradient(135deg,#6d28d9,#7c3aed)",color:"white",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                ✨ 情報を入力して契約書を生成
              </button>
            </div>
          </div>

          {/* アクションカード：契約書一覧 */}
          <div style={{background:"white",borderRadius:"1rem",border:"1px solid "+C.border,boxShadow:C.shadow,overflow:"hidden"}}>
            <div style={{padding:"0.75rem 1rem",background:"linear-gradient(135deg,#92400e,#d97706)",color:"white",display:"flex",alignItems:"center",gap:"0.5rem"}}>
              <span style={{fontSize:"1.2rem"}}>📋</span>
              <div>
                <div style={{fontWeight:800,fontSize:"0.88rem"}}>契約書一覧・管理</div>
                <div style={{fontSize:"0.7rem",opacity:0.85}}>過去の契約書を検索・確認</div>
              </div>
            </div>
            <div style={{padding:"1rem"}}>
              <div style={{fontSize:"0.8rem",color:C.textSub,marginBottom:"0.875rem",lineHeight:1.6}}>
                企業別・期間別に契約書を一覧表示。ステータス管理（締結前・締結済・期限切れ）や更新リマインダーも設定できます。
              </div>
              <button onClick={()=>setContractModal("list")}
                style={{width:"100%",padding:"0.75rem",borderRadius:"0.75rem",border:"1.5px solid #d97706",background:"#fffbeb",color:"#92400e",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                📋 契約書一覧を見る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 準備中モーダル ── */}
      {contractModal&&(
        <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",padding:"1rem"}}
          onClick={()=>setContractModal(null)}>
          <div style={{background:"white",borderRadius:"1.25rem",padding:"2rem 1.5rem",maxWidth:340,width:"100%",textAlign:"center",boxShadow:"0 16px 60px rgba(0,0,0,0.25)"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"3rem",marginBottom:"0.75rem"}}>🚧</div>
            <div style={{fontWeight:800,fontSize:"1.05rem",color:C.text,marginBottom:"0.5rem"}}>準備中</div>
            <div style={{fontSize:"0.85rem",color:C.textSub,lineHeight:1.6,marginBottom:"1.5rem"}}>
              {contractModal==="upload"&&"契約書アップロード機能は現在開発中です。もうしばらくお待ちください。"}
              {contractModal==="generate"&&"契約書自動生成機能は現在開発中です。必要情報の入力フォームと生成エンジンを準備しています。"}
              {contractModal==="list"&&"契約書一覧機能は現在開発中です。もうしばらくお待ちください。"}
            </div>
            <button onClick={()=>setContractModal(null)}
              style={{padding:"0.75rem 2rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit"}}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ── パスワード変更 ── */}
      {section==="account"&&(
        <div style={{background:"white",borderRadius:"1rem",padding:"1.25rem",border:"1px solid "+C.border,boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"1rem"}}>🔑 パスワード変更</div>
          {[["現在のパスワード","cur"],["新しいパスワード（6文字以上）","next"],["新しいパスワード（確認）","next2"]].map(([label,field])=>(
            <div key={field} style={{marginBottom:"0.875rem"}}>
              <div style={{fontSize:"0.78rem",fontWeight:700,color:C.textSub,marginBottom:"0.3rem"}}>{label}</div>
              <input type="password" value={pwForm[field]||""} onChange={e=>setPwForm(p=>({...p,[field]:e.target.value}))} placeholder="••••••••"
                style={{width:"100%",padding:"0.625rem 0.75rem",borderRadius:"0.625rem",border:"1.5px solid "+C.border,fontSize:"0.9rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
          {pwMsg&&<div style={{marginBottom:"0.75rem",fontSize:"0.82rem",color:pwMsg.startsWith("✅")?"#059669":"#dc2626"}}>{pwMsg}</div>}
          <button onClick={changePassword}
            style={{width:"100%",padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit"}}>
            変更する
          </button>
        </div>
      )}
    </div>
  );
}


// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
const ANALYTICS_SYSTEMS = [
  {id:"dustalk",label:"DUSTALK"},
  {id:"beenet", label:"bee-net"},
  {id:"rebit",  label:"Rebit"},
  {id:"bizcon", label:"ビジコン"},
];
const DUSTALK_EXIT_STEPS = [
  {key:"top",             label:"トップ画面"},
  {key:"location",        label:"回収場所入力"},
  {key:"requestContent",  label:"依頼内容入力"},
  {key:"date",            label:"回収希望日入力"},
  {key:"info",            label:"申込者情報入力"},
  {key:"confirm",         label:"依頼内容確認"},
  {key:"complete",        label:"依頼完了"},
  {key:"estimateSubmit",  label:"見積り提出"},
  {key:"estimateConfirm", label:"見積り確認"},
  {key:"contract",        label:"成約"},
];
const PAY_KEYS = [["cc","クレジットカード"],["paypay","ペイペイ"],["merpay","メルペイ"],["cash","現金"]];

const DUSTALK_DEF = {hp:0,serviceLog:0,requests:0,contracts:0,revenue:0,lineFriends:0,
  pay:{cc:0,paypay:0,merpay:0,cash:0},
  exits:{top:0,location:0,requestContent:0,date:0,info:0,confirm:0,complete:0,estimateSubmit:0,estimateConfirm:0,contract:0},
  partnerStores:[]};
const REBIT_DEF  = {cumulative:0,monthly:0,hp:0};
const BIZCON_DEF = {hpByMonth:{},applicants:0,fullApplicants:0};

function getMonthKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function getYearKey(d=new Date()){return `${d.getFullYear()}`;}
function monthLabel(k){const[y,m]=k.split("-");return `${y}年${parseInt(m)}月`;}
function yearLabel(k){return `${k}年`;}
function shiftMonth(k,delta){const[y,m]=k.split("-");const d=new Date(+y,+m-1+delta,1);return getMonthKey(d);}
function shiftYear(k,delta){return String(+k+delta);}

// merge helpers
function mergeDustalk(raw){
  return {...DUSTALK_DEF,...raw,
    pay:{...DUSTALK_DEF.pay,...(raw.pay||{})},
    exits:{...DUSTALK_DEF.exits,...(raw.exits||{})},
    partnerStores:raw.partnerStores||[]};
}

// ─── ANALYTICS HELPERS (top-level to prevent remount on state change) ─────────
function InputNum({value,onChange}) {
  const [local,setLocal] = useState(String(value??0));
  const focused = useRef(false); // フォーカス中は親からの同期をブロック
  useEffect(()=>{
    // フォーカス中（入力中）は外部からのリセットをしない
    if(focused.current) return;
    setLocal(String(value??0));
  },[value]);
  return (
    <input type="text" inputMode="decimal" value={local}
      onFocus={()=>{ focused.current=true; }}
      onChange={e=>{
        const v=e.target.value;
        if(v===''||v==='-'||/^-?\d*\.?\d*$/.test(v)){
          setLocal(v);
          const n=parseFloat(v);
          if(!isNaN(n)) onChange(n);
        }
      }}
      onBlur={()=>{
        focused.current=false;
        const n=parseFloat(local);
        const final=isNaN(n)?0:n;
        setLocal(String(final));
        onChange(final);
      }}
      style={{width:86,padding:"0.3rem 0.5rem",borderRadius:"0.5rem",
        border:`1.5px solid ${C.accent}`,fontSize:"1rem",textAlign:"right",
        fontFamily:"inherit",outline:"none"}}/>
  );
}
function DiffBadge({cur,prv}) {
  if (prv==null||prv===0&&cur===0) return null;
  const diff=cur-prv, pct=prv!==0?((diff/prv)*100).toFixed(1):null, up=diff>=0;
  return (
    <span style={{fontSize:"0.65rem",fontWeight:700,marginLeft:"0.4rem",
      color:up?"#059669":"#dc2626",background:up?"#d1fae5":"#fee2e2",
      padding:"0.1rem 0.4rem",borderRadius:999}}>
      {up?"▲":"▼"}{Math.abs(diff).toLocaleString()}{pct!=null?` (${pct}%)` :""}
    </span>
  );
}

function AnalyticsView({data,setData,currentUser,users=[],saveWithPush}) {
  if(!saveWithPush) saveWithPush=(nd)=>{setData(nd);};
  const [sys,      setSys]      = useState("dustalk");
  const [mk,       setMk]       = useState(getMonthKey());
  const [yk,       setYk]       = useState(getYearKey());
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState(null);
  const [chart,    setChart]    = useState(null);
  // expanded sections for collapsible partner stores
  const [openSects,setOpenSects]= useState({serviceLog:false,requests:false,contracts:false,revenue:false});

  const ana     = data.analytics || {};
  const sysData = ana[sys] || {};
  const key     = sys==="bizcon" ? yk : mk;
  const raw     = sysData[key] || {};

  const getCurrent = () => {
    if (sys==="dustalk") return mergeDustalk(raw);
    if (sys==="rebit")   return {...REBIT_DEF,...raw};
    if (sys==="bizcon")  return {...BIZCON_DEF,...raw};
    return {};
  };

  const prevKey = sys==="bizcon" ? shiftYear(yk,-1) : shiftMonth(mk,-1);
  const prevRaw = sysData[prevKey] || {};
  const getPrev = () => {
    if (sys==="dustalk") return mergeDustalk(prevRaw);
    return {};
  };

  const startEdit = () => { setDraft(getCurrent()); setEditing(true); };
  const cancel    = () => { setEditing(false); setDraft(null); };

  const saveEdit = () => {
    let saved = {...draft};
    if (sys==="rebit") {
      const diff = (draft.monthly||0) - (raw.monthly||0);
      saved.cumulative = Math.max(0, (draft.cumulative||0) + diff);
    }
    const nd = {...data, analytics:{...ana,[sys]:{...sysData,[key]:saved}}};
    // 分析更新通知
    const allUsers = (data.users||[]).map(u=>u.id).filter(Boolean);
    const withNotif = allUsers.length>0
      ? {...nd, notifications:[...(nd.notifications||[]),{
          id:Date.now()+Math.random(),
          type:"analytics_update",
          title:`📊 分析データが更新されました（${ANALYTICS_SYSTEMS.find(s=>s.id===sys)?.label} · ${sys==="bizcon"?yearLabel(yk):monthLabel(mk)}）`,
          body:"",
          toUserId:"__all__",
          read:false,
          date:new Date().toISOString(),
        }]}
      : nd;
    saveWithPush(withNotif, data.notifications); setEditing(false); setDraft(null);
  };

  const switchSys = (id) => { setSys(id); setEditing(false); setDraft(null); setChart(null); };

  const d    = editing ? draft : getCurrent();
  const prev = getPrev();
  const setD = (patch) => setDraft(p => ({...p,...patch}));

  const rowStyle = {display:"flex",alignItems:"center",padding:"0.625rem 0",borderBottom:`1px solid ${C.borderLight}`,gap:"0.5rem"};

  // ── CHART DEFS ────────────────────────────────────────────────────────────
  const CHART_DEFS = {
    dustalk: {
      "基本指標": [
        {label:"HP閲覧数",       unit:"PV",  get:(m)=>m?.hp||0},
        {label:"LINE友達追加",   unit:"人",  get:(m)=>m?.lineFriends||0},
        {label:"サービスログ",   unit:"件",  get:(m)=>m?.serviceLog||0},
        {label:"依頼数",         unit:"件",  get:(m)=>m?.requests||0},
        {label:"成約数",         unit:"件",  get:(m)=>m?.contracts||0},
        {label:"売上",           unit:"円",  get:(m)=>m?.revenue||0},
        {label:"成約率",         unit:"%",   get:(m)=>m?.requests>0?+((m.contracts/m.requests)*100).toFixed(1):0},
      ],
      "支払方法内訳": PAY_KEYS.map(([k,lbl])=>({label:lbl, unit:"件", get:(m)=>m?.pay?.[k]||0})),
      "離脱率管理": DUSTALK_EXIT_STEPS.map(s=>({label:s.label, unit:"人", get:(m)=>m?.exits?.[s.key]||0})),
    },
    rebit: {
      "ユーザー数": [
        {label:"月間ユーザー数", unit:"人", get:(m)=>m?.monthly||0},
        {label:"累積ユーザー数", unit:"人", get:(m)=>m?.cumulative||0},
      ],
      "HP閲覧数": [
        {label:"月間HP閲覧数", unit:"PV", get:(m)=>m?.hp||0},
      ],
    },
    bizcon: {},
  };

  // ── Build 12-month series ─────────────────────────────────────────────────
  const buildMonthSeries = (metricFn) =>
    Array.from({length:12},(_,i)=>{
      const k = shiftMonth(mk, i-11);
      const r = sysData[k] || {};
      const m = sys==="dustalk" ? mergeDustalk(r) : {...REBIT_DEF,...r};
      return {label: monthLabel(k).replace(/\d+年/,""), value: metricFn(m)};
    });

  // ── SVG BarChart ──────────────────────────────────────────────────────────
  const BarChart = ({points, unit, color=C.accent}) => {
    const W=320, H=160, PT=20, PB=32, innerW=W, innerH=H-PT-PB;
    const maxV = Math.max(...points.map(p=>p.value), 1);
    const barW  = innerW / points.length;
    const fmt = v => v>=10000?(v/10000).toFixed(1)+"万":v>=1000?(v/1000).toFixed(1)+"k":String(v);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        {[0,0.5,1].map(r=>{
          const y=PT+innerH*(1-r);
          return <line key={r} x1={0} y1={y} x2={innerW} y2={y} stroke={C.borderLight} strokeWidth={1}/>;
        })}
        {points.map((p,i)=>{
          const bh=Math.max(2,(p.value/maxV)*innerH);
          const x=i*barW+barW*0.15, bw=barW*0.7, y=PT+innerH-bh;
          const isNow=i===points.length-1;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh} fill={isNow?C.accentDark:color} rx={3} opacity={isNow?1:0.65}/>
              {p.value>0&&bh>18&&<text x={x+bw/2} y={y-4} textAnchor="middle" fontSize={9} fill={C.textMuted}>{fmt(p.value)}</text>}
              <text x={x+bw/2} y={H-12} textAnchor="middle" fontSize={8} fill={C.textMuted}>{p.label}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  // ── ChartModal ────────────────────────────────────────────────────────────
  const renderChartModal = () => {
    if (!chart) return null;
    const defs   = CHART_DEFS[sys]?.[chart.section] || [];
    const midx   = chart.metricIdx || 0;
    const metric = defs[midx];
    if (!metric) return null;
    const points = buildMonthSeries(metric.get);
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setChart(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"white",borderRadius:"1.25rem 1.25rem 0 0",width:"100%",maxWidth:680,padding:"1.5rem 1.25rem 2rem",boxSizing:"border-box",maxHeight:"80vh",overflowY:"auto"}}>
          <div style={{width:36,height:4,background:C.border,borderRadius:999,margin:"0 auto 1.25rem"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
            <div>
              <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{chart.section}</div>
              <div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.15rem"}}>直近12ヶ月</div>
            </div>
            <button onClick={()=>setChart(null)} style={{background:"none",border:"none",fontSize:"1.4rem",cursor:"pointer",color:C.textSub,lineHeight:1}}>✕</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem",marginBottom:"1.25rem"}}>
            {defs.map((m,i)=>(
              <button key={i} onClick={()=>setChart({...chart,metricIdx:i})}
                style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.75rem",fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${i===midx?C.accent:C.border}`,background:i===midx?C.accentBg:"white",color:i===midx?C.accentDark:C.textSub}}>
                {m.label}
              </button>
            ))}
          </div>
          <div style={{padding:"0.5rem 0"}}>{BarChart({points, unit:metric.unit})}</div>
          <div style={{marginTop:"0.75rem",background:C.accentBg,borderRadius:"0.875rem",padding:"0.75rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:"0.82rem",color:C.accentDark,fontWeight:700}}>{monthLabel(mk)} ({metric.label})</span>
            <span style={{fontSize:"1.15rem",fontWeight:800,color:C.accentDark}}>{points[11]?.value?.toLocaleString()}{metric.unit}</span>
          </div>
        </div>
      </div>
    );
  };



  // ── Collapsible partner store sub-section ────────────────────────────────
  // 提携店舗はサービスログで一元管理 → 依頼数・成約数・売上に自動反映
  // データ構造: {_id, name, serviceLog, requests, contracts, revenue}
  const getStores = () => {
    const src = (editing ? draft : d).partnerStores || [];
    return src.map(s => {
      if(s.field !== undefined) {
        // 旧フォーマット互換変換
        const obj = {_id:s._id, name:s.name||"", serviceLog:0, requests:0, contracts:0, revenue:0};
        if(s.field in obj) obj[s.field] = s.value||0;
        return obj;
      }
      return s;
    });
  };
  const STORE_UNITS = {serviceLog:"件", requests:"件", contracts:"件", revenue:"円"};
  const renderPartnerStores = (fieldKey) => {
    const open = openSects[fieldKey];
    const stores = getStores();
    const isServiceLog = fieldKey === "serviceLog";
    const unit = STORE_UNITS[fieldKey] || "件";
    const total = stores.reduce((s,x)=>s+(+x[fieldKey]||0),0);
    return (
      <div style={{marginLeft:"0.5rem",marginBottom:"0.25rem"}}>
        <button onClick={()=>setOpenSects(p=>({...p,[fieldKey]:!open}))}
          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.5rem",padding:"0.2rem 0.6rem",fontSize:"0.7rem",fontWeight:700,color:C.textSub,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"0.3rem"}}>
          {open?"▲":"▼"} 提携店舗 {stores.length>0?`(${stores.length}店)`:""}
          {!isServiceLog&&stores.length>0&&!open&&(
            <span style={{marginLeft:"0.3rem",fontSize:"0.65rem",color:C.accentDark}}>計 {unit==="円"?"¥":""}{total.toLocaleString()}{unit!=="円"?unit:""}</span>
          )}
        </button>
        {open&&(
          <div style={{marginTop:"0.4rem",paddingLeft:"0.75rem",borderLeft:`2px solid ${C.borderLight}`}}>
            {stores.length===0&&(
              <div style={{fontSize:"0.75rem",color:C.textMuted,padding:"0.4rem 0"}}>
                {isServiceLog?"（＋から提携店舗を追加）":"（サービスログで提携店舗を追加してください）"}
              </div>
            )}
            {stores.map((s,i)=>(
              <div key={s._id||i} style={{display:"flex",alignItems:"center",gap:"0.4rem",padding:"0.35rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                {editing && isServiceLog ? (
                  <input value={s.name||""} onChange={e=>{const n=e.target.value;setDraft(p=>{const ps=getStores().map(x=>x._id===s._id?{...x,name:n}:x);return {...p,partnerStores:ps};});}}
                    style={{flex:1,padding:"0.2rem 0.4rem",borderRadius:"0.4rem",border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit",outline:"none",minWidth:0}}
                    placeholder="店舗名"/>
                ) : (
                  <span style={{flex:1,fontSize:"0.82rem",color:C.text,fontWeight:600,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name||"（名前未入力）"}</span>
                )}
                {editing ? (
                  <InputNum value={s[fieldKey]??0} onChange={v=>{
                    setDraft(p=>{const ps=getStores().map(x=>x._id===s._id?{...x,[fieldKey]:v}:x);return {...p,partnerStores:ps};});
                  }}/>
                ):(
                  <span style={{fontSize:"0.88rem",fontWeight:700,color:C.text}}>
                    {unit==="円"?"¥":""}{(+(s[fieldKey])||0).toLocaleString()}{unit!=="円"?unit:""}
                  </span>
                )}
                {editing && isServiceLog &&(
                  <button onClick={()=>setDraft(p=>({...p,partnerStores:getStores().filter(x=>x._id!==s._id)}))}
                    style={{background:"none",border:"none",color:"#dc2626",cursor:"pointer",fontSize:"0.85rem",padding:"0.1rem 0.3rem",lineHeight:1,flexShrink:0}}>✕</button>
                )}
              </div>
            ))}
            {editing && isServiceLog &&(
              <button onClick={()=>setDraft(p=>({...p,partnerStores:[...getStores(),{_id:Date.now()+Math.random(),name:"",serviceLog:0,requests:0,contracts:0,revenue:0}]}))}
                style={{marginTop:"0.5rem",padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:`1px dashed ${C.accent}`,background:C.accentBg,color:C.accentDark,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",width:"100%"}}>
                ＋ 提携店舗を追加（依頼数・成約数・売上にも反映）
              </button>
            )}
            {!isServiceLog && stores.length > 0 && (
              <div style={{marginTop:"0.35rem",padding:"0.35rem 0.5rem",background:C.accentBg,borderRadius:"0.5rem",display:"flex",justifyContent:"space-between",fontSize:"0.75rem",fontWeight:700,color:C.accentDark}}>
                <span>提携店舗 合計</span>
                <span>{unit==="円"?"¥":""}{total.toLocaleString()}{unit!=="円"?unit:""}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const convRate = d.requests>0 ? ((d.contracts/d.requests)*100).toFixed(1) : "－";
  const avgPrice = d.contracts>0 ? Math.round(d.revenue/d.contracts).toLocaleString() : "－";
  const payTotal = PAY_KEYS.reduce((s,[k])=>s+(+d.pay?.[k]||0),0);
  const allMonthKeys = Object.keys(sysData);
  const cumPay = PAY_KEYS.reduce((acc,[k])=>{
    acc[k]=allMonthKeys.reduce((s,mk2)=>s+(sysData[mk2]?.pay?.[k]||0),0);
    return acc;
  },{});
  const cumPayTotal = PAY_KEYS.reduce((s,[k])=>s+(cumPay[k]||0),0);
  const exitBase = +d.exits?.top||0;

  return (
    <div>
      {/* System tabs */}
      <div style={{display:"flex",background:C.bg,borderRadius:"0.875rem",padding:"0.25rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
        {ANALYTICS_SYSTEMS.map(s=>(
          <button key={s.id} onClick={()=>switchSys(s.id)}
            style={{flex:1,padding:"0.55rem 0.2rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",
              fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",transition:"all 0.15s",
              background:sys===s.id?C.accent:"transparent",color:sys===s.id?"white":C.textSub,
              boxShadow:sys===s.id?`0 2px 8px ${C.accent}44`:"none"}}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",
        background:"white",borderRadius:"0.875rem",padding:"0.625rem 1rem",border:`1px solid ${C.border}`}}>
        {sys==="bizcon" ? (
          <>
            <button onClick={()=>setYk(shiftYear(yk,-1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem"}}>‹</button>
            <span style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{yearLabel(yk)}</span>
            <button onClick={()=>setYk(shiftYear(yk,+1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem"}}>›</button>
          </>
        ) : (
          <>
            <button onClick={()=>setMk(shiftMonth(mk,-1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem"}}>‹</button>
            <span style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{monthLabel(mk)}</span>
            <button onClick={()=>setMk(shiftMonth(mk,+1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem"}}>›</button>
          </>
        )}
      </div>

      {/* bee-net placeholder */}
      {sys==="beenet" && (
        <div style={{textAlign:"center",padding:"4rem 1rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
          <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🚧</div>
          <div style={{fontWeight:700,marginBottom:"0.35rem"}}>bee-net</div>
          <div style={{fontSize:"0.82rem"}}>準備中</div>
        </div>
      )}

      {/* Data panel */}
      {sys!=="beenet" && (
        <div style={{background:"white",borderRadius:"1rem",padding:"1.25rem",border:`1px solid ${C.border}`,boxShadow:C.shadow}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
            <span style={{fontWeight:800,fontSize:"0.88rem",color:C.textSub}}>
              {ANALYTICS_SYSTEMS.find(s=>s.id===sys)?.label} · {sys==="bizcon"?yearLabel(yk):monthLabel(mk)}
            </span>
            {!editing
              ? <Btn size="sm" onClick={startEdit}>✏️ 編集</Btn>
              : <div style={{display:"flex",gap:"0.4rem"}}>
                  <Btn size="sm" variant="secondary" onClick={cancel}>キャンセル</Btn>
                  <Btn size="sm" onClick={saveEdit}>💾 保存</Btn>
                </div>
            }
          </div>

          {/* ── DUSTALK ── */}
          {sys==="dustalk" && (
            <div>
              {/* 基本指標 */}
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
                  <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>基本指標</div>
                  {!editing&&<button onClick={()=>setChart({section:"基本指標",metricIdx:0})} style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,color:C.accentDark,cursor:"pointer",fontFamily:"inherit",marginBottom:"0.2rem"}}>📊 グラフ</button>}
                </div>
                {/* HP閲覧数 */}
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>HP閲覧数</span>
                  {editing?<InputNum value={d.hp??0} onChange={v=>setD({hp:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.hp||0).toLocaleString()}PV<DiffBadge cur={+d.hp||0} prv={+prev.hp||0}/></span>}
                </div>
                {/* LINE友達追加 */}
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>LINE友達追加</span>
                  {editing?<InputNum value={d.lineFriends??0} onChange={v=>setD({lineFriends:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.lineFriends||0).toLocaleString()}人<DiffBadge cur={+d.lineFriends||0} prv={+prev.lineFriends||0}/></span>}
                </div>
                {/* サービスログ（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>サービスログ</span>
                  {editing?<InputNum value={d.serviceLog??0} onChange={v=>setD({serviceLog:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.serviceLog||0).toLocaleString()}件<DiffBadge cur={+d.serviceLog||0} prv={+prev.serviceLog||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("serviceLog")}</div>
                </div>
                {/* 依頼数（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>依頼数</span>
                  {editing?<InputNum value={d.requests??0} onChange={v=>setD({requests:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.requests||0).toLocaleString()}件<DiffBadge cur={+d.requests||0} prv={+prev.requests||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("requests")}</div>
                </div>
                {/* 成約数（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>成約数</span>
                  {editing?<InputNum value={d.contracts??0} onChange={v=>setD({contracts:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.contracts||0).toLocaleString()}件<DiffBadge cur={+d.contracts||0} prv={+prev.contracts||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("contracts")}</div>
                </div>
                {/* 成約率（計算） */}
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>成約率</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>成約数 ÷ 依頼数 × 100</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{convRate==="－"?"－":convRate+"%"}</span>
                </div>
                {/* 売上 */}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>売上</span>
                  {editing?<InputNum value={d.revenue??0} onChange={v=>setD({revenue:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>¥{(+d.revenue||0).toLocaleString()}<DiffBadge cur={+d.revenue||0} prv={+prev.revenue||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("revenue")}</div>
                </div>
                {/* 成約平均単価（計算） */}
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>成約平均単価</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>売上 ÷ 成約数</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{avgPrice==="－"?"－":avgPrice+"円"}</span>
                </div>
              </div>

              {/* 支払方法内訳 */}
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
                  <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>支払方法内訳</div>
                  {!editing&&<button onClick={()=>setChart({section:"支払方法内訳",metricIdx:0})} style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,color:C.accentDark,cursor:"pointer",fontFamily:"inherit",marginBottom:"0.2rem"}}>📊 グラフ</button>}
                </div>
                <div style={{display:"flex",padding:"0.3rem 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{flex:1,fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>決済方法</span>
                  <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>今月</span>
                  <span style={{width:44,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>月%</span>
                  <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>累計</span>
                  <span style={{width:44,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>累%</span>
                </div>
                {PAY_KEYS.map(([k,lbl])=>{
                  const mv=+d.pay?.[k]||0, mp=payTotal>0?((mv/payTotal)*100).toFixed(0):0;
                  const cv=cumPay[k]||0, cp=cumPayTotal>0?((cv/cumPayTotal)*100).toFixed(0):0;
                  return (
                    <div key={k} style={{...rowStyle,gap:"0.25rem"}}>
                      <span style={{flex:1,fontSize:"0.85rem",color:C.text}}>{lbl}</span>
                      {editing?<InputNum value={d.pay?.[k]??0} onChange={v=>setDraft(p=>({...p,pay:{...p.pay,[k]:v}}))}/>:(
                        <>
                          <span style={{width:52,textAlign:"right",fontSize:"0.88rem",fontWeight:700,color:C.text}}>{mv}件</span>
                          <span style={{width:44,textAlign:"right",fontSize:"0.78rem",color:C.blue,fontWeight:600}}>{mp}%</span>
                          <span style={{width:52,textAlign:"right",fontSize:"0.78rem",color:C.textSub}}>{cv}件</span>
                          <span style={{width:44,textAlign:"right",fontSize:"0.78rem",color:C.textSub}}>{cp}%</span>
                        </>
                      )}
                    </div>
                  );
                })}
                {!editing&&<div style={{padding:"0.4rem 0",textAlign:"right",fontSize:"0.72rem",color:C.textSub}}>今月合計: {payTotal}件　累計: {cumPayTotal}件</div>}
              </div>

              {/* 離脱率管理 */}
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
                  <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>離脱率管理</div>
                  {!editing&&<button onClick={()=>setChart({section:"離脱率管理",metricIdx:0})} style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,color:C.accentDark,cursor:"pointer",fontFamily:"inherit",marginBottom:"0.2rem"}}>📊 グラフ</button>}
                </div>
                <div style={{display:"flex",padding:"0.3rem 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{flex:1,fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>ステップ</span>
                  <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>到達数</span>
                  <span style={{width:56,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>到達率</span>
                  <span style={{width:56,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>離脱率</span>
                </div>
                {DUSTALK_EXIT_STEPS.map((step,i)=>{
                  const val=+d.exits?.[step.key]||0;
                  const topVal=exitBase||0;
                  const reachPct=topVal>0?((val/topVal)*100).toFixed(1):"－";
                  const nextStep=DUSTALK_EXIT_STEPS[i+1];
                  const nextVal=nextStep?(+d.exits?.[nextStep.key]||0):null;
                  const exitPct=val>0&&nextVal!=null?(((val-nextVal)/val)*100).toFixed(1)+"%":(i===DUSTALK_EXIT_STEPS.length-1&&val>0?"0.0%":"－");
                  const isLow=parseFloat(exitPct)>50;
                  return (
                    <div key={step.key} style={{...rowStyle,gap:"0.25rem"}}>
                      <span style={{flex:1,fontSize:"0.83rem",color:C.text}}>{step.label}</span>
                      {editing?<InputNum value={d.exits?.[step.key]??0} onChange={v=>setDraft(p=>({...p,exits:{...p.exits,[step.key]:v}}))}/>:(
                        <>
                          <span style={{width:52,textAlign:"right",fontSize:"0.88rem",fontWeight:700,color:C.text}}>{val.toLocaleString()}</span>
                          <span style={{width:56,textAlign:"right",fontSize:"0.82rem",color:C.blue,fontWeight:600}}>{reachPct==="－"?"－":reachPct+"%"}</span>
                          <span style={{width:56,textAlign:"right",fontSize:"0.82rem",fontWeight:700,color:isLow?"#dc2626":C.textSub}}>{exitPct}</span>
                        </>
                      )}
                    </div>
                  );
                })}
                {!editing&&exitBase>0&&<div style={{padding:"0.4rem 0",fontSize:"0.68rem",color:C.textMuted,textAlign:"right"}}>※到達率はトップ画面({exitBase.toLocaleString()}人)を基準</div>}
              </div>
            </div>
          )}

          {/* ── REBIT ── */}
          {sys==="rebit" && (
            <div>
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
                  <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>ユーザー数</div>
                  {!editing&&<button onClick={()=>setChart({section:"ユーザー数",metricIdx:0})} style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,color:C.accentDark,cursor:"pointer",fontFamily:"inherit",marginBottom:"0.2rem"}}>📊 グラフ</button>}
                </div>
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>累積ユーザー数</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>月間の合計から自動計算</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{(+d.cumulative||0).toLocaleString()}人</span>
                </div>
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>月間ユーザー数</span>
                  {editing?<InputNum value={d.monthly??0} onChange={v=>setD({monthly:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text}}>{(+d.monthly||0).toLocaleString()}人</span>}
                </div>
              </div>
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
                  <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>HP閲覧数</div>
                  {!editing&&<button onClick={()=>setChart({section:"HP閲覧数",metricIdx:0})} style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,color:C.accentDark,cursor:"pointer",fontFamily:"inherit",marginBottom:"0.2rem"}}>📊 グラフ</button>}
                </div>
                {/* 合算（全月キーのhp合計・自動計算） */}
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}>
                    <span style={{fontSize:"0.87rem",color:C.text}}>累積合計</span>
                    <div style={{fontSize:"0.68rem",color:C.textMuted}}>全月の合計から自動計算</div>
                  </div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>
                    {Object.keys(sysData).reduce((s,k)=>s+(+(sysData[k]?.hp)||0),0).toLocaleString()}PV
                  </span>
                </div>
                {/* 当月入力 */}
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>当月 ({monthLabel(mk)})</span>
                  {editing
                    ? <InputNum value={d.hp??0} onChange={v=>setD({hp:v})}/>
                    : <span style={{fontSize:"1rem",fontWeight:700,color:C.text}}>{(+d.hp||0).toLocaleString()}PV</span>
                  }
                </div>
              </div>
              {editing&&<div style={{background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:"0.75rem",padding:"0.75rem",fontSize:"0.8rem",color:C.accentDark}}>
                💡 月間ユーザー数を変更すると、差分が累積に自動加算されます。HP閲覧数の累積は全月の合計です。
              </div>}
            </div>
          )}

          {/* ── BIZCON ── */}
          {sys==="bizcon" && (
            <div>
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>申込</div>
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>申込者数</span>
                  {editing?<InputNum value={d.applicants??0} onChange={v=>setD({applicants:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text}}>{(+d.applicants||0).toLocaleString()}人</span>}
                </div>
                <div style={{...rowStyle}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>本申込者数</span>
                  {editing?<InputNum value={d.fullApplicants??0} onChange={v=>setD({fullApplicants:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text}}>{(+d.fullApplicants||0).toLocaleString()}人</span>}
                </div>
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>本申込転換率</span></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{d.applicants>0?((d.fullApplicants/d.applicants)*100).toFixed(1)+"%":"－"}</span>
                </div>
              </div>
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>HP閲覧数</div>
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>年間合計</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>月間の合計から自動計算</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{Object.values(d.hpByMonth||{}).reduce((s,v)=>s+(+v||0),0).toLocaleString()}PV</span>
                </div>
                {Array.from({length:12},(_,i)=>i+1).map(m=>{
                  const val=d.hpByMonth?.[m]??0;
                  return (
                    <div key={m} style={{...rowStyle}}>
                      <span style={{fontSize:"0.85rem",color:C.text,flex:1}}>{m}月</span>
                      {editing?(
                        <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}>
                          <InputNum value={val} onChange={v=>setDraft(p=>({...p,hpByMonth:{...(p.hpByMonth||{}),[m]:v}}))}/>
                          <span style={{fontSize:"0.75rem",color:C.textSub}}>PV</span>
                        </div>
                      ):(
                        <span style={{fontSize:"0.9rem",fontWeight:700,color:C.text}}>{(+val||0).toLocaleString()}PV</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {renderChartModal()}
    </div>
  );
}

export default function App() {
  const [data,setData]       = useState(INIT);
  const [users,setUsers]     = useState([]);
  const [currentUser,setCurrentUser] = useState(null);
  const [tab,setTab]         = useState(()=>localStorage.getItem("md_tab")||"tasks");
  const [salesTab,setSalesTab]=useState(()=>localStorage.getItem("md_salesTab")||"muni");
  const [taskTab,setTaskTab]  =useState(()=>localStorage.getItem("md_taskTab")||"info");
  const [navTarget,setNavTarget]=useState(null); // {type:'task'|'project', id}
  const [pjTab,setPjTab]      =useState(()=>localStorage.getItem("md_pjTab")||"tasks");
  const [loaded,setLoaded]   = useState(false);
  const [showUserMenu,setShowUserMenu] = useState(false);
  const [showNotifPanel,setShowNotifPanel] = useState(false);
  const [notifFilter,setNotifFilter] = useState("all");
  const contentRef = useRef(null);
  const scrollPos  = useRef({});   // tab → scrollY

  const persistTab = (newKey, val, setter) => {
    // save current scroll position before switching
    if (contentRef.current) scrollPos.current[tab] = contentRef.current.scrollTop;
    localStorage.setItem(newKey, val); setter(val);
    // restore after render
    requestAnimationFrame(()=>{
      if (contentRef.current) contentRef.current.scrollTop = scrollPos.current[val]||0;
    });
  };

  // __all__ notifications are shown to every logged-in user
  const appNotifs = (data.notifications||[]).filter(n=>n.toUserId===currentUser?.id||n.toUserId==="__all__");
  const appUnread = appNotifs.filter(n=>!n.read);
  const markAllRead = () => {
    const uid=currentUser?.id;
    const nd={...data,notifications:(data.notifications||[]).map(n=>(n.toUserId===uid||n.toUserId==="__all__")?{...n,read:true}:n)};
    setData(nd); saveData(nd);
  };
  const markOneRead = (id) => {
    const nd={...data,notifications:(data.notifications||[]).map(n=>n.id===id?{...n,read:true}:n)};
    setData(nd); saveData(nd);
  };
  const NOTIF_ICON = {task_assign:"👤",task_status:"🔄",task_comment:"💬",mention:"💬",memo:"📝",deadline:"⏰",sales_assign:"🏛️",new_user:"👋",analytics_update:"📊"};

  useEffect(()=>{
    const session = getSession();
    Promise.all([loadData(), loadUsers()]).then(([d,u])=>{
      setData(d); setUsers(u);
      if (session) {
        const fresh = u.find(x=>x.id===session.id);
        if (fresh) { setCurrentUser(fresh); setSession(fresh); }
        else setSession(null);
      }
      setLoaded(true);
    });
  },[]);

  // ── Supabase リアルタイム同期 + ブラウザ通知 ────────────────────────────
  // 最後に確認した通知IDを追跡（ポーリングで新着検出用）
  const lastNotifIdsRef = useRef(null);
  // 最後に自分でsaveした時刻（競合防止用）
  const lastSaveTimeRef = useRef(0);

  useEffect(()=>{
    if(!currentUser) return;
    const poll = async () => {
      try {
        const [d, u] = await Promise.all([loadData(), loadUsers()]);
        // 直近3秒以内に自分がsaveした場合はポーリングによる上書きをスキップ（競合防止）
        const timeSinceSave = Date.now() - (window.__myDeskLastSave || 0);
        if(timeSinceSave > 3000) {
          setData(d);
        }
        setUsers(u);
        // セッションユーザーの最新情報を反映
        const fresh = u.find(x=>x.id===currentUser.id);
        if(fresh) setCurrentUser(cu=>(cu.name===fresh.name&&cu.email===fresh.email)?cu:fresh);

        // ── 新着通知をブラウザ通知で表示 ──────────────────────────────────
        const myNotifs = (d.notifications||[]).filter(n=>
          n.toUserId===currentUser.id || n.toUserId==='__all__'
        );
        if(lastNotifIdsRef.current !== null) {
          const prevIds = lastNotifIdsRef.current;
          const brandNew = myNotifs.filter(n => !prevIds.has(n.id) && !n.read);
          if(brandNew.length > 0 && Notification.permission === 'granted') {
            brandNew.slice(0, 3).forEach(n => {
              try {
                // Service Worker経由で通知（バックグラウンド対応）
                navigator.serviceWorker?.ready.then(reg => {
                  reg.showNotification(n.title || 'MyDesk', {
                    body: n.body || '',
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: n.id?.toString() || 'mydesk',
                    renotify: false,
                    data: { url: '/' },
                  });
                }).catch(() => {
                  // Service Worker未対応ならフォールバック
                  new Notification(n.title || 'MyDesk', {
                    body: n.body || '',
                    icon: '/icon-192.png',
                    tag: n.id?.toString() || 'mydesk',
                  });
                });
              } catch {}
            });
          }
        }
        lastNotifIdsRef.current = new Set(myNotifs.map(n => n.id));
      } catch {}
    };
    // 初回実行
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [currentUser?.id]);
  useEffect(()=>{
    if(!currentUser||!data.tasks) return;
    const todayKey = new Date().toDateString();
    const lastRun = localStorage.getItem("md_reminder_date");
    if(lastRun===todayKey) return; // 1日1回だけ
    localStorage.setItem("md_reminder_date", todayKey);
    const now = new Date(); now.setHours(0,0,0,0);
    const allTasks = [...(data.tasks||[]), ...(data.projects||[]).flatMap(p=>p.tasks||[])];
    const toRemind = allTasks.filter(t=>{
      if(t.status==="完了"||!t.dueDate) return false;
      const assignedToMe=(t.assigneeIds||[]).includes(currentUser.id);
      if(!assignedToMe) return false;
      const d=new Date(t.dueDate); d.setHours(0,0,0,0);
      const diff=Math.round((d-now)/(1000*60*60*24));
      return diff<=1; // 今日・明日・期限超過
    });
    if(!toRemind.length) return;
    let nd=data;
    toRemind.forEach(t=>{
      const d=new Date(t.dueDate); d.setHours(0,0,0,0);
      const diff=Math.round((d-now)/(1000*60*60*24));
      const label=diff<0?`${-diff}日超過`:diff===0?"今日が期限":"明日が期限";
      // 同じタスクの今日分リマインダーが既にあればスキップ
      const already=(nd.notifications||[]).some(n=>
        n.type==="deadline"&&n.entityId===t.id&&new Date(n.date).toDateString()===todayKey
      );
      if(already) return;
      nd=addNotif(nd,{
        type:"deadline",
        title:`⏰ ${label}：「${t.title}」`,
        body:diff<0?"早めに対応してください":"確認してください",
        toUserIds:[currentUser.id],
        fromUserId:null,
        entityId:t.id,
      });
    });
    if(nd!==data){setData(nd);saveData(nd);}
  },[currentUser]);

  // ── プッシュ通知送信ラッパー（addNotifと連動）─────────────────────────────
  const VAPID_PUBLIC_KEY = 'BOlCwpwWlsbXAd_aw4puzgjrshGrRHbsq-fTQYiGnDmsS-4oFknxdZMRoF_Y8p5ObJ7HgVLxW6j5Tl2XLpy5Agg';
  const saveWithPush = (nd, notifsBefore) => {
    setData(nd); saveData(nd);
    // 新しく追加された通知を検出
    const newNotifs = (nd.notifications||[]).filter(n=>
      !(notifsBefore||[]).some(o=>o.id===n.id)
    );
    if(!newNotifs.length) return;
    // ユーザー別にグループ化
    const byUser = {};
    newNotifs.forEach(n=>{
      const uid = n.toUserId;
      if(!uid) return;
      if(!byUser[uid]) byUser[uid]={title:n.title,body:n.body,tag:n.type};
    });
    Object.entries(byUser).forEach(([uid,{title,body,tag}])=>{
      // 他ユーザー → Vercel API経由でWeb Push
      if(uid !== currentUser?.id && uid !== '__all__') {
        sendPushToUsers([uid], title, body, tag);
      }
      // __all__ → 自分以外全員にWeb Push
      if(uid === '__all__') {
        const others = users.filter(u=>u.id!==currentUser?.id).map(u=>u.id);
        if(others.length) sendPushToUsers(others, title, body, tag);
      }
    });
  };

  // ── プッシュ通知購読 ───────────────────────────────────────────────────────
  const subscribePush = async (userId) => {
    // iOSチェック：ホーム画面追加済みPWAのみ対応
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (isIos && !isStandalone) {
      // iOSブラウザ → ホーム画面追加を促す（Notificationは使えないがfalseを返さない）
      alert('iPhoneで通知を受け取るには、Safariのメニューから「ホーム画面に追加」してアプリとして起動してください。');
      return false;
    }
    if (!('Notification' in window)) return false;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
      if (!('serviceWorker' in navigator)) return true; // permission onlyでOK
      const reg = await navigator.serviceWorker.ready;
      if (!reg.pushManager) return true; // SW ready but no push (e.g. some iOS)
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
      });
      // Supabaseに購読情報を保存
      const subs = (await sbGet('push_subs')) || {};
      subs[userId] = sub.toJSON();
      await sbSet('push_subs', subs);
      return true;
    } catch(e) {
      console.warn('Push subscribe failed:', e);
      // 通知許可は取れたがWeb Push登録失敗の場合でもtrueを返す（ポーリング通知は動く）
      if(Notification.permission === 'granted') return true;
      return false;
    }
  };

  const unsubscribePush = async (userId) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      const subs = (await sbGet('push_subs')) || {};
      delete subs[userId];
      await sbSet('push_subs', subs);
    } catch {}
  };

  // Vercel APIを通じてプッシュ通知を送信
  const sendPushToUsers = async (toUserIds, title, body, tag='mydesk') => {
    if (!toUserIds?.length) return;
    try {
      await fetch('/api/send-push', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
        body: JSON.stringify({ toUserIds, title, body, tag }),
      });
    } catch {}
  };

  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(()=>{
    if(!currentUser) return;
    // プッシュ通知が有効かチェック
    if('Notification' in window) setPushEnabled(Notification.permission==='granted');
  },[currentUser?.id]);

  const handleLogin = (user) => {
    setCurrentUser(user);
    setSession(user);
    // ログイン後にプッシュ通知を自動リクエスト（少し遅延）
    setTimeout(()=>subscribePush(user.id).then(ok=>{ if(ok) setPushEnabled(true); }), 2000);
  };
  const handleLogout = () => {
    if(currentUser) unsubscribePush(currentUser.id);
    setSession(null); setCurrentUser(null); setShowUserMenu(false);
  };

  const TABS=[
    {id:"tasks",    emoji:"✅", label:"タスク"},
    {id:"schedule", emoji:"📅", label:"スケジュール"},
    {id:"email",    emoji:"✉️", label:"メール"},
    {id:"sales",    emoji:"💼", label:"営業"},
    {id:"analytics",emoji:"📊", label:"分析"},
    {id:"mypage",   emoji:"⚙️", label:"設定"},
  ];

  if (!loaded) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"1rem"}}>
      <div style={{width:44,height:44,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:C.textSub,fontSize:"0.9rem",fontWeight:600}}>読み込み中...</div>
    </div>
  );

  if (!currentUser) return <AuthScreen onLogin={handleLogin}/>;

  return (
    <div style={{
      height:"100dvh", /* dynamic viewport height - handles mobile browser bars */
      background:C.bg,
      fontFamily:"-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",
      display:"flex",flexDirection:"column",
      maxWidth:"100vw",overflowX:"hidden",
      /* PC: center the app, give side gutters */
      boxSizing:"border-box",
    }}>
      {/* PC-centered wrapper */}
      <style>{`
        html,body,#root{height:100%;margin:0;padding:0;}
        input,textarea,select{font-size:16px !important;} /* prevent iOS auto-zoom */
        @media(min-width:700px){
          .mydesk-sidebar{display:block !important;}
          .mydesk-bottomnav{display:none !important;}
          .mydesk-content{margin-left:200px !important;}
          .mydesk-header{padding-left:200px !important;}
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.15);border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      {/* Header */}
      <div className="mydesk-header" style={{background:"white",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 0 rgba(0,0,0,0.04)",flexShrink:0}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"0 clamp(0.75rem,3vw,1rem)"}}>
          <div style={{display:"flex",alignItems:"center",height:52,gap:"0.625rem"}}>
            <div style={{width:34,height:34,borderRadius:"0.75rem",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.15rem",boxShadow:`0 2px 8px ${C.accent}44`}}>⚡</div>
            <div>
              <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text,letterSpacing:"-0.02em",lineHeight:1.1}}>MyDesk</div>
              <div style={{fontSize:"0.6rem",color:C.textMuted,fontWeight:500}}>チーム業務管理</div>
            </div>

            {/* Notification bell + User menu */}
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"0.5rem",position:"relative"}}>
              {/* Bell */}
              <button onClick={()=>setShowNotifPanel(v=>!v)}
                style={{position:"relative",width:38,height:38,borderRadius:"50%",background:appUnread.length>0?C.accentBg:C.bg,border:`1.5px solid ${appUnread.length>0?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.15s",flexShrink:0}}>
                <span style={{fontSize:"1.1rem",lineHeight:1}}>🔔</span>
                {appUnread.length>0&&(
                  <span style={{position:"absolute",top:-3,right:-3,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.55rem",fontWeight:800,padding:"0.1rem 0.3rem",minWidth:16,textAlign:"center",lineHeight:1.4}}>
                    {appUnread.length}
                  </span>
                )}
              </button>
              {/* User menu button */}
              <div style={{position:"relative"}}>
              <button onClick={()=>setShowUserMenu(v=>!v)}
                style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.4rem 0.75rem",borderRadius:999,border:`1.5px solid ${C.border}`,background:C.bg,cursor:"pointer",fontFamily:"inherit"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",fontWeight:800,color:"white",flexShrink:0}}>
                  {currentUser.name.charAt(0)}
                </div>
                <span style={{fontSize:"0.82rem",fontWeight:700,color:C.text,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser.name}</span>
                <span style={{fontSize:"0.7rem",color:C.textMuted}}>▾</span>
              </button>
              {showUserMenu&&(
                <>
                  <div onClick={()=>setShowUserMenu(false)} style={{position:"fixed",inset:0,zIndex:199}}/>
                  <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"white",borderRadius:"0.875rem",boxShadow:C.shadowMd,border:`1px solid ${C.border}`,zIndex:200,minWidth:200,overflow:"hidden"}}>
                    <div style={{padding:"1rem",borderBottom:`1px solid ${C.borderLight}`}}>
                      <div style={{fontWeight:700,fontSize:"0.9rem",color:C.text}}>{currentUser.name}</div>
                      <div style={{fontSize:"0.75rem",color:C.textMuted,marginTop:"0.15rem"}}>{currentUser.email}</div>
                      {currentUser.phone&&<div style={{fontSize:"0.75rem",color:C.textMuted}}>{currentUser.phone}</div>}
                    </div>
                    {/* プッシュ通知トグル */}
                    <div style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div>
                        <div style={{fontSize:"0.82rem",fontWeight:700,color:C.text}}>🔔 プッシュ通知</div>
                        <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.1rem"}}>{pushEnabled?"有効（端末に通知が届きます）":"無効"}</div>
                      </div>
                      <button onClick={async()=>{
                        if(pushEnabled){await unsubscribePush(currentUser.id);setPushEnabled(false);}
                        else{const ok=await subscribePush(currentUser.id);if(ok)setPushEnabled(true);}
                      }} style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:pushEnabled?"#d1fae5":"#f3f4f6",color:pushEnabled?"#065f46":"#374151",transition:"all 0.15s"}}>
                        {pushEnabled?"ON":"OFF"}
                      </button>
                    </div>
                    <button onClick={handleLogout}
                      style={{width:"100%",padding:"0.875rem 1rem",border:"none",background:"white",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.85rem",color:"#dc2626",textAlign:"left",display:"flex",alignItems:"center",gap:"0.5rem"}}>
                      🚪 ログアウト
                    </button>
                  </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Panel */}
      {showNotifPanel&&(
        <>
          <div onClick={()=>setShowNotifPanel(false)} style={{position:"fixed",inset:0,zIndex:198}}/>
          <div style={{position:"fixed",top:64,right:8,width:360,maxWidth:"calc(100vw - 16px)",background:"white",borderRadius:"1rem",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",border:`1px solid ${C.border}`,zIndex:199,maxHeight:"75vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Header */}
            <div style={{padding:"0.875rem 1rem 0.5rem",borderBottom:`1px solid ${C.borderLight}`,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.625rem"}}>
                <span style={{fontWeight:800,fontSize:"0.9rem",color:C.text}}>🔔 通知 / 受信箱</span>
                {appUnread.length>0&&<span style={{background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.62rem",fontWeight:800,padding:"0.15rem 0.5rem"}}>{appUnread.length}</span>}
                <div style={{marginLeft:"auto",display:"flex",gap:"0.35rem"}}>
                  {appUnread.length>0&&<button onClick={markAllRead} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.5rem",color:C.accent,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",padding:"0.2rem 0.5rem"}}>全既読</button>}
                  <button onClick={()=>{const nd={...data,notifications:(data.notifications||[]).filter(n=>n.toUserId!==currentUser?.id||!n.read)};setData(nd);saveData(nd);}}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"0.5rem",color:C.textMuted,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",padding:"0.2rem 0.5rem"}}>既読削除</button>
                </div>
              </div>
              {/* Filter tabs */}
              <div style={{display:"flex",gap:"0.25rem",overflowX:"auto",paddingBottom:"0.1rem"}}>
                {[["all","すべて",null],["unread","未読",null],["deadline","⏰ 期限","deadline"],["memo","📝 メモ","memo"],["mention","💬 メンション","mention"],["task_assign","👤 タスク","task_assign"],["task_status","🔄 状態","task_status"],["new_user","👋 新規登録","new_user"],["analytics_update","📊 分析","analytics_update"]].map(([id,lbl,type])=>{
                  const cnt=id==="all"?appNotifs.length:id==="unread"?appUnread.length:appNotifs.filter(n=>n.type===type&&!n.read).length;
                  const active=notifFilter===id;
                  return (
                    <button key={id} onClick={()=>setNotifFilter(id)}
                      style={{padding:"0.25rem 0.6rem",borderRadius:999,border:`1.5px solid ${active?C.accent:C.border}`,background:active?C.accent:"white",color:active?"white":C.textSub,fontWeight:700,fontSize:"0.68rem",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                      {lbl}{cnt>0&&id!=="all"?<span style={{marginLeft:"0.2rem",background:active?"rgba(255,255,255,0.35)":"#e5e7eb",borderRadius:999,padding:"0 0.25rem",fontSize:"0.62rem"}}>{cnt}</span>:null}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Notif list */}
            <div style={{overflowY:"auto",flex:1}}>
              {(()=>{
                let filtered=[...appNotifs].reverse();
                if(notifFilter==="unread") filtered=filtered.filter(n=>!n.read);
                else if(notifFilter==="deadline") filtered=filtered.filter(n=>n.type==="deadline");
                else if(notifFilter==="memo") filtered=filtered.filter(n=>n.type==="memo");
                else if(notifFilter==="mention") filtered=filtered.filter(n=>n.type==="mention");
                else if(notifFilter==="task_assign") filtered=filtered.filter(n=>n.type==="task_assign"||n.type==="task_comment");
                else if(notifFilter==="task_status") filtered=filtered.filter(n=>n.type==="task_status");
                else if(notifFilter==="new_user") filtered=filtered.filter(n=>n.type==="new_user");
                else if(notifFilter==="analytics_update") filtered=filtered.filter(n=>n.type==="analytics_update");
                filtered=filtered.slice(0,60);
                if(!filtered.length) return <div style={{padding:"2.5rem",textAlign:"center",color:C.textMuted,fontSize:"0.85rem"}}>{notifFilter==="unread"?"未読通知はありません":"通知はありません"}</div>;
                return filtered.map(n=>(
                  <div key={n.id} onClick={()=>{if(!n.read)markOneRead(n.id);}}
                    style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:n.read?"white":"#eff6ff",display:"flex",gap:"0.625rem",alignItems:"flex-start",cursor:n.read?"default":"pointer"}}>
                    <span style={{fontSize:"1.1rem",flexShrink:0,marginTop:"0.05rem"}}>{NOTIF_ICON[n.type]||"🔔"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"0.8rem",fontWeight:n.read?500:700,color:n.read?C.textSub:C.text,lineHeight:1.4,marginBottom:"0.15rem"}}>{n.title}</div>
                      {n.body&&<div style={{fontSize:"0.73rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>{n.body}</div>}
                      <div style={{fontSize:"0.6rem",color:C.textMuted,marginTop:"0.2rem"}}>{new Date(n.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"0.3rem",flexShrink:0}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:n.read?"transparent":C.accent,display:"block"}}/>
                      <button onClick={e=>{e.stopPropagation();const nd={...data,notifications:(data.notifications||[]).filter(x=>x.id!==n.id)};setData(nd);saveData(nd);}}
                        style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:"0.75rem",padding:0,lineHeight:1}}>✕</button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {/* PC Sidebar Nav */}
      <div className="mydesk-sidebar" style={{display:"none",position:"fixed",top:52,left:0,bottom:0,width:200,background:"white",borderRight:`1px solid ${C.border}`,zIndex:99,overflowY:"auto",padding:"1rem 0.75rem"}}>
        <div style={{fontSize:"0.65rem",fontWeight:800,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.5rem",paddingLeft:"0.5rem"}}>ナビゲーション</div>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>persistTab("md_tab",t.id,setTab)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.625rem 0.75rem",borderRadius:"0.75rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:tab===t.id?800:500,fontSize:"0.87rem",background:tab===t.id?C.accentBg:"transparent",color:tab===t.id?C.accentDark:C.textSub,marginBottom:"0.15rem",textAlign:"left"}}>
            <span style={{fontSize:"1.2rem",lineHeight:1,flexShrink:0}}>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content + BottomNav wrapper */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Content */}
      <div ref={contentRef} className="mydesk-content" data-sales-scroll style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",
        paddingBottom:"calc(5rem + env(safe-area-inset-bottom,0px))"}}>
        <div style={{maxWidth:680,margin:"0 auto",width:"100%",padding:"1.25rem 1rem 0.5rem",boxSizing:"border-box"}}>
          <ErrorBoundary>
            {tab==="tasks"     && <TaskView      data={data} setData={setData} users={users} currentUser={currentUser}
              taskTab={taskTab} setTaskTab={(v)=>persistTab('md_taskTab',v,setTaskTab)}
              pjTab={pjTab} setPjTab={(v)=>persistTab('md_pjTab',v,setPjTab)}
              navTarget={navTarget} clearNavTarget={()=>setNavTarget(null)}/>}
            {tab==="schedule"  && <ScheduleView/>}
            {tab==="email"     && <EmailView     data={data} setData={setData} currentUser={currentUser}/>}
            {tab==="sales"     && <SalesView     data={data} setData={setData} currentUser={currentUser} users={users}
              salesTab={salesTab} setSalesTab={(v)=>persistTab("md_salesTab",v,setSalesTab)}
              onNavigateToTask={(id)=>{setNavTarget({type:"task",id});persistTab("md_tab","tasks",setTab);}}
              onNavigateToProject={(id)=>{setNavTarget({type:"project",id});persistTab("md_tab","tasks",setTab);}}/>}
            {tab==="analytics" && <AnalyticsView data={data} setData={setData} currentUser={currentUser} users={users} saveWithPush={saveWithPush}/>}
            {tab==="mypage"    && <MyPageView currentUser={currentUser} setCurrentUser={setCurrentUser} users={users} setUsers={setUsers} onLogout={handleLogout} pushEnabled={pushEnabled} setPushEnabled={setPushEnabled} subscribePush={subscribePush} unsubscribePush={unsubscribePush}/>}
          </ErrorBoundary>
        </div>
      </div>

      {/* Bottom Nav (mobile) */}
      <div className="mydesk-bottomnav" style={{flexShrink:0,background:"white",borderTop:`1px solid ${C.border}`,boxShadow:"0 -2px 16px rgba(0,0,0,0.06)",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        <div style={{maxWidth:680,margin:"0 auto",display:"flex"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>persistTab("md_tab",t.id,setTab)}
              style={{flex:1,padding:"0.625rem 0.25rem 0.75rem",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.2rem",position:"relative"}}>
              {tab===t.id&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",height:2.5,background:C.accent,borderRadius:"0 0 3px 3px"}}/>}
              <span style={{fontSize:"1.2rem",lineHeight:1}}>{t.emoji}</span>
              <span style={{fontSize:"0.6rem",fontWeight:tab===t.id?800:500,color:tab===t.id?C.accentDark:C.textMuted}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      </div>{/* end content+bottomNav wrapper */}
    </div>
  );
}
