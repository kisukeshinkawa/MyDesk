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
    // まず updated_at 付きで取得を試みる
    const r = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.${encodeURIComponent(id)}&select=data,updated_at`, { headers: SB_HEADERS });
    if(r.ok) {
      const rows = await r.json();
      if(rows?.[0]?.data !== undefined) {
        return { _rawData: rows[0].data, _updatedAt: rows[0].updated_at ?? null };
      }
    }
    // フォールバック: data のみで取得
    const r2 = await fetch(`${SB_URL}/rest/v1/app_data?id=eq.${encodeURIComponent(id)}&select=data`, { headers: SB_HEADERS });
    if(r2.ok) {
      const rows2 = await r2.json();
      if(rows2?.[0]?.data !== undefined) {
        return { _rawData: rows2[0].data, _updatedAt: null };
      }
    }
    return null;
  } catch { return null; }
}

async function sbSet(id, data) {
  const now = new Date().toISOString();
  try {
    await fetch(`${SB_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id, data, updated_at: now }),
    });
    // 書き込み完了後にタイムスタンプを更新（競合防止を書き込み完了時刻から計算）
    window.__myDeskLastSave = Date.now();
    window.__myDeskLastSaveAt = now;
  } catch {}
}

const INIT = { tasks:[], projects:[], emails:[], emailStyles:[], prefectures:[], municipalities:[], vendors:[], companies:[], businessCards:[], notifications:[], changeLogs:[], analytics:{}, emailTemplates:[] };

// ─── SALES CONSTANTS ──────────────────────────────────────────────────────────

const PERMIT_TYPES = [
  "家庭収運","事業収運","一廃収運","産廃収運","産廃処分","産廃収運処分"
];

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
  "見送り":  { color:"#9ca3af", bg:"#f3f4f6" },
};
const COMPANY_STATUS = {
  "未接触":  { color:"#6b7280", bg:"#f3f4f6" },
  "電話済":  { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中":  { color:"#d97706", bg:"#fef3c7" },
  "成約":    { color:"#059669", bg:"#d1fae5" },
  "失注":    { color:"#dc2626", bg:"#fee2e2" },
  "見送り":  { color:"#9ca3af", bg:"#f3f4f6" },
};
const MUNI_STATUS = {
  "未接触": { color:"#6b7280", bg:"#f3f4f6" },
  "電話済": { color:"#2563eb", bg:"#dbeafe" },
  "資料送付":{ color:"#7c3aed", bg:"#ede9fe" },
  "商談中": { color:"#d97706", bg:"#fef3c7" },
  "協定済": { color:"#059669", bg:"#d1fae5" },
  "失注":   { color:"#dc2626", bg:"#fee2e2" },
  "見送り": { color:"#9ca3af", bg:"#f3f4f6" },
};
const VENDOR_LOG_TYPES = ["電話","訪問","資料送付","メール","WEB会議","その他"];
const VENDOR_LOG_ICON  = {"電話":"📞","訪問":"🚗","資料送付":"📄","メール":"✉️","WEB会議":"💻","その他":"📝"};

// アプローチ履歴タイプ（全エンティティ共通）
const APPROACH_TYPES = ["電話","訪問","メール","WEB会議","資料送付","その他"];
const APPROACH_ICON  = {"電話":"📞","訪問":"🚗","メール":"✉️","WEB会議":"💻","資料送付":"📄","その他":"📝"};

// 失注・見送り理由プリセット
const LOSS_REASONS = ["予算不足","競合他社に決定","担当者交代・凍結","時期尚早","ニーズ不一致","連絡取れず","その他"];

// 次回アクション種別
const NEXT_ACTION_TYPES = ["電話","訪問","メール","提案書送付","見積提出","その他"];

// 全営業エンティティの失注・見送りステータス
const CLOSED_STATUSES = new Set(["失注","見送り","断り"]);

// メールテンプレート変数
const EMAIL_TEMPLATE_VARS = ["{{会社名}}","{{担当者名}}","{{自分の名前}}","{{日付}}","{{来週の日付}}"];



// ─── NOTIFICATION HELPER ─────────────────────────────────────────────────────
function addNotif(data, {type, title, body, toUserIds=[], fromUserId=null, entityId=null, entityType=null}) {
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
    entityType: entityType||null,
  }));
  return {...data, notifications:[...(data.notifications||[]), ...newN]};
}

async function loadData() {
  try {
    const result = await sbGet("main");
    if(result && result._rawData !== undefined) {
      const raw = result._rawData;
      // raw がオブジェクトで、INIT のキーを持つ本物のデータか確認
      if(raw && typeof raw === "object" && !Array.isArray(raw)) {
        return { data: {...INIT, ...raw}, updated_at: result._updatedAt };
      }
    }
  } catch{}
  return { data: INIT, updated_at: null };
}
async function saveData(d) {
  // ── データ保護ガード ──────────────────────────────────────────────
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    console.error("MyDesk: saveData rejected invalid data", d); return;
  }
  // INIT のキーを一つも持たない場合は書き込まない（構造破壊を防ぐ）
  const initKeys = Object.keys(INIT);
  const hasAnyKey = initKeys.some(k => k in d);
  if (!hasAnyKey) {
    console.error("MyDesk: saveData rejected — no INIT keys found", d); return;
  }
  // 配列フィールドがすべて空で、かつ現在のDBに保存済みデータがある場合は書き込まない
  // （全消去を防ぐ強化ガード）
  const ARRAY_KEYS = ["tasks","projects","companies","vendors","municipalities","businessCards"];
  const allArraysEmpty = ARRAY_KEYS.every(k => !Array.isArray(d[k]) || d[k].length === 0);
  if (allArraysEmpty) {
    // 既存保存データがあるか確認してから書き込む
    try {
      const check = await sbGet("main");
      if (check?._rawData) {
        const existingHasData = ARRAY_KEYS.some(k => Array.isArray(check._rawData[k]) && check._rawData[k].length > 0);
        if (existingHasData) {
          console.error("MyDesk: saveData rejected — would overwrite non-empty DB with empty arrays", d); return;
        }
      }
    } catch {}
  }
  await sbSet("main", d);
  // 自動スナップショット（3分に1回スロットリング、非同期・非ブロッキング）
  const now = Date.now();
  const last = window.__lastAutoSnap || 0;
  if (now - last > 3 * 60 * 1000) {
    window.__lastAutoSnap = now;
    autoSnapshot(d).catch(() => {});
  }
}

// ─── AUTO SNAPSHOT ────────────────────────────────────────────────────────────
// saveData 呼び出しごとに自動実行。最大 SNAP_MAX 件をローリング保持。
const SNAP_MAX = 500;

async function autoSnapshot(d) {
  try {
    const ts  = new Date().toISOString();
    // キーに使えない文字を除去
    const key = "snap_" + ts.replace(/[:.]/g, "-");
    // スナップショット本体を保存
    await sbSet(key, { savedAt: ts, auto: true, data: d });
    // インデックスを読んで末尾に追記、古いものを削除
    const idxRes = await sbGet("snap_index");
    const idx = Array.isArray(idxRes?._rawData) ? idxRes._rawData : [];
    // 古い自動スナップを SNAP_MAX 件に丸める（手動バックアップは保持）
    const manual = idx.filter(s => !s.auto);
    const autos  = idx.filter(s =>  s.auto);
    const keep   = [...manual, ...autos.slice(-(SNAP_MAX - manual.length))];
    const newIdx = [...keep, { key, savedAt: ts, auto: true }].slice(-SNAP_MAX);
    await sbSet("snap_index", newIdx);
    localStorage.setItem("mydesk_last_snapshot", now => String(Date.now()));
  } catch (e) { console.warn("autoSnapshot failed", e); }
}

// 手動バックアップ（任意ラベル付き）
async function saveSnapshot(d, label) {
  try {
    const ts  = new Date().toISOString();
    const key = "snap_" + ts.replace(/[:.]/g, "-");
    await sbSet(key, { savedAt: ts, auto: false, label, data: d });
    const idxRes = await sbGet("snap_index");
    const idx = Array.isArray(idxRes?._rawData) ? idxRes._rawData : [];
    const newIdx = [...idx, { key, savedAt: ts, auto: false, label }].slice(-SNAP_MAX);
    await sbSet("snap_index", newIdx);
    return key;
  } catch(e) { console.error("snapshot save failed", e); return null; }
}

async function loadSnapshotIndex() {
  try {
    const r = await sbGet("snap_index");
    if (Array.isArray(r?._rawData)) return r._rawData;
  } catch {}
  return [];
}

async function loadSnapshot(key) {
  try {
    const r = await sbGet(key);
    if (r?._rawData) return r._rawData;
  } catch {}
  return null;
}

// ─── GLOBAL CHANGE LOG HELPER ─────────────────────────────────────────────────
function globalAddChangeLog(nd, {entityType,entityId,entityName,field,oldVal,newVal,userId}) {
  const log = {id:Date.now()+Math.random(),entityType,entityId,entityName,field,oldVal:oldVal||"",newVal:newVal||"",userId:userId||null,date:new Date().toISOString()};
  return {...nd,changeLogs:[...(nd.changeLogs||[]),log]};
}

async function loadUsers() {
  try {
    const result = await sbGet("users");
    if(result && result._rawData !== undefined) {
      if(Array.isArray(result._rawData)) return result._rawData;
    }
  } catch{}
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
  // Supabase Storage は日本語・特殊文字を受け付けないため英数字のみに変換
  const ext = file.name.includes(".") ? "." + file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "") : "";
  const safeName = Date.now() + ext;
  const path = `${entityType}/${entityId}/${safeName}`;
  const publicUrl = `${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;

  // アップロード
  const res = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) { const e = await res.text(); throw new Error("HTTP " + res.status + ": " + e); }

  // アップロード後に公開URLへのアクセス確認
  try {
    const check = await fetch(publicUrl, { method: "HEAD" });
    if (!check.ok) {
      throw new Error("ファイルのアップロードは成功しましたが、他のユーザーが閲覧できない状態です。\nSupabase Storage → Policies で「SELECT」ポリシーを追加してください。\n（anon ロール、条件: true）");
    }
  } catch(e) {
    if (e.message.includes("Policies")) throw e;
    // HEADチェック自体が失敗（CORSなど）は無視して続行
  }

  return {
    id: Date.now() + Math.random(),
    name: file.name,
    url: publicUrl,
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

function FileSection({ files=[], onAdd, onDelete, currentUserId, entityType, entityId, readOnly=false }) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const fileInputRef = React.useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("20MB以下のファイルを選択してください"); return; }
    setUploading(true); setError("");
    try {
      const result = await uploadFileToSupabase(file, entityType || "tasks", entityId || currentUserId || "shared");
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
              <a href={f.url||(f.path?`${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${f.path}`:null)||f.path||"#"}
                target="_blank" rel="noopener noreferrer"
                onClick={e=>{
                  const url=f.url||(f.path?`${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${f.path}`:null)||f.path;
                  if(!url){e.preventDefault();alert("ファイルURLが取得できません。再アップロードをお試しください");return;}
                  // iOSでtarget=_blankが効かない場合のフォールバック
                  const isIosUA = typeof navigator!=='undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
                  if(isIosUA){e.preventDefault();window.location.href=url;}
                }}
                style={{fontWeight:600,fontSize:"0.85rem",color:C.accent,textDecoration:"none",display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name||"ファイル"}</a>
              <div style={{fontSize:"0.65rem",color:C.textMuted}}>
                {f.size?fmt(f.size):""}
                {f.uploadedAt?" · "+new Date(f.uploadedAt).toLocaleDateString("ja-JP"):""}
                {!f.url&&<span style={{color:"#dc2626",marginLeft:4}}>⚠ URL未取得</span>}
              </div>
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
function ReviewRequestSection({ task, users=[], uid, allTasks=[], onRequestReview, onRejectReview, onApproveReview }) {
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
          {/* 確認完了済みバナー */}
          {task.reviewOf && task.reviewOf.approved && (
            <div style={{background:"#d1fae5",border:"1.5px solid #6ee7b7",borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.8rem",fontWeight:800,color:"#065f46"}}>✅ 確認完了済み</div>
              <div style={{fontSize:"0.78rem",color:"#047857",marginTop:"0.25rem"}}>元タスク：{originalTask ? originalTask.title : task.reviewOf.taskTitle}</div>
            </div>
          )}
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
              <button onClick={()=>{if(window.confirm("確認完了としてよろしいですか?\n元のタスクも「完了」に変更されます。"))onApproveReview(task.id);}}
                style={{width:"100%",padding:"0.875rem",borderRadius:"0.875rem",border:"none",background:"linear-gradient(135deg,#059669,#047857)",color:"white",fontWeight:800,fontSize:"1rem",cursor:"pointer",fontFamily:"inherit",marginBottom:"0.5rem",boxShadow:"0 2px 8px rgba(5,150,105,0.35)",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                <span style={{fontSize:"1.25rem"}}>✅</span> 確認完了
              </button>
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

      {/* 確認完了済み（依頼者側） */}
      {reviewTasks.some(rt => rt.reviewOf && rt.reviewOf.approved) && (
        <div style={{background:"#d1fae5",border:"1.5px solid #6ee7b7",borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"0.75rem"}}>
          <div style={{fontSize:"0.8rem",fontWeight:800,color:"#065f46",marginBottom:"0.25rem"}}>✅ 確認完了</div>
          <div style={{fontSize:"0.78rem",color:"#047857"}}>
            {(()=>{const rt=reviewTasks.find(r=>r.reviewOf&&r.reviewOf.approved);const u=users.find(x=>(rt.assignees||[]).includes(x.id));return "確認者: "+(u?u.name:"不明");})()}
          </div>
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
        String(m.prefectureId) === String(pref.id) && normStr(m.name) === normStr(sheet.muniName)
      );
      if (!muni) {
        muni = {
          id: "m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),
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
            id: "v_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),
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
      const existingResult = await loadData();
      const existingData = existingResult?.data || INIT; // ← .data を正しく取り出す
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

// ─── SALES REF PICKER ────────────────────────────────────────────────────────
function SalesRefPicker({value, onChange, salesData={}}) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState("企業");
  const [q,    setQ]    = useState("");
  const [pos,  setPos]  = useState({top:0,left:0,width:280});
  const btnRef = useRef(null);
  const TABS = [["企業","🏢","companies"],["業者","🔧","vendors"],["自治体","🏛️","municipalities"]];
  const COLOR = {"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"};
  const items = (salesData[TABS.find(t=>t[0]===tab)?.[2]] || [])
    .filter(x=>!q||(x.name||"").includes(q));

  const handleOpen = () => {
    if(!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({top: r.bottom + 4, left: r.left, width: Math.max(r.width, 280)});
    setOpen(true);
    setQ("");
  };

  return (
    <div style={{marginBottom:"0.75rem"}}>
      <div style={{fontSize:"0.72rem",fontWeight:700,color:"#6b7280",marginBottom:"0.35rem"}}>営業紐付け（任意）</div>
      {value ? (
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.45rem 0.75rem",background:"#f0f9ff",border:"1.5px solid #bae6fd",borderRadius:"0.625rem"}}>
          <span style={{fontSize:"0.68rem",fontWeight:800,color:"white",background:COLOR[value.type]||"#64748b",borderRadius:999,padding:"0.1rem 0.45rem"}}>{value.type}</span>
          <span style={{fontSize:"0.85rem",fontWeight:700,color:"#0369a1",flex:1}}>{value.name}</span>
          <button onClick={()=>onChange(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"1rem",lineHeight:1,padding:"0 0.1rem"}}>✕</button>
        </div>
      ) : (
        <button ref={btnRef} onClick={handleOpen}
          style={{width:"100%",padding:"0.45rem 0.75rem",borderRadius:"0.625rem",border:"1.5px dashed #cbd5e1",background:"white",color:"#94a3b8",fontSize:"0.82rem",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
          🔗 営業先を紐付ける
        </button>
      )}
      {open && <>
        <div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,zIndex:490}}/>
        <div style={{position:"fixed",top:pos.top,left:pos.left,width:pos.width,zIndex:491,border:"1.5px solid #e2e8f0",borderRadius:"0.75rem",background:"white",overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
          {/* タブ */}
          <div style={{display:"flex",borderBottom:"1px solid #e2e8f0"}}>
            {TABS.map(([lbl,icon])=>(
              <button key={lbl} onClick={()=>{setTab(lbl);setQ("");}}
                style={{flex:1,padding:"0.45rem 0",border:"none",background:tab===lbl?"#eff6ff":"white",color:tab===lbl?COLOR[lbl]:"#6b7280",fontWeight:tab===lbl?800:500,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>
                {icon} {lbl}
              </button>
            ))}
          </div>
          {/* 検索 */}
          <div style={{padding:"0.4rem 0.6rem",borderBottom:"1px solid #f1f5f9"}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="検索..." autoFocus
              style={{width:"100%",padding:"0.3rem 0.5rem",border:"1px solid #e2e8f0",borderRadius:"0.5rem",fontSize:"0.82rem",fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
          </div>
          {/* リスト */}
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {items.length===0
              ? <div style={{padding:"1rem",textAlign:"center",color:"#94a3b8",fontSize:"0.8rem"}}>データなし</div>
              : items.map(x=>(
                <div key={x.id} onClick={()=>{onChange({type:tab,id:String(x.id),name:x.name});setOpen(false);}}
                  style={{padding:"0.5rem 0.75rem",cursor:"pointer",fontSize:"0.85rem",color:"#1e293b",borderBottom:"1px solid #f8fafc"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f9ff"}
                  onMouseLeave={e=>e.currentTarget.style.background="white"}>
                  {x.name}
                </div>
              ))
            }
          </div>
        </div>
      </>}
    </div>
  );
}

// ─── TASK FORM ────────────────────────────────────────────────────────────────
function TaskForm({initial={},onSave,onClose,users=[],currentUserId=null,salesData={}}) {
  const [f,setF]=useState({
    title:initial.title||"",status:initial.status||"未着手",
    dueDate:initial.dueDate||"",notes:initial.notes||"",
    assignees:initial.assignees||(currentUserId?[currentUserId]:[]),
    isPrivate:initial.isPrivate||false,
    salesRef:initial.salesRef||null,
  });
  return (
    <div>
      <FieldLbl label="タイトル *"><Input value={f.title} onChange={e=>setF({...f,title:e.target.value})} placeholder="タスク名" autoFocus/></FieldLbl>
      <FieldLbl label="ステータス"><SelectEl value={f.status} onChange={e=>setF({...f,status:e.target.value})}>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</SelectEl></FieldLbl>
      <FieldLbl label="期限"><Input type="date" value={f.dueDate} onChange={e=>setF({...f,dueDate:e.target.value})}/></FieldLbl>
      <UserPicker users={users} selected={f.assignees} onChange={v=>setF({...f,assignees:v})} label="担当者"/>
      <SalesRefPicker value={f.salesRef} onChange={v=>setF({...f,salesRef:v})} salesData={salesData}/>
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
function ProjectForm({initial={},onSave,onClose,users=[],currentUserId=null,salesData={}}) {
  const [f,setF]=useState({
    name:initial.name||"",notes:initial.notes||"",
    members:initial.members||(currentUserId?[currentUserId]:[]),
    isPrivate:initial.isPrivate||false,
    salesRef:initial.salesRef||null,
  });
  return (
    <div>
      <FieldLbl label="プロジェクト名 *"><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="例：DX推進プロジェクト" autoFocus/></FieldLbl>
      <UserPicker users={users} selected={f.members} onChange={v=>setF({...f,members:v})} label="メンバー"/>
      <SalesRefPicker value={f.salesRef} onChange={v=>setF({...f,salesRef:v})} salesData={salesData}/>
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
    if(toIds.length) nd = addNotif(nd,{type:"task_comment",entityId:task.id,entityType:"task",title:`「${task.title}」にコメントが追加されました`,body:text.slice(0,60),toUserIds:toIds,fromUserId:uid});
    // 自己完結保存+プッシュ
    setData(nd); saveData(nd);
    if(toIds.length) {
      fetch('/api/send-push',{method:'POST',headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
        body:JSON.stringify({toUserIds:toIds,title:`「${task.title}」にコメントが追加されました`,body:text.slice(0,60),tag:'task_comment'})
      }).then(r=>r.json()).then(d=>console.log('[MyDesk] push sent:',d)).catch(e=>console.warn('[MyDesk] push failed:',e));
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

// ─── ACTIVITY LOG COMPONENT ──────────────────────────────────────────────────
// タスク・プロジェクト・営業など全エンティティのログを最下部に表示
function ActivityLog({ data, users=[], filterTypes=null }) {
  const [open,    setOpen]    = useState(false);
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");
  const [page,    setPage]    = useState(0);
  const PAGE = 30;

  const TYPE_META = {
    "タスク":      { bg:"#dbeafe", color:"#1d4ed8", icon:"✅" },
    "プロジェクト":{ bg:"#ede9fe", color:"#7c3aed", icon:"📁" },
    "企業":        { bg:"#d1fae5", color:"#059669", icon:"🏢" },
    "業者":        { bg:"#fef3c7", color:"#d97706", icon:"🔧" },
    "自治体":      { bg:"#fce7f3", color:"#db2777", icon:"🏛️" },
  };

  const FIELD_ICON = {
    "登録":"➕", "削除":"🗑️", "ステータス":"🔄", "担当者":"👤",
    "タイトル":"✏️", "期限":"📅", "優先度":"⚡", "ダストーク":"♻️",
    "連携協定":"🤝", "アプローチ":"📞", "プロジェクト名":"✏️", "営業紐付け":"🔗",
  };

  const allLogs = [...(data?.changeLogs || [])].sort((a,b) => new Date(b.date) - new Date(a.date));

  // filterTypes で絞り込み（タブごとに渡す）
  const scopedLogs = filterTypes ? allLogs.filter(l => filterTypes.includes(l.entityType)) : allLogs;

  const types = ["all", ...new Set(scopedLogs.map(l=>l.entityType).filter(Boolean))];

  const filtered = scopedLogs.filter(l => {
    if (filter !== "all" && l.entityType !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (l.entityName||"").toLowerCase().includes(q)
          || (l.field||"").toLowerCase().includes(q)
          || (l.newVal||"").toLowerCase().includes(q)
          || (users.find(u=>u.id===l.userId)?.name||"").toLowerCase().includes(q);
    }
    return true;
  });

  const paged = filtered.slice(0, (page+1)*PAGE);
  const hasMore = filtered.length > paged.length;

  const fmtDate = iso => {
    if(!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if(diff < 60000)  return "たった今";
    if(diff < 3600000) return `${Math.floor(diff/60000)}分前`;
    if(diff < 86400000) return `${Math.floor(diff/3600000)}時間前`;
    return d.toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"}) + " " + d.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  };

  return (
    <div style={{marginTop:"1.5rem", borderTop:`2px solid ${C.borderLight}`}}>
      {/* ヘッダー（クリックで開閉） */}
      <button onClick={()=>{setOpen(v=>!v); if(!open) setPage(0);}}
        style={{width:"100%",display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.875rem 0",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
        <span style={{fontSize:"1rem"}}>📋</span>
        <span style={{fontWeight:800,fontSize:"0.88rem",color:C.text}}>活動ログ</span>
        {scopedLogs.length>0 && <span style={{fontSize:"0.7rem",background:C.accentBg,color:C.accent,borderRadius:999,padding:"0.1rem 0.5rem",fontWeight:700}}>{scopedLogs.length}件</span>}
        <span style={{marginLeft:"auto",fontSize:"0.75rem",color:C.textMuted}}>{open?"▲":"▼"}</span>
      </button>

      {open && (
        <div style={{paddingBottom:"2rem"}}>
          {/* フィルター＋検索 */}
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem",marginBottom:"0.75rem"}}>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="🔍 名前・操作で検索..."
              style={{width:"100%",padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.82rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:"0.375rem",flexWrap:"wrap"}}>
              {types.map(t=>(
                <button key={t} onClick={()=>{setFilter(t);setPage(0);}}
                  style={{padding:"0.25rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",
                    fontSize:"0.72rem",fontWeight:filter===t?800:500,
                    background:filter===t?(TYPE_META[t]?.bg||C.accent):"white",
                    color:filter===t?(TYPE_META[t]?.color||"white"):C.textSub,
                    boxShadow:C.shadow}}>
                  {t==="all"?"すべて":(TYPE_META[t]?.icon+" "+t)}
                </button>
              ))}
            </div>
          </div>

          {/* ログ一覧 */}
          {!filtered.length && (
            <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem"}}>ログがありません</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:"0.375rem"}}>
            {paged.map((log,i)=>{
              const user = users.find(u=>u.id===log.userId);
              const tm = TYPE_META[log.entityType] || {bg:"#f1f5f9",color:"#475569",icon:"📝"};
              const fi = FIELD_ICON[log.field] || "📝";
              return (
                <div key={log.id||i} style={{background:"white",borderRadius:"0.75rem",padding:"0.625rem 0.875rem",border:`1px solid ${C.borderLight}`,display:"flex",gap:"0.625rem",alignItems:"flex-start"}}>
                  {/* 種別アイコン */}
                  <div style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:tm.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.8rem",marginTop:"0.05rem"}}>
                    {tm.icon}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    {/* 1行目: エンティティ名 + 操作 */}
                    <div style={{display:"flex",alignItems:"center",gap:"0.375rem",flexWrap:"wrap",marginBottom:"0.2rem"}}>
                      <span style={{fontSize:"0.8rem",fontWeight:700,color:C.text,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.entityName||"—"}</span>
                      <span style={{fontSize:"0.7rem",background:tm.bg,color:tm.color,borderRadius:999,padding:"0.05rem 0.4rem",fontWeight:700,flexShrink:0}}>{log.entityType}</span>
                    </div>
                    {/* 2行目: 操作内容 */}
                    <div style={{display:"flex",alignItems:"center",gap:"0.3rem",flexWrap:"wrap"}}>
                      <span style={{fontSize:"0.72rem",color:C.textMuted,flexShrink:0}}>{fi}</span>
                      <span style={{fontSize:"0.72rem",color:C.textSub,fontWeight:600,flexShrink:0}}>{log.field}</span>
                      {log.oldVal&&<><span style={{fontSize:"0.7rem",color:"#dc2626",background:"#fff1f2",borderRadius:"0.25rem",padding:"0 0.3rem",maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"line-through"}}>{log.oldVal}</span><span style={{fontSize:"0.68rem",color:C.textMuted}}>→</span></>}
                      {log.newVal&&<span style={{fontSize:"0.7rem",color:"#059669",background:"#f0fdf4",borderRadius:"0.25rem",padding:"0 0.3rem",fontWeight:600,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.newVal}</span>}
                    </div>
                    {/* 3行目: 誰が・いつ */}
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.2rem"}}>
                      {user && <span style={{fontSize:"0.65rem",color:C.textMuted,fontWeight:600}}>👤 {user.name}</span>}
                      <span style={{fontSize:"0.65rem",color:C.textMuted,marginLeft:user?"0":"auto"}}>{fmtDate(log.date)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* もっと見る */}
          {hasMore && (
            <button onClick={()=>setPage(p=>p+1)}
              style={{width:"100%",marginTop:"0.625rem",padding:"0.625rem",borderRadius:"0.75rem",border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontSize:"0.8rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              さらに表示（残り{filtered.length-paged.length}件）
            </button>
          )}
        </div>
      )}
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
  const [tMemoEdit,setTMemoEdit]= useState(null); // {entityId,memoId,text}
  const [tChatEdit,setTChatEdit]= useState(null); // {entityId,chatId,text}

  const [taskDupModal,setTaskDupModal] = useState(null);  // 重複確認モーダル
  const [showMineOnly, setShowMineOnly] = React.useState(false);
  const [winWidth, setWinWidth] = React.useState(window.innerWidth);
  React.useEffect(()=>{ const h=()=>setWinWidth(window.innerWidth); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  const isWide = winWidth >= 780;

  // ── 折りたたみ状態（localStorage永続化）────────────────────────────────
  const [pjSectionOpen,  setPjSectionOpen]  = useState(()=>{ try{ return JSON.parse(localStorage.getItem("md_pjSectionOpen") ??"true"); }catch{ return true; }});
  const [taskSectionOpen,setTaskSectionOpen]= useState(()=>{ try{ return JSON.parse(localStorage.getItem("md_taskSectionOpen")??"true"); }catch{ return true; }});
  const [pjArchiveOpen,  setPjArchiveOpen]  = useState(false); // 完了プロジェクトは初期非表示
  const [collapsedPjs,   setCollapsedPjs]   = useState(()=>{ try{ return new Set(JSON.parse(localStorage.getItem("md_collapsedPjs")||"[]")); }catch{ return new Set(); }});
  const [collapsedStats, setCollapsedStats] = useState(()=>{ try{ const saved=JSON.parse(localStorage.getItem("md_collapsedStats")||"null"); if(saved) return new Set(saved); }catch{} // デフォルト：「完了」は常に折りたたみ
    return new Set(["standalone_完了"]); });
  // 完了ステータスは常に折りたたみ（ユーザー操作に関わらず）
  const isStatCollapsed = (key) => collapsedStats.has(key) || key.endsWith("_完了");

  const togglePjSection  = () => setPjSectionOpen(v=>{ const n=!v; localStorage.setItem("md_pjSectionOpen", JSON.stringify(n)); return n; });
  const toggleTaskSection= () => setTaskSectionOpen(v=>{ const n=!v; localStorage.setItem("md_taskSectionOpen", JSON.stringify(n)); return n; });
  const togglePj = (id) => setCollapsedPjs(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); localStorage.setItem("md_collapsedPjs",JSON.stringify([...n])); return n; });
  const toggleStat = (s) => setCollapsedStats(prev=>{ const n=new Set(prev); n.has(s)?n.delete(s):n.add(s); localStorage.setItem("md_collapsedStats",JSON.stringify([...n])); return n; });

  // ── ローカル保存＋プッシュ（App に依存しない自己完結版）────────────────
  const saveWithPush = React.useCallback((nd, notifsBefore) => {
    // ── データ保護ガード ──────────────────────────────────────────────────
    if (!nd || typeof nd !== "object" || Array.isArray(nd)) {
      console.error("MyDesk: saveWithPush rejected invalid data", nd); return;
    }
    // 主要キーが全て消えているような空データは保存しない
    const hasContent = ["tasks","projects","companies","vendors","municipalities","businessCards"].some(k=>Array.isArray(nd[k])&&nd[k].length>0);
    const currentHasContent = ["tasks","projects","companies","vendors","municipalities","businessCards"].some(k=>Array.isArray(data[k])&&data[k].length>0);
    if(currentHasContent && !hasContent) {
      console.error("MyDesk: saveWithPush rejected — would wipe existing data", nd); return;
    }
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

      // プッシュ通知（notifyMode が "push" or "both" or 未設定のユーザー）
      const pushTargets = targets.filter(id=>{
        const u = users.find(x=>x.id===id);
        return !u?.notifyMode || u.notifyMode==='push' || u.notifyMode==='both';
      });
      if(pushTargets.length){
        fetch('/api/send-push',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
          body:JSON.stringify({toUserIds:pushTargets,title,body,tag}),
        }).catch(()=>{});
      }

      // メール通知（notifyMode が "email" or "both" のユーザー）
      const emailTargets = targets.filter(id=>{
        const u = users.find(x=>x.id===id);
        return u?.notifyMode==='email' || u?.notifyMode==='both';
      });
      emailTargets.forEach(id=>{
        const u = users.find(x=>x.id===id);
        const toAddr = 'bm-dx@beetle-ems.com';
        const emailBody = `【${u?.name||'メンバー'}宛】\n${body}\n\n──\nMyDesk チーム業務管理`;
        fetch('/api/send-email',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-mydesk-secret':'mydesk2026'},
          body:JSON.stringify({to:toAddr,toName:u?.name||'',subject:title,body:emailBody}),
        }).catch(()=>{});
      });
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
  const allFilteredProjects = showMineOnly ? allVisibleProjects.filter(p=>(p.members||[]).includes(uid)||p.createdBy===uid) : allVisibleProjects;
  const visibleProjects  = allFilteredProjects.filter(p=>p.status!=="完了");
  const archivedProjects = allFilteredProjects.filter(p=>p.status==="完了");

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
      entityId: task.id,
      entityType: "task",
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

  // 確認完了処理
  const approveReview = (reviewTaskId) => {
    const reviewTask = allTasks.find(t => t.id === reviewTaskId);
    if (!reviewTask || !reviewTask.reviewOf) return;
    const originalTaskId = reviewTask.reviewOf.taskId;
    const fromUserId = reviewTask.reviewOf.fromUserId;
    const myName = users.find(u => u.id === uid) ? users.find(u => u.id === uid).name : "";
    let nd = {
      ...data,
      tasks: allTasks.map(t => {
        if (t.id === reviewTaskId) return { ...t, status: "完了", reviewOf: { ...t.reviewOf, approved: true, approvedAt: new Date().toISOString() } };
        if (t.id === originalTaskId) return { ...t, status: "完了" };
        return t;
      })
    };
    if (fromUserId) {
      nd = addNotif(nd, {
        type: "task_status",
        entityId: originalTaskId,
        entityType: "task",
        title: "確認完了: " + reviewTask.reviewOf.taskTitle,
        body: "確認者: " + myName + " が確認完了しました",
        toUserIds: [fromUserId],
        fromUserId: uid,
      });
    }
    saveWithPush(nd, data.notifications);
  };

  const addFileToTask = (taskId, file) => {
    const nd = { ...data, tasks: allTasks.map(t => t.id === taskId ? { ...t, files: [...(t.files||[]), file] } : t) };
    window.__myDeskLastSave = Date.now();
    setData(nd); saveData(nd);
  };
  const removeFileFromTask = (taskId, fileIdOrUrl) => {
    const nd = { ...data, tasks: allTasks.map(t => t.id === taskId ? { ...t, files: (t.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl) } : t) };
    window.__myDeskLastSave = Date.now();
    setData(nd); saveData(nd);
  };
  const addFileToPj = (pjId, file) => {
    const nd = { ...data, projects: allProjects.map(p => p.id === pjId ? { ...p, files: [...(p.files||[]), file] } : p) };
    window.__myDeskLastSave = Date.now();
    setData(nd); saveData(nd);
  };
  const removeFileFromPj = (pjId, fileIdOrUrl) => {
    const nd = { ...data, projects: allProjects.map(p => p.id === pjId ? { ...p, files: (p.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl) } : p) };
    window.__myDeskLastSave = Date.now();
    setData(nd); saveData(nd);
  };

  const updateTask = (id,ch) => {
    const prev = allTasks.find(t=>t.id===id);
    let nd = {...data,tasks:allTasks.map(t=>t.id===id?{...t,...ch}:t)};
    const updated = nd.tasks.find(t=>t.id===id);
    // ── ChangeLog ──
    const logFields = [["status","ステータス"],["title","タイトル"],["dueDate","期限"],["priority","優先度"]];
    logFields.forEach(([f,label])=>{
      if(ch[f]!==undefined && prev?.[f]!==ch[f])
        nd=globalAddChangeLog(nd,{entityType:"タスク",entityId:id,entityName:updated?.title||prev?.title||"",field:label,oldVal:String(prev?.[f]||""),newVal:String(ch[f]||""),userId:uid});
    });
    if(ch.assignees && JSON.stringify(prev?.assignees||[])!==JSON.stringify(ch.assignees||[])) {
      const oldNames=(prev?.assignees||[]).map(i=>users.find(u=>u.id===i)?.name||i).join(",");
      const newNames=(ch.assignees||[]).map(i=>users.find(u=>u.id===i)?.name||i).join(",");
      nd=globalAddChangeLog(nd,{entityType:"タスク",entityId:id,entityName:updated?.title||prev?.title||"",field:"担当者",oldVal:oldNames,newVal:newNames,userId:uid});
    }
    if(ch.salesRef!==undefined && JSON.stringify(prev?.salesRef||null)!==JSON.stringify(ch.salesRef||null)) {
      nd=globalAddChangeLog(nd,{entityType:"タスク",entityId:id,entityName:updated?.title||prev?.title||"",field:"営業紐付け",oldVal:prev?.salesRef?.name||"なし",newVal:ch.salesRef?.name||"なし",userId:uid});
    }
    // Notify on status change
    if(ch.status && prev?.status !== ch.status) {
      const toIds=(updated.assignees||[]).filter(i=>i!==uid);
      if(toIds.length) nd=addNotif(nd,{type:"task_status",entityId:updated.id,entityType:"task",title:`「${updated.title}」のステータスが変更されました`,body:`${ch.status}`,toUserIds:toIds,fromUserId:uid});
    }
    // Notify on new assignees
    if(ch.assignees) {
      const prev_a=prev?.assignees||[];
      const newlyAdded=(ch.assignees||[]).filter(i=>i!==uid&&!prev_a.includes(i));
      if(newlyAdded.length) nd=addNotif(nd,{type:"task_assign",entityId:updated.id,entityType:"task",title:`「${updated.title}」に担当者として追加されました`,body:"",toUserIds:newlyAdded,fromUserId:uid});
    }
    saveWithPush(nd, data.notifications);
  };
  const _doAddTask = (f,pjId=null) => {
    const item={id:Date.now(),...f,projectId:pjId,createdBy:uid,comments:[],memos:[],chat:[],createdAt:new Date().toISOString()};
    let nd={...data,tasks:[...allTasks,item]};
    nd=globalAddChangeLog(nd,{entityType:"タスク",entityId:item.id,entityName:item.title||"",field:"登録",oldVal:"",newVal:"新規作成",userId:uid});
    // Auto-add task assignees to project members
    if(pjId){
      const pj=allProjects.find(p=>p.id===pjId);
      if(pj){
        const newMembers=[...new Set([...(pj.members||[]),...(f.assignees||[])])];
        if(newMembers.length!==(pj.members||[]).length){
          nd={...nd,projects:nd.projects.map(p=>p.id===pjId?{...p,members:newMembers}:p)};
          // プロジェクトに新規追加されたメンバーに通知
          const addedToProject=(f.assignees||[]).filter(i=>!(pj.members||[]).includes(i)&&i!==uid);
          if(addedToProject.length) nd=addNotif(nd,{type:"task_assign",entityId:pj.id,entityType:"project",title:`「${pj.name}」のプロジェクトメンバーに追加されました`,body:`タスク「${item.title}」への追加によりメンバーになりました`,toUserIds:addedToProject,fromUserId:uid});
        }
      }
    }
    // Notify assignees on task creation
    const toIds=(f.assignees||[]).filter(i=>i!==uid);
    if(toIds.length) nd=addNotif(nd,{type:"task_assign",entityType:"task",title:`「${item.title}」に担当者として追加されました`,body:"",toUserIds:toIds,fromUserId:uid,entityId:item.id});
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
  const deleteTask = id => {
    const t=allTasks.find(x=>x.id===id);
    let u={...data,tasks:allTasks.filter(t=>t.id!==id)};
    u=globalAddChangeLog(u,{entityType:"タスク",entityId:id,entityName:t?.title||"",field:"削除",oldVal:t?.title||"",newVal:"",userId:uid});
    setData(u); saveData(u);
  };
  const _doAddProject = (f) => {
    const item={id:Date.now(),...f,createdBy:uid,memos:[],chat:[],createdAt:new Date().toISOString()};
    let nd={...data,projects:[...allProjects,item]};
    nd=globalAddChangeLog(nd,{entityType:"プロジェクト",entityId:item.id,entityName:item.name||"",field:"登録",oldVal:"",newVal:"新規作成",userId:uid});
    const toIds=(f.members||[]).filter(i=>i!==uid);
    if(toIds.length) nd=addNotif(nd,{type:"task_assign",entityType:"project",title:`「${item.name}」プロジェクトのメンバーに追加されました`,body:"",toUserIds:toIds,fromUserId:uid,entityId:item.id});
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
  const updateProject = (id,ch) => {
    const prev=allProjects.find(p=>p.id===id);
    let u={...data,projects:allProjects.map(p=>p.id===id?{...p,...ch}:p)};
    const logFields=[["status","ステータス"],["name","プロジェクト名"],["dueDate","期限"]];
    logFields.forEach(([f,label])=>{
      if(ch[f]!==undefined && prev?.[f]!==ch[f])
        u=globalAddChangeLog(u,{entityType:"プロジェクト",entityId:id,entityName:ch.name||prev?.name||"",field:label,oldVal:String(prev?.[f]||""),newVal:String(ch[f]||""),userId:uid});
    });
    if(ch.salesRef!==undefined && JSON.stringify(prev?.salesRef||null)!==JSON.stringify(ch.salesRef||null)) {
      u=globalAddChangeLog(u,{entityType:"プロジェクト",entityId:id,entityName:ch.name||prev?.name||"",field:"営業紐付け",oldVal:prev?.salesRef?.name||"なし",newVal:ch.salesRef?.name||"なし",userId:uid});
    }
    setData(u); saveData(u);
  };
  const deleteProject = id => {
    const pj=allProjects.find(p=>p.id===id);
    let u={...data,projects:allProjects.filter(p=>p.id!==id),tasks:allTasks.filter(t=>t.projectId!==id)};
    u=globalAddChangeLog(u,{entityType:"プロジェクト",entityId:id,entityName:pj?.name||"",field:"削除",oldVal:pj?.name||"",newVal:"",userId:uid});
    setData(u); saveData(u);
  };

  // ── Memo / Chat for tasks & projects ────────────────────────────────────
  const addTMemo = (entityKey, entityId, text) => {
    if(!text?.trim()) return;
    const memo = {id:Date.now(), userId:uid, text, date:new Date().toISOString()};
    const arr = (data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:[...(x.memos||[]),memo]}:x);
    const entity = (data[entityKey]||[]).find(x=>x.id===entityId);
    let nd = {...data,[entityKey]:arr};
    const toAll = users.filter(u=>u.id!==uid).map(u=>u.id);
    const eTypeMemo = entityKey==="tasks"?"task":entityKey==="projects"?"project":entityKey;
    const targetMemoIds=[...(entity?.assignees||[]),entity?.createdBy,(entity?.members||[])].flat().filter(Boolean);
    const toMemoTask=[...new Set(targetMemoIds)].filter(i=>i!==uid);
    const toMemoFinal=toMemoTask.length?toMemoTask:toAll;
    if(toMemoFinal.length) nd = addNotif(nd,{type:"memo",entityId,entityType:eTypeMemo,title:`「${entity?.title||entity?.name||""}」にメモが追加されました`,body:text.slice(0,60),toUserIds:toMemoFinal,fromUserId:uid});
    saveWithPush(nd, data.notifications);
    setTMemoIn(p=>({...p,[entityId]:""}));
  };
  const updateTMemo = (entityKey, entityId, memoId, newText) => {
    if(!newText?.trim()) return;
    const nd = {...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:(x.memos||[]).map(m=>m.id===memoId?{...m,text:newText,editedAt:new Date().toISOString()}:m)}:x)};
    saveWithPush(nd, data.notifications);
    setTMemoEdit(null);
  };
  const deleteTMemo = (entityKey, entityId, memoId) => {
    const nd = {...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:(x.memos||[]).filter(m=>m.id!==memoId)}:x)};
    saveWithPush(nd, data.notifications);
  };
  const updateTChat = (entityKey, entityId, chatId, newText) => {
    if(!newText?.trim()) return;
    const nd = {...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:(x.chat||[]).map(m=>m.id===chatId?{...m,text:newText,editedAt:new Date().toISOString()}:m)}:x)};
    saveWithPush(nd, data.notifications);
    setTChatEdit(null);
  };
  const deleteTChat = (entityKey, entityId, chatId) => {
    const nd = {...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:(x.chat||[]).filter(m=>m.id!==chatId)}:x)};
    saveWithPush(nd, data.notifications);
  };
  const addTChat = (entityKey, entityId, text) => {
    if(!text?.trim()) return;
    const msg = {id:Date.now(), userId:uid, text, date:new Date().toISOString()};
    const arr = (data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:[...(x.chat||[]),msg]}:x);
    const entity = (data[entityKey]||[]).find(x=>x.id===entityId);
    const eType = entityKey==="tasks"?"task":entityKey==="projects"?"project":entityKey;
    let nd = {...data,[entityKey]:arr};
    // 担当者+作成者に通知（自分以外）
    const targetIds=[...(entity?.assignees||[]),entity?.createdBy,(entity?.members||[])].flat().filter(Boolean);
    const assignees=[...new Set(targetIds)].filter(i=>i!==uid);
    if(assignees.length) nd = addNotif(nd,{type:"task_comment",entityId,entityType:eType,title:`「${entity?.title||entity?.name||""}」にチャットが投稿されました`,body:(users.find(u=>u.id===uid)?.name||"")+": "+text.slice(0,50),toUserIds:assignees,fromUserId:uid});
    // @メンション通知（担当者以外へも）
    const mentioned = users.filter(u=>u.id!==uid&&!assignees.includes(u.id)&&text.includes(`@${u.name}`));
    if(mentioned.length) nd = addNotif(nd,{type:"mention",entityId,entityType:eType,title:`「${entity?.title||entity?.name||""}」でメンションされました`,body:text.slice(0,60),toUserIds:mentioned.map(u=>u.id),fromUserId:uid});
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
          const isMe=m.userId===uid;
          const isEditing=tMemoEdit?.entityId===entityId&&tMemoEdit?.memoId===m.id;
          return (
            <div key={m.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.3rem"}}>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accentDark}}>{mu?.name||"不明"}</span>
                <div style={{display:"flex",alignItems:"center",gap:"0.25rem"}}>
                  <span style={{fontSize:"0.65rem",color:C.textMuted}}>{new Date(m.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                  {m.editedAt&&<span style={{fontSize:"0.58rem",color:C.textMuted}}>(編集済)</span>}
                  {isMe&&!isEditing&&<>
                    <button onClick={()=>setTMemoEdit({entityId,memoId:m.id,text:m.text})}
                      style={{background:"none",border:"none",cursor:"pointer",padding:"0 0.2rem",fontSize:"0.75rem",color:C.textMuted,lineHeight:1}}>✏️</button>
                    <button onClick={()=>{if(window.confirm("このメモを削除しますか？"))deleteTMemo(entityKey,entityId,m.id);}}
                      style={{background:"none",border:"none",cursor:"pointer",padding:"0 0.2rem",fontSize:"0.75rem",color:"#dc2626",lineHeight:1}}>🗑</button>
                  </>}
                </div>
              </div>
              {isEditing?(
                <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                  <textarea value={tMemoEdit.text} onChange={e=>setTMemoEdit(p=>({...p,text:e.target.value}))}
                    style={{width:"100%",padding:"0.5rem",borderRadius:"0.5rem",border:`1.5px solid ${C.accent}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"vertical",minHeight:60,outline:"none",boxSizing:"border-box",lineHeight:1.5}}/>
                  <div style={{display:"flex",gap:"0.4rem",justifyContent:"flex-end"}}>
                    <button onClick={()=>setTMemoEdit(null)} style={{padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
                    <button onClick={()=>updateTMemo(entityKey,entityId,m.id,tMemoEdit.text)} disabled={!tMemoEdit.text?.trim()} style={{padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:"none",background:C.accent,color:"white",fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:tMemoEdit.text?.trim()?1:0.4}}>保存</button>
                  </div>
                </div>
              ):(
                <div style={{fontSize:"0.85rem",color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:"0.4rem"}}>
        <textarea value={tMemoIn[entityId]||""} onChange={e=>{setTMemoIn(p=>({...p,[entityId]:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
          placeholder="メモを追加... (Shift+Enterで改行)"
          style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",resize:"none",minHeight:60,lineHeight:1.5,overflow:"hidden"}}/>
        <button onClick={()=>addTMemo(entityKey,entityId,tMemoIn[entityId]||"")} disabled={!(tMemoIn[entityId]||"").trim()}
          style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-end",opacity:(tMemoIn[entityId]||"").trim()?1:0.4}}>
          追加
        </button>
      </div>
    </div>
  );
  const TChatSection = ({entityKey,entityId,chat=[]}) => {
    const val = tChatIn[entityId]||"";
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
          const isEditing=tChatEdit?.entityId===entityId&&tChatEdit?.chatId===m.id;
          return (
            <div key={m.id} style={{display:"flex",flexDirection:isMe?"row-reverse":"row",gap:"0.4rem",alignItems:"flex-end"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.62rem",fontWeight:800,color:"white",flexShrink:0}}>
                {cu?cu.name.charAt(0):"?"}
              </div>
              <div style={{maxWidth:"75%"}}>
                {!isMe&&<div style={{fontSize:"0.6rem",color:C.textMuted,marginBottom:"0.1rem",fontWeight:600}}>{cu?.name}</div>}
                {isEditing?(
                  <div style={{display:"flex",flexDirection:"column",gap:"0.3rem",minWidth:200}}>
                    <textarea value={tChatEdit.text} onChange={e=>{setTChatEdit(p=>({...p,text:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                      style={{padding:"0.4rem 0.6rem",borderRadius:"0.5rem",border:`1.5px solid ${C.accent}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"none",minHeight:40,outline:"none",lineHeight:1.5,overflow:"hidden",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:"0.3rem",justifyContent:isMe?"flex-end":"flex-start"}}>
                      <button onClick={()=>setTChatEdit(null)} style={{padding:"0.2rem 0.6rem",borderRadius:"0.4rem",border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                      <button onClick={()=>updateTChat(entityKey,entityId,m.id,tChatEdit.text)} disabled={!tChatEdit.text?.trim()} style={{padding:"0.2rem 0.6rem",borderRadius:"0.4rem",border:"none",background:C.accent,color:"white",fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>保存</button>
                    </div>
                  </div>
                ):(
                  <div style={{position:"relative"}}>
                    <div style={{background:isMe?C.accent:"white",color:isMe?"white":C.text,borderRadius:isMe?"0.875rem 0.875rem 0.25rem 0.875rem":"0.875rem 0.875rem 0.875rem 0.25rem",padding:"0.4rem 0.7rem",fontSize:"0.85rem",lineHeight:1.5,border:isMe?"none":`1px solid ${C.border}`,boxShadow:C.shadow}}>
                      {m.text.split(/(@\S+)/g).map((p,i)=>p.startsWith("@")?<span key={i} style={{background:"rgba(255,255,255,0.25)",borderRadius:3,padding:"0 2px",fontWeight:700}}>{p}</span>:p)}
                    </div>
                    {isMe&&<div style={{display:"flex",gap:"0.2rem",justifyContent:"flex-end",marginTop:"0.15rem"}}>
                      <button onClick={()=>{setTChatEdit({entityId,chatId:m.id,text:m.text});}} style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:"0.68rem",color:C.textMuted}}>✏️</button>
                      <button onClick={()=>{if(window.confirm("このメッセージを削除しますか？"))deleteTChat(entityKey,entityId,m.id);}} style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:"0.68rem",color:"#dc2626"}}>🗑</button>
                    </div>}
                  </div>
                )}
                <div style={{fontSize:"0.58rem",color:C.textMuted,marginTop:"0.1rem",textAlign:isMe?"right":"left"}}>
                  {new Date(m.date).toLocaleTimeString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                  {m.editedAt&&<span style={{marginLeft:"0.3rem"}}>(編集済)</span>}
                </div>
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
        <div style={{display:"flex",gap:"0.4rem",alignItems:"flex-end"}}>
          <textarea value={val} onChange={e=>{setTChatIn(p=>({...p,[entityId]:e.target.value}));e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";}}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addTChat(entityKey,entityId,val);}}}
            placeholder="コメント... (@ でメンション、Enterで送信)"
            style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",resize:"none",minHeight:40,maxHeight:160,lineHeight:1.5,overflow:"auto"}}/>
          <button onClick={()=>addTChat(entityKey,entityId,val)} disabled={!val.trim()}
            style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:val.trim()?1:0.4,flexShrink:0}}>
            送信
          </button>
        </div>
      </div>
    </div>
    );
  };

  const activePj   = allProjects.find(p=>p.id===activePjId);
  const activeTask = allTasks.find(t=>t.id===activeTaskId);
  const pjTasks    = activePj ? visibleTasks.filter(t=>t.projectId===activePjId) : [];

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
            {/* salesRef 表示 + 変更 */}
            {(()=>{
              const col={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[activeTask.salesRef?.type]||C.accent;
              return (
                <div style={{marginBottom:"0.75rem"}}>
                  {activeTask.salesRef
                    ? <div style={{background:col+"15",border:`1px solid ${col}44`,borderRadius:"0.625rem",padding:"0.5rem 0.75rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
                        <span style={{fontSize:"0.7rem",fontWeight:700,color:"white",background:col,borderRadius:999,padding:"0.1rem 0.5rem"}}>{activeTask.salesRef.type}</span>
                        <span style={{fontSize:"0.82rem",fontWeight:700,color:col,flex:1}}>{activeTask.salesRef.name}</span>
                        <button onClick={()=>updateTask(activeTask.id,{salesRef:null})} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"0.85rem",padding:"0 0.2rem"}}>✕</button>
                      </div>
                    : <SalesRefPicker value={null} onChange={v=>updateTask(activeTask.id,{salesRef:v})} salesData={data}/>
                  }
                </div>
              );
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
          onRejectReview={(reviewTaskId,note)=>rejectReview(reviewTaskId,note)}
          onApproveReview={(reviewTaskId)=>approveReview(reviewTaskId)}/>}
        {/* ファイルタブ */}
        {taskTab==="files"&&<FileSection
          files={activeTask.files||[]} currentUserId={uid}
          entityType="tasks" entityId={activeTask.id}
          onAdd={f=>addFileToTask(activeTask.id,f)}
          onDelete={fid=>removeFileFromTask(activeTask.id,fid)}/>}
        {sheet==="editTask"&&<Sheet title="タスクを編集" onClose={()=>setSheet(null)}>
          <TaskForm initial={activeTask} salesData={data} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
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
              {/* salesRef インライン編集 */}
              {(()=>{
                const col={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[activePj.salesRef?.type]||"#64748b";
                return activePj.salesRef
                  ? <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginTop:"0.35rem",background:col+"15",border:`1px solid ${col}44`,borderRadius:"0.625rem",padding:"0.3rem 0.6rem"}}>
                      <span style={{fontSize:"0.68rem",fontWeight:800,color:"white",background:col,borderRadius:999,padding:"0.08rem 0.4rem",flexShrink:0}}>{activePj.salesRef.type}</span>
                      <span style={{fontSize:"0.82rem",fontWeight:700,color:col,flex:1}}>{activePj.salesRef.name}</span>
                      <button onClick={()=>updateProject(activePj.id,{salesRef:null})} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"0.85rem",padding:"0 0.1rem",flexShrink:0}}>✕</button>
                    </div>
                  : <div style={{marginTop:"0.35rem"}}>
                      <SalesRefPicker value={null} onChange={v=>updateProject(activePj.id,{salesRef:v})} salesData={data}/>
                    </div>;
              })()}
            </div>
            <Btn variant="ghost" size="sm" onClick={()=>setSheet("editProject")}>✏️</Btn>
          </div>
          {activePj.notes&&<div style={{fontSize:"0.82rem",color:C.textSub,marginTop:"0.5rem"}}>{activePj.notes}</div>}
          {/* 完了ボタン */}
          <div style={{marginTop:"0.875rem",paddingTop:"0.875rem",borderTop:`1px solid ${C.borderLight}`}}>
            {activePj.status==="完了" ? (
              <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"#d1fae5",borderRadius:"0.625rem",padding:"0.4rem 0.875rem"}}>
                  <span style={{fontSize:"1rem"}}>✅</span>
                  <span style={{fontSize:"0.82rem",fontWeight:800,color:"#059669"}}>完了済み</span>
                </div>
                <button onClick={()=>updateProject(activePj.id,{status:"進行中"})}
                  style={{fontSize:"0.75rem",color:C.textMuted,background:"none",border:"none",cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
                  完了を解除する
                </button>
              </div>
            ) : (
              <button
                onClick={()=>{
                  // プロジェクトを完了に + 全タスクを完了に一括更新
                  let u = {...data,
                    projects: allProjects.map(p=>p.id===activePj.id?{...p,status:"完了"}:p),
                    tasks: allTasks.map(t=>t.projectId===activePj.id?{...t,status:"完了"}:t)
                  };
                  u = globalAddChangeLog(u,{entityType:"プロジェクト",entityId:activePj.id,entityName:activePj.name,field:"ステータス",oldVal:activePj.status||"",newVal:"完了",userId:uid});
                  setData(u); saveData(u);
                }}
                style={{width:"100%",padding:"0.7rem",borderRadius:"0.75rem",border:"none",background:"#059669",color:"white",fontWeight:800,fontSize:"0.88rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.5rem"}}>
                ✅ プロジェクトを完了にする
              </button>
            )}
          </div>
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
                const statKey=`pjDetail_${activePjId}_${status}`;
                const statCollapsed=isStatCollapsed(statKey);
                return (
                  <React.Fragment key={status}>
                    <div onClick={()=>toggleStat(statKey)}
                      style={{padding:"0.35rem 1rem",background:m.bg,borderTop:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",gap:"0.4rem",cursor:"pointer"}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:m.dot,display:"inline-block",flexShrink:0}}/>
                      <span style={{fontSize:"0.7rem",fontWeight:700,color:m.color,letterSpacing:"0.04em"}}>{status}</span>
                      <span style={{fontSize:"0.7rem",color:m.color,opacity:0.7,marginLeft:"auto"}}>{group.length}件</span>
                      <span style={{fontSize:"0.7rem",color:m.color,marginLeft:"0.25rem"}}>{statCollapsed?"▶":"▼"}</span>
                    </div>
                    {!statCollapsed&&group.map(t=>(
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
          entityType="projects" entityId={activePj.id}
          onAdd={f=>addFileToPj(activePj.id,f)}
          onDelete={fid=>removeFileFromPj(activePj.id,fid)}/>}
        {sheet==="addPjTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
          <TaskForm initial={{status:"未着手"}} salesData={data} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{addTask(f,activePjId);}}/>
        </Sheet>}
        {sheet==="editProject"&&<Sheet title="プロジェクトを編集" onClose={()=>setSheet(null)}>
          <ProjectForm initial={activePj} salesData={data} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
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
  const todayStr = today.toISOString().slice(0,10);
  const urgentTasks = visibleTasks.filter(t=>{
    if(t.status==="完了"||!t.dueDate) return false;
    const d=new Date(t.dueDate); d.setHours(0,0,0,0);
    return (d-today)/(1000*60*60*24)<=2;
  }).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  // 次回アクション期限が近いエンティティ
  const urgentNextActions = [
    ...(data.companies||[]).map(e=>({...e,_type:"企業"})),
    ...(data.vendors||[]).map(e=>({...e,_type:"業者"})),
    ...(data.municipalities||[]).map(e=>({...e,_type:"自治体"})),
  ].filter(e=>{
    if(!e.nextActionDate) return false;
    const diff=(new Date(e.nextActionDate)-today)/(1000*60*60*24);
    return diff<=2 && diff>=-1;
  }).sort((a,b)=>new Date(a.nextActionDate)-new Date(b.nextActionDate));

  // セクションヘッダー共通スタイル
  const SectionHeader = ({label,count,open,onToggle,color="#374151",bg="#f8fafc",extra=null})=>(
    <div onClick={onToggle}
      style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.55rem 1rem",background:bg,borderBottom:`1px solid ${C.borderLight}`,cursor:"pointer",userSelect:"none"}}>
      <span style={{fontSize:"0.72rem",fontWeight:800,color,textTransform:"uppercase",letterSpacing:"0.05em",flex:1}}>{label}</span>
      {extra}
      {count!=null&&<span style={{fontSize:"0.68rem",background:C.borderLight,color:C.textMuted,borderRadius:999,padding:"0.05rem 0.45rem",fontWeight:700}}>{count}</span>}
      <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"0.25rem"}}>{open?"▲":"▼"}</span>
    </div>
  );

  return (
    <div>
      {/* 期限アラート */}
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

      {/* 次回アクションアラート */}
      {urgentNextActions.length>0&&(
        <div style={{marginBottom:"1rem",background:"#f0f9ff",border:"1.5px solid #bae6fd",borderRadius:"0.875rem",overflow:"hidden"}}>
          <div style={{padding:"0.6rem 1rem",display:"flex",alignItems:"center",gap:"0.5rem",borderBottom:"1px solid #bae6fd"}}>
            <span style={{fontSize:"1rem"}}>📅</span>
            <span style={{fontWeight:800,fontSize:"0.85rem",color:"#0369a1"}}>フォロー予定</span>
            <span style={{marginLeft:"auto",fontSize:"0.72rem",background:"#0369a1",color:"white",borderRadius:999,padding:"0.1rem 0.45rem",fontWeight:700}}>{urgentNextActions.length}</span>
          </div>
          {urgentNextActions.map(e=>{
            const col={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[e._type]||C.accent;
            const isToday=e.nextActionDate===todayStr;
            const isPast=e.nextActionDate<todayStr;
            const label=isPast?"期限切れ":isToday?"今日":"明日";
            return (
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.65rem 1rem",borderBottom:`1px solid #e0f2fe`}}>
                <span style={{fontSize:"0.68rem",fontWeight:800,color:"white",background:col,borderRadius:999,padding:"0.1rem 0.4rem",flexShrink:0}}>{e._type}</span>
                <span style={{fontSize:"0.85rem",fontWeight:600,color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</span>
                <span style={{fontSize:"0.7rem",color:C.textSub,flexShrink:0}}>{APPROACH_ICON[e.nextActionType]||"📞"} {e.nextActionType}</span>
                <span style={{fontSize:"0.72rem",fontWeight:800,color:isPast?"#dc2626":isToday?"#d97706":"#0369a1",background:isPast?"#fee2e2":isToday?"#fff7ed":"#dbeafe",borderRadius:999,padding:"0.15rem 0.5rem",flexShrink:0,border:`1px solid ${isPast?"#fca5a5":isToday?"#fed7aa":"#bae6fd"}`}}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

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

      {/* ── プロジェクト＆タスク（PC: 横並び） ── */}
      <div style={isWide && visibleProjects.length>0
        ? {display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"1rem",alignItems:"flex-start",marginBottom:"1.5rem"}
        : {marginBottom:"1.5rem"}}>

        {/* 左カラム: プロジェクト */}
        {visibleProjects.length>0&&(
          <div style={isWide?{}:{marginBottom:"0.75rem"}}>
            <Card style={{overflow:"hidden"}}>
              <SectionHeader
                label={`🗂 プロジェクト`}
                count={visibleProjects.length}
                open={pjSectionOpen}
                onToggle={togglePjSection}
                color={C.accent}
                bg={C.accentBg}
              />
              {pjSectionOpen&&visibleProjects.map(pj=>{
                const pjTasks = visibleTasks.filter(t=>t.projectId===pj.id);
                const done = pjTasks.filter(t=>t.status==="完了").length;
                const pct  = pjTasks.length>0?Math.round((done/pjTasks.length)*100):0;
                return (
                  <div key={pj.id}
                    onClick={()=>{setActivePjId(pj.id);setScreen("projectDetail");}}
                    style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:"white",cursor:"pointer",transition:"background 0.12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e=>e.currentTarget.style.background="white"}>
                    {pj.isPrivate&&<span style={{fontSize:"0.65rem",color:"#dc2626",flexShrink:0}}>🔒</span>}
                    <span style={{fontSize:"1rem",flexShrink:0}}>🗂</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.4rem",minWidth:0}}>
                        <span style={{fontSize:"0.88rem",fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>{pj.name}</span>
                        {pj.status==="完了"&&<span style={{fontSize:"0.62rem",background:"#d1fae5",color:"#059669",borderRadius:999,padding:"0.05rem 0.4rem",fontWeight:700,flexShrink:0}}>完了</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:"0.3rem",flexWrap:"wrap"}}>
                        {pj.salesRef&&(()=>{const col={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[pj.salesRef.type]||"#64748b";return <span style={{fontSize:"0.62rem",fontWeight:700,color:"white",background:col,borderRadius:999,padding:"0.05rem 0.4rem",flexShrink:0}}>{pj.salesRef.type} · {pj.salesRef.name}</span>;})()}
                        <div style={{flex:1,maxWidth:120,height:3,background:C.borderLight,borderRadius:999,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#059669":C.accent,borderRadius:999,transition:"width 0.3s"}}/>
                        </div>
                        <span style={{fontSize:"0.65rem",color:C.textMuted,flexShrink:0}}>{done}/{pjTasks.length}件</span>
                      </div>
                    </div>
                    <span style={{color:C.textMuted,fontSize:"0.9rem",flexShrink:0}}>›</span>
                  </div>
                );
              })}
            </Card>

            {/* 完了プロジェクト アーカイブ */}
            {archivedProjects.length>0&&(
              <Card style={{overflow:"hidden",marginTop:"0.75rem"}}>
                <div onClick={()=>setPjArchiveOpen(v=>!v)}
                  style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.55rem 1rem",background:"#f1f5f9",borderBottom:pjArchiveOpen?`1px solid ${C.borderLight}`:"none",cursor:"pointer",userSelect:"none"}}>
                  <span style={{fontSize:"0.72rem",fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.05em",flex:1}}>✅ 完了プロジェクト</span>
                  <span style={{fontSize:"0.68rem",background:C.borderLight,color:C.textMuted,borderRadius:999,padding:"0.05rem 0.45rem",fontWeight:700}}>{archivedProjects.length}</span>
                  <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"0.25rem"}}>{pjArchiveOpen?"▲":"▼"}</span>
                </div>
                {pjArchiveOpen&&archivedProjects.map(pj=>{
                  const pjTasks=visibleTasks.filter(t=>t.projectId===pj.id);
                  const done=pjTasks.filter(t=>t.status==="完了").length;
                  return (
                    <div key={pj.id}
                      onClick={()=>{setActivePjId(pj.id);setScreen("projectDetail");}}
                      style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.65rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:"white",cursor:"pointer",opacity:0.75}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                      onMouseLeave={e=>e.currentTarget.style.opacity="0.75"}>
                      <span style={{fontSize:"0.95rem",flexShrink:0}}>✅</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.85rem",fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pj.name}</div>
                        <div style={{fontSize:"0.65rem",color:C.textMuted,marginTop:"0.15rem"}}>{done}/{pjTasks.length}件完了</div>
                      </div>
                      <span style={{color:C.textMuted,fontSize:"0.9rem",flexShrink:0}}>›</span>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        )}

        {/* 右カラム: スタンドアローンタスク */}
        {(()=>{
          const myVisibleTasks = showMineOnly ? visibleTasks.filter(t=>(t.assignees||[]).includes(uid)||t.createdBy===uid) : visibleTasks;
          const standaloneTasks = myVisibleTasks.filter(t=>!t.projectId);
          if(!standaloneTasks.length&&visibleProjects.length>0) return null;
          return (
            <div style={{minWidth:0}}>
              <Card style={{overflow:"hidden"}}>
                {standaloneTasks.length===0&&visibleProjects.length===0&&(
                  <div style={{padding:"3rem 1rem",textAlign:"center",color:C.textMuted}}>
                    <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>📋</div>
                    <div style={{fontSize:"0.9rem",fontWeight:600,marginBottom:"0.4rem"}}>まだタスクがありません</div>
                    <div style={{fontSize:"0.8rem"}}>「＋ タスク」または「＋ プロジェクト」から追加</div>
                  </div>
                )}
                {standaloneTasks.length>0&&(
                  <>
                    <SectionHeader
                      label="📋 タスク"
                      count={standaloneTasks.length}
                      open={taskSectionOpen}
                      onToggle={toggleTaskSection}
                      color="#374151"
                      bg={C.bg}
                    />
                    {taskSectionOpen&&STATUS_OPTIONS.map(status=>{
                      const group=standaloneTasks.filter(t=>t.status===status);
                      if(!group.length) return null;
                      const m=STATUS_META[status];
                      const statKey=`standalone_${status}`;
                      const statCollapsed=isStatCollapsed(statKey);
                      return (
                        <React.Fragment key={status}>
                          <div onClick={()=>toggleStat(statKey)}
                            style={{padding:"0.35rem 1rem",background:m.bg,borderTop:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",gap:"0.4rem",cursor:"pointer"}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:m.dot,display:"inline-block",flexShrink:0}}/>
                            <span style={{fontSize:"0.7rem",fontWeight:700,color:m.color,letterSpacing:"0.04em"}}>{status}</span>
                            <span style={{fontSize:"0.7rem",color:m.color,opacity:0.7,marginLeft:"auto"}}>{group.length}件</span>
                            <span style={{fontSize:"0.7rem",color:m.color,marginLeft:"0.25rem"}}>{statCollapsed?"▶":"▼"}</span>
                          </div>
                          {!statCollapsed&&group.map(t=>(
                            <TaskRow key={t.id} task={t} users={users}
                              onToggle={()=>updateTask(t.id,{status:t.status==="完了"?"未着手":"完了"})}
                              onStatusChange={s=>updateTask(t.id,{status:s})}
                              onClick={()=>{setActiveTaskId(t.id);setFromProject(null);setScreen("taskDetail");}}/>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
              </Card>
            </div>
          );
        })()}
      </div>

      {/* ── 活動ログ ── */}
      <ActivityLog data={data} users={users} filterTypes={["タスク","プロジェクト"]} />
      {sheet==="addTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
        <TaskForm initial={{status:"未着手"}} salesData={data} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
          onSave={f=>{addTask(f,null);}}/>
      </Sheet>}
      {sheet==="addProject"&&<Sheet title="プロジェクトを追加" onClose={()=>setSheet(null)}>
        <ProjectForm salesData={data} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
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
      <a href="https://www.teamoncloud.com/login/" target="_blank" rel="noopener noreferrer"
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
            <div style={{position:"relative"}}>
              <Textarea value={inputText} onChange={e=>setInputText(e.target.value)}
                placeholder={mode==="reply"
                  ?"返信したいメールの本文をここに貼り付けてください..."
                  :"例：A社の田中部長への初回アポイント依頼。来月の新製品説明会の案内として送りたい。先方とは先月の展示会で名刺交換済み。"}
                style={{height:160}}/>
              {inputText&&<button onClick={()=>setInputText("")}
                style={{position:"absolute",top:"0.5rem",right:"0.5rem",background:"#f1f5f9",border:"none",borderRadius:"0.4rem",padding:"0.2rem 0.5rem",cursor:"pointer",fontSize:"0.72rem",color:"#64748b",fontWeight:700,lineHeight:1}}>✕ リセット</button>}
            </div>
          </FieldLbl>

          <FieldLbl label={mode==="reply"?"返信の指示・方向性 *":"メールの指示・方向性 *"}>
            <div style={{position:"relative"}}>
              <Textarea value={instruction} onChange={e=>setInstruction(e.target.value)}
                placeholder={mode==="reply"
                  ?"例：丁重にお断りする / 前向きに検討する旨を伝えて来週返答する"
                  :"例：丁寧かつ簡潔に。押しつけがましくなく、相手の都合を優先する姿勢で。"}
                style={{height:100}}/>
              {instruction&&<button onClick={()=>setInstruction("")}
                style={{position:"absolute",top:"0.5rem",right:"0.5rem",background:"#f1f5f9",border:"none",borderRadius:"0.4rem",padding:"0.2rem 0.5rem",cursor:"pointer",fontSize:"0.72rem",color:"#64748b",fontWeight:700,lineHeight:1}}>✕ リセット</button>}
            </div>
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
          <div style={{position:"relative"}}>
            <Textarea value={generated} onChange={e=>setGenerated(e.target.value)} style={{height:320,marginBottom:"1rem"}}/>
            {generated&&<button onClick={()=>setGenerated("")}
              style={{position:"absolute",top:"0.5rem",right:"0.5rem",background:"#f1f5f9",border:"none",borderRadius:"0.4rem",padding:"0.2rem 0.5rem",cursor:"pointer",fontSize:"0.72rem",color:"#64748b",fontWeight:700,lineHeight:1}}>✕ リセット</button>}
          </div>
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
      const pm=munis.filter(m=>String(m.prefectureId)===String(p.id));
      if(!pm.length) return {bg:"#e5e7eb",border:"#d1d5db",text:"#9ca3af"};
      const n=pm.filter(m=>m.dustalk==="展開").length;
      const pct=n/pm.length;
      if(pct===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#6b7280"};
      if(pct<0.3) return {bg:"#dbeafe",border:"#93c5fd",text:"#1d4ed8"};
      if(pct<0.7) return {bg:"#bfdbfe",border:"#3b82f6",text:"#1d4ed8"};
      return {bg:"#d1fae5",border:"#34d399",text:"#065f46"};
    };
    const treatyCol=(p)=>{
      const pm=munis.filter(m=>String(m.prefectureId)===String(p.id));
      if(!pm.length) return {bg:"#f3f4f6",border:"#d1d5db",text:"#9ca3af"};
      const n=pm.filter(m=>m.treatyStatus==="協定済").length;
      const pct=n/pm.length;
      if(pct===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#6b7280"};
      if(pct<0.1) return {bg:"#ede9fe",border:"#a78bfa",text:"#5b21b6"};
      if(pct<0.3) return {bg:"#ddd6fe",border:"#7c3aed",text:"#4c1d95"};
      return {bg:"#c4b5fd",border:"#6d28d9",text:"#3b0764"};
    };
    const vendorCol=(p)=>{
      const pm=munis.filter(m=>String(m.prefectureId)===String(p.id));
      const joinedCount=pm.reduce((s,m)=>{
        return s+vendors.filter(v=>(v.municipalityIds||[]).includes(m.id)&&v.status==="加入済").length;
      },0);
      if(joinedCount===0) return {bg:"#f3f4f6",border:"#d1d5db",text:"#9ca3af"};
      if(joinedCount<3)   return {bg:"#fef3c7",border:"#fcd34d",text:"#92400e"};
      if(joinedCount<8)   return {bg:"#fed7aa",border:"#fb923c",text:"#7c2d12"};
      return {bg:"#fca5a5",border:"#f87171",text:"#7f1d1d"};
    };

    prefs.forEach(p=>{
      const coords=prefCoords[p.name];
      if(!coords) return;
      const [lat,lng]=coords;

      const pm=munis.filter(m=>String(m.prefectureId)===String(p.id));
      const deployed=pm.filter(m=>m.dustalk==="展開").length;
      const treaty=pm.filter(m=>m.treatyStatus==="協定済").length;
      const vendCount=pm.reduce((s,m)=>s+vendors.filter(v=>(v.municipalityIds||[]).includes(m.id)&&v.status==="加入済").length,0);
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
          name:p.name, total:pm.length, deployed, treaty, vendCount, vendLabel:"加入業者",
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
    ["vendor","🔧 加入業者数","加入済","#d97706"],
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
            <span style={{fontSize:"0.65rem",fontWeight:700,color:C.textMuted}}>加入業者数</span>
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

// ─── LINKED BIZCARD LIST ─────────────────────────────────────────────────────
function LinkedBizcardList({ cards=[], users=[], onUnlink, onNavigateToBizcard }) {
  if(cards.length===0) return (
    <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem"}}>
      <div style={{fontSize:"1.5rem",marginBottom:"0.5rem"}}>🪪</div>
      紐づいた名刺がありません<br/>
      <span style={{fontSize:"0.72rem"}}>名刺の詳細画面から紐付けできます</span>
      {onNavigateToBizcard&&(
        <div style={{marginTop:"0.75rem"}}>
          <button onClick={onNavigateToBizcard}
            style={{padding:"0.4rem 0.875rem",borderRadius:999,border:"1.5px solid #2563eb",background:"#dbeafe",color:"#1d4ed8",fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            🪪 名刺一覧へ
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
      {cards.map(card=>{
        const name = `${card.lastName||""}${card.firstName||""}`.trim()||"（名前なし）";
        const ownerUser = users.find(u=>u.name===card.owner);
        return (
          <div key={card.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow,display:"flex",alignItems:"center",gap:"0.75rem"}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#dbeafe,#ede9fe)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>🪪</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:"0.88rem",color:C.text}}>{name}</div>
              {card.title&&<div style={{fontSize:"0.72rem",color:C.textSub}}>{card.title}</div>}
              <div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.1rem"}}>
                {card.email&&<span style={{marginRight:"0.5rem"}}>✉️ {card.email}</span>}
                {(card.mobile||card.telDirect)&&<span>📞 {card.mobile||card.telDirect}</span>}
              </div>
              {card.owner&&<div style={{fontSize:"0.68rem",color:C.textSub,marginTop:"0.1rem"}}>👤 所有者：{card.owner}</div>}
            </div>
            {onUnlink&&<button onClick={()=>onUnlink(card.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"0.78rem",flexShrink:0,padding:"0.25rem"}}>紐解除</button>}
          </div>
        );
      })}
    </div>
  );
}

// ─── APPROACH TIMELINE ────────────────────────────────────────────────────────
function ApproachTimeline({ entity, entityKey, entityId, users=[], onAddApproach, onSave, data }) {
  const logs = [...(entity?.approachLogs||[])].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const memos = [...(entity?.memos||[])].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  // changeLogs for this entity
  const changeLogs = [...(data?.changeLogs||[])].filter(l=>String(l.entityId)===String(entityId)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  // Merge all into single timeline
  const items = [
    ...logs.map(l=>({...l, _kind:"approach", _ts:l.createdAt})),
    ...memos.map(m=>({...m, _kind:"memo", _ts:m.createdAt})),
    ...changeLogs.map(c=>({...c, _kind:"change", _ts:c.date})),
  ].sort((a,b)=>new Date(b._ts)-new Date(a._ts));

  return (
    <div>
      <button onClick={onAddApproach}
        style={{width:"100%",marginBottom:"0.75rem",padding:"0.55rem",borderRadius:"0.75rem",border:`1.5px dashed ${C.accent}`,background:C.accentBg,color:C.accent,fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
        ＋ アプローチを記録
      </button>
      {items.length===0&&(
        <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem"}}>記録がありません</div>
      )}
      {items.map((item,i)=>{
        const u = users.find(x=>x.id===(item.userId||item.createdBy));
        const dateStr = (item._ts||"").slice(0,10);
        if(item._kind==="approach") {
          const icon = APPROACH_ICON[item.type]||"📝";
          const isLoss = item.isLoss;
          return (
            <div key={item.id||i} style={{display:"flex",gap:"0.6rem",marginBottom:"0.75rem"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:isLoss?"#fee2e2":"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.85rem",flexShrink:0}}>{icon}</div>
                {i<items.length-1&&<div style={{width:2,flex:1,background:C.borderLight,margin:"4px 0"}}/>}
              </div>
              <div style={{flex:1,paddingBottom:"0.5rem"}}>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.2rem"}}>
                  <span style={{fontSize:"0.72rem",fontWeight:700,color:isLoss?"#dc2626":C.accent}}>{item.type}</span>
                  <span style={{fontSize:"0.68rem",color:C.textMuted}}>{dateStr}</span>
                  {u&&<span style={{fontSize:"0.68rem",color:C.textSub}}>👤 {u.name}</span>}
                </div>
                {item.note&&<div style={{fontSize:"0.82rem",color:C.text,background:isLoss?"#fff1f2":"#f8fafc",borderRadius:"0.5rem",padding:"0.4rem 0.6rem",border:`1px solid ${isLoss?"#fca5a5":C.borderLight}`}}>{item.note}</div>}
              </div>
            </div>
          );
        }
        if(item._kind==="memo") {
          return (
            <div key={item.id||i} style={{display:"flex",gap:"0.6rem",marginBottom:"0.75rem"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.85rem",flexShrink:0}}>📝</div>
                {i<items.length-1&&<div style={{width:2,flex:1,background:C.borderLight,margin:"4px 0"}}/>}
              </div>
              <div style={{flex:1,paddingBottom:"0.5rem"}}>
                <div style={{display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.2rem"}}>
                  <span style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub}}>メモ</span>
                  <span style={{fontSize:"0.68rem",color:C.textMuted}}>{dateStr}</span>
                  {u&&<span style={{fontSize:"0.68rem",color:C.textSub}}>👤 {u.name}</span>}
                </div>
                <div style={{fontSize:"0.82rem",color:C.text,background:"#f8fafc",borderRadius:"0.5rem",padding:"0.4rem 0.6rem",border:`1px solid ${C.borderLight}`}}>{item.text}</div>
              </div>
            </div>
          );
        }
        // change log
        return (
          <div key={item.id||i} style={{display:"flex",gap:"0.6rem",marginBottom:"0.75rem"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"#ede9fe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.75rem",flexShrink:0}}>🔄</div>
              {i<items.length-1&&<div style={{width:2,flex:1,background:C.borderLight,margin:"4px 0"}}/>}
            </div>
            <div style={{flex:1,paddingBottom:"0.5rem"}}>
              <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:"0.7rem",fontWeight:700,color:"#7c3aed"}}>{item.field}</span>
                {item.oldVal&&<><span style={{fontSize:"0.68rem",color:"#dc2626",textDecoration:"line-through"}}>{item.oldVal}</span><span style={{fontSize:"0.65rem",color:C.textMuted}}>→</span></>}
                {item.newVal&&<span style={{fontSize:"0.68rem",color:"#059669",fontWeight:700}}>{item.newVal}</span>}
                <span style={{fontSize:"0.65rem",color:C.textMuted,marginLeft:"auto"}}>{dateStr}</span>
              </div>
            </div>
          </div>
        );
      })}
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
function SalesView({ data, setData, currentUser, users=[], salesTab, setSalesTab, onNavigateToTask, onNavigateToProject, onNavigateToCompany, onNavigateToVendor, onNavigateToMuni, salesNavTarget, clearSalesNavTarget }) {
  // salesNavTarget は App から prop として渡される（内部stateは不要）
  // salesTab managed by App for persistence
  const [muniScreen,   setMuniScreen]   = useState("top"); // top|muniDetail
  const [prevTab,      setPrevTab]      = useState(null);   // for back navigation
  const [activePref,   setActivePref]   = useState(null);
  const [activeMuni,   setActiveMuni]   = useState(null);
  const [muniPickerPref, setMuniPickerPref] = useState(""); // stable state for MuniPicker
  const [activeVendor, setActiveVendor] = useState(null);
  const [activeCompany,setActiveCompany]= useState(null);

  // Handle navigation from notifications (company/vendor/muni)
  React.useEffect(()=>{
    if(!salesNavTarget) return;
    if(salesNavTarget.type==="company"){
      setSalesTab("company"); setActiveCompany(salesNavTarget.id); setActiveDetail("timeline");
    } else if(salesNavTarget.type==="vendor"){
      setSalesTab("vendor"); setActiveVendor(salesNavTarget.id); setActiveDetail("timeline");
    } else if(salesNavTarget.type==="muni"){
      setSalesTab("muni");
      setActiveMuni(null); // いったんリセットして再レンダリング確実化
      const targetMuni = (data.municipalities||[]).find(m=>String(m.id)===String(salesNavTarget.id));
      const prefId = targetMuni?String(targetMuni.prefectureId):(salesNavTarget.prefId?String(salesNavTarget.prefId):null);
      if(prefId) setActivePref(prefId);
      setMuniScreen("top"); // 先にtopにして
      setTimeout(()=>{ setActiveMuni(String(salesNavTarget.id)); setMuniScreen("muniDetail"); setActiveDetail("timeline"); }, 50);
    }
    clearSalesNavTarget?.();
  },[salesNavTarget]);
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
  const [vendFilterPref, setVendFilterPref] = useState(""); // 都道府県フィルタ
  const [vendFilterMuni, setVendFilterMuni] = useState(""); // 自治体フィルタ
  const [vendFilterStatus, setVendFilterStatus] = useState(""); // ステータスフィルタ
  const [vendFilterPermit, setVendFilterPermit] = useState(""); // 許可種別フィルタ
  const [vendFilterAssignee, setVendFilterAssignee] = useState(""); // 担当フィルタ
  const [openCompGrp,  setOpenCompGrp]  = useState(new Set());
  const [openVendGrp,  setOpenVendGrp]  = useState(new Set());
  const [muniTopSearch,setMuniTopSearch]= useState("");
  const [muniFilterAssignee, setMuniFilterAssignee] = useState(""); // 担当者フィルタ
  const [chatInputs,   setChatInputs]   = useState({});
  const [memoInputs,   setMemoInputs]   = useState({});
  const [memoEdit,     setMemoEdit]     = useState(null); // {entityId, memoId, text}
  const [chatEdit,     setChatEdit]     = useState(null); // {entityId, chatId, text}
  const [activeDetail, setActiveDetail] = useState("timeline"); // memo|chat
  // bulk select
  const [bulkMode,     setBulkMode]     = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkStatus,   setBulkStatus]   = useState("");
  const [bulkTarget,   setBulkTarget]   = useState(""); // "company"|"vendor"|"muni"
  // 削除モーダル
  const [deleteModal,  setDeleteModal]  = useState(null); // {type:"company"|"vendor"|"muni"|"bizcard"}
  // vendor linking from muni
  const [linkVendorSearch,setLinkVendorSearch]=useState("");
  const [linkVendorFilterPref,setLinkVendorFilterPref]=useState("");
  const [linkVendorFilterMuni,setLinkVendorFilterMuni]=useState("");
  const [linkVendorFilterPermit,setLinkVendorFilterPermit]=useState("");
  // dashboard period filter (must be top-level, not inside conditional)
  const [dashPeriod,setDashPeriod]=useState("month"); // today|week|month|all
  // CSV import preview/error state (must be top-level, not inside IIFE)
  const [importPreview,setImportPreview]=useState(null);
  const [importErr,setImportErr]=useState("");
  const [impMode,setImpMode]=useState("csv");
  const [textInput,setTextInput]=useState("");
  // duplicate detection modal
  const [dupModal,setDupModal]=useState(null); // {existing, incoming, onKeepBoth, onSave}
  // scroll position tracking for back navigation
  const savedScrollPos = useRef({});

  // ── 名刺 state ──────────────────────────────────────────────────────────
  const [bcSearch,       setBcSearch]       = useState("");
  const [bcActiveId,     setBcActiveId]     = useState(null);
  const [bcScreen,       setBcScreen]       = useState("list"); // list|detail
  const [bcImportErr,    setBcImportErr]    = useState("");
  const [bcImportPrev,   setBcImportPrev]   = useState(null);   // preview rows
  const [bcCompanyFilter,setBcCompanyFilter]= useState("");      // 企業フィルター（""=全て）
  const [bcDupModal,     setBcDupModal]     = useState(null);   // 重複モーダル {existing,incoming,onAdd,onSkip,onCancel}
  const [bcDupQueue,     setBcDupQueue]     = useState([]);     // CSV重複キュー
  const [bcDupBuffer,    setBcDupBuffer]    = useState([]);     // 追加確定済みカード
  const [bcImportSummary,setBcImportSummary]= useState(null);   // {added,skipped}
  const BC_ADD_INIT = {owner:"",company:"",department:"",title:"",lastName:"",firstName:"",email:"",zip:"",address:"",telCompany:"",telDept:"",telDirect:"",fax:"",mobile:"",url:"",exchangedAt:""};
  const [bcAddForm,    setBcAddForm]    = useState(BC_ADD_INIT); // 名刺手動追加フォーム
  // ── 削除モーダル内 state（IIFEでuseStateを使えないため親stateで管理）──
  const [dmSearch,   setDmSearch]   = useState("");
  const [dmFilter,   setDmFilter]   = useState("");
  const [dmSelected, setDmSelected] = useState(new Set());
  const [bcMemoIn,   setBcMemoIn]   = useState(""); // 名刺詳細メモ入力
  const [matchModal, setMatchModal] = useState(null);
  const [lossModal,  setLossModal]  = useState(null);
  const [nextActionModal, setNextActionModal] = useState(null);
  const [approachModal, setApproachModal] = useState(null);
  // モーダルフォーム用state（IIFEでhooks不可のため最上位で管理）
  const [lossReason,   setLossReason]   = useState("");
  const [lossNote,     setLossNote]     = useState("");
  const [lossNextCons, setLossNextCons] = useState("");
  const [aType,  setAType]  = useState("電話");
  const [aNote,  setANote]  = useState("");
  const [aDate,  setADate]  = useState("");
  const [naType, setNaType] = useState("電話");
  const [naDate, setNaDate] = useState("");
  const [naNote, setNaNote] = useState("");
  const [matchChecked, setMatchChecked] = useState({}); // {cardId: bool}

  // ── データ参照（hook後、コンポーネント内計算）──
  const prefs     = data.prefectures    || [];
  const munis     = data.municipalities || [];
  const vendors   = data.vendors        || [];
  const companies = data.companies      || [];
  const bizCards  = data.businessCards  || [];

  // ── 名刺 CRUD ──────────────────────────────────────────────────────────
  const _commitBizCard = (card) => {
    const newCard = {...card, id:Date.now()+Math.random(), createdAt:new Date().toISOString(), createdBy:currentUser?.id||""};
    const nd = {...data, businessCards:[...bizCards, newCard]};
    save(nd);
    // マッチング確認
    setTimeout(()=>{setMatchChecked({});checkMatchAfterBizCard(newCard, nd);}, 100);
  };
  const _commitBizCards = (cards) => {
    const newEntries = cards.map(c=>({...c, id:Date.now()+Math.random(), createdAt:new Date().toISOString(), createdBy:currentUser?.id||""}));
    const nd = {...data, businessCards:[...bizCards, ...newEntries]};
    save(nd);
    // マッチング確認（インポート完了後）
    setTimeout(()=>{setMatchChecked({});checkMatchAfterImport(newEntries, nd);}, 150);
  };

  // 手動追加：重複チェックありモーダル表示
  const addBizCard = (card) => {
    const dup=bizCards.find(c=>c.company===card.company&&c.lastName===card.lastName&&c.firstName===card.firstName);
    if(dup){
      setBcDupModal({
        existing:dup,
        incoming:`${card.lastName} ${card.firstName}（${card.company}）`,
        onAdd:()=>{ _commitBizCard(card); setBcDupModal(null); setSheet(null); },
        onSkip:()=>{ setBcDupModal(null); setBcActiveId(dup.id); setBcScreen("detail"); setSheet(null); },
        onCancel:()=>setBcDupModal(null),
      });
      return;
    }
    _commitBizCard(card);
    setSheet(null);
  };
  const updateBizCard = (id,ch) => {
    const nd={...data,businessCards:bizCards.map(c=>c.id===id?{...c,...ch}:c)};
    save(nd);
  };
  const deleteBizCard = (id) => {
    const nd={...data,businessCards:bizCards.filter(c=>c.id!==id)};
    save(nd);
  };

  // CSV重複キュー処理：1件ずつモーダル表示
  const _processBcDupQueue = (queue, buffer, summary) => {
    if(queue.length===0){
      // 全件処理完了→保存
      if(buffer.length>0) _commitBizCards(buffer);
      setBcImportSummary(summary);
      setBcDupQueue([]); setBcDupBuffer([]); setBcImportPrev(null); setBcImportErr("");
      setBcDupModal(null);
      return;
    }
    const [head,...rest]=queue;
    setBcDupModal({
      existing:head.existing,
      incoming:`${head.incoming.lastName} ${head.incoming.firstName}（${head.incoming.company}）`,
      onAdd:()=>{
        const newBuf=[...buffer,head.incoming];
        const newSummary={added:summary.added+1,skipped:summary.skipped};
        setBcDupBuffer(newBuf); setBcDupQueue(rest);
        _processBcDupQueue(rest,newBuf,newSummary);
      },
      onSkip:()=>{
        const newSummary={added:summary.added,skipped:summary.skipped+1};
        setBcDupQueue(rest);
        _processBcDupQueue(rest,buffer,newSummary);
      },
      onCancel:()=>{
        // キャンセル = 残り全スキップ
        const newSummary={added:summary.added,skipped:summary.skipped+queue.length};
        if(buffer.length>0) _commitBizCards(buffer);
        setBcImportSummary(newSummary);
        setBcDupQueue([]); setBcDupBuffer([]); setBcImportPrev(null);
        setBcDupModal(null);
      },
    });
  };

  // CSVインポート開始：重複と非重複を仕分け
  const importBizCards = (rows) => {
    const clean=[],dups=[];
    rows.forEach(row=>{
      const dup=bizCards.find(c=>c.company===row.company&&c.lastName===row.lastName&&c.firstName===row.firstName);
      if(dup) dups.push({existing:dup,incoming:row});
      else clean.push(row);
    });
    const initialSummary={added:clean.length,skipped:0};
    if(dups.length===0){
      _commitBizCards(clean);
      setBcImportPrev(null); setBcImportErr("");
      setBcImportSummary(initialSummary);
      setSheet(null);
      return;
    }
    // 非重複を一旦バッファに
    setBcDupBuffer(clean);
    setBcDupQueue(dups);
    setSheet(null);
    _processBcDupQueue(dups,clean,initialSummary);
  };

  // ── Eight CSV パーサー ────────────────────────────────────────────────
  const parseEightCsv = (text) => {
    const parseRow = (line) => {
      const cols=[];let cur="",inQ=false;
      for(let i=0;i<line.length;i++){
        const c=line[i],n=line[i+1];
        if(inQ){if(c==='"'&&n==='"'){cur+='"';i++;}else if(c==='"'){inQ=false;}else cur+=c;}
        else{if(c==='"'){inQ=true;}else if(c===','){cols.push(cur);cur="";}else cur+=c;}
      }
      cols.push(cur);
      return cols;
    };
    const cleaned=text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
    const lines=cleaned.split("\n").filter(l=>l.trim());
    if(lines.length<2) return {error:"データが空です"};
    const headers=parseRow(lines[0]);
    // 新フォーマット: №,所有者,会社名,... / 旧フォーマット: 会社名,...
    const isNewFmt = (headers[0]||"").includes("№") || headers[1]==="所有者" || headers[2]==="会社名";
    const isOldFmt = (headers[0]||"").includes("会社");
    if(!isNewFmt && !isOldFmt) return {error:"Eightのフォーマット（会社名列が必要）ではありません"};
    const rows=[];
    for(let i=1;i<lines.length;i++){
      const cols=parseRow(lines[i]);
      if(cols.every(c=>!c.trim())) continue;
      if(isNewFmt){
        rows.push({
          owner:      cols[1]||"",
          company:    cols[2]||"",
          department: cols[3]||"",
          title:      cols[4]||"",
          lastName:   cols[5]||"",
          firstName:  cols[6]||"",
          email:      cols[7]||"",
          zip:        cols[8]||"",
          address:    cols[9]||"",
          telCompany: cols[10]||"",
          telDept:    cols[11]||"",
          telDirect:  cols[12]||"",
          fax:        cols[13]||"",
          mobile:     cols[14]||"",
          url:        cols[15]||"",
          exchangedAt:cols[16]||"",
          memos:[],
        });
      } else {
        rows.push({
          owner:      "",
          company:    cols[0]||"",
          department: cols[1]||"",
          title:      cols[2]||"",
          lastName:   cols[3]||"",
          firstName:  cols[4]||"",
          email:      cols[5]||"",
          zip:        cols[6]||"",
          address:    cols[7]||"",
          telCompany: cols[8]||"",
          telDept:    cols[9]||"",
          telDirect:  cols[10]||"",
          fax:        cols[11]||"",
          mobile:     cols[12]||"",
          url:        cols[13]||"",
          exchangedAt:cols[14]||"",
          memos:[],
        });
      }
    }
    return {rows};
  }

  const toggleGrp=(setter,key)=>setter(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const normSearch = s => {
    if(!s) return "";
    return s
      .replace(/[\s\u3000]/g,"")
      .toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
      .replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)); // カタカナ→ひらがな
  };
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
    const entity = (data[entityKey]||[]).find(e=>e.id===entityId);
    const eType = entityKey==="companies"?"company":entityKey==="vendors"?"vendor":entityKey==="municipalities"?"muni":entityKey;
    let nd = { ...data, [entityKey]: (data[entityKey]||[]).map(e => e.id===entityId ? {...e, files:[...(e.files||[]),file]} : e) };
    // 担当者全員に通知
    const assignees=(entity?.assigneeIds||[]).filter(id=>id!==currentUser?.id);
    if(assignees.length) nd=addNotif(nd,{type:"task_assign",entityId,entityType:eType,title:`「${entity?.name||""}」にファイルが追加されました`,body:file.name||"ファイル",toUserIds:assignees,fromUserId:currentUser?.id});
    window.__myDeskLastSave = Date.now();
    save(nd);
  };
  const removeFileFromEntity = (entityKey, entityId, fileIdOrUrl) => {
    const nd = { ...data, [entityKey]: (data[entityKey]||[]).map(e => e.id===entityId ? {...e, files:(e.files||[]).filter(f=>(f.id||f.url)!==fileIdOrUrl)} : e) };
    save(nd);
  };

  const save = (d) => {
    // ── データ保護ガード ──────────────────────────────────────────────────
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      console.error("MyDesk: SalesView.save rejected invalid data", d); return;
    }
    const GUARD_KEYS = ["tasks","projects","companies","vendors","municipalities","businessCards"];
    const hasContent = GUARD_KEYS.some(k => Array.isArray(d[k]) && d[k].length > 0);
    const currentHasContent = GUARD_KEYS.some(k => Array.isArray(data[k]) && data[k].length > 0);
    if (currentHasContent && !hasContent) {
      console.error("MyDesk: SalesView.save rejected — would wipe existing data", d); return;
    }
    window.__myDeskLastSave = Date.now(); // 競合防止タグ
    // 新しく追加された通知を検出してWeb Push送信
    const notifsBefore = data.notifications || [];
    const newNotifs = (d.notifications||[]).filter(n=>!notifsBefore.some(o=>o.id===n.id));
    setData(d); saveData(d);
    // ブラウザ内通知（Webプッシュが届かない場合のフォールバック）
    if(newNotifs.length>0 && window.Notification && Notification.permission==="granted"){
      newNotifs.forEach(n=>{
        if(n.toUserId && n.toUserId !== (window.__myDeskCurrentUserId||"")){
          try{ new Notification(n.title||"MyDesk",{body:n.body||"",tag:n.id}); }catch(e){}
        }
      });
    }
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

  // ── 名刺↔営業エンティティ マッチング ──────────────────────────────────

  // 法人格を除去してコア名を抽出
  const normBizName = (s) => (s||"")
    .replace(/^(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|NPO法人|社会福祉法人)\s*/g,"")
    .replace(/\s*(株式会社|有限会社|合同会社)$/g,"")
    .replace(/[\s\u3000]/g,"")
    .toLowerCase();

  // 名刺のcompanyに対してマッチする営業エンティティを探す
  const findMatchingEntities = (cardCompany) => {
    const norm = normBizName(cardCompany);
    if(!norm) return [];
    const results = [];
    (data.companies||[]).forEach(e=>{ if(normBizName(e.name)===norm) results.push({type:"企業",id:e.id,name:e.name}); });
    (data.municipalities||[]).forEach(e=>{ if(normBizName(e.name)===norm) results.push({type:"自治体",id:e.id,name:e.name}); });
    (data.vendors||[]).forEach(e=>{ if(normBizName(e.name)===norm) results.push({type:"業者",id:e.id,name:e.name}); });
    return results;
  };

  // 営業エンティティ名に対してマッチする名刺を探す
  const findMatchingCards = (entityName) => {
    const norm = normBizName(entityName);
    if(!norm) return [];
    return (data.businessCards||[]).filter(c=>normBizName(c.company)===norm);
  };

  // 名刺1枚登録後のマッチチェック → モーダル表示
  const checkMatchAfterBizCard = (newCard, savedData) => {
    const matches = findMatchingEntities(newCard.company);
    if(!matches.length) return;
    setMatchModal({
      mode: "card_to_entity",
      cards: [newCard],
      entities: matches,
      savedData,
    });
  };

  // 名刺CSVインポート後のマッチチェック → グループモーダル表示
  const checkMatchAfterImport = (newCards, savedData) => {
    // 会社名ごとにグルーピング
    const groups = {};
    newCards.forEach(card=>{
      const matches = findMatchingEntities(card.company);
      matches.forEach(entity=>{
        const key = `${entity.type}_${entity.id}`;
        if(!groups[key]) groups[key] = {entity, cards:[]};
        groups[key].cards.push(card);
      });
    });
    const groupList = Object.values(groups);
    if(!groupList.length) return;
    setMatchModal({
      mode: "import_to_entity",
      groups: groupList,
      savedData,
    });
  };

  // 営業エンティティ新規登録後のマッチチェック
  const checkMatchAfterEntity = (entityType, entityId, entityName, savedData) => {
    const matches = findMatchingCards(entityName);
    if(!matches.length) return;
    setMatchModal({
      mode: "entity_to_cards",
      entity: {type:entityType, id:entityId, name:entityName},
      cards: matches,
      savedData,
    });
  };

  // 実際に紐付けを実行（selectedIds: 紐づける名刺idの配列）
  const applyBizCardLinks = (selectedIds, entityType, entityId, entityName, baseData) => {
    const uid = currentUser?.id;
    let nd = {...baseData};
    selectedIds.forEach(cardId=>{
      nd = {...nd, businessCards:(nd.businessCards||[]).map(c=>
        c.id===cardId ? {...c, salesRef:{type:entityType,id:String(entityId),name:entityName}} : c
      )};
    });
    // 通知：紐付け実行者以外の登録者に通知
    const linkedCards = (nd.businessCards||[]).filter(c=>selectedIds.includes(c.id));
    const notifyIds = [...new Set(linkedCards.map(c=>c.createdBy).filter(id=>id&&id!==uid))];
    if(notifyIds.length) {
      nd = addNotif(nd,{
        type:"sales_assign", entityType, entityId,
        title:`名刺が「${entityName}」に紐づけられました`,
        body:`${linkedCards.length}件の名刺が紐づけられました`,
        toUserIds:notifyIds, fromUserId:uid,
      });
    }
    save(nd);
    setMatchModal(null);
  };

  // モーダルオープナー（stateリセット込み）
  const openLossModal = (entityKey, entityId, entityName, newStatus) => {
    setLossReason(""); setLossNote(""); setLossNextCons("");
    setLossModal({entityKey, entityId, entityName, newStatus});
  };
  const openApproachModal = (entityKey, entityId, entityName) => {
    setAType("電話"); setANote(""); setADate(new Date().toISOString().slice(0,10));
    setApproachModal({entityKey, entityId, entityName});
  };
  const openNextActionModal = (entityKey, entityId, entityName, current={}) => {
    setNaType(current.nextActionType||"電話");
    setNaDate(current.nextActionDate||"");
    setNaNote(current.nextActionNote||"");
    setNextActionModal({entityKey, entityId, entityName});
  };

  // ── アプローチ履歴を追加 ────────────────────────────────────────────────
  const addApproachLog = (entityKey, entityId, entry) => {
    const uid = currentUser?.id;
    const log = {
      id: Date.now()+Math.random(),
      type: entry.type || "その他",
      note: entry.note || "",
      date: entry.date || new Date().toISOString().slice(0,10),
      userId: uid,
      createdAt: new Date().toISOString(),
    };
    const entities = data[entityKey] || [];
    const nd = {...data, [entityKey]: entities.map(e =>
      e.id===entityId ? {...e, approachLogs:[...(e.approachLogs||[]), log]} : e
    )};
    save(nd);
    setApproachModal(null);
  };

  // ── 次回アクション日を設定 ─────────────────────────────────────────────
  const setNextAction = (entityKey, entityId, nextAction) => {
    const entities = data[entityKey] || [];
    const nd = {...data, [entityKey]: entities.map(e =>
      e.id===entityId ? {...e, nextActionDate: nextAction.date, nextActionType: nextAction.type, nextActionNote: nextAction.note||""} : e
    )};
    save(nd);
    setNextActionModal(null);
  };

  // ── 失注・見送り理由を記録してステータス変更 ───────────────────────────
  const applyLossStatus = (entityKey, entityId, entityName, newStatus, lossData) => {
    const uid = currentUser?.id;
    const entities = data[entityKey] || [];
    const old = entities.find(e=>e.id===entityId);
    const entityTypeLabel = entityKey==="companies"?"企業":entityKey==="vendors"?"業者":"自治体";
    // ① エンティティのステータスと失注情報を更新
    let nd = {...data, [entityKey]: entities.map(e =>
      e.id===entityId ? {...e,
        status: newStatus,
        lossReason: lossData.reason || "",
        lossNote: lossData.note || "",
        nextConsideration: lossData.nextConsideration || "",
        lossAt: new Date().toISOString(),
      } : e
    )};
    // ② changeLog
    nd = addChangeLog(nd,{entityType:entityTypeLabel,entityId,entityName,field:"ステータス",oldVal:old?.status||"",newVal:newStatus,userId:uid});
    // ③ アプローチ履歴にも自動記録
    const lossLog = {
      id: Date.now()+Math.random(),
      type: "失注・見送り",
      note: `【${lossData.reason||""}】${lossData.note||""}`,
      date: new Date().toISOString().slice(0,10),
      userId: uid,
      isLoss: true,
      createdAt: new Date().toISOString(),
    };
    nd = {...nd, [entityKey]: (nd[entityKey]||[]).map(e=>
      e.id===entityId ? {...e, approachLogs:[...(e.approachLogs||[]), lossLog]} : e
    )};
    save(nd);
    setLossModal(null);
  };

  // ── メールテンプレート適用（変数を実際の値に置換して mailto を開く）──
  const applyEmailTemplate = (tpl, entity, contactName="") => {
    const today = new Date().toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"});
    const nextWeek = new Date(Date.now()+7*86400000).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"});
    const replace = (s) => (s||"")
      .replace(/\{\{会社名\}\}/g, entity?.name||"")
      .replace(/\{\{担当者名\}\}/g, contactName||"ご担当者")
      .replace(/\{\{自分の名前\}\}/g, currentUser?.name||"")
      .replace(/\{\{日付\}\}/g, today)
      .replace(/\{\{来週の日付\}\}/g, nextWeek);
    const subject = encodeURIComponent(replace(tpl.subject));
    const body    = encodeURIComponent(replace(tpl.body));
    const email   = entity?.email||"";
    window.open(`mailto:${email}?subject=${subject}&body=${body}`,"_blank");
  };

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

  // ── 全自治体展開状況 一括出力 ──────────────────────────────────────────
  const exportMuniStatusReport = () => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('ja-JP', {year:'numeric',month:'long',day:'numeric'});
    const todayISO = today.toISOString().slice(0,10);
    
    // BOM付きCSV（Excel対応）
    const bom = '﻿';
    const rows = [];
    
    // タイトル行
    rows.push([`全自治体 展開状況レポート`, '', '', '', '', '', '', '']);
    rows.push([`出力日：${todayStr}`, '', '', '', '', '', '', '']);
    rows.push(['', '', '', '', '', '', '', '']);
    rows.push(['地方', '都道府県', '自治体名', 'アプローチ', 'DUSTALK展開', '連携協定', '許可業者調査', '最新更新日']);
    
    JAPAN_REGIONS.forEach(rg => {
      const regionPrefs = (data.prefectures || []).filter(p => rg.prefs.includes(p.name));
      if (regionPrefs.length === 0) {
        // データなし都道府県も一応表示
        rg.prefs.forEach(prefName => {
          const prefMusis = (data.municipalities || []).filter(m => {
            const p = (data.prefectures||[]).find(pp=>String(pp.id)===String(m.prefectureId));
            return p?.name === prefName;
          });
          if (prefMusis.length === 0) {
            rows.push([rg.region, prefName, '（未登録）', '', '', '', '', '']);
          } else {
            prefMusis.forEach((m, mi) => {
              const updAt = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('ja-JP') : '';
              rows.push([
                mi === 0 ? rg.region : '',
                mi === 0 ? prefName : '',
                m.name || '',
                m.status || '未接触',
                m.dustalk || '未展開',
                m.treatyStatus || '未接触',
                m.surveyDone ? '完了' : '未完了',
                updAt,
              ]);
            });
          }
        });
        return;
      }
      regionPrefs.forEach((pref, pi) => {
        const prefMusis = (data.municipalities || []).filter(m => String(m.prefectureId) === String(pref.id));
        if (prefMusis.length === 0) {
          rows.push([pi === 0 ? rg.region : '', pref.name, '（未登録）', '', '', '', '', '']);
          return;
        }
        prefMusis.forEach((m, mi) => {
          const updAt = m.updatedAt ? new Date(m.updatedAt).toLocaleDateString('ja-JP') : '';
          rows.push([
            pi === 0 && mi === 0 ? rg.region : '',
            mi === 0 ? pref.name : '',
            m.name || '',
            m.status || '未接触',
            m.dustalk || '未展開',
            m.treatyStatus || '未接触',
            m.surveyDone ? '完了' : '未完了',
            updAt,
          ]);
        });
      });
    });
    
    const escape = v => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const csv = rows.map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([bom + csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `全自治体展開状況_${todayISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 全角変換 & スペース除去 (インポート正規化)
  const toZenkaku = (str) => {
    if (!str) return "";
    return str
      .replace(/\s/g, "") // 全スペース削除（半角・全角・タブ等）
      .replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)) // 半角英数記号→全角
      .replace(/ /g, "　"); // 残り半角スペース→全角
  };
  const toZenkakuKeepCase = (str) => {
    if (!str) return "";
    // スペース削除のみ、文字は全角変換
    return str.replace(/[\s　]/g, "").replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  };
  const normalizeImport = (str) => {
    if (!str) return "";
    // スペース類を全て除去し、半角英数→全角に変換
    return str
      .replace(/[\s　]/g, "") // スペース系全削除
      .replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)) // 英数→全角
      .replace(/[-]/g, "−"); // ハイフン→全角ハイフン
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


  const prefOf     = id=>prefs.find(p=>String(p.id)===String(id));

  // ── Excel seed import ─────────────────────────────────────────────────────
  const muniOf     = id=>munis.find(m=>String(m.id)===String(id));
  const vendorOf   = id=>vendors.find(v=>v.id===id);
  const companyOf  = id=>companies.find(c=>c.id===id);
  const muniVendors= mid=>vendors.filter(v=>(v.municipalityIds||[]).some(id=>String(id)===String(mid)));
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
    const eType2=entityKey==="companies"?"company":entityKey==="vendors"?"vendor":entityKey==="municipalities"?"muni":entityKey;
    const assigneesM=(entity?.assigneeIds||[]).filter(id=>id!==currentUser?.id);
    const toMemo=assigneesM.length?assigneesM:toAll;
    if(toMemo.length) nd=addNotif(nd,{type:"memo",entityId,entityType:eType2,title:`「${entity?.name||""}」にメモが追加されました`,body:text.slice(0,60),toUserIds:toMemo,fromUserId:currentUser?.id});
    save(nd);
    setMemoInputs(p=>({...p,[entityId]:""}));
  };
  const addChat=(entityKey,entityId,text)=>{
    if(!text?.trim()) return;
    const msg={id:Date.now(),userId:currentUser?.id,text,date:new Date().toISOString()};
    const arr=(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:[...(x.chat||[]),msg]}:x);
    const entity=(data[entityKey]||[]).find(x=>x.id===entityId);
    const eType=entityKey==="companies"?"company":entityKey==="vendors"?"vendor":entityKey==="municipalities"?"muni":entityKey;
    let nd={...data,[entityKey]:arr};
    // 担当者全員に通知（自分以外）
    const assignees=(entity?.assigneeIds||[]).filter(id=>id!==currentUser?.id);
    if(assignees.length) nd=addNotif(nd,{type:"task_comment",entityId,entityType:eType,title:`「${entity?.name||""}」にチャットが投稿されました`,body:(currentUser?.name||"")+": "+text.slice(0,50),toUserIds:assignees,fromUserId:currentUser?.id});
    // @メンション通知（担当者以外へも）
    const mentioned=users.filter(u=>u.id!==currentUser?.id&&!assignees.includes(u.id)&&text.includes(`@${u.name}`));
    if(mentioned.length) nd=addNotif(nd,{type:"mention",entityId,entityType:eType,title:`「${entity?.name||""}」でメンションされました`,body:text.slice(0,60),toUserIds:mentioned.map(u=>u.id),fromUserId:currentUser?.id});
    save(nd);
    setChatInputs(p=>({...p,[entityId]:""}));
  };
  const updateMemo=(entityKey,entityId,memoId,newText)=>{
    if(!newText?.trim()) return;
    const nd={...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:(x.memos||[]).map(m=>m.id===memoId?{...m,text:newText,editedAt:new Date().toISOString()}:m)}:x)};
    save(nd); setMemoEdit(null);
  };
  const deleteMemo=(entityKey,entityId,memoId)=>{
    const nd={...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,memos:(x.memos||[]).filter(m=>m.id!==memoId)}:x)};
    save(nd);
  };
  const updateChat=(entityKey,entityId,chatId,newText)=>{
    if(!newText?.trim()) return;
    const nd={...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:(x.chat||[]).map(m=>m.id===chatId?{...m,text:newText,editedAt:new Date().toISOString()}:m)}:x)};
    save(nd); setChatEdit(null);
  };
  const deleteChat=(entityKey,entityId,chatId)=>{
    const nd={...data,[entityKey]:(data[entityKey]||[]).map(x=>x.id===entityId?{...x,chat:(x.chat||[]).filter(m=>m.id!==chatId)}:x)};
    save(nd);
  };
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
      if(added.length) nd=addNotif(nd,{type:"sales_assign",entityType:"company",entityId:form.id,title:`「${form.name}」の担当者に追加されました`,body:"企業",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newComp={id:Date.now(),...form,status:form.status||"未接触",assigneeIds:form.assigneeIds||[],memos:[],chat:[],createdAt:new Date().toISOString()};
      nd={...nd,companies:[...companies,newComp]};
      nd=addChangeLog(nd,{entityType:"企業",entityId:newComp.id,entityName:newComp.name,field:"登録",oldVal:"",newVal:"新規登録"});
      save(nd); setSheet(null);
      setTimeout(()=>{setMatchChecked({});checkMatchAfterEntity("企業",newComp.id,newComp.name,nd);},100);
      return;
    }
    save(nd); setSheet(null);
  };
  const deleteCompany=id=>{save({...data,companies:companies.filter(c=>c.id!==id)});setActiveCompany(null);};
  const saveMuni=(skipDupCheck=false)=>{
    if(!form.name?.trim())return;
    if(!form.id && !skipDupCheck){
      const normName = s => (s||"").replace(/[\s　]/g,"").toLowerCase();
      const dup=munis.find(m=>String(m.prefectureId)===String(activePref)&&normName(m.name)===normName(form.name));
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
      if(added.length) nd=addNotif(nd,{type:"sales_assign",entityType:"muni",entityId:form.id,title:`「${form.name}」の担当者に追加されました`,body:"自治体",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newMuni={id:"m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),prefectureId:activePref,...form,dustalk:form.dustalk||"未展開",status:form.status||"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],approachLogs:[],createdAt:new Date().toISOString()};
      nd={...nd,municipalities:[...munis,newMuni]};
      nd=addChangeLog(nd,{entityType:"自治体",entityId:newMuni.id,entityName:newMuni.name,field:"登録",oldVal:"",newVal:"新規登録"});
      save(nd); setSheet(null);
      setTimeout(()=>{setMatchChecked({});checkMatchAfterEntity("自治体",newMuni.id,newMuni.name,nd);},100);
      return;
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
      if(added.length) nd=addNotif(nd,{type:"sales_assign",entityType:"vendor",entityId:form.id,title:`「${form.name}」の担当者に追加されました`,body:"業者",toUserIds:added,fromUserId:currentUser?.id});
    } else {
      const newVend={id:Date.now(),...form,status:form.status||"未接触",municipalityIds:form.municipalityIds||[],assigneeIds:form.assigneeIds||[],memos:[],chat:[],approachLogs:[],createdAt:new Date().toISOString()};
      nd={...nd,vendors:[...vendors,newVend]};
      nd=addChangeLog(nd,{entityType:"業者",entityId:newVend.id,entityName:newVend.name,field:"登録",oldVal:"",newVal:"新規登録"});
      save(nd); setSheet(null);
      setTimeout(()=>{setMatchChecked({});checkMatchAfterEntity("業者",newVend.id,newVend.name,nd);},100);
      return;
    }
    save(nd); setSheet(null);
  };
  const deleteVendor=id=>{save({...data,vendors:vendors.filter(v=>v.id!==id)});setActiveVendor(null);};
  const runBulk=()=>{
    const lines=bulkText.split("\n").map(l=>l.trim()).filter(Boolean);
    if(!lines.length)return;
    const queue=[],toAdd=[];
    const targetList=munis.filter(m=>String(m.prefectureId)===String(activePref));
    lines.forEach(name=>{const ex=checkDup(name,targetList);if(ex)queue.push({name,existing:ex});else toAdd.push(name);});
    let nd={...data,municipalities:[...(data.municipalities||[]),...toAdd.map(n=>({id:"m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9)+Math.floor(Math.random()*10000),prefectureId:activePref,name:n,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()}))]};
    save(nd);setBulkDone({added:toAdd.length,dupes:queue.length});
    if(queue.length>0){setDupQueue(queue);setDupIdx(0);}else{setBulkText("");setSheet("bulkDone");}
  };
  const handleDupChoice=choice=>{
    const item=dupQueue[dupIdx];
    if(choice==="edit"){setForm({...item.existing});setSheet("editMuni");setDupQueue([]);return;}
    save({...data,municipalities:[...munis,{id:"m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9)+Math.floor(Math.random()*10000),prefectureId:activePref,name:item.name,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()}]});
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
  const deleteBulkComp=(ids)=>{save({...data,companies:companies.filter(c=>!ids.includes(c.id))});resetBulk();};
  const deleteBulkVend=(ids)=>{save({...data,vendors:vendors.filter(v=>!ids.includes(v.id))});resetBulk();};
  const deleteBulkMuni=(ids)=>{save({...data,municipalities:munis.filter(m=>!ids.includes(m.id))});resetBulk();};
  const deleteBulkBizCard=(ids)=>{const nd={...data,businessCards:(data.businessCards||[]).filter(c=>!ids.includes(c.id))};save(nd);resetBulk();};
  const BulkBar=({statusMap,applyFn,field,extraFields,visibleIds=[],onDelete})=>(
    bulkMode?(
      <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:"0.875rem",padding:"0.75rem",marginBottom:"0.875rem"}}>
        {/* 上段：選択情報 ＋ 全選択/解除 */}
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem",flexWrap:"wrap"}}>
          <span style={{fontSize:"0.82rem",fontWeight:800,color:"#1d4ed8",minWidth:"5rem"}}>{bulkSelected.size}件選択中</span>
          <button onClick={()=>{
            const visSet=new Set(visibleIds);
            const allSelected=visibleIds.length>0&&visibleIds.every(id=>bulkSelected.has(id));
            if(allSelected){setBulkSelected(prev=>{const n=new Set(prev);visibleIds.forEach(id=>n.delete(id));return n;});}
            else{setBulkSelected(prev=>{const n=new Set(prev);visibleIds.forEach(id=>n.add(id));return n;});}
          }} style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"1.5px solid #3b82f6",background:visibleIds.every(id=>bulkSelected.has(id))&&visibleIds.length>0?"#3b82f6":"white",color:visibleIds.every(id=>bulkSelected.has(id))&&visibleIds.length>0?"white":"#3b82f6",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>
            {visibleIds.every(id=>bulkSelected.has(id))&&visibleIds.length>0?"✓ 全解除":`☑ 全選択（${visibleIds.length}件）`}
          </button>
          <button onClick={resetBulk} style={{padding:"0.3rem 0.625rem",borderRadius:999,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:600,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>✕ キャンセル</button>
        </div>
        {/* 下段：ステータス変更 ＋ 削除 */}
        <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
          {extraFields&&extraFields.map(([fld,lbl,map])=>(
            <select key={fld} value={bulkTarget===fld?bulkStatus:""} onChange={e=>{setBulkTarget(fld);setBulkStatus(e.target.value);}}
              style={{padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:"1px solid #93c5fd",fontSize:"0.75rem",fontFamily:"inherit",background:"white"}}>
              <option value="">── {lbl} ──</option>
              {Object.keys(map).map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          ))}
          {!extraFields&&statusMap&&(
            <select value={bulkStatus} onChange={e=>{setBulkTarget(field||"status");setBulkStatus(e.target.value);}}
              style={{padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:"1px solid #93c5fd",fontSize:"0.75rem",fontFamily:"inherit",background:"white",flex:1,minWidth:0}}>
              <option value="">── ステータス選択 ──</option>
              {Object.keys(statusMap).map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {(applyFn&&statusMap)&&<Btn size="sm" onClick={applyFn} disabled={!bulkStatus||bulkSelected.size===0}>✅ 一括変更</Btn>}
          {onDelete&&(
            <button onClick={()=>{
              if(bulkSelected.size===0){window.alert("削除する項目を選択してください。");return;}
              if(window.confirm(`選択した${bulkSelected.size}件を削除します。この操作は元に戻せません。`)){onDelete([...bulkSelected]);}
            }} style={{padding:"0.4rem 0.875rem",borderRadius:"0.625rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,opacity:bulkSelected.size===0?0.5:1}}>
              🗑 {bulkSelected.size>0?`${bulkSelected.size}件を削除`:"削除"}
            </button>
          )}
        </div>
      </div>
    ):null
  );

  // ── 共通削除モーダル ────────────────────────────────────────────────────────
  const DeleteModal=(()=>{
    if(!deleteModal) return null;
    const {type}=deleteModal;
    const NS=s=>(s||"").replace(/[\s\u3000]/g,"").toLowerCase();

    // タイプ別設定
    const cfg={
      company:{ label:"企業", icon:"🏢", all:companies,
        filterKey:"status", filterMap:COMPANY_STATUS, filterLabel:"ステータス",
        nameOf:c=>c.name||"",
        subOf:c=>[c.status,c.industry].filter(Boolean).join(" / "),
        onDelete:ids=>{save({...data,companies:companies.filter(c=>!ids.includes(c.id))});},
      },
      vendor:{ label:"業者", icon:"🔧", all:vendors,
        filterKey:"status", filterMap:VENDOR_STATUS, filterLabel:"ステータス",
        nameOf:v=>v.name||"",
        subOf:v=>[v.status,(v.municipalityIds||[]).map(id=>(munis.find(m=>m.id===id)||{}).name||"").filter(Boolean).slice(0,2).join("・")].filter(Boolean).join(" / "),
        onDelete:ids=>{save({...data,vendors:vendors.filter(v=>!ids.includes(v.id))});},
      },
      muni:{ label:"自治体", icon:"🏛️", all:munis,
        filterKey:"status", filterMap:MUNI_STATUS, filterLabel:"ステータス",
        nameOf:m=>{const p=prefs.find(x=>x.id===m.prefectureId);return [p?.name,m.name].filter(Boolean).join(" ");},
        subOf:m=>m.status||"未接触",
        onDelete:ids=>{save({...data,municipalities:munis.filter(m=>!ids.includes(m.id))});},
      },
      bizcard:{ label:"名刺", icon:"🪪", all:data.businessCards||[],
        filterKey:"company", filterMap:null, filterLabel:"会社名",
        nameOf:c=>(`${c.lastName||""}${c.firstName||""}`).trim()||"（名前なし）",
        subOf:c=>[c.company,c.title].filter(Boolean).join(" / "),
        onDelete:ids=>{const nd={...data,businessCards:(data.businessCards||[]).filter(c=>!ids.includes(c.id))};save(nd);},
      },
    }[type];
    if(!cfg) return null;

    // dmSearch / dmFilter / dmSelected は SalesView のトップstateを使用（hooks規則準拠）

    const items=cfg.all.filter(item=>{
      if(dmFilter){
        if(type==="bizcard"){if((item.company||"")!==dmFilter) return false;}
        else{if((item[cfg.filterKey]||"")!==dmFilter) return false;}
      }
      if(dmSearch){
        const q=NS(dmSearch);
        const hay=[cfg.nameOf(item),cfg.subOf(item)].join(" ");
        if(!NS(hay).includes(q)) return false;
      }
      return true;
    });

    const allSelected=items.length>0&&items.every(it=>dmSelected.has(it.id));
    const toggleAll=()=>{
      if(allSelected) setDmSelected(prev=>{const n=new Set(prev);items.forEach(it=>n.delete(it.id));return n;});
      else setDmSelected(prev=>{const n=new Set(prev);items.forEach(it=>n.add(it.id));return n;});
    };

    // 会社フィルター選択肢（名刺のみ）
    const bcCompanies=type==="bizcard"?[...new Set((data.businessCards||[]).map(c=>c.company||"（未設定）"))].sort((a,b)=>a.localeCompare(b,"ja")):[];

    return (
      <div style={{position:"fixed",inset:0,zIndex:700,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.6)"}}>
        <div style={{background:"white",borderRadius:"1.25rem 1.25rem 0 0",width:"100%",maxWidth:520,maxHeight:"90dvh",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 -8px 40px rgba(0,0,0,0.2)"}}>
          {/* ヘッダー */}
          <div style={{padding:"1rem 1.25rem 0.75rem",borderBottom:`1px solid ${C.borderLight}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.625rem"}}>
              <span style={{fontSize:"1.2rem"}}>{cfg.icon}</span>
              <span style={{fontWeight:800,fontSize:"1rem",color:C.text}}>{cfg.label}を削除</span>
              <span style={{fontSize:"0.72rem",color:C.textMuted,background:C.bg,borderRadius:999,padding:"0.15rem 0.5rem",border:`1px solid ${C.borderLight}`}}>全{cfg.all.length}件</span>
              <button onClick={()=>setDeleteModal(null)} style={{marginLeft:"auto",background:"none",border:"none",fontSize:"1.2rem",color:C.textMuted,cursor:"pointer",padding:"0.25rem",lineHeight:1}}>✕</button>
            </div>
            {/* 検索 */}
            <div style={{position:"relative",marginBottom:"0.5rem"}}>
              <span style={{position:"absolute",left:"0.625rem",top:"50%",transform:"translateY(-50%)",fontSize:"0.85rem",color:C.textMuted,pointerEvents:"none"}}>🔍</span>
              <input value={dmSearch} onChange={e=>setDmSearch(e.target.value)} placeholder="名前で検索..."
                style={{width:"100%",padding:"0.5rem 0.5rem 0.5rem 2rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.82rem",boxSizing:"border-box"}}/>
            </div>
            {/* フィルター */}
            {type==="bizcard"?(
              <select value={dmFilter} onChange={e=>setDmFilter(e.target.value)}
                style={{width:"100%",padding:"0.4rem 0.5rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.78rem",background:"white",marginBottom:"0.5rem"}}>
                <option value="">── 会社名で絞込 ──</option>
                {bcCompanies.map(n=><option key={n} value={n}>{n}（{(data.businessCards||[]).filter(c=>c.company===n).length}件）</option>)}
              </select>
            ):(
              <select value={dmFilter} onChange={e=>setDmFilter(e.target.value)}
                style={{width:"100%",padding:"0.4rem 0.5rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.78rem",background:"white",marginBottom:"0.5rem"}}>
                <option value="">── {cfg.filterLabel}で絞込 ──</option>
                {Object.keys(cfg.filterMap).map(s=><option key={s} value={s}>{s}（{cfg.all.filter(it=>(it[cfg.filterKey]||"未接触")===s).length}件）</option>)}
              </select>
            )}
            {/* 全選択バー */}
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.35rem 0"}}>
              <button onClick={toggleAll}
                style={{padding:"0.3rem 0.75rem",borderRadius:999,border:`1.5px solid ${allSelected?"#dc2626":"#3b82f6"}`,background:allSelected?"#fee2e2":"white",color:allSelected?"#dc2626":"#3b82f6",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>
                {allSelected?`✓ 全解除（${items.length}件）`:`☑ 全選択（${items.length}件）`}
              </button>
              <span style={{fontSize:"0.75rem",color:dmSelected.size>0?"#dc2626":C.textMuted,fontWeight:dmSelected.size>0?700:400}}>
                {dmSelected.size>0?`${dmSelected.size}件選択中`:"選択してください"}
              </span>
            </div>
          </div>

          {/* リスト */}
          <div style={{flex:1,overflowY:"auto",padding:"0.375rem 0"}}>
            {items.length===0?(
              <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.85rem"}}>
                {dmSearch||dmFilter?"条件に一致する項目がありません":"データがありません"}
              </div>
            ):items.map(item=>{
              const sel=dmSelected.has(item.id);
              return (
                <div key={item.id} onClick={()=>setDmSelected(prev=>{const n=new Set(prev);n.has(item.id)?n.delete(item.id):n.add(item.id);return n;})}
                  style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.625rem 1.25rem",cursor:"pointer",background:sel?"#fff1f2":"white",borderBottom:`1px solid ${C.borderLight}`,transition:"background 0.1s"}}>
                  <input type="checkbox" checked={sel} readOnly style={{width:16,height:16,accentColor:"#dc2626",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"0.88rem",fontWeight:sel?700:500,color:sel?"#dc2626":C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cfg.nameOf(item)}</div>
                    <div style={{fontSize:"0.7rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cfg.subOf(item)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* フッター */}
          <div style={{padding:"0.875rem 1.25rem",borderTop:`1px solid ${C.borderLight}`,flexShrink:0,display:"flex",gap:"0.625rem"}}>
            <button onClick={()=>setDeleteModal(null)}
              style={{flex:1,padding:"0.75rem",borderRadius:"0.875rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontFamily:"inherit",fontSize:"0.9rem",cursor:"pointer"}}>
              キャンセル
            </button>
            <button onClick={()=>{
              if(dmSelected.size===0){window.alert("削除する項目を選択してください。");return;}
              if(!window.confirm(`選択した${dmSelected.size}件を削除します。\nこの操作は元に戻せません。よろしいですか？`))return;
              cfg.onDelete([...dmSelected]);
              setDeleteModal(null);
            }}
              style={{flex:2,padding:"0.75rem",borderRadius:"0.875rem",border:"none",background:dmSelected.size===0?"#f3f4f6":"#dc2626",color:dmSelected.size===0?C.textMuted:"white",fontWeight:800,fontFamily:"inherit",fontSize:"0.9rem",cursor:dmSelected.size===0?"not-allowed":"pointer",transition:"background 0.15s"}}>
              🗑 {dmSelected.size>0?`${dmSelected.size}件を削除`:"削除する項目を選択"}
            </button>
          </div>
        </div>
      </div>
    );
  })();

  const TopTabs=()=>(
    <div style={{display:"flex",background:"white",borderRadius:"0.875rem",padding:"0.25rem",marginBottom:"1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,position:"relative"}}>
      {[["dash","📊","概況"],["map","🗺️","地図"],["company","🏢","企業"],["muni","🏛️","自治体"],["vendor","🔧","業者"],["bizcard","🪪","名刺"]].map(([id,icon,lbl])=>(
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
    const prefMunis=muniPickerPref?munis.filter(m=>String(m.prefectureId)===String(muniPickerPref)):[]; 
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
              const pn=prefs.find(p=>String(p.id)===String(m.prefectureId))?.name||"";
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
        {[...(memos||[])].reverse().map(m=>{
          const isMe=m.userId===currentUser?.id;
          const isEditing=memoEdit?.entityId===entityId&&memoEdit?.memoId===m.id;
          return (
            <div key={m.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.35rem"}}>
                <span style={{fontSize:"0.72rem",fontWeight:700,color:C.accentDark}}>{uName(m.userId)}</span>
                <div style={{display:"flex",alignItems:"center",gap:"0.25rem"}}>
                  <span style={{fontSize:"0.65rem",color:C.textMuted}}>{new Date(m.date).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                  {m.editedAt&&<span style={{fontSize:"0.58rem",color:C.textMuted}}>(編集済)</span>}
                  {isMe&&!isEditing&&<>
                    <button onClick={()=>setMemoEdit({entityId,memoId:m.id,text:m.text})}
                      style={{background:"none",border:"none",cursor:"pointer",padding:"0 0.2rem",fontSize:"0.75rem",color:C.textMuted,lineHeight:1}}>✏️</button>
                    <button onClick={()=>{if(window.confirm("このメモを削除しますか？"))deleteMemo(entityKey,entityId,m.id);}}
                      style={{background:"none",border:"none",cursor:"pointer",padding:"0 0.2rem",fontSize:"0.75rem",color:"#dc2626",lineHeight:1}}>🗑</button>
                  </>}
                </div>
              </div>
              {isEditing?(
                <div style={{display:"flex",flexDirection:"column",gap:"0.4rem"}}>
                  <textarea value={memoEdit.text}
                    onChange={e=>{setMemoEdit(p=>({...p,text:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                    style={{width:"100%",padding:"0.5rem",borderRadius:"0.5rem",border:`1.5px solid ${C.accent}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"none",minHeight:60,outline:"none",boxSizing:"border-box",lineHeight:1.5,overflow:"hidden"}}/>
                  <div style={{display:"flex",gap:"0.4rem",justifyContent:"flex-end"}}>
                    <button onClick={()=>setMemoEdit(null)} style={{padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>キャンセル</button>
                    <button onClick={()=>updateMemo(entityKey,entityId,m.id,memoEdit.text)} disabled={!memoEdit.text?.trim()}
                      style={{padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:"none",background:C.accent,color:"white",fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:memoEdit.text?.trim()?1:0.4}}>保存</button>
                  </div>
                </div>
              ):(
                <div style={{fontSize:"0.87rem",color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
              )}
            </div>
          );
        })}
        {!(memos||[]).length&&<div style={{textAlign:"center",padding:"1.25rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem"}}>メモがありません</div>}
      </div>
      <div style={{display:"flex",gap:"0.5rem"}}>
        <textarea value={memoInputs[entityId]||""} onChange={e=>{setMemoInputs(p=>({...p,[entityId]:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
          placeholder="メモを追加... (Shift+Enterで改行)"
          style={{flex:1,padding:"0.625rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"none",minHeight:60,outline:"none",lineHeight:1.5,overflow:"hidden"}}/>
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
            const isEditing=chatEdit?.entityId===entityId&&chatEdit?.chatId===m.id;
            return (
              <div key={m.id} style={{display:"flex",flexDirection:isMe?"row-reverse":"row",gap:"0.4rem",alignItems:"flex-end"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.68rem",fontWeight:800,color:"white",flexShrink:0}}>
                  {uInit(m.userId)}
                </div>
                <div style={{maxWidth:"72%"}}>
                  {!isMe&&<div style={{fontSize:"0.62rem",color:C.textMuted,marginBottom:"0.1rem",fontWeight:600}}>{uName(m.userId)}</div>}
                  {isEditing?(
                    <div style={{display:"flex",flexDirection:"column",gap:"0.3rem",minWidth:200}}>
                      <textarea value={chatEdit.text}
                        onChange={e=>{setChatEdit(p=>({...p,text:e.target.value}));e.target.style.height="auto";e.target.style.height=e.target.scrollHeight+"px";}}
                        style={{padding:"0.4rem 0.6rem",borderRadius:"0.5rem",border:`1.5px solid ${C.accent}`,fontSize:"0.85rem",fontFamily:"inherit",resize:"none",minHeight:40,outline:"none",lineHeight:1.5,overflow:"hidden",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:"0.3rem",justifyContent:isMe?"flex-end":"flex-start"}}>
                        <button onClick={()=>setChatEdit(null)} style={{padding:"0.2rem 0.6rem",borderRadius:"0.4rem",border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        <button onClick={()=>updateChat(entityKey,entityId,m.id,chatEdit.text)} disabled={!chatEdit.text?.trim()}
                          style={{padding:"0.2rem 0.6rem",borderRadius:"0.4rem",border:"none",background:C.accent,color:"white",fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>保存</button>
                      </div>
                    </div>
                  ):(
                    <div>
                      <div style={{background:isMe?C.accent:"white",color:isMe?"white":C.text,borderRadius:isMe?"0.875rem 0.875rem 0.25rem 0.875rem":"0.875rem 0.875rem 0.875rem 0.25rem",padding:"0.45rem 0.7rem",fontSize:"0.87rem",lineHeight:1.5,border:isMe?"none":`1px solid ${C.border}`,boxShadow:C.shadow}}>
                        {renderMsg(m.text)}
                      </div>
                      {isMe&&<div style={{display:"flex",gap:"0.2rem",justifyContent:"flex-end",marginTop:"0.15rem"}}>
                        <button onClick={()=>setChatEdit({entityId,chatId:m.id,text:m.text})}
                          style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:"0.68rem",color:C.textMuted}}>✏️</button>
                        <button onClick={()=>{if(window.confirm("このメッセージを削除しますか？"))deleteChat(entityKey,entityId,m.id);}}
                          style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:"0.68rem",color:"#dc2626"}}>🗑</button>
                      </div>}
                    </div>
                  )}
                  <div style={{fontSize:"0.58rem",color:C.textMuted,marginTop:"0.1rem",textAlign:isMe?"right":"left"}}>
                    {new Date(m.date).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}
                    {m.editedAt&&<span style={{marginLeft:"0.3rem"}}>(編集済)</span>}
                  </div>
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
            <div style={{display:"flex",gap:"0.4rem",alignItems:"flex-end"}}>
              <textarea value={val}
                onChange={e=>{setChatInputs(p=>({...p,[entityId]:e.target.value}));e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,160)+"px";}}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addChat(entityKey,entityId,val);}}}
                placeholder="メッセージ... (@ でメンション、Enterで送信)"
                style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",resize:"none",minHeight:40,maxHeight:160,lineHeight:1.5,overflow:"auto"}}/>
              <button onClick={()=>addChat(entityKey,entityId,val)} disabled={!val.trim()}
                style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:val.trim()?1:0.4,flexShrink:0}}>
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
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);

    // ── 期間選択ヘルパー
    const getWeekStart = (offset=0) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (d.getDay()||7) + 1 + offset*7); // Monday
      d.setHours(0,0,0,0);
      return d;
    };
    const [dashView, setDashView] = dashPeriod==="week" ? ["week","week"] : ["month","month"];
    // dashPeriod: "week" | "month"
    const periodStart = dashPeriod==="week"
      ? getWeekStart()
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = dashPeriod==="week"
      ? new Date(getWeekStart().getTime() + 7*24*60*60*1000 - 1)
      : new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
    const inPeriod = d => { const dt=new Date(d); return dt>=periodStart && dt<=periodEnd; };
    const periodLabel = dashPeriod==="week"
      ? `${periodStart.getMonth()+1}/${periodStart.getDate()}〜${periodEnd.getMonth()+1}/${periodEnd.getDate()}`
      : `${now.getFullYear()}年${now.getMonth()+1}月`;

    // ── 全アプローチログ（期間内）
    const allApproaches = [
      ...(data.companies||[]).flatMap(e=>(e.approachLogs||[]).map(l=>({...l,entityType:"企業",entityName:e.name,entityId:e.id}))),
      ...(data.vendors||[]).flatMap(e=>(e.approachLogs||[]).map(l=>({...l,entityType:"業者",entityName:e.name,entityId:e.id}))),
      ...(data.municipalities||[]).flatMap(e=>(e.approachLogs||[]).map(l=>({...l,entityType:"自治体",entityName:e.name,entityId:e.id}))),
    ].filter(l=>inPeriod(l.createdAt||l.date||""));

    const allChangeLogs = (data.changeLogs||[]).filter(l=>inPeriod(l.date));

    // ── KPI集計
    const totalMuni=munis.length;
    const deployed=munis.filter(m=>m.dustalk==="展開").length;
    const treatyDone=munis.filter(m=>m.treatyStatus==="協定済").length;
    const totalVend=vendors.length;
    const vendJoined=vendors.filter(v=>v.status==="加入済").length;
    const totalComp=companies.length;
    const compClosed=companies.filter(c=>c.status==="成約").length;
    const periodActivity = allChangeLogs.length + allApproaches.length;

    // ── 担当者別集計
    const userStats = users.map(u => {
      const myApproaches = allApproaches.filter(l=>l.userId===u.id);
      const myLogs = allChangeLogs.filter(l=>l.userId===u.id);

      // エンティティ別アプローチ数
      const compApproach  = myApproaches.filter(l=>l.entityType==="企業").length;
      const vendApproach  = myApproaches.filter(l=>l.entityType==="業者").length;
      const muniApproach  = myApproaches.filter(l=>l.entityType==="自治体").length;

      // 新規登録数
      const newComp  = myLogs.filter(l=>l.entityType==="企業"&&l.field==="登録").length;
      const newVend  = myLogs.filter(l=>l.entityType==="業者"&&l.field==="登録").length;
      const newMuni  = myLogs.filter(l=>l.entityType==="自治体"&&l.field==="登録").length;

      // ステータス変更
      const closedComp = myLogs.filter(l=>l.entityType==="企業"&&l.field==="ステータス"&&l.newVal==="成約").length;
      const closedVend = myLogs.filter(l=>l.entityType==="業者"&&(l.field==="ステータス")&&l.newVal==="加入済").length;
      const treaty     = myLogs.filter(l=>l.entityType==="自治体"&&l.field==="連携協定"&&l.newVal==="協定済").length;
      const dustalk    = myLogs.filter(l=>l.entityType==="自治体"&&l.field==="ダストーク"&&l.newVal==="展開").length;

      const total = myApproaches.length + myLogs.length;
      return { u, total, compApproach, vendApproach, muniApproach, newComp, newVend, newMuni, closedComp, closedVend, treaty, dustalk, myApproaches, myLogs };
    }).filter(s=>s.total>0).sort((a,b)=>b.total-a.total);

    // ── アプローチ種別集計（期間内）
    const approachByType = {};
    allApproaches.forEach(l=>{ approachByType[l.type]=(approachByType[l.type]||0)+1; });

    // ── 最近のアプローチログ（期間内、全員）
    const recentApproaches = [...allApproaches].sort((a,b)=>new Date(b.createdAt||b.date||"")-new Date(a.createdAt||a.date||"")).slice(0,15);

    // ── UI helpers
    const KPI=({label,val,sub,color="#1e293b",bg="white",icon})=>(
      <div style={{background:bg,border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.75rem 1rem",boxShadow:C.shadow,flex:1,minWidth:0}}>
        {icon&&<div style={{fontSize:"1.2rem",marginBottom:"0.1rem"}}>{icon}</div>}
        <div style={{fontSize:"1.6rem",fontWeight:800,color,lineHeight:1.1}}>{val??"-"}</div>
        <div style={{fontSize:"0.72rem",color:C.textSub,fontWeight:600,marginTop:"0.15rem"}}>{label}</div>
        {sub&&<div style={{fontSize:"0.65rem",color:C.textMuted,marginTop:"0.1rem"}}>{sub}</div>}
      </div>
    );

    return (
      <div style={{paddingBottom:"1rem"}}>
        <TopTabs/>

        {/* 期間切替 */}
        <div style={{display:"flex",background:"white",borderRadius:"0.875rem",padding:"0.25rem",marginBottom:"1rem",border:`1px solid ${C.border}`,gap:"0.25rem"}}>
          {[["week","📅 週間"],["month","📆 月間"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setDashPeriod(id)}
              style={{flex:1,padding:"0.55rem",borderRadius:"0.625rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.82rem",background:dashPeriod===id?C.accent:"transparent",color:dashPeriod===id?"white":C.textSub,transition:"all 0.15s"}}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{fontSize:"0.75rem",fontWeight:700,color:C.textMuted,marginBottom:"0.75rem",textAlign:"center"}}>{periodLabel}</div>

        {/* 期間KPI */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.5rem",marginBottom:"1rem"}}>
          <KPI icon="📞" label="アプローチ" val={allApproaches.length} color={C.accent}/>
          <KPI icon="🏢" label="企業 変更" val={allChangeLogs.filter(l=>l.entityType==="企業").length} color="#2563eb"/>
          <KPI icon="🏛️" label="自治体 変更" val={allChangeLogs.filter(l=>l.entityType==="自治体").length} color="#059669"/>
          <KPI icon="🔧" label="業者 変更" val={allChangeLogs.filter(l=>l.entityType==="業者").length} color="#7c3aed"/>
        </div>

        {/* 累計KPI */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"1rem"}}>
          <div style={{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",borderRadius:"0.875rem",padding:"0.875rem 1rem",color:"white"}}>
            <div style={{fontSize:"0.7rem",fontWeight:700,opacity:0.8,marginBottom:"0.25rem"}}>🏢 企業 成約</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.3rem"}}>
              <span style={{fontSize:"1.8rem",fontWeight:800}}>{compClosed}</span>
              <span style={{fontSize:"0.75rem",opacity:0.7}}>/ {totalComp}</span>
            </div>
          </div>
          <div style={{background:"linear-gradient(135deg,#065f46,#059669)",borderRadius:"0.875rem",padding:"0.875rem 1rem",color:"white"}}>
            <div style={{fontSize:"0.7rem",fontWeight:700,opacity:0.8,marginBottom:"0.25rem"}}>🏛️ 連携協定済</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.3rem"}}>
              <span style={{fontSize:"1.8rem",fontWeight:800}}>{treatyDone}</span>
              <span style={{fontSize:"0.75rem",opacity:0.7}}>/ {totalMuni}</span>
            </div>
          </div>
          <div style={{background:"linear-gradient(135deg,#5b21b6,#7c3aed)",borderRadius:"0.875rem",padding:"0.875rem 1rem",color:"white"}}>
            <div style={{fontSize:"0.7rem",fontWeight:700,opacity:0.8,marginBottom:"0.25rem"}}>✅ ダストーク展開</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.3rem"}}>
              <span style={{fontSize:"1.8rem",fontWeight:800}}>{deployed}</span>
              <span style={{fontSize:"0.75rem",opacity:0.7}}>/ {totalMuni}</span>
            </div>
          </div>
          <div style={{background:"linear-gradient(135deg,#92400e,#d97706)",borderRadius:"0.875rem",padding:"0.875rem 1rem",color:"white"}}>
            <div style={{fontSize:"0.7rem",fontWeight:700,opacity:0.8,marginBottom:"0.25rem"}}>🔧 業者 加入済</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"0.3rem"}}>
              <span style={{fontSize:"1.8rem",fontWeight:800}}>{vendJoined}</span>
              <span style={{fontSize:"0.75rem",opacity:0.7}}>/ {totalVend}</span>
            </div>
          </div>
        </div>

        {/* 担当者別スコアボード */}
        {userStats.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",overflow:"hidden",marginBottom:"1rem",boxShadow:C.shadow}}>
            <div style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,fontWeight:800,fontSize:"0.85rem",color:C.text}}>
              👥 担当者別アクティビティ
            </div>
            {userStats.map(({u,total,compApproach,vendApproach,muniApproach,newComp,newVend,newMuni,closedComp,closedVend,treaty,dustalk},idx)=>{
              const maxTotal = userStats[0]?.total||1;
              const initials = (u.name||"?").split(/\s+/).map(s=>s[0]).join("").slice(0,2);
              const barColor = ["#2563eb","#7c3aed","#059669","#d97706","#dc2626"][idx%5];
              return (
                <div key={u.id} style={{padding:"0.875rem 1rem",borderBottom:`1px solid ${C.borderLight}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.6rem",marginBottom:"0.5rem"}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${barColor},${barColor}99)`,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:800,fontSize:"0.78rem",flexShrink:0}}>{initials}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:"0.88rem",color:C.text}}>{u.name}</div>
                      <div style={{fontSize:"0.65rem",color:C.textMuted}}>{total}件のアクティビティ</div>
                    </div>
                    <div style={{fontSize:"1.1rem",fontWeight:800,color:barColor}}>{total}</div>
                  </div>
                  {/* プログレスバー */}
                  <div style={{height:4,background:"#f1f5f9",borderRadius:999,marginBottom:"0.6rem",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(total/maxTotal*100).toFixed(1)}%`,background:barColor,borderRadius:999,transition:"width 0.3s"}}/>
                  </div>
                  {/* 内訳チップ */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:"0.3rem"}}>
                    {compApproach>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#dbeafe",color:"#1d4ed8",borderRadius:999,padding:"0.15rem 0.5rem"}}>🏢 企業 {compApproach}件</span>}
                    {muniApproach>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#d1fae5",color:"#065f46",borderRadius:999,padding:"0.15rem 0.5rem"}}>🏛️ 自治体 {muniApproach}件</span>}
                    {vendApproach>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#ede9fe",color:"#5b21b6",borderRadius:999,padding:"0.15rem 0.5rem"}}>🔧 業者 {vendApproach}件</span>}
                    {newComp>0&&<span style={{fontSize:"0.68rem",fontWeight:600,background:"#fff7ed",color:"#c2410c",borderRadius:999,padding:"0.15rem 0.5rem"}}>➕企業登録 {newComp}</span>}
                    {newMuni>0&&<span style={{fontSize:"0.68rem",fontWeight:600,background:"#ecfdf5",color:"#047857",borderRadius:999,padding:"0.15rem 0.5rem"}}>➕自治体登録 {newMuni}</span>}
                    {newVend>0&&<span style={{fontSize:"0.68rem",fontWeight:600,background:"#f5f3ff",color:"#6d28d9",borderRadius:999,padding:"0.15rem 0.5rem"}}>➕業者登録 {newVend}</span>}
                    {closedComp>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#fef3c7",color:"#b45309",borderRadius:999,padding:"0.15rem 0.5rem"}}>⭐企業成約 {closedComp}</span>}
                    {dustalk>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#cffafe",color:"#0e7490",borderRadius:999,padding:"0.15rem 0.5rem"}}>✅展開 {dustalk}</span>}
                    {treaty>0&&<span style={{fontSize:"0.68rem",fontWeight:700,background:"#fce7f3",color:"#9d174d",borderRadius:999,padding:"0.15rem 0.5rem"}}>🤝協定 {treaty}</span>}
                  </div>
                </div>
              );
            })}
            {userStats.length===0&&(
              <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem"}}>
                この期間にアクティビティがありません
              </div>
            )}
          </div>
        )}

        {/* アプローチ種別内訳 */}
        {allApproaches.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"0.875rem 1rem",marginBottom:"1rem",boxShadow:C.shadow}}>
            <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text,marginBottom:"0.75rem"}}>📊 アプローチ種別</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem"}}>
              {Object.entries(approachByType).sort((a,b)=>b[1]-a[1]).map(([type,cnt])=>(
                <div key={type} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:C.bg,borderRadius:"0.75rem",padding:"0.4rem 0.75rem"}}>
                  <span style={{fontSize:"0.95rem"}}>{APPROACH_ICON[type]||"📝"}</span>
                  <span style={{fontSize:"0.82rem",fontWeight:700,color:C.text}}>{type}</span>
                  <span style={{fontSize:"0.85rem",fontWeight:800,color:C.accent}}>{cnt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 最近のアプローチ履歴 */}
        {recentApproaches.length>0&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",overflow:"hidden",boxShadow:C.shadow}}>
            <div style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,fontWeight:800,fontSize:"0.85rem",color:C.text}}>
              📋 アプローチ履歴
            </div>
            {recentApproaches.map((log,i)=>{
              const u=users.find(x=>x.id===log.userId);
              const typeColor={"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[log.entityType]||"#64748b";
              const ds=(log.createdAt||log.date||"").slice(0,10);
              return (
                <div key={log.id||i} style={{display:"flex",alignItems:"flex-start",gap:"0.6rem",padding:"0.65rem 1rem",borderBottom:`1px solid ${C.borderLight}`}}>
                  <span style={{fontSize:"1rem",flexShrink:0,marginTop:"0.1rem"}}>{APPROACH_ICON[log.type]||"📝"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem",flexWrap:"wrap"}}>
                      <span style={{fontSize:"0.68rem",fontWeight:800,color:"white",background:typeColor,borderRadius:999,padding:"0.05rem 0.4rem"}}>{log.entityType}</span>
                      <span style={{fontSize:"0.82rem",fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{log.entityName}</span>
                      {u&&<span style={{fontSize:"0.68rem",color:C.textSub}}>👤{u.name}</span>}
                      <span style={{fontSize:"0.68rem",color:C.textMuted,marginLeft:"auto"}}>{ds}</span>
                    </div>
                    {log.note&&<div style={{fontSize:"0.78rem",color:C.textSub,marginTop:"0.15rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {recentApproaches.length===0&&allApproaches.length===0&&userStats.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 1rem",color:C.textMuted}}>
            <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>📊</div>
            <div style={{fontWeight:700,fontSize:"0.88rem"}}>この期間のアクティビティはありません</div>
            <div style={{fontSize:"0.75rem",marginTop:"0.25rem"}}>アプローチを記録すると、ここに集計されます</div>
          </div>
        )}
      </div>
    );
  }

  // ── モーダル一括レンダラー（早期returnでも表示できるよう関数化）────────────
  const renderModals = () => (
    <>
      {/* ════ 失注・見送りモーダル ════ */}
{lossModal&&(
  <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"1rem"}} onClick={e=>{if(e.target===e.currentTarget)setLossModal(null);}}>
    <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:400,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
      <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.2rem"}}>📋 {lossModal.newStatus}の理由を記録</div>
      <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem"}}>「{lossModal.entityName}」</div>
      <div style={{marginBottom:"0.75rem"}}>
        <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>理由</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
          {LOSS_REASONS.map(r=>(
            <button key={r} onClick={()=>setLossReason(r)}
              style={{padding:"0.3rem 0.65rem",borderRadius:999,border:`1.5px solid ${lossReason===r?C.accent:C.border}`,background:lossReason===r?C.accentBg:"white",color:lossReason===r?C.accent:C.textSub,fontSize:"0.75rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <FieldLbl label="補足（任意）"><Textarea value={lossNote} onChange={e=>setLossNote(e.target.value)} style={{height:64}} placeholder="詳細を入力..."/></FieldLbl>
      <FieldLbl label="次回検討時期（任意）"><Input type="month" value={lossNextCons} onChange={e=>setLossNextCons(e.target.value)}/></FieldLbl>
      <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem"}}>
        <Btn variant="secondary" style={{flex:1}} onClick={()=>setLossModal(null)}>キャンセル</Btn>
        <Btn style={{flex:2}} onClick={()=>applyLossStatus(lossModal.entityKey,lossModal.entityId,lossModal.entityName,lossModal.newStatus,{reason:lossReason,note:lossNote,nextConsideration:lossNextCons})}>
          記録して変更
        </Btn>
      </div>
    </div>
  </div>
)}

{/* ════ アプローチ記録モーダル ════ */}
{approachModal&&(
  <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"1rem"}} onClick={e=>{if(e.target===e.currentTarget)setApproachModal(null);}}>
    <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:380,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
      <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.2rem"}}>📞 アプローチを記録</div>
      <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem"}}>「{approachModal.entityName}」</div>
      <div style={{marginBottom:"0.75rem"}}>
        <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>種別</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
          {APPROACH_TYPES.map(t=>(
            <button key={t} onClick={()=>setAType(t)}
              style={{padding:"0.3rem 0.65rem",borderRadius:999,border:`1.5px solid ${aType===t?C.accent:C.border}`,background:aType===t?C.accentBg:"white",color:aType===t?C.accent:C.textSub,fontSize:"0.75rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {APPROACH_ICON[t]} {t}
            </button>
          ))}
        </div>
      </div>
      <FieldLbl label="日付"><Input type="date" value={aDate} onChange={e=>setADate(e.target.value)}/></FieldLbl>
      <FieldLbl label="内容・メモ"><Textarea value={aNote} onChange={e=>setANote(e.target.value)} style={{height:80}} placeholder="アプローチの内容を入力..."/></FieldLbl>
      <div style={{display:"flex",gap:"0.75rem",marginTop:"0.5rem"}}>
        <Btn variant="secondary" style={{flex:1}} onClick={()=>setApproachModal(null)}>キャンセル</Btn>
        <Btn style={{flex:2}} onClick={()=>addApproachLog(approachModal.entityKey,approachModal.entityId,{type:aType,note:aNote,date:aDate})} disabled={!aNote.trim()&&!aDate}>記録する</Btn>
      </div>
    </div>
  </div>
)}

{/* ════ 次回アクション設定モーダル ════ */}
{nextActionModal&&(
  <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"1rem"}} onClick={e=>{if(e.target===e.currentTarget)setNextActionModal(null);}}>
    <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:360,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
      <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.2rem"}}>📅 次回アクション</div>
      <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem"}}>「{nextActionModal.entityName}」</div>
      <div style={{marginBottom:"0.75rem"}}>
        <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.35rem"}}>種別</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
          {NEXT_ACTION_TYPES.map(t=>(
            <button key={t} onClick={()=>setNaType(t)}
              style={{padding:"0.3rem 0.65rem",borderRadius:999,border:`1.5px solid ${naType===t?C.accent:C.border}`,background:naType===t?C.accentBg:"white",color:naType===t?C.accent:C.textSub,fontSize:"0.75rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <FieldLbl label="日付 *"><Input type="date" value={naDate} onChange={e=>setNaDate(e.target.value)}/></FieldLbl>
      <FieldLbl label="メモ（任意）"><Input value={naNote} onChange={e=>setNaNote(e.target.value)} placeholder="例：提案書を持参する"/></FieldLbl>
      <div style={{display:"flex",gap:"0.75rem",marginTop:"0.5rem"}}>
        <Btn variant="secondary" style={{flex:1}} onClick={()=>setNextActionModal(null)}>キャンセル</Btn>
        <Btn style={{flex:2}} onClick={()=>setNextAction(nextActionModal.entityKey,nextActionModal.entityId,{type:naType,date:naDate,note:naNote})} disabled={!naDate}>設定する</Btn>
      </div>
    </div>
  </div>
)}

{/* ════ 名刺マッチングモーダル ════ */}
{matchModal&&(()=>{
  const COLOR = {"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"};
  if(matchModal.mode==="card_to_entity") {
    const card = matchModal.cards[0];
    return (
      <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"1rem"}} onClick={e=>{if(e.target===e.currentTarget)setMatchModal(null);}}>
        <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:380,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
          <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.5rem"}}>🔗 営業先と一致しました</div>
          <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem"}}>
            「{card.lastName}{card.firstName}」({card.company}) を以下に紐づけますか？
          </div>
          {matchModal.entities.map(ent=>(
            <div key={ent.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.6rem 0.75rem",marginBottom:"0.5rem",background:`${COLOR[ent.type]}15`,border:`1.5px solid ${COLOR[ent.type]}44`,borderRadius:"0.75rem"}}>
              <span style={{fontSize:"0.7rem",fontWeight:800,color:"white",background:COLOR[ent.type],borderRadius:999,padding:"0.1rem 0.5rem",flexShrink:0}}>{ent.type}</span>
              <span style={{fontSize:"0.88rem",fontWeight:700,color:COLOR[ent.type],flex:1}}>{ent.name}</span>
              {card.salesRef ? (
                <Btn size="sm" onClick={()=>applyBizCardLinks([card.id],ent.type,ent.id,ent.name,matchModal.savedData)}>上書き</Btn>
              ) : (
                <Btn size="sm" onClick={()=>applyBizCardLinks([card.id],ent.type,ent.id,ent.name,matchModal.savedData)}>紐づける</Btn>
              )}
            </div>
          ))}
          <Btn variant="secondary" style={{width:"100%",marginTop:"0.5rem"}} onClick={()=>setMatchModal(null)}>スキップ</Btn>
        </div>
      </div>
    );
  }
  if(matchModal.mode==="import_to_entity") {
    const allCardIds = matchModal.groups.flatMap(g=>g.cards.map(c=>c.id));
    const checked = matchChecked;
    const initChecked = Object.fromEntries(allCardIds.map(id=>[id, checked[id]!==false]));
    return (
      <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"0"}} onClick={e=>{if(e.target===e.currentTarget)setMatchModal(null);}}>
        <div style={{background:"white",borderRadius:"1.25rem 1.25rem 0 0",padding:"1.5rem",maxWidth:480,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.5rem"}}>🔗 営業先との一致が見つかりました</div>
          <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem"}}>紐づける名刺を選択してください</div>
          {matchModal.groups.map(({entity, cards})=>(
            <div key={entity.id} style={{marginBottom:"1rem",background:"#f8fafc",borderRadius:"0.75rem",padding:"0.75rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.5rem"}}>
                <span style={{fontSize:"0.7rem",fontWeight:800,color:"white",background:COLOR[entity.type],borderRadius:999,padding:"0.1rem 0.45rem"}}>{entity.type}</span>
                <span style={{fontSize:"0.88rem",fontWeight:700}}>{entity.name}</span>
                <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"auto"}}>{cards.length}件一致</span>
              </div>
              {cards.map(card=>{
                const isChecked = initChecked[card.id]!==false;
                const hasExisting = !!card.salesRef;
                return (
                  <div key={card.id} onClick={()=>setMatchChecked(p=>({...p,[card.id]:!isChecked}))}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.4rem 0.5rem",background:"white",borderRadius:"0.5rem",marginBottom:"0.25rem",cursor:"pointer",border:`1px solid ${isChecked?C.accent:C.borderLight}`}}>
                    <span style={{fontSize:"1rem"}}>{isChecked?"☑":"☐"}</span>
                    <span style={{fontSize:"0.82rem",fontWeight:600,flex:1}}>{card.lastName}{card.firstName}</span>
                    {card.title&&<span style={{fontSize:"0.7rem",color:C.textSub}}>{card.title}</span>}
                    {hasExisting&&<span style={{fontSize:"0.65rem",background:"#fef3c7",color:"#d97706",borderRadius:999,padding:"0.05rem 0.35rem",flexShrink:0}}>紐付済</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{display:"flex",gap:"0.75rem",paddingTop:"0.5rem"}}>
            <Btn variant="secondary" style={{flex:1}} onClick={()=>setMatchModal(null)}>スキップ</Btn>
            <Btn style={{flex:2}} onClick={()=>{
              matchModal.groups.forEach(({entity,cards})=>{
                const sel = cards.filter(c=>initChecked[c.id]!==false).map(c=>c.id);
                if(sel.length) applyBizCardLinks(sel,entity.type,entity.id,entity.name,matchModal.savedData);
              });
            }}>選択した名刺を紐づける</Btn>
          </div>
        </div>
      </div>
    );
  }
  // entity_to_cards
  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.5)",padding:"1rem"}} onClick={e=>{if(e.target===e.currentTarget)setMatchModal(null);}}>
      <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:400,width:"100%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:"1rem",fontWeight:800,color:C.text,marginBottom:"0.5rem"}}>🔗 一致する名刺が見つかりました</div>
        <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"1rem"}}>
          <span style={{fontSize:"0.7rem",fontWeight:800,color:"white",background:COLOR[matchModal.entity.type]||C.accent,borderRadius:999,padding:"0.1rem 0.45rem"}}>{matchModal.entity.type}</span>
          <span style={{fontSize:"0.88rem",fontWeight:700}}>{matchModal.entity.name}</span>
        </div>
        {matchModal.cards.map(card=>{
          const isChecked = matchChecked[card.id]!==false;
          return (
            <div key={card.id} onClick={()=>setMatchChecked(p=>({...p,[card.id]:!isChecked}))}
              style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.5rem 0.75rem",background:"#f8fafc",borderRadius:"0.625rem",marginBottom:"0.4rem",cursor:"pointer",border:`1.5px solid ${isChecked?C.accent:C.borderLight}`}}>
              <span style={{fontSize:"1rem"}}>{isChecked?"☑":"☐"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"0.85rem",fontWeight:600}}>{card.lastName}{card.firstName}</div>
                {card.title&&<div style={{fontSize:"0.7rem",color:C.textSub}}>{card.title}</div>}
              </div>
              {card.salesRef&&<span style={{fontSize:"0.65rem",background:"#fef3c7",color:"#d97706",borderRadius:999,padding:"0.05rem 0.35rem"}}>紐付済</span>}
            </div>
          );
        })}
        <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem"}}>
          <Btn variant="secondary" style={{flex:1}} onClick={()=>setMatchModal(null)}>スキップ</Btn>
          <Btn style={{flex:2}} onClick={()=>{
            const sel=matchModal.cards.filter(c=>matchChecked[c.id]!==false).map(c=>c.id);
            if(sel.length) applyBizCardLinks(sel,matchModal.entity.type,matchModal.entity.id,matchModal.entity.name,matchModal.savedData);
            else setMatchModal(null);
          }}>紐づける</Btn>
        </div>
      </div>
    </div>
  );
})()}
    </>
  );

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
            {/* 次回アクション表示 */}
            {comp.nextActionDate&&(
              <div style={{marginTop:"0.5rem",display:"flex",alignItems:"center",gap:"0.4rem",padding:"0.3rem 0.6rem",background:"#f0f9ff",borderRadius:"0.5rem",border:"1px solid #bae6fd"}}>
                <span style={{fontSize:"0.7rem"}}>{APPROACH_ICON[comp.nextActionType]||"📅"}</span>
                <span style={{fontSize:"0.75rem",fontWeight:700,color:"#0369a1"}}>{comp.nextActionDate}</span>
                <span style={{fontSize:"0.72rem",color:"#0369a1"}}>{comp.nextActionType}</span>
                {comp.nextActionNote&&<span style={{fontSize:"0.7rem",color:"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{comp.nextActionNote}</span>}
                <button onClick={()=>openNextActionModal("companies",comp.id,comp.name,comp)} style={{background:"none",border:"none",cursor:"pointer",fontSize:"0.7rem",color:"#94a3b8",flexShrink:0}}>✏️</button>
              </div>
            )}
          </Card>
          {/* アクションボタン行 */}
          <div style={{marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.4rem",flexWrap:"wrap"}}>
            <button onClick={()=>{const nd={...data,companies:companies.map(c=>c.id===comp.id?{...c,needFollow:!comp.needFollow}:c)};save(nd);}}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:comp.needFollow?"#fef9c3":"#f3f4f6",color:comp.needFollow?"#854d0e":"#6b7280"}}>
              {comp.needFollow?"⭐ フォロー中":"☆ フォロー"}
            </button>
            <button onClick={()=>openApproachModal("companies",comp.id,comp.name)}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#dbeafe",color:"#1d4ed8"}}>
              📞 アプローチ記録
            </button>
            <button onClick={()=>openNextActionModal("companies",comp.id,comp.name,comp)}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#d1fae5",color:"#065f46"}}>
              📅 {comp.nextActionDate?"次回変更":"次回設定"}
            </button>
          </div>
          {/* Status quick-change */}
          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ステータス変更</div>
            <StatusPicker map={COMPANY_STATUS} value={comp.status} onChange={s=>{
              if(CLOSED_STATUSES.has(s)){
                openLossModal("companies",comp.id,comp.name,s);
              } else {
                let nd={...data,companies:companies.map(c=>c.id===comp.id?{...c,status:s}:c)};
                nd=addChangeLog(nd,{entityType:"企業",entityId:comp.id,entityName:comp.name,field:"ステータス",oldVal:comp.status,newVal:s});
                save(nd);
              }
            }}/>
            {/* 失注情報表示 */}
            {CLOSED_STATUSES.has(comp.status)&&comp.lossReason&&(
              <div style={{marginTop:"0.4rem",padding:"0.4rem 0.6rem",background:"#fee2e2",borderRadius:"0.5rem",fontSize:"0.75rem",color:"#dc2626"}}>
                📋 {comp.lossReason}{comp.lossNote&&`：${comp.lossNote}`}{comp.nextConsideration&&` （次回検討: ${comp.nextConsideration}）`}
              </div>
            )}
          </div>
          {/* Sub-tabs: タイムライン・チャット・タスク・ファイル */}
          <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
            {[["timeline","📋","履歴"],["chat","💬","チャット"],["tasks","✅","タスク"],["bizcard","🪪","名刺"],["files","📎","ファイル"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&compChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{compChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===comp.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>

          {activeDetail==="timeline"&&<ApproachTimeline entity={comp} entityKey="companies" entityId={comp.id} users={users} onAddApproach={()=>openApproachModal("companies",comp.id,comp.name)} onSave={nd=>save(nd)} data={data}/>}
          {activeDetail==="chat"&&ChatSection({chat:comp.chat,entityKey:"companies",entityId:comp.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="企業" entityId={comp.id} entityName={comp.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/>}
          {activeDetail==="bizcard"&&(()=>{
            const linked=(data.businessCards||[]).filter(c=>String(c.salesRef?.id)===String(comp.id)&&c.salesRef?.type==="企業");
            return <LinkedBizcardList cards={linked} users={users} onUnlink={id=>{const nd={...data,businessCards:(data.businessCards||[]).map(c=>c.id===id?{...c,salesRef:null}:c)};save(nd);}} onNavigateToBizcard={()=>{setActiveCompany(null);setSalesTab("bizcard");}}/>;
          })()}
          {activeDetail==="files"&&<FileSection files={comp.files||[]} currentUserId={currentUser?.id}
            entityType="companies" entityId={comp.id}
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
    })).filter(g=>g.items.length>0||(compSearch&&companies.some(c=>(c.status||"未接触")===g.status)));
    const compFilteredBase = companies.filter(c=>{
      if(compFilter.assignee==="__me__") return (c.assigneeIds||[]).some(id=>id===currentUser?.id);
      if(compFilter.assignee) return (c.assigneeIds||[]).some(id=>String(id)===compFilter.assignee);
      return true;
    });
    const searchedComps = compSearch ? compFilteredBase.filter(c=>normSearch(c.name).includes(normSearch(compSearch))) : null;
    const compVisibleIds=(searchedComps||compFilteredBase).map(c=>c.id);
    return (
      <div>
        <TopTabs/>
        <BulkBar statusMap={COMPANY_STATUS} applyFn={applyBulkComp} visibleIds={compVisibleIds} onDelete={deleteBulkComp}/>
        {/* 担当者フィルタ */}
        {(()=>{
          const hasF=!!compFilter.assignee;
          const fCount=compFilteredBase.length;
          const statusCounts=hasF?Object.keys(COMPANY_STATUS).map(s=>{const n=compFilteredBase.filter(c=>(c.status||"未接触")===s).length;return n>0?{s,n}:null;}).filter(Boolean):[];
          return (
            <div style={{background:"#f8fafc",border:`1px solid ${hasF?C.accent:C.border}`,borderRadius:"0.875rem",padding:"0.625rem 0.75rem",marginBottom:"0.75rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:hasF?"0.4rem":0}}>
                <select value={compFilter.assignee} onChange={e=>setCompFilter(p=>({...p,assignee:e.target.value}))}
                  style={{flex:1,padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:`1.5px solid ${hasF?C.accent:C.border}`,fontSize:"0.78rem",background:hasF?"#eff6ff":"white",color:hasF?C.accent:C.text,fontFamily:"inherit",fontWeight:hasF?700:400}}>
                  <option value="">👤 担当者で絞り込み</option>
                  <option value="__me__">自分</option>
                  {users.map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
                </select>
                {hasF&&<span style={{fontSize:"0.8rem",fontWeight:800,color:"#7c3aed",flexShrink:0}}>{fCount}件</span>}
                {hasF&&<button onClick={()=>setCompFilter(p=>({...p,assignee:""}))}
                  style={{fontSize:"0.65rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:999,padding:"0.1rem 0.45rem",cursor:"pointer",fontWeight:700,fontFamily:"inherit",flexShrink:0}}>解除</button>}
              </div>
              {hasF&&statusCounts.length>0&&(
                <div style={{display:"flex",gap:"0.25rem",flexWrap:"wrap"}}>
                  {statusCounts.map(({s,n})=>(
                    <span key={s} style={{fontSize:"0.62rem",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700,background:COMPANY_STATUS[s]?.bg,color:COMPANY_STATUS[s]?.color}}>{s}: {n}件</span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        {/* フォロー中企業 */}
        {(()=>{
          const followComps = companies.filter(c=>c.needFollow);
          if(!followComps.length) return null;
          return (
            <div style={{background:"#fefce8",border:"1.5px solid #fde047",borderRadius:"0.875rem",padding:"0.75rem 1rem",marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.75rem",fontWeight:800,color:"#854d0e",marginBottom:"0.4rem"}}>⭐ フォロー中 ({followComps.length}件)</div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {followComps.map(c=>(
                  <div key={c.id} onClick={()=>{setSalesTab("company");saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("timeline");}}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer",padding:"0.35rem 0.5rem",background:"white",borderRadius:"0.5rem",border:"1px solid #fde047"}}>
                    <span style={{fontSize:"0.8rem",fontWeight:700,color:C.text,flex:1}}>{c.name}</span>
                    <SChip s={c.status} map={COMPANY_STATUS}/>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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
          <button onClick={()=>{const rows=companies.map(c=>[c.name||"",c.status||"",c.industry||"",c.contactName||"",c.phone||"",c.email||"",c.address||"",(c.memos||[]).map(m=>m.text||"").join(" / ")]);downloadCSV("企業一覧.csv",["企業名","ステータス","業種","担当者名","電話番号","メールアドレス","住所","メモ"],rows);}}
            style={{padding:"0.45rem 0.625rem",borderRadius:"0.75rem",border:"1.5px solid #059669",background:"#d1fae5",color:"#065f46",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>📤CSV</button>
          <button onClick={()=>{setDeleteModal({type:"company"});setDmSearch("");setDmFilter("");setDmSelected(new Set());}}
            style={{padding:"0.45rem 0.75rem",borderRadius:"0.75rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>🗑 削除</button>
          <Btn size="sm" onClick={()=>{setForm({status:"未接触",assigneeIds:[]});setSheet("addCompany");}}>＋</Btn>
        </div>
        {companies.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 1rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
            <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🏢</div>
            <div style={{fontWeight:700,marginBottom:"0.25rem",fontSize:"0.9rem"}}>企業が登録されていません</div>
            <div style={{fontSize:"0.8rem"}}>「＋」から追加してください</div>
          </div>
        )}
        {/* 担当者フィルタ結果フラットリスト */}
        {!compSearch&&compFilter.assignee&&(()=>{
          if(!compFilteredBase.length) return (
            <div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`,fontSize:"0.82rem"}}>該当する企業がありません</div>
          );
          return (
            <div style={{marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,marginBottom:"0.4rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                担当案件 {compFilteredBase.length}件
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {compFilteredBase.map(c=>{
                  const lastMemo=(c.memos||[]).slice(-1)[0];
                  return (
                    <div key={c.id} onClick={()=>{setSalesTab("company");saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("timeline");}}
                      style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.625rem 0.75rem",background:"white",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,cursor:"pointer",boxShadow:C.shadow}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.35rem",marginBottom:"0.2rem"}}>
                          <span style={{fontSize:"0.85rem",fontWeight:700,color:C.text,flex:1}}>{c.name}</span>
                          <SChip s={c.status} map={COMPANY_STATUS}/>
                          {c.needFollow&&<span style={{fontSize:"0.58rem",background:"#fef9c3",color:"#854d0e",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:700,flexShrink:0}}>⭐</span>}
                        </div>
                        <AssigneeRow ids={c.assigneeIds}/>
                        {lastMemo&&<div style={{fontSize:"0.68rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:"0.15rem"}}>{lastMemo.text}</div>}
                      </div>
                      <span style={{fontSize:"0.8rem",color:C.textSub,flexShrink:0}}>›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* Search results: flat list */}
        {compSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {(searchedComps||[]).map(c=>{
              const lastMemo=(c.memos||[]).slice(-1)[0];
              return (
                <div key={c.id} onClick={()=>{setSalesTab("company");saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("timeline");setCompSearch("");}}
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
        {!compSearch&&!compFilter.assignee&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.625rem"}}>
            {Object.entries(COMPANY_STATUS).map(([s,meta])=>{
              const items=compFilteredBase.filter(c=>(c.status||"未接触")===s);
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
                          <div key={c.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n;});return;}saveSalesScroll("company");setActiveCompany(c.id);setActiveDetail("timeline");setCompSearch("");}}
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
                name:normalizeImport(r[0]||""),
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
            <Sheet title="企業をインポート" onClose={()=>{setSheet(null);setImportPreview(null);setImportErr("");setImpMode("csv");setTextInput("");}}>
              {/* Mode toggle: CSV / テキスト */}
              {(()=>{
                const handleTextParse=()=>{
                  const lines=textInput.split(/[\n,、，]+/).map(l=>normalizeImport(l)).filter(Boolean);
                  const mapped=lines.map(name=>({name,status:"未接触",assigneeName:"",notes:"",phone:"",email:"",address:""}));
                  setImportPreview(mapped); setImportErr("");
                };
                return (<>
                  <div style={{display:"flex",background:"#f1f5f9",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem"}}>
                    {[["csv","📁 CSVファイル"],["text","📝 テキスト入力"]].map(([id,lbl])=>(
                      <button key={id} onClick={()=>{setImpMode(id);setImportPreview(null);}} style={{flex:1,padding:"0.5rem",borderRadius:"0.55rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.8rem",background:impMode===id?"white":"transparent",color:impMode===id?C.text:C.textMuted,boxShadow:impMode===id?"0 1px 4px rgba(0,0,0,0.1)":"none"}}>{lbl}</button>
                    ))}
                  </div>
                  {impMode==="text"&&(
                    <div style={{marginBottom:"1rem"}}>
                      <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.35rem"}}>企業名を入力（改行・カンマ区切り）</div>
                      <div style={{fontSize:"0.72rem",color:C.textMuted,marginBottom:"0.5rem"}}>スペースは自動削除されます。ステータスは「未接触」で一括登録されます。</div>
                      <textarea value={textInput} onChange={e=>setTextInput(e.target.value)} placeholder={"株式会社A\n株式会社B\n○○商事"} style={{width:"100%",height:140,borderRadius:"0.75rem",border:`1px solid ${C.border}`,padding:"0.625rem",fontSize:"0.83rem",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                      <button onClick={handleTextParse} disabled={!textInput.trim()} style={{marginTop:"0.5rem",width:"100%",padding:"0.6rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.83rem",cursor:textInput.trim()?"pointer":"default",opacity:textInput.trim()?1:0.5,fontFamily:"inherit"}}>解析する</button>
                    </div>
                  )}
                </>);
              })()}
              {/* Download template (CSV mode only) */}
              {true&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:"#1d4ed8",marginBottom:"0.5rem"}}>📥 CSVテンプレートをダウンロード</div>
                <div style={{fontSize:"0.75rem",color:"#3730a3",marginBottom:"0.625rem"}}>テンプレートに入力してCSV形式で保存後、アップロードしてください</div>
                <button onClick={()=>downloadCSV("企業インポートテンプレート.csv",
                  ["企業名 *","ステータス","担当者名","メモ","電話番号","メールアドレス","住所"],
                  [["株式会社サンプルA","商談中","田中太郎","来週再アポ予定","03-1234-5678","tanaka@sample.co.jp","東京都千代田区〇〇1-2-3"],
                   ["サンプル商事B","電話済","鈴木花子","","06-9876-5432","","大阪府大阪市〇〇2-3-4"],
                   ["","","","","","",""]])}
                  style={{background:"#2563eb",border:"none",borderRadius:"0.625rem",color:"white",fontWeight:700,fontSize:"0.78rem",padding:"0.45rem 0.875rem",cursor:"pointer",fontFamily:"inherit"}}>
                  ⬇️ CSVテンプレートをダウンロード
                </button>
              </div>}
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
      {renderModals()}
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
            <div style={{marginTop:"0.6rem"}}>
              <div style={{fontSize:"0.62rem",fontWeight:700,color:"#5b21b6",marginBottom:"0.3rem"}}>📋 許可別営業状況</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.2rem"}}>
                {PERMIT_TYPES.map(pt=>{
                  const has=(v.permitTypes||[]).includes(pt);
                  const salesStatus=(v.permitSales||{})[pt]||"未営業";
                  const salesColors={"営業済":"#d1fae5","資料送付":"#dbeafe","商談中":"#fef3c7","加入済":"#d1fae5","未営業":"#f3f4f6"};
                  const salesTextColors={"営業済":"#065f46","資料送付":"#1d4ed8","商談中":"#92400e","加入済":"#065f46","未営業":"#9ca3af"};
                  return (
                    <div key={pt} style={{background:has?salesColors[salesStatus]:"#fef2f2",border:`1px solid ${has?salesTextColors[salesStatus]+"40":"#fca5a5"}`,borderRadius:"0.4rem",padding:"0.3rem 0.4rem"}}>
                      <div style={{fontSize:"0.6rem",fontWeight:700,color:has?"#374151":"#dc2626"}}>{has?"✓":"-"} {pt}</div>
                      {has&&(
                        <select value={salesStatus} onClick={e=>e.stopPropagation()} onChange={e=>{
                          const nd={...data,vendors:vendors.map(x=>x.id===v.id?{...x,permitSales:{...(x.permitSales||{}),[pt]:e.target.value}}:x)};
                          save(nd);
                        }} style={{fontSize:"0.58rem",border:"none",background:"transparent",color:salesTextColors[salesStatus],fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0,width:"100%",marginTop:"0.1rem"}}>
                          {["未営業","営業済","資料送付","商談中","加入済"].map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      )}
                      {!has&&<div style={{fontSize:"0.58rem",color:"#dc2626",marginTop:"0.1rem"}}>未保有</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
          {/* アクションボタン行 */}
          <div style={{marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.4rem",flexWrap:"wrap"}}>
            <button onClick={()=>{const nd={...data,vendors:vendors.map(x=>x.id===v.id?{...x,needFollow:!v.needFollow}:x)};save(nd);}}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:v.needFollow?"#fef9c3":"#f3f4f6",color:v.needFollow?"#854d0e":"#6b7280"}}>
              {v.needFollow?"⭐ フォロー中":"☆ フォロー"}
            </button>
            <button onClick={()=>openApproachModal("vendors",v.id,v.name)}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#dbeafe",color:"#1d4ed8"}}>
              📞 アプローチ記録
            </button>
            <button onClick={()=>openNextActionModal("vendors",v.id,v.name,v)}
              style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#d1fae5",color:"#065f46"}}>
              📅 {v.nextActionDate?"次回変更":"次回設定"}
            </button>
          </div>
          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ステータス変更</div>
            <StatusPicker map={VENDOR_STATUS} value={v.status} onChange={s=>{
              if(CLOSED_STATUSES.has(s)){
                openLossModal("vendors",v.id,v.name,s);
              } else {
                let nd={...data,vendors:vendors.map(x=>x.id===v.id?{...x,status:s}:x)};
                nd=addChangeLog(nd,{entityType:"業者",entityId:v.id,entityName:v.name,field:"ステータス",oldVal:v.status,newVal:s});
                save(nd);
              }
            }}/>
            {CLOSED_STATUSES.has(v.status)&&v.lossReason&&(
              <div style={{marginTop:"0.4rem",padding:"0.4rem 0.6rem",background:"#fee2e2",borderRadius:"0.5rem",fontSize:"0.75rem",color:"#dc2626"}}>
                📋 {v.lossReason}{v.lossNote&&`：${v.lossNote}`}
              </div>
            )}
          </div>
          {/* 削除ボタン */}
          <div style={{marginBottom:"0.75rem",display:"flex",justifyContent:"flex-end"}}>
            <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm(`${v.name}を削除しますか？`))deleteVendor(v.id);}}>🗑 削除</Btn>
          </div>
          {/* Sub-tabs: 履歴・チャット・タスク・ファイル */}
          <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"1rem",border:`1px solid ${C.border}`}}>
            {[["timeline","📋","履歴"],["chat","💬","チャット"],["tasks","✅","タスク"],["bizcard","🪪","名刺"],["files","📎","ファイル"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&vendChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{vendChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===v.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>
          {activeDetail==="timeline"&&<ApproachTimeline entity={v} entityKey="vendors" entityId={v.id} users={users} onAddApproach={()=>openApproachModal("vendors",v.id,v.name)} onSave={nd=>save(nd)} data={data}/>}
          {activeDetail==="chat"&&ChatSection({chat:v.chat,entityKey:"vendors",entityId:v.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="業者" entityId={v.id} entityName={v.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/>}
          {activeDetail==="bizcard"&&(()=>{
            const linked=(data.businessCards||[]).filter(c=>String(c.salesRef?.id)===String(v.id)&&c.salesRef?.type==="業者");
            return <LinkedBizcardList cards={linked} users={users} onUnlink={id=>{const nd={...data,businessCards:(data.businessCards||[]).map(c=>c.id===id?{...c,salesRef:null}:c)};save(nd);}} onNavigateToBizcard={()=>{setActiveVendor(null);setSalesTab("bizcard");}}/>;
          })()}
          {activeDetail==="files"&&<FileSection files={v.files||[]} currentUserId={currentUser?.id}
            entityType="vendors" entityId={v.id}
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
              <FieldLbl label="許可種別（複数選択可）">
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",padding:"0.5rem",background:"#f8fafc",borderRadius:"0.75rem",border:"1px solid #e2e8f0"}}>
                  {PERMIT_TYPES.map(p=>{
                    const checked=(form.permitTypes||[]).includes(p);
                    return (
                      <label key={p} style={{display:"flex",alignItems:"center",gap:"0.3rem",cursor:"pointer",padding:"0.25rem 0.5rem",borderRadius:"0.5rem",background:checked?"#ede9fe":"white",border:`1px solid ${checked?"#7c3aed":"#e2e8f0"}`,transition:"all 0.15s"}}>
                        <input type="checkbox" checked={checked} onChange={()=>{const cur=form.permitTypes||[];setForm({...form,permitTypes:checked?cur.filter(x=>x!==p):[...cur,p]});}} style={{accentColor:"#7c3aed",width:14,height:14}}/>
                        <span style={{fontSize:"0.75rem",fontWeight:checked?700:400,color:checked?"#5b21b6":"#374151"}}>{p}</span>
                      </label>
                    );
                  })}
                </div>
              </FieldLbl>
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
    // フィルタ適用
    const filteredVendors = vendors.filter(v=>{
      if(vendFilterPref){
        const vmuniPrefs=(v.municipalityIds||[]).map(id=>muniOf(id)).filter(Boolean).map(m=>String(m.prefectureId));
        if(!vmuniPrefs.includes(vendFilterPref)) return false;
      }
      if(vendFilterMuni && !(v.municipalityIds||[]).map(String).includes(vendFilterMuni)) return false;
      if(vendFilterStatus && (v.status||"未接触")!==vendFilterStatus) return false;
      if(vendFilterPermit && !(v.permitTypes||[]).includes(vendFilterPermit)) return false;
      if(vendFilterAssignee==="__me__" && !(v.assigneeIds||[]).some(id=>id===currentUser?.id)) return false;
      if(vendFilterAssignee && vendFilterAssignee!=="__me__" && !(v.assigneeIds||[]).some(id=>String(id)===vendFilterAssignee)) return false;
      return true;
    });
    const searchedVendors = vendSearch ? filteredVendors.filter(v=>normVSearch(v.name).includes(normVSearch(vendSearch))) : null;
    const vendVisibleIds=(searchedVendors||filteredVendors).map(v=>v.id);
    return (
      <div>
        <TopTabs/>
        <BulkBar statusMap={VENDOR_STATUS} applyFn={applyBulkVend} visibleIds={vendVisibleIds} onDelete={deleteBulkVend}/>
        {/* フォロー中業者 */}
        {(()=>{
          const followVends = vendors.filter(v=>v.needFollow);
          if(!followVends.length) return null;
          return (
            <div style={{background:"#fefce8",border:"1.5px solid #fde047",borderRadius:"0.875rem",padding:"0.75rem 1rem",marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.75rem",fontWeight:800,color:"#854d0e",marginBottom:"0.4rem"}}>⭐ フォロー中 ({followVends.length}件)</div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {followVends.map(v=>{
                  const vmunis2=vendorMunis(v);
                  return (
                    <div key={v.id} onClick={()=>{saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("timeline");}}
                      style={{display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer",padding:"0.35rem 0.5rem",background:"white",borderRadius:"0.5rem",border:"1px solid #fde047"}}>
                      <span style={{fontSize:"0.8rem",fontWeight:700,color:C.text,flex:1}}>{v.name}</span>
                      <SChip s={v.status} map={VENDOR_STATUS}/>
                      {vmunis2.length>0&&<span style={{fontSize:"0.62rem",color:C.textMuted}}>{vmunis2[0].name}{vmunis2.length>1?`他${vmunis2.length-1}`:""}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* 絞り込みフィルタ */}
        {(()=>{
          const hasFilter=vendFilterPref||vendFilterMuni||vendFilterStatus||vendFilterPermit||vendFilterAssignee;
          // 絞り込み結果の集計
          const fvCount=filteredVendors.length;
          // 都道府県ごとの件数
          const prefCounts=hasFilter?prefs.map(p=>{
            const n=filteredVendors.filter(v=>(v.municipalityIds||[]).some(id=>{const m=muniOf(id);return m&&String(m.prefectureId)===String(p.id);})).length;
            return n>0?{name:p.name,n}:null;
          }).filter(Boolean):[];
          // 自治体選択肢（都道府県が選択されている場合に絞る）
          const muniOptions=vendFilterPref?munis.filter(m=>String(m.prefectureId)===vendFilterPref):[];
          const clearAll=()=>{setVendFilterPref("");setVendFilterMuni("");setVendFilterStatus("");setVendFilterPermit("");setVendFilterAssignee("");};
          return (
            <div style={{background:"#f8fafc",border:`1px solid ${hasFilter?"#7c3aed":C.border}`,borderRadius:"0.875rem",padding:"0.625rem 0.75rem",marginBottom:"0.75rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
                <span style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub}}>🔍 絞り込み</span>
                {hasFilter&&<button onClick={clearAll} style={{fontSize:"0.65rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:999,padding:"0.1rem 0.45rem",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>全解除</button>}
                {hasFilter&&<span style={{fontSize:"0.72rem",fontWeight:800,color:"#7c3aed",marginLeft:"auto"}}>{fvCount}件</span>}
              </div>
              <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap",marginBottom:"0.4rem"}}>
                <select value={vendFilterPref} onChange={e=>{setVendFilterPref(e.target.value);setVendFilterMuni("");}}
                  style={{padding:"0.3rem 0.4rem",borderRadius:"0.5rem",border:`1.5px solid ${vendFilterPref?C.accent:C.border}`,fontSize:"0.72rem",background:vendFilterPref?"#eff6ff":"white",color:vendFilterPref?C.accent:C.text,fontFamily:"inherit"}}>
                  <option value="">🗾 都道府県</option>
                  {prefs.map(p=><option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
                {vendFilterPref&&muniOptions.length>0&&(
                  <select value={vendFilterMuni} onChange={e=>setVendFilterMuni(e.target.value)}
                    style={{padding:"0.3rem 0.4rem",borderRadius:"0.5rem",border:`1.5px solid ${vendFilterMuni?C.accent:C.border}`,fontSize:"0.72rem",background:vendFilterMuni?"#eff6ff":"white",color:vendFilterMuni?C.accent:C.text,fontFamily:"inherit"}}>
                    <option value="">🏛 自治体</option>
                    {muniOptions.map(m=><option key={m.id} value={String(m.id)}>{m.name}</option>)}
                  </select>
                )}
                <select value={vendFilterStatus} onChange={e=>setVendFilterStatus(e.target.value)}
                  style={{padding:"0.3rem 0.4rem",borderRadius:"0.5rem",border:`1.5px solid ${vendFilterStatus?C.accent:C.border}`,fontSize:"0.72rem",background:vendFilterStatus?"#eff6ff":"white",color:vendFilterStatus?C.accent:C.text,fontFamily:"inherit"}}>
                  <option value="">📌 ステータス</option>
                  {Object.keys(VENDOR_STATUS).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={vendFilterPermit} onChange={e=>setVendFilterPermit(e.target.value)}
                  style={{padding:"0.3rem 0.4rem",borderRadius:"0.5rem",border:`1.5px solid ${vendFilterPermit?C.accent:C.border}`,fontSize:"0.72rem",background:vendFilterPermit?"#eff6ff":"white",color:vendFilterPermit?C.accent:C.text,fontFamily:"inherit"}}>
                  <option value="">📋 許可種別</option>
                  {PERMIT_TYPES.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <select value={vendFilterAssignee} onChange={e=>setVendFilterAssignee(e.target.value)}
                  style={{padding:"0.3rem 0.4rem",borderRadius:"0.5rem",border:`1.5px solid ${vendFilterAssignee?C.accent:C.border}`,fontSize:"0.72rem",background:vendFilterAssignee?"#eff6ff":"white",color:vendFilterAssignee?C.accent:C.text,fontFamily:"inherit"}}>
                  <option value="">👤 担当者</option>
                  <option value="__me__">自分</option>
                  {users.map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
                </select>
              </div>
              {hasFilter&&prefCounts.length>0&&(
                <div style={{display:"flex",gap:"0.25rem",flexWrap:"wrap"}}>
                  {prefCounts.map(({name,n})=>(
                    <span key={name} style={{fontSize:"0.62rem",background:"#ede9fe",color:"#5b21b6",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700}}>{name}: {n}社</span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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
          <button onClick={()=>{setDeleteModal({type:"vendor"});setDmSearch("");setDmFilter("");setDmSelected(new Set());}}
            style={{padding:"0.45rem 0.75rem",borderRadius:"0.75rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>🗑 削除</button>
          <Btn size="sm" onClick={()=>{setForm({status:"未接触",municipalityIds:[],assigneeIds:[]});setSheet("addVendor");}}>＋</Btn>
        </div>
        {vendors.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 1rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
            <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>🔧</div>
            <div style={{fontSize:"0.85rem",fontWeight:600,marginBottom:"0.25rem"}}>業者が登録されていません</div>
            <div style={{fontSize:"0.78rem"}}>「＋」から追加してください</div>
          </div>
        )}
        {/* 担当者フィルタ結果フラットリスト */}
        {!vendSearch&&vendFilterAssignee&&(()=>{
          if(!filteredVendors.length) return (
            <div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`,fontSize:"0.82rem"}}>該当する業者がありません</div>
          );
          return (
            <div style={{marginBottom:"0.75rem"}}>
              <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,marginBottom:"0.4rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                担当案件 {filteredVendors.length}件
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {filteredVendors.map(v=>{
                  const vmunis2=vendorMunis(v);
                  const lastMemo=(v.memos||[]).slice(-1)[0];
                  return (
                    <div key={v.id} onClick={()=>{saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("timeline");}}
                      style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.625rem 0.75rem",background:"white",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,cursor:"pointer",boxShadow:C.shadow}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.35rem",marginBottom:"0.2rem"}}>
                          <span style={{fontSize:"0.85rem",fontWeight:700,color:C.text,flex:1}}>{v.name}</span>
                          <SChip s={v.status} map={VENDOR_STATUS}/>
                          {v.needFollow&&<span style={{fontSize:"0.58rem",background:"#fef9c3",color:"#854d0e",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:700,flexShrink:0}}>⭐</span>}
                        </div>
                        <div style={{display:"flex",gap:"0.2rem",flexWrap:"wrap"}}>
                          {(v.permitTypes||[]).map(p=><span key={p} style={{fontSize:"0.6rem",background:"#ede9fe",color:"#5b21b6",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:600}}>{p}</span>)}
                          {vmunis2.length>0&&<span style={{fontSize:"0.6rem",color:C.textMuted,background:C.bg,padding:"0.05rem 0.3rem",borderRadius:999}}>{vmunis2[0].name}{vmunis2.length>1?` 他${vmunis2.length-1}`:""}</span>}
                        </div>
                        {lastMemo&&<div style={{fontSize:"0.68rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:"0.15rem"}}>{lastMemo.text}</div>}
                      </div>
                      <span style={{fontSize:"0.8rem",color:C.textSub,flexShrink:0}}>›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {/* Search results: flat */}
        {vendSearch&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {(searchedVendors||[]).map(v=>{
              const vmunis2=vendorMunis(v);
              const lastMemo=(v.memos||[]).slice(-1)[0];
              return (
                <div key={v.id} onClick={()=>{saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("timeline");}}
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
        {!vendSearch&&!vendFilterAssignee&&(
          <div style={{display:"flex",flexDirection:"column",gap:"0.625rem"}}>
            {Object.entries(VENDOR_STATUS).map(([s,meta])=>{
              const items=filteredVendors.filter(v=>v.status===s);
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
                          <div key={v.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(v.id)?n.delete(v.id):n.add(v.id);return n;});return;}saveSalesScroll("vendor");setActiveVendor(v.id);setActiveDetail("timeline");}}
                            style={{padding:"0.75rem 1rem",cursor:"pointer",borderTop:i>0?`1px solid ${C.borderLight}`:"none",background:bulkSelected.has(v.id)?"#eff6ff":"white",display:"flex",alignItems:"flex-start",gap:"0.5rem",transition:"background 0.1s"}}
                            onMouseEnter={e=>{if(!bulkSelected.has(v.id))e.currentTarget.style.background=C.bg;}}
                            onMouseLeave={e=>{if(!bulkSelected.has(v.id))e.currentTarget.style.background="white";}}>
                            {bulkMode&&<input type="checkbox" checked={bulkSelected.has(v.id)} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0,marginTop:2}}/>}
                            <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.2rem"}}>
                              <span style={{fontWeight:700,fontSize:"0.9rem",color:C.text,flex:1}}>{v.name}</span>
                              <AssigneeRow ids={v.assigneeIds}/>
                            </div>
                            {(v.permitTypes||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"0.2rem",marginBottom:"0.2rem"}}>{(v.permitTypes||[]).map(p=><span key={p} style={{fontSize:"0.6rem",background:"#ede9fe",color:"#5b21b6",padding:"0.1rem 0.3rem",borderRadius:999,fontWeight:600}}>{p}</span>)}</div>}
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
            <FieldLbl label="許可種別（複数選択可）">
                <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem",padding:"0.5rem",background:"#f8fafc",borderRadius:"0.75rem",border:"1px solid #e2e8f0"}}>
                  {PERMIT_TYPES.map(p=>{
                    const checked=(form.permitTypes||[]).includes(p);
                    return (
                      <label key={p} style={{display:"flex",alignItems:"center",gap:"0.3rem",cursor:"pointer",padding:"0.25rem 0.5rem",borderRadius:"0.5rem",background:checked?"#ede9fe":"white",border:`1px solid ${checked?"#7c3aed":"#e2e8f0"}`,transition:"all 0.15s"}}>
                        <input type="checkbox" checked={checked} onChange={()=>{const cur=form.permitTypes||[];setForm({...form,permitTypes:checked?cur.filter(x=>x!==p):[...cur,p]});}} style={{accentColor:"#7c3aed",width:14,height:14}}/>
                        <span style={{fontSize:"0.75rem",fontWeight:checked?700:400,color:checked?"#5b21b6":"#374151"}}>{p}</span>
                      </label>
                    );
                  })}
                </div>
            </FieldLbl>
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
                name:normalizeImport(r[0]||""),
                status:Object.keys(VENDOR_STATUS).includes(r[1]?.trim())?r[1].trim():"未接触",
                prefName:normalizeImport(r[2]||""),
                muniNames:(r[3]?.trim()||"").split(/[,，]/).map(s=>normalizeImport(s)).filter(Boolean),
                assigneeName:(r[4]||"").trim(),
                phone:normalizeImport(r[5]||""),
                notes:(r[6]||"").trim(),
                address:normalizeImport(r[7]||""),
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
                id:"v_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),
                name:r.name, status:r.status||"未接触",
                phone:r.phone||"",
                municipalityIds:mids, assigneeIds:[],
                address:r.address||"",
                memos:r.notes?[{id:"mn_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),text:r.notes,userId:currentUser?.id,date:new Date().toISOString()}]:[],
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
      {renderModals()}
    </div>
    );
  }

  // ── 自治体タブ ────────────────────────────────────────────────────────────
  if(salesTab==="muni"&&activeMuni&&muniScreen==="muniDetail"){
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
          {(muni.contactName||muni.contactEmail||muni.contactPhone)&&(
            <div style={{marginTop:"0.5rem",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:"0.5rem",padding:"0.4rem 0.625rem",fontSize:"0.72rem",color:"#0369a1"}}>
              <span style={{fontWeight:700}}>👤 {muni.contactName||"担当者"}</span>
              {muni.contactPhone&&<a href={`tel:${muni.contactPhone}`} style={{marginLeft:"0.5rem",color:"#0369a1"}}>📞 {muni.contactPhone}</a>}
              {muni.contactEmail&&<a href={`mailto:${muni.contactEmail}`} style={{marginLeft:"0.5rem",color:"#0369a1"}}>✉️ {muni.contactEmail}</a>}
            </div>
          )}
          {/* フォローフラグ */}
          <div style={{marginTop:"0.5rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
            <button onClick={()=>{const nd={...data,municipalities:munis.map(m=>String(m.id)===String(activeMuni)?{...m,needFollow:!muni.needFollow}:m)};save(nd);}}
              style={{padding:"0.2rem 0.625rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",background:muni.needFollow?"#fef9c3":"#f3f4f6",color:muni.needFollow?"#854d0e":"#6b7280"}}>
              {muni.needFollow?"⭐ フォロー中":"☆ フォロー"}
            </button>
          </div>
          {(muni.assigneeIds||[]).length>0&&<div style={{marginTop:"0.5rem"}}><AssigneeRow ids={muni.assigneeIds}/></div>}
          {/* 許可種別ごと業者数 */}
          <div style={{marginTop:"0.75rem",background:"#fafafa",border:"1px solid #e5e7eb",borderRadius:"0.625rem",padding:"0.625rem 0.75rem"}}>
            <div style={{fontSize:"0.65rem",fontWeight:700,color:C.textSub,marginBottom:"0.5rem"}}>📋 許可種別ごとの業者数</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.3rem"}}>
              {PERMIT_TYPES.map(pt=>{
                const total=mvend.filter(v=>(v.permitTypes||[]).includes(pt)).length;
                const joined=mvend.filter(v=>(v.permitTypes||[]).includes(pt)&&v.status==="加入済").length;
                const isEmpty=total===0;
                return (
                  <div key={pt} style={{background:isEmpty?"#fef2f2":joined>0?"#f0fdf4":"#fafafa",border:`1px solid ${isEmpty?"#fca5a5":joined>0?"#86efac":"#e5e7eb"}`,borderRadius:"0.5rem",padding:"0.35rem 0.5rem"}}>
                    <div style={{fontSize:"0.62rem",fontWeight:700,color:isEmpty?"#dc2626":joined>0?"#065f46":"#374151",marginBottom:"0.1rem"}}>{pt}</div>
                    <div style={{display:"flex",gap:"0.35rem",alignItems:"center"}}>
                      <span style={{fontSize:"0.75rem",fontWeight:800,color:isEmpty?"#dc2626":"#374151"}}>{total}社</span>
                      {total>0&&<span style={{fontSize:"0.6rem",color:"#059669",fontWeight:600}}>加入{joined}</span>}
                      {isEmpty&&<span style={{fontSize:"0.58rem",color:"#dc2626",fontWeight:700}}>⚠️不足</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* 許可業者調査チェック */}
          <div style={{marginTop:"0.75rem",display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.5rem 0.75rem",background:muni.surveyDone?"#d1fae5":"#f8fafc",borderRadius:"0.75rem",border:`1.5px solid ${muni.surveyDone?"#6ee7b7":"#e2e8f0"}`}}>
            <input type="checkbox" checked={!!muni.surveyDone} onChange={e=>{
              const nd={...data,municipalities:munis.map(m=>String(m.id)===String(activeMuni)?{...m,surveyDone:e.target.checked,surveyDoneAt:e.target.checked?new Date().toISOString():null}:m)};
              save(nd);
            }} style={{width:18,height:18,accentColor:"#059669",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:"0.82rem",fontWeight:700,color:muni.surveyDone?"#065f46":C.text}}>許可業者調査</div>
              <div style={{fontSize:"0.65rem",color:C.textMuted}}>{muni.surveyDone?`完了 ${muni.surveyDoneAt?"（"+new Date(muni.surveyDoneAt).toLocaleDateString("ja-JP")+"）":""}`:"未完了 — 調査が完了したらチェックしてください"}</div>
            </div>
            <span style={{fontSize:"1.2rem"}}>{muni.surveyDone?"✅":"🔲"}</span>
          </div>

        </Card>
        {/* Quick change dustalk + treaty */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1rem"}}>
          <div>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>ダストーク展開</div>
            <DustalkPicker value={muni.dustalk||"未展開"} onChange={s=>{
              let nd={...data,municipalities:munis.map(m=>String(m.id)===String(activeMuni)?{...m,dustalk:s,updatedAt:new Date().toISOString()}:m)};
              nd=addChangeLog(nd,{entityType:"自治体",entityId:muni.id,entityName:muni.name,field:"ダストーク",oldVal:muni.dustalk,newVal:s});
              save(nd);
            }}/>

          </div>
          <div>
            <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub,marginBottom:"0.4rem"}}>連携協定</div>
            <TreatyPicker value={muni.treatyStatus||"未接触"} onChange={s=>{
              let nd={...data,municipalities:munis.map(m=>String(m.id)===String(activeMuni)?{...m,treatyStatus:s}:m)};
              nd=addChangeLog(nd,{entityType:"自治体",entityId:muni.id,entityName:muni.name,field:"連携協定",oldVal:muni.treatyStatus,newVal:s});
              save(nd);
            }}/>
          </div>
        </div>
        {/* アクションボタン行 */}
        <div style={{marginBottom:"0.75rem",display:"flex",alignItems:"center",gap:"0.4rem",flexWrap:"wrap"}}>
          <button onClick={()=>openApproachModal("municipalities",muni.id,muni.name)}
            style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#dbeafe",color:"#1d4ed8"}}>
            📞 アプローチ記録
          </button>
          <button onClick={()=>openNextActionModal("municipalities",muni.id,muni.name,muni)}
            style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:"#d1fae5",color:"#065f46"}}>
            📅 {muni.nextActionDate?"次回変更":"次回設定"}
          </button>
          {muni.nextActionDate&&(
            <span style={{fontSize:"0.72rem",color:"#0369a1",fontWeight:700}}>→ {muni.nextActionDate} {muni.nextActionType}</span>
          )}
        </div>
        {/* Sub-tabs: 履歴・チャット・タスク・ファイル */}
        <div style={{display:"flex",background:"white",borderRadius:"0.75rem",padding:"0.2rem",marginBottom:"0.75rem",border:`1px solid ${C.border}`}}>
          {[["timeline","📋","履歴"],["chat","💬","チャット"],["tasks","✅","タスク"],["bizcard","🪪","名刺"],["files","📎","ファイル"]].map(([id,icon,lbl])=>(
            <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.72rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
              {icon} {lbl}
              {id==="chat"&&muniChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{muniChatUnread}</span>}
              {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===muni.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
            </button>
          ))}
        </div>
        {activeDetail==="timeline"&&<div style={{marginBottom:"1rem"}}><ApproachTimeline entity={muni} entityKey="municipalities" entityId={muni.id} users={users} onAddApproach={()=>openApproachModal("municipalities",muni.id,muni.name)} onSave={nd=>save(nd)} data={data}/></div>}
        {activeDetail==="chat"&&<div style={{marginBottom:"1rem"}}>{ChatSection({chat:muni.chat,entityKey:"municipalities",entityId:muni.id})}</div>}
        {activeDetail==="tasks"&&<div style={{marginBottom:"1rem"}}><SalesTaskPanel entityType="自治体" entityId={muni.id} entityName={muni.name} data={data} onSave={save} currentUser={currentUser} users={users} onNavigateToTask={onNavigateToTask} onNavigateToProject={onNavigateToProject}/></div>}
        {activeDetail==="bizcard"&&<div style={{marginBottom:"1rem"}}>{(()=>{
          const linked=(data.businessCards||[]).filter(c=>String(c.salesRef?.id)===String(muni.id)&&c.salesRef?.type==="自治体");
          return <LinkedBizcardList cards={linked} users={users} onUnlink={id=>{const nd={...data,businessCards:(data.businessCards||[]).map(c=>c.id===id?{...c,salesRef:null}:c)};save(nd);}} onNavigateToBizcard={()=>{setActiveMuni(null);setMuniScreen("top");setSalesTab("bizcard");}}/>;
        })()}</div>}

        {activeDetail==="files"&&<div style={{marginBottom:"1rem"}}><FileSection files={muni.files||[]} currentUserId={currentUser?.id}
          entityType="municipalities" entityId={muni.id}
          onAdd={f=>addFileToEntity("municipalities",muni.id,f)}
          onDelete={fid=>removeFileFromEntity("municipalities",muni.id,fid)}/></div>}
        {/* 業者一覧（常時表示） */}
        <div style={{marginBottom:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
            <span style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em"}}>業者一覧</span>
            <div style={{display:"flex",gap:"0.35rem"}}>
              <Btn size="sm" variant="secondary" onClick={()=>{setLinkVendorSearch("");setLinkVendorFilterPref("");setLinkVendorFilterMuni("");setLinkVendorFilterPermit("");setSheet("linkVendor");}}>🔗 紐付け</Btn>
              <Btn size="sm" onClick={()=>{setForm({municipalityIds:[activeMuni],status:"未接触",assigneeIds:[]});setSalesTab("vendor");setActiveVendor(null);setSheet("addVendorFromMuni");}}>＋ 新規</Btn>
            </div>
          </div>
          {mvend.length===0&&<div style={{textAlign:"center",padding:"1rem",color:C.textMuted,background:C.bg,borderRadius:"0.875rem",fontSize:"0.82rem"}}>業者が登録されていません</div>}
          <div style={{display:"flex",flexDirection:"column",gap:"0.35rem"}}>
            {mvend.map(v=>(
              <div key={v.id} onClick={()=>{setPrevTab({tab:"muni",muniId:activeMuni,prefId:activePref});setSalesTab("vendor");setActiveVendor(v.id);setActiveDetail("timeline");}}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.625rem 0.875rem",background:"white",border:`1.5px solid ${C.border}`,borderRadius:"0.75rem",cursor:"pointer",gap:"0.5rem"}}>
                <span style={{fontWeight:600,fontSize:"0.88rem",color:C.text,flex:1}}>{v.name}</span>
                <SChip s={v.status} map={VENDOR_STATUS}/>
              </div>
            ))}
          </div>
        </div>
        <div style={{marginTop:"1rem"}}>
          <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm(`${muni.name}を削除しますか？`))deleteMuni(muni.id);}}>🗑 自治体を削除</Btn>
        </div>
        {sheet==="editMuni"&&(
          <Sheet title="自治体を編集" onClose={()=>setSheet(null)}>
            <FieldLbl label="自治体名 *"><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} autoFocus/></FieldLbl>
            <FieldLbl label="ステータス"><StatusPicker map={MUNI_STATUS} value={form.status||"未接触"} onChange={s=>setForm({...form,status:s})}/></FieldLbl>
            <FieldLbl label="担当者">{AssigneePicker({ids:form.assigneeIds||[],onChange:ids=>setForm({...form,assigneeIds:ids})})}</FieldLbl>
            <FieldLbl label="展開ステータス（ダストーク）"><DustalkPicker value={form.dustalk||"未展開"} onChange={s=>setForm({...form,dustalk:s})}/></FieldLbl>

            <FieldLbl label="アート引越センター 管轄支店"><Input value={form.artBranch||""} onChange={e=>setForm({...form,artBranch:e.target.value})} placeholder="例：福岡支店"/></FieldLbl>
            <FieldLbl label="連携協定ステータス"><TreatyPicker value={form.treatyStatus||"未接触"} onChange={s=>setForm({...form,treatyStatus:s})}/></FieldLbl>
            <FieldLbl label="住所（任意）"><Input value={form.address||""} onChange={e=>setForm({...form,address:e.target.value})} placeholder="東京都千代田区〇〇1-2-3"/></FieldLbl>
            <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:"0.625rem",padding:"0.625rem 0.75rem",marginBottom:"0.5rem"}}>
              <div style={{fontSize:"0.75rem",fontWeight:700,color:"#0369a1",marginBottom:"0.4rem"}}>👤 行政担当者</div>
              <FieldLbl label="担当者名"><Input value={form.contactName||""} onChange={e=>setForm({...form,contactName:e.target.value})} placeholder="例：田中 太郎"/></FieldLbl>
              <FieldLbl label="メールアドレス"><Input value={form.contactEmail||""} onChange={e=>setForm({...form,contactEmail:e.target.value})} placeholder="tanaka@city.example.lg.jp"/></FieldLbl>
              <FieldLbl label="電話番号"><Input value={form.contactPhone||""} onChange={e=>setForm({...form,contactPhone:e.target.value})} placeholder="099-123-4567"/></FieldLbl>
            </div>
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
          const muniPrefId=String(muniOf(activeMuni)?.prefectureId||"");
          // 優先順: ①この自治体の業者 ②自治体未設定 ③同じ都道府県の業者 ④それ以外
          const linkable=vendors.filter(v=>{
            if(already.includes(v.id)) return false;
            if(linkVendorSearch && !(v.name||"").includes(linkVendorSearch)) return false;
            return true;
          }).sort((a,b)=>{
            const aHas=(a.municipalityIds||[]).some(id=>String(id)===String(activeMuni));
            const bHas=(b.municipalityIds||[]).some(id=>String(id)===String(activeMuni));
            const aNoMuni=!(a.municipalityIds||[]).length;
            const bNoMuni=!(b.municipalityIds||[]).length;
            const aSamePref=(a.municipalityIds||[]).some(id=>{const m=muniOf(id);return m&&String(m.prefectureId)===muniPrefId;});
            const bSamePref=(b.municipalityIds||[]).some(id=>{const m=muniOf(id);return m&&String(m.prefectureId)===muniPrefId;});
            const aScore=aHas?4:aNoMuni?3:aSamePref?2:1;
            const bScore=bHas?4:bNoMuni?3:bSamePref?2:1;
            return bScore-aScore;
          });
          const groupLabel=(v)=>{
            if((v.municipalityIds||[]).some(id=>String(id)===String(activeMuni))) return {label:"この自治体の業者",color:"#d1fae5",tc:"#065f46"};
            if(!(v.municipalityIds||[]).length) return {label:"自治体未設定",color:"#dbeafe",tc:"#1d4ed8"};
            if((v.municipalityIds||[]).some(id=>{const m=muniOf(id);return m&&String(m.prefectureId)===muniPrefId;})) return {label:"同都道府県",color:"#ede9fe",tc:"#5b21b6"};
            return null;
          };
          const doLink=(vid)=>{
            save({...data,vendors:vendors.map(v=>v.id===vid?{...v,municipalityIds:[...(v.municipalityIds||[]),activeMuni]}:v)});
            setSheet(null);
          };
          // フィルタ適用
          const lvFiltered = linkable.filter(v=>{
            if(linkVendorFilterPref){
              const vPrefs=(v.municipalityIds||[]).map(id=>muniOf(id)).filter(Boolean).map(m=>String(m.prefectureId));
              if(!vPrefs.includes(linkVendorFilterPref)) return false;
            }
            if(linkVendorFilterMuni && !(v.municipalityIds||[]).map(String).includes(linkVendorFilterMuni)) return false;
            if(linkVendorFilterPermit && !(v.permitTypes||[]).includes(linkVendorFilterPermit)) return false;
            return true;
          });
          const lvMuniOpts = linkVendorFilterPref ? munis.filter(m=>String(m.prefectureId)===linkVendorFilterPref) : [];
          const hasLvFilter = linkVendorFilterPref||linkVendorFilterMuni||linkVendorFilterPermit;
          return (
            <Sheet title="既存業者を紐付け" onClose={()=>setSheet(null)}>
              <Input value={linkVendorSearch} onChange={e=>setLinkVendorSearch(e.target.value)} placeholder="業者名で検索" style={{marginBottom:"0.5rem"}}/>
              {/* フィルタ行 */}
              <div style={{background:"#f8fafc",border:`1px solid ${hasLvFilter?C.accent:C.border}`,borderRadius:"0.625rem",padding:"0.5rem 0.625rem",marginBottom:"0.625rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.35rem",marginBottom:"0.35rem"}}>
                  <span style={{fontSize:"0.68rem",fontWeight:700,color:C.textSub}}>🔍 絞り込み</span>
                  {hasLvFilter&&<span style={{fontSize:"0.7rem",fontWeight:800,color:"#7c3aed",marginLeft:"auto"}}>{lvFiltered.length}件</span>}
                  {hasLvFilter&&<button onClick={()=>{setLinkVendorFilterPref("");setLinkVendorFilterMuni("");setLinkVendorFilterPermit("");}}
                    style={{fontSize:"0.62rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:999,padding:"0.1rem 0.4rem",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>全解除</button>}
                </div>
                <div style={{display:"flex",gap:"0.3rem",flexWrap:"wrap"}}>
                  <select value={linkVendorFilterPref} onChange={e=>{setLinkVendorFilterPref(e.target.value);setLinkVendorFilterMuni("");}}
                    style={{padding:"0.25rem 0.35rem",borderRadius:"0.4rem",border:`1.5px solid ${linkVendorFilterPref?C.accent:C.border}`,fontSize:"0.7rem",background:linkVendorFilterPref?"#eff6ff":"white",color:linkVendorFilterPref?C.accent:C.text,fontFamily:"inherit"}}>
                    <option value="">🗾 都道府県</option>
                    {prefs.map(p=><option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </select>
                  {linkVendorFilterPref&&lvMuniOpts.length>0&&(
                    <select value={linkVendorFilterMuni} onChange={e=>setLinkVendorFilterMuni(e.target.value)}
                      style={{padding:"0.25rem 0.35rem",borderRadius:"0.4rem",border:`1.5px solid ${linkVendorFilterMuni?C.accent:C.border}`,fontSize:"0.7rem",background:linkVendorFilterMuni?"#eff6ff":"white",color:linkVendorFilterMuni?C.accent:C.text,fontFamily:"inherit"}}>
                      <option value="">🏛 自治体</option>
                      {lvMuniOpts.map(m=><option key={m.id} value={String(m.id)}>{m.name}</option>)}
                    </select>
                  )}
                  <select value={linkVendorFilterPermit} onChange={e=>setLinkVendorFilterPermit(e.target.value)}
                    style={{padding:"0.25rem 0.35rem",borderRadius:"0.4rem",border:`1.5px solid ${linkVendorFilterPermit?C.accent:C.border}`,fontSize:"0.7rem",background:linkVendorFilterPermit?"#eff6ff":"white",color:linkVendorFilterPermit?C.accent:C.text,fontFamily:"inherit"}}>
                    <option value="">📋 許可種別</option>
                    {PERMIT_TYPES.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.35rem",maxHeight:300,overflowY:"auto"}}>
                {lvFiltered.length===0&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,fontSize:"0.82rem"}}>紐付け可能な業者がありません</div>}
                {lvFiltered.map(v=>{
                  const gl=groupLabel(v);
                  return (
                    <div key={v.id} style={{display:"flex",alignItems:"center",padding:"0.625rem 0.75rem",border:`1.5px solid ${gl?gl.color:C.border}`,borderRadius:"0.75rem",background:gl?gl.color.replace("1fae5","f0fdf4").replace("beafe","eff6ff").replace("e9fe","f5f3ff"):"white",gap:"0.5rem"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                          <span style={{fontWeight:600,fontSize:"0.88rem",color:C.text}}>{v.name}</span>
                          {gl&&<span style={{fontSize:"0.6rem",padding:"0.1rem 0.35rem",borderRadius:999,background:gl.color,color:gl.tc,fontWeight:700,flexShrink:0}}>{gl.label}</span>}
                        </div>
                        <div style={{fontSize:"0.65rem",color:C.textMuted}}>{(v.municipalityIds||[]).map(id=>muniOf(id)?.name).filter(Boolean).join("・")||"自治体未設定"}</div>
                      </div>
                      <SChip s={v.status} map={VENDOR_STATUS}/>
                      <button onClick={()=>doLink(v.id)}
                        style={{background:C.accent,border:"none",borderRadius:"0.5rem",color:"white",fontSize:"0.75rem",fontWeight:700,padding:"0.3rem 0.625rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>紐付け</button>
                    </div>
                  );
                })}
              </div>
              <div style={{marginTop:"0.75rem"}}>
                <Btn variant="secondary" style={{width:"100%"}} onClick={()=>setSheet(null)}>閉じる</Btn>
              </div>
            </Sheet>
          );
        })()}
      {renderModals()}
    </div>
    );
  }

  // ── 自治体トップビュー（地方→都道府県→自治体 折りたたみ）─────────────────
  // 一括変更ヘルパー
  return (
    <div>
      <TopTabs/>
      {/* ── 自治体タブ（トップビュー） ── */}
      {salesTab==="muni"&&<>
      {/* フォロー中の自治体 */}
      {(()=>{
        const followMunis = munis.filter(m=>m.needFollow);
        if(!followMunis.length) return null;
        return (
          <div style={{background:"#fefce8",border:"1.5px solid #fde047",borderRadius:"0.875rem",padding:"0.75rem 1rem",marginBottom:"0.75rem"}}>
            <div style={{fontSize:"0.75rem",fontWeight:800,color:"#854d0e",marginBottom:"0.4rem"}}>⭐ フォロー中 ({followMunis.length}件)</div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
              {followMunis.map(m=>{
                const pref=prefOf(m.prefectureId);
                const ts=TREATY_STATUS[m.treatyStatus||"未接触"];
                return (
                  <div key={m.id} onClick={()=>{setActivePref(String(m.prefectureId));setActiveMuni(String(m.id));setMuniScreen("muniDetail");setActiveDetail("timeline");}}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer",padding:"0.35rem 0.5rem",background:"white",borderRadius:"0.5rem",border:"1px solid #fde047"}}>
                    <span style={{fontSize:"0.8rem",fontWeight:700,color:C.text,flex:1}}>{m.name}</span>
                    <span style={{fontSize:"0.65rem",color:C.textMuted}}>{pref?.name}</span>
                    {ts&&<span style={{fontSize:"0.62rem",padding:"0.1rem 0.35rem",borderRadius:999,background:ts.bg,color:ts.color,fontWeight:700}}>{m.treatyStatus}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
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
        <button onClick={()=>{setDeleteModal({type:"muni"});setDmSearch("");setDmFilter("");setDmSelected(new Set());}}
          style={{padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>🗑 削除</button>
        <button onClick={()=>setSheet("importMuni")}
          style={{padding:"0.5rem 0.625rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>📥</button>
        <button onClick={()=>setShowGSheetImport(true)}
          style={{padding:"0.5rem 0.625rem",borderRadius:"0.75rem",border:"1.5px solid #bfdbfe",background:"#eff6ff",color:"#2563eb",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>📊 GSheet</button>
        <button onClick={exportMuniStatusReport}
          style={{padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:"1.5px solid #7c3aed",background:"#ede9fe",color:"#5b21b6",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0,whiteSpace:"nowrap"}}>📋 全国出力</button>
      </div>
      {/* 担当者フィルタ */}
      {(()=>{
        const filteredMunis = muniFilterAssignee ? munis.filter(m=>{
          if(muniFilterAssignee==="__me__") return (m.assigneeIds||[]).some(id=>id===currentUser?.id);
          return (m.assigneeIds||[]).some(id=>String(id)===muniFilterAssignee);
        }) : null;
        const fCount = filteredMunis?.length;
        // 地方・都道府県ごとの件数
        const regionCounts = muniFilterAssignee ? JAPAN_REGIONS.map(rg=>{
          const rPrefs2=prefs.filter(p=>p.region===rg.region||(!p.region&&rg.prefs.includes(p.name)));
          const rMuniIds=rPrefs2.flatMap(p=>munis.filter(m=>String(m.prefectureId)===String(p.id)).map(m=>m.id));
          const n=(filteredMunis||[]).filter(m=>rMuniIds.includes(m.id)).length;
          if(!n) return null;
          const prefDetails=rPrefs2.map(p=>{
            const pn=(filteredMunis||[]).filter(m=>String(m.prefectureId)===String(p.id)).length;
            return pn>0?{name:p.name,n:pn}:null;
          }).filter(Boolean);
          return {region:rg.region,n,prefDetails};
        }).filter(Boolean) : [];
        return (
          <div style={{background:"#f8fafc",border:`1px solid ${muniFilterAssignee?C.accent:C.border}`,borderRadius:"0.875rem",padding:"0.625rem 0.75rem",marginBottom:"0.5rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.4rem"}}>
              <select value={muniFilterAssignee} onChange={e=>setMuniFilterAssignee(e.target.value)}
                style={{flex:1,padding:"0.3rem 0.5rem",borderRadius:"0.5rem",border:`1.5px solid ${muniFilterAssignee?C.accent:C.border}`,fontSize:"0.78rem",background:muniFilterAssignee?"#eff6ff":"white",color:muniFilterAssignee?C.accent:C.text,fontFamily:"inherit",fontWeight:muniFilterAssignee?700:400}}>
                <option value="">👤 担当者で絞り込み</option>
                <option value="__me__">自分の担当のみ</option>
                {users.map(u=><option key={u.id} value={String(u.id)}>{u.name}</option>)}
              </select>
              {muniFilterAssignee&&<span style={{fontSize:"0.8rem",fontWeight:800,color:"#7c3aed",flexShrink:0}}>{fCount}件</span>}
              {muniFilterAssignee&&<button onClick={()=>setMuniFilterAssignee("")}
                style={{fontSize:"0.65rem",background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:999,padding:"0.1rem 0.45rem",cursor:"pointer",fontWeight:700,fontFamily:"inherit",flexShrink:0}}>解除</button>}
            </div>
            {muniFilterAssignee&&regionCounts.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:"0.25rem"}}>
                {regionCounts.map(({region,n,prefDetails})=>(
                  <div key={region} style={{display:"flex",gap:"0.25rem",flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:"0.65rem",fontWeight:800,color:C.textSub,width:"4rem",flexShrink:0}}>{region}</span>
                    {prefDetails.map(({name,n:pn})=>(
                      <span key={name} style={{fontSize:"0.62rem",background:"#ede9fe",color:"#5b21b6",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700}}>{name}: {pn}</span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

        );
      })()}
      <BulkBar statusMap={MUNI_STATUS} applyFn={applyBulkMuni}
        extraFields={[["dustalk","ダストーク展開",DUSTALK_STATUS],["treatyStatus","連携協定",TREATY_STATUS],["status","アプローチ",MUNI_STATUS]]}
        visibleIds={(muniTopSearch?munis.filter(m=>(m.name||"").includes(muniTopSearch)):muniFilterAssignee?(munis.filter(m=>muniFilterAssignee==="__me__"?(m.assigneeIds||[]).some(id=>id===currentUser?.id):(m.assigneeIds||[]).some(id=>String(id)===muniFilterAssignee))):munis).map(m=>m.id)}
        onDelete={deleteBulkMuni}/>
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
        const hits=munis.filter(m=>{
          if(!m.name.includes(muniTopSearch)) return false;
          if(muniFilterAssignee==="__me__") return (m.assigneeIds||[]).some(id=>id===currentUser?.id);
          if(muniFilterAssignee) return (m.assigneeIds||[]).some(id=>String(id)===muniFilterAssignee);
          return true;
        });
        return (
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {hits.length===0&&<div style={{textAlign:"center",padding:"2rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",fontSize:"0.85rem",border:`1.5px dashed ${C.border}`}}>「{muniTopSearch}」に一致する自治体はありません</div>}
            {hits.map(m=>{
              const pref=prefOf(m.prefectureId);
              const ds=DUSTALK_STATUS[m.dustalk]||DUSTALK_STATUS["未展開"];
              const mv=muniVendors(m.id);
              return (
                <div key={m.id} onClick={()=>{setSheet(null);setActivePref(String(m.prefectureId));setActiveMuni(String(m.id));setMuniScreen("muniDetail");setActiveDetail("timeline");}}
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

      {/* 担当者フィルタ結果リスト（上部集約） */}
      {muniFilterAssignee&&(()=>{
        const fMunis = munis.filter(m=>{
          if(muniFilterAssignee==="__me__") return (m.assigneeIds||[]).some(id=>id===currentUser?.id);
          return (m.assigneeIds||[]).some(id=>String(id)===muniFilterAssignee);
        });
        if(!fMunis.length) return <div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`,fontSize:"0.82rem"}}>該当する自治体がありません</div>;
        return (
          <div style={{marginBottom:"0.75rem"}}>
            <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,marginBottom:"0.4rem",textTransform:"uppercase",letterSpacing:"0.04em"}}>
              担当案件 {fMunis.length}件
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
              {fMunis.map(m=>{
                const pref=prefOf(m.prefectureId);
                const rg=JAPAN_REGIONS.find(r=>prefs.filter(p=>p.region===r.region||(!p.region&&r.prefs.includes(p.name))).some(p=>String(p.id)===String(m.prefectureId)));
                const ds=DUSTALK_STATUS[m.dustalk]||DUSTALK_STATUS["未展開"];
                const ts=TREATY_STATUS[m.treatyStatus||"未接触"];
                const ms=MUNI_STATUS[m.status||"未接触"];
                const mvs=muniVendors(m.id);
                return (
                  <div key={m.id} onClick={()=>{setActivePref(String(m.prefectureId));setActiveMuni(String(m.id));setMuniScreen("muniDetail");setActiveDetail("timeline");}}
                    style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.625rem 0.75rem",background:"white",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,cursor:"pointer",boxShadow:C.shadow}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.35rem",marginBottom:"0.2rem"}}>
                        <span style={{fontSize:"0.85rem",fontWeight:700,color:C.text}}>{m.name}</span>
                        <span style={{fontSize:"0.6rem",color:C.textMuted,flexShrink:0}}>{rg?.region} › {pref?.name}</span>
                        {m.needFollow&&<span style={{fontSize:"0.58rem",background:"#fef9c3",color:"#854d0e",padding:"0.05rem 0.3rem",borderRadius:999,fontWeight:700,flexShrink:0}}>⭐</span>}
                      </div>
                      <div style={{display:"flex",gap:"0.2rem",flexWrap:"wrap"}}>
                        <span style={{fontSize:"0.6rem",padding:"0.05rem 0.3rem",borderRadius:999,background:ds.bg,color:ds.color,fontWeight:700}}>{ds.icon}{m.dustalk||"未展開"}</span>
                        {ts&&<span style={{fontSize:"0.6rem",padding:"0.05rem 0.3rem",borderRadius:999,background:ts.bg,color:ts.color,fontWeight:700}}>🤝{m.treatyStatus}</span>}
                        {ms&&<span style={{fontSize:"0.6rem",padding:"0.05rem 0.3rem",borderRadius:999,background:ms.bg,color:ms.color,fontWeight:700}}>{m.status||"未接触"}</span>}
                        {mvs.length>0&&<span style={{fontSize:"0.6rem",color:C.textMuted,padding:"0.05rem 0.3rem",background:C.bg,borderRadius:999}}>業者{mvs.length}</span>}
                      </div>
                    </div>
                    <span style={{fontSize:"0.8rem",color:C.textSub,flexShrink:0}}>›</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      {/* Hierarchy view */}
      {!muniTopSearch&&!muniFilterAssignee&&<div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
        {JAPAN_REGIONS.map(rg=>{
          const rOpen=openRegions[rg.region]===true;
          const rPrefs=prefs.filter(p=>p.region===rg.region||(!p.region&&rg.prefs.includes(p.name)));
          const rMunis=rPrefs.flatMap(p=>munis.filter(m=>String(m.prefectureId)===String(p.id)));
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
                    const pOpen=openPrefs[pref.id]===true;
                    const pMunis=munis.filter(m=>{
                    if(String(m.prefectureId)!==String(pref.id)) return false;
                    if(muniFilterAssignee==="__me__") return (m.assigneeIds||[]).some(id=>id===currentUser?.id);
                    if(muniFilterAssignee) return (m.assigneeIds||[]).some(id=>String(id)===muniFilterAssignee);
                    return true;
                  });
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
                                  onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(m.id)?n.delete(m.id):n.add(m.id);return n;});return;}setSheet(null);setActivePref(String(m.prefectureId));setActiveMuni(String(m.id));setMuniScreen("muniDetail");setActiveDetail("timeline"); /* muniClick */}}
                                  style={{display:"flex",alignItems:"center",padding:"0.5rem 1rem 0.5rem 2.5rem",borderTop:`1px solid ${C.borderLight}`,cursor:"pointer",gap:"0.4rem",background:bulkSelected.has(m.id)?"#eff6ff":"transparent"}}>
                                  {bulkMode&&<input type="checkbox" checked={bulkSelected.has(m.id)} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0,cursor:"pointer"}}/>}
                                  <div style={{flex:1,minWidth:0}}>
                                    <span style={{fontSize:"0.85rem",fontWeight:600,color:C.text}}>{m.name}</span>
                                    <span style={{fontSize:"0.62rem",color:C.textMuted,marginLeft:"0.35rem"}}>業者{mv.length}</span>
                                  </div>
                                  <div style={{display:"flex",flexDirection:"column",gap:"0.15rem",alignItems:"flex-end",flexShrink:0}}>
                                    <span style={{padding:"0.1rem 0.4rem",borderRadius:999,fontSize:"0.6rem",fontWeight:700,background:ds2.bg,color:ds2.color,whiteSpace:"nowrap"}}>{ds2.icon}{m.dustalk||"未展開"}</span>
                                    {(()=>{const ts=TREATY_STATUS[m.treatyStatus||"未接触"];return ts?<span style={{fontSize:"0.58rem",padding:"0.1rem 0.35rem",borderRadius:999,fontWeight:700,background:ts.bg,color:ts.color,whiteSpace:"nowrap"}}>🤝{m.treatyStatus||"未接触"}</span>:null;})()}
                                    {m.surveyDone&&<span style={{fontSize:"0.55rem",padding:"0.1rem 0.3rem",borderRadius:999,fontWeight:700,background:"#d1fae5",color:"#065f46",whiteSpace:"nowrap"}}>✅調査完了</span>}
                                    
                                  </div>
                                  <span style={{color:C.textMuted,fontSize:"0.78rem",flexShrink:0}}>›</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Add muni sheet per pref */}
                        {sheet===`am_${pref.id}`&&(()=>{
                          const pm=munis.filter(m=>String(m.prefectureId)===String(pref.id));
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
            const dup=munis.some(m=>String(m.prefectureId)===String(pref.id)&&m.name===r.name);
            if(dup){skipped.push(r);return;}
            toAdd.push({
              id:"m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),
              prefectureId:pref.id,
              name:r.name, dustalk:r.dustalk,
              treatyStatus:r.treatyStatus, status:r.status,
              artBranch:r.artBranch, address:r.address||"", assigneeIds:[],
              memos:r.notes?[{id:"mn_"+Date.now()+"_"+Math.random().toString(36).substr(2,9),text:r.notes,userId:currentUser?.id,date:new Date().toISOString()}]:[],
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
                    const dup=pref&&munis.some(m=>String(m.prefectureId)===String(pref.id)&&m.name===r.name);
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
                    disabled={!preview.filter(r=>{const p=prefs.find(x=>x.name===r.prefName);return p&&!munis.some(m=>String(m.prefectureId)===String(p.id)&&m.name===r.name);}).length}>
                    {preview.filter(r=>{const p=prefs.find(x=>x.name===r.prefName);return p&&!munis.some(m=>String(m.prefectureId)===String(p.id)&&m.name===r.name);}).length}件をインポート
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
      </>}{/* end salesTab==="muni" */}

      {/* ── 削除モーダル（全タブ共通） ── */}
      {DeleteModal}

      {/* ── 名刺タブ ── */}
      {salesTab==="bizcard"&&(()=>{
        const uid=currentUser?.id;
        const norm=s=>(s||"").replace(/[\s\u3000]/g,"").toLowerCase();

        // ── 重複モーダル（手動追加・CSVインポート共通）──
        const BcDupModal=()=>{
          if(!bcDupModal) return null;
          const ex=bcDupModal.existing;
          const exName=(`${ex.lastName||""} ${ex.firstName||""}`).trim()||"（名前なし）";
          return (
            <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.65)",padding:"1rem"}}>
              <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem 1.25rem",maxWidth:360,width:"100%",boxShadow:"0 12px 50px rgba(0,0,0,0.3)",maxHeight:"85vh",overflowY:"auto"}}>
                <div style={{textAlign:"center",marginBottom:"1rem"}}>
                  <div style={{fontSize:"2rem",marginBottom:"0.4rem"}}>⚠️</div>
                  <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>同じ名刺が既に存在します</div>
                  <div style={{fontSize:"0.78rem",color:C.textMuted,marginTop:"0.25rem"}}>登録しようとした名刺</div>
                  <div style={{fontWeight:700,fontSize:"0.9rem",color:"#dc2626",background:"#fee2e2",borderRadius:"0.625rem",padding:"0.45rem 0.875rem",marginTop:"0.4rem"}}>「{bcDupModal.incoming}」</div>
                </div>
                <div style={{background:C.bg,borderRadius:"0.875rem",padding:"0.875rem",marginBottom:"1.25rem"}}>
                  <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,marginBottom:"0.5rem"}}>📋 既に登録されているデータ</div>
                  {[["氏名",exName],["会社",ex.company],["役職",ex.title],["メール",ex.email],["携帯",ex.mobile||ex.telDirect]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l} style={{display:"flex",gap:"0.5rem",padding:"0.28rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                      <span style={{fontSize:"0.72rem",fontWeight:700,color:C.textSub,flexShrink:0,minWidth:48}}>{l}</span>
                      <span style={{fontSize:"0.8rem",color:C.text,wordBreak:"break-all"}}>{v}</span>
                    </div>
                  ))}
                </div>
                {bcDupQueue.length>1&&<div style={{fontSize:"0.72rem",color:C.textMuted,textAlign:"center",marginBottom:"0.75rem"}}>残り {bcDupQueue.length} 件の重複を確認中</div>}
                <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                  <button onClick={bcDupModal.onSkip} style={{padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.9rem"}}>
                    既存のデータを使う（スキップ）
                  </button>
                  <button onClick={bcDupModal.onAdd} style={{padding:"0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.accent}`,background:"white",color:C.accent,fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:"0.9rem"}}>
                    それでも新規追加する
                  </button>
                  <button onClick={bcDupModal.onCancel} style={{padding:"0.6rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:"0.85rem"}}>
                    {bcDupQueue.length>1?"残りをすべてスキップ":"キャンセル（入力に戻る）"}
                  </button>
                </div>
              </div>
            </div>
          );
        };

        // ── 取込完了サマリーモーダル ──
        const BcSummaryModal=()=>{
          if(!bcImportSummary) return null;
          return (
            <div style={{position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)",padding:"1rem"}}>
              <div style={{background:"white",borderRadius:"1.25rem",padding:"2rem 1.5rem",maxWidth:320,width:"100%",textAlign:"center",boxShadow:"0 12px 50px rgba(0,0,0,0.25)"}}>
                <div style={{fontSize:"2.5rem",marginBottom:"0.5rem"}}>✅</div>
                <div style={{fontWeight:800,fontSize:"1.05rem",color:C.text,marginBottom:"0.5rem"}}>取込み完了</div>
                <div style={{fontSize:"0.88rem",color:C.textSub,marginBottom:"0.25rem"}}>追加：<b style={{color:"#059669"}}>{bcImportSummary.added}件</b></div>
                {bcImportSummary.skipped>0&&<div style={{fontSize:"0.82rem",color:C.textMuted}}>スキップ：{bcImportSummary.skipped}件（重複）</div>}
                <Btn style={{width:"100%",marginTop:"1.25rem"}} onClick={()=>setBcImportSummary(null)}>閉じる</Btn>
              </div>
            </div>
          );
        };

        // ── 詳細画面 ──
        if(bcScreen==="detail"){
          const card=bizCards.find(c=>c.id===bcActiveId);
          if(!card) return (<div><BcDupModal/><BcSummaryModal/><button onClick={()=>setBcScreen("list")} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0,marginBottom:"1rem"}}>‹ 名刺一覧</button><div style={{textAlign:"center",color:C.textMuted,padding:"3rem"}}>名刺が見つかりません</div></div>);
          const name=`${card.lastName||""} ${card.firstName||""}`.trim();
          const phone=card.telDirect||card.mobile||card.telCompany||card.telDept||"";
          const Field=({icon,label,value,href})=>!value?null:(
            <div style={{display:"flex",gap:"0.75rem",padding:"0.625rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
              <span style={{fontSize:"0.95rem",flexShrink:0,width:20,textAlign:"center"}}>{icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"0.65rem",color:C.textMuted,marginBottom:"0.1rem"}}>{label}</div>
                {href?<a href={href} style={{fontSize:"0.85rem",color:C.accent,textDecoration:"none",wordBreak:"break-all"}}>{value}</a>
                  :<div style={{fontSize:"0.85rem",color:C.text,wordBreak:"break-all"}}>{value}</div>}
              </div>
            </div>
          );
          const [memoIn,setMemoIn]=[bcMemoIn,setBcMemoIn];
          return (
            <div>
              <BcDupModal/><BcSummaryModal/>
              <button onClick={()=>setBcScreen("list")} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",marginBottom:"1rem",padding:0}}>‹ 名刺一覧</button>
              <Card style={{padding:"1.25rem",marginBottom:"1rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"0.5rem"}}>
                  <div>
                    <div style={{fontSize:"1.2rem",fontWeight:800,color:C.text}}>{name||"（名前なし）"}</div>
                    {card.title&&<div style={{fontSize:"0.78rem",color:C.textSub,marginTop:"0.15rem"}}>{card.title}</div>}
                    <div style={{fontSize:"0.88rem",fontWeight:700,color:C.accent,marginTop:"0.35rem"}}>🏢 {card.company}</div>
                    {card.department&&<div style={{fontSize:"0.75rem",color:C.textMuted}}>{card.department}</div>}
                  </div>
                  <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
                    {phone&&<a href={`tel:${phone.replace(/[^0-9+]/g,"")}`} style={{padding:"0.45rem 0.75rem",borderRadius:"0.625rem",background:C.accentBg,color:C.accent,fontSize:"0.78rem",fontWeight:700,textDecoration:"none"}}>📞 電話</a>}
                    {card.email&&<a href={`mailto:${card.email}`} style={{padding:"0.45rem 0.75rem",borderRadius:"0.625rem",background:"#f0fdf4",color:"#059669",fontSize:"0.78rem",fontWeight:700,textDecoration:"none"}}>✉️ メール</a>}
                  </div>
                </div>
                {card.owner&&<div style={{marginTop:"0.4rem",fontSize:"0.75rem",fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:"0.4rem",padding:"0.2rem 0.5rem",display:"inline-block"}}>👤 所有者：{card.owner}</div>}
                {card.owner&&<div style={{marginTop:"0.4rem",fontSize:"0.75rem",fontWeight:700,color:"#7c3aed",background:"#ede9fe",borderRadius:"0.4rem",padding:"0.2rem 0.5rem",display:"inline-block"}}>👤 所有者：{card.owner}</div>}
                {card.exchangedAt&&<div style={{marginTop:"0.5rem",fontSize:"0.72rem",color:C.textMuted}}>🤝 名刺交換日：{card.exchangedAt}</div>}
              </Card>
              <Card style={{padding:"1rem",marginBottom:"1rem"}}>
                <Field icon="📧" label="メールアドレス" value={card.email} href={`mailto:${card.email}`}/>
                <Field icon="📞" label="TEL（直通）" value={card.telDirect}/>
                <Field icon="📱" label="携帯電話" value={card.mobile}/>
                <Field icon="☎️" label="TEL（会社）" value={card.telCompany}/>
                <Field icon="🏢" label="TEL（部門）" value={card.telDept}/>
                <Field icon="📠" label="FAX" value={card.fax}/>
                <Field icon="📮" label="郵便番号" value={card.zip}/>
                <Field icon="🗺️" label="住所" value={card.address}/>
                <Field icon="🌐" label="URL" value={card.url} href={card.url}/>
              </Card>
              <Card style={{padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.5rem"}}>📝 メモ</div>
                {(card.memos||[]).map(m=>(
                  <div key={m.id} style={{padding:"0.5rem",background:C.bg,borderRadius:"0.5rem",marginBottom:"0.4rem",fontSize:"0.82rem",color:C.text,whiteSpace:"pre-wrap"}}>
                    {m.text}
                    <div style={{fontSize:"0.65rem",color:C.textMuted,marginTop:"0.2rem"}}>{users.find(u=>u.id===m.userId)?.name||""} · {m.date?new Date(m.date).toLocaleDateString("ja-JP"):""}</div>
                  </div>
                ))}
                <div style={{display:"flex",gap:"0.5rem",marginTop:"0.5rem"}}>
                  <input value={memoIn} onChange={e=>setMemoIn(e.target.value)} placeholder="メモを追加..."
                    style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.82rem"}}/>
                  <Btn size="sm" disabled={!memoIn.trim()} onClick={()=>{
                    if(!memoIn.trim())return;
                    const m={id:Date.now(),userId:uid,text:memoIn.trim(),date:new Date().toISOString()};
                    updateBizCard(card.id,{memos:[...(card.memos||[]),m]});
                    setMemoIn("");
                  }}>追加</Btn>
                </div>
              </Card>
              <Card style={{padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,marginBottom:"0.5rem"}}>🔗 営業先への紐づけ</div>
                {card.salesRef ? (
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",background:C.bg,borderRadius:"0.75rem",padding:"0.6rem 0.75rem"}}>
                    <span style={{fontSize:"0.72rem",fontWeight:800,color:"white",background:{"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[card.salesRef.type]||C.accent,borderRadius:999,padding:"0.1rem 0.45rem"}}>{card.salesRef.type}</span>
                    <span style={{flex:1,fontSize:"0.88rem",fontWeight:600,color:C.text}}>{card.salesRef.name}</span>
                    <button onClick={()=>updateBizCard(card.id,{salesRef:null})}
                      style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:"0.78rem",padding:"0.2rem"}}>紐解除</button>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:"0.75rem",color:C.textMuted,marginBottom:"0.5rem"}}>紐づけ先の営業先を選択してください</div>
                    <SalesRefPicker value={null} onChange={v=>updateBizCard(card.id,{salesRef:v})} salesData={data}/>
                  </div>
                )}
              </Card>
              <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("この名刺を削除しますか？")){deleteBizCard(card.id);setBcScreen("list");}}}>🗑 削除</Btn>
            </div>
          );
        }

        // ── 一覧画面 ──
        // 企業一覧（登録件数つき）
        const companyNames=[...new Set(bizCards.map(c=>c.company||"（会社名なし）"))].sort((a,b)=>a.localeCompare(b,"ja"));

        // フィルター適用
        const q=norm(bcSearch);
        const filtered=bizCards.filter(c=>{
          if(bcCompanyFilter&&c.company!==bcCompanyFilter) return false;
          if(!q) return true;
          return [c.company,c.lastName,c.firstName,c.title,c.department,c.email,c.mobile,c.telDirect,c.address].some(v=>norm(v).includes(q));
        }).sort((a,b)=>{
          const cmp=(a.company||"").localeCompare(b.company||"","ja");
          if(cmp!==0)return cmp;
          return (a.lastName||"").localeCompare(b.lastName||"","ja");
        });
        const bcVisibleIds=filtered.map(c=>c.id);

        // 会社別グループ
        const groups={};
        filtered.forEach(c=>{const k=c.company||"（会社名なし）";if(!groups[k])groups[k]=[];groups[k].push(c);});
        const groupKeys=Object.keys(groups).sort((a,b)=>a.localeCompare(b,"ja"));

        return (
          <div>
            <BcDupModal/>
            <BcSummaryModal/>
            <BulkBar statusMap={null} visibleIds={bcVisibleIds} onDelete={deleteBulkBizCard}/>

            {/* ヘッダー */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem"}}>
              <div>
                <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>🪪 名刺管理</div>
                <div style={{fontSize:"0.72rem",color:C.textMuted}}>{bizCards.length}件 · {companyNames.length}社</div>
              </div>
              <div style={{display:"flex",gap:"0.5rem"}}>
                <button onClick={()=>{setDeleteModal({type:"bizcard"});setDmSearch("");setDmFilter("");setDmSelected(new Set());}}
                  style={{padding:"0.45rem 0.75rem",borderRadius:"0.75rem",border:"1.5px solid #fca5a5",background:"#fff1f2",color:"#dc2626",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>🗑 削除</button>
                <Btn size="sm" variant="secondary" onClick={()=>setSheet("bcImport")}>📥 CSV取込</Btn>
                <Btn size="sm" onClick={()=>setSheet("bcAdd")}>＋ 追加</Btn>
              </div>
            </div>

            {/* 企業フィルターチップ */}
            {companyNames.length>0&&(
              <div style={{display:"flex",gap:"0.4rem",overflowX:"auto",paddingBottom:"0.4rem",marginBottom:"0.75rem",WebkitOverflowScrolling:"touch"}}>
                <button onClick={()=>setBcCompanyFilter("")}
                  style={{flexShrink:0,padding:"0.3rem 0.75rem",borderRadius:999,border:`1.5px solid ${!bcCompanyFilter?C.accent:C.border}`,background:!bcCompanyFilter?C.accentBg:"white",color:!bcCompanyFilter?C.accent:C.textSub,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  すべて（{bizCards.length}）
                </button>
                {companyNames.map(name=>{
                  const cnt=bizCards.filter(c=>c.company===name).length;
                  const active=bcCompanyFilter===name;
                  return (
                    <button key={name} onClick={()=>setBcCompanyFilter(active?"":name)}
                      style={{flexShrink:0,padding:"0.3rem 0.75rem",borderRadius:999,border:`1.5px solid ${active?C.accent:C.border}`,background:active?C.accentBg:"white",color:active?C.accent:C.textSub,fontWeight:active?700:500,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis"}}>
                      🏢 {name}（{cnt}）
                    </button>
                  );
                })}
              </div>
            )}

            {/* 検索 */}
            <div style={{marginBottom:"0.75rem",position:"relative"}}>
              <span style={{position:"absolute",left:"0.75rem",top:"50%",transform:"translateY(-50%)",fontSize:"0.85rem",color:C.textMuted,pointerEvents:"none"}}>🔍</span>
              <input value={bcSearch} onChange={e=>setBcSearch(e.target.value)} placeholder="氏名・役職・メール・電話番号で検索..."
                style={{width:"100%",padding:"0.6rem 0.75rem 0.6rem 2.2rem",borderRadius:"0.75rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.85rem",boxSizing:"border-box"}}/>
            </div>

            {/* 一覧 */}
            {bizCards.length===0?(
              <Card style={{padding:"3rem 1rem",textAlign:"center",color:C.textMuted}}>
                <div style={{fontSize:"3rem",marginBottom:"0.75rem"}}>🪪</div>
                <div style={{fontWeight:700,fontSize:"0.9rem",marginBottom:"0.4rem"}}>名刺がまだありません</div>
                <div style={{fontSize:"0.8rem"}}>「＋ 追加」または「📥 CSV取込」で登録してください</div>
              </Card>
            ):filtered.length===0?(
              <div style={{textAlign:"center",color:C.textMuted,padding:"2rem",fontSize:"0.85rem"}}>該当する名刺がありません</div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                {groupKeys.map(company=>(
                  <Card key={company} style={{overflow:"hidden"}}>
                    {/* 企業ヘッダー（タップで企業フィルター） */}
                    <div onClick={()=>setBcCompanyFilter(bcCompanyFilter===company?"":company)}
                      style={{padding:"0.5rem 1rem",background:bcCompanyFilter===company?C.accentBg:C.bg,borderBottom:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",gap:"0.5rem",cursor:"pointer"}}>
                      <span style={{fontSize:"0.75rem",fontWeight:800,color:bcCompanyFilter===company?C.accent:C.text,flex:1}}>🏢 {company}</span>
                      <span style={{fontSize:"0.68rem",color:C.textMuted,background:"white",borderRadius:999,padding:"0.05rem 0.45rem",border:`1px solid ${C.borderLight}`}}>{groups[company].length}名</span>
                      <span style={{fontSize:"0.7rem",color:C.textMuted}}>{bcCompanyFilter===company?"✕ 解除":"絞込"}</span>
                    </div>
                    {/* 所属メンバー */}
                    {groups[company].map(card=>{
                      const name=`${card.lastName||""} ${card.firstName||""}`.trim()||"（名前なし）";
                      const phone=card.telDirect||card.mobile||card.telCompany||"";
                      const isSelected=bulkSelected.has(card.id);
                      return (
                        <div key={card.id} onClick={()=>{
                          if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(card.id)?n.delete(card.id):n.add(card.id);return n;});return;}
                          setBcActiveId(card.id);setBcScreen("detail");
                        }}
                          style={{display:"flex",alignItems:"center",gap:"0.75rem",padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,cursor:"pointer",background:isSelected?"#eff6ff":"white",transition:"background 0.1s"}}>
                          {bulkMode&&<input type="checkbox" checked={isSelected} readOnly style={{width:15,height:15,accentColor:C.accent,flexShrink:0}}/>}
                          <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:"1rem",fontWeight:800,color:"white"}}>{(card.lastName||card.company||"?")[0]}</span>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:"0.35rem",flexWrap:"wrap"}}>
                              <span style={{fontSize:"0.88rem",fontWeight:700,color:C.text}}>{name}</span>
                              {card.salesRef&&<span style={{fontSize:"0.62rem",fontWeight:700,color:"white",background:{"企業":"#2563eb","業者":"#7c3aed","自治体":"#059669"}[card.salesRef.type]||"#64748b",borderRadius:999,padding:"0.05rem 0.35rem"}}>{card.salesRef.type}</span>}
                            </div>
                            <div style={{fontSize:"0.72rem",color:C.textSub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[card.title,card.department].filter(Boolean).join("　")}</div>
                            <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                              {phone&&<span style={{fontSize:"0.7rem",color:C.textMuted}}>📞 {phone}</span>}
                              {card.owner&&<span style={{fontSize:"0.68rem",color:"#7c3aed",fontWeight:600}}>👤 {card.owner}</span>}
                            </div>
                          </div>
                          {!bulkMode&&<span style={{color:C.textMuted,fontSize:"0.85rem",flexShrink:0}}>›</span>}
                        </div>
                      );
                    })}
                  </Card>
                ))}
              </div>
            )}

            {/* 手動追加シート */}
            {sheet==="bcAdd"&&(
              <Sheet title="名刺を追加" onClose={()=>{setSheet(null);setBcAddForm(BC_ADD_INIT);}}>
                {[
                  ["所有者（誰が交換した名刺か）","owner","select"],
                  ["会社名 *","company","text"],
                  ["姓","lastName","text"],
                  ["名","firstName","text"],
                  ["部署名","department","text"],
                  ["役職","title","text"],
                  ["メールアドレス","email","email"],
                  ["携帯電話","mobile","tel"],
                  ["TEL（直通）","telDirect","tel"],
                  ["TEL（会社）","telCompany","tel"],
                  ["TEL（部門）","telDept","tel"],
                  ["FAX","fax","tel"],
                  ["郵便番号","zip","text"],
                  ["住所","address","text"],
                  ["URL","url","url"],
                  ["名刺交換日","exchangedAt","date"],
                ].map(([label,k,type])=>(
                  <div key={k} style={{marginBottom:"0.625rem"}}>
                    <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textSub,marginBottom:"0.2rem"}}>{label}</div>
                    {type==="select"?(
                      <select value={bcAddForm[k]||""} onChange={e=>setBcAddForm(p=>({...p,[k]:e.target.value}))}
                        style={{width:"100%",padding:"0.5rem 0.75rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.82rem",boxSizing:"border-box",background:"white"}}>
                        <option value="">選択してください</option>
                        {users.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    ):(
                      <input type={type} value={bcAddForm[k]||""} onChange={e=>setBcAddForm(p=>({...p,[k]:e.target.value}))}
                        placeholder={
                          k==="company"?"株式会社○○":k==="lastName"?"山田":k==="firstName"?"太郎":
                          k==="department"?"営業部":k==="title"?"部長":k==="email"?"xxx@example.com":
                          k==="mobile"?"090-xxxx-xxxx":k==="telDirect"||k==="telCompany"?"03-xxxx-xxxx":
                          k==="zip"?"100-0001":k==="address"?"東京都千代田区…":k==="url"?"https://":""}
                        style={{width:"100%",padding:"0.5rem 0.75rem",borderRadius:"0.625rem",border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.82rem",boxSizing:"border-box"}}/>
                    )}
                  </div>
                ))}
                <div style={{display:"flex",gap:"0.75rem",marginTop:"1rem"}}>
                  <Btn variant="secondary" style={{flex:1}} onClick={()=>{setSheet(null);setBcAddForm(BC_ADD_INIT);}}>キャンセル</Btn>
                  <Btn style={{flex:2}} size="lg" disabled={!bcAddForm.company.trim()} onClick={()=>{addBizCard(bcAddForm);setBcAddForm(BC_ADD_INIT);}}>保存する</Btn>
                </div>
              </Sheet>
            )}

            {/* CSVインポートシート */}
            {sheet==="bcImport"&&(
              <Sheet title="Eight CSV 取込" onClose={()=>{setSheet(null);setBcImportPrev(null);setBcImportErr("");}}>
                <div style={{fontSize:"0.82rem",color:C.textSub,marginBottom:"1rem",background:C.bg,padding:"0.75rem",borderRadius:"0.625rem",lineHeight:1.7}}>
                  EightアプリからエクスポートしたCSV（UTF-8）を選択してください。<br/>
                  A列（会社名）〜 N列（URL）を自動で取込みます。<br/>
                  <span style={{color:"#059669",fontWeight:700}}>重複が見つかった場合は1件ずつ確認できます。</span>
                </div>
                {!bcImportPrev?(
                  <>
                    <input type="file" accept=".csv" onChange={e=>{
                      const file=e.target.files[0];if(!file)return;
                      const reader=new FileReader();
                      reader.onload=ev=>{
                        const result=parseEightCsv(ev.target.result);
                        if(result.error){setBcImportErr(result.error);setBcImportPrev(null);}
                        else{setBcImportPrev(result.rows);setBcImportErr("");}
                      };
                      reader.readAsText(file,"UTF-8");
                    }} style={{width:"100%",marginBottom:"0.75rem"}}/>
                    {bcImportErr&&<div style={{color:"#dc2626",fontSize:"0.82rem",background:"#fee2e2",padding:"0.5rem 0.75rem",borderRadius:"0.5rem"}}>⚠️ {bcImportErr}</div>}
                  </>
                ):(
                  <>
                    <div style={{background:"#d1fae5",borderRadius:"0.625rem",padding:"0.75rem",marginBottom:"0.75rem",fontSize:"0.82rem",color:"#065f46"}}>
                      ✅ {bcImportPrev.length}件を読み込みました。重複が見つかった場合は順番に確認できます。
                    </div>
                    <div style={{maxHeight:260,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:"0.625rem",marginBottom:"1rem"}}>
                      {bcImportPrev.slice(0,50).map((row,i)=>(
                        <div key={i} style={{padding:"0.5rem 0.75rem",borderBottom:`1px solid ${C.borderLight}`,fontSize:"0.78rem"}}>
                          <div style={{fontWeight:700,color:C.text}}>{row.lastName} {row.firstName} <span style={{color:C.textSub,fontWeight:400}}>/ {row.company}</span></div>
                          <div style={{color:C.textMuted}}>{[row.title,row.email&&"✉ "+row.email,row.mobile&&"📱 "+row.mobile].filter(Boolean).join("　")}</div>
                        </div>
                      ))}
                      {bcImportPrev.length>50&&<div style={{padding:"0.5rem",textAlign:"center",fontSize:"0.75rem",color:C.textMuted}}>… 他{bcImportPrev.length-50}件</div>}
                    </div>
                    <div style={{display:"flex",gap:"0.75rem"}}>
                      <Btn variant="secondary" style={{flex:1}} onClick={()=>setBcImportPrev(null)}>戻る</Btn>
                      <Btn style={{flex:2}} size="lg" onClick={()=>importBizCards(bcImportPrev)}>📥 {bcImportPrev.length}件を取込む</Btn>
                    </div>
                  </>
                )}
              </Sheet>
            )}
          </div>
        );
      })()}

      {/* ── 活動ログ ── */}
      <ActivityLog data={data} users={users} filterTypes={["企業","業者","自治体"]} />

      {renderModals()}
    </div>
  );
}


// ─── PUSH TEST PANEL（新川希亮専用）─────────────────────────────────────────
function PushTestPanel({ currentUser, users }) {
  const [log,      setLog]     = React.useState([]);
  const [subInfo,  setSubInfo] = React.useState(null);
  const [sending,  setSending] = React.useState(false);
  const SECRET = 'mydesk2026';

  const addLog = (msg, type='info') => setLog(p => [{msg, type, t: new Date().toLocaleTimeString('ja-JP')}, ...p].slice(0, 20));

  // 購読状態をサーバーから確認
  const checkSubs = async () => {
    addLog('購読状態を確認中...', 'info');
    try {
      const r = await fetch('/api/push-test', { headers: { 'x-mydesk-secret': SECRET } });
      if (!r.ok) { addLog('APIエラー: ' + r.status, 'error'); return; }
      const d = await r.json();
      const nameMap = {};
      (d.userIds || []).forEach(uid => {
        const u = users.find(x => String(x.id) === String(uid));
        nameMap[uid] = u ? u.name : '不明(' + uid + ')';
      });
      setSubInfo({ count: d.subscribedUsers, nameMap, nodeVer: d.nodeVersion, wpVer: d.webpushVersion });
      addLog(`✅ 購読中 ${d.subscribedUsers}人: ${Object.values(nameMap).join(', ') || 'なし'}`, 'ok');
    } catch(e) { addLog('❌ ' + e.message, 'error'); }
  };

  // テストアカウントにプッシュ送信
  const sendTestPush = async () => {
    setSending(true);
    addLog('テストアカウントへ送信中...', 'info');
    // テストアカウントのユーザーIDを探す
    const testUser = users.find(u => u.email === 'push-test@mydesk.app');
    if (!testUser) {
      addLog('❌ テストアカウントが未登録です（push-test@mydesk.app でアカウント作成が必要）', 'error');
      setSending(false); return;
    }
    try {
      const r = await fetch('/api/push-test?send=' + testUser.id, { headers: { 'x-mydesk-secret': SECRET } });
      const d = await r.json();
      if (d.testSend?.ok) {
        addLog('✅ 送信成功！テスト端末に通知が届くはずです', 'ok');
      } else if (d.testSend?.skipped) {
        addLog('⚠️ テストアカウントが通知ONになっていません（別端末でログイン後、設定→通知ONにしてください）', 'warn');
      } else {
        addLog('❌ 送信失敗: ' + (d.testSend?.msg || JSON.stringify(d.testSend)), 'error');
      }
    } catch(e) { addLog('❌ ' + e.message, 'error'); }
    setSending(false);
  };

  const logColor = { ok:'#065f46', error:'#dc2626', warn:'#92400e', info:'#475569' };
  const logBg    = { ok:'#f0fdf4', error:'#fef2f2', warn:'#fffbeb', info:'#f8fafc' };

  return (
    <div style={{marginTop:'1.25rem', padding:'1rem', background:'#fffbeb', border:'2px dashed #f59e0b', borderRadius:'0.875rem'}}>
      <div style={{display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.875rem'}}>
        <span style={{fontSize:'1.1rem'}}>🛠️</span>
        <div>
          <div style={{fontWeight:800, fontSize:'0.87rem', color:'#92400e'}}>プッシュ通知テスト <span style={{fontSize:'0.68rem', background:'#fef3c7', color:'#92400e', border:'1px solid #fcd34d', borderRadius:999, padding:'1px 7px', marginLeft:4}}>新川希亮専用</span></div>
          <div style={{fontSize:'0.7rem', color:'#a16207', marginTop:1}}>バックグラウンド通知の動作確認パネル</div>
        </div>
      </div>

      {/* テストアカウント情報 */}
      <div style={{background:'white', border:'1px solid #fde68a', borderRadius:'0.625rem', padding:'0.75rem', marginBottom:'0.75rem'}}>
        <div style={{fontSize:'0.72rem', fontWeight:700, color:'#92400e', marginBottom:'0.5rem'}}>📱 テストアカウント情報（別端末でログイン用）</div>
        {[
          ['メールアドレス', 'push-test@mydesk.app'],
          ['パスワード',     'PushTest2026!'],
          ['名前',           'テスト通知ユーザー'],
        ].map(([k,v]) => (
          <div key={k} style={{display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.3rem'}}>
            <span style={{fontSize:'0.68rem', color:'#a16207', width:80, flexShrink:0}}>{k}</span>
            <code style={{fontSize:'0.78rem', fontWeight:700, color:'#1e293b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:4, padding:'1px 7px', letterSpacing:'0.02em'}}>{v}</code>
          </div>
        ))}
        <div style={{marginTop:'0.5rem', fontSize:'0.68rem', color:'#a16207', lineHeight:1.5}}>
          ① 別端末でMyDeskを開き上記でログイン<br/>
          ② 設定 → 通知 → ONにする<br/>
          ③ このパネルで「テスト送信」→ 別端末に通知が届けばOK
        </div>
      </div>

      {/* ボタン */}
      <div style={{display:'flex', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap'}}>
        <button onClick={checkSubs}
          style={{flex:1, minWidth:120, padding:'0.5rem 0.75rem', borderRadius:8, border:'1.5px solid #e2e8f0', background:'white', cursor:'pointer', fontSize:'0.78rem', fontWeight:700, color:'#1e293b', fontFamily:'inherit'}}>
          📡 購読状態を確認
        </button>
        <button onClick={sendTestPush} disabled={sending}
          style={{flex:1, minWidth:120, padding:'0.5rem 0.75rem', borderRadius:8, border:'none', background: sending ? '#94a3b8' : '#2563eb', color:'white', cursor: sending ? 'default':'pointer', fontSize:'0.78rem', fontWeight:700, fontFamily:'inherit'}}>
          {sending ? '送信中...' : '🔔 テスト送信'}
        </button>
      </div>

      {/* ログ */}
      {log.length > 0 && (
        <div style={{maxHeight:160, overflowY:'auto', display:'flex', flexDirection:'column', gap:3}}>
          {log.map((l, i) => (
            <div key={i} style={{display:'flex', gap:'0.4rem', alignItems:'flex-start', background:logBg[l.type]||logBg.info, borderRadius:6, padding:'4px 8px'}}>
              <span style={{fontSize:'0.65rem', color:'#94a3b8', flexShrink:0, marginTop:1}}>{l.t}</span>
              <span style={{fontSize:'0.75rem', color:logColor[l.type]||logColor.info, fontWeight:600, lineHeight:1.4}}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MYPAGE VIEW ─────────────────────────────────────────────────────────────
function MyPageView({currentUser, setCurrentUser, users, setUsers, onLogout, pushEnabled, setPushEnabled, subscribePush, unsubscribePush, data, setData}) {
  const [profileForm, setProfileForm] = useState({name:currentUser?.name||"",email:currentUser?.email||"",phone:currentUser?.phone||""});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [pwForm, setPwForm] = useState({cur:"",next:"",next2:""});
  const [pwMsg, setPwMsg] = useState("");
  const [section, setSection] = useState("profile");
  const [contractModal, setContractModal] = useState(null);
  // template states (top-level to avoid hooks-in-IIFE)
  const [tplForm,    setTplForm]    = useState({name:"",targetType:"共通",subject:"",body:""});
  const [tplEditId,  setTplEditId]  = useState(null);
  const [showTplForm,setShowTplForm]= useState(false);
  // backup/restore state
  const [snapshots, setSnapshots] = useState([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapMsg, setSnapMsg] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState(null); // snapshot object to restore
  // activity log state
  const [logFilter, setLogFilter] = useState("all"); // all | タスク | プロジェクト | 企業 | 業者 | 自治体

  const loadSnaps = async () => {
    setSnapLoading(true);
    const idx = await loadSnapshotIndex();
    setSnapshots([...idx].reverse()); // 新しい順
    setSnapLoading(false);
  };

  const doBackup = async () => {
    setSnapMsg("保存中...");
    const label = "📌 手動 " + new Date().toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
    const key = await saveSnapshot(data, label);
    if(key) {
      setSnapMsg("✅ 手動バックアップを保存しました");
      loadSnaps();
    } else {
      setSnapMsg("❌ 保存に失敗しました");
    }
    setTimeout(()=>setSnapMsg(""),4000);
  };

  const doRestore = async (snap) => {
    setSnapMsg("復元中...");
    const s = await loadSnapshot(snap.key);
    if(s?.data) {
      // 復元前に現時点のデータをバックアップ
      const beforeLabel = "⏪ 復元前の自動退避 " + new Date().toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
      await saveSnapshot(data, beforeLabel);
      setData({...s.data});
      await saveData(s.data);
      const dt = snap.savedAt ? new Date(snap.savedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "";
      setSnapMsg("✅ " + dt + " のデータを復元しました");
      setRestoreConfirm(null);
      loadSnaps();
    } else {
      setSnapMsg("❌ 復元に失敗しました");
    }
    setTimeout(()=>setSnapMsg(""),6000);
  };

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
    {id:"profile",  icon:"👤", label:"プロフィール"},
    {id:"links",    icon:"🔗", label:"外部連携"},
    {id:"contract", icon:"📜", label:"契約書"},
    {id:"account",  icon:"🔑", label:"パスワード"},
    {id:"template", icon:"✉️", label:"テンプレート"},
    {id:"backup",   icon:"💾", label:"バックアップ"},
    {id:"actlog",   icon:"📋", label:"活動ログ"},
  ];

  const isIosMobile = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const showIosGuide = isIosMobile && !window.matchMedia("(display-mode: standalone)").matches;
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

          {/* 通知方法 */}
          <div style={{marginTop:"1.25rem",paddingTop:"1.25rem",borderTop:"1px solid "+C.borderLight}}>
            <div style={{fontSize:"0.87rem",fontWeight:700,color:C.text,marginBottom:"0.625rem"}}>🔔 通知方法</div>
            {(()=>{
              const mode = currentUser?.notifyMode || 'push';
              const saveMode = async (m) => {
                const updated = {...currentUser, notifyMode: m};
                const newUsers = users.map(u=>u.id===currentUser.id?updated:u);
                await saveUsers(newUsers);
                setCurrentUser(updated); setUsers(newUsers); setSession(updated);
              };
              return (
                <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.875rem"}}>
                  {[
                    {id:'push',  label:'📱 プッシュのみ'},
                    {id:'email', label:'📧 メールのみ'},
                    {id:'both',  label:'🔔 両方'},
                  ].map(opt=>(
                    <button key={opt.id} onClick={()=>saveMode(opt.id)}
                      style={{flex:1,padding:"0.45rem 0.25rem",borderRadius:"0.625rem",border:`1.5px solid ${mode===opt.id?C.accent:C.border}`,cursor:"pointer",fontFamily:"inherit",fontWeight:mode===opt.id?700:500,fontSize:"0.72rem",background:mode===opt.id?"#eff6ff":"white",color:mode===opt.id?C.accent:C.textSub}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              );
            })()}
            {(currentUser?.notifyMode==='email'||currentUser?.notifyMode==='both')&&(
              <div style={{fontSize:"0.72rem",color:C.textMuted,background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"0.5rem",padding:"0.4rem 0.625rem",marginBottom:"0.625rem"}}>
                📧 送信先: bm-dx@beetle-ems.com
              </div>
            )}
            {(currentUser?.notifyMode!=='email')&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:"0.8rem",color:C.textMuted}}>
                    {pushEnabled?"✅ プッシュ通知 有効":"❌ プッシュ通知 無効"}
                  </div>
                  {(()=>{if(pushEnabled)return null;const ua=typeof navigator!=='undefined'?navigator.userAgent:'';const isIosDev=ua.match('iPhone')||ua.match('iPad')||ua.match('iPod');const isSA=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;return (isIosDev&&!isSA)?<div style={{fontSize:"0.7rem",background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:"0.5rem",padding:"0.4rem 0.5rem",marginTop:"0.4rem",color:"#92400e"}}>📱 iPhoneはSafariの「ホーム画面に追加」後、アプリとして起動してONにしてください</div>:null;})()}
                </div>
                <button onClick={async()=>{
                  if(pushEnabled){await unsubscribePush(currentUser.id);setPushEnabled(false);}
                  else{const ok=await subscribePush(currentUser.id);if(ok)setPushEnabled(true);}
                }} style={{padding:"0.4rem 1rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.82rem",background:pushEnabled?"#d1fae5":"#2563eb",color:pushEnabled?"#065f46":"white"}}>
                  {pushEnabled?"ON ✓":"ONにする"}
                </button>
              </div>
            )}
          </div>

          {/* 新川希亮のみ: プッシュ通知テストパネル */}
          {currentUser?.name==='新川希亮' && (
            <PushTestPanel currentUser={currentUser} users={users}/>
          )}

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
          {showIosGuide&&(
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

      )}

      {/* ── メールテンプレート ── */}
      {section==="template"&&(()=>{
        const templates = data.emailTemplates||[];
        const editId = tplEditId;
        const showForm = showTplForm;

        const saveTpl = () => {
          if(!tplForm.name.trim()||!tplForm.subject.trim()) return;
          let nd;
          if(editId) {
            nd = {...data, emailTemplates: templates.map(t=>t.id===editId?{...t,...tplForm}:t)};
          } else {
            nd = {...data, emailTemplates: [...templates, {...tplForm, id:Date.now()+Math.random(), createdAt:new Date().toISOString()}]};
          }
          setData(nd); saveData(nd);
          setTplForm({name:"",targetType:"共通",subject:"",body:""}); setTplEditId(null); setShowTplForm(false);
        };
        const deleteTpl = (id) => {
          if(!window.confirm("削除しますか？")) return;
          const nd = {...data, emailTemplates: templates.filter(t=>t.id!==id)};
          setData(nd); saveData(nd);
        };
        const startEdit = (t) => {
          setTplForm({name:t.name,targetType:t.targetType||"共通",subject:t.subject||"",body:t.body||""});
          setTplEditId(t.id); setShowTplForm(true);
        };

        return (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
              <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text}}>✉️ メールテンプレート</div>
              <Btn size="sm" onClick={()=>{setShowTplForm(v=>!v);setTplEditId(null);setTplForm({name:"",targetType:"共通",subject:"",body:""});}}>
                {showForm?"閉じる":"＋ 新規"}
              </Btn>
            </div>

            {/* 変数一覧 */}
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"0.75rem",padding:"0.75rem",marginBottom:"1rem",fontSize:"0.75rem",color:"#166534"}}>
              <div style={{fontWeight:700,marginBottom:"0.35rem"}}>使える変数</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem"}}>
                {EMAIL_TEMPLATE_VARS.map(v=>(
                  <code key={v} style={{background:"#dcfce7",borderRadius:"0.3rem",padding:"0.1rem 0.4rem",fontSize:"0.72rem",fontFamily:"monospace"}}>{v}</code>
                ))}
              </div>
            </div>

            {/* 入力フォーム */}
            {showForm&&(
              <div style={{background:"white",border:`1.5px solid ${C.accent}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:"0.85rem",color:C.accent,marginBottom:"0.75rem"}}>{editId?"テンプレートを編集":"新規テンプレート"}</div>
                <FieldLbl label="テンプレート名 *"><Input value={tplForm.name} onChange={e=>setTplForm(p=>({...p,name:e.target.value}))} placeholder="例：初回アプローチ（企業向け）"/></FieldLbl>
                <FieldLbl label="対象種別">
                  <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
                    {["共通","企業","自治体","業者"].map(t=>(
                      <button key={t} onClick={()=>setTplForm(p=>({...p,targetType:t}))}
                        style={{padding:"0.3rem 0.75rem",borderRadius:999,border:`1.5px solid ${tplForm.targetType===t?C.accent:C.border}`,background:tplForm.targetType===t?C.accentBg:"white",color:tplForm.targetType===t?C.accent:C.textSub,fontSize:"0.78rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                        {t}
                      </button>
                    ))}
                  </div>
                </FieldLbl>
                <FieldLbl label="件名 *"><Input value={tplForm.subject} onChange={e=>setTplForm(p=>({...p,subject:e.target.value}))} placeholder="例：【ご挨拶】{{会社名}} ご担当者様"/></FieldLbl>
                <FieldLbl label="本文"><Textarea value={tplForm.body} onChange={e=>setTplForm(p=>({...p,body:e.target.value}))} style={{height:160}} placeholder={"{{会社名}} {{担当者名}} 様\n\nお世話になっております。\n{{自分の名前}}と申します。\n..."}/></FieldLbl>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <Btn variant="secondary" style={{flex:1}} onClick={()=>{setShowTplForm(false);setTplEditId(null);}}>キャンセル</Btn>
                  <Btn style={{flex:2}} onClick={saveTpl} disabled={!tplForm.name.trim()||!tplForm.subject.trim()}>保存</Btn>
                </div>
              </div>
            )}

            {/* テンプレート一覧 */}
            {templates.length===0&&!showForm&&(
              <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.85rem"}}>テンプレートがありません</div>
            )}
            {templates.map(t=>{
              const typeColor={"企業":"#2563eb","自治体":"#059669","業者":"#7c3aed","共通":"#6b7280"}[t.targetType]||"#6b7280";
              return (
                <div key={t.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:"0.875rem",padding:"1rem",marginBottom:"0.75rem",boxShadow:C.shadow}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.4rem"}}>
                    <span style={{fontSize:"0.68rem",fontWeight:800,color:"white",background:typeColor,borderRadius:999,padding:"0.1rem 0.45rem"}}>{t.targetType||"共通"}</span>
                    <span style={{fontWeight:700,fontSize:"0.88rem",color:C.text,flex:1}}>{t.name}</span>
                    <button onClick={()=>startEdit(t)} style={{background:"none",border:"none",cursor:"pointer",fontSize:"0.8rem",color:C.textMuted}}>✏️</button>
                    <button onClick={()=>deleteTpl(t.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:"0.8rem",color:"#dc2626"}}>🗑</button>
                  </div>
                  <div style={{fontSize:"0.75rem",color:C.textSub,marginBottom:"0.25rem"}}>件名: {t.subject}</div>
                  <div style={{fontSize:"0.73rem",color:C.textMuted,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{t.body}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── バックアップ・復元 ── */}
      {section==="backup"&&(()=>{
        // 日付ごとにグループ化
        const grouped = {};
        snapshots.forEach(s=>{
          const d = s.savedAt ? new Date(s.savedAt).toLocaleDateString("ja-JP",{year:"numeric",month:"long",day:"numeric"}) : "不明";
          if(!grouped[d]) grouped[d]=[];
          grouped[d].push(s);
        });
        const days = Object.keys(grouped); // すでに新しい順（reverseされた配列から）

        return (
          <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
            {/* ヘッダー説明 */}
            <div style={{background:"linear-gradient(135deg,#1d4ed8,#2563eb)",borderRadius:"1rem",padding:"1.25rem",color:"white"}}>
              <div style={{fontWeight:800,fontSize:"0.95rem",marginBottom:"0.35rem"}}>🕐 自動バックアップ</div>
              <div style={{fontSize:"0.75rem",opacity:0.9,lineHeight:1.6}}>
                データを保存するたびに<strong>自動で記録</strong>しています（最小3分間隔）。<br/>
                最大100件を保持。任意の時刻のデータに復元できます。
              </div>
            </div>

            {/* メッセージ */}
            {snapMsg&&<div style={{fontSize:"0.82rem",color:snapMsg.startsWith("✅")?"#059669":snapMsg.startsWith("❌")?"#dc2626":"#1d4ed8",background:snapMsg.startsWith("✅")?"#d1fae5":snapMsg.startsWith("❌")?"#fee2e2":"#dbeafe",borderRadius:"0.75rem",padding:"0.625rem 0.875rem"}}>{snapMsg}</div>}

            {/* アクションボタン */}
            <div style={{display:"flex",gap:"0.5rem"}}>
              <button onClick={doBackup} style={{flex:2,padding:"0.7rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
                📌 今すぐ手動保存
              </button>
              <button onClick={loadSnaps} style={{flex:1,padding:"0.7rem",borderRadius:"0.75rem",border:"1px solid "+C.border,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
                {snapLoading?"読込中...":"🔄 更新"}
              </button>
            </div>

            {/* スナップショット一覧（日付グループ） */}
            {!snapshots.length&&!snapLoading&&(
              <div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem",background:"white",borderRadius:"1rem",border:"1px solid "+C.border}}>
                まだ記録がありません。<br/>データを操作すると自動で記録が始まります。
              </div>
            )}
            {snapLoading&&<div style={{textAlign:"center",padding:"1.5rem",color:C.textMuted,fontSize:"0.82rem"}}>読み込み中...</div>}

            {days.map(day=>(
              <div key={day}>
                {/* 日付ヘッダー */}
                <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.375rem",padding:"0 0.25rem"}}>{day}</div>
                <div style={{background:"white",borderRadius:"0.875rem",border:"1px solid "+C.border,overflow:"hidden",boxShadow:C.shadow}}>
                  {grouped[day].map((s,i)=>{
                    const dt = s.savedAt ? new Date(s.savedAt) : null;
                    const timeStr = dt ? dt.toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "";
                    const isManual = !s.auto;
                    return (
                      <div key={s.key||i} style={{display:"flex",alignItems:"center",gap:"0.625rem",padding:"0.625rem 0.875rem",borderBottom:i<grouped[day].length-1?"1px solid "+C.borderLight:"none"}}>
                        {/* 時刻 */}
                        <div style={{flexShrink:0,textAlign:"right",minWidth:52}}>
                          <div style={{fontSize:"0.85rem",fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{timeStr.slice(0,5)}</div>
                          <div style={{fontSize:"0.6rem",color:C.textMuted}}>{timeStr.slice(6)||""}</div>
                        </div>
                        {/* ラベル */}
                        <div style={{flex:1,minWidth:0}}>
                          {isManual
                            ? <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",borderRadius:999,padding:"0.1rem 0.5rem",fontWeight:700}}>📌 手動</span>
                            : <span style={{fontSize:"0.72rem",background:"#f1f5f9",color:"#64748b",borderRadius:999,padding:"0.1rem 0.5rem",fontWeight:600}}>🔄 自動</span>
                          }
                          {s.label&&isManual&&<div style={{fontSize:"0.72rem",color:C.textSub,marginTop:"0.1rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.label}</div>}
                        </div>
                        {/* 復元ボタン */}
                        <button onClick={()=>setRestoreConfirm(s)}
                          style={{flexShrink:0,padding:"0.3rem 0.75rem",borderRadius:"0.5rem",border:"1px solid #d97706",background:"#fef3c7",color:"#92400e",fontSize:"0.72rem",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                          復元
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 復元確認モーダル */}
            {restoreConfirm&&(
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
                <div style={{background:"white",borderRadius:"1.25rem",padding:"1.5rem",maxWidth:340,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                  <div style={{fontSize:"2rem",textAlign:"center",marginBottom:"0.75rem"}}>⏪</div>
                  <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text,marginBottom:"0.5rem",textAlign:"center"}}>このデータを復元しますか？</div>
                  <div style={{textAlign:"center",marginBottom:"0.5rem"}}>
                    <span style={{fontSize:"1.1rem",fontWeight:800,color:C.accent}}>
                      {restoreConfirm.savedAt ? new Date(restoreConfirm.savedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"}) : ""}
                    </span>
                  </div>
                  <div style={{fontSize:"0.75rem",color:"#92400e",marginBottom:"1.25rem",textAlign:"center",background:"#fef3c7",borderRadius:"0.625rem",padding:"0.625rem",lineHeight:1.6}}>
                    ⚠️ 現在のデータは復元で上書きされます。<br/>
                    ただし<strong>復元前のデータは自動退避</strong>されるため、やり直しも可能です。
                  </div>
                  <div style={{display:"flex",gap:"0.625rem"}}>
                    <button onClick={()=>setRestoreConfirm(null)} style={{flex:1,padding:"0.75rem",borderRadius:"0.75rem",border:"1px solid "+C.border,background:"white",color:C.text,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",fontFamily:"inherit"}}>
                      キャンセル
                    </button>
                    <button onClick={()=>doRestore(restoreConfirm)} style={{flex:2,padding:"0.75rem",borderRadius:"0.75rem",border:"none",background:"#dc2626",color:"white",fontWeight:700,fontSize:"0.85rem",cursor:"pointer",fontFamily:"inherit"}}>
                      この時刻に戻す
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 活動ログ ── */}
      {section==="actlog"&&(()=>{
        const logs = [...(data?.changeLogs||[])].sort((a,b)=>new Date(b.date)-new Date(a.date));
        const types = ["all","タスク","プロジェクト","企業","業者","自治体"];
        const filtered = logFilter==="all" ? logs : logs.filter(l=>l.entityType===logFilter);
        const typeColor = {
          "タスク":{bg:"#dbeafe",color:"#1d4ed8"},
          "プロジェクト":{bg:"#ede9fe",color:"#7c3aed"},
          "企業":{bg:"#d1fae5",color:"#059669"},
          "業者":{bg:"#fef3c7",color:"#d97706"},
          "自治体":{bg:"#fce7f3",color:"#db2777"},
        };
        return (
          <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
            <div style={{display:"flex",gap:"0.375rem",flexWrap:"wrap"}}>
              {types.map(t=>(
                <button key={t} onClick={()=>setLogFilter(t)}
                  style={{padding:"0.3rem 0.75rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.73rem",fontWeight:logFilter===t?800:500,background:logFilter===t?C.accent:"white",color:logFilter===t?"white":C.textSub,boxShadow:C.shadow}}>
                  {t==="all"?"すべて":t}
                </button>
              ))}
            </div>
            <div style={{fontSize:"0.72rem",color:C.textMuted}}>{filtered.length}件のログ</div>
            {!filtered.length&&<div style={{textAlign:"center",padding:"2rem",color:C.textMuted,fontSize:"0.82rem"}}>ログがありません</div>}
            {filtered.slice(0,200).map((log,i)=>{
              const user = users.find(u=>u.id===log.userId);
              const tc = typeColor[log.entityType]||{bg:"#f1f5f9",color:"#475569"};
              return (
                <div key={log.id||i} style={{background:"white",borderRadius:"0.875rem",padding:"0.75rem 1rem",border:"1px solid "+C.borderLight,boxShadow:C.shadow}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.3rem",flexWrap:"wrap"}}>
                    <span style={{fontSize:"0.68rem",background:tc.bg,color:tc.color,borderRadius:999,padding:"0.1rem 0.5rem",fontWeight:700,flexShrink:0}}>{log.entityType}</span>
                    <span style={{fontSize:"0.8rem",fontWeight:700,color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.entityName||"—"}</span>
                    <span style={{fontSize:"0.65rem",color:C.textMuted,flexShrink:0}}>{log.date?new Date(log.date).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):""}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"0.375rem",flexWrap:"wrap"}}>
                    <span style={{fontSize:"0.72rem",color:C.textMuted,background:C.bg,borderRadius:"0.375rem",padding:"0.15rem 0.5rem"}}>{log.field}</span>
                    {log.oldVal&&<><span style={{fontSize:"0.72rem",color:"#dc2626",textDecoration:"line-through",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.oldVal}</span><span style={{fontSize:"0.72rem",color:C.textMuted}}>→</span></>}
                    <span style={{fontSize:"0.72rem",color:"#059669",fontWeight:600,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log.newVal||"—"}</span>
                    {user&&<span style={{fontSize:"0.65rem",color:C.textMuted,marginLeft:"auto"}}>👤 {user.name}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
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
  {key:"estimateConfirm", label:"見積り確認"},
  {key:"contract",        label:"成約"},
];
const PAY_KEYS = [["cc","クレジットカード"],["paypay","ペイペイ"],["merpay","メルペイ"],["cash","現金"]];

const DUSTALK_DEF = {hp:0,serviceLog:0,requests:0,contracts:0,revenue:0,lineFriends:0,
  requestsKatei:0,requestsJigyo:0,contractsKatei:0,contractsJigyo:0,
  pay:{cc:0,paypay:0,merpay:0,cash:0},
  exits:{top:0,location:0,requestContent:0,date:0,info:0,confirm:0,complete:0,estimateConfirm:0,contract:0},
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
    partnerStores:raw.partnerStores||[],
    requestsKatei:raw.requestsKatei??0,requestsJigyo:raw.requestsJigyo??0,
    contractsKatei:raw.contractsKatei??0,contractsJigyo:raw.contractsJigyo??0,
    revenueKatei:raw.revenueKatei??0,revenueJigyo:raw.revenueJigyo??0,
    serviceLogKatei:raw.serviceLogKatei??0,serviceLogJigyo:raw.serviceLogJigyo??0};
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


// ── PPTX レポートエクスポート ──────────────────────────────────────────────────
async function exportPPTX(sys, mk, yk, d, prev, allAnalytics) {
  // PptxGenJS ロード（fetch+blob方式でCSP問題を回避）
  if(!window.PptxGenJS){
    const loadPptxGen = async () => {
      const URLS = [
        "https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
        "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
        "https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js",
      ];
      for(const url of URLS){
        try{
          const r = await fetch(url);
          if(!r.ok) continue;
          const js = await r.text();
          // Function コンストラクタで実行（グローバルスコープに展開）
          const fn = new Function(js + "\nreturn typeof PptxGenJS !== 'undefined' ? PptxGenJS : (typeof window.PptxGenJS !== 'undefined' ? window.PptxGenJS : null);");
          const Cls = fn();
          if(Cls){ window.PptxGenJS = Cls; return; }
          // 念のためwindow確認
          if(window.PptxGenJS) return;
        }catch(e){ console.warn('pptxgen load failed:', url, e); }
      }
      throw new Error("全CDNからの読み込みに失敗しました。ネット接続を確認してください。");
    };
    await loadPptxGen();
  }
  if(!window.PptxGenJS){ alert("PPTXライブラリが見つかりません。ページを再読み込みしてください。"); return; }
  const pres = new window.PptxGenJS();
  pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
  pres.title = "分析レポート";

  const label = sys==="bizcon" ? `${yk}年` : mk.replace("-","年")+"月";
  const sysLabel = {dustalk:"DUSTALK",rebit:"Rebit",bizcon:"ビジコン",beenet:"bee-net"}[sys]||sys;

  // カラー
  const NAVY="1E2A3A", BLUE="2563EB", GREEN="059669", AMBER="D97706", RED="DC2626";
  const LGRAY="F1F5F9", WHITE="FFFFFF", DGRAY="64748B";

  // ── ヘルパー ──
  const fmt=(n,unit="")=>n==null?"—":(+n||0).toLocaleString()+unit;
  const diffColor=(cur,prv)=>cur>prv?GREEN:cur<prv?RED:DGRAY;
  const diffTxt=(cur,prv)=>{const d=cur-prv;return (d>0?"+":"")+d.toLocaleString();};

  // 過去N月のデータ
  const getMonthsBefore=(mk,n)=>{
    const [y,m]=mk.split("-").map(Number);
    const months=[];
    for(let i=n-1;i>=0;i--){
      let cm=m-i; let cy=y;
      while(cm<=0){cm+=12;cy--;}
      months.push(`${cy}-${String(cm).padStart(2,"0")}`);
    }
    return months;
  };
  const MONTHS6=getMonthsBefore(mk,6);
  const sysData=allAnalytics[sys]||{};
  const getD=key=>{
    if(sys==="dustalk") return {hp:0,lineFriends:0,serviceLog:0,requests:0,contracts:0,revenue:0,pay:{cc:0,paypay:0,merpay:0,cash:0},exits:{top:0,location:0,requestContent:0,date:0,info:0,confirm:0,complete:0,estimateConfirm:0,contract:0},...(sysData[key]||{})};
    return {monthly:0,cumulative:0,hp:0,...(sysData[key]||{})};
  };

  // ── スライド1: 表紙 ──
  {
    const s=pres.addSlide();
    s.background={color:NAVY};
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:4.5,w:10,h:1.125,fill:{color:BLUE},line:{color:BLUE}});
    s.addText(sysLabel+" 分析レポート",{x:0.6,y:1.2,w:8.8,h:1.2,fontSize:40,fontFace:"Arial",bold:true,color:WHITE});
    s.addText(label,{x:0.6,y:2.5,w:5,h:0.7,fontSize:22,fontFace:"Arial",color:"93C5FD"});
    s.addText("MyDesk 自動生成レポート",{x:0.6,y:4.6,w:6,h:0.5,fontSize:13,fontFace:"Arial",color:"BFDBFE"});
    s.addText(new Date().toLocaleDateString("ja-JP")+" 作成",{x:6,y:4.6,w:3.4,h:0.5,fontSize:12,fontFace:"Arial",color:"BFDBFE",align:"right"});
  }

  if(sys==="dustalk"){
    const prev6=MONTHS6.map(k=>getD(k));

    // ── スライド2: KPIサマリー ──
    {
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("📊 月次KPIサマリー  — "+label,{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});

      const kpis=[
        {lbl:"HP閲覧数",val:fmt(d.hp,"PV"),cur:+d.hp||0,prv:+prev.hp||0},
        {lbl:"LINE友達",val:fmt(d.lineFriends,"人"),cur:+d.lineFriends||0,prv:+prev.lineFriends||0},
        {lbl:"依頼数",val:fmt(d.requests,"件"),cur:+d.requests||0,prv:+prev.requests||0},
        {lbl:"成約数",val:fmt(d.contracts,"件"),cur:+d.contracts||0,prv:+prev.contracts||0},
        {lbl:"売上",val:fmt(d.revenue,"円"),cur:+d.revenue||0,prv:+prev.revenue||0},
        {lbl:"成約率",val:d.requests>0?((d.contracts/d.requests)*100).toFixed(1)+"%":"—",cur:0,prv:0},
      ];
      kpis.forEach((k,i)=>{
        const col=i%3; const row=Math.floor(i/3);
        const x=0.3+col*3.22; const y=1.05+row*2.15;
        const cw=2.9; const ch=1.9;
        s.addShape(pres.shapes.RECTANGLE,{x,y,w:cw,h:ch,fill:{color:WHITE},shadow:{type:"outer",blur:4,offset:2,angle:135,color:"000000",opacity:0.1}});
        s.addText(k.lbl,{x:x+0.1,y:y+0.12,w:cw-0.2,h:0.36,fontSize:11,fontFace:"Arial",color:DGRAY});
        s.addText(k.val,{x:x+0.1,y:y+0.45,w:cw-0.2,h:0.72,fontSize:28,fontFace:"Arial",bold:true,color:NAVY,valign:"middle"});
        if(k.cur||k.prv){
          const dc=diffColor(k.cur,k.prv);
          s.addText(diffTxt(k.cur,k.prv)+" vs先月",{x:x+0.1,y:y+1.4,w:cw-0.2,h:0.36,fontSize:10,fontFace:"Arial",color:dc,bold:true});
        }
      });
    }

    // ── スライド3: 6ヶ月トレンド（棒グラフ） ──
    {
      const s=pres.addSlide();
      s.background={color:"FFFFFF"};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("📈 依頼・成約数 6ヶ月推移",{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const labels6=MONTHS6.map(k=>k.replace(/^20\d\d-/,"")||k);
      const reqs6=prev6.map(m=>+m.requests||0);
      const cons6=prev6.map(m=>+m.contracts||0);
      s.addChart(pres.charts.BAR,[
        {name:"依頼数",labels:labels6,values:reqs6},
        {name:"成約数",labels:labels6,values:cons6},
      ],{
        x:0.4,y:1.05,w:9.2,h:4.1,barDir:"col",barGapWidthPct:60,
        chartColors:[BLUE,GREEN],
        chartArea:{fill:{color:"FFFFFF"},roundedCorners:false},
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,
        valGridLine:{color:"E2E8F0",size:0.5},catGridLine:{style:"none"},
        showValue:true,dataLabelColor:"1E293B",dataLabelFontSize:10,
        showLegend:true,legendPos:"t",legendFontSize:11,
      });
    }

    // ── スライド4: 支払方法内訳 ──
    {
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("💳 支払方法内訳 — "+label,{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const payData=[];const payLabels=[];
      [["cc","クレカ"],["paypay","ペイペイ"],["merpay","メルペイ"],["cash","現金"]].forEach(([k,lbl])=>{
        payLabels.push(lbl); payData.push(+d.pay?.[k]||0);
      });
      const payTotal=payData.reduce((a,b)=>a+b,0);
      if(payTotal>0){
        s.addChart(pres.charts.DOUGHNUT,[{name:"支払方法",labels:payLabels,values:payData}],{
          x:0.5,y:1.0,w:5,h:4.2,
          chartColors:[BLUE,GREEN,AMBER,"0891B2"],
          showPercent:true,showLegend:true,legendPos:"r",legendFontSize:13,
          dataLabelFontSize:13,dataLabelColor:WHITE,dataLabelBold:true,
        });
      } else {
        s.addText("データなし",{x:2,y:2.5,w:6,h:1,fontSize:20,fontFace:"Arial",color:DGRAY,align:"center"});
      }
      // 表
      const tbl=[[{text:"支払方法",options:{fill:{color:NAVY},color:WHITE,bold:true}},{text:"件数",options:{fill:{color:NAVY},color:WHITE,bold:true}},{text:"比率",options:{fill:{color:NAVY},color:WHITE,bold:true}}]];
      payLabels.forEach((lbl,i)=>{
        const pct=payTotal>0?((payData[i]/payTotal)*100).toFixed(1)+"%":"—";
        tbl.push([lbl,String(payData[i]),pct]);
      });
      s.addTable(tbl,{x:5.8,y:1.2,w:3.8,colW:[1.8,1.0,1.0],border:{pt:0.5,color:"D1D5DB"},fontSize:12,fontFace:"Arial"});
    }

    // ── スライド5: 離脱率ファネル ──
    {
      const s=pres.addSlide();
      s.background={color:"FFFFFF"};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("🚪 依頼フロー 離脱率（人数ベース）",{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      s.addText("※上の依頼件数とは異なり、人数ベースで集計しています（1人が複数件出す場合も1人でカウント）",{x:0.4,y:0.95,w:9.2,h:0.35,fontSize:9.5,fontFace:"Arial",color:"7C3AED"});
      const steps=["トップ","回収場所","依頼内容","希望日","申込者","依頼確認","依頼完了","見積確認","成約"];
      const exitKeys=["top","location","requestContent","date","info","confirm","complete","estimateConfirm","contract"];
      const vals=exitKeys.map(k=>+d.exits?.[k]||0);
      s.addChart(pres.charts.BAR,[{name:"到達人数",labels:steps,values:vals}],{
        x:0.4,y:1.35,w:9.2,h:3.8,barDir:"col",barGapWidthPct:40,
        chartColors:[BLUE],chartArea:{fill:{color:"FFFFFF"},roundedCorners:false},
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,
        valGridLine:{color:"E2E8F0",size:0.5},catGridLine:{style:"none"},
        showValue:true,dataLabelColor:"1E293B",dataLabelFontSize:10,
        showLegend:false,
      });
      s.addText("人数ベース集計 ｜ 到達率はトップ画面を基準",{x:0.4,y:5.35,w:9,h:0.25,fontSize:9,fontFace:"Arial",color:DGRAY});
    }

    // ── スライド6: 先月比較サマリー ──
    {
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("📊 先月比較",{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const compRows=[
        ["指標","今月","先月","増減"],
        ["HP閲覧数",fmt(d.hp,"PV"),fmt(prev.hp,"PV"),diffTxt(+d.hp||0,+prev.hp||0)],
        ["LINE友達",fmt(d.lineFriends,"人"),fmt(prev.lineFriends,"人"),diffTxt(+d.lineFriends||0,+prev.lineFriends||0)],
        ["依頼数",fmt(d.requests,"件"),fmt(prev.requests,"件"),diffTxt(+d.requests||0,+prev.requests||0)],
        ["成約数",fmt(d.contracts,"件"),fmt(prev.contracts,"件"),diffTxt(+d.contracts||0,+prev.contracts||0)],
        ["売上",fmt(d.revenue,"円"),fmt(prev.revenue,"円"),diffTxt(+d.revenue||0,+prev.revenue||0)],
      ];
      const tblData=compRows.map((r,ri)=>r.map((c,ci)=>{
        const isHdr=ri===0||ci===0;
        const isInc=ri>0&&ci===3&&(+d[["","hp","lineFriends","requests","contracts","revenue"][ri]||0]||0)>(+prev[["","hp","lineFriends","requests","contracts","revenue"][ri]||0]||0);
        const isDec=ri>0&&ci===3&&(+d[["","hp","lineFriends","requests","contracts","revenue"][ri]||0]||0)<(+prev[["","hp","lineFriends","requests","contracts","revenue"][ri]||0]||0);
        return {text:String(c),options:{fill:{color:isHdr?(ci===0?NAVY:BLUE):"FFFFFF"},color:isHdr?WHITE:(isDec?RED:isInc?GREEN:"1E293B"),bold:isHdr,fontSize:13,fontFace:"Arial",align:ci===0?"left":"center"}};
      }));
      s.addTable(tblData,{x:1.5,y:1.1,w:7,colW:[2.2,1.6,1.6,1.6],border:{pt:0.5,color:"D1D5DB"}});
    }
  } else if(sys==="rebit"){
    // Rebit: 累積/月間スライド
    const s=pres.addSlide();
    s.background={color:LGRAY};
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.9,fill:{color:NAVY},line:{color:NAVY}});
    s.addText("Rebit KPI — "+label,{x:0.4,y:0,w:9,h:0.9,fontSize:16,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
    s.addShape(pres.shapes.RECTANGLE,{x:0.5,y:1.1,w:4.2,h:1.8,fill:{color:WHITE},shadow:{type:"outer",blur:4,offset:2,angle:135,color:"000000",opacity:0.1}});
    s.addText("累積ユーザー数",{x:0.6,y:1.2,w:4,h:0.4,fontSize:12,fontFace:"Arial",color:DGRAY});
    s.addText(fmt(d.cumulative,"人"),{x:0.6,y:1.6,w:4,h:0.9,fontSize:36,fontFace:"Arial",bold:true,color:BLUE,valign:"middle"});
    s.addShape(pres.shapes.RECTANGLE,{x:5.3,y:1.1,w:4.2,h:1.8,fill:{color:WHITE},shadow:{type:"outer",blur:4,offset:2,angle:135,color:"000000",opacity:0.1}});
    s.addText("月間ユーザー数",{x:5.4,y:1.2,w:4,h:0.4,fontSize:12,fontFace:"Arial",color:DGRAY});
    s.addText(fmt(d.monthly,"人"),{x:5.4,y:1.6,w:4,h:0.9,fontSize:36,fontFace:"Arial",bold:true,color:GREEN,valign:"middle"});
    const months6=getMonthsBefore(mk,6);
    const monthly6=months6.map(k=>(+((sysData[k]||{}).monthly)||0));
    s.addChart(pres.charts.LINE,[{name:"月間UU",labels:months6.map(k=>k.replace("20","")),values:monthly6}],{
      x:0.4,y:3.1,w:9.2,h:2.2,lineSize:3,lineSmooth:true,
      chartColors:[GREEN],chartArea:{fill:{color:"FFFFFF"}},
      catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,
      showValue:true,showLegend:false,
    });
  }

  // 保存
  const fileName=`${sysLabel}_${label}分析レポート.pptx`;
  await pres.writeFile({fileName});
}

// ── 月次比較レポート: 各月1枚スライド（改良版）──────────────────────────────
async function exportMultiMonthPPTX(sys, currentMk, allAnalytics) {
  const sysLabelMap = {dustalk:"DUSTALK",rebit:"Rebit",bizcon:"BizCon",beenet:"BeeNet"};
  const sysLabel = sysLabelMap[sys] || sys;
  const NAVY="1E2A3A", BLUE="2563EB", GREEN="059669", AMBER="D97706", RED="DC2626", PURPLE="7C3AED";
  const WHITE="FFFFFF", LGRAY="F8FAFC", DGRAY="64748B", LBLUE="EFF6FF";

  // PptxGenJS ロード（fetch+blob方式でCSP問題を回避）
  if(!window.PptxGenJS){
    const loadPptxGen = async () => {
      const URLS = [
        "https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
        "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
        "https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js",
      ];
      for(const url of URLS){
        try{
          const r = await fetch(url);
          if(!r.ok) continue;
          const js = await r.text();
          // Function コンストラクタで実行（グローバルスコープに展開）
          const fn = new Function(js + "\nreturn typeof PptxGenJS !== 'undefined' ? PptxGenJS : (typeof window.PptxGenJS !== 'undefined' ? window.PptxGenJS : null);");
          const Cls = fn();
          if(Cls){ window.PptxGenJS = Cls; return; }
          // 念のためwindow確認
          if(window.PptxGenJS) return;
        }catch(e){ console.warn('pptxgen load failed:', url, e); }
      }
      throw new Error("全CDNからの読み込みに失敗しました。ネット接続を確認してください。");
    };
    await loadPptxGen();
  }
  if(!window.PptxGenJS){ alert("PPTXライブラリが見つかりません。ページを再読み込みしてください。"); return; }
  const pres=new window.PptxGenJS();
  pres.layout="LAYOUT_WIDE"; // 10x5.63inch

  const sysData=allAnalytics?.[sys]||{};
  const months=[];
  for(let i=11;i>=0;i--) months.push(shiftMonth(currentMk,-i));
  const availMonths=months.filter(k=>sysData[k]);
  if(!availMonths.length){
    alert(`月次比較レポートを出力するには、分析タブで${sysLabel}のデータを1ヶ月以上入力して「保存」してください。\n現在選択中: ${monthLabel(currentMk)}`);
    return;
  }

  const fmt=(v,unit="")=>{if(v===undefined||v===null||v==="")return "—";const n=Number(v);if(isNaN(n))return String(v);if(unit==="円"&&n>=10000)return (n/10000).toFixed(1)+"万円";return n.toLocaleString()+unit;};
  const diffTxt=(cur,prv)=>{if(!prv)return "";const d=cur-prv;return (d>=0?"+":"")+d.toLocaleString();};
  const diffColor=(cur,prv)=>cur>=prv?GREEN:RED;

  // ── 表紙 ──
  {
    const s=pres.addSlide();
    s.background={color:NAVY};
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:2.2,w:10,h:0.08,fill:{color:BLUE},line:{color:BLUE}});
    s.addText(sysLabel,{x:0.6,y:0.7,w:8.8,h:0.8,fontSize:13,fontFace:"Arial",color:"93C5FD",bold:false});
    s.addText("月次レポート",{x:0.6,y:1.3,w:8.8,h:1.1,fontSize:42,fontFace:"Arial",bold:true,color:WHITE});
    s.addText(`${availMonths[0].replace("-","年")}月 〜 ${availMonths[availMonths.length-1].replace("-","年")}月　計${availMonths.length}ヶ月`,
      {x:0.6,y:2.5,w:8.8,h:0.5,fontSize:16,fontFace:"Arial",color:"93C5FD"});
    s.addText("各月1枚 ｜ 月次トレンド比較",{x:0.6,y:4.8,w:8.8,h:0.4,fontSize:11,fontFace:"Arial",color:"475569"});
  }

  // ── DUSTALK ──
  if(sys==="dustalk"){
    // 月次サマリー比較表
    if(availMonths.length>1){
      const s=pres.addSlide();
      s.background={color:WHITE};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.75,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("📊 月次推移サマリー",{x:0.35,y:0,w:9.3,h:0.75,fontSize:17,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const cols=["月","HP閲覧(PV)","LINE友達","依頼数","成約数","売上","CV率"];
      const hdrRow=cols.map(c=>({text:c,options:{fill:{color:NAVY},color:WHITE,bold:true,fontSize:10,fontFace:"Arial",align:"center",valign:"middle"}}));
      const tblData=[hdrRow];
      availMonths.forEach((k,i)=>{
        const d=sysData[k]||{};
        const prev=sysData[availMonths[i-1]]||{};
        const cvRate=d.requests>0?((+d.contracts/+d.requests)*100).toFixed(1)+"%":"—";
        const mk=(v,pv,unit)=>{
          const cur=+v||0; const prv=+pv||0;
          const delta=i>0&&prv>0?` (${cur>=prv?"+":""}${(cur-prv).toLocaleString()})`:""
          return {text:fmt(v,unit)+delta,options:{fontSize:9,fontFace:"Arial",align:"right",color:i>0&&prv>0?(cur>=prv?"1E3A2F":"7F1D1D"):"1E293B"}};
        };
        tblData.push([
          {text:k.replace("20","").replace("-","/"),options:{bold:true,fontSize:10,fontFace:"Arial",fill:{color:i%2===0?"F8FAFC":WHITE}}},
          mk(d.hp,prev.hp,"PV"),mk(d.lineFriends,prev.lineFriends,"人"),
          mk(d.requests,prev.requests,"件"),mk(d.contracts,prev.contracts,"件"),
          mk(d.revenue,prev.revenue,"円"),{text:cvRate,options:{fontSize:9,fontFace:"Arial",align:"center"}},
        ]);
      });
      s.addTable(tblData,{x:0.2,y:0.85,w:9.6,colW:[1.1,1.6,1.4,1.3,1.3,1.8,1.1],border:{pt:0.4,color:"E2E8F0"},rowH:0.38});
    }

    // 依頼数・成約数グラフスライド
    if(availMonths.length>1){
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.75,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("📈 依頼数・成約数 月次推移",{x:0.35,y:0,w:9.3,h:0.75,fontSize:17,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const labels=availMonths.map(k=>k.replace("20","").replace("-","/"));
      const reqs=availMonths.map(k=>+(sysData[k]?.requests||0));
      const cnts=availMonths.map(k=>+(sysData[k]?.contracts||0));
      const hps=availMonths.map(k=>+(sysData[k]?.hp||0));
      s.addChart(pres.charts.BAR,[
        {name:"依頼数",labels,values:reqs},
        {name:"成約数",labels,values:cnts},
      ],{x:0.3,y:0.85,w:6.0,h:4.5,barDir:"col",barGapWidthPct:25,
        chartColors:[BLUE,GREEN],chartArea:{fill:{color:WHITE}},
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,
        valGridLine:{color:"E2E8F0",size:0.5},catGridLine:{style:"none"},
        showValue:true,dataLabelFontSize:9,showLegend:true,legendPos:"t",legendFontSize:10,
      });
      s.addChart(pres.charts.LINE,[{name:"HP閲覧(PV)",labels,values:hps}],{
        x:6.5,y:0.85,w:3.2,h:4.5,lineSize:2.5,lineSmooth:true,
        chartColors:[AMBER],chartArea:{fill:{color:WHITE}},
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,
        showValue:true,dataLabelFontSize:8,showLegend:true,legendPos:"t",legendFontSize:10,
      });
    }

    // 各月1枚スライド
    availMonths.forEach((mk2,i)=>{
      const d=sysData[mk2]||{};
      const prev=i>0?sysData[availMonths[i-1]]||{}:{};
      const label=mk2.replace("-","年")+"月";
      const s=pres.addSlide();
      s.background={color:WHITE};

      // ヘッダー
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.72,fill:{color:NAVY},line:{color:NAVY}});
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0.72,w:10,h:0.06,fill:{color:BLUE},line:{color:BLUE}});
      s.addText(`${sysLabel}  ${label}`,{x:0.35,y:0,w:7,h:0.72,fontSize:18,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      s.addText(`${i+1} / ${availMonths.length}`,{x:8.8,y:0,w:1,h:0.72,fontSize:11,fontFace:"Arial",color:"93C5FD",align:"right",valign:"middle"});

      // KPIカード4枚
      const kpis=[
        {label:"HP閲覧数",val:fmt(d.hp,"PV"),cur:+d.hp||0,prv:+prev.hp||0,color:BLUE,icon:"🌐"},
        {label:"依頼数",val:fmt(d.requests,"件"),cur:+d.requests||0,prv:+prev.requests||0,color:GREEN,icon:"📋"},
        {label:"成約数",val:fmt(d.contracts,"件"),cur:+d.contracts||0,prv:+prev.contracts||0,color:AMBER,icon:"✅"},
        {label:"売上",val:fmt(d.revenue,"円"),cur:+d.revenue||0,prv:+prev.revenue||0,color:PURPLE,icon:"💴"},
      ];
      kpis.forEach((kpi,ki)=>{
        const x=0.25+ki*2.4; const y=0.88; const w=2.25; const h=1.15;
        s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:LGRAY},line:{color:"E2E8F0",pt:0.8},rectRadius:0.08});
        s.addText(kpi.icon+" "+kpi.label,{x:x+0.1,y:y+0.08,w:w-0.2,h:0.28,fontSize:9,fontFace:"Arial",color:DGRAY});
        s.addText(kpi.val,{x:x+0.1,y:y+0.3,w:w-0.2,h:0.55,fontSize:21,fontFace:"Arial",bold:true,color:kpi.color,valign:"middle"});
        if(i>0&&kpi.prv>0){
          const delta=kpi.cur-kpi.prv;
          const sign=delta>=0?"+":"";
          s.addText(`前月比 ${sign}${delta.toLocaleString()}`,{x:x+0.1,y:y+0.84,w:w-0.2,h:0.24,fontSize:8.5,fontFace:"Arial",color:delta>=0?GREEN:RED});
        }
      });

      // CV率
      const cvRate=+d.requests>0?((+d.contracts/+d.requests)*100).toFixed(1)+"%":"—";
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:9.5,y:0.88,w:0.4,h:1.15,fill:{color:LBLUE},line:{color:"BFDBFE",pt:0.8},rectRadius:0.04});
      s.addText("CV\n"+cvRate,{x:9.5,y:0.9,w:0.4,h:1.1,fontSize:7,fontFace:"Arial",bold:true,color:BLUE,align:"center",valign:"middle"});

      // 離脱率ファネル（左半分）
      s.addShape(pres.shapes.RECTANGLE,{x:0.25,y:2.18,w:5.0,h:0.32,fill:{color:"334155"},line:{color:"334155"}});
      s.addText("🚪 依頼フロー 離脱率（人数ベース）",{x:0.3,y:2.18,w:4.9,h:0.32,fontSize:9.5,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      s.addText("※件数ベースの依頼数と異なり、1人=1カウント",{x:0.3,y:2.52,w:4.9,h:0.22,fontSize:7.5,fontFace:"Arial",color:PURPLE});
      const exitSteps=[
        {k:"top",l:"トップ画面"},{k:"location",l:"場所入力"},{k:"requestContent",l:"依頼内容"},
        {k:"date",l:"希望日入力"},{k:"complete",l:"依頼完了"},{k:"estimateConfirm",l:"見積確認"},{k:"contract",l:"成約"}
      ];
      const exitVals=exitSteps.map(es=>+(d.exits?.[es.k]||0));
      const topV=exitVals[0]||1;
      exitSteps.forEach((step,si)=>{
        const v=exitVals[si]; const nextV=exitVals[si+1];
        const pct=topV>0?(v/topV*100).toFixed(0):0;
        const exitRate=v>0&&nextV!=null?((v-nextV)/v*100).toFixed(0):null;
        const barW=4.7*(v/Math.max(topV,1));
        const y2=2.78+si*0.38;
        const barColor=si===0?BLUE:si===exitSteps.length-1?GREEN:pct<40?"EF4444":"3B82F6";
        s.addShape(pres.shapes.RECTANGLE,{x:0.25,y:y2,w:Math.max(barW,0.08),h:0.28,fill:{color:barColor},line:{color:"none"}});
        s.addShape(pres.shapes.RECTANGLE,{x:0.25,y:y2,w:4.7,h:0.28,fill:{color:"none"},line:{color:"E2E8F0",pt:0.5}});
        s.addText(`${step.l}  ${v.toLocaleString()}人 (${pct}%)${exitRate&&si<exitSteps.length-1?`  ↓離脱${exitRate}%`:""}`,
          {x:0.28,y:y2+0.03,w:4.65,h:0.24,fontSize:8,fontFace:"Arial",color:"1E293B",bold:si===0});
      });

      // 支払い内訳（右半分）
      const payLabels=["クレカ","ペイペイ","メルペイ","現金"];
      const payKeys=["cc","paypay","merpay","cash"];
      const payVals=payKeys.map(k=>+(d.pay?.[k]||0));
      const payTotal=payVals.reduce((a,b)=>a+b,0);
      s.addShape(pres.shapes.RECTANGLE,{x:5.5,y:2.18,w:4.25,h:0.32,fill:{color:"334155"},line:{color:"334155"}});
      s.addText("💳 支払い内訳",{x:5.55,y:2.18,w:4.15,h:0.32,fontSize:9.5,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      if(payTotal>0){
        s.addChart(pres.charts.DOUGHNUT,[{name:"支払",labels:payLabels,values:payVals}],{
          x:5.4,y:2.5,w:4.35,h:2.9,
          chartColors:[BLUE,"06B6D4",GREEN,AMBER],
          showLabel:true,showPercent:true,dataLabelFontSize:10,dataLabelColor:"1E293B",
          showLegend:true,legendPos:"r",legendFontSize:9,
          chartArea:{fill:{color:WHITE}},
        });
      } else {
        s.addText("データなし",{x:5.5,y:3.5,w:4.2,h:0.5,fontSize:12,fontFace:"Arial",color:DGRAY,align:"center"});
      }

      // フッター
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:5.4,w:10,h:0.23,fill:{color:"F1F5F9"},line:{color:"E2E8F0"}});
      s.addText(`${sysLabel} 月次レポート  ｜  ${label}  ｜  自動生成`,{x:0.3,y:5.42,w:9.4,h:0.19,fontSize:7.5,fontFace:"Arial",color:DGRAY});
    });
  }

  // ── REBIT ──
  else if(sys==="rebit"){
    if(availMonths.length>1){
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.75,fill:{color:NAVY},line:{color:NAVY}});
      s.addText("Rebit 月次推移",{x:0.35,y:0,w:9.3,h:0.75,fontSize:17,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      const labels=availMonths.map(k=>k.replace("20","").replace("-","/"));
      const monthly=availMonths.map(k=>+(sysData[k]?.monthly||0));
      const cumulative=availMonths.map(k=>+(sysData[k]?.cumulative||0));
      s.addChart(pres.charts.BAR,[{name:"月間UU",labels,values:monthly}],{
        x:0.3,y:0.9,w:5.8,h:4.4,barDir:"col",barGapWidthPct:30,chartColors:[GREEN],
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,showValue:true,showLegend:true,legendPos:"t",
        chartArea:{fill:{color:WHITE}},
      });
      s.addChart(pres.charts.LINE,[{name:"累積UU",labels,values:cumulative}],{
        x:6.2,y:0.9,w:3.5,h:4.4,lineSize:3,lineSmooth:true,chartColors:[BLUE],
        catAxisLabelColor:DGRAY,valAxisLabelColor:DGRAY,showValue:true,showLegend:true,legendPos:"t",
        chartArea:{fill:{color:WHITE}},
      });
    }
    availMonths.forEach((mk2,i)=>{
      const d=sysData[mk2]||{};
      const prev=i>0?sysData[availMonths[i-1]]||{}:{};
      const s=pres.addSlide();
      s.background={color:LGRAY};
      s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.75,fill:{color:NAVY},line:{color:NAVY}});
      s.addText(`Rebit — ${mk2.replace("-","年")}月`,{x:0.35,y:0,w:9,h:0.75,fontSize:17,fontFace:"Arial",bold:true,color:WHITE,valign:"middle"});
      [[0.4,"累積ユーザー数",d.cumulative,prev.cumulative,BLUE],[5.3,"月間ユーザー数",d.monthly,prev.monthly,GREEN]].forEach(([x,lbl,val,pval,col])=>{
        s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:1.0,w:4.2,h:2.0,fill:{color:WHITE},line:{color:"E2E8F0",pt:0.8},rectRadius:0.1});
        s.addText(lbl,{x:x+0.2,y:1.15,w:3.8,h:0.35,fontSize:11,fontFace:"Arial",color:DGRAY});
        s.addText(fmt(val,"人"),{x:x+0.2,y:1.5,w:3.8,h:0.85,fontSize:36,fontFace:"Arial",bold:true,color:col,valign:"middle"});
        if(i>0&&+pval>0){const delta=+val-+pval;s.addText(`前月比 ${delta>=0?"+":""}${delta.toLocaleString()}人`,{x:x+0.2,y:2.6,w:3.8,h:0.28,fontSize:9.5,fontFace:"Arial",color:delta>=0?GREEN:RED});}
      });
    });
  }

  const fileName=`${sysLabel}_月次比較レポート_${currentMk}.pptx`;
  await pres.writeFile({fileName});
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
  const convRateK = d.requestsKatei>0 ? ((d.contractsKatei/d.requestsKatei)*100).toFixed(1) : "－";
  const convRateJ = d.requestsJigyo>0 ? ((d.contractsJigyo/d.requestsJigyo)*100).toFixed(1) : "－";
  const avgPriceK = d.contractsKatei>0 ? Math.round(d.revenueKatei/d.contractsKatei).toLocaleString() : "－";
  const avgPriceJ = d.contractsJigyo>0 ? Math.round(d.revenueJigyo/d.contractsJigyo).toLocaleString() : "－";
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
            <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
              {!editing
                ? <>
                    <Btn size="sm" onClick={startEdit}>✏️ 編集</Btn>
                    <button onClick={async()=>{try{await exportPPTX(sys,mk,yk,d,prev,data.analytics||{});}catch(e){alert("レポート出力に失敗しました:\n"+e.message);}}}
                      style={{padding:"0.3rem 0.625rem",borderRadius:"0.5rem",border:"1px solid #7c3aed30",background:"#f5f3ff",color:"#7c3aed",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"0.25rem"}}>
                      📊 PPTXレポート
                    </button>
                    <button onClick={async()=>{try{await exportMultiMonthPPTX(sys,mk,data.analytics||{});}catch(e){alert("月次レポート出力に失敗しました:\n"+e.message);}}}
                      style={{padding:"0.3rem 0.625rem",borderRadius:"0.5rem",border:"1px solid #059669",background:"#d1fae5",color:"#065f46",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"0.25rem"}}>
                      📅 月次比較レポート
                    </button>
                  </>
                : <div style={{display:"flex",gap:"0.4rem"}}>
                    <Btn size="sm" variant="secondary" onClick={cancel}>キャンセル</Btn>
                    <Btn size="sm" onClick={saveEdit}>💾 保存</Btn>
                  </div>
              }
            </div>
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
                {/* サービスログ合計（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>サービスログ（合計）</span>
                  {editing?<InputNum value={d.serviceLog??0} onChange={v=>setD({serviceLog:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.serviceLog||0).toLocaleString()}件<DiffBadge cur={+d.serviceLog||0} prv={+prev.serviceLog||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("serviceLog")}</div>
                </div>
                {/* サービスログ 家庭/事業内訳 */}
                {editing&&(<div style={{background:"#f0f9ff",borderRadius:"0.5rem",padding:"0.5rem 0.75rem",marginBottom:"0.35rem"}}>
                  <div style={{fontSize:"0.65rem",fontWeight:700,color:"#0369a1",marginBottom:"0.25rem"}}>サービスログ内訳</div>
                  <div style={{display:"flex",gap:"1rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}><span style={{fontSize:"0.78rem",color:C.text}}>家庭系</span><InputNum value={d.serviceLogKatei??0} onChange={v=>{const j=+(d.serviceLogJigyo||0);setD({serviceLogKatei:v,serviceLog:v+j});}}/></div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}><span style={{fontSize:"0.78rem",color:C.text}}>事業系</span><InputNum value={d.serviceLogJigyo??0} onChange={v=>{const k=+(d.serviceLogKatei||0);setD({serviceLogJigyo:v,serviceLog:k+v});}}/></div>
                  </div>
                </div>)}
                {!editing&&(d.serviceLogKatei||d.serviceLogJigyo)?(<div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.5rem"}}>
                  <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.1rem 0.4rem",borderRadius:999}}>家庭系: {+d.serviceLogKatei||0}件</span>
                  <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.1rem 0.4rem",borderRadius:999}}>事業系: {+d.serviceLogJigyo||0}件</span>
                </div>):null}
                {/* 依頼数（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>依頼数（合計）</span>
                  {editing?<InputNum value={d.requests??0} onChange={v=>setD({requests:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.requests||0).toLocaleString()}件<DiffBadge cur={+d.requests||0} prv={+prev.requests||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("requests")}</div>
                </div>
                {/* 依頼数内訳（家庭系/事業系）*/}
                {editing&&(
                  <div style={{background:"#f0f9ff",borderRadius:"0.5rem",padding:"0.5rem 0.75rem",marginBottom:"0.35rem"}}>
                    <div style={{fontSize:"0.65rem",fontWeight:700,color:"#0369a1",marginBottom:"0.25rem"}}>📊 依頼数内訳（入力すると合計に自動反映）</div>
                    <div style={{display:"flex",gap:"1rem"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                        <span style={{fontSize:"0.78rem",color:C.text}}>家庭系</span>
                        <InputNum value={d.requestsKatei??0} onChange={v=>{const j=+(d.requestsJigyo||0);setD({requestsKatei:v,requests:v+j});}}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                        <span style={{fontSize:"0.78rem",color:C.text}}>事業系</span>
                        <InputNum value={d.requestsJigyo??0} onChange={v=>{const k=+(d.requestsKatei||0);setD({requestsJigyo:v,requests:k+v});}}/>
                      </div>
                    </div>
                  </div>
                )}
                {!editing&&(d.requestsKatei||d.requestsJigyo)?(
                  <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.5rem"}}>
                    <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.1rem 0.4rem",borderRadius:999}}>家庭系: {+d.requestsKatei||0}件</span>
                    <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.1rem 0.4rem",borderRadius:999}}>事業系: {+d.requestsJigyo||0}件</span>
                  </div>
                ):null}
                {/* 成約数（展開式）*/}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>成約数（合計）</span>
                  {editing?<InputNum value={d.contracts??0} onChange={v=>setD({contracts:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>{(+d.contracts||0).toLocaleString()}件<DiffBadge cur={+d.contracts||0} prv={+prev.contracts||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("contracts")}</div>
                </div>
                {/* 成約数内訳（家庭系/事業系）*/}
                {editing&&(
                  <div style={{background:"#f0fdf4",borderRadius:"0.5rem",padding:"0.5rem 0.75rem",marginBottom:"0.35rem"}}>
                    <div style={{fontSize:"0.65rem",fontWeight:700,color:"#065f46",marginBottom:"0.25rem"}}>📊 成約数内訳</div>
                    <div style={{display:"flex",gap:"1rem"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                        <span style={{fontSize:"0.78rem",color:C.text}}>家庭系</span>
                        <InputNum value={d.contractsKatei??0} onChange={v=>{const j=+(d.contractsJigyo||0);setD({contractsKatei:v,contracts:v+j});}}/>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
                        <span style={{fontSize:"0.78rem",color:C.text}}>事業系</span>
                        <InputNum value={d.contractsJigyo??0} onChange={v=>{const k=+(d.contractsKatei||0);setD({contractsJigyo:v,contracts:k+v});}}/>
                      </div>
                    </div>
                  </div>
                )}
                {!editing&&(d.contractsKatei||d.contractsJigyo)?(
                  <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.5rem"}}>
                    <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.1rem 0.4rem",borderRadius:999}}>家庭系: {+d.contractsKatei||0}件</span>
                    <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.1rem 0.4rem",borderRadius:999}}>事業系: {+d.contractsJigyo||0}件</span>
                  </div>
                ):null}
                {/* 成約率（計算） */}
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>成約率（合計）</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>成約数 ÷ 依頼数 × 100</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{convRate==="－"?"－":convRate+"%"}</span>
                </div>
                {/* 成約率 家庭/事業 */}
                <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.25rem"}}>
                  <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.15rem 0.5rem",borderRadius:999,fontWeight:700}}>家庭系: {convRateK==="－"?"－":convRateK+"%"}</span>
                  <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.15rem 0.5rem",borderRadius:999,fontWeight:700}}>事業系: {convRateJ==="－"?"－":convRateJ+"%"}</span>
                </div>
                {/* 売上合計 */}
                <div style={{...rowStyle,flexWrap:"wrap"}}>
                  <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>売上（合計）</span>
                  {editing?<InputNum value={d.revenue??0} onChange={v=>setD({revenue:v})}/>:<span style={{fontSize:"1rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center"}}>¥{(+d.revenue||0).toLocaleString()}<DiffBadge cur={+d.revenue||0} prv={+prev.revenue||0}/></span>}
                  <div style={{width:"100%",paddingTop:"0.25rem"}}>{renderPartnerStores("revenue")}</div>
                </div>
                {/* 売上 家庭/事業内訳 */}
                {editing&&(<div style={{background:"#f0fdf4",borderRadius:"0.5rem",padding:"0.5rem 0.75rem",marginBottom:"0.35rem"}}>
                  <div style={{fontSize:"0.65rem",fontWeight:700,color:"#065f46",marginBottom:"0.25rem"}}>売上内訳（入力すると合計に自動反映）</div>
                  <div style={{display:"flex",gap:"1rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}><span style={{fontSize:"0.78rem",color:C.text}}>家庭系 ¥</span><InputNum value={d.revenueKatei??0} onChange={v=>{const j=+(d.revenueJigyo||0);setD({revenueKatei:v,revenue:v+j});}}/></div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}><span style={{fontSize:"0.78rem",color:C.text}}>事業系 ¥</span><InputNum value={d.revenueJigyo??0} onChange={v=>{const k=+(d.revenueKatei||0);setD({revenueJigyo:v,revenue:k+v});}}/></div>
                  </div>
                </div>)}
                {!editing&&(d.revenueKatei||d.revenueJigyo)?(<div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.5rem"}}>
                  <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.1rem 0.4rem",borderRadius:999}}>家庭系: ¥{(+d.revenueKatei||0).toLocaleString()}</span>
                  <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.1rem 0.4rem",borderRadius:999}}>事業系: ¥{(+d.revenueJigyo||0).toLocaleString()}</span>
                </div>):null}
                {/* 成約平均単価（計算） */}
                <div style={{...rowStyle}}>
                  <div style={{flex:1}}><span style={{fontSize:"0.87rem",color:C.text}}>成約平均単価（合計）</span><div style={{fontSize:"0.68rem",color:C.textMuted}}>売上 ÷ 成約数</div></div>
                  <span style={{fontSize:"1rem",fontWeight:700,color:C.blue}}>{avgPrice==="－"?"－":avgPrice+"円"}</span>
                </div>
                {/* 成約平均単価 家庭/事業 */}
                <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.35rem",paddingLeft:"0.25rem"}}>
                  <span style={{fontSize:"0.72rem",background:"#dbeafe",color:"#1d4ed8",padding:"0.15rem 0.5rem",borderRadius:999,fontWeight:700}}>家庭系: {avgPriceK==="－"?"－":avgPriceK+"円"}</span>
                  <span style={{fontSize:"0.72rem",background:"#d1fae5",color:"#065f46",padding:"0.15rem 0.5rem",borderRadius:999,fontWeight:700}}>事業系: {avgPriceJ==="－"?"－":avgPriceJ+"円"}</span>
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
                  <div style={{flex:1}}>
                  <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>離脱率管理</div>
                  <div style={{fontSize:"0.63rem",color:"#7c3aed",fontWeight:600,marginBottom:"0.35rem",background:"#f5f3ff",borderRadius:"0.4rem",padding:"0.3rem 0.625rem",display:"block",border:"1px solid #ddd6fe"}}>
                    👤 <strong>人数ベース集計</strong> — 上記の依頼件数・成約数は「件数ベース」（同一人物の複数依頼を別件でカウント）。<br/>
                    この離脱率管理表は「人数ベース」で集計しており、1人が2件依頼した場合でも1人としてカウントしています。
                  </div>
                </div>
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
                {!editing&&exitBase>0&&<div style={{padding:"0.4rem 0",fontSize:"0.68rem",color:C.textMuted,textAlign:"right"}}>※到達率はトップ画面({exitBase.toLocaleString()}人)を基準 ｜ 人数ベース集計</div>}
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
  // 通知フォールバック用にcurrentUserIdをwindowに保存
  React.useEffect(()=>{ window.__myDeskCurrentUserId = currentUser?.id||""; },[currentUser?.id]);
  const [tab,setTab]         = useState(()=>localStorage.getItem("md_tab")||"tasks");
  const [salesTab,setSalesTab]=useState(()=>localStorage.getItem("md_salesTab")||"muni");
  const [taskTab,setTaskTab]  =useState(()=>localStorage.getItem("md_taskTab")||"info");
  const [navTarget,setNavTarget]=useState(null); // {type:'task'|'project'|'company'|'vendor'|'muni', id}
  const [salesNavTarget,setSalesNavTarget]=useState(null);

  // Route navTarget to correct tab
  React.useEffect(()=>{
    if(!navTarget) return;
    if(navTarget.type==="task"||navTarget.type==="project") return; // handled by TaskView
    if(navTarget.type==="company"){persistTab("md_tab","sales",setTab);persistTab("md_salesTab","company",setSalesTab);setSalesNavTarget({...navTarget});}
    else if(navTarget.type==="vendor"){persistTab("md_tab","sales",setTab);persistTab("md_salesTab","vendor",setSalesTab);setSalesNavTarget({...navTarget});}
    else if(navTarget.type==="muni"){persistTab("md_tab","sales",setTab);persistTab("md_salesTab","muni",setSalesTab);setSalesNavTarget({...navTarget});}
    // task/project: navTarget はそのまま維持し、TaskViewのuseEffectで処理させる
    // タブ切り替え後にTaskViewがマウントされてから処理されるよう、clearNavTargetはTaskView側で呼ぶ
  },[navTarget]);
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
    // ── Service Worker 登録（バックグラウンドプッシュ通知に必須）──
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[MyDesk] SW registered:', reg.scope))
        .catch(err => console.warn('[MyDesk] SW registration failed:', err));
    }

    const session = getSession();
    Promise.all([loadData(), loadUsers()]).then(([result,u])=>{
      const d = (result && result.data) ? result.data : INIT;
      if(result?.updated_at) window.__myDeskLastSaveAt = result.updated_at;
      // 重複IDを起動時に修復（CSVインポートの不具合で発生した場合）
      const seenM = new Set(); let mChanged = false;
      const fixedM = (d.municipalities||[]).map(m=>{
        if(seenM.has(String(m.id))){mChanged=true;return{...m,id:"m_"+Date.now()+"_"+Math.random().toString(36).substr(2,9)};}
        seenM.add(String(m.id)); return m;
      });
      const seenV = new Set(); let vChanged = false;
      const fixedV = (d.vendors||[]).map(v=>{
        if(seenV.has(String(v.id))){vChanged=true;return{...v,id:"v_"+Date.now()+"_"+Math.random().toString(36).substr(2,9)};}
        seenV.add(String(v.id)); return v;
      });
      const fixed = (mChanged||vChanged) ? {...d,municipalities:fixedM,vendors:fixedV} : d;
      if(mChanged||vChanged) saveData(fixed);
      setData(fixed); setUsers(u);
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
        const [result, u] = await Promise.all([loadData(), loadUsers()]);
        const d = (result && result.data) ? result.data : null;
        const serverUpdatedAt = result?.updated_at;
        if(!d) { setUsers(u); return; } // データ取得失敗時はスキップ
        // ── ポーリング受信データの空チェック ─────────────────────────────
        // サーバーから空データが返ってきた場合は現在のデータを保持する
        const POLL_GUARD_KEYS = ["tasks","projects","companies","vendors","municipalities","businessCards"];
        const serverHasContent = POLL_GUARD_KEYS.some(k => Array.isArray(d[k]) && d[k].length > 0);
        const localHasContent  = POLL_GUARD_KEYS.some(k => Array.isArray(data[k]) && data[k].length > 0);
        if (localHasContent && !serverHasContent) {
          console.warn("MyDesk: poll skipped — server returned empty data while local has content");
          setUsers(u); return;
        }
        // 自分が最後にsaveした時刻との比較で上書き判定
        const timeSinceSave = Date.now() - (window.__myDeskLastSave || 0);
        // サーバーのupdated_atが自分の最終保存より新しい（他ユーザーの更新）場合のみ反映
        // または自分の保存から十分時間が経過している場合は反映
        const serverIsNewer = (() => {
          // updated_at が両方揃っている場合：サーバーが新しい場合のみ更新
          if(serverUpdatedAt && window.__myDeskLastSaveAt) {
            return serverUpdatedAt > window.__myDeskLastSaveAt;
          }
          // 自分がsaveしてから5秒以上経過、またはまだ一度もsaveしていない
          if(!window.__myDeskLastSave) return true; // 初回
          return timeSinceSave > 5000;
        })();
        if(serverIsNewer) {
          setData(d);
          if(serverUpdatedAt) window.__myDeskLastSaveAt = serverUpdatedAt;
        }
        setUsers(u);
        // セッションユーザーの最新情報を反映
        const fresh = u.find(x=>x.id===currentUser.id);
        if(fresh) setCurrentUser(cu=>(cu.name===fresh.name&&cu.email===fresh.email)?cu:fresh);

        // ── ブラウザ通知表示ヘルパー ─────────────────────────────────────
        const showNotif = (n) => {
          if (Notification.permission !== 'granted') return;
          try {
            new Notification(n.title || 'MyDesk', {
              body: n.body || '',
              icon: '/icon-192.png',
              tag: String(n.id || Date.now()),
              renotify: true,
            });
          } catch(e) { console.warn('[MyDesk] Notification error:', e); }
        };

        // ── 新着通知をブラウザ通知で表示 ──────────────────────────────────
        const myNotifs = (d.notifications||[]).filter(n=>
          n.toUserId===currentUser.id || n.toUserId==='__all__'
        );

        if(lastNotifIdsRef.current === null) {
          // 初回: ページロード時点の未読通知を最大3件表示
          const unread = myNotifs.filter(n => !n.read).slice(0, 3);
          unread.forEach(showNotif);
        } else {
          // 2回目以降: 前回から新しく追加された未読通知を表示
          const prevIds = lastNotifIdsRef.current;
          const brandNew = myNotifs.filter(n => !prevIds.has(n.id) && !n.read);
          brandNew.slice(0, 3).forEach(showNotif);
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
    if (!nd || typeof nd !== "object" || Array.isArray(nd)) {
      console.error("MyDesk: SalesView saveWithPush rejected invalid data"); return;
    }
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
    // ── ① 通知許可を取得 ──────────────────────────────────────────────────
    if (!('Notification' in window)) {
      console.warn('[MyDesk] Notification API 非対応');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      console.warn('[MyDesk] 通知許可が拒否されました');
      return false;
    }

    // ── ② iPhoneはPWA(ホーム画面追加)必須 ───────────────────────────────
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (isIos && !isStandalone) {
      alert('iPhoneで通知を受け取るには\nSafari → 共有 →「ホーム画面に追加」してから\nアプリとして起動してください。');
      return false;
    }

    // ── ③ Service Worker 登録 & Push購読 ────────────────────────────────
    if (!('serviceWorker' in navigator)) {
      console.warn('[MyDesk] ServiceWorker 非対応');
      return true; // 許可だけでポーリング通知は動く
    }
    try {
      // SWを確実に登録・更新
      const swReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await swReg.update(); // 最新のsw.jsを必ず使う
      const reg = await navigator.serviceWorker.ready;

      if (!reg.pushManager) {
        console.warn('[MyDesk] pushManager 非対応（このブラウザはWeb Push未対応）');
        return true;
      }

      // 既存の購読があっても必ずSupabaseに保存し直す（デプロイ後のリセット対策）
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
        });
      }

      // ── ④ Supabaseに購読情報を保存 ──────────────────────────────────
      const subs = (await sbGet('push_subs')) || {};
      subs[userId] = sub.toJSON();
      await sbSet('push_subs', subs);
      console.log('[MyDesk] ✅ Push購読を保存しました userId:', userId, 'endpoint:', sub.endpoint.slice(-20));
      return true;
    } catch(e) {
      console.error('[MyDesk] Push購読に失敗:', e.name, e.message);
      // 購読失敗でも許可があればポーリング通知は動く
      return Notification.permission === 'granted';
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
    // プッシュ購読状態を正確に確認（pushManager.getSubscription()で実際の登録を確認）
    const checkPushStatus = async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') {
        setPushEnabled(false); return;
      }
      if (!('serviceWorker' in navigator)) { setPushEnabled(true); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager?.getSubscription();
        // 購読オブジェクトがあればON、なければ再登録が必要
        if (sub) {
          setPushEnabled(true);
        } else {
          // 許可はあるが購読なし → 自動で再購読
          const ok = await subscribePush(currentUser.id);
          setPushEnabled(!!ok);
        }
      } catch { setPushEnabled(Notification.permission === 'granted'); }
    };
    checkPushStatus();
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
                        else{const ok=await subscribePush(currentUser.id);if(ok)setPushEnabled(true);else alert('通知の許可が必要です。ブラウザの設定から通知を許可してください。\niPhone: ホーム画面に追加してからアプリとして起動してONにしてください。');}
                      }} style={{padding:"0.3rem 0.875rem",borderRadius:999,border:`2px solid ${pushEnabled?"#059669":"#dc2626"}`,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.75rem",background:pushEnabled?"#d1fae5":"#fff1f2",color:pushEnabled?"#065f46":"#dc2626",transition:"all 0.15s"}}>
                        {pushEnabled?"✅ ON":"❌ OFF"}
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
                return filtered.map(n=>{
                  // entityTypeがなくてもtypeから推測してナビゲーション
                  // entityType を決定（既存通知への後方互換フォールバック）
                  const resolvedEType = n.entityType || (
                    (n.type==="task_assign"||n.type==="task_status"||n.type==="task_comment"||n.type==="deadline") ? "task" :
                    n.type==="memo" ? null :
                    n.type==="sales_assign" ? (n.body==="企業"?"company":n.body==="業者"?"vendor":n.body==="自治体"?"muni":null) :
                    null
                  );
                  // entityId がない場合 title から entity を逆引き
                  const resolvedEntityId = n.entityId || (()=>{
                    if(!resolvedEType) return null;
                    const titleMatch = n.title?.match(/「(.+?)」/);
                    const nm = titleMatch?.[1];
                    if(!nm) return null;
                    if(resolvedEType==="company") return (data.companies||[]).find(c=>c.name===nm)?.id||null;
                    if(resolvedEType==="vendor")  return (data.vendors||[]).find(v=>v.name===nm)?.id||null;
                    if(resolvedEType==="muni")    return (data.municipalities||[]).find(m=>m.name===nm)?.id||null;
                    if(resolvedEType==="task")    return (data.tasks||[]).find(t=>t.title===nm)?.id||null;
                    return null;
                  })();
                  const hasNav = !!(resolvedEntityId && resolvedEType);
                  const handleNotifClick = () => {
                    // 既読にする
                    if(!n.read){const nd={...data,notifications:(data.notifications||[]).map(x=>x.id===n.id?{...x,read:true}:x)};setData(nd);saveData(nd);}
                    if(!resolvedEntityId || !resolvedEType) return;
                    setShowNotifPanel(false);
                    const ts = Date.now();
                    if(resolvedEType==="task") {
                      setTab("tasks"); localStorage.setItem("md_tab","tasks");
                      setTimeout(()=>setNavTarget({type:"task",id:resolvedEntityId,ts}),300);
                    } else if(resolvedEType==="project") {
                      setTab("tasks"); localStorage.setItem("md_tab","tasks");
                      setTimeout(()=>setNavTarget({type:"project",id:resolvedEntityId,ts}),300);
                    } else if(resolvedEType==="company") {
                      setTab("sales"); localStorage.setItem("md_tab","sales");
                      setTimeout(()=>setSalesNavTarget({type:"company",id:resolvedEntityId,ts}),300);
                    } else if(resolvedEType==="vendor") {
                      setTab("sales"); localStorage.setItem("md_tab","sales");
                      setTimeout(()=>setSalesNavTarget({type:"vendor",id:resolvedEntityId,ts}),300);
                    } else if(resolvedEType==="muni") {
                      setTab("sales"); localStorage.setItem("md_tab","sales");
                      setTimeout(()=>setSalesNavTarget({type:"muni",id:resolvedEntityId,ts}),300);
                    }
                  };
                  return (
                  <div key={n.id} onClick={handleNotifClick}
                    style={{padding:"0.75rem 1rem",borderBottom:`1px solid ${C.borderLight}`,background:n.read?"white":"#eff6ff",display:"flex",gap:"0.625rem",alignItems:"flex-start",cursor:"pointer"}}>
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
                  );
                });
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
              onNavigateToProject={(id)=>{setNavTarget({type:"project",id});persistTab("md_tab","tasks",setTab);}}
              onNavigateToCompany={(id)=>{setNavTarget({type:"company",id});persistTab("md_tab","sales",setTab);}}
              onNavigateToVendor={(id)=>{setNavTarget({type:"vendor",id});persistTab("md_tab","sales",setTab);}}
              onNavigateToMuni={(id,prefId)=>{setNavTarget({type:"muni",id,prefId});persistTab("md_tab","sales",setTab);}}
              salesNavTarget={salesNavTarget} clearSalesNavTarget={()=>setSalesNavTarget(null)}/>}
            {tab==="analytics" && <AnalyticsView data={data} setData={setData} currentUser={currentUser} users={users} saveWithPush={saveWithPush}/>}
            {tab==="mypage"    && <MyPageView currentUser={currentUser} setCurrentUser={setCurrentUser} users={users} setUsers={setUsers} onLogout={handleLogout} pushEnabled={pushEnabled} setPushEnabled={setPushEnabled} subscribePush={subscribePush} unsubscribePush={unsubscribePush} data={data} setData={setData}/>}
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
