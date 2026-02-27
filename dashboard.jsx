import { useState, useEffect, useRef } from "react";

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
const SB_KEY = "sb_publishable_7mnHP6lGylXBN3GZPqyrsQ_K5ytV1SW";
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
async function saveData(d) { sbSet("main", d); }

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
      <div style={{position:"relative",background:"white",borderRadius:"1.5rem 1.5rem 0 0",padding:"1.5rem 1.25rem 2.5rem",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 -8px 40px rgba(0,0,0,0.18)"}}>
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
      await saveUsers([...users,nu]);
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
          {task.dueDate&&<span style={{fontSize:"0.7rem",color:near&&!done?"#2563eb":C.textMuted,fontWeight:near&&!done?700:400}}>📅{task.dueDate}</span>}
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
    // Notify other assignees + task creator (excluding self)
    const toIds = [...new Set([...(task.assignees||[]), task.createdBy].filter(i=>i&&i!==uid))];
    if(toIds.length) nd = addNotif(nd,{type:"task_comment",title:`「${task.title}」にコメントが追加されました`,body:text.slice(0,60),toUserIds:toIds,fromUserId:uid});
    setData(nd); saveData(nd); setText("");
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
function TaskView({data,setData,users=[],currentUser=null,taskTab,setTaskTab,pjTab,setPjTab}) {
  const uid = currentUser?.id;
  const [screen,setScreen] = useState("list");
  const [activePjId,setActivePjId] = useState(null);
  const [activeTaskId,setActiveTaskId] = useState(null);
  const [fromProject,setFromProject] = useState(null);
  const [sheet,setSheet] = useState(null);
  const [tMemoIn,setTMemoIn]= useState({});
  const [tChatIn,setTChatIn]= useState({});

  const allTasks    = data.tasks    || [];
  const allProjects = data.projects || [];

  const visibleTasks    = allTasks.filter(t=>canSee(t,uid));
  const visibleProjects = allProjects.filter(p=>canSee(p,uid));

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
    setData(nd); saveData(nd);
  };
  const addTask    = (f,pjId=null) => {
    const item={id:Date.now(),...f,projectId:pjId,createdBy:uid,comments:[],memos:[],chat:[],createdAt:new Date().toISOString()};
    let nd={...data,tasks:[...allTasks,item]};
    // Notify assignees on creation
    const toIds=(f.assignees||[]).filter(i=>i!==uid);
    if(toIds.length) nd=addNotif(nd,{type:"task_assign",title:`「${item.title}」に担当者として追加されました`,body:"",toUserIds:toIds,fromUserId:uid});
    setData(nd); saveData(nd);
  };
  const deleteTask = id => { const u={...data,tasks:allTasks.filter(t=>t.id!==id)}; setData(u); saveData(u); };
  const addProject = (f) => {
    const item={id:Date.now(),...f,createdBy:uid,memos:[],chat:[],createdAt:new Date().toISOString()};
    const u={...data,projects:[...allProjects,item]}; setData(u); saveData(u);
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
    setData(nd); saveData(nd);
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
    setData(nd); saveData(nd);
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
  const TChatSection = ({entityKey,entityId,chat=[]}) => (
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
      <div style={{display:"flex",gap:"0.4rem"}}>
        <input value={tChatIn[entityId]||""} onChange={e=>setTChatIn(p=>({...p,[entityId]:e.target.value}))}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addTChat(entityKey,entityId,tChatIn[entityId]||"");}}}
          placeholder="コメントを追加... (@名前 でメンション)"
          style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
        <button onClick={()=>addTChat(entityKey,entityId,tChatIn[entityId]||"")} disabled={!(tChatIn[entityId]||"").trim()}
          style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:(tChatIn[entityId]||"").trim()?1:0.4}}>
          送信
        </button>
      </div>
    </div>
  );

  const activePj   = allProjects.find(p=>p.id===activePjId);
  const activeTask = allTasks.find(t=>t.id===activeTaskId);

  const standaloneTasks = visibleTasks.filter(t=>!t.projectId);
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
    const TASK_TABS=[["info","📋","情報"],["memo","📝","メモ"],["chat","💬","チャット"]];
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
    const PJ_TABS=[["tasks","📋","タスク"],["memo","📝","メモ"],["chat","💬","チャット"]];
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
              {activePjTasks.length===0&&donePjTasks.length===0&&(
                <div style={{padding:"2rem",textAlign:"center",color:C.textMuted,fontSize:"0.85rem"}}>タスクなし</div>
              )}
              {activePjTasks.map(t=>(
                <TaskRow key={t.id} task={t} users={users}
                  onToggle={()=>updateTask(t.id,{status:"完了"})}
                  onStatusChange={s=>updateTask(t.id,{status:s})}
                  onClick={()=>{setActiveTaskId(t.id);setFromProject(activePjId);setScreen("taskDetail");setTaskTab("info");}}/>
              ))}
              {donePjTasks.length>0&&<>
                <div style={{padding:"0.45rem 1rem",background:C.bg,borderTop:`1px solid ${C.border}`}}>
                  <span style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,textTransform:"uppercase"}}>完了 · {donePjTasks.length}件</span>
                </div>
                {donePjTasks.map(t=>(
                  <TaskRow key={t.id} task={t} users={users}
                    onToggle={()=>updateTask(t.id,{status:"未着手"})}
                    onStatusChange={s=>updateTask(t.id,{status:s})}
                    onClick={()=>{setActiveTaskId(t.id);setFromProject(activePjId);setScreen("taskDetail");setTaskTab("info");}}/>
                ))}
              </>}
            </Card>
            <Btn variant="danger" size="sm" onClick={()=>{if(window.confirm("プロジェクトとタスクをすべて削除しますか？")){deleteProject(activePj.id);setScreen("list");}}}>🗑 プロジェクトを削除</Btn>
          </div>
        )}
        {/* メモタブ */}
        {pjTab==="memo"&&TMemoSection({entityKey:"projects",entityId:activePj.id,memos:activePj.memos||[]})}
        {/* チャットタブ */}
        {pjTab==="chat"&&TChatSection({entityKey:"projects",entityId:activePj.id,chat:activePj.chat||[]})}
        {sheet==="addPjTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
          <TaskForm initial={{status:"未着手"}} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{addTask(f,activePjId);setSheet(null);}}/>
        </Sheet>}
        {sheet==="editProject"&&<Sheet title="プロジェクトを編集" onClose={()=>setSheet(null)}>
          <ProjectForm initial={activePj} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
            onSave={f=>{updateProject(activePj.id,f);setSheet(null);}}/>
        </Sheet>}
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
        {visibleProjects.length>0&&activeStandalone.length>0&&(
          <div style={{padding:"0.4rem 1rem",background:C.bg,borderBottom:`1px solid ${C.borderLight}`}}>
            <span style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.05em"}}>タスク</span>
          </div>
        )}
        {activeStandalone.map(t=>(
          <TaskRow key={t.id} task={t} users={users}
            onToggle={()=>updateTask(t.id,{status:"完了"})}
            onStatusChange={s=>updateTask(t.id,{status:s})}
            onClick={()=>{setActiveTaskId(t.id);setFromProject(null);setScreen("taskDetail");}}/>
        ))}
        {doneStandalone.length>0&&<>
          <div style={{padding:"0.45rem 1rem",background:C.bg,borderTop:`1px solid ${C.border}`}}>
            <span style={{fontSize:"0.7rem",fontWeight:700,color:C.textMuted,textTransform:"uppercase"}}>完了 · {doneStandalone.length}件</span>
          </div>
          {doneStandalone.map(t=>(
            <TaskRow key={t.id} task={t} users={users}
              onToggle={()=>updateTask(t.id,{status:"未着手"})}
              onStatusChange={s=>updateTask(t.id,{status:s})}
              onClick={()=>{setActiveTaskId(t.id);setFromProject(null);setScreen("taskDetail");}}/>
          ))}
        </>}
      </Card>
      {sheet==="addTask"&&<Sheet title="タスクを追加" onClose={()=>setSheet(null)}>
        <TaskForm initial={{status:"未着手"}} users={users} currentUserId={uid} onClose={()=>setSheet(null)}
          onSave={f=>{addTask(f,null);setSheet(null);}}/>
      </Sheet>}
      {sheet==="addProject"&&<Sheet title="プロジェクトを追加" onClose={()=>setSheet(null)}>
        <ProjectForm users={users} currentUserId={uid} onClose={()=>setSheet(null)}
          onSave={f=>{addProject(f);setSheet(null);}}/>
      </Sheet>}
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

      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,messages:[{role:"user",content:prompt}]})
      });
      const json = await res.json();
      setGenerated((json.content?.map(c=>c.text||"").join("")||"生成に失敗しました。").trim());
      setPhase("edit");
    } catch { setGenerated("生成に失敗しました。再試行してください。"); setPhase("edit"); }
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

const MUNI_SEED_DATA = [
  ['福岡県','北九州市','小倉\n北九州',1],
  ['佐賀県','佐賀市','久留米',1],
  ['長崎県','長崎市','長崎',1],
  ['熊本県','熊本市中央区','熊本',1],
  ['大分県','大分市','大分',0],
  ['宮崎県','宮崎市','宮崎',1],
  ['鹿児島県','鹿児島市','鹿児島',1],
  ['沖縄県','那覇市','沖縄',1],
  ['佐賀県','唐津市','福岡西',1],
  ['長崎県','佐世保市','長崎',1],
  ['大分県','別府市','大分',1],
  ['宮崎県','都城市','宮崎',1],
  ['鹿児島県','鹿屋市','鹿児島',1],
  ['沖縄県','宜野湾市','沖縄',0],
  ['佐賀県','鳥栖市','久留米',0],
  ['長崎県','島原市','長崎',1],
  ['大分県','中津市','小倉',1],
  ['宮崎県','延岡市','宮崎',0],
  ['鹿児島県','枕崎市','鹿児島',0],
  ['沖縄県','石垣市','沖縄',0],
  ['佐賀県','多久市','久留米',0],
  ['長崎県','諫早市','長崎',1],
  ['大分県','日田市','大分',0],
  ['宮崎県','日南市','宮崎',1],
  ['鹿児島県','阿久根市','鹿児島',0],
  ['沖縄県','浦添市','沖縄',0],
  ['佐賀県','伊万里市','久留米',0],
  ['長崎県','大村市','長崎',1],
  ['大分県','佐伯市','大分',0],
  ['宮崎県','小林市','宮崎',0],
  ['鹿児島県','出水市','鹿児島',0],
  ['沖縄県','名護市','沖縄',0],
  ['佐賀県','武雄市','久留米',0],
  ['長崎県','平戸市','長崎',0],
  ['熊本県','八代市','熊本',1],
  ['大分県','臼杵市','大分',0],
  ['宮崎県','日向市','宮崎',0],
  ['鹿児島県','指宿市','鹿児島',0],
  ['沖縄県','糸満市','沖縄南',0],
  ['佐賀県','鹿島市','久留米',0],
  ['長崎県','松浦市','長崎',1],
  ['熊本県','人吉市','熊本',0],
  ['大分県','津久見市','大分',0],
  ['宮崎県','串間市','宮崎',0],
  ['鹿児島県','西之表市','鹿児島',0],
  ['沖縄県','沖縄市','沖縄',1],
  ['福岡県','福岡市','福岡\n福岡南\n福岡西',0],
  ['佐賀県','小城市','久留米',1],
  ['長崎県','対馬市','福岡',0],
  ['熊本県','荒尾市','熊本',0],
  ['大分県','竹田市','大分',0],
  ['宮崎県','西都市','宮崎',1],
  ['鹿児島県','垂水市','鹿児島',0],
  ['沖縄県','豊見城市','沖縄南',0],
  ['佐賀県','嬉野市','久留米',0],
  ['長崎県','壱岐市','福岡',0],
  ['熊本県','水俣市','熊本',0],
  ['大分県','豊後高田市','大分',1],
  ['宮崎県','えびの市','宮崎',0],
  ['鹿児島県','薩摩川内市','鹿児島',0],
  ['沖縄県','うるま市','沖縄',0],
  ['佐賀県','神埼市','久留米',0],
  ['長崎県','五島市','長崎',0],
  ['熊本県','玉名市','熊本',0],
  ['大分県','杵築市','大分',1],
  ['宮崎県','北諸県郡三股町','宮崎',1],
  ['鹿児島県','日置市','鹿児島',0],
  ['沖縄県','宮古島市','沖縄',0],
  ['佐賀県','神埼郡吉野ヶ里町','久留米',0],
  ['長崎県','西海市','長崎',0],
  ['熊本県','山鹿市','熊本',0],
  ['大分県','宇佐市','大分',1],
  ['宮崎県','西諸県郡高原町','宮崎',0],
  ['鹿児島県','曽於市','鹿児島',0],
  ['沖縄県','南城市','沖縄南',0],
  ['佐賀県','三養基郡基山町','久留米',0],
  ['長崎県','雲仙市','長崎',0],
  ['熊本県','菊池市','熊本',0],
  ['大分県','豊後大野市','大分',0],
  ['宮崎県','東諸県郡国富町','宮崎',0],
  ['鹿児島県','霧島市','鹿児島',1],
  ['沖縄県','国頭郡国頭村','沖縄',0],
  ['佐賀県','三養基郡上峰町','久留米',0],
  ['長崎県','南島原市','長崎',0],
  ['熊本県','宇土市','熊本',0],
  ['大分県','由布市','大分',0],
  ['宮崎県','東諸県郡綾町','宮崎',0],
  ['鹿児島県','いちき串木野市','鹿児島',0],
  ['沖縄県','国頭郡大宜味村','沖縄',0],
  ['佐賀県','三養基郡みやき町','久留米',0],
  ['長崎県','西彼杵郡長与町','長崎',1],
  ['熊本県','上天草市','熊本',0],
  ['大分県','国東市','大分',1],
  ['宮崎県','児湯郡高鍋町','宮崎',1],
  ['鹿児島県','南さつま市','鹿児島',0],
  ['沖縄県','国頭郡東村','沖縄',0],
  ['福岡県','大牟田市','久留米',0],
  ['佐賀県','東松浦郡玄海町','福岡西',0],
  ['長崎県','西彼杵郡時津町','長崎',1],
  ['熊本県','宇城市','熊本',1],
  ['大分県','東国東郡姫島村','大分',0],
  ['宮崎県','児湯郡新富町','宮崎',0],
  ['鹿児島県','志布志市','鹿児島',0],
  ['沖縄県','国頭郡今帰仁村','沖縄',0],
  ['福岡県','久留米市','久留米',0],
  ['佐賀県','西松浦郡有田町','久留米',0],
  ['長崎県','東彼杵郡東彼杵町','長崎',0],
  ['熊本県','阿蘇市','熊本',0],
  ['大分県','速見郡日出町','大分',1],
  ['宮崎県','児湯郡西米良村','宮崎',0],
  ['鹿児島県','奄美市','鹿児島',0],
  ['沖縄県','国頭郡本部町','沖縄',0],
  ['福岡県','直方市','北九州',1],
  ['佐賀県','杵島郡大町町','久留米',0],
  ['長崎県','東彼杵郡川棚町','長崎',0],
  ['熊本県','天草市','熊本',0],
  ['大分県','玖珠郡九重町','大分',0],
  ['宮崎県','児湯郡木城町','宮崎',0],
  ['鹿児島県','南九州市','鹿児島',0],
  ['沖縄県','国頭郡恩納村','沖縄',0],
  ['福岡県','飯塚市','北九州',1],
  ['佐賀県','杵島郡江北町','久留米',0],
  ['長崎県','東彼杵郡波佐見町','長崎',0],
  ['熊本県','合志市','熊本',0],
  ['大分県','玖珠郡玖珠町','大分',0],
  ['宮崎県','児湯郡川南町','宮崎',0],
  ['鹿児島県','伊佐市','鹿児島',0],
  ['沖縄県','国頭郡宜野座村','沖縄',0],
  ['福岡県','田川市','小倉',1],
  ['佐賀県','杵島郡白石町','久留米',0],
  ['長崎県','北松浦郡小値賀町','長崎',0],
  ['熊本県','下益城郡美里町','熊本',0],
  ['宮崎県','児湯郡都農町','宮崎',0],
  ['鹿児島県','姶良市','鹿児島',1],
  ['沖縄県','国頭郡金武町','沖縄',0],
  ['福岡県','柳川市','久留米',1],
  ['佐賀県','藤津郡太良町','久留米',0],
  ['長崎県','北松浦郡佐々町','長崎',1],
  ['熊本県','玉名郡玉東町','熊本',0],
  ['宮崎県','東臼杵郡門川町','宮崎',1],
  ['鹿児島県','鹿児島郡三島村','鹿児島',0],
  ['沖縄県','国頭郡伊江村','沖縄',0],
  ['福岡県','八女市','久留米',0],
  ['長崎県','南松浦郡新上五島町','長崎',0],
  ['熊本県','玉名郡南関町','熊本',0],
  ['宮崎県','東臼杵郡諸塚村','宮崎',0],
  ['鹿児島県','鹿児島郡十島村','鹿児島',0],
  ['沖縄県','中頭郡読谷村','沖縄',0],
  ['福岡県','筑後市','久留米',1],
  ['熊本県','玉名郡長洲町','熊本',0],
  ['宮崎県','東臼杵郡椎葉村','宮崎',0],
  ['鹿児島県','薩摩郡さつま町','鹿児島',0],
  ['沖縄県','中頭郡嘉手納町','沖縄',0],
  ['福岡県','大川市','久留米',0],
  ['熊本県','玉名郡和水町','熊本',0],
  ['宮崎県','東臼杵郡美郷町','宮崎',0],
  ['鹿児島県','出水郡長島町','鹿児島',0],
  ['沖縄県','中頭郡北谷町','沖縄',0],
  ['福岡県','行橋市','小倉',1],
  ['熊本県','菊池郡大津町','熊本',1],
  ['宮崎県','西臼杵郡高千穂町','宮崎',0],
  ['鹿児島県','姶良郡湧水町','鹿児島',0],
  ['沖縄県','中頭郡北中城村','沖縄',0],
  ['福岡県','豊前市','小倉',1],
  ['熊本県','菊池郡菊陽町','熊本',0],
  ['宮崎県','西臼杵郡日之影町','宮崎',0],
  ['鹿児島県','曽於郡大崎町','鹿児島',0],
  ['沖縄県','中頭郡中城村','沖縄',0],
  ['福岡県','中間市','北九州',0],
  ['熊本県','阿蘇郡南小国町','熊本',0],
  ['宮崎県','西臼杵郡五ヶ瀬町','宮崎',0],
  ['鹿児島県','肝属郡東串良町','鹿児島',0],
  ['沖縄県','中頭郡西原町','沖縄',0],
  ['福岡県','小郡市','久留米',0],
  ['熊本県','阿蘇郡小国町','熊本',0],
  ['鹿児島県','肝属郡錦江町','鹿児島',0],
  ['沖縄県','島尻郡与那原町','沖縄南',0],
  ['福岡県','筑紫野市','久留米',1],
  ['熊本県','阿蘇郡産山村','熊本',0],
  ['鹿児島県','肝属郡南大隅町','鹿児島',0],
  ['沖縄県','島尻郡南風原町','沖縄南',0],
  ['福岡県','春日市','福岡南',0],
  ['熊本県','阿蘇郡高森町','熊本',0],
  ['鹿児島県','肝属郡肝付町','鹿児島',0],
  ['沖縄県','島尻郡渡嘉敷村','沖縄',0],
  ['福岡県','大野城市','福岡南',0],
  ['熊本県','阿蘇郡西原村','熊本',0],
  ['鹿児島県','熊毛郡中種子町','鹿児島',0],
  ['沖縄県','島尻郡座間味村','沖縄',0],
  ['福岡県','宗像市','北九州',1],
  ['熊本県','阿蘇郡南阿蘇村','熊本',0],
  ['鹿児島県','熊毛郡南種子町','鹿児島',0],
  ['沖縄県','島尻郡粟国村','沖縄',0],
  ['福岡県','太宰府市','福岡南',0],
  ['熊本県','上益城郡御船町','熊本',0],
  ['鹿児島県','熊毛郡屋久島町','鹿児島',0],
  ['沖縄県','島尻郡渡名喜村','沖縄',0],
  ['福岡県','古賀市','福岡',0],
  ['熊本県','上益城郡嘉島町','熊本',0],
  ['鹿児島県','大島郡大和村','鹿児島',0],
  ['沖縄県','島尻郡南大東村','沖縄',0],
  ['福岡県','福津市','北九州',1],
  ['熊本県','上益城郡益城町','熊本',0],
  ['鹿児島県','大島郡宇検村','鹿児島',0],
  ['沖縄県','島尻郡北大東村','沖縄',0],
  ['福岡県','うきは市','久留米',0],
  ['熊本県','上益城郡甲佐町','熊本',0],
  ['鹿児島県','大島郡瀬戸内町','鹿児島',0],
  ['沖縄県','島尻郡伊平屋村','沖縄',0],
  ['福岡県','宮若市','北九州',1],
  ['熊本県','上益城郡山都町','熊本',0],
  ['鹿児島県','大島郡龍郷町','鹿児島',0],
  ['沖縄県','島尻郡伊是名村','沖縄',0],
  ['福岡県','嘉麻市','北九州',1],
  ['熊本県','八代郡氷川町','熊本',0],
  ['鹿児島県','大島郡喜界町','鹿児島',0],
  ['沖縄県','島尻郡久米島町','沖縄',0],
  ['福岡県','朝倉市','久留米',0],
  ['熊本県','葦北郡芦北町','熊本',0],
  ['鹿児島県','大島郡徳之島町','鹿児島',0],
  ['沖縄県','島尻郡八重瀬町','沖縄南',0],
  ['福岡県','みやま市','久留米',1],
  ['熊本県','葦北郡津奈木町','熊本',0],
  ['鹿児島県','大島郡天城町','鹿児島',0],
  ['沖縄県','宮古郡多良間村','沖縄',0],
  ['福岡県','糸島市','福岡西',0],
  ['熊本県','球磨郡錦町','熊本',0],
  ['鹿児島県','大島郡伊仙町','鹿児島',0],
  ['沖縄県','八重山郡竹富町','沖縄',0],
  ['福岡県','那珂川市','福岡南',1],
  ['熊本県','球磨郡多良木町','熊本',0],
  ['鹿児島県','大島郡和泊町','鹿児島',0],
  ['沖縄県','八重山郡与那国町','沖縄',0],
  ['福岡県','糟屋郡宇美町','福岡',0],
  ['熊本県','球磨郡湯前町','熊本',0],
  ['鹿児島県','大島郡知名町','鹿児島',0],
  ['福岡県','糟屋郡篠栗町','福岡',0],
  ['熊本県','球磨郡水上村','熊本',0],
  ['鹿児島県','大島郡与論町','鹿児島',0],
  ['福岡県','糟屋郡志免町','福岡',0],
  ['熊本県','球磨郡相良村','熊本',0],
  ['福岡県','糟屋郡須惠町','福岡',0],
  ['熊本県','球磨郡五木村','熊本',0],
  ['福岡県','糟屋郡新宮町','福岡',0],
  ['熊本県','球磨郡山江村','熊本',0],
  ['福岡県','糟屋郡久山町','福岡',0],
  ['熊本県','球磨郡球磨村','熊本',0],
  ['福岡県','糟屋郡粕屋町','福岡',0],
  ['熊本県','球磨郡あさぎり町','熊本',0],
  ['福岡県','遠賀郡芦屋町','北九州',0],
  ['熊本県','天草郡苓北町','熊本',0],
  ['福岡県','遠賀郡水巻町','北九州',0],
  ['福岡県','遠賀郡岡垣町','北九州',0],
  ['福岡県','遠賀郡遠賀町','北九州',0],
  ['福岡県','鞍手郡小竹町','北九州',1],
  ['福岡県','鞍手郡鞍手町','北九州',1],
  ['福岡県','嘉穂郡桂川町','北九州',1],
  ['福岡県','朝倉郡筑前町','久留米',0],
  ['福岡県','朝倉郡東峰村','久留米',0],
  ['福岡県','三井郡大刀洗町','久留米',0],
  ['福岡県','三潴郡大木町','久留米',0],
  ['福岡県','八女郡広川町','久留米',0],
  ['福岡県','田川郡香春町','小倉',1],
  ['福岡県','田川郡添田町','小倉',0],
  ['福岡県','田川郡糸田町','小倉',1],
  ['福岡県','田川郡川崎町','小倉',1],
  ['福岡県','田川郡大任町','小倉',1],
  ['福岡県','田川郡赤村','小倉',0],
  ['福岡県','田川郡福智町','小倉',1],
  ['福岡県','京都郡苅田町','小倉',1],
  ['福岡県','京都郡みやこ町','小倉',1],
  ['福岡県','築上郡吉富町','小倉',1],
  ['福岡県','築上郡上毛町','小倉',1],
  ['福岡県','築上郡築上町','小倉',0],
  ['徳島県','徳島市','徳島',1],
  ['香川県','高松市','高松',1],
  ['愛媛県','松山市','松山',1],
  ['高知県','高知市','高知',1],
  ['徳島県','鳴門市','徳島',0],
  ['香川県','丸亀市','高松',1],
  ['愛媛県','今治市','新居浜',1],
  ['高知県','室戸市','高知',1],
  ['徳島県','小松島市','徳島',0],
  ['香川県','坂出市','高松',0],
  ['愛媛県','宇和島市','松山',1],
  ['高知県','安芸市','高知',1],
  ['徳島県','阿南市','徳島',0],
  ['香川県','善通寺市','新居浜',1],
  ['愛媛県','八幡浜市','松山',1],
  ['高知県','南国市','高知',1],
  ['徳島県','吉野川市','徳島',0],
  ['香川県','観音寺市','新居浜',1],
  ['愛媛県','新居浜市','新居浜',1],
  ['高知県','土佐市','高知',1],
  ['徳島県','阿波市','徳島',0],
  ['香川県','さぬき市','高松',0],
  ['愛媛県','西条市','新居浜',1],
  ['高知県','須崎市','高知',1],
  ['徳島県','美馬市','徳島',0],
  ['香川県','東かがわ市','高松',0],
  ['愛媛県','大洲市','松山',1],
  ['高知県','宿毛市','高知',1],
  ['徳島県','三好市','徳島',0],
  ['香川県','三豊市','新居浜',1],
  ['愛媛県','伊予市','松山',1],
  ['高知県','土佐清水市','高知',1],
  ['徳島県','勝浦郡勝浦町','徳島',0],
  ['香川県','小豆郡土庄町','高松',0],
  ['愛媛県','四国中央市','新居浜',1],
  ['高知県','四万十市','高知',1],
  ['徳島県','勝浦郡上勝町','徳島',0],
  ['香川県','小豆郡小豆島町','高松',0],
  ['愛媛県','西予市','松山',1],
  ['高知県','香南市','高知',1],
  ['徳島県','名東郡佐那河内村','徳島',0],
  ['香川県','木田郡三木町','高松',0],
  ['愛媛県','東温市','松山',1],
  ['高知県','香美市','高知',0],
  ['徳島県','名西郡石井町','徳島',0],
  ['香川県','香川郡直島町','高松',0],
  ['愛媛県','越智郡上島町','新居浜',0],
  ['高知県','安芸郡東洋町','高知',0],
  ['徳島県','名西郡神山町','徳島',0],
  ['香川県','綾歌郡宇多津町','高松',0],
  ['愛媛県','上浮穴郡久万高原町','松山',0],
  ['高知県','安芸郡奈半利町','高知',0],
  ['徳島県','那賀郡那賀町','徳島',0],
  ['香川県','綾歌郡綾川町','高松',0],
  ['愛媛県','伊予郡松前町','松山',1],
  ['高知県','安芸郡田野町','高知',0],
  ['徳島県','海部郡牟岐町','徳島',0],
  ['香川県','仲多度郡琴平町','高松',0],
  ['愛媛県','伊予郡砥部町','松山',1],
  ['高知県','安芸郡安田町','高知',0],
  ['徳島県','海部郡美波町','徳島',0],
  ['香川県','仲多度郡多度津町','新居浜',0],
  ['愛媛県','喜多郡内子町','松山',1],
  ['高知県','安芸郡北川村','高知',0],
  ['徳島県','海部郡海陽町','徳島',0],
  ['香川県','仲多度郡まんのう町','高松',0],
  ['愛媛県','西宇和郡伊方町','松山',1],
  ['高知県','安芸郡馬路村','高知',0],
  ['徳島県','板野郡松茂町','徳島',0],
  ['愛媛県','北宇和郡松野町','松山',1],
  ['高知県','安芸郡芸西村','高知',1],
  ['徳島県','板野郡北島町','徳島',0],
  ['愛媛県','北宇和郡鬼北町','松山',1],
  ['高知県','長岡郡本山町','高知',0],
  ['徳島県','板野郡藍住町','徳島',0],
  ['愛媛県','南宇和郡愛南町','松山',1],
  ['高知県','長岡郡大豊町','高知',0],
  ['徳島県','板野郡板野町','徳島',0],
  ['高知県','土佐郡土佐町','高知',0],
  ['徳島県','板野郡上板町','徳島',0],
  ['高知県','土佐郡大川村','高知',0],
  ['徳島県','美馬郡つるぎ町','徳島',0],
  ['高知県','吾川郡いの町','高知',0],
  ['徳島県','三好郡東みよし町','徳島',0],
  ['高知県','吾川郡仁淀川町','高知',0],
  ['高知県','高岡郡中土佐町','高知',1],
  ['高知県','高岡郡佐川町','高知',0],
  ['高知県','高岡郡越知町','高知',0],
  ['高知県','高岡郡檮原町','高知',0],
  ['高知県','高岡郡日高村','高知',0],
  ['高知県','高岡郡津野町','高知',1],
  ['高知県','高岡郡四万十町','高知',0],
  ['高知県','幡多郡大月町','高知',1],
  ['高知県','幡多郡三原村','高知',1],
  ['高知県','幡多郡黒潮町','高知',1],
  ['鳥取県','鳥取市','鳥取',0],
  ['島根県','松江市','松江',0],
  ['岡山県','岡山市','岡山',1],
  ['広島県','広島市','広島南\n広島\n広島北\n東広島',1],
  ['山口県','下関市','下関',1],
  ['鳥取県','米子市','松江',0],
  ['島根県','浜田市','松江',0],
  ['山口県','宇部市','下関',1],
  ['鳥取県','倉吉市','鳥取',0],
  ['島根県','出雲市','松江',0],
  ['山口県','山口市','山口',1],
  ['鳥取県','境港市','松江',0],
  ['島根県','益田市','松江',0],
  ['山口県','萩市','山口',0],
  ['鳥取県','岩美郡岩美町','鳥取',0],
  ['島根県','大田市','松江',0],
  ['岡山県','倉敷市','倉敷',1],
  ['山口県','防府市','山口',1],
  ['鳥取県','八頭郡若桜町','鳥取',0],
  ['島根県','安来市','松江',0],
  ['岡山県','津山市','鳥取',1],
  ['山口県','下松市','周南',0],
  ['鳥取県','八頭郡智頭町','鳥取',0],
  ['島根県','江津市','松江',0],
  ['岡山県','玉野市','岡山',0],
  ['山口県','岩国市','周南',1],
  ['鳥取県','八頭郡八頭町','鳥取',0],
  ['島根県','雲南市','松江',0],
  ['岡山県','笠岡市','倉敷',0],
  ['山口県','光市','周南',0],
  ['鳥取県','東伯郡三朝町','鳥取',0],
  ['島根県','仁多郡奥出雲町','松江',0],
  ['岡山県','井原市','倉敷',0],
  ['広島県','呉市','東広島',1],
  ['山口県','長門市','下関',0],
  ['鳥取県','東伯郡湯梨浜町','鳥取',0],
  ['島根県','飯石郡飯南町','松江',0],
  ['岡山県','総社市','倉敷',0],
  ['広島県','府中市','',0],
  ['山口県','柳井市','周南',0],
  ['鳥取県','東伯郡琴浦町','鳥取',0],
  ['島根県','邑智郡川本町','松江',0],
  ['岡山県','高梁市','倉敷',0],
  ['広島県','竹原市','東広島',0],
  ['山口県','美祢市','下関',0],
  ['鳥取県','東伯郡北栄町','鳥取',0],
  ['島根県','邑智郡美郷町','松江',0],
  ['岡山県','新見市','倉敷',0],
  ['広島県','三原市','福山',1],
  ['山口県','周南市','周南',0],
  ['鳥取県','西伯郡日吉津村','松江',0],
  ['島根県','邑智郡邑南町','松江',0],
  ['岡山県','備前市','岡山',0],
  ['広島県','尾道市','福山',0],
  ['山口県','山陽小野田市','下関',1],
  ['鳥取県','西伯郡大山町','松江',0],
  ['島根県','鹿足郡津和野町','松江',0],
  ['岡山県','瀬戸内市','岡山',0],
  ['広島県','福山市','福山',1],
  ['山口県','大島郡周防大島町','周南',0],
  ['鳥取県','西伯郡南部町','松江',0],
  ['島根県','鹿足郡吉賀町','松江',0],
  ['岡山県','赤磐市','岡山',0],
  ['広島県','三次市','東広島',0],
  ['山口県','玖珂郡和木町','周南',0],
  ['鳥取県','西伯郡伯耆町','松江',0],
  ['島根県','隠岐郡海士町','松江',0],
  ['岡山県','真庭市','倉敷',1],
  ['広島県','庄原市','福山',0],
  ['山口県','熊毛郡上関町','周南',0],
  ['鳥取県','日野郡日南町','松江',0],
  ['島根県','隠岐郡西ノ島町','松江',0],
  ['岡山県','美作市','鳥取',1],
  ['広島県','大竹市','広島',0],
  ['山口県','熊毛郡田布施町','周南',0],
  ['鳥取県','日野郡日野町','松江',0],
  ['島根県','隠岐郡知夫村','松江',0],
  ['岡山県','浅口市','倉敷',0],
  ['広島県','東広島市','東広島',1],
  ['山口県','熊毛郡平生町','周南',0],
  ['鳥取県','日野郡江府町','松江',0],
  ['島根県','隠岐郡隠岐の島町','松江',0],
  ['岡山県','和気郡和気町','岡山',0],
  ['広島県','廿日市市','広島',1],
  ['山口県','阿武郡阿武町','山口',0],
  ['岡山県','都窪郡早島町','岡山',0],
  ['広島県','安芸高田市','広島北',0],
  ['岡山県','浅口郡里庄町','倉敷',0],
  ['広島県','江田島市','東広島',0],
  ['岡山県','小田郡矢掛町','倉敷',0],
  ['広島県','安芸郡府中町','広島南',1],
  ['岡山県','真庭郡新庄村','倉敷',0],
  ['広島県','安芸郡海田町','広島南',1],
  ['岡山県','苫田郡鏡野町','鳥取',0],
  ['広島県','安芸郡熊野町','広島南',0],
  ['岡山県','勝田郡勝央町','鳥取',1],
  ['広島県','安芸郡坂町','広島南',1],
  ['岡山県','勝田郡奈義町','鳥取',0],
  ['広島県','山県郡安芸太田町','広島北',0],
  ['岡山県','英田郡西粟倉村','鳥取',0],
  ['広島県','山県郡北広島町','広島北',0],
  ['岡山県','久米郡久米南町','岡山',0],
  ['広島県','豊田郡大崎上島町','東広島',0],
  ['岡山県','久米郡美咲町','岡山',0],
  ['広島県','世羅郡世羅町','福山',0],
  ['岡山県','加賀郡吉備中央町','倉敷',0],
  ['広島県','神石郡神石高原町','福山',0],
  ['三重県','津市','津',0],
  ['滋賀県','大津市','滋賀',0],
  ['京都府','京都市','京都東\n京都\n京都北\n滋賀',0],
  ['大阪府','大阪市','大阪中央\n西大阪\n堺\n大阪\n吹田\n東大阪\n八尾',1],
  ['兵庫県','神戸市','神戸東\n神戸',0],
  ['奈良県','奈良市','奈良',0],
  ['和歌山県','和歌山市','和歌山',0],
  ['三重県','四日市市','四日市',1],
  ['滋賀県','彦根市','彦根',0],
  ['奈良県','大和高田市','香芝',0],
  ['和歌山県','海南市','和歌山',0],
  ['三重県','伊勢市','津',0],
  ['滋賀県','長浜市','彦根',0],
  ['奈良県','大和郡山市','奈良',0],
  ['和歌山県','橋本市','和歌山',0],
  ['三重県','松阪市','津',0],
  ['滋賀県','近江八幡市','彦根',0],
  ['奈良県','天理市','奈良',0],
  ['和歌山県','有田市','和歌山',0],
  ['三重県','桑名市','四日市',1],
  ['滋賀県','草津市','滋賀',0],
  ['奈良県','橿原市','香芝',0],
  ['和歌山県','御坊市','和歌山',0],
  ['三重県','鈴鹿市','四日市',1],
  ['滋賀県','守山市','滋賀',0],
  ['奈良県','桜井市','香芝',0],
  ['和歌山県','田辺市','和歌山',0],
  ['三重県','名張市','津',0],
  ['滋賀県','栗東市','滋賀',0],
  ['奈良県','五條市','香芝',0],
  ['和歌山県','新宮市','和歌山',0],
  ['三重県','尾鷲市','津',0],
  ['滋賀県','甲賀市','滋賀',0],
  ['奈良県','御所市','香芝',0],
  ['和歌山県','紀の川市','和歌山',0],
  ['三重県','亀山市','津',1],
  ['滋賀県','野洲市','滋賀',0],
  ['奈良県','生駒市','奈良',0],
  ['和歌山県','岩出市','和歌山',0],
  ['三重県','鳥羽市','津',0],
  ['滋賀県','湖南市','滋賀',0],
  ['兵庫県','姫路市','姫路',0],
  ['奈良県','香芝市','香芝',0],
  ['和歌山県','海草郡紀美野町','和歌山',0],
  ['三重県','熊野市','津',0],
  ['滋賀県','高島市','滋賀',0],
  ['兵庫県','尼崎市','大阪',0],
  ['奈良県','葛城市','香芝',0],
  ['和歌山県','伊都郡かつらぎ町','和歌山',0],
  ['三重県','いなべ市','四日市',1],
  ['滋賀県','東近江市','彦根',0],
  ['京都府','福知山市','福知山',0],
  ['兵庫県','明石市','神戸',0],
  ['奈良県','宇陀市','奈良',0],
  ['和歌山県','伊都郡九度山町','和歌山',0],
  ['三重県','志摩市','津',0],
  ['滋賀県','米原市','彦根',0],
  ['京都府','舞鶴市','福知山',0],
  ['兵庫県','西宮市','神戸北',0],
  ['奈良県','山辺郡山添村','奈良',0],
  ['和歌山県','伊都郡高野町','和歌山',0],
  ['三重県','伊賀市','津',0],
  ['滋賀県','蒲生郡日野町','彦根',0],
  ['京都府','綾部市','福知山',0],
  ['兵庫県','洲本市','神戸',0],
  ['奈良県','生駒郡平群町','香芝',0],
  ['和歌山県','有田郡湯浅町','和歌山',0],
  ['三重県','桑名郡木曽岬町','四日市',0],
  ['滋賀県','蒲生郡竜王町','滋賀',0],
  ['京都府','宇治市','京都',1],
  ['兵庫県','芦屋市','西宮',0],
  ['奈良県','生駒郡三郷町','香芝',0],
  ['和歌山県','有田郡広川町','和歌山',0],
  ['三重県','員弁郡東員町','四日市',0],
  ['滋賀県','愛知郡愛荘町','彦根',0],
  ['京都府','宮津市','福知山',0],
  ['兵庫県','伊丹市','西宮',0],
  ['奈良県','生駒郡斑鳩町','香芝',0],
  ['和歌山県','有田郡有田川町','和歌山',0],
  ['三重県','三重郡菰野町','四日市',1],
  ['滋賀県','犬上郡豊郷町','彦根',0],
  ['京都府','亀岡市','京都北',0],
  ['兵庫県','相生市','姫路',0],
  ['奈良県','生駒郡安堵町','香芝',0],
  ['和歌山県','日高郡美浜町','和歌山',0],
  ['三重県','三重郡朝日町','四日市',0],
  ['滋賀県','犬上郡甲良町','彦根',0],
  ['京都府','城陽市','京都',1],
  ['兵庫県','豊岡市','福知山',0],
  ['奈良県','磯城郡川西町','香芝',0],
  ['和歌山県','日高郡日高町','和歌山',0],
  ['三重県','三重郡川越町','四日市',0],
  ['滋賀県','犬上郡多賀町','彦根',0],
  ['京都府','向日市','京都北',0],
  ['兵庫県','加古川市','姫路',0],
  ['奈良県','磯城郡三宅町','香芝',0],
  ['和歌山県','日高郡由良町','和歌山',0],
  ['三重県','多気郡多気町','津',0],
  ['京都府','長岡京市','京都北',0],
  ['兵庫県','赤穂市','姫路',0],
  ['奈良県','磯城郡田原本町','香芝',0],
  ['和歌山県','日高郡印南町','和歌山',0],
  ['三重県','多気郡明和町','津',0],
  ['京都府','八幡市','京都',0],
  ['兵庫県','西脇市','姫路',0],
  ['奈良県','宇陀郡曽爾村','香芝',0],
  ['和歌山県','日高郡みなべ町','和歌山',0],
  ['三重県','多気郡大台町','津',0],
  ['京都府','京田辺市','京都',0],
  ['兵庫県','宝塚市','神戸北',0],
  ['奈良県','宇陀郡御杖村','香芝',0],
  ['和歌山県','日高郡日高川町','和歌山',0],
  ['三重県','度会郡玉城町','津',0],
  ['京都府','京丹後市','福知山',0],
  ['兵庫県','三木市','神戸',0],
  ['奈良県','高市郡高取町','香芝',0],
  ['和歌山県','西牟婁郡白浜町','和歌山',0],
  ['三重県','度会郡度会町','津',0],
  ['京都府','南丹市','福知山',0],
  ['兵庫県','高砂市','姫路',0],
  ['奈良県','高市郡明日香村','香芝',0],
  ['和歌山県','西牟婁郡上富田町','和歌山',0],
  ['三重県','度会郡大紀町','津',0],
  ['京都府','木津川市','奈良',0],
  ['大阪府','堺市','堺\n南大阪\n香芝',0],
  ['兵庫県','川西市','神戸北',0],
  ['奈良県','北葛城郡上牧町','香芝',0],
  ['和歌山県','西牟婁郡すさみ町','和歌山',0],
  ['三重県','度会郡南伊勢町','津',0],
  ['京都府','乙訓郡大山崎町','京都',0],
  ['兵庫県','小野市','神戸',0],
  ['奈良県','北葛城郡王寺町','香芝',0],
  ['和歌山県','東牟婁郡那智勝浦町','和歌山',0],
  ['三重県','北牟婁郡紀北町','津',0],
  ['京都府','久世郡久御山町','京都',0],
  ['兵庫県','三田市','神戸北',0],
  ['奈良県','北葛城郡広陵町','香芝',0],
  ['和歌山県','東牟婁郡太地町','和歌山',0],
  ['三重県','南牟婁郡御浜町','津',0],
  ['京都府','綴喜郡井手町','京都',0],
  ['兵庫県','加西市','姫路',0],
  ['奈良県','北葛城郡河合町','香芝',0],
  ['和歌山県','東牟婁郡古座川町','和歌山',0],
  ['三重県','南牟婁郡紀宝町','津',0],
  ['京都府','綴喜郡宇治田原町','京都',0],
  ['兵庫県','丹波篠山市','福知山',0],
  ['奈良県','吉野郡吉野町','香芝',0],
  ['和歌山県','東牟婁郡北山村','和歌山',0],
  ['京都府','相楽郡笠置町','奈良',0],
  ['兵庫県','養父市','福知山',0],
  ['奈良県','吉野郡大淀町','香芝',0],
  ['和歌山県','東牟婁郡串本町','和歌山',0],
  ['京都府','相楽郡和束町','奈良',0],
  ['兵庫県','丹波市','福知山',0],
  ['奈良県','吉野郡下市町','香芝',0],
  ['京都府','相楽郡精華町','奈良',0],
  ['大阪府','岸和田市','南大阪',0],
  ['兵庫県','南あわじ市','神戸',0],
  ['奈良県','吉野郡黒滝村','香芝',0],
  ['京都府','相楽郡南山城村','奈良',0],
  ['大阪府','豊中市','北大阪',0],
  ['兵庫県','朝来市','福知山',0],
  ['奈良県','吉野郡天川村','香芝',0],
  ['京都府','船井郡京丹波町','福知山',0],
  ['大阪府','池田市','北大阪',0],
  ['兵庫県','淡路市','神戸',0],
  ['奈良県','吉野郡野迫川村','香芝',0],
  ['京都府','与謝郡伊根町','福知山',0],
  ['大阪府','吹田市','吹田',0],
  ['兵庫県','宍粟市','姫路',0],
  ['奈良県','吉野郡十津川村','香芝',0],
  ['京都府','与謝郡与謝野町','福知山',0],
  ['大阪府','泉大津市','南大阪',0],
  ['兵庫県','加東市','神戸',0],
  ['奈良県','吉野郡下北山村','香芝',0],
  ['大阪府','高槻市','高槻',0],
  ['兵庫県','たつの市','姫路',0],
  ['奈良県','吉野郡上北山村','香芝',0],
  ['大阪府','貝塚市','南大阪',0],
  ['兵庫県','川辺郡猪名川町','神戸北',0],
  ['奈良県','吉野郡川上村','香芝',0],
  ['大阪府','守口市','東大阪',0],
  ['兵庫県','多可郡多可町','姫路',0],
  ['奈良県','吉野郡東吉野村','香芝',0],
  ['大阪府','枚方市','枚方',0],
  ['兵庫県','加古郡稲美町','姫路',0],
  ['大阪府','茨木市','高槻',0],
  ['兵庫県','加古郡播磨町','姫路',0],
  ['大阪府','八尾市','八尾',0],
  ['兵庫県','神崎郡市川町','姫路',0],
  ['大阪府','泉佐野市','和歌山',0],
  ['兵庫県','神崎郡福崎町','姫路',0],
  ['大阪府','富田林市','香芝',0],
  ['兵庫県','神崎郡神河町','姫路',0],
  ['大阪府','寝屋川市','枚方',0],
  ['兵庫県','揖保郡太子町','姫路',0],
  ['大阪府','河内長野市','南大阪',0],
  ['兵庫県','赤穂郡上郡町','姫路',0],
  ['大阪府','松原市','八尾',0],
  ['兵庫県','佐用郡佐用町','姫路',0],
  ['大阪府','大東市','東大阪',0],
  ['兵庫県','美方郡香美町','鳥取',0],
  ['大阪府','和泉市','南大阪',0],
  ['兵庫県','美方郡新温泉町','鳥取',0],
  ['大阪府','箕面市','北大阪',0],
  ['大阪府','柏原市','香芝',0],
  ['大阪府','羽曳野市','香芝',0],
  ['大阪府','門真市','東大阪',0],
  ['大阪府','摂津市','吹田',0],
  ['大阪府','高石市','南大阪',0],
  ['大阪府','藤井寺市','香芝',0],
  ['大阪府','東大阪市','東大阪',1],
  ['大阪府','泉南市','和歌山',0],
  ['大阪府','四條畷市','東大阪',0],
  ['大阪府','交野市','枚方',0],
  ['大阪府','大阪狭山市','南大阪',0],
  ['大阪府','阪南市','和歌山',0],
  ['大阪府','三島郡島本町','京都',0],
  ['大阪府','豊能郡豊能町','北大阪',0],
  ['大阪府','豊能郡能勢町','北大阪',0],
  ['大阪府','泉北郡忠岡町','南大阪',0],
  ['大阪府','泉南郡熊取町','和歌山',0],
  ['大阪府','泉南郡田尻町','和歌山',0],
  ['大阪府','泉南郡岬町','和歌山',0],
  ['大阪府','南河内郡太子町','香芝',0],
  ['大阪府','南河内郡河南町','香芝',0],
  ['大阪府','南河内郡千早赤阪村','香芝',0],
  ['富山県','富山市','富山',0],
  ['石川県','金沢市','金沢',1],
  ['福井県','福井市','福井',1],
  ['山梨県','甲府市','山梨',0],
  ['長野県','長野市','長野',1],
  ['岐阜県','岐阜市','岐阜',0],
  ['静岡県','静岡市','静岡',1],
  ['愛知県','名古屋市','名東\n北名古屋\n名古屋\n天白',1],
  ['新潟県','新潟市','新潟西',0],
  ['富山県','高岡市','富山',1],
  ['石川県','七尾市','金沢',1],
  ['福井県','敦賀市','福井',1],
  ['山梨県','富士吉田市','山梨',1],
  ['長野県','松本市','松本',1],
  ['岐阜県','大垣市','岐阜',1],
  ['富山県','魚津市','富山',1],
  ['石川県','小松市','金沢',1],
  ['福井県','小浜市','福井',0],
  ['山梨県','都留市','山梨',1],
  ['長野県','上田市','上田',1],
  ['岐阜県','高山市','岐阜',1],
  ['富山県','氷見市','富山',1],
  ['石川県','輪島市','金沢',0],
  ['福井県','大野市','福井',1],
  ['山梨県','山梨市','山梨',0],
  ['長野県','岡谷市','松本',1],
  ['岐阜県','多治見市','岐阜',0],
  ['静岡県','浜松市','浜松',1],
  ['富山県','滑川市','富山',1],
  ['石川県','珠洲市','金沢',1],
  ['福井県','勝山市','福井',1],
  ['山梨県','大月市','山梨',1],
  ['長野県','飯田市','伊那',1],
  ['岐阜県','関市','岐阜',1],
  ['富山県','黒部市','富山',0],
  ['石川県','加賀市','金沢',1],
  ['福井県','鯖江市','福井',1],
  ['山梨県','韮崎市','山梨',1],
  ['長野県','諏訪市','松本',1],
  ['岐阜県','中津川市','岐阜',0],
  ['富山県','砺波市','富山',1],
  ['石川県','羽咋市','金沢',1],
  ['福井県','あわら市','福井',1],
  ['山梨県','南アルプス市','山梨',0],
  ['長野県','須坂市','長野',1],
  ['岐阜県','美濃市','岐阜',1],
  ['静岡県','沼津市','沼津',1],
  ['富山県','小矢部市','富山',1],
  ['石川県','かほく市','金沢',1],
  ['福井県','越前市','福井',1],
  ['山梨県','北杜市','山梨',1],
  ['長野県','小諸市','上田',1],
  ['岐阜県','瑞浪市','岐阜',1],
  ['静岡県','熱海市','沼津',1],
  ['富山県','南砺市','富山',1],
  ['石川県','白山市','金沢',1],
  ['福井県','坂井市','福井',1],
  ['山梨県','甲斐市','山梨',1],
  ['長野県','伊那市','伊那',1],
  ['岐阜県','羽島市','岐阜',1],
  ['静岡県','三島市','沼津',1],
  ['新潟県','長岡市','長岡',1],
  ['富山県','射水市','富山',1],
  ['石川県','能美市','金沢',1],
  ['福井県','吉田郡永平寺町','福井',0],
  ['山梨県','笛吹市','山梨',1],
  ['長野県','駒ヶ根市','伊那',1],
  ['岐阜県','恵那市','岐阜',1],
  ['静岡県','富士宮市','静岡',1],
  ['新潟県','三条市','新潟西',1],
  ['富山県','中新川郡舟橋村','富山',1],
  ['石川県','野々市市','金沢',1],
  ['福井県','今立郡池田町','福井',0],
  ['山梨県','上野原市','山梨',1],
  ['長野県','中野市','長野',1],
  ['岐阜県','美濃加茂市','岐阜',1],
  ['静岡県','伊東市','沼津',1],
  ['新潟県','柏崎市','長岡',1],
  ['富山県','中新川郡上市町','富山',0],
  ['石川県','能美郡川北町','金沢',0],
  ['福井県','南条郡南越前町','福井',0],
  ['山梨県','甲州市','山梨',0],
  ['長野県','大町市','松本',1],
  ['岐阜県','土岐市','岐阜',1],
  ['静岡県','島田市','静岡',1],
  ['新潟県','新発田市','新潟',1],
  ['富山県','中新川郡立山町','富山',0],
  ['石川県','河北郡津幡町','金沢',0],
  ['福井県','丹生郡越前町','福井',0],
  ['山梨県','中央市','山梨',0],
  ['長野県','飯山市','長野',1],
  ['岐阜県','各務原市','岐阜',0],
  ['静岡県','富士市','静岡',0],
  ['新潟県','小千谷市','長岡',1],
  ['富山県','下新川郡入善町','富山',0],
  ['石川県','河北郡内灘町','金沢',0],
  ['福井県','三方郡美浜町','福井',0],
  ['山梨県','西八代郡市川三郷町','山梨',0],
  ['長野県','茅野市','上田',1],
  ['岐阜県','可児市','岐阜',1],
  ['静岡県','磐田市','浜松',1],
  ['新潟県','加茂市','新潟西',1],
  ['富山県','下新川郡朝日町','富山',1],
  ['石川県','羽咋郡志賀町','金沢',0],
  ['福井県','大飯郡高浜町','福井',0],
  ['山梨県','南巨摩郡早川町','山梨',0],
  ['長野県','塩尻市','松本',1],
  ['岐阜県','山県市','岐阜',0],
  ['静岡県','焼津市','静岡',1],
  ['新潟県','十日町市','長岡',1],
  ['石川県','羽咋郡宝達志水町','金沢',0],
  ['福井県','大飯郡おおい町','福井',0],
  ['山梨県','南巨摩郡身延町','山梨',0],
  ['長野県','佐久市','上田',1],
  ['岐阜県','瑞穂市','岐阜',1],
  ['静岡県','掛川市','浜松',1],
  ['新潟県','見附市','新潟西',1],
  ['石川県','鹿島郡中能登町','金沢',0],
  ['福井県','三方上中郡若狭町','福井',0],
  ['山梨県','南巨摩郡南部町','山梨',0],
  ['長野県','千曲市','上田',1],
  ['岐阜県','飛騨市','岐阜',0],
  ['静岡県','藤枝市','静岡',1],
  ['愛知県','豊橋市','豊橋',1],
  ['新潟県','村上市','新潟',0],
  ['石川県','鳳珠郡穴水町','金沢',0],
  ['山梨県','南巨摩郡富士川町','山梨',0],
  ['長野県','東御市','上田',1],
  ['岐阜県','本巣市','岐阜',0],
  ['静岡県','御殿場市','沼津',1],
  ['愛知県','岡崎市','三河',1],
  ['新潟県','燕市','新潟西',1],
  ['石川県','鳳珠郡能登町','金沢',0],
  ['山梨県','中巨摩郡昭和町','山梨',0],
  ['長野県','安曇野市','松本',1],
  ['岐阜県','郡上市','岐阜',0],
  ['静岡県','袋井市','浜松',1],
  ['愛知県','一宮市','北名古屋',1],
  ['新潟県','糸魚川市','長岡',1],
  ['山梨県','南都留郡道志村','山梨',0],
  ['長野県','南佐久郡小海町','上田',0],
  ['岐阜県','下呂市','岐阜',0],
  ['静岡県','下田市','沼津',1],
  ['愛知県','瀬戸市','豊田',1],
  ['新潟県','妙高市','長岡',1],
  ['山梨県','南都留郡西桂町','山梨',0],
  ['長野県','南佐久郡川上村','上田',0],
  ['岐阜県','海津市','岐阜',1],
  ['静岡県','裾野市','沼津',1],
  ['愛知県','半田市','南名古屋',1],
  ['新潟県','五泉市','新潟西',1],
  ['山梨県','南都留郡忍野村','山梨',0],
  ['長野県','南佐久郡南牧村','上田',0],
  ['岐阜県','羽島郡岐南町','岐阜',0],
  ['静岡県','湖西市','浜松',0],
  ['愛知県','春日井市','北名古屋',1],
  ['新潟県','上越市','長岡',1],
  ['山梨県','南都留郡山中湖村','山梨',0],
  ['長野県','南佐久郡南相木村','上田',0],
  ['岐阜県','羽島郡笠松町','岐阜',0],
  ['静岡県','伊豆市','沼津',1],
  ['愛知県','豊川市','豊橋',1],
  ['新潟県','阿賀野市','新潟西',1],
  ['山梨県','南都留郡鳴沢村','山梨',0],
  ['長野県','南佐久郡北相木村','上田',0],
  ['岐阜県','養老郡養老町','岐阜',0],
  ['静岡県','御前崎市','静岡',1],
  ['愛知県','津島市','北名古屋',0],
  ['新潟県','佐渡市','新潟',1],
  ['山梨県','南都留郡富士河口湖町','山梨',0],
  ['長野県','南佐久郡佐久穂町','上田',0],
  ['岐阜県','不破郡垂井町','岐阜',1],
  ['静岡県','菊川市','浜松',0],
  ['愛知県','碧南市','三河',1],
  ['新潟県','魚沼市','長岡',1],
  ['山梨県','北都留郡小菅村','山梨',0],
  ['長野県','北佐久郡軽井沢町','上田',0],
  ['岐阜県','不破郡関ケ原町','岐阜',0],
  ['静岡県','伊豆の国市','沼津',1],
  ['愛知県','刈谷市','南名古屋',1],
  ['新潟県','南魚沼市','長岡',0],
  ['山梨県','北都留郡丹波山村','山梨',0],
  ['長野県','北佐久郡御代田町','上田',0],
  ['岐阜県','安八郡神戸町','岐阜',1],
  ['静岡県','牧之原市','静岡',1],
  ['愛知県','豊田市','豊田',1],
  ['新潟県','胎内市','新潟',0],
  ['長野県','北佐久郡立科町','上田',0],
  ['岐阜県','安八郡輪之内町','岐阜',1],
  ['静岡県','賀茂郡東伊豆町','沼津',0],
  ['愛知県','安城市','三河',1],
  ['新潟県','北蒲原郡聖籠町','新潟',0],
  ['長野県','小県郡青木村','上田',0],
  ['岐阜県','安八郡安八町','岐阜',1],
  ['静岡県','賀茂郡河津町','沼津',0],
  ['愛知県','西尾市','三河',0],
  ['新潟県','西蒲原郡弥彦村','新潟西',0],
  ['長野県','小県郡長和町','上田',0],
  ['岐阜県','揖斐郡揖斐川町','岐阜',0],
  ['静岡県','賀茂郡南伊豆町','沼津',0],
  ['愛知県','蒲郡市','豊橋',1],
  ['新潟県','南蒲原郡田上町','新潟西',0],
  ['長野県','諏訪郡下諏訪町','松本',0],
  ['岐阜県','揖斐郡大野町','岐阜',0],
  ['静岡県','賀茂郡松崎町','沼津',0],
  ['愛知県','犬山市','岐阜',0],
  ['新潟県','東蒲原郡阿賀町','新潟西',0],
  ['長野県','諏訪郡富士見町','上田',0],
  ['岐阜県','揖斐郡池田町','岐阜',0],
  ['静岡県','賀茂郡西伊豆町','沼津',0],
  ['愛知県','常滑市','南名古屋',1],
  ['新潟県','三島郡出雲崎町','長岡',0],
  ['長野県','諏訪郡原村','上田',0],
  ['岐阜県','本巣郡北方町','岐阜',0],
  ['静岡県','田方郡函南町','沼津',0],
  ['愛知県','江南市','北名古屋',1],
  ['新潟県','南魚沼郡湯沢町','長岡',0],
  ['長野県','上伊那郡辰野町','伊那',0],
  ['岐阜県','加茂郡坂祝町','岐阜',0],
  ['静岡県','駿東郡清水町','沼津',1],
  ['愛知県','小牧市','北名古屋',1],
  ['新潟県','中魚沼郡津南町','長岡',0],
  ['長野県','上伊那郡箕輪町','伊那',0],
  ['岐阜県','加茂郡富加町','岐阜',0],
  ['静岡県','駿東郡長泉町','沼津',1],
  ['愛知県','稲沢市','北名古屋',1],
  ['新潟県','刈羽郡刈羽村','長岡',0],
  ['長野県','上伊那郡飯島町','伊那',0],
  ['岐阜県','加茂郡川辺町','岐阜',0],
  ['静岡県','駿東郡小山町','沼津',0],
  ['愛知県','新城市','豊橋',1],
  ['新潟県','岩船郡関川村','新潟',0],
  ['長野県','上伊那郡南箕輪村','伊那',0],
  ['岐阜県','加茂郡七宗町','岐阜',0],
  ['静岡県','榛原郡吉田町','静岡',1],
  ['愛知県','東海市','南名古屋',0],
  ['新潟県','岩船郡粟島浦村','新潟',0],
  ['長野県','上伊那郡中川村','伊那',0],
  ['岐阜県','加茂郡八百津町','岐阜',0],
  ['静岡県','榛原郡川根本町','静岡',0],
  ['愛知県','大府市','南名古屋',0],
  ['長野県','上伊那郡宮田村','伊那',0],
  ['岐阜県','加茂郡白川町','岐阜',0],
  ['静岡県','周智郡森町','浜松',0],
  ['愛知県','知多市','南名古屋',0],
  ['長野県','下伊那郡松川町','伊那',0],
  ['岐阜県','加茂郡東白川村','岐阜',0],
  ['愛知県','知立市','南名古屋',1],
  ['長野県','下伊那郡高森町','伊那',0],
  ['岐阜県','可児郡御嵩町','岐阜',0],
  ['愛知県','尾張旭市','豊田',1],
  ['長野県','下伊那郡阿南町','伊那',0],
  ['岐阜県','大野郡白川村','岐阜',0],
  ['愛知県','高浜市','三河',1],
  ['長野県','下伊那郡阿智村','伊那',0],
  ['愛知県','岩倉市','北名古屋',1],
  ['長野県','下伊那郡平谷村','伊那',0],
  ['愛知県','豊明市','南名古屋',0],
  ['長野県','下伊那郡根羽村','伊那',0],
  ['愛知県','日進市','豊田',0],
  ['長野県','下伊那郡下條村','伊那',0],
  ['愛知県','田原市','豊橋',1],
  ['長野県','下伊那郡売木村','伊那',0],
  ['愛知県','愛西市','北名古屋',0],
  ['長野県','下伊那郡天龍村','伊那',0],
  ['愛知県','清須市','北名古屋',1],
  ['長野県','下伊那郡泰阜村','伊那',0],
  ['愛知県','北名古屋市','北名古屋',1],
  ['長野県','下伊那郡喬木村','伊那',0],
  ['愛知県','弥富市','名古屋',0],
  ['長野県','下伊那郡豊丘村','伊那',0],
  ['愛知県','みよし市','豊田',0],
  ['長野県','下伊那郡大鹿村','伊那',0],
  ['愛知県','あま市','名古屋',0],
  ['長野県','木曽郡上松町','伊那',0],
  ['愛知県','長久手市','豊田',1],
  ['長野県','木曽郡南木曽町','伊那',0],
  ['愛知県','愛知郡東郷町','豊田',0],
  ['長野県','木曽郡木祖村','伊那',0],
  ['愛知県','西春日井郡豊山町','北名古屋',0],
  ['長野県','木曽郡王滝村','伊那',0],
  ['愛知県','丹羽郡大口町','北名古屋',0],
  ['長野県','木曽郡大桑村','伊那',0],
  ['愛知県','丹羽郡扶桑町','北名古屋',0],
  ['長野県','木曽郡木曽町','伊那',0],
  ['愛知県','海部郡大治町','名古屋',0],
  ['長野県','東筑摩郡麻績村','松本',0],
  ['愛知県','海部郡蟹江町','名古屋',0],
  ['長野県','東筑摩郡生坂村','松本',0],
  ['愛知県','海部郡飛島村','名古屋',0],
  ['長野県','東筑摩郡山形村','松本',0],
  ['愛知県','知多郡阿久比町','南名古屋',0],
  ['長野県','東筑摩郡朝日村','松本',0],
  ['愛知県','知多郡東浦町','南名古屋',0],
  ['長野県','東筑摩郡筑北村','松本',0],
  ['愛知県','知多郡南知多町','南名古屋',0],
  ['長野県','北安曇郡池田町','松本',0],
  ['愛知県','知多郡美浜町','南名古屋',0],
  ['長野県','北安曇郡松川村','松本',0],
  ['愛知県','知多郡武豊町','南名古屋',0],
  ['長野県','北安曇郡白馬村','松本',0],
  ['愛知県','額田郡幸田町','三河',1],
  ['長野県','北安曇郡小谷村','松本',0],
  ['愛知県','北設楽郡設楽町','豊橋',0],
  ['長野県','埴科郡坂城町','上田',0],
  ['愛知県','北設楽郡東栄町','豊橋',0],
  ['長野県','上高井郡小布施町','長野',0],
  ['愛知県','北設楽郡豊根村','豊橋',0],
  ['長野県','上高井郡高山村','長野',0],
  ['長野県','下高井郡山ノ内町','長野',0],
  ['長野県','下高井郡木島平村','長野',0],
  ['長野県','下高井郡野沢温泉村','長野',0],
  ['長野県','上水内郡信濃町','長野',0],
  ['長野県','上水内郡小川村','長野',0],
  ['長野県','上水内郡飯綱町','長野',0],
  ['長野県','下水内郡栄村','長野',0],
  ['茨城県','水戸市','茨城',1],
  ['栃木県','宇都宮市','栃木',1],
  ['群馬県','前橋市','高崎',1],
  ['埼玉県','さいたま市','さいたま\n浦和\n越谷',1],
  ['千葉県','千葉市','千葉南\n千葉北',1],
  ['東京都','千代田区','江東',1],
  ['神奈川県','横浜市','新横浜\n横浜南\n大和\n横須賀\n横浜都筑\n湘南\n横浜',1],
  ['茨城県','日立市','いわき',1],
  ['栃木県','足利市','佐野',1],
  ['群馬県','高崎市','高崎',1],
  ['東京都','中央区','江東',1],
  ['茨城県','土浦市','茨城',1],
  ['栃木県','栃木市','小山',1],
  ['群馬県','桐生市','高崎',1],
  ['東京都','港区','港',1],
  ['茨城県','古河市','小山',1],
  ['栃木県','佐野市','佐野',1],
  ['群馬県','伊勢崎市','高崎',1],
  ['東京都','新宿区','京北',1],
  ['茨城県','石岡市','茨城',1],
  ['栃木県','鹿沼市','栃木',0],
  ['群馬県','太田市','高崎',1],
  ['東京都','文京区','京北',1],
  ['茨城県','結城市','小山',1],
  ['栃木県','日光市','栃木',1],
  ['群馬県','沼田市','高崎',0],
  ['東京都','台東区','墨田',1],
  ['茨城県','龍ケ崎市','つくば',1],
  ['栃木県','小山市','小山',1],
  ['群馬県','館林市','佐野',1],
  ['千葉県','銚子市','千葉北',1],
  ['東京都','墨田区','墨田',1],
  ['茨城県','下妻市','小山',1],
  ['栃木県','真岡市','栃木',0],
  ['群馬県','渋川市','高崎',0],
  ['千葉県','市川市','千葉',1],
  ['東京都','江東区','江東',1],
  ['茨城県','常総市','つくば',1],
  ['栃木県','大田原市','栃木',1],
  ['群馬県','藤岡市','高崎',1],
  ['千葉県','船橋市','八千代',1],
  ['東京都','品川区','港',1],
  ['茨城県','常陸太田市','茨城',1],
  ['栃木県','矢板市','栃木',1],
  ['群馬県','富岡市','高崎',1],
  ['千葉県','館山市','木更津',1],
  ['東京都','目黒区','目黒',1],
  ['茨城県','高萩市','いわき',1],
  ['栃木県','那須塩原市','栃木',1],
  ['群馬県','安中市','高崎',1],
  ['埼玉県','川越市','川越',1],
  ['千葉県','木更津市','木更津',1],
  ['東京都','大田区','川崎',1],
  ['茨城県','北茨城市','いわき',1],
  ['栃木県','さくら市','栃木',1],
  ['群馬県','みどり市','高崎',1],
  ['埼玉県','熊谷市','熊谷',1],
  ['千葉県','松戸市','松戸',1],
  ['東京都','世田谷区','世田谷',1],
  ['茨城県','笠間市','茨城',1],
  ['栃木県','那須烏山市','栃木',1],
  ['群馬県','北群馬郡榛東村','高崎',0],
  ['埼玉県','川口市','川口',1],
  ['千葉県','野田市','柏',1],
  ['東京都','渋谷区','東京',1],
  ['茨城県','取手市','つくば',0],
  ['栃木県','下野市','小山',1],
  ['群馬県','北群馬郡吉岡町','高崎',0],
  ['埼玉県','行田市','熊谷',1],
  ['千葉県','茂原市','木更津',1],
  ['東京都','中野区','新宿',1],
  ['茨城県','牛久市','つくば',1],
  ['栃木県','河内郡上三川町','小山',1],
  ['群馬県','多野郡上野村','高崎',0],
  ['埼玉県','秩父市','熊谷',0],
  ['千葉県','成田市','千葉北',1],
  ['東京都','杉並区','東京北',1],
  ['茨城県','つくば市','つくば',1],
  ['栃木県','芳賀郡益子町','栃木',0],
  ['群馬県','多野郡神流町','高崎',0],
  ['埼玉県','所沢市','所沢',1],
  ['千葉県','佐倉市','千葉北',1],
  ['東京都','豊島区','練馬',1],
  ['茨城県','ひたちなか市','茨城',1],
  ['栃木県','芳賀郡茂木町','栃木',1],
  ['群馬県','甘楽郡下仁田町','高崎',0],
  ['埼玉県','飯能市','所沢',0],
  ['千葉県','東金市','木更津',1],
  ['東京都','北区','京北',1],
  ['茨城県','鹿嶋市','茨城',1],
  ['栃木県','芳賀郡市貝町','栃木',1],
  ['群馬県','甘楽郡南牧村','高崎',0],
  ['埼玉県','加須市','佐野',0],
  ['千葉県','旭市','千葉北',1],
  ['東京都','荒川区','足立',1],
  ['茨城県','潮来市','千葉北',1],
  ['栃木県','芳賀郡芳賀町','栃木',1],
  ['群馬県','甘楽郡甘楽町','高崎',0],
  ['埼玉県','本庄市','高崎',1],
  ['千葉県','習志野市','千葉',1],
  ['東京都','板橋区','練馬',1],
  ['神奈川県','川崎市','多摩\n横浜\n横浜都筑\n川崎幸',1],
  ['茨城県','守谷市','つくば',0],
  ['栃木県','下都賀郡壬生町','小山',1],
  ['群馬県','吾妻郡中之条町','高崎',0],
  ['埼玉県','東松山市','熊谷',1],
  ['千葉県','柏市','柏',1],
  ['東京都','練馬区','東京北',1],
  ['茨城県','常陸大宮市','茨城',1],
  ['栃木県','下都賀郡野木町','小山',1],
  ['群馬県','吾妻郡長野原町','高崎',0],
  ['埼玉県','春日部市','越谷',1],
  ['千葉県','勝浦市','木更津',1],
  ['東京都','足立区','足立',1],
  ['茨城県','那珂市','茨城',1],
  ['栃木県','塩谷郡塩谷町','栃木',1],
  ['群馬県','吾妻郡嬬恋村','高崎',0],
  ['埼玉県','狭山市','所沢',0],
  ['千葉県','市原市','千葉南',1],
  ['東京都','葛飾区','葛飾',1],
  ['茨城県','筑西市','小山',1],
  ['栃木県','塩谷郡高根沢町','栃木',1],
  ['群馬県','吾妻郡草津町','高崎',0],
  ['埼玉県','羽生市','佐野',1],
  ['千葉県','流山市','柏',1],
  ['東京都','江戸川区','葛西',1],
  ['茨城県','坂東市','小山',1],
  ['栃木県','那須郡那須町','栃木',1],
  ['群馬県','吾妻郡高山村','高崎',0],
  ['埼玉県','鴻巣市','熊谷',1],
  ['千葉県','八千代市','八千代',1],
  ['東京都','八王子市','八王子',0],
  ['茨城県','稲敷市','つくば',1],
  ['栃木県','那須郡那珂川町','栃木',0],
  ['群馬県','吾妻郡東吾妻町','高崎',0],
  ['埼玉県','深谷市','熊谷',1],
  ['千葉県','我孫子市','柏',1],
  ['東京都','立川市','東大和',0],
  ['茨城県','かすみがうら市','茨城',1],
  ['群馬県','利根郡片品村','高崎',0],
  ['埼玉県','上尾市','さいたま',1],
  ['千葉県','鴨川市','木更津',1],
  ['東京都','武蔵野市','西東京',0],
  ['神奈川県','相模原市','相模原',0],
  ['茨城県','桜川市','小山',1],
  ['群馬県','利根郡川場村','高崎',0],
  ['埼玉県','草加市','越谷',0],
  ['千葉県','鎌ケ谷市','千葉北',1],
  ['東京都','三鷹市','調布',0],
  ['茨城県','神栖市','千葉北',1],
  ['群馬県','利根郡昭和村','高崎',0],
  ['埼玉県','越谷市','越谷',1],
  ['千葉県','君津市','木更津',1],
  ['東京都','青梅市','東大和',0],
  ['茨城県','行方市','茨城',1],
  ['群馬県','利根郡みなかみ町','高崎',0],
  ['埼玉県','蕨市','浦和',0],
  ['千葉県','富津市','木更津',1],
  ['東京都','府中市','国立',0],
  ['神奈川県','横須賀市','横須賀',0],
  ['茨城県','鉾田市','茨城',1],
  ['群馬県','佐波郡玉村町','高崎',0],
  ['埼玉県','戸田市','浦和',0],
  ['千葉県','浦安市','葛西',0],
  ['東京都','昭島市','東大和',0],
  ['神奈川県','平塚市','小田原',0],
  ['茨城県','つくばみらい市','つくば',0],
  ['群馬県','邑楽郡板倉町','佐野',1],
  ['埼玉県','入間市','所沢',0],
  ['千葉県','四街道市','千葉北',1],
  ['東京都','調布市','国立',0],
  ['神奈川県','鎌倉市','湘南',0],
  ['茨城県','小美玉市','茨城',1],
  ['群馬県','邑楽郡明和町','佐野',1],
  ['埼玉県','朝霞市','浦和',1],
  ['千葉県','袖ケ浦市','木更津',0],
  ['東京都','町田市','多摩',0],
  ['神奈川県','藤沢市','湘南',1],
  ['茨城県','東茨城郡茨城町','茨城',1],
  ['群馬県','邑楽郡千代田町','高崎',1],
  ['埼玉県','志木市','浦和',1],
  ['千葉県','八街市','千葉北',1],
  ['東京都','小金井市','西東京',0],
  ['神奈川県','小田原市','小田原',0],
  ['茨城県','東茨城郡大洗町','茨城',1],
  ['群馬県','邑楽郡大泉町','高崎',1],
  ['埼玉県','和光市','浦和',1],
  ['千葉県','印西市','千葉北',1],
  ['東京都','小平市','東大和',0],
  ['神奈川県','茅ヶ崎市','厚木',1],
  ['茨城県','東茨城郡城里町','茨城',1],
  ['群馬県','邑楽郡邑楽町','高崎',1],
  ['埼玉県','新座市','所沢',1],
  ['千葉県','白井市','千葉北',1],
  ['東京都','日野市','国立',0],
  ['神奈川県','逗子市','横須賀',0],
  ['茨城県','那珂郡東海村','茨城',1],
  ['埼玉県','桶川市','熊谷',0],
  ['千葉県','富里市','千葉北',1],
  ['東京都','東村山市','東大和',0],
  ['神奈川県','三浦市','横須賀',0],
  ['茨城県','久慈郡大子町','いわき',0],
  ['埼玉県','久喜市','佐野',0],
  ['千葉県','南房総市','木更津',1],
  ['東京都','国分寺市','東大和',0],
  ['神奈川県','秦野市','小田原',0],
  ['茨城県','稲敷郡美浦村','つくば',1],
  ['埼玉県','北本市','熊谷',0],
  ['千葉県','匝瑳市','千葉北',1],
  ['東京都','国立市','国立',0],
  ['神奈川県','厚木市','厚木',0],
  ['茨城県','稲敷郡阿見町','つくば',1],
  ['埼玉県','八潮市','越谷',0],
  ['千葉県','香取市','千葉北',1],
  ['東京都','福生市','東大和',0],
  ['神奈川県','大和市','大和',1],
  ['茨城県','稲敷郡河内町','つくば',1],
  ['埼玉県','富士見市','川越',1],
  ['千葉県','山武市','千葉北',0],
  ['東京都','狛江市','国立',0],
  ['神奈川県','伊勢原市','小田原',0],
  ['茨城県','結城郡八千代町','小山',0],
  ['埼玉県','三郷市','越谷',0],
  ['千葉県','いすみ市','木更津',1],
  ['東京都','東大和市','東大和',0],
  ['神奈川県','海老名市','厚木',0],
  ['茨城県','猿島郡五霞町','小山',0],
  ['埼玉県','蓮田市','さいたま',0],
  ['千葉県','大網白里市','木更津',1],
  ['東京都','清瀬市','東大和',0],
  ['神奈川県','座間市','相模原',0],
  ['茨城県','猿島郡境町','小山',0],
  ['埼玉県','坂戸市','川越',0],
  ['千葉県','印旛郡酒々井町','千葉北',1],
  ['東京都','東久留米市','東大和',0],
  ['神奈川県','南足柄市','小田原',0],
  ['茨城県','北相馬郡利根町','つくば',1],
  ['埼玉県','幸手市','小山',0],
  ['千葉県','印旛郡栄町','千葉北',0],
  ['東京都','武蔵村山市','東大和',0],
  ['神奈川県','綾瀬市','厚木',0],
  ['埼玉県','鶴ヶ島市','川越',1],
  ['千葉県','香取郡神崎町','千葉北',1],
  ['東京都','多摩市','八王子',0],
  ['神奈川県','三浦郡葉山町','横須賀',0],
  ['埼玉県','日高市','川越',0],
  ['千葉県','香取郡多古町','千葉北',1],
  ['東京都','稲城市','多摩',0],
  ['神奈川県','高座郡寒川町','厚木',0],
  ['埼玉県','吉川市','越谷',0],
  ['千葉県','香取郡東庄町','千葉北',1],
  ['東京都','羽村市','東大和',0],
  ['神奈川県','中郡大磯町','小田原',0],
  ['埼玉県','ふじみ野市','川越',0],
  ['千葉県','山武郡九十九里町','木更津',0],
  ['東京都','あきる野市','東大和',0],
  ['神奈川県','中郡二宮町','小田原',0],
  ['埼玉県','白岡市','さいたま',0],
  ['千葉県','山武郡芝山町','千葉北',0],
  ['東京都','西東京市','東大和',0],
  ['神奈川県','足柄上郡中井町','小田原',0],
  ['埼玉県','北足立郡伊奈町','さいたま',0],
  ['千葉県','山武郡横芝光町','千葉北',1],
  ['東京都','西多摩郡瑞穂町','東大和',0],
  ['神奈川県','足柄上郡大井町','小田原',0],
  ['埼玉県','入間郡三芳町','川越',0],
  ['千葉県','長生郡一宮町','木更津',0],
  ['東京都','西多摩郡日の出町','東大和',0],
  ['神奈川県','足柄上郡松田町','小田原',0],
  ['埼玉県','入間郡毛呂山町','川越',1],
  ['千葉県','長生郡睦沢町','木更津',0],
  ['東京都','西多摩郡檜原村','東大和',0],
  ['神奈川県','足柄上郡山北町','小田原',0],
  ['埼玉県','入間郡越生町','川越',1],
  ['千葉県','長生郡長生村','木更津',0],
  ['東京都','西多摩郡奥多摩町','東大和',0],
  ['神奈川県','足柄上郡開成町','小田原',0],
  ['埼玉県','比企郡滑川町','熊谷',0],
  ['千葉県','長生郡白子町','木更津',0],
  ['東京都','大島町','東京',0],
  ['神奈川県','足柄下郡箱根町','小田原',0],
  ['埼玉県','比企郡嵐山町','熊谷',0],
  ['千葉県','長生郡長柄町','木更津',0],
  ['東京都','利島村','東京',0],
  ['神奈川県','足柄下郡真鶴町','小田原',0],
  ['埼玉県','比企郡小川町','熊谷',0],
  ['千葉県','長生郡長南町','木更津',0],
  ['東京都','新島村','東京',0],
  ['神奈川県','足柄下郡湯河原町','小田原',0],
  ['埼玉県','比企郡川島町','川越',0],
  ['千葉県','夷隅郡大多喜町','木更津',1],
  ['東京都','神津島村','東京',0],
  ['神奈川県','愛甲郡愛川町','厚木',0],
  ['埼玉県','比企郡吉見町','熊谷',0],
  ['千葉県','夷隅郡御宿町','木更津',0],
  ['東京都','三宅島三宅村','東京',0],
  ['神奈川県','愛甲郡清川村','厚木',0],
  ['埼玉県','比企郡鳩山町','熊谷',1],
  ['千葉県','安房郡鋸南町','木更津',1],
  ['東京都','御蔵島村','東京',0],
  ['埼玉県','比企郡ときがわ町','熊谷',0],
  ['東京都','八丈島八丈町','東京',0],
  ['埼玉県','秩父郡横瀬町','熊谷',0],
  ['東京都','青ヶ島村','東京',0],
  ['埼玉県','秩父郡皆野町','熊谷',0],
  ['東京都','小笠原村','東京',0],
  ['埼玉県','秩父郡長瀞町','熊谷',0],
  ['埼玉県','秩父郡小鹿野町','熊谷',0],
  ['埼玉県','秩父郡東秩父村','熊谷',0],
  ['埼玉県','児玉郡美里町','熊谷',0],
  ['埼玉県','児玉郡神川町','高崎',0],
  ['埼玉県','児玉郡上里町','高崎',1],
  ['埼玉県','大里郡寄居町','熊谷',0],
  ['埼玉県','南埼玉郡宮代町','小山',0],
  ['埼玉県','北葛飾郡杉戸町','小山',0],
  ['埼玉県','北葛飾郡松伏町','越谷',0],
  ['北海道','札幌市','札幌\n札幌東\n清田\n札幌西',0],
  ['青森県','青森市','青森',1],
  ['岩手県','盛岡市','盛岡',1],
  ['宮城県','仙台市','若林\n仙台南\n仙台',0],
  ['秋田県','秋田市','秋田',1],
  ['山形県','山形市','山形',1],
  ['福島県','福島市','福島',1],
  ['青森県','弘前市','青森',1],
  ['岩手県','宮古市','盛岡',1],
  ['秋田県','能代市','秋田',1],
  ['山形県','米沢市','福島',1],
  ['福島県','会津若松市','郡山',1],
  ['青森県','八戸市','八戸',1],
  ['岩手県','大船渡市','一関',0],
  ['秋田県','横手市','秋田',1],
  ['山形県','鶴岡市','庄内',1],
  ['福島県','郡山市','郡山',1],
  ['青森県','黒石市','青森',1],
  ['岩手県','花巻市','盛岡',1],
  ['秋田県','大館市','秋田',1],
  ['山形県','酒田市','庄内',1],
  ['福島県','いわき市','いわき',1],
  ['青森県','五所川原市','青森',1],
  ['岩手県','北上市','盛岡',1],
  ['秋田県','男鹿市','秋田',0],
  ['山形県','新庄市','庄内',0],
  ['福島県','白河市','郡山',1],
  ['青森県','十和田市','八戸',1],
  ['岩手県','久慈市','八戸',0],
  ['宮城県','石巻市','一関',1],
  ['秋田県','湯沢市','秋田',1],
  ['山形県','寒河江市','山形',1],
  ['福島県','須賀川市','郡山',1],
  ['青森県','三沢市','八戸',1],
  ['岩手県','遠野市','盛岡',1],
  ['宮城県','塩竈市','仙台',1],
  ['秋田県','鹿角市','秋田',1],
  ['山形県','上山市','山形',1],
  ['福島県','喜多方市','郡山',1],
  ['青森県','むつ市','八戸',1],
  ['岩手県','一関市','一関',1],
  ['宮城県','気仙沼市','一関',1],
  ['秋田県','由利本荘市','秋田',0],
  ['山形県','村山市','山形',1],
  ['福島県','相馬市','福島',1],
  ['青森県','つがる市','青森',1],
  ['岩手県','陸前高田市','一関',0],
  ['宮城県','白石市','福島',1],
  ['秋田県','潟上市','秋田',0],
  ['山形県','長井市','山形',0],
  ['福島県','二本松市','福島',1],
  ['青森県','平川市','青森',1],
  ['岩手県','釜石市','盛岡',1],
  ['宮城県','名取市','仙台南',1],
  ['秋田県','大仙市','秋田',1],
  ['山形県','天童市','山形',1],
  ['福島県','田村市','郡山',1],
  ['北海道','函館市','函館',1],
  ['青森県','東津軽郡平内町','青森',0],
  ['岩手県','二戸市','八戸',1],
  ['宮城県','角田市','若林',1],
  ['秋田県','北秋田市','秋田',1],
  ['山形県','東根市','山形',1],
  ['福島県','南相馬市','いわき',1],
  ['北海道','小樽市','札幌西',1],
  ['青森県','東津軽郡今別町','青森',0],
  ['岩手県','八幡平市','盛岡',1],
  ['宮城県','多賀城市','仙台',1],
  ['秋田県','にかほ市','秋田',1],
  ['山形県','尾花沢市','山形',1],
  ['福島県','伊達市','福島',1],
  ['北海道','旭川市','旭川',1],
  ['青森県','東津軽郡蓬田村','青森',0],
  ['岩手県','奥州市','一関',1],
  ['宮城県','岩沼市','若林',1],
  ['秋田県','仙北市','秋田',1],
  ['山形県','南陽市','福島',1],
  ['福島県','本宮市','郡山',1],
  ['北海道','室蘭市','苫小牧',0],
  ['青森県','東津軽郡外ヶ浜町','青森',0],
  ['岩手県','滝沢市','盛岡',1],
  ['宮城県','登米市','一関',1],
  ['秋田県','鹿角郡小坂町','秋田',0],
  ['山形県','東村山郡山辺町','山形',1],
  ['福島県','伊達郡桑折町','福島',1],
  ['北海道','釧路市','釧路',1],
  ['青森県','西津軽郡鰺ヶ沢町','青森',0],
  ['岩手県','岩手郡雫石町','盛岡',1],
  ['宮城県','栗原市','一関',1],
  ['秋田県','北秋田郡上小阿仁村','秋田',0],
  ['山形県','東村山郡中山町','山形',1],
  ['福島県','伊達郡国見町','福島',1],
  ['北海道','帯広市','帯広',1],
  ['青森県','西津軽郡深浦町','青森',0],
  ['岩手県','岩手郡葛巻町','盛岡',0],
  ['宮城県','東松島市','仙台',1],
  ['秋田県','山本郡藤里町','秋田',0],
  ['山形県','西村山郡河北町','山形',1],
  ['福島県','伊達郡川俣町','福島',1],
  ['北海道','北見市','北見',0],
  ['青森県','中津軽郡西目屋村','青森',1],
  ['岩手県','岩手郡岩手町','盛岡',1],
  ['宮城県','大崎市','一関',1],
  ['秋田県','山本郡三種町','秋田',0],
  ['山形県','西村山郡西川町','山形',1],
  ['福島県','安達郡大玉村','郡山',0],
  ['北海道','夕張市','岩見沢',1],
  ['青森県','南津軽郡藤崎町','青森',1],
  ['岩手県','紫波郡紫波町','盛岡',0],
  ['宮城県','富谷市','仙台',0],
  ['秋田県','山本郡八峰町','秋田',0],
  ['山形県','西村山郡朝日町','山形',0],
  ['福島県','岩瀬郡鏡石町','郡山',0],
  ['北海道','岩見沢市','岩見沢',1],
  ['青森県','南津軽郡大鰐町','青森',1],
  ['岩手県','紫波郡矢巾町','盛岡',0],
  ['宮城県','刈田郡蔵王町','仙台南',1],
  ['秋田県','南秋田郡五城目町','秋田',0],
  ['山形県','西村山郡大江町','山形',1],
  ['福島県','岩瀬郡天栄村','郡山',0],
  ['北海道','網走市','北見',1],
  ['青森県','南津軽郡田舎館村','青森',0],
  ['岩手県','和賀郡西和賀町','盛岡',0],
  ['宮城県','刈田郡七ヶ宿町','仙台南',1],
  ['秋田県','南秋田郡八郎潟町','秋田',0],
  ['山形県','北村山郡大石田町','山形',0],
  ['福島県','南会津郡下郷町','郡山',0],
  ['北海道','留萌市','旭川',0],
  ['青森県','北津軽郡板柳町','青森',1],
  ['岩手県','胆沢郡金ケ崎町','一関',1],
  ['宮城県','柴田郡大河原町','若林',1],
  ['秋田県','南秋田郡井川町','秋田',0],
  ['山形県','最上郡金山町','庄内',0],
  ['福島県','南会津郡檜枝岐村','郡山',0],
  ['北海道','苫小牧市','苫小牧',1],
  ['青森県','北津軽郡鶴田町','青森',0],
  ['岩手県','西磐井郡平泉町','一関',0],
  ['宮城県','柴田郡村田町','若林',1],
  ['秋田県','南秋田郡大潟村','秋田',0],
  ['山形県','最上郡最上町','庄内',0],
  ['福島県','南会津郡只見町','郡山',0],
  ['北海道','稚内市','旭川',0],
  ['青森県','北津軽郡中泊町','青森',0],
  ['岩手県','気仙郡住田町','盛岡',0],
  ['宮城県','柴田郡柴田町','若林',1],
  ['秋田県','仙北郡美郷町','秋田',0],
  ['山形県','最上郡舟形町','庄内',0],
  ['福島県','南会津郡南会津町','郡山',0],
  ['北海道','美唄市','岩見沢',0],
  ['青森県','上北郡野辺地町','八戸',0],
  ['岩手県','上閉伊郡大槌町','盛岡',0],
  ['宮城県','柴田郡川崎町','仙台南',0],
  ['秋田県','雄勝郡羽後町','秋田',0],
  ['山形県','最上郡真室川町','庄内',0],
  ['福島県','耶麻郡北塩原村','郡山',0],
  ['北海道','芦別市','岩見沢',0],
  ['青森県','上北郡七戸町','八戸',0],
  ['岩手県','下閉伊郡山田町','盛岡',0],
  ['宮城県','伊具郡丸森町','若林',1],
  ['秋田県','雄勝郡東成瀬村','秋田',0],
  ['山形県','最上郡大蔵村','庄内',0],
  ['福島県','耶麻郡西会津町','郡山',0],
  ['北海道','江別市','岩見沢',1],
  ['青森県','上北郡六戸町','八戸',0],
  ['岩手県','下閉伊郡岩泉町','盛岡',0],
  ['宮城県','亘理郡亘理町','若林',1],
  ['山形県','最上郡鮭川村','庄内',0],
  ['福島県','耶麻郡磐梯町','郡山',0],
  ['北海道','赤平市','岩見沢',0],
  ['青森県','上北郡横浜町','八戸',0],
  ['岩手県','下閉伊郡田野畑村','盛岡',0],
  ['宮城県','亘理郡山元町','若林',1],
  ['山形県','最上郡戸沢村','庄内',0],
  ['福島県','耶麻郡猪苗代町','郡山',0],
  ['北海道','紋別市','北見',1],
  ['青森県','上北郡東北町','八戸',0],
  ['岩手県','下閉伊郡普代村','盛岡',0],
  ['宮城県','宮城郡松島町','仙台',0],
  ['山形県','東置賜郡高畠町','福島',0],
  ['福島県','河沼郡会津坂下町','郡山',0],
  ['北海道','士別市','旭川',1],
  ['青森県','上北郡六ヶ所村','八戸',0],
  ['岩手県','九戸郡軽米町','八戸',0],
  ['宮城県','宮城郡七ヶ浜町','仙台',0],
  ['山形県','東置賜郡川西町','福島',0],
  ['福島県','河沼郡湯川村','郡山',0],
  ['北海道','名寄市','旭川',1],
  ['青森県','上北郡おいらせ町','八戸',0],
  ['岩手県','九戸郡野田村','八戸',0],
  ['宮城県','宮城郡利府町','仙台',0],
  ['山形県','西置賜郡小国町','福島',0],
  ['福島県','河沼郡柳津町','郡山',0],
  ['北海道','三笠市','岩見沢',0],
  ['青森県','下北郡大間町','八戸',0],
  ['岩手県','九戸郡九戸村','八戸',0],
  ['宮城県','黒川郡大和町','仙台',0],
  ['山形県','西置賜郡白鷹町','山形',0],
  ['福島県','大沼郡三島町','郡山',0],
  ['北海道','根室市','釧路',0],
  ['青森県','下北郡東通村','八戸',0],
  ['岩手県','九戸郡洋野町','八戸',0],
  ['宮城県','黒川郡大郷町','一関',0],
  ['山形県','西置賜郡飯豊町','福島',0],
  ['福島県','大沼郡金山町','郡山',0],
  ['北海道','千歳市','清田',1],
  ['青森県','下北郡風間浦村','八戸',0],
  ['岩手県','二戸郡一戸町','盛岡',0],
  ['宮城県','黒川郡大衡村','一関',0],
  ['山形県','東田川郡三川町','庄内',1],
  ['福島県','大沼郡昭和村','郡山',0],
  ['北海道','滝川市','岩見沢',1],
  ['青森県','下北郡佐井村','八戸',0],
  ['宮城県','加美郡色麻町','一関',0],
  ['山形県','東田川郡庄内町','庄内',0],
  ['福島県','大沼郡会津美里町','郡山',0],
  ['北海道','砂川市','岩見沢',1],
  ['青森県','三戸郡三戸町','八戸',0],
  ['宮城県','加美郡加美町','一関',0],
  ['山形県','飽海郡遊佐町','庄内',0],
  ['福島県','西白河郡西郷村','郡山',0],
  ['北海道','歌志内市','岩見沢',0],
  ['青森県','三戸郡五戸町','八戸',0],
  ['宮城県','遠田郡涌谷町','一関',0],
  ['福島県','西白河郡泉崎村','郡山',0],
  ['北海道','深川市','旭川',1],
  ['青森県','三戸郡田子町','八戸',0],
  ['宮城県','遠田郡美里町','一関',0],
  ['福島県','西白河郡中島村','郡山',0],
  ['北海道','富良野市','旭川',0],
  ['青森県','三戸郡南部町','八戸',0],
  ['宮城県','牡鹿郡女川町','一関',0],
  ['福島県','西白河郡矢吹町','郡山',0],
  ['北海道','登別市','苫小牧',1],
  ['青森県','三戸郡階上町','八戸',0],
  ['宮城県','本吉郡南三陸町','一関',0],
  ['福島県','東白川郡棚倉町','郡山',0],
  ['北海道','恵庭市','清田',0],
  ['青森県','三戸郡新郷村','八戸',0],
  ['福島県','東白川郡矢祭町','いわき',0],
  ['北海道','伊達市','苫小牧',0],
  ['福島県','東白川郡塙町','いわき',0],
  ['北海道','北広島市','清田',0],
  ['福島県','東白川郡鮫川村','いわき',0],
  ['北海道','石狩市','札幌西',0],
  ['福島県','石川郡石川町','郡山',0],
  ['北海道','北斗市','函館',1],
  ['福島県','石川郡玉川村','郡山',0],
  ['北海道','石狩郡当別町','岩見沢',0],
  ['福島県','石川郡平田村','いわき',0],
  ['北海道','石狩郡新篠津村','岩見沢',0],
  ['福島県','石川郡浅川町','郡山',0],
  ['北海道','松前郡松前町','函館',0],
  ['福島県','石川郡古殿町','いわき',0],
  ['北海道','松前郡福島町','函館',0],
  ['福島県','田村郡三春町','郡山',0],
  ['北海道','上磯郡知内町','函館',0],
  ['福島県','田村郡小野町','いわき',0],
  ['北海道','上磯郡木古内町','函館',0],
  ['福島県','双葉郡広野町','いわき',0],
  ['北海道','亀田郡七飯町','函館',0],
  ['福島県','双葉郡楢葉町','いわき',0],
  ['北海道','茅部郡鹿部町','函館',0],
  ['福島県','双葉郡富岡町','いわき',0],
  ['北海道','茅部郡森町','函館',0],
  ['福島県','双葉郡川内村','いわき',0],
  ['北海道','二海郡八雲町','函館',0],
  ['福島県','双葉郡大熊町','いわき',0],
  ['北海道','山越郡長万部町','函館',0],
  ['福島県','双葉郡双葉町','いわき',0],
  ['北海道','檜山郡江差町','函館',0],
  ['福島県','双葉郡浪江町','いわき',0],
  ['北海道','檜山郡上ノ国町','函館',0],
  ['福島県','双葉郡葛尾村','いわき',0],
  ['北海道','檜山郡厚沢部町','函館',0],
  ['福島県','相馬郡新地町','福島',0],
  ['北海道','爾志郡乙部町','函館',0],
  ['福島県','相馬郡飯舘村','福島',0],
  ['北海道','奥尻郡奥尻町','函館',0],
  ['北海道','瀬棚郡今金町','函館',0],
  ['北海道','久遠郡せたな町','函館',0],
  ['北海道','島牧郡島牧村','函館',0],
  ['北海道','寿都郡寿都町','苫小牧',0],
  ['北海道','寿都郡黒松内町','苫小牧',0],
  ['北海道','磯谷郡蘭越町','苫小牧',0],
  ['北海道','虻田郡ニセコ町','苫小牧',0],
  ['北海道','虻田郡真狩村','苫小牧',0],
  ['北海道','虻田郡留寿都村','苫小牧',0],
  ['北海道','虻田郡喜茂別町','苫小牧',0],
  ['北海道','虻田郡京極町','苫小牧',0],
  ['北海道','虻田郡倶知安町','札幌西',0],
  ['北海道','岩内郡共和町','札幌西',0],
  ['北海道','岩内郡岩内町','札幌西',0],
  ['北海道','古宇郡泊村','札幌西',0],
  ['北海道','古宇郡神恵内村','札幌西',0],
  ['北海道','積丹郡積丹町','札幌西',0],
  ['北海道','古平郡古平町','札幌西',0],
  ['北海道','余市郡仁木町','札幌西',0],
  ['北海道','余市郡余市町','札幌西',0],
  ['北海道','余市郡赤井川村','札幌西',0],
  ['北海道','空知郡南幌町','岩見沢',0],
  ['北海道','空知郡奈井江町','岩見沢',0],
  ['北海道','空知郡上砂川町','岩見沢',0],
  ['北海道','夕張郡由仁町','岩見沢',0],
  ['北海道','夕張郡長沼町','岩見沢',0],
  ['北海道','夕張郡栗山町','岩見沢',0],
  ['北海道','樺戸郡月形町','岩見沢',0],
  ['北海道','樺戸郡浦臼町','岩見沢',0],
  ['北海道','樺戸郡新十津川町','岩見沢',0],
  ['北海道','雨竜郡妹背牛町','旭川',0],
  ['北海道','雨竜郡秩父別町','旭川',0],
  ['北海道','雨竜郡雨竜町','旭川',0],
  ['北海道','雨竜郡北竜町','旭川',0],
  ['北海道','雨竜郡沼田町','旭川',0],
  ['北海道','上川郡鷹栖町','旭川',0],
  ['北海道','上川郡東神楽町','旭川',0],
  ['北海道','上川郡当麻町','旭川',0],
  ['北海道','上川郡比布町','旭川',0],
  ['北海道','上川郡愛別町','旭川',0],
  ['北海道','上川郡上川町','旭川',0],
  ['北海道','上川郡東川町','旭川',0],
  ['北海道','上川郡美瑛町','旭川',0],
  ['北海道','空知郡上富良野町','旭川',0],
  ['北海道','空知郡中富良野町','旭川',0],
  ['北海道','空知郡南富良野町','帯広',0],
  ['北海道','勇払郡占冠村','帯広',0],
  ['北海道','上川郡和寒町','旭川',0],
  ['北海道','上川郡剣淵町','旭川',0],
  ['北海道','上川郡下川町','旭川',0],
  ['北海道','中川郡美深町','旭川',0],
  ['北海道','中川郡音威子府村','旭川',0],
  ['北海道','中川郡中川町','旭川',0],
  ['北海道','雨竜郡幌加内町','旭川',0],
  ['北海道','増毛郡増毛町','旭川',0],
  ['北海道','留萌郡小平町','旭川',0],
  ['北海道','苫前郡苫前町','旭川',0],
  ['北海道','苫前郡羽幌町','旭川',0],
  ['北海道','苫前郡初山別村','旭川',0],
  ['北海道','天塩郡遠別町','旭川',0],
  ['北海道','天塩郡天塩町','旭川',0],
  ['北海道','宗谷郡猿払村','旭川',0],
  ['北海道','枝幸郡浜頓別町','旭川',0],
  ['北海道','枝幸郡中頓別町','旭川',0],
  ['北海道','枝幸郡枝幸町','旭川',0],
  ['北海道','天塩郡豊富町','旭川',0],
  ['北海道','礼文郡礼文町','旭川',0],
  ['北海道','利尻郡利尻町','旭川',0],
  ['北海道','利尻郡利尻富士町','旭川',0],
  ['北海道','天塩郡幌延町','旭川',0],
  ['北海道','網走郡美幌町','北見',0],
  ['北海道','網走郡津別町','北見',0],
  ['北海道','斜里郡斜里町','北見',0],
  ['北海道','斜里郡清里町','北見',0],
  ['北海道','斜里郡小清水町','北見',0],
  ['北海道','常呂郡訓子府町','北見',0],
  ['北海道','常呂郡置戸町','北見',0],
  ['北海道','常呂郡佐呂間町','北見',0],
  ['北海道','紋別郡遠軽町','北見',0],
  ['北海道','紋別郡湧別町','北見',0],
  ['北海道','紋別郡滝上町','北見',0],
  ['北海道','紋別郡興部町','北見',0],
  ['北海道','紋別郡西興部村','北見',0],
  ['北海道','紋別郡雄武町','北見',0],
  ['北海道','網走郡大空町','北見',0],
  ['北海道','虻田郡豊浦町','苫小牧',0],
  ['北海道','有珠郡壮瞥町','苫小牧',0],
  ['北海道','白老郡白老町','苫小牧',0],
  ['北海道','勇払郡厚真町','苫小牧',0],
  ['北海道','虻田郡洞爺湖町','苫小牧',0],
  ['北海道','勇払郡安平町','苫小牧',0],
  ['北海道','勇払郡むかわ町','苫小牧',0],
  ['北海道','沙流郡日高町','苫小牧',0],
  ['北海道','沙流郡平取町','苫小牧',0],
  ['北海道','新冠郡新冠町','苫小牧',0],
  ['北海道','浦河郡浦河町','苫小牧',0],
  ['北海道','様似郡様似町','苫小牧',0],
  ['北海道','幌泉郡えりも町','帯広',0],
  ['北海道','日高郡新ひだか町','苫小牧',0],
  ['北海道','河東郡音更町','帯広',0],
  ['北海道','河東郡士幌町','帯広',0],
  ['北海道','河東郡上士幌町','帯広',0],
  ['北海道','河東郡鹿追町','帯広',0],
  ['北海道','上川郡新得町','帯広',0],
  ['北海道','上川郡清水町','帯広',0],
  ['北海道','河西郡芽室町','帯広',0],
  ['北海道','河西郡中札内村','帯広',0],
  ['北海道','河西郡更別村','帯広',0],
  ['北海道','広尾郡大樹町','帯広',0],
  ['北海道','広尾郡広尾町','帯広',0],
  ['北海道','中川郡幕別町','帯広',0],
  ['北海道','中川郡池田町','帯広',0],
  ['北海道','中川郡豊頃町','帯広',0],
  ['北海道','中川郡本別町','帯広',0],
  ['北海道','足寄郡足寄町','帯広',0],
  ['北海道','足寄郡陸別町','帯広',0],
  ['北海道','十勝郡浦幌町','帯広',0],
  ['北海道','釧路郡釧路町','釧路',0],
  ['北海道','厚岸郡厚岸町','釧路',0],
  ['北海道','厚岸郡浜中町','釧路',0],
  ['北海道','川上郡標茶町','釧路',0],
  ['北海道','川上郡弟子屈町','釧路',0],
  ['北海道','阿寒郡鶴居村','釧路',0],
  ['北海道','白糠郡白糠町','釧路',0],
  ['北海道','野付郡別海町','釧路',0],
  ['北海道','標津郡中標津町','釧路',0],
  ['北海道','標津郡標津町','釧路',0],
  ['北海道','目梨郡羅臼町','釧路',0],
];

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
  const mapRef = React.useRef(null);
  const leafletRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const [view, setView] = React.useState("dustalk"); // dustalk | treaty | vendor | company
  const [loaded, setLoaded] = React.useState(false);
  const [tooltip, setTooltip] = React.useState(null); // {name, stats, x, y}

  // Load Leaflet CSS + JS
  React.useEffect(()=>{
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
  React.useEffect(()=>{
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
  React.useEffect(()=>()=>{
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
function SalesTaskPanel({ entityType, entityId, entityName, data, onSave, currentUser, users=[] }) {
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
              <div key={pj.id} style={{background:C.bg,borderRadius:"0.75rem",padding:"0.625rem 0.875rem",marginBottom:"0.4rem",border:`1px solid ${C.border}`}}>
                <div style={{fontWeight:700,fontSize:"0.85rem",color:C.text,marginBottom:"0.2rem"}}>{pj.name}</div>
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
              <div key={t.id} style={{background:"white",borderRadius:"0.75rem",padding:"0.625rem 0.875rem",marginBottom:"0.4rem",border:`1px solid ${overdue?"#fca5a5":C.border}`,display:"flex",alignItems:"center",gap:"0.625rem"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:"0.85rem",color:t.status==="完了"?C.textMuted:C.text,textDecoration:t.status==="完了"?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  {t.dueDate&&<div style={{fontSize:"0.65rem",color:overdue?"#dc2626":C.textMuted,marginTop:"0.1rem"}}>{overdue?"⚠️ ":""}期限：{t.dueDate}</div>}
                </div>
                <span style={{fontSize:"0.68rem",fontWeight:700,background:m.bg,color:m.color,borderRadius:999,padding:"0.1rem 0.45rem",flexShrink:0}}>{t.status}</span>
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
function SalesView({ data, setData, currentUser, users=[], salesTab, setSalesTab }) {
  // salesTab managed by App for persistence
  const [muniScreen,   setMuniScreen]   = useState("top"); // top|muniDetail
  const [prevTab,      setPrevTab]      = useState(null);   // for back navigation
  const [activePref,   setActivePref]   = useState(null);
  const [activeMuni,   setActiveMuni]   = useState(null);
  const [muniPickerPref, setMuniPickerPref] = useState(""); // stable state for MuniPicker
  const [activeVendor, setActiveVendor] = useState(null);
  const [activeCompany,setActiveCompany]= useState(null);
  const [sheet,        setSheet]        = useState(null);
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

  const prefs     = data.prefectures    || [];
  const munis     = data.municipalities || [];
  const vendors   = data.vendors        || [];
  const companies = data.companies      || [];


  // ── Seed 47 prefectures + municipalities on first load ───────────────────
  useEffect(()=>{
    let ndPrefs = [...prefs];
    let prefNameMap = {};
    // Seed prefs if missing
    if(prefs.length===0){
      ndPrefs = JAPAN_PREFS_SEED.map((p,i)=>({id:i+10000,name:p.name,region:p.region,createdAt:new Date().toISOString()}));
    } else if(prefs.some(p=>!p.region)){
      ndPrefs = prefs.map(p=>{if(p.region)return p;const s=JAPAN_PREFS_SEED.find(x=>x.name===p.name);return s?{...p,region:s.region}:p;});
    }
    ndPrefs.forEach(p=>{ prefNameMap[p.name]=p.id; });
    // Seed municipalities if empty
    const existingMunis = data.municipalities||[];
    if(existingMunis.length===0){
      const toAdd=[];
      MUNI_SEED_DATA.forEach(([prefName,muniName,branch,d])=>{
        const prefId=prefNameMap[prefName];
        if(!prefId)return;
        toAdd.push({
          id:Date.now()+Math.random(),
          prefectureId:prefId,
          name:muniName,
          artBranch:branch||"",
          dustalk:d===1?"展開":"未展開",
          status:"未接触",
          assigneeIds:[],treatyStatus:'未接触',memos:[],chat:[],
          createdAt:new Date().toISOString()
        });
      });
      const u={...data,prefectures:ndPrefs,municipalities:toAdd};setData(u);saveData(u);
    } else if(JSON.stringify(ndPrefs)!==JSON.stringify(prefs)){
      const u={...data,prefectures:ndPrefs};setData(u);saveData(u);
    }
  },[]);

  const save       = d=>{setData(d);saveData(d);};

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
    const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim());
    if(!lines.length) return [];
    const parseRow = line => {
      const cols=[]; let cur="", inQ=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(inQ){ if(ch==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(ch==='"')inQ=false;else cur+=ch; }
        else if(ch==='"') inQ=true;
        else if(ch===","){ cols.push(cur.trim()); cur=""; }
        else cur+=ch;
      }
      cols.push(cur.trim()); return cols;
    };
    return lines.map(parseRow);
  };

  const readFileAsText = (file) => new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result);
    r.onerror=rej;
    r.readAsText(file,"UTF-8");
  });


  const prefOf     = id=>prefs.find(p=>p.id===id);

  // ── Excel seed import ─────────────────────────────────────────────────────
  const undoImport = () => {
    // Build a set of (prefId, muniName) from seed data
    const prefNameToId = {};
    prefs.forEach(p=>{ prefNameToId[p.name]=p.id; });
    const seedKeys = new Set();
    MUNI_SEED_DATA.forEach(([prefName, muniName])=>{
      const pid = prefNameToId[prefName];
      if(pid) seedKeys.add(pid+'_'+muniName);
    });
    const filtered = munis.filter(m=>!seedKeys.has(m.prefectureId+'_'+m.name));
    const removed = munis.length - filtered.length;
    const nd = {...data, municipalities:filtered};
    save(nd);
    return removed;
  };

  const importMuniSeed = () => {
    // Build pref name → id map (use existing seeded prefs)
    const prefNameMap = {};
    prefs.forEach(p=>{ prefNameMap[p.name]=p.id; });
    // If prefs not yet seeded, seed them first
    let ndPrefs = [...prefs];
    let prefNameMap2 = {...prefNameMap};
    if(prefs.length===0){
      JAPAN_PREFS_SEED.forEach((p,i)=>{
        const id=i+10000;
        ndPrefs.push({id,name:p.name,region:p.region,createdAt:new Date().toISOString()});
        prefNameMap2[p.name]=id;
      });
    }
    const existingKeys = new Set(munis.map(m=>m.prefectureId+'_'+m.name));
    const toAdd = [];
    MUNI_SEED_DATA.forEach(([prefName,muniName,branch,d])=>{
      const prefId = prefNameMap2[prefName];
      if(!prefId) return;
      const key = prefId+'_'+muniName;
      if(existingKeys.has(key)) return;
      toAdd.push({
        id:Date.now()+Math.random(),
        prefectureId:prefId,
        name:muniName,
        artBranch:branch,
        dustalk:d===1?"展開":"未展開",
        status:"未接触",
        assigneeIds:[],treatyStatus:'未接触',memos:[],chat:[],
        createdAt:new Date().toISOString()
      });
    });
    const nd={...data,prefectures:ndPrefs,municipalities:[...munis,...toAdd]};
    save(nd);
    return toAdd.length;
  };
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
  const saveCompany=()=>{
    if(!form.name?.trim())return;
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
  const saveMuni=()=>{
    if(!form.name?.trim())return;
    let nd={...data};
    if(form.id){
      const old=munis.find(m=>m.id===form.id);
      nd={...nd,municipalities:munis.map(m=>m.id===form.id?{...m,...form}:m)};
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
  const saveVendor=()=>{
    if(!form.name?.trim())return;
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
    let nd={...data,municipalities:[...data.municipalities,...toAdd.map(n=>({id:Date.now()+Math.random(),prefectureId:activePref,name:n,dustalk:"未展開",status:"未接触",assigneeIds:[],treatyStatus:'未接触',artBranch:"",memos:[],chat:[],createdAt:new Date().toISOString()}))]};
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

  const SChip=({s,map})=>{const m=(map||VENDOR_STATUS)[s]||Object.values(map||VENDOR_STATUS)[0];return <span style={{padding:"0.15rem 0.5rem",borderRadius:999,fontSize:"0.7rem",fontWeight:700,background:m.bg,color:m.color,whiteSpace:"nowrap"}}>{s}</span>;};

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
          <div style={{fontSize:"0.62rem",color:C.textMuted,marginBottom:"0.2rem"}}>💡 @名前 でメンション通知</div>
          <div style={{display:"flex",gap:"0.4rem"}}>
            <input value={chatInputs[entityId]||""} onChange={e=>setChatInputs(p=>({...p,[entityId]:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();addChat(entityKey,entityId,chatInputs[entityId]||"");}}}
              placeholder="メッセージを入力..."
              style={{flex:1,padding:"0.5rem 0.75rem",borderRadius:"0.75rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
            <button onClick={()=>addChat(entityKey,entityId,chatInputs[entityId]||"")} disabled={!(chatInputs[entityId]||"").trim()}
              style={{padding:"0.5rem 0.875rem",borderRadius:"0.75rem",border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",opacity:(chatInputs[entityId]||"").trim()?1:0.4}}>
              送信
            </button>
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
        <MapTab
          prefs={prefs} munis={munis} vendors={vendors} companies={companies}
          prefCoords={PREF_COORDS}
          onSelectPref={(prefId)=>{setActivePref(prefId);setSalesTab("muni");setMuniScreen("top");}}
        />
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
            <button onClick={()=>setActiveCompany(null)} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0}}>‹ 一覧</button>
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
            {[["memo","📝","メモ"],["chat","💬","チャット"],["tasks","✅","タスク"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.78rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&compChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{compChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===comp.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>
          {activeDetail==="memo"&&MemoSection({memos:comp.memos,entityKey:"companies",entityId:comp.id})}
          {activeDetail==="chat"&&ChatSection({chat:comp.chat,entityKey:"companies",entityId:comp.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="企業" entityId={comp.id} entityName={comp.name} data={data} onSave={save} currentUser={currentUser} users={users}/>}
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
      items:companies.filter(c=>c.status===s&&(!compSearch||c.name.includes(compSearch)))
    })).filter(g=>g.items.length>0||(compSearch&&companies.some(c=>c.status===s)));
    const searchedComps = compSearch ? companies.filter(c=>c.name.includes(compSearch)) : null;
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
                <div key={c.id} onClick={()=>{setActiveCompany(c.id);setActiveDetail("memo");}}
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
              const items=companies.filter(c=>c.status===s);
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
                          <div key={c.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(c.id)?n.delete(c.id):n.add(c.id);return n;});return;}setActiveCompany(c.id);setActiveDetail("memo");}}
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
            const existNames=new Set(companies.map(c=>c.name));
            const toAdd=preview.filter(r=>!existNames.has(r.name)).map(r=>({
              id:Date.now()+Math.random(),
              name:r.name, status:r.status||"未接触",
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
                  <div style={{fontSize:"0.7rem",color:C.textMuted,marginTop:"0.2rem"}}>UTF-8 CSV形式</div>
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
              else setActiveVendor(null);
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
            {[["memo","📝","メモ"],["chat","💬","チャット"],["tasks","✅","タスク"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setActiveDetail(id)} style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:"0.78rem",position:"relative",background:activeDetail===id?C.accent:"transparent",color:activeDetail===id?"white":C.textSub}}>
                {icon} {lbl}
                {id==="chat"&&vendChatUnread>0&&<span style={{position:"absolute",top:3,right:6,background:"#dc2626",color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{vendChatUnread}</span>}
                {id==="tasks"&&(()=>{const n=(data.tasks||[]).filter(t=>t.salesRef?.id===v.id&&t.status!=="完了").length;return n>0?<span style={{position:"absolute",top:3,right:6,background:C.accent,color:"white",borderRadius:999,fontSize:"0.5rem",fontWeight:800,padding:"0.05rem 0.25rem",lineHeight:1.4}}>{n}</span>:null;})()}
              </button>
            ))}
          </div>
          {activeDetail==="memo"&&MemoSection({memos:v.memos,entityKey:"vendors",entityId:v.id})}
          {activeDetail==="chat"&&ChatSection({chat:v.chat,entityKey:"vendors",entityId:v.id})}
          {activeDetail==="tasks"&&<SalesTaskPanel entityType="業者" entityId={v.id} entityName={v.name} data={data} onSave={save} currentUser={currentUser} users={users}/>}
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
    const searchedVendors = vendSearch ? vendors.filter(v=>v.name.includes(vendSearch)) : null;
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
                <div key={v.id} onClick={()=>{setActiveVendor(v.id);setActiveDetail("memo");}}
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
                          <div key={v.id} onClick={()=>{if(bulkMode){setBulkSelected(prev=>{const n=new Set(prev);n.has(v.id)?n.delete(v.id):n.add(v.id);return n;});return;}setActiveVendor(v.id);setActiveDetail("memo");}}
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
                notes:r[6]?.trim()||"",
                address:r[7]?.trim()||"",
              })).filter(r=>r.name);
              setPreview(mapped); setErr("");
            }catch(e){setErr("ファイルの読み込みに失敗しました。");}
          };
          const doImport=()=>{
            if(!preview?.length)return;
            const existNames=new Set(vendors.map(v=>v.name));
            const toAdd=preview.filter(r=>!existNames.has(r.name)).map(r=>{
              // Resolve municipality IDs from names
              const mids=r.muniNames.map(mn=>munis.find(m=>m.name===mn)?.id).filter(Boolean);
              return {
                id:Date.now()+Math.random(),
                name:r.name, status:r.status||"未接触",
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
          <button onClick={()=>{setMuniScreen("top");setActiveMuni(null);}} style={{background:"none",border:"none",color:C.textSub,fontWeight:700,fontSize:"0.85rem",cursor:"pointer",padding:0}}>‹ {pref?.name||"一覧"}</button>
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
        {activeDetail==="tasks"&&<SalesTaskPanel entityType="自治体" entityId={muni.id} entityName={muni.name} data={data} onSave={save} currentUser={currentUser} users={users}/>}
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
            <div style={{display:"flex",gap:"0.625rem"}}>
              <Btn variant="secondary" style={{flex:1}} onClick={()=>{setSheet(null);setSalesTab("muni");}}>キャンセル</Btn>
              <Btn style={{flex:2}} onClick={()=>{saveVendor();setSalesTab("muni");}} disabled={!form.name?.trim()}>追加する</Btn>
            </div>
          </Sheet>
        )}
        {sheet==="linkVendor"&&(()=>{
          const already=mvend.map(v=>v.id);
          const linkable=vendors.filter(v=>!already.includes(v.id)&&(v.name.includes(linkVendorSearch)||!linkVendorSearch));
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

const DUSTALK_DEF = {hp:0,serviceLog:0,requests:0,contracts:0,revenue:0,
  pay:{cc:0,paypay:0,merpay:0,cash:0},
  exits:{top:0,location:0,requestContent:0,date:0,info:0,confirm:0,complete:0,estimateSubmit:0,estimateConfirm:0,contract:0}};
const REBIT_DEF  = {cumulative:0,monthly:0};
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
    exits:{...DUSTALK_DEF.exits,...(raw.exits||{})}};
}

function AnalyticsView({data,setData}) {
  const [sys,     setSys]     = useState("dustalk");
  const [mk,      setMk]      = useState(getMonthKey());
  const [yk,      setYk]      = useState(getYearKey());
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(null);
  const [chart,   setChart]   = useState(null); // {section, metricIdx}

  const ana     = data.analytics || {};
  const sysData = ana[sys] || {};

  const key = sys==="bizcon" ? yk : mk;
  const raw = sysData[key] || {};

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
    const u = {...data, analytics:{...ana,[sys]:{...sysData,[key]:saved}}};
    setData(u); saveData(u); setEditing(false); setDraft(null);
  };

  const switchSys = (id) => { setSys(id); setEditing(false); setDraft(null); setChart(null); };

  const d    = editing ? draft : getCurrent();
  const prev = getPrev();
  const setD = (patch) => setDraft(p => ({...p,...patch}));

  // ── chart definitions per section ────────────────────────────────────────
  const CHART_DEFS = {
    dustalk: {
      "基本指標": [
        {label:"HP閲覧数",   unit:"PV",  get:(m)=>m?.hp||0},
        {label:"サービスログ",unit:"件",  get:(m)=>m?.serviceLog||0},
        {label:"依頼数",     unit:"件",  get:(m)=>m?.requests||0},
        {label:"成約数",     unit:"件",  get:(m)=>m?.contracts||0},
        {label:"売上",       unit:"円",  get:(m)=>m?.revenue||0},
        {label:"成約率",     unit:"%",   get:(m)=>m?.requests>0?+((m.contracts/m.requests)*100).toFixed(1):0},
      ],
      "支払方法内訳": PAY_KEYS.map(([k,lbl])=>({label:lbl, unit:"件", get:(m)=>m?.pay?.[k]||0})),
      "離脱率管理": DUSTALK_EXIT_STEPS.map(s=>({label:s.label, unit:"人", get:(m)=>m?.exits?.[s.key]||0})),
    },
    rebit: {
      "ユーザー数": [
        {label:"月間ユーザー数", unit:"人", get:(m)=>m?.monthly||0},
        {label:"累積ユーザー数", unit:"人", get:(m)=>m?.cumulative||0},
      ],
    },
    bizcon: {},
  };

  // Build last-12-months data points for dustalk/rebit
  const buildMonthSeries = (metricFn) => {
    const months = Array.from({length:12},(_,i)=>{
      const k = shiftMonth(mk, i-11);
      const raw2 = sysData[k] || {};
      const merged = sys==="dustalk" ? mergeDustalk(raw2) : {...REBIT_DEF,...raw2};
      return {label: monthLabel(k).replace(/\d+年/,""), value: metricFn(merged)};
    });
    return months;
  };

  // ── SVG bar chart ─────────────────────────────────────────────────────────
  const BarChart = ({points, unit, color=C.accent}) => {
    const W=320, H=160, PL=0, PR=0, PT=20, PB=32;
    const innerW=W-PL-PR, innerH=H-PT-PB;
    const maxV = Math.max(...points.map(p=>p.value), 1);
    const barW  = innerW / points.length;
    const fmt = v => v>=10000 ? (v/10000).toFixed(1)+"万" : v>=1000 ? (v/1000).toFixed(1)+"k" : String(v);

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
        {/* grid lines */}
        {[0,0.5,1].map(r=>{
          const y = PT + innerH*(1-r);
          return <line key={r} x1={PL} y1={y} x2={PL+innerW} y2={y} stroke={C.borderLight} strokeWidth={1}/>;
        })}
        {/* bars */}
        {points.map((p,i)=>{
          const bh   = Math.max(2, (p.value/maxV)*innerH);
          const x    = PL + i*barW + barW*0.15;
          const bw   = barW*0.7;
          const y    = PT + innerH - bh;
          const isNow= i===points.length-1;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={bh}
                fill={isNow?C.accentDark:color} rx={3}
                opacity={isNow?1:0.65}/>
              {p.value>0&&bh>18&&(
                <text x={x+bw/2} y={y-4} textAnchor="middle"
                  fontSize={9} fill={C.textSub} fontWeight={isNow?700:400}>
                  {fmt(p.value)}
                </text>
              )}
              {p.value>0&&bh<=18&&(
                <text x={x+bw/2} y={y-3} textAnchor="middle"
                  fontSize={9} fill={C.textSub} fontWeight={isNow?700:400}>
                  {fmt(p.value)}
                </text>
              )}
              <text x={x+bw/2} y={H-2} textAnchor="middle"
                fontSize={8.5} fill={isNow?C.accentDark:C.textMuted}
                fontWeight={isNow?800:400}>
                {p.label}
              </text>
            </g>
          );
        })}
        {/* Y-axis label */}
        <text x={PL} y={PT-6} fontSize={8} fill={C.textMuted}>{fmt(maxV)}{unit}</text>
      </svg>
    );
  };

  // ── chart modal ───────────────────────────────────────────────────────────
  const ChartModal = () => {
    if (!chart) return null;
    const defs   = CHART_DEFS[sys]?.[chart.section] || [];
    const midx   = chart.metricIdx || 0;
    const metric = defs[midx];
    if (!metric) return null;
    const points = buildMonthSeries(metric.get);

    return (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:400,
        display:"flex",alignItems:"flex-end",justifyContent:"center"}}
        onClick={()=>setChart(null)}>
        <div onClick={e=>e.stopPropagation()}
          style={{background:"white",borderRadius:"1.25rem 1.25rem 0 0",
            width:"100%",maxWidth:680,padding:"1.5rem 1.25rem 2rem",boxSizing:"border-box",
            maxHeight:"80vh",overflowY:"auto"}}>
          {/* handle */}
          <div style={{width:36,height:4,background:C.border,borderRadius:999,margin:"0 auto 1.25rem"}}/>
          {/* header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
            <div>
              <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{chart.section}</div>
              <div style={{fontSize:"0.72rem",color:C.textMuted,marginTop:"0.15rem"}}>直近12ヶ月</div>
            </div>
            <button onClick={()=>setChart(null)}
              style={{background:"none",border:"none",fontSize:"1.4rem",cursor:"pointer",color:C.textSub,lineHeight:1}}>✕</button>
          </div>
          {/* metric tabs */}
          <div style={{display:"flex",flexWrap:"wrap",gap:"0.35rem",marginBottom:"1.25rem"}}>
            {defs.map((m,i)=>(
              <button key={i} onClick={()=>setChart({...chart,metricIdx:i})}
                style={{padding:"0.3rem 0.75rem",borderRadius:999,fontSize:"0.75rem",fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${i===midx?C.accent:C.border}`,
                  background:i===midx?C.accentBg:"white",
                  color:i===midx?C.accentDark:C.textSub}}>
                {m.label}
              </button>
            ))}
          </div>
          {/* chart */}
          <div style={{padding:"0.5rem 0"}}>
            <BarChart points={points} unit={metric.unit}/>
          </div>
          {/* current value callout */}
          <div style={{marginTop:"0.75rem",background:C.accentBg,borderRadius:"0.875rem",
            padding:"0.75rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:"0.82rem",color:C.accentDark,fontWeight:700}}>
              {monthLabel(mk)} ({metric.label})
            </span>
            <span style={{fontSize:"1.15rem",fontWeight:800,color:C.accentDark}}>
              {points[11]?.value?.toLocaleString()}{metric.unit}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const rowStyle = {display:"flex",alignItems:"center",padding:"0.7rem 0",borderBottom:`1px solid ${C.borderLight}`};

  const Diff = ({cur,prv}) => {
    if (prv==null||prv===0&&cur===0) return null;
    const diff=cur-prv, pct=prv!==0?((diff/prv)*100).toFixed(1):null, up=diff>=0;
    return (
      <span style={{fontSize:"0.65rem",fontWeight:700,marginLeft:"0.4rem",
        color:up?"#059669":"#dc2626",background:up?"#d1fae5":"#fee2e2",
        padding:"0.1rem 0.4rem",borderRadius:999}}>
        {up?"▲":"▼"}{Math.abs(diff).toLocaleString()}{pct!=null?` (${pct}%)` :""}
      </span>
    );
  };

  // Sect now accepts optional chartKey to show 📊 button
  const Sect = ({label,children,chartKey}) => {
    const hasDefs = chartKey && (CHART_DEFS[sys]?.[chartKey]||[]).length>0;
    return (
      <div style={{marginBottom:"1.25rem"}}>
        <div style={{display:"flex",alignItems:"center",borderBottom:`2px solid ${C.accent}`,marginBottom:"0.1rem"}}>
          <div style={{flex:1,fontSize:"0.7rem",fontWeight:800,color:C.textSub,
            textTransform:"uppercase",letterSpacing:"0.05em",padding:"0.35rem 0"}}>
            {label}
          </div>
          {hasDefs&&!editing&&(
            <button onClick={()=>setChart({section:chartKey,metricIdx:0})}
              style={{background:C.accentBg,border:`1px solid ${C.accent}40`,borderRadius:"0.4rem",
                padding:"0.2rem 0.5rem",fontSize:"0.68rem",fontWeight:700,
                color:C.accentDark,cursor:"pointer",display:"flex",alignItems:"center",gap:"0.25rem",
                fontFamily:"inherit",marginBottom:"0.2rem"}}>
              📊 グラフ
            </button>
          )}
        </div>
        {children}
      </div>
    );
  };

  const InputNum = ({value,onChange}) => (
    <input type="number" inputMode="decimal" value={value??0}
      onChange={e=>onChange(isNaN(+e.target.value)?0:+e.target.value)}
      style={{width:86,padding:"0.3rem 0.5rem",borderRadius:"0.5rem",
        border:`1.5px solid ${C.accent}`,fontSize:"0.9rem",textAlign:"right",
        fontFamily:"inherit",outline:"none"}}/>
  );

  const Row = ({label,val,onChange,unit="",prefix="",prevVal}) => (
    <div style={{...rowStyle,gap:"0.5rem"}}>
      <span style={{fontSize:"0.87rem",color:C.text,flex:1}}>{label}</span>
      {editing ? (
        <div style={{display:"flex",alignItems:"center",gap:"0.35rem",flexShrink:0}}>
          {prefix&&<span style={{fontSize:"0.82rem",color:C.textSub}}>{prefix}</span>}
          <InputNum value={val} onChange={onChange}/>
          {unit&&<span style={{fontSize:"0.75rem",color:C.textSub}}>{unit}</span>}
        </div>
      ) : (
        <span style={{fontSize:"1rem",fontWeight:700,color:C.text,flexShrink:0,display:"flex",alignItems:"center"}}>
          {prefix}{(+val||0).toLocaleString()}{unit}
          {prevVal!=null&&<Diff cur={+val||0} prv={+prevVal||0}/>}
        </span>
      )}
    </div>
  );

  const CalcRow = ({label,val,color=C.blue,sub}) => (
    <div style={{...rowStyle,gap:"0.5rem"}}>
      <div style={{flex:1}}>
        <span style={{fontSize:"0.87rem",color:C.text}}>{label}</span>
        {sub&&<div style={{fontSize:"0.68rem",color:C.textMuted}}>{sub}</div>}
      </div>
      <span style={{fontSize:"1rem",fontWeight:700,color,flexShrink:0}}>{val}</span>
    </div>
  );

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

      {/* Period selector — month for most, year for bizcon */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",
        background:"white",borderRadius:"0.875rem",padding:"0.625rem 1rem",border:`1px solid ${C.border}`}}>
        {sys==="bizcon" ? (
          <>
            <button onClick={()=>setYk(shiftYear(yk,-1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem",borderRadius:"0.4rem"}}>‹</button>
            <span style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{yearLabel(yk)}</span>
            <button onClick={()=>setYk(shiftYear(yk,+1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem",borderRadius:"0.4rem"}}>›</button>
          </>
        ) : (
          <>
            <button onClick={()=>setMk(shiftMonth(mk,-1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem",borderRadius:"0.4rem"}}>‹</button>
            <span style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>{monthLabel(mk)}</span>
            <button onClick={()=>setMk(shiftMonth(mk,+1))} style={{background:"none",border:"none",fontSize:"1.2rem",cursor:"pointer",color:C.textSub,padding:"0.2rem 0.4rem",borderRadius:"0.4rem"}}>›</button>
          </>
        )}
      </div>

      {/* bee-net placeholder */}
      {sys==="beenet" && (
        <div style={{textAlign:"center",padding:"4rem 1rem",color:C.textMuted,
          background:"white",borderRadius:"0.875rem",border:`1.5px dashed ${C.border}`}}>
          <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🚧</div>
          <div style={{fontWeight:700,marginBottom:"0.35rem"}}>bee-net</div>
          <div style={{fontSize:"0.82rem"}}>準備中</div>
        </div>
      )}

      {/* Data panel */}
      {sys!=="beenet" && (
        <Card style={{padding:"1.25rem"}}>
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
          {sys==="dustalk" && <>
            <Sect label="基本指標" chartKey="基本指標">
              <Row label="HP閲覧数"     val={d.hp}         onChange={v=>setD({hp:v})}         unit="PV"  prevVal={prev.hp}/>
              <Row label="サービスログ" val={d.serviceLog} onChange={v=>setD({serviceLog:v})} unit="件"  prevVal={prev.serviceLog}/>
              <Row label="依頼数"       val={d.requests}   onChange={v=>setD({requests:v})}   unit="件"  prevVal={prev.requests}/>
              <Row label="成約数"       val={d.contracts}  onChange={v=>setD({contracts:v})}  unit="件"  prevVal={prev.contracts}/>
              <CalcRow label="成約率" val={convRate==="－"?"－":convRate+"%"} sub="成約数 ÷ 依頼数 × 100"/>
              <Row label="売上"         val={d.revenue}    onChange={v=>setD({revenue:v})}    prefix="¥" prevVal={prev.revenue}/>
              <CalcRow label="成約平均単価" val={avgPrice==="－"?"－":avgPrice+"円"} sub="売上 ÷ 成約数"/>
            </Sect>

            <Sect label="支払方法内訳" chartKey="支払方法内訳">
              {/* header */}
              <div style={{display:"flex",padding:"0.3rem 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{flex:1,fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>決済方法</span>
                <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>今月</span>
                <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>月%</span>
                <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>累計</span>
                <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>累計%</span>
              </div>
              {PAY_KEYS.map(([k,lbl])=>{
                const monthVal = +d.pay?.[k]||0;
                const monthPct = payTotal>0 ? ((monthVal/payTotal)*100).toFixed(0) : 0;
                const cumVal   = cumPay[k]||0;
                const cumPct   = cumPayTotal>0 ? ((cumVal/cumPayTotal)*100).toFixed(0) : 0;
                return (
                  <div key={k} style={{...rowStyle,gap:"0.25rem"}}>
                    <span style={{flex:1,fontSize:"0.85rem",color:C.text}}>{lbl}</span>
                    {editing ? (
                      <InputNum value={d.pay?.[k]??0}
                        onChange={v=>setDraft(p=>({...p,pay:{...p.pay,[k]:v}}))}/>
                    ) : (
                      <>
                        <span style={{width:52,textAlign:"right",fontSize:"0.9rem",fontWeight:700,color:C.text}}>{monthVal}件</span>
                        <span style={{width:52,textAlign:"right",fontSize:"0.82rem",color:C.blue,fontWeight:600}}>{monthPct}%</span>
                        <span style={{width:52,textAlign:"right",fontSize:"0.82rem",color:C.textSub}}>{cumVal}件</span>
                        <span style={{width:52,textAlign:"right",fontSize:"0.82rem",color:C.textSub}}>{cumPct}%</span>
                      </>
                    )}
                  </div>
                );
              })}
              {!editing&&<div style={{padding:"0.4rem 0",textAlign:"right"}}>
                <span style={{fontSize:"0.72rem",color:C.textSub}}>今月合計: {payTotal}件　累計: {cumPayTotal}件</span>
              </div>}
            </Sect>

            <Sect label="離脱率管理" chartKey="離脱率管理">
              {/* header */}
              <div style={{display:"flex",padding:"0.3rem 0",borderBottom:`1px solid ${C.border}`}}>
                <span style={{flex:1,fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>ステップ</span>
                <span style={{width:52,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>離脱数</span>
                <span style={{width:56,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>到達率</span>
                <span style={{width:56,textAlign:"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted}}>離脱率</span>
              </div>
              {DUSTALK_EXIT_STEPS.map((step,i)=>{
                const val     = +d.exits?.[step.key]||0;
                const topVal  = exitBase||0;
                const reachPct= topVal>0 ? ((val/topVal)*100).toFixed(1) : "－";
                const nextStep= DUSTALK_EXIT_STEPS[i+1];
                const nextVal = nextStep ? (+d.exits?.[nextStep.key]||0) : null;
                const exitPct = val>0&&nextVal!=null ? (((val-nextVal)/val)*100).toFixed(1)+"%" : (i===DUSTALK_EXIT_STEPS.length-1&&val>0?"0.0%":"－");
                const isLow   = parseFloat(exitPct)>50;
                return (
                  <div key={step.key} style={{...rowStyle,gap:"0.25rem"}}>
                    <span style={{flex:1,fontSize:"0.83rem",color:C.text}}>{step.label}</span>
                    {editing ? (
                      <InputNum value={d.exits?.[step.key]??0}
                        onChange={v=>setDraft(p=>({...p,exits:{...p.exits,[step.key]:v}}))}/>
                    ) : (
                      <>
                        <span style={{width:52,textAlign:"right",fontSize:"0.88rem",fontWeight:700,color:C.text}}>{val.toLocaleString()}</span>
                        <span style={{width:56,textAlign:"right",fontSize:"0.82rem",color:C.blue,fontWeight:600}}>{reachPct==="－"?"－":reachPct+"%"}</span>
                        <span style={{width:56,textAlign:"right",fontSize:"0.82rem",fontWeight:700,color:isLow?"#dc2626":C.textSub}}>{exitPct}</span>
                      </>
                    )}
                  </div>
                );
              })}
              {!editing&&exitBase>0&&<div style={{padding:"0.4rem 0",fontSize:"0.68rem",color:C.textMuted,textAlign:"right"}}>
                ※到達率はトップ画面({exitBase.toLocaleString()}人)を基準
              </div>}
            </Sect>
          </>}

          {/* ── REBIT ── */}
          {sys==="rebit" && <>
            <Sect label="ユーザー数" chartKey="ユーザー数">
              <CalcRow label="累積ユーザー数" val={(+d.cumulative||0).toLocaleString()+"人"} sub="月間の合計から自動計算"/>
              <Row label="月間ユーザー数" val={d.monthly} onChange={v=>setD({monthly:v})} unit="人"/>
            </Sect>
            {editing&&<div style={{background:C.accentBg,border:`1px solid ${C.accent}30`,borderRadius:"0.75rem",padding:"0.75rem",fontSize:"0.8rem",color:C.accentDark}}>
              💡 月間ユーザー数を変更すると、差分が累積に自動加算されます
            </div>}
          </>}

          {/* ── BIZCON ── */}
          {sys==="bizcon" && <>
            <Sect label="申込">
              <Row label="申込者数"   val={d.applicants}     onChange={v=>setD({applicants:v})}     unit="人"/>
              <Row label="本申込者数" val={d.fullApplicants} onChange={v=>setD({fullApplicants:v})} unit="人"/>
              <CalcRow label="本申込転換率" val={d.applicants>0?((d.fullApplicants/d.applicants)*100).toFixed(1)+"%":"－"}/>
            </Sect>
            <Sect label="HP閲覧数">
              {/* 年間合計（自動計算・読み取り専用） */}
              <CalcRow
                label="年間合計"
                val={Object.values(d.hpByMonth||{}).reduce((s,v)=>s+(+v||0),0).toLocaleString()+"PV"}
                sub="月間の合計から自動計算"
                color={C.blue}
              />
              {/* 月ごとの入力 */}
              {Array.from({length:12},(_,i)=>i+1).map(m=>{
                const val = d.hpByMonth?.[m]??0;
                return (
                  <div key={m} style={{...rowStyle,gap:"0.5rem"}}>
                    <span style={{fontSize:"0.85rem",color:C.text,flex:1}}>{m}月</span>
                    {editing ? (
                      <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}>
                        <InputNum value={val}
                          onChange={v=>setDraft(p=>({...p,hpByMonth:{...(p.hpByMonth||{}),[m]:v}}))}/>
                        <span style={{fontSize:"0.75rem",color:C.textSub}}>PV</span>
                      </div>
                    ) : (
                      <span style={{fontSize:"0.9rem",fontWeight:700,color:C.text}}>{(+val||0).toLocaleString()}PV</span>
                    )}
                  </div>
                );
              })}
            </Sect>
          </>}
        </Card>
      )}
      <ChartModal/>
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
  const [pjTab,setPjTab]      =useState(()=>localStorage.getItem("md_pjTab")||"tasks");
  const [loaded,setLoaded]   = useState(false);
  const [showUserMenu,setShowUserMenu] = useState(false);
  const [showNotifPanel,setShowNotifPanel] = useState(false);
  const [notifFilter,setNotifFilter] = useState("all"); // all|unread|memo|chat|task
  const persistTab = (key,val,setter) => { localStorage.setItem(key,val); setter(val); };

  const appNotifs = (data.notifications||[]).filter(n=>n.toUserId===currentUser?.id);
  const appUnread = appNotifs.filter(n=>!n.read);
  const markAllRead = () => {
    const nd={...data,notifications:(data.notifications||[]).map(n=>n.toUserId===currentUser?.id?{...n,read:true}:n)};
    setData(nd); saveData(nd);
  };
  const markOneRead = (id) => {
    const nd={...data,notifications:(data.notifications||[]).map(n=>n.id===id?{...n,read:true}:n)};
    setData(nd); saveData(nd);
  };
  const NOTIF_ICON = {task_assign:"👤",task_status:"🔄",task_comment:"💬",mention:"💬",memo:"📝",deadline:"⏰",sales_assign:"🏛️"};

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

  // ── Supabase リアルタイム同期（30秒ポーリング）────────────────────────────
  useEffect(()=>{
    if(!currentUser) return;
    const poll = async () => {
      try {
        const [d, u] = await Promise.all([loadData(), loadUsers()]);
        setData(d); setUsers(u);
        // セッションユーザーの最新情報を反映
        const fresh = u.find(x=>x.id===currentUser.id);
        if(fresh) setCurrentUser(cu=>(cu.name===fresh.name&&cu.email===fresh.email)?cu:fresh);
      } catch {}
    };
    const id = setInterval(poll, 30000);
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
    // 新しく追加された通知を検出してプッシュ送信
    const newNotifs = (nd.notifications||[]).filter(n=>
      !(notifsBefore||[]).some(o=>o.id===n.id)
    );
    if(!newNotifs.length) return;
    // ユーザー別にグループ化して送信
    const byUser = {};
    newNotifs.forEach(n=>{
      if(!byUser[n.toUserId]) byUser[n.toUserId]={title:n.title,body:n.body,tag:n.type};
      // 複数あれば最初の1件だけ
    });
    Object.entries(byUser).forEach(([uid,{title,body,tag}])=>{
      if(uid!==currentUser?.id) sendPushToUsers([uid],title,body,tag);
    });
  };

  // ── プッシュ通知購読 ───────────────────────────────────────────────────────
  const subscribePush = async (userId) => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
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
    } catch(e) { console.warn('Push subscribe failed:', e); return false; }
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
  ];

  if (!loaded) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"1rem"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:44,height:44,borderRadius:"50%",border:`3px solid ${C.accent}`,borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:C.textSub,fontSize:"0.9rem",fontWeight:600}}>読み込み中...</div>
    </div>
  );

  if (!currentUser) return <AuthScreen onLogin={handleLogin}/>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{background:"white",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 0 rgba(0,0,0,0.04)"}}>
        <div style={{maxWidth:680,margin:"0 auto",padding:"0 1rem"}}>
          <div style={{display:"flex",alignItems:"center",height:56,gap:"0.75rem"}}>
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
                {[["all","すべて",null],["unread","未読",null],["deadline","⏰ 期限","deadline"],["memo","📝 メモ","memo"],["mention","💬 メンション","mention"],["task_assign","👤 タスク","task_assign"],["task_status","🔄 ステータス","task_status"]].map(([id,lbl,type])=>{
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

      {/* Content */}
      <div style={{flex:1,maxWidth:680,margin:"0 auto",width:"100%",padding:"1.25rem 1rem 6rem",boxSizing:"border-box"}}>
        {tab==="tasks"     && <TaskView      data={data} setData={setData} users={users} currentUser={currentUser}
          taskTab={taskTab} setTaskTab={(v)=>persistTab('md_taskTab',v,setTaskTab)}
          pjTab={pjTab} setPjTab={(v)=>persistTab('md_pjTab',v,setPjTab)}/>}
        {tab==="schedule"  && <ScheduleView/>}
        {tab==="email"     && <EmailView     data={data} setData={setData} currentUser={currentUser}/>}
        {tab==="sales"     && <SalesView     data={data} setData={setData} currentUser={currentUser} users={users}
          salesTab={salesTab} setSalesTab={(v)=>persistTab("md_salesTab",v,setSalesTab)}/>}
        {tab==="analytics" && <AnalyticsView data={data} setData={setData}/>}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:`1px solid ${C.border}`,boxShadow:"0 -2px 16px rgba(0,0,0,0.06)",zIndex:100}}>
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
    </div>
  );
}
