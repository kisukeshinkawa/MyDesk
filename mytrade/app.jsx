import React, { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// MyTrade — 投資専用スタンドアロンアプリ (MyDeskから分離)
// バックエンド: mydesk-stock-analysis Lambda (共用・変更不要)
// ═══════════════════════════════════════════════════════════════
const MYTRADE_BUILD = "2026-08-07-v16-indicators";
if (typeof window !== "undefined") {
  window.__MYTRADE_BUILD = MYTRADE_BUILD;
  console.log(`[MyTrade] Build: ${MYTRADE_BUILD}`);
}

const DB_API_SECRET = "mydesk2026secret";
const DB_API_HEADERS = {
  "Content-Type": "application/json",
  "x-mydesk-secret": DB_API_SECRET,
};
// 分析Lambda(mytrade-analysis)のFunction URL。
// デプロイ時に VITE_STOCK_API_URL で注入される(未設定なら初回画面から貼り付け→localStorage保存)
const STOCK_API_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_STOCK_API_URL) || "";

class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:""};}
  static getDerivedStateFromError(e){return{hasError:true,error:e?.message||String(e)};}
  componentDidCatch(e,info){console.error("ErrorBoundary caught:",e,info);}
  render(){
    if(this.state.hasError){
      return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,padding:"2rem",textAlign:"center"}}>
          <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:"1rem",color:"#DA1313",marginBottom:"0.5rem"}}>表示エラーが発生しました</div>
          <div style={{fontSize:"0.78rem",color:"#6b7280",marginBottom:"1.5rem",maxWidth:300}}>{this.state.error}</div>
          <button onClick={()=>this.setState({hasError:false,error:""})}
            style={{padding:"0.625rem 1.5rem",borderRadius:"8px",border:"none",background:"#0070D4",color:"white",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            ← 戻る / 再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const C = {
  // ── Base surfaces ──────────────────────────────
  bg:"#F9FAFE",           // dustalk-surface
  surface:"#ffffff",
  surfaceHover:"#F2F7FF",   // dustalk highlight lv1
  overlay:"rgba(0,17,62,0.5)",   // dustalk-navy

  // ── Border system ──────────────────────────────
  border:"#DDE1EB",       // dustalk-border
  borderLight:"#EEF1F7",  // dustalk border light

  // ── Text hierarchy (3 levels) ───────────────────
  text:"#212121",         // dustalk-text
  textSub:"#4D4D4D",      // dustalk text-dark-main
  textMuted:"#8A93A3",    // dustalk muted

  // ── Accent — Bright Blue ──────────────────────
  accent:"#0070D4",       // dustalk-blue
  accentDark:"#1563CA",   // dustalk interactive-text
  accentBg:"#E6F0FF",     // dustalk highlight lv2
  accentLight:"rgba(0,112,212,0.08)",

  // ── Semantic ────────────────────────────────────
  blue:"#0070D4",   blueBg:"#E6F0FF",     // dustalk blue
  green:"#009122",  greenBg:"#DAF7E1",    // dustalk success
  yellow:"#BE4A04", yellowBg:"#FDECCC",   // dustalk pending
  red:"#DA1313",    redBg:"#FFDBDB",      // dustalk destructive
  purple:"#7A5AD9", purpleBg:"#F8E5FF",   // dustalk progress
  orange:"#FF6A00", orangeBg:"#FFE8CF",   // dustalk attention

  // ── Navigation (NOW WHITE) ──────────────────────
  nav:"#ffffff",
  navBorder:"#DDE1EB",
  navText:"#4D4D4D",
  navTextSub:"#A6A6A6",
  navActive:"#E6F0FF",
  navActiveText:"#1563CA",

  // ── Elevation (subtle, modern) ──────────────────
  shadow:"0 1px 3px rgba(0,17,62,0.05),0 1px 2px rgba(0,17,62,0.06)",
  shadowMd:"0 4px 12px rgba(0,17,62,0.08)",
  shadowLg:"0 8px 24px rgba(0,17,62,0.12)",
  shadowFloat:"0 16px 40px rgba(0,17,62,0.18)",

  // ── DUSTALK component tokens ──
  shadowCard:"4px 4px 12px rgba(0,17,62,0.04)",   // shadow-dustalk-card
  focusGlow:"0 0 8px rgba(0,112,212,0.18)",       // shadow-dustalk-input-focus
};

const S = {
  row:    {display:"flex",alignItems:"center"},
  rowSB:  {display:"flex",alignItems:"center",justifyContent:"space-between"},
  col:    {display:"flex",flexDirection:"column"},
  chip:   (bg,color)=>({padding:"0.2rem 0.55rem",borderRadius:999,fontSize:"0.72rem",fontWeight:700,background:bg,color:color}),
  iconBtn:{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"},
};

// ─── 📈 株式分析（プロトレーダーダッシュボード v333） ────────────────────────
// mydesk-stock-analysis Lambda を呼び出し、地合い・テクニカル・ファンダ・
// ニュース・AI判定(プロトレーダー脳)を1画面に統合する
const STOCK_VERDICT_META = {
  strong_buy:{label:"🚀 強い買い",color:"#065f46",bg:"#d1fae5"},
  buy:       {label:"🟢 買い",    color:"#065f46",bg:"#d1fae5"},
  hold:      {label:"🟡 様子見",  color:"#92400e",bg:"#fef3c7"},
  avoid:     {label:"⚪ 見送り",  color:"#4b5563",bg:"#f1f3f4"},
  sell:      {label:"🔴 売り",    color:"#991b1b",bg:"#fee2e2"},
};
const STOCK_QUAD_META = {
  "本命":     {color:"#065f46",bg:"#d1fae5"},
  "押し目待ち":{color:"#1563CA",bg:"#e8f0fe"},
  "短期限定": {color:"#92400e",bg:"#fef3c7"},
  "見送り":   {color:"#4b5563",bg:"#f1f3f4"},
};

function StockSparkline({spark=[],ma25=[],width=560,height=110}) {
  if(!spark||spark.length<2) return null;
  const all = spark.concat((ma25||[]).filter(v=>v!=null));
  const min = Math.min(...all), max = Math.max(...all);
  const range = (max-min)||1;
  const px = i => (i/(spark.length-1))*width;
  const py = v => height-6-((v-min)/range)*(height-12);
  const line = arr => arr.map((v,i)=>v==null?null:`${px(i).toFixed(1)},${py(v).toFixed(1)}`).filter(Boolean).join(" ");
  const up = spark[spark.length-1] >= spark[0];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height:"auto",display:"block"}}>
      <polyline points={line(spark)} fill="none" stroke={up?"#009122":"#DA1313"} strokeWidth="2"/>
      {ma25&&ma25.some(v=>v!=null)&&<polyline points={line(ma25)} fill="none" stroke="#8A93A3" strokeWidth="1.5" strokeDasharray="4 3"/>}
    </svg>
  );
}

// ローソク足+出来高バー(60日)。上ヒゲ/下ヒゲ・陽線陰線・出来高の勢いが読める
function StockCandleChart({candles=[],ma25=[],levels=null,width=560,height=190}) {
  if(!candles||candles.length<2) return null;
  const volH = 30, padT = 4, padB = 4;
  const priceH = height - volH - padT - padB;
  const lv = levels||{};
  const extra = [lv.stop,lv.target1,lv.target2,lv.entry].filter(v=>typeof v==="number");
  const min = Math.min(...candles.map(c=>c.l), ...extra), max = Math.max(...candles.map(c=>c.h), ...extra);
  const range = (max-min)||1;
  const maxV = Math.max(...candles.map(c=>c.v||0))||1;
  const bw = width/candles.length;
  const py = v => padT + (1-(v-min)/range)*priceH;
  const maPts = (ma25||[]).slice(-candles.length).map((v,i)=>v==null?null:`${((i+0.5)*bw).toFixed(1)},${py(v).toFixed(1)}`).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height:"auto",display:"block"}}>
      {candles.map((c,i)=>{
        const up = c.c>=c.o, col = up?"#009122":"#DA1313";
        const x = (i+0.5)*bw;
        const yO=py(c.o), yC=py(c.c);
        const vh = (c.v||0)/maxV*volH;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={py(c.h)} y2={py(c.l)} stroke={col} strokeWidth="1"/>
            <rect x={x-bw*0.32} width={bw*0.64} y={Math.min(yO,yC)} height={Math.max(1,Math.abs(yO-yC))} fill={up?col:"white"} stroke={col} strokeWidth={up?0:1}/>
            <rect x={x-bw*0.32} width={bw*0.64} y={height-padB-vh} height={vh} fill={up?"rgba(0,145,34,0.3)":"rgba(218,19,19,0.3)"}/>
          </g>
        );
      })}
      {maPts&&<polyline points={maPts} fill="none" stroke="#0070D4" strokeWidth="1.5" strokeDasharray="4 3"/>}
      {/* 売買ライン: 損切り(赤)・買い場(青)・利確(緑) */}
      {[[lv.stop,"#DA1313","🛑 損切り"],[lv.entry,"#0070D4","🎯 買い場"],
        [lv.target1,"#009122","💰 利確1"],[lv.target2,"#009122","💰 利確2"]].map(([v,col,lbl],i)=>{
        if(typeof v!=="number") return null;
        const y = py(v);
        if(!isFinite(y)) return null;
        return (
          <g key={i}>
            <line x1="0" x2={width} y1={y} y2={y} stroke={col} strokeWidth="1.2" strokeDasharray="6 4" opacity="0.85"/>
            <rect x="2" y={y-9} width={lbl.length*14+34} height="15" rx="3" fill={col} opacity="0.92"/>
            <text x="6" y={y+2.5} fill="white" fontSize="10" fontWeight="700">{lbl} {Number(v).toLocaleString()}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StockProChart({data,levels,show={},width=560}) {
  if(!data||!data.candles||data.candles.length<2) return null;
  const cs = data.candles;
  const priceH=190, rsiH=52, macdH=52, gap=8;
  const height = priceH+rsiH+macdH+gap*2;
  const lv = levels||{};
  const lines=[lv.stop,lv.target1,lv.target2,lv.entry].filter(v=>typeof v==="number");
  const mas=[].concat(data.ma25||[],data.ma75||[],data.ma200||[]).filter(v=>v!=null);
  const min=Math.min(...cs.map(c=>c.l),...lines,...mas), max=Math.max(...cs.map(c=>c.h),...lines,...mas);
  const rg=(max-min)||1, bw=width/cs.length;
  const maxV=Math.max(...cs.map(c=>c.v||0))||1;
  const py=v=>4+(1-(v-min)/rg)*(priceH-34);
  const volTop=priceH-26;
  const rsiTop=priceH+gap, macdTop=priceH+gap+rsiH+gap;
  const line=(arr,fn)=>arr.map((v,i)=>v==null?null:`${((i+0.5)*bw).toFixed(1)},${fn(v).toFixed(1)}`).filter(Boolean).join(" ");
  const rsiY=v=>rsiTop+8+(1-v/100)*(rsiH-16);
  const hs=(data.macdHist||[]).filter(v=>v!=null).map(Math.abs);
  const hMax=Math.max(...hs,0.001);
  const macdY=v=>macdTop+macdH/2-(v/hMax)*(macdH/2-6);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height:"auto",display:"block"}}>
      {cs.map((c,i)=>{
        const up=c.c>=c.o, col=up?"#009122":"#DA1313", x=(i+0.5)*bw;
        const yO=py(c.o), yC=py(c.c), vh=(c.v||0)/maxV*22;
        const w=Math.max(0.8,bw*0.62);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={py(c.h)} y2={py(c.l)} stroke={col} strokeWidth={bw>3?1:0.5}/>
            <rect x={x-w/2} width={w} y={Math.min(yO,yC)} height={Math.max(0.8,Math.abs(yO-yC))} fill={up?col:"white"} stroke={col} strokeWidth={up?0:0.6}/>
            <rect x={x-w/2} width={w} y={volTop+22-vh} height={vh} fill={up?"rgba(0,145,34,0.25)":"rgba(218,19,19,0.25)"}/>
          </g>
        );
      })}
      {/* 一目均衡表の雲(先に描いて背面に) */}
      {show.ichimoku&&data.spanA&&data.spanB&&(()=>{
        const pts=[];
        data.spanA.forEach((v,i)=>{ if(v!=null&&data.spanB[i]!=null) pts.push([i,v,data.spanB[i]]); });
        if(pts.length<2) return null;
        const up=pts.map(([i,a])=>`${((i+0.5)*bw).toFixed(1)},${py(a).toFixed(1)}`).join(" ");
        const dn=pts.slice().reverse().map(([i,,b])=>`${((i+0.5)*bw).toFixed(1)},${py(b).toFixed(1)}`).join(" ");
        return <polygon points={up+" "+dn} fill="#7A5AD9" opacity="0.12"/>;
      })()}
      {show.bb&&[[data.bbUpper,"#8A93A3"],[data.bbLower,"#8A93A3"]].map(([arr,col],i)=>
        arr&&arr.some(v=>v!=null)?<polyline key={"bb"+i} points={line(arr,py)} fill="none" stroke={col} strokeWidth="1" strokeDasharray="3 3" opacity="0.8"/>:null)}
      {show.ichimoku&&[[data.tenkan,"#DA1313"],[data.kijun,"#009122"]].map(([arr,col],i)=>
        arr&&arr.some(v=>v!=null)?<polyline key={"ic"+i} points={line(arr,py)} fill="none" stroke={col} strokeWidth="1" opacity="0.85"/>:null)}
      {[[data.ma25,"#0070D4"],[data.ma75,"#FF6A00"],[data.ma200,"#7A5AD9"]].map(([arr,col],i)=>
        arr&&arr.some(v=>v!=null)?<polyline key={"ma"+i} points={line(arr,py)} fill="none" stroke={col} strokeWidth="1.3" opacity="0.9"/>:null)}
      {[[lv.stop,"#DA1313","損切"],[lv.entry,"#0070D4","買い場"],[lv.target1,"#009122","利確1"],[lv.target2,"#009122","利確2"]].map(([v,col,lbl],i)=>{
        if(typeof v!=="number") return null;
        const y=py(v); if(!isFinite(y)||y<0||y>priceH) return null;
        return (
          <g key={"L"+i}>
            <line x1="0" x2={width} y1={y} y2={y} stroke={col} strokeWidth="1.1" strokeDasharray="6 4" opacity="0.85"/>
            <rect x="2" y={y-8} width={lbl.length*12+34} height="14" rx="3" fill={col} opacity="0.92"/>
            <text x="5" y={y+2.5} fill="white" fontSize="9.5" fontWeight="700">{lbl} {Number(v).toLocaleString()}</text>
          </g>
        );
      })}
      {show.volMa&&data.volMa&&data.volMa.some(v=>v!=null)&&(
        <polyline points={data.volMa.map((v,i)=>v==null?null:`${((i+0.5)*bw).toFixed(1)},${(volTop+22-(v/maxV)*22).toFixed(1)}`).filter(Boolean).join(" ")}
          fill="none" stroke="#BE4A04" strokeWidth="1" opacity="0.8"/>
      )}
      <rect x="0" y={rsiTop} width={width} height={rsiH} fill="#F9FAFE"/>
      {[70,30].map(v=><line key={"r"+v} x1="0" x2={width} y1={rsiY(v)} y2={rsiY(v)} stroke={v===70?"#DA1313":"#0070D4"} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6"/>)}
      {data.rsi&&<polyline points={line(data.rsi,rsiY)} fill="none" stroke="#7A5AD9" strokeWidth="1.3"/>}
      <text x="3" y={rsiTop+11} fontSize="9" fontWeight="700" fill="#8A93A3">RSI 買われすぎ70 / 売られすぎ30</text>
      <rect x="0" y={macdTop} width={width} height={macdH} fill="#F9FAFE"/>
      <line x1="0" x2={width} y1={macdTop+macdH/2} y2={macdTop+macdH/2} stroke="#DDE1EB" strokeWidth="0.8"/>
      {(data.macdHist||[]).map((v,i)=>v==null?null:(
        <rect key={"m"+i} x={(i+0.5)*bw-Math.max(0.6,bw*0.3)} width={Math.max(1.2,bw*0.6)}
          y={Math.min(macdY(v),macdTop+macdH/2)} height={Math.max(0.8,Math.abs(macdY(v)-(macdTop+macdH/2)))}
          fill={v>=0?"#009122":"#DA1313"} opacity="0.75"/>
      ))}
      <text x="3" y={macdTop+11} fontSize="9" fontWeight="700" fill="#8A93A3">MACD 緑=上昇の勢い / 赤=下降の勢い</text>
    </svg>
  );
}

function StockScoreBar({label,score,signal}) {
  const color = score>=70?"#009122":(score>=45?"#BE4A04":"#8A93A3");
  return (
    <div style={{marginBottom:"0.4rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.72rem",fontWeight:700,color:C.textSub,marginBottom:"0.15rem"}}>
        <span>{label}</span><span style={{color}}>{score}点</span>
      </div>
      <div style={{height:8,borderRadius:4,background:C.borderLight,overflow:"hidden"}}>
        <div style={{width:`${Math.min(100,score)}%`,height:"100%",background:color,borderRadius:4,transition:"width 0.4s"}}/>
      </div>
    </div>
  );
}

function StockView({currentUser}) {
  const [view, setView]           = useState(()=>localStorage.getItem("mt_view")||"home"); // home|analyze|portfolio|learn|settings
  const [apiUrl, setApiUrl]       = useState(()=>localStorage.getItem("md_stock_api_url")||STOCK_API_URL);
  const [urlInput, setUrlInput]   = useState("");
  const [watchlist, setWatchlist] = useState(()=>{try{return JSON.parse(localStorage.getItem("md_stock_watchlist")||"[]");}catch{return [];}});
  const [results, setResults]     = useState({});   // ticker -> analyze結果
  const [market, setMarket]       = useState(null); // 地合い
  const [selected, setSelected]   = useState(null); // 詳細表示中ticker
  const [brains, setBrains]       = useState({});   // ticker -> brain結果
  const [newsMap, setNewsMap]     = useState({});   // ticker -> news[]
  const [busy, setBusy]           = useState({});   // {all:bool, brain:bool, news:bool, add:bool}
  const [query, setQuery]         = useState("");
  const [candidates, setCandidates] = useState(null);
  const [weight, setWeight]       = useState(()=>{const v=parseInt(localStorage.getItem("md_stock_weight")||"50",10);return isNaN(v)?50:v;}); // 短期比重%
  const [mktFilter, setMktFilter] = useState("all");
  const [errMsg, setErrMsg]       = useState("");
  const [perf, setPerf]           = useState(null);  // {stats, config} 学習・成績
  const [showLearn, setShowLearn] = useState(true);
  const [dash, setDash]           = useState(null);   // 成績ダッシュボード
  const [sim, setSim]             = useState(null);   // 戦略シミュレーション
  const [showManual, setShowManual] = useState(false); // 手動操作(通常は隠す)
  const [btRep, setBtRep]         = useState(null);  // バックテスト結果
  const [btYears, setBtYears]     = useState("10");  // 検証期間(年)
  const [screenRes, setScreenRes] = useState(null);  // スクリーニング結果
  const [ranking, setRanking]     = useState(null);  // 全銘柄ランキング
  const [paper, setPaper]         = useState(null);  // デモトレード口座
  const [orderForm, setOrderForm] = useState({ticker:"",qty:""});
  const [autoCfg, setAutoCfg]     = useState(null);  // AI自動デモ売買
  const [brief, setBrief]         = useState(null);  // プロトレーダーの視点(日次ブリーフ)
  const [mktNews, setMktNews]     = useState(null);  // 市場全体ニュース
  const [chart, setChart]         = useState(null);  // プロチャートデータ
  const [chartPeriod, setChartPeriod] = useState("6mo");
  const [chartIv, setChartIv]     = useState("1d");
  const [chartShow, setChartShow] = useState({bb:false,ichimoku:false,volMa:true});
  const [report, setReport]       = useState(null);  // 朝レポート
  const [showReport, setShowReport] = useState(true);
  const [holdEdit, setHoldEdit]   = useState(false); // 保有登録フォーム表示
  const [holdForm, setHoldForm]   = useState({price:"",qty:""});
  const [pfBrain, setPfBrain]     = useState(null);  // ポートフォリオAI診断
  const [journal, setJournal]     = useState(null);  // トレード日誌 {trades,stats}
  const [showJournal, setShowJournal] = useState(true);
  const [capital, setCapital]     = useState(()=>localStorage.getItem("md_stock_capital")||"");  // 万(銘柄通貨建て)
  const [riskPct, setRiskPct]     = useState(()=>localStorage.getItem("md_stock_risk")||"2");

  const api = async (payload, timeoutMs=90000) => {
    const url = localStorage.getItem("md_stock_api_url")||STOCK_API_URL;
    if(!url) throw new Error("APIのURLが未設定です");
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {method:"POST",headers:DB_API_HEADERS,body:JSON.stringify(payload),signal:ctrl.signal});
      const j = await r.json();
      if(!r.ok||j.error) throw new Error(j.error||`HTTP ${r.status}`);
      return j;
    } finally { clearTimeout(timer); }
  };

  const saveWatchlist = (list, push=true) => {
    setWatchlist(list); localStorage.setItem("md_stock_watchlist", JSON.stringify(list));
    if(push) api({action:"watchlist-set",items:list}).catch(()=>{}); // サーバー共有(3人で同じリストを見る)
  };

  const refreshAll = async (list) => {
    const wl = list||watchlist;
    setBusy(b=>({...b,all:true})); setErrMsg("");
    try {
      const mkt = await api({action:"market"});
      setMarket(mkt);
      if(wl.length){
        const res = await api({action:"analyze-batch",tickers:wl.map(w=>w.ticker)}, 300000);
        const map = {};
        (res.results||[]).forEach(a=>{map[a.ticker]=a;});
        setResults(r=>({...r,...map}));
        if(res.errors&&res.errors.length) setErrMsg(res.errors.map(e=>`${e.ticker}: ${e.error}`).join(" / "));
      }
    } catch(e) { setErrMsg("更新エラー: "+e.message); }
    setBusy(b=>({...b,all:false}));
  };

  useEffect(()=>{ if(!apiUrl) return; (async()=>{
    // サーバーのウォッチリストを正とし、無ければローカルをアップロード
    try {
      const r = await api({action:"watchlist-get"});
      if(r.items&&r.items.length){
        setWatchlist(r.items); localStorage.setItem("md_stock_watchlist", JSON.stringify(r.items));
        refreshAll(r.items); return;
      }
      if(watchlist.length) api({action:"watchlist-set",items:watchlist}).catch(()=>{});
    } catch(e){ /* 旧Lambda(watchlist未対応)でも動くようフォールバック */ }
    refreshAll();
  })(); /* eslint-disable-next-line */ },[]);

  // タブ切替時に必要なデータを自動ロード
  useEffect(()=>{ if(!apiUrl) return;
    if(view==="home"){
      if(!brief&&!busy.brief) loadBrief(false);
      if(!mktNews) loadMktNews();
      if(!report&&!busy.report) loadReport(false);
    }
    if(view==="portfolio"&&!journal&&!busy.journal) loadJournal();
    if(view==="learn"){ if(!dash&&!busy.dash) loadDash(); if(!perf&&!busy.perf) loadPerf(); if(!sim&&!busy.sim) loadSim(false); }
    if(view==="picks"&&!ranking&&!busy.rank) loadRanking(false);
    if(view==="demo"){ if(!paper&&!busy.paper) loadPaper(); if(!autoCfg) loadAuto(); }
  /* eslint-disable-next-line */ },[view]);

  const searchStock = async () => {
    if(!query.trim()) return;
    setBusy(b=>({...b,add:true})); setCandidates(null);
    try { const r = await api({action:"search",query:query.trim()}); setCandidates(r.candidates||[]); }
    catch(e){ setErrMsg("検索エラー: "+e.message); }
    setBusy(b=>({...b,add:false}));
  };

  const addStock = async (cand) => {
    if(watchlist.some(w=>w.ticker===cand.ticker)) { setCandidates(null); setQuery(""); return; }
    const wl = [...watchlist, {ticker:cand.ticker,name:cand.name,market:cand.market}];
    saveWatchlist(wl); setCandidates(null); setQuery("");
    setBusy(b=>({...b,all:true}));
    try { const a = await api({action:"analyze",ticker:cand.ticker}); setResults(r=>({...r,[a.ticker]:a})); }
    catch(e){ setErrMsg(`${cand.ticker} 分析エラー: `+e.message); }
    setBusy(b=>({...b,all:false}));
  };

  // 初回セットアップ用: 日米の主力銘柄をまとめて登録して一括分析
  const STARTER_PACK = [
    {ticker:"7203.T",name:"トヨタ自動車",market:"JP"},
    {ticker:"6758.T",name:"ソニーグループ",market:"JP"},
    {ticker:"8306.T",name:"三菱UFJフィナンシャル・グループ",market:"JP"},
    {ticker:"8035.T",name:"東京エレクトロン",market:"JP"},
    {ticker:"7974.T",name:"任天堂",market:"JP"},
    {ticker:"AAPL", name:"Apple",market:"US"},
    {ticker:"MSFT", name:"Microsoft",market:"US"},
    {ticker:"NVDA", name:"NVIDIA",market:"US"},
    {ticker:"GOOGL",name:"Alphabet",market:"US"},
    {ticker:"AMZN", name:"Amazon",market:"US"},
  ];
  const addStarterPack = async () => {
    const add = STARTER_PACK.filter(s=>!watchlist.some(w=>w.ticker===s.ticker));
    if(!add.length) return;
    const wl = [...watchlist, ...add];
    saveWatchlist(wl);
    await refreshAll(wl);
  };

  const removeStock = (ticker) => {
    saveWatchlist(watchlist.filter(w=>w.ticker!==ticker));
    if(selected===ticker) setSelected(null);
  };

  const loadChart = async (ticker, period, interval) => {
    setBusy(b=>({...b,chart:true}));
    try { const r = await api({action:"chart",ticker,period:period||chartPeriod,interval:interval||chartIv}, 120000); setChart(r); }
    catch(e){ setErrMsg("チャート取得エラー: "+e.message); }
    setBusy(b=>({...b,chart:false}));
  };

  const loadNews = async (ticker) => {
    setBusy(b=>({...b,news:true}));
    try { const a=results[ticker]; const r = await api({action:"news",ticker,name:a?.name||""}); setNewsMap(m=>({...m,[ticker]:r.news||[]})); }
    catch(e){ setErrMsg("ニュース取得エラー: "+e.message); }
    setBusy(b=>({...b,news:false}));
  };

  const loadSim = async (force) => {
    setBusy(b=>({...b,sim:true})); setErrMsg("");
    try {
      const r = await api(force?{action:"simulate",years:25,force:true}:{action:"simulation-latest"}, 900000);
      if(r&&r.result) setSim(r);
      else if(!force) setSim({empty:true});
    } catch(e){ setErrMsg("シミュレーションエラー: "+e.message); }
    setBusy(b=>({...b,sim:false}));
  };

  const loadDash = async () => {
    setBusy(b=>({...b,dash:true}));
    try { const r = await api({action:"dashboard"}, 180000); setDash(r); }
    catch(e){ setErrMsg("成績取得エラー: "+e.message); }
    setBusy(b=>({...b,dash:false}));
  };

  const loadPerf = async () => {
    setBusy(b=>({...b,perf:true}));
    try { const r = await api({action:"performance"}, 180000); setPerf(r); }
    catch(e){ setErrMsg("成績取得エラー: "+e.message); }
    setBusy(b=>({...b,perf:false}));
  };

  const runLearn = async () => {
    setBusy(b=>({...b,learn:true})); setErrMsg("");
    try {
      const cfg = await api({action:"learn",tickers:watchlist.map(w=>w.ticker)}, 300000);
      setPerf({stats:cfg.stats, config:cfg});
    } catch(e){ setErrMsg("学習エラー: "+e.message); }
    setBusy(b=>({...b,learn:false}));
  };

  const runBacktest = async () => {
    setBusy(b=>({...b,bt:true})); setErrMsg("");
    try {
      // ウォッチリストが5銘柄未満なら日米主力20銘柄(Lambda側デフォルト)で検証
      const payload = {action:"backtest", years:parseInt(btYears,10)||10, apply:true};
      if(watchlist.length>=5) payload.tickers = watchlist.map(w=>w.ticker);
      const rep = await api(payload, 900000);
      setBtRep(rep);
      setPerf(p=>({...(p||{}), config:{...((p&&p.config)||{}), factor_weights:rep.weights, factor_ic:rep.ics, backtestSamples:rep.samples, updatedAt:rep.updatedAt}}));
    } catch(e){ setErrMsg("バックテストエラー: "+e.message); }
    setBusy(b=>({...b,bt:false}));
  };

  const loadPaper = async () => {
    setBusy(b=>({...b,paper:true}));
    try { const r = await api({action:"paper"}, 120000); setPaper(r); }
    catch(e){ setErrMsg("デモ口座エラー: "+e.message); }
    setBusy(b=>({...b,paper:false}));
  };

  const paperOrder = async (ticker, side, qty, note) => {
    setBusy(b=>({...b,paper:true})); setErrMsg("");
    try {
      const r = await api({action:"paper-order",ticker,side,qty:Number(qty),note:note||""}, 120000);
      setPaper(r);
      alert(`${side==="buy"?"買い":"売り"}注文が約定しました: ${ticker} ${qty}株`);
    } catch(e){ setErrMsg("注文エラー: "+e.message); alert("注文エラー: "+e.message); }
    setBusy(b=>({...b,paper:false}));
  };

  const loadAuto = async () => {
    try { const r = await api({action:"autotrade"}, 120000); setAutoCfg(r.config); if(r.state) setPaper(r.state); }
    catch(e){}
  };
  const saveAuto = async (patch) => {
    setBusy(b=>({...b,auto:true}));
    try { const r = await api({action:"autotrade-config",config:patch}, 120000); setAutoCfg(r.config); }
    catch(e){ setErrMsg("設定エラー: "+e.message); }
    setBusy(b=>({...b,auto:false}));
  };
  const runAuto = async () => {
    setBusy(b=>({...b,auto:true})); setErrMsg("");
    try {
      const r = await api({action:"autotrade-run"}, 600000);
      if(r.state) setPaper(r.state);
      await loadAuto();
      const acts = r.actions||[];
      alert(r.enabled===false ? "自動売買が無効です。スイッチをONにしてください"
        : acts.length ? acts.map(a=>`${a.type==="buy"?"買":a.type==="sell"?"売":"—"} ${a.name||a.ticker}${a.qty?` ${a.qty}株`:""}: ${a.reason}`).join("\n")
        : "今日は条件を満たす売買はありませんでした(様子見)");
    } catch(e){ setErrMsg("自動売買エラー: "+e.message); }
    setBusy(b=>({...b,auto:false}));
  };

  const loadBrief = async (force) => {
    setBusy(b=>({...b,brief:true}));
    try { const r = await api({action:"brief",force:!!force}, 900000); if(r&&r.brief) setBrief(r); }
    catch(e){ setErrMsg("ブリーフ取得エラー: "+e.message); }
    setBusy(b=>({...b,brief:false}));
  };

  const loadMktNews = async () => {
    try { const r = await api({action:"market-news"}, 60000); setMktNews(r); } catch(e){}
  };

  const loadRanking = async (force) => {
    setBusy(b=>({...b,rank:true})); setErrMsg("");
    try { const r = await api({action:"ranking",force:!!force}, 900000); setRanking(r); }
    catch(e){ setErrMsg("ランキング取得エラー: "+e.message); }
    setBusy(b=>({...b,rank:false}));
  };

  const runScreen = async () => {
    setBusy(b=>({...b,screen:true})); setErrMsg("");
    try {
      const r = await api({action:"screen",exclude:watchlist.map(w=>w.ticker),market:mktFilter==="all"?"all":mktFilter}, 300000);
      setScreenRes(r);
    } catch(e){ setErrMsg("スキャンエラー: "+e.message); }
    setBusy(b=>({...b,screen:false}));
  };

  const loadReport = async (generate) => {
    setBusy(b=>({...b,report:true})); setErrMsg("");
    try {
      const r = await api(generate?{action:"daily-report",sendMail:false}:{action:"report-latest"}, 300000);
      setReport(r);
    } catch(e){ setErrMsg("レポートエラー: "+e.message); }
    setBusy(b=>({...b,report:false}));
  };

  const runPfBrain = async () => {
    setBusy(b=>({...b,pf:true})); setErrMsg("");
    try { const r = await api({action:"portfolio-brain"}, 900000); setPfBrain(r); }
    catch(e){ setErrMsg("ポートフォリオ診断エラー: "+e.message); }
    setBusy(b=>({...b,pf:false}));
  };

  const loadJournal = async () => {
    setBusy(b=>({...b,journal:true}));
    try { const r = await api({action:"trade-stats"}); setJournal(r); }
    catch(e){ setErrMsg("日誌取得エラー: "+e.message); }
    setBusy(b=>({...b,journal:false}));
  };

  // 決済: 実現損益をトレード日誌に記録して保有解除
  const closePosition = async (w, h) => {
    const cur = results[w.ticker] ? String(results[w.ticker].price) : "";
    const exitStr = window.prompt(`${w.name} の決済価格を入力してください\n(実現損益をトレード日誌に記録します)`, cur);
    if(exitStr===null) return;
    const exitPrice = parseFloat(exitStr);
    if(!exitPrice||exitPrice<=0){ alert("価格が不正です"); return; }
    const reason = window.prompt("決済理由(任意・AIが売買のクセ分析に使います)\n例: 利確目標到達 / 損切りライン / 決算前手仕舞い","")||"";
    try {
      await api({action:"trade-log",ticker:w.ticker,name:w.name,entryPrice:h.price,exitPrice,qty:h.qty||0,entryDate:h.date,reason});
    } catch(e){ setErrMsg("日誌記録エラー: "+e.message); }
    saveWatchlist(watchlist.map(x=>{ if(x.ticker!==w.ticker) return x; const {holding,...rest}=x; return rest; }));
    setJournal(null);
    alert(`決済を記録しました: ${((exitPrice/h.price-1)*100).toFixed(1)}%`);
  };

  // 日次リターンの相関(保有銘柄の分散チェック用)
  const corrOf = (sa, sb) => {
    const ra=[], rb=[];
    const n = Math.min(sa.length, sb.length);
    for(let i=1;i<n;i++){ ra.push(sa[i]/sa[i-1]-1); rb.push(sb[i]/sb[i-1]-1); }
    if(ra.length<20) return 0;
    const ma=ra.reduce((s,v)=>s+v,0)/ra.length, mb=rb.reduce((s,v)=>s+v,0)/rb.length;
    let cov=0,va=0,vb=0;
    for(let i=0;i<ra.length;i++){ cov+=(ra[i]-ma)*(rb[i]-mb); va+=(ra[i]-ma)**2; vb+=(rb[i]-mb)**2; }
    return va>0&&vb>0 ? cov/Math.sqrt(va*vb) : 0;
  };

  const runBrain = async (ticker) => {
    setBusy(b=>({...b,brain:true})); setErrMsg("");
    try {
      const holding = (watchlist.find(w=>w.ticker===ticker)||{}).holding;
      const r = await api({action:"brain",ticker,holding:holding||undefined}, 180000);
      setBrains(m=>({...m,[ticker]:r}));
      if(r.analysis) setResults(res=>({...res,[ticker]:r.analysis}));
      if(r.news) setNewsMap(m=>({...m,[ticker]:r.news}));
    } catch(e){ setErrMsg("AI分析エラー: "+e.message); }
    setBusy(b=>({...b,brain:false}));
  };

  const weighted = (a) => a ? Math.round(a.short.score*(weight/100) + a.long.score*(1-weight/100)) : 0;

  const rows = watchlist
    .filter(w=>mktFilter==="all"||w.market===mktFilter)
    .map(w=>({...w, a:results[w.ticker]}))
    .sort((x,y)=>weighted(y.a)-weighted(x.a));

  const sel = selected ? results[selected] : null;
  const selBrain = selected ? brains[selected] : null;
  const selNews = selected ? newsMap[selected] : null;

  const card = {background:"white",borderRadius:"1rem",padding:"1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow};

  // ── 初期設定画面(Lambda URL未設定) ──
  if(!apiUrl) return (
    <div style={{maxWidth:560}}>
      <div style={{fontWeight:800,fontSize:"1.1rem",color:C.text,marginBottom:"1rem"}}>📈 株式分析</div>
      <div style={card}>
        <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text,marginBottom:"0.6rem"}}>初期設定</div>
        <div style={{fontSize:"0.82rem",color:C.textSub,lineHeight:1.7,marginBottom:"0.85rem"}}>
          株式分析Lambda（mydesk-stock-analysis）のFunction URLを貼り付けてください。<br/>
          デプロイ手順はリポジトリの <b>lambda/mydesk-stock-analysis/README.md</b> 参照。
        </div>
        <input type="text" value={urlInput} onChange={e=>setUrlInput(e.target.value)}
          placeholder="https://xxxx.lambda-url.ap-northeast-1.on.aws/"
          style={{width:"100%",padding:"0.625rem 0.75rem",borderRadius:"0.625rem",border:`1.5px solid ${C.border}`,fontSize:"0.85rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:"0.75rem"}}/>
        <button onClick={()=>{const u=urlInput.trim(); if(!u.startsWith("https://")){alert("https:// から始まるURLを入力してください");return;} localStorage.setItem("md_stock_api_url",u); setApiUrl(u); refreshAll();}}
          style={{width:"100%",padding:"0.7rem",borderRadius:8,border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.88rem",cursor:"pointer",fontFamily:"inherit"}}>
          保存して開始
        </button>
      </div>
    </div>
  );

  return (
    <div style={{paddingBottom:"1.5rem"}}>
      {/* タブナビ */}
      <div style={{display:"flex",gap:"0.25rem",marginBottom:"1rem",background:"white",borderRadius:12,padding:"0.3rem",border:`1px solid ${C.border}`,overflowX:"auto",WebkitOverflowScrolling:"touch",position:"sticky",top:52,zIndex:40,boxShadow:C.shadow}}>
        {[["home","🏠","ホーム"],["picks","⭐","おすすめ"],["analyze","🔍","分析"],["demo","💴","デモ売買"],["portfolio","💼","ポートフォリオ"],["learn","🎓","学習・検証"],["settings","⚙️","設定"]].map(([v,ic,l])=>(
          <button key={v} onClick={()=>{setView(v);localStorage.setItem("mt_view",v);}}
            style={{flexShrink:0,display:"flex",alignItems:"center",gap:"0.35rem",padding:"0.5rem 0.9rem",borderRadius:9,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.8rem",fontWeight:view===v?800:600,background:view===v?C.accent:"transparent",color:view===v?"white":C.textSub,transition:"all 0.15s"}}>
            <span>{ic}</span><span style={{whiteSpace:"nowrap"}}>{l}</span>
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>refreshAll()} disabled={busy.all}
          style={{flexShrink:0,padding:"0.5rem 0.9rem",borderRadius:9,border:"none",background:C.accentBg,color:C.accentDark,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.all?0.6:1}}>
          {busy.all?"更新中...":"🔄 全銘柄更新"}
        </button>
      </div>
      {errMsg&&<div style={{padding:"0.6rem 0.85rem",borderRadius:8,background:C.redBg,color:C.red,fontSize:"0.78rem",fontWeight:600,marginBottom:"0.85rem"}}>{errMsg}</div>}

      {view==="home"&&(<>
      {/* 🧠 プロトレーダーの視点(常時表示) */}
      <div style={{...card,marginBottom:"0.85rem",padding:"1rem 1.1rem",background:"linear-gradient(135deg,#ffffff,#F6F4FF)",border:`2px solid ${C.purple}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.5rem"}}>
          <div style={{fontWeight:800,fontSize:"0.95rem",color:C.purple}}>🧠 プロトレーダーの視点
            {brief&&brief.stance&&<span style={{...S.chip(
              brief.stance==="aggressive"?C.greenBg:(brief.stance==="defensive"?C.redBg:C.yellowBg),
              brief.stance==="aggressive"?C.green:(brief.stance==="defensive"?C.red:C.yellow)),marginLeft:"0.5rem"}}>
              {brief.stance==="aggressive"?"⚔️ 攻め":brief.stance==="defensive"?"🛡️ 守り":"⚖️ 中立"}
            </span>}
          </div>
          <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
            {brief&&<span style={{fontSize:"0.64rem",color:C.textMuted}}>{new Date(brief.updatedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
            <button onClick={()=>loadBrief(true)} disabled={busy.brief}
              style={{padding:"0.4rem 0.8rem",borderRadius:8,border:"none",background:"linear-gradient(135deg,#7A5AD9,#0070D4)",color:"white",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.brief?0.6:1}}>
              {busy.brief?"生成中...":"🔄 今の相場で再生成"}
            </button>
          </div>
        </div>
        {!brief&&<div style={{fontSize:"0.78rem",color:C.textMuted,lineHeight:1.7}}>
          {busy.brief?"AIが地合い・ニュース・全銘柄スキャンを読み込んで相場観を生成中...":"「🔄 今の相場で再生成」を押すと、地合い・ニュース・全銘柄スキャン・過去の的中率を統合した今日の相場観と狙い目が表示されます(毎朝7:50に自動生成)"}
        </div>}
        {brief&&brief.brief&&(()=>{
          const b = brief.brief;
          const acc = brief.accuracy||{};
          const v5 = acc.byVerdict5d||{}; const s5 = acc.bySignal5d||{};
          const buyStat = s5.buy;
          return (
            <div>
              <div style={{fontSize:"0.84rem",color:C.text,lineHeight:1.75,whiteSpace:"pre-wrap",marginBottom:"0.6rem"}}>{b.market_view}</div>
              {(b.focus||[]).length>0&&(
                <div style={{marginBottom:"0.6rem"}}>
                  <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,marginBottom:"0.3rem"}}>🎯 今日の狙い目</div>
                  {b.focus.map((f,i)=>{
                    const known = watchlist.some(w=>w.ticker===f.ticker);
                    return (
                      <div key={i} style={{display:"flex",gap:"0.5rem",alignItems:"center",padding:"0.4rem 0.6rem",background:"white",borderRadius:8,marginBottom:"0.3rem",border:`1px solid ${C.borderLight}`}}>
                        <span style={{...S.chip(C.accentBg,C.accentDark),flexShrink:0,fontSize:"0.65rem"}}>{f.action}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:"0.8rem",color:C.text}}>{f.name||f.ticker} <span style={{fontWeight:500,color:C.textMuted,fontSize:"0.7rem"}}>{f.ticker}</span></div>
                          <div style={{fontSize:"0.71rem",color:C.textSub,lineHeight:1.5}}>{f.reason}</div>
                        </div>
                        <button onClick={()=>{ if(known){setSelected(f.ticker);setView("analyze");localStorage.setItem("mt_view","analyze");if(!newsMap[f.ticker])loadNews(f.ticker);loadChart(f.ticker);} else addStock({ticker:f.ticker,name:f.name||f.ticker,market:f.ticker.endsWith(".T")?"JP":"US"}); }}
                          style={{flexShrink:0,padding:"0.3rem 0.6rem",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.68rem",fontWeight:700,background:known?C.borderLight:C.accentBg,color:known?C.textSub:C.accentDark}}>
                          {known?"詳細":"＋追加"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(brief.plans||[]).length>0&&(
                <div style={{marginBottom:"0.6rem"}}>
                  <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,marginBottom:"0.3rem"}}>💰 具体的な売買プラン(上位3銘柄)</div>
                  {brief.plans.filter(p=>p.entry&&p.stop).map((p,i)=>{
                    const vm = STOCK_VERDICT_META[p.verdict]||STOCK_VERDICT_META.hold;
                    const known = watchlist.some(w=>w.ticker===p.ticker);
                    return (
                      <div key={i} style={{padding:"0.6rem 0.75rem",background:"white",borderRadius:8,marginBottom:"0.4rem",border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.45rem",flexWrap:"wrap",marginBottom:"0.35rem"}}>
                          <span style={{fontWeight:800,fontSize:"0.84rem",color:C.text}}>{p.name}</span>
                          <span style={{fontSize:"0.72rem",color:C.textMuted}}>{Number(p.price).toLocaleString()} {p.currency}</span>
                          <span style={S.chip(vm.bg,vm.color)}>{vm.label}</span>
                          <span style={{fontSize:"0.7rem",color:"#BE4A04",fontWeight:700}}>{"★".repeat(Math.max(1,Math.min(5,p.conviction||1)))}</span>
                          <span style={{fontSize:"0.66rem",color:C.textMuted}}>短期{p.short}/長期{p.long}</span>
                          <button onClick={()=>{ if(known){setSelected(p.ticker);setView("analyze");localStorage.setItem("mt_view","analyze");if(!newsMap[p.ticker])loadNews(p.ticker);loadChart(p.ticker);} else addStock({ticker:p.ticker,name:p.name,market:p.ticker.endsWith(".T")?"JP":"US"}); }}
                            style={{marginLeft:"auto",padding:"0.25rem 0.55rem",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.66rem",fontWeight:700,background:known?C.borderLight:C.accentBg,color:known?C.textSub:C.accentDark}}>
                            {known?"詳細":"＋追加"}
                          </button>
                        </div>
                        {[["🎯 買い",p.entry],["🛑 損切り",p.stop],["💰 利確",p.targets],["⏳ 期間",p.horizon]].map(([l,v])=>v&&(
                          <div key={l} style={{display:"flex",gap:"0.4rem",fontSize:"0.73rem",lineHeight:1.6}}>
                            <span style={{flexShrink:0,fontWeight:700,color:C.textSub,minWidth:62}}>{l}</span>
                            <span style={{color:C.text}}>{v}</span>
                          </div>
                        ))}
                        {(p.risks||[]).length>0&&(
                          <div style={{fontSize:"0.68rem",color:C.red,marginTop:"0.2rem"}}>⚠️ {p.risks.join(" / ")}</div>
                        )}
                        <div style={{display:"flex",gap:"0.4rem",alignItems:"center",marginTop:"0.4rem",flexWrap:"wrap"}}>
                          <button onClick={()=>{
                            const unit = p.ticker.endsWith(".T")?100:1;
                            const def = Math.max(unit, Math.floor(100000/p.price/unit)*unit);
                            const q = window.prompt(`${p.name} を何株デモ購入しますか？\n現在値 ${Number(p.price).toLocaleString()}円${unit===100?"(100株単位)":""}\n※仮想資金です`, String(def));
                            if(q) paperOrder(p.ticker,"buy",q,`ブリーフ推奨(${p.verdict})`);
                          }} disabled={busy.paper}
                            style={{padding:"0.35rem 0.75rem",borderRadius:7,border:"none",background:C.green,color:"white",fontWeight:800,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>
                            💴 デモで買う
                          </button>
                          <span style={{fontSize:"0.66rem",color:C.textMuted}}>
                            仮想資金100万円で練習できます(実際のお金は動きません)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {(b.warnings||[]).length>0&&(
                <div style={{padding:"0.5rem 0.7rem",background:C.redBg,borderRadius:8,marginBottom:"0.5rem"}}>
                  <div style={{fontSize:"0.7rem",fontWeight:800,color:C.red,marginBottom:"0.15rem"}}>⚠️ 警戒</div>
                  {b.warnings.map((w,i)=><div key={i} style={{fontSize:"0.74rem",color:C.text,lineHeight:1.6}}>・{w}</div>)}
                </div>
              )}
              {/* この判定の信頼度(精度の可視化) */}
              <div onClick={()=>{setView("learn");localStorage.setItem("mt_view","learn");}}
                style={{display:"flex",gap:"0.6rem",flexWrap:"wrap",alignItems:"center",padding:"0.45rem 0.7rem",background:"white",borderRadius:8,border:`1px dashed ${C.border}`,cursor:"pointer"}}>
                <span style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub}}>📊 この判定の信頼度</span>
                {buyStat
                  ? <span style={S.chip(buyStat.winRate>=55?C.greenBg:C.yellowBg, buyStat.winRate>=55?C.green:C.yellow)}>
                      🔴実運用: {buyStat.n}件 勝率{buyStat.winRate}% 平均{buyStat.avgRet>=0?"+":""}{buyStat.avgRet}%
                    </span>
                  : brief.backtestAccuracy
                    ? <span style={S.chip(brief.backtestAccuracy.winRate>=55?C.greenBg:C.yellowBg, brief.backtestAccuracy.winRate>=55?C.green:C.yellow)}>
                        📘検証値: 勝率{brief.backtestAccuracy.winRate}% 平均{brief.backtestAccuracy.avgRet>=0?"+":""}{brief.backtestAccuracy.avgRet}%
                        {brief.backtestAccuracy.avgExcess!=null?` (対指数${brief.backtestAccuracy.avgExcess>=0?"+":""}${brief.backtestAccuracy.avgExcess}%)`:""} / {brief.backtestAccuracy.n}件
                      </span>
                    : <span style={{fontSize:"0.7rem",color:C.textMuted}}>検証データ未生成(学習・検証タブでバックテストを実行してください)</span>}
                <span style={{fontSize:"0.66rem",color:C.textMuted}}>
                  実運用の答え合わせ{acc.evaluated||0}件{!buyStat&&"(5営業日後から蓄積。それまでは検証値=過去データでの成績)"}
                </span>
                {Object.entries(v5).slice(0,3).map(([k,v])=>(
                  <span key={k} style={S.chip(C.borderLight,C.textSub)}>AI{k}: 勝率{v.winRate}%({v.n})</span>
                ))}
                <span style={{fontSize:"0.66rem",color:C.accent,marginLeft:"auto"}}>詳細を見る →</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 📡 マーケットニュース(自動収集) */}
      {mktNews&&mktNews.news&&mktNews.news.length>0&&(
        <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.4rem"}}>
            <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>📡 マーケットニュース <span style={{fontSize:"0.66rem",fontWeight:600,color:C.textMuted}}>15分ごとに自動更新</span></div>
            <button onClick={loadMktNews} style={{...S.iconBtn,color:C.accent,fontSize:"0.72rem",fontWeight:700}}>🔄</button>
          </div>
          <div style={{maxHeight:200,overflowY:"auto"}}>
            {mktNews.news.map((n,i)=>(
              <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                style={{display:"flex",gap:"0.4rem",alignItems:"flex-start",padding:"0.35rem 0",borderBottom:`1px solid ${C.borderLight}`,textDecoration:"none"}}>
                <span style={{flexShrink:0,fontSize:"0.7rem"}}>{n.market==="JP"?"🇯🇵":"🇺🇸"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:"0.75rem",fontWeight:600,color:C.accentDark,lineHeight:1.5}}>{n.title}</div>
                  <div style={{fontSize:"0.62rem",color:C.textMuted}}>{n.source}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}


      {/* 地合いパネル */}
      {market&&(
        <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.4rem",marginBottom:"0.6rem"}}>
            <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>🌐 地合い</div>
            <span style={S.chip(market.mood==="risk-on"?C.greenBg:(market.mood==="risk-off"?C.redBg:C.yellowBg), market.mood==="risk-on"?C.green:(market.mood==="risk-off"?C.red:C.yellow))}>{market.moodLabel}</span>
          </div>
          <div style={{display:"flex",gap:"0.5rem",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"0.2rem"}}>
            {(market.indices||[]).map(r=>(
              <div key={r.symbol} style={{flexShrink:0,minWidth:108,padding:"0.5rem 0.65rem",borderRadius:"0.625rem",background:C.bg,border:`1px solid ${C.borderLight}`}}>
                <div style={{fontSize:"0.68rem",fontWeight:700,color:C.textMuted,marginBottom:"0.15rem"}}>{r.label}</div>
                {r.error
                  ? <div style={{fontSize:"0.7rem",color:C.textMuted}}>取得失敗</div>
                  : <>
                      <div style={{fontSize:"0.88rem",fontWeight:800,color:C.text}}>{Number(r.price).toLocaleString()}</div>
                      <div style={{fontSize:"0.68rem",fontWeight:700,color:r.chg1d>=0?C.green:C.red}}>{r.chg1d>=0?"+":""}{r.chg1d}% <span style={{color:C.textMuted,fontWeight:500}}>/5日{r.chg5d>=0?"+":""}{r.chg5d}%</span></div>
                    </>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 📰 朝レポート */}
      <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
        <div onClick={()=>{const n=!showReport; setShowReport(n); if(n&&!report&&!busy.report) loadReport(false);}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>📰 朝レポート <span style={{fontSize:"0.68rem",fontWeight:600,color:C.textMuted}}>全銘柄スキャン・シグナル変化と保有損益のアラート(毎朝自動化可)</span></div>
          <span style={{fontSize:"0.8rem",color:C.textMuted}}>{showReport?"▲":"▼"}</span>
        </div>
        {showReport&&(
          <div style={{marginTop:"0.75rem"}}>
            <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
              <button onClick={()=>loadReport(true)} disabled={busy.report}
                style={{padding:"0.5rem 0.95rem",borderRadius:8,border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.report?0.6:1}}>
                {busy.report?"生成中...":"▶ 今すぐ生成"}
              </button>
              <button onClick={()=>loadReport(false)} disabled={busy.report}
                style={{padding:"0.5rem 0.95rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit"}}>
                🔄 最新を表示
              </button>
            </div>
            {report&&report.alerts&&report.alerts.length>0&&(
              <div style={{padding:"0.5rem 0.7rem",background:C.orangeBg,borderRadius:8,marginBottom:"0.5rem"}}>
                {report.alerts.map((a,i)=><div key={i} style={{fontSize:"0.76rem",fontWeight:700,color:C.orange,lineHeight:1.6}}>{a}</div>)}
              </div>
            )}
            {report&&report.body
              ? <pre style={{margin:0,padding:"0.6rem 0.8rem",background:C.bg,borderRadius:8,fontSize:"0.72rem",lineHeight:1.65,color:C.text,whiteSpace:"pre-wrap",fontFamily:"inherit",border:`1px solid ${C.borderLight}`}}>{report.body}</pre>
              : <div style={{fontSize:"0.75rem",color:C.textMuted}}>{busy.report?"":"レポートがまだありません。「今すぐ生成」を押すか、EventBridgeで毎朝の自動生成を設定してください(README参照)"}</div>}
          </div>
        )}
      </div>

      {/* ウォッチリスト */}
      <div style={{...card,marginBottom:"0.85rem",padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.8rem",minWidth:640}}>
            <thead>
              <tr style={{background:C.bg}}>
                {["銘柄","現在値","前日比","損益","短期","長期","総合","判定",""].map((h,i)=>(
                  <th key={i} style={{padding:"0.55rem 0.7rem",textAlign:i===0?"left":"right",fontSize:"0.68rem",fontWeight:700,color:C.textMuted,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0&&(
                <tr><td colSpan={9} style={{padding:"1.75rem 1rem",textAlign:"center"}}>
                  <div style={{color:C.textMuted,fontSize:"0.85rem",marginBottom:"0.9rem"}}>ウォッチリストが空です。まずは主力銘柄を入れて動かしてみてください</div>
                  <div style={{display:"flex",gap:"0.5rem",justifyContent:"center",flexWrap:"wrap"}}>
                    <button onClick={addStarterPack} disabled={busy.all}
                      style={{padding:"0.65rem 1.1rem",borderRadius:9,border:"none",background:C.accent,color:"white",fontWeight:800,fontSize:"0.83rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.all?0.6:1}}>
                      {busy.all?"分析中...":"⚡ 日米の主力10銘柄をまとめて追加"}
                    </button>
                    <button onClick={()=>{setView("analyze");localStorage.setItem("mt_view","analyze");}}
                      style={{padding:"0.65rem 1.1rem",borderRadius:9,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.83rem",cursor:"pointer",fontFamily:"inherit"}}>
                      🔍 自分で検索して追加
                    </button>
                  </div>
                  <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.7rem"}}>トヨタ / ソニー / 三菱UFJ / 東京エレクトロン / 任天堂 / Apple / Microsoft / NVIDIA / Alphabet / Amazon</div>
                </td></tr>
              )}
              {rows.map(({ticker,name,market:mkt,a,holding})=>{
                const q = a?STOCK_QUAD_META[a.quadrant]:null;
                const pnl = (holding&&holding.price&&a)?(a.price/holding.price-1)*100:null;
                return (
                  <tr key={ticker} onClick={()=>{setSelected(ticker); setHoldEdit(false); if(!newsMap[ticker]) loadNews(ticker); loadChart(ticker); setView("analyze"); localStorage.setItem("mt_view","analyze");}}
                    style={{cursor:"pointer",background:selected===ticker?C.surfaceHover:"white",borderBottom:`1px solid ${C.borderLight}`}}>
                    <td style={{padding:"0.6rem 0.7rem"}}>
                      <div style={{fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{mkt==="JP"?"🇯🇵":"🇺🇸"} {a?.name||name}{holding?" 💼":""}</div>
                      <div style={{fontSize:"0.68rem",color:C.textMuted}}>{ticker}{a?.sector?` / ${a.sector}`:""}</div>
                    </td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:700,color:C.text,whiteSpace:"nowrap"}}>{a?Number(a.price).toLocaleString():"—"}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:700,whiteSpace:"nowrap",color:a?(a.chg1d>=0?C.green:C.red):C.textMuted}}>{a?`${a.chg1d>=0?"+":""}${a.chg1d}%`:"—"}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:800,whiteSpace:"nowrap",color:pnl==null?C.textMuted:(pnl>=0?C.green:C.red)}}>{pnl==null?"—":`${pnl>=0?"+":""}${pnl.toFixed(1)}%`}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:800,color:a?(a.short.score>=70?C.green:(a.short.score>=45?C.yellow:C.textMuted)):C.textMuted}}>{a?a.short.score:"—"}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:800,color:a?(a.long.score>=70?C.green:(a.long.score>=50?C.yellow:C.textMuted)):C.textMuted}}>{a?a.long.score:"—"}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right",fontWeight:800,color:C.accent}}>{a?weighted(a):"—"}</td>
                    <td style={{padding:"0.6rem 0.7rem",textAlign:"right"}}>{q&&<span style={S.chip(q.bg,q.color)}>{a.quadrant}</span>}</td>
                    <td style={{padding:"0.6rem 0.5rem",textAlign:"right"}}>
                      <button onClick={e=>{e.stopPropagation();if(confirm(`${name} をウォッチリストから削除しますか？`))removeStock(ticker);}}
                        style={{...S.iconBtn,color:C.textMuted,fontSize:"0.8rem"}}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      </>)}

      {view==="picks"&&(<>
      {/* ⭐ おすすめ: 全銘柄ランキング */}
      <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem"}}>
          <div>
            <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text}}>⭐ 全銘柄ランキング</div>
            <div style={{fontSize:"0.68rem",color:C.textMuted}}>
              日米主力65銘柄を短期・長期の両面で採点し、狙い目を抽出
              {ranking&&` / ${ranking.deepScanned}銘柄を完全分析 (${new Date(ranking.updatedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}時点)`}
            </div>
          </div>
          <button onClick={()=>loadRanking(true)} disabled={busy.rank}
            style={{padding:"0.5rem 0.95rem",borderRadius:8,border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.rank?0.6:1}}>
            {busy.rank?"分析中(2〜4分)...":"🔄 最新データで再分析"}
          </button>
        </div>
        {busy.rank&&<div style={{fontSize:"0.75rem",color:C.textMuted,marginTop:"0.6rem"}}>65銘柄の株価・財務・指標を計算中です。初回は3〜4分かかります...</div>}
        {ranking&&!ranking.complete&&(
          <div style={{marginTop:"0.5rem",fontSize:"0.7rem",color:C.yellow,fontWeight:600}}>
            ⚠️ 時間制限により{ranking.scanned-ranking.deepScanned}銘柄は短期スコアのみです。「再分析」でキャッシュが効いて全銘柄揃います
          </div>
        )}
      </div>

      {ranking&&ranking.rows&&(()=>{
        const rows = ranking.rows.filter(r=>mktFilter==="all"||r.market===mktFilter);
        const deep = rows.filter(r=>r.long!=null);
        const inWl = t => watchlist.some(w=>w.ticker===t);
        const longTop  = [...deep].sort((a,b)=>b.long-a.long).slice(0,8);
        const shortTop = [...rows].sort((a,b)=>b.short-a.short).slice(0,8);
        // 狙い目: 長期の質が高い(60点以上)前提で、短期の勢い・押し目の両面から総合評価
        const sweet = [...deep].filter(r=>r.long>=60).map(r=>{
          const q = r.quadrant;
          const bonus = q==="本命"?18:(q==="押し目待ち"?10:0);
          return {...r, pick: Math.round(r.long*0.5 + r.short*0.5 + bonus)};
        }).sort((a,b)=>b.pick-a.pick).slice(0,6);

        const Row = ({r,metric,label,rank}) => (
          <div style={{display:"flex",alignItems:"center",gap:"0.6rem",padding:"0.55rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
            <span style={{flexShrink:0,width:22,textAlign:"center",fontWeight:800,fontSize:"0.8rem",color:rank<=3?C.accent:C.textMuted}}>{rank}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {r.market==="JP"?"🇯🇵":"🇺🇸"} {r.name}
                {r.quadrant&&STOCK_QUAD_META[r.quadrant]&&<span style={{...S.chip(STOCK_QUAD_META[r.quadrant].bg,STOCK_QUAD_META[r.quadrant].color),marginLeft:"0.4rem",fontSize:"0.62rem"}}>{r.quadrant}</span>}
              </div>
              <div style={{fontSize:"0.66rem",color:C.textMuted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
            </div>
            <div style={{flexShrink:0,textAlign:"right"}}>
              <div style={{fontWeight:800,fontSize:"0.85rem",color:metric>=70?C.green:(metric>=50?C.yellow:C.textMuted)}}>{metric}</div>
              <div style={{fontSize:"0.62rem",color:r.chg1d>=0?C.green:C.red}}>{r.chg1d>=0?"+":""}{r.chg1d}%</div>
            </div>
            <button onClick={()=>{ if(inWl(r.ticker)){setSelected(r.ticker);setView("analyze");localStorage.setItem("mt_view","analyze");if(!newsMap[r.ticker])loadNews(r.ticker);loadChart(r.ticker);} else addStock({ticker:r.ticker,name:r.name,market:r.market}); }}
              style={{flexShrink:0,padding:"0.3rem 0.6rem",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.68rem",fontWeight:700,
                background:inWl(r.ticker)?C.borderLight:C.accentBg,color:inWl(r.ticker)?C.textSub:C.accentDark}}>
              {inWl(r.ticker)?"詳細":"＋追加"}
            </button>
          </div>
        );

        const Panel = ({title,desc,color,bg,items,render}) => (
          <div style={{...card,flex:"1 1 320px",minWidth:0,padding:"0.85rem 1rem"}}>
            <div style={{fontWeight:800,fontSize:"0.85rem",color,marginBottom:"0.15rem"}}>{title}</div>
            <div style={{fontSize:"0.66rem",color:C.textMuted,marginBottom:"0.5rem",paddingBottom:"0.4rem",borderBottom:`2px solid ${bg}`}}>{desc}</div>
            {items.length===0
              ? <div style={{fontSize:"0.73rem",color:C.textMuted,padding:"0.5rem 0"}}>該当なし(条件を満たす銘柄がありません)</div>
              : items.map((r,i)=>render(r,i+1))}
          </div>
        );

        return (
          <div>
            <div style={{display:"flex",gap:"0.25rem",marginBottom:"0.85rem"}}>
              {[["all","全部"],["JP","🇯🇵日本株"],["US","🇺🇸米国株"]].map(([v,l])=>(
                <button key={v} onClick={()=>setMktFilter(v)}
                  style={{padding:"0.4rem 0.8rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.74rem",fontWeight:700,background:mktFilter===v?C.accent:C.borderLight,color:mktFilter===v?"white":C.textSub}}>{l}</button>
              ))}
            </div>

            {/* 🎯 狙い目(最上段・幅いっぱい) */}
            <div style={{...card,marginBottom:"0.85rem",padding:"0.95rem 1.1rem",border:`2px solid ${C.accent}`}}>
              <div style={{fontWeight:800,fontSize:"0.95rem",color:C.accentDark,marginBottom:"0.15rem"}}>🎯 狙い目 — 今いちばん妙味のある銘柄</div>
              <div style={{fontSize:"0.7rem",color:C.textMuted,marginBottom:"0.6rem"}}>
                「長期で持てる会社(60点以上)」を前提に、短期の買い場としての魅力を加味した総合順位。◎本命=業績も株価も良い / ○押し目待ち=良い会社だが今は買い場待ち
              </div>
              {sweet.length===0
                ? <div style={{fontSize:"0.75rem",color:C.textMuted}}>現在、条件を満たす狙い目銘柄はありません(地合いが弱い時期は該当なしになります)</div>
                : sweet.map((r,i)=>(
                  <Row key={r.ticker} r={r} rank={i+1} metric={r.pick}
                    label={`短期${r.short} / 長期${r.long}${r.per?` / PER${Number(r.per).toFixed(1)}倍`:""}${r.roe?` / ROE${r.roe.toFixed(0)}%`:""}${r.sector?` / ${r.sector}`:""}`}/>
                ))}
            </div>

            <div style={{display:"flex",gap:"0.85rem",flexWrap:"wrap",alignItems:"flex-start"}}>
              <Panel title="🏛️ 長期でいい銘柄" color={C.green} bg={C.greenBg}
                desc="業績・割安さ・財務の質で評価。数年単位で持つ前提の順位"
                items={longTop}
                render={(r,i)=><Row key={r.ticker} r={r} rank={i} metric={r.long}
                  label={(r.longReasons||[]).join(" / ")||`PER${r.per?Number(r.per).toFixed(1):"?"}倍`}/>}/>
              <Panel title="⚡ 短期でいい銘柄" color={C.orange} bg={C.orangeBg}
                desc="トレンド・勢い・出来高で評価。数日〜数週間の値幅取り向け"
                items={shortTop}
                render={(r,i)=><Row key={r.ticker} r={r} rank={i} metric={r.short}
                  label={(r.shortReasons||[]).join(" / ")}/>}/>
            </div>

            <div style={{marginTop:"0.85rem",fontSize:"0.68rem",color:C.textMuted,lineHeight:1.7}}>
              ※スコアは学習済みの因子重みを適用済み。地合いが弱い(指数200日線割れ)時は買いシグナルが自動で保留に格下げされます。<br/>
              ※実際に買う前に、必ず銘柄をタップして「AI分析を実行」で損切りライン・利確目標・リスクを確認してください。
            </div>
          </div>
        );
      })()}
      </>)}

      {view==="analyze"&&(<>

      {/* 分析: 銘柄切替チップ */}
      {watchlist.length>0&&(
        <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap",marginBottom:"0.85rem"}}>
          {watchlist.map(w=>{
            const a = results[w.ticker];
            return (
              <button key={w.ticker} onClick={()=>{setSelected(w.ticker);setHoldEdit(false);if(!newsMap[w.ticker])loadNews(w.ticker);loadChart(w.ticker);}}
                style={{padding:"0.4rem 0.75rem",borderRadius:999,border:`1.5px solid ${selected===w.ticker?C.accent:C.border}`,cursor:"pointer",fontFamily:"inherit",fontSize:"0.75rem",fontWeight:selected===w.ticker?800:600,background:selected===w.ticker?C.accentBg:"white",color:selected===w.ticker?C.accentDark:C.textSub}}>
                {w.market==="JP"?"🇯🇵":"🇺🇸"} {(a&&a.name)||w.name}{w.holding?" 💼":""}
              </button>
            );
          })}
        </div>
      )}

      {/* 銘柄追加 + フィルタ */}
      <div style={{...card,marginBottom:"0.85rem",padding:"0.75rem 1rem"}}>
        <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",alignItems:"center"}}>
          <input type="text" value={query} onChange={e=>setQuery(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")searchStock();}}
            placeholder="銘柄名 or ティッカー（例: トヨタ / 7203.T / AAPL）"
            style={{flex:"1 1 100%",width:"100%",minWidth:0,padding:"0.65rem 0.8rem",borderRadius:"0.625rem",border:`1.5px solid ${C.border}`,fontSize:"0.9rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          <button onClick={searchStock} disabled={busy.add}
            style={{padding:"0.55rem 0.95rem",borderRadius:8,border:"none",background:C.accentBg,color:C.accentDark,fontWeight:700,fontSize:"0.8rem",cursor:"pointer",fontFamily:"inherit"}}>
            {busy.add?"検索中...":"🔍 検索して追加"}
          </button>
          <button onClick={runScreen} disabled={busy.screen}
            style={{padding:"0.55rem 0.95rem",borderRadius:8,border:"none",background:C.purpleBg,color:C.purple,fontWeight:700,fontSize:"0.8rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.screen?0.6:1}}>
            {busy.screen?"スキャン中(1〜2分)...":"🔎 有望銘柄スキャン"}
          </button>
          <div style={{display:"flex",gap:"0.25rem"}}>
            {[["all","全部"],["JP","🇯🇵日本"],["US","🇺🇸米国"]].map(([v,l])=>(
              <button key={v} onClick={()=>setMktFilter(v)}
                style={{padding:"0.4rem 0.7rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.72rem",fontWeight:700,background:mktFilter===v?C.accent:C.borderLight,color:mktFilter===v?"white":C.textSub}}>{l}</button>
            ))}
          </div>
        </div>
        {screenRes&&(
          <div style={{marginTop:"0.6rem",border:`1px solid ${C.borderLight}`,borderRadius:"0.625rem",overflow:"hidden"}}>
            <div style={{padding:"0.5rem 0.8rem",background:C.purpleBg,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:"0.75rem",fontWeight:800,color:C.purple}}>🔎 短期スコア上位(日米主力{screenRes.scanned}銘柄をスキャン・ウォッチリスト除く)</span>
              <button onClick={()=>setScreenRes(null)} style={{background:"none",border:"none",color:C.purple,cursor:"pointer",fontWeight:700}}>✕</button>
            </div>
            {(screenRes.results||[]).map(c=>(
              <div key={c.ticker} style={{padding:"0.55rem 0.8rem",borderBottom:`1px solid ${C.borderLight}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:"0.5rem",background:"white"}}>
                <div style={{minWidth:0}}>
                  <span style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>{c.market==="JP"?"🇯🇵":"🇺🇸"} {c.name}</span>
                  <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"0.4rem"}}>{c.ticker} / {Number(c.price).toLocaleString()} ({c.chg1d>=0?"+":""}{c.chg1d}%)</span>
                  <div style={{fontSize:"0.68rem",color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(c.top||[]).join(" / ")}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexShrink:0}}>
                  <span style={{fontWeight:800,fontSize:"0.85rem",color:c.score>=70?C.green:(c.score>=45?C.yellow:C.textMuted)}}>{c.score}点</span>
                  <button onClick={()=>addStock({ticker:c.ticker,name:c.name,market:c.market})}
                    style={{padding:"0.35rem 0.7rem",borderRadius:8,border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>＋追加</button>
                </div>
              </div>
            ))}
            {(!screenRes.results||screenRes.results.length===0)&&<div style={{padding:"0.6rem 0.8rem",fontSize:"0.75rem",color:C.textMuted}}>高スコア銘柄なし(全て登録済みか、地合いが弱い可能性)</div>}
          </div>
        )}
        {candidates&&(
          <div style={{marginTop:"0.6rem",border:`1px solid ${C.borderLight}`,borderRadius:"0.625rem",overflow:"hidden"}}>
            {candidates.length===0&&<div style={{padding:"0.6rem 0.8rem",fontSize:"0.78rem",color:C.textMuted}}>該当なし。日本株はティッカー直打ち（例: 7203.T）も試してください</div>}
            {candidates.map(c=>(
              <div key={c.ticker} onClick={()=>addStock(c)}
                style={{padding:"0.55rem 0.8rem",borderBottom:`1px solid ${C.borderLight}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",background:"white"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover}
                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                <div>
                  <span style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>{c.name}</span>
                  <span style={{fontSize:"0.72rem",color:C.textMuted,marginLeft:"0.5rem"}}>{c.ticker} / {c.exchange}</span>
                </div>
                <span style={{fontSize:"0.75rem",color:C.accent,fontWeight:700}}>＋追加</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 銘柄詳細 */}
      {sel&&(
        <div style={{display:"flex",gap:"0.85rem",flexWrap:"wrap",alignItems:"flex-start"}}>
          {/* 左: スコアカード */}
          <div style={{...card,flex:"1 1 380px",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.5rem"}}>
              <div>
                <div style={{fontWeight:800,fontSize:"1rem",color:C.text}}>{sel.name} <span style={{fontSize:"0.72rem",color:C.textMuted,fontWeight:600}}>{sel.ticker}</span></div>
                <div style={{fontSize:"0.85rem",fontWeight:800,color:C.text,marginTop:"0.2rem"}}>
                  {Number(sel.price).toLocaleString()} {sel.currency}
                  <span style={{marginLeft:"0.4rem",fontSize:"0.75rem",color:sel.chg1d>=0?C.green:C.red}}>{sel.chg1d>=0?"+":""}{sel.chg1d}%</span>
                </div>
                <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.15rem"}}>52週: {Number(sel.lo52).toLocaleString()}〜{Number(sel.hi52).toLocaleString()} / RSI {sel.rsi} / ATR {sel.atr}</div>
                {(sel.targetPrice||sel.analystRating)&&(
                  <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.15rem"}}>
                    {sel.targetPrice?`🎯 アナリスト目標 ${Number(sel.targetPrice).toLocaleString()}(乖離${((sel.targetPrice/sel.price-1)*100).toFixed(1)}%)`:""}
                    {sel.analystRating?` / 評価 ${({strong_buy:"強気買い",buy:"買い",hold:"中立",underperform:"やや弱気",sell:"売り"})[sel.analystRating]||sel.analystRating}${sel.analystCount?`(${sel.analystCount}名)`:""}`:""}
                  </div>
                )}
                <div style={{marginTop:"0.4rem",fontSize:"0.7rem",color:C.textSub,display:"flex",alignItems:"center",gap:"0.3rem",flexWrap:"wrap"}}>
                  💰 資金<input type="number" value={capital} onChange={e=>{setCapital(e.target.value);localStorage.setItem("md_stock_capital",e.target.value);}} placeholder="300"
                    style={{width:64,padding:"0.2rem 0.4rem",borderRadius:6,border:`1px solid ${C.border}`,fontSize:"0.7rem",fontFamily:"inherit",outline:"none"}}/>万
                  <select value={riskPct} onChange={e=>{setRiskPct(e.target.value);localStorage.setItem("md_stock_risk",e.target.value);}}
                    style={{padding:"0.2rem",borderRadius:6,border:`1px solid ${C.border}`,fontSize:"0.7rem",fontFamily:"inherit"}}>
                    {["1","2","3"].map(v=><option key={v} value={v}>リスク{v}%</option>)}
                  </select>
                  {(()=>{
                    const cap = parseFloat(capital)*10000;
                    if(!cap||!sel.atr) return <span style={{color:C.textMuted}}>→ 資金を入力すると推奨ロット表示</span>;
                    const allowed = cap*parseFloat(riskPct)/100;   // 1トレード許容損失
                    const stopW = 2*sel.atr;                        // 損切り幅=2ATR
                    let sh = Math.floor(allowed/stopW);
                    if(sel.market==="JP") sh = Math.floor(sh/100)*100;  // 単元株(100株)
                    return sh>0
                      ? <span style={{fontWeight:800,color:C.text}}>→ 推奨 {sh.toLocaleString()}株 <span style={{fontWeight:500,color:C.textMuted}}>(2ATR損切りで損失≦{Math.round(allowed).toLocaleString()} / 投入約{Math.round(sh*sel.price).toLocaleString()})</span></span>
                      : <span style={{color:C.red,fontWeight:700}}>→ 1単元でリスク{riskPct}%超過(この銘柄は資金に対して値がさ)</span>;
                  })()}
                </div>
                {(()=>{  // 💼 保有ポジション管理
                  const w = watchlist.find(x=>x.ticker===sel.ticker);
                  const h = w&&w.holding;
                  if(holdEdit) return (
                    <div style={{marginTop:"0.45rem",display:"flex",gap:"0.35rem",alignItems:"center",flexWrap:"wrap"}}>
                      <input type="number" placeholder="取得単価" value={holdForm.price} onChange={e=>setHoldForm(f=>({...f,price:e.target.value}))}
                        style={{width:100,padding:"0.35rem 0.5rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.78rem",fontFamily:"inherit",outline:"none"}}/>
                      <input type="number" placeholder="株数(任意)" value={holdForm.qty} onChange={e=>setHoldForm(f=>({...f,qty:e.target.value}))}
                        style={{width:90,padding:"0.35rem 0.5rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.78rem",fontFamily:"inherit",outline:"none"}}/>
                      <button onClick={()=>{
                        const p=parseFloat(holdForm.price);
                        if(!p||p<=0){alert("取得単価を入力してください");return;}
                        saveWatchlist(watchlist.map(x=>x.ticker===sel.ticker?{...x,holding:{price:p,qty:parseFloat(holdForm.qty)||null,date:new Date().toISOString().slice(0,10)}}:x));
                        setHoldEdit(false);
                      }} style={{padding:"0.35rem 0.7rem",borderRadius:8,border:"none",background:C.accent,color:"white",fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>保存</button>
                      <button onClick={()=>setHoldEdit(false)} style={{...S.iconBtn,color:C.textMuted,fontSize:"0.72rem",fontWeight:700}}>キャンセル</button>
                    </div>
                  );
                  if(h&&h.price){
                    const pct=(sel.price/h.price-1)*100;
                    return (
                      <div style={{marginTop:"0.4rem",fontSize:"0.76rem",fontWeight:700,color:C.text,display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap"}}>
                        <span>💼 保有中: 取得{Number(h.price).toLocaleString()}{h.qty?`×${h.qty}株`:""} → 損益
                          <span style={{color:pct>=0?C.green:C.red,marginLeft:"0.25rem"}}>{pct>=0?"+":""}{pct.toFixed(1)}%{h.qty?`(${Math.round((sel.price-h.price)*h.qty).toLocaleString()}${sel.currency==="JPY"?"円":sel.currency})`:""}</span>
                        </span>
                        <button onClick={()=>{setHoldForm({price:String(h.price),qty:h.qty?String(h.qty):""});setHoldEdit(true);}} style={{...S.iconBtn,color:C.accent,fontSize:"0.7rem",fontWeight:700}}>編集</button>
                        <button onClick={()=>closePosition(w,h)} style={{...S.iconBtn,color:C.orange,fontSize:"0.7rem",fontWeight:700}}>決済(日誌に記録)</button>
                      </div>
                    );
                  }
                  return <button onClick={()=>{setHoldForm({price:"",qty:""});setHoldEdit(true);}}
                    style={{...S.iconBtn,color:C.accent,fontSize:"0.72rem",fontWeight:700,marginTop:"0.35rem",padding:0}}>💼 保有を登録(損益追跡＋AIが売り時も判断)</button>;
                })()}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem",alignItems:"flex-end"}}>
                {STOCK_QUAD_META[sel.quadrant]&&<span style={S.chip(STOCK_QUAD_META[sel.quadrant].bg,STOCK_QUAD_META[sel.quadrant].color)}>{sel.quadrant}</span>}
                {sel.regime&&!sel.regime.benchAboveMa200&&<span style={S.chip(C.redBg,C.red)}>⚠️ {sel.regime.bench}200日線割れ</span>}
                {sel.earningsDate&&(()=>{
                  const d=Math.ceil((new Date(sel.earningsDate)-Date.now())/86400000);
                  return d>=0&&d<=10?<span style={S.chip(C.yellowBg,C.yellow)}>📅 決算{sel.earningsDate}</span>:null;
                })()}
                {sel.exDividendDate&&(()=>{
                  const d=Math.ceil((new Date(sel.exDividendDate)-Date.now())/86400000);
                  return d>=0&&d<=7?<span style={S.chip(C.blueBg,C.blue)}>💰 配当落ち{sel.exDividendDate}</span>:null;
                })()}
              </div>
            </div>
            <div style={{margin:"0.5rem 0 0.75rem",padding:"0.5rem",background:C.bg,borderRadius:"0.625rem"}}>
              <div style={{display:"flex",gap:"0.25rem",marginBottom:"0.4rem",flexWrap:"wrap",alignItems:"center"}}>
                {[["3mo","3ヶ月"],["6mo","6ヶ月"],["1y","1年"],["3y","3年"],["5y","5年"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setChartPeriod(v);loadChart(sel.ticker,v);}}
                    style={{padding:"0.25rem 0.6rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.68rem",fontWeight:700,
                      background:chartPeriod===v?C.accent:C.borderLight,color:chartPeriod===v?"white":C.textSub}}>{l}</button>
                ))}
                <span style={{fontSize:"0.62rem",color:C.textMuted,marginLeft:"auto"}}>
                  <span style={{color:"#0070D4"}}>25</span>/<span style={{color:"#FF6A00"}}>75</span>/<span style={{color:"#7A5AD9"}}>200日</span>
                </span>
              </div>
              <div style={{display:"flex",gap:"0.25rem",marginBottom:"0.4rem",flexWrap:"wrap",alignItems:"center"}}>
                {[["1d","日足"],["1wk","週足"],["1mo","月足"]].map(([v,l])=>(
                  <button key={v} onClick={()=>{setChartIv(v);loadChart(sel.ticker,chartPeriod,v);}}
                    style={{padding:"0.25rem 0.6rem",borderRadius:7,border:`1px solid ${chartIv===v?C.accent:C.border}`,cursor:"pointer",fontFamily:"inherit",fontSize:"0.68rem",fontWeight:700,
                      background:chartIv===v?C.accentBg:"white",color:chartIv===v?C.accentDark:C.textSub}}>{l}</button>
                ))}
                <span style={{width:8}}/>
                {[["bb","ボリンジャー"],["ichimoku","一目均衡表"],["volMa","出来高平均"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setChartShow(c=>({...c,[k]:!c[k]}))}
                    style={{padding:"0.25rem 0.6rem",borderRadius:999,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"0.66rem",fontWeight:700,
                      background:chartShow[k]?C.purpleBg:C.borderLight,color:chartShow[k]?C.purple:C.textMuted}}>
                    {chartShow[k]?"✓ ":""}{l}
                  </button>
                ))}
                {chart&&chart.ticker===sel.ticker&&(
                  <span style={{fontSize:"0.6rem",color:C.textMuted,marginLeft:"auto"}}>
                    最終足 {chart.lastDate} / 取得 {new Date(chart.updatedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}
                    <button onClick={()=>loadChart(sel.ticker,chartPeriod,chartIv)} style={{...S.iconBtn,color:C.accent,fontSize:"0.6rem",fontWeight:700,marginLeft:"0.3rem"}}>🔄</button>
                  </span>
                )}
              </div>
              {busy.chart&&<div style={{fontSize:"0.72rem",color:C.textMuted,padding:"1rem",textAlign:"center"}}>チャート読み込み中...</div>}
              {!busy.chart&&(chart&&chart.ticker===sel.ticker
                ? <StockProChart data={chart} levels={sel.tradeLevels} show={chartShow}/>
                : (sel.candles&&sel.candles.length>1
                    ? <StockCandleChart candles={sel.candles} ma25={sel.sparkMa25} levels={sel.tradeLevels}/>
                    : <StockSparkline spark={sel.spark} ma25={sel.sparkMa25}/>))}
              {sel.tradeLevels&&(
                <div style={{marginTop:"0.4rem",padding:"0.5rem 0.65rem",background:"white",borderRadius:8,border:`1px solid ${C.borderLight}`,fontSize:"0.73rem",lineHeight:1.75,color:C.text}}>
                  <b style={{color:C.accentDark}}>📖 チャートの読み方</b><br/>
                  <span style={{color:C.blue}}>青の点線 = 買い場の目安 {Number(sel.tradeLevels.entry).toLocaleString()}</span>(ここまで下がったら買い検討)<br/>
                  <span style={{color:C.red}}>赤の点線 = 損切りライン {Number(sel.tradeLevels.stop).toLocaleString()}</span>(ここを割ったら迷わず売る。想定リスク −{sel.tradeLevels.riskPct}%)<br/>
                  <span style={{color:C.green}}>緑の点線 = 利確目標 {Number(sel.tradeLevels.target1).toLocaleString()} / {Number(sel.tradeLevels.target2).toLocaleString()}</span>(+{sel.tradeLevels.rewardPct}%以上)<br/>
                  <span style={{color:C.textMuted}}>損失1に対して利益2を狙う配分です。損切りを守れば、勝率4割でも資産は増える計算になります。</span>
                </div>
              )}
            </div>
            <div style={{padding:"0.55rem 0.7rem",background:C.accentBg,borderRadius:8,marginBottom:"0.5rem",fontSize:"0.73rem",lineHeight:1.7,color:C.text}}>
              <b style={{color:C.accentDark}}>💡 かんたん解説</b><br/>
              <b>短期{sel.short.score}点</b>=「今買うタイミングとして良いか」({sel.short.score>=70?"◎ 今が買い場":sel.short.score>=45?"△ もう少し待ちたい":"× 今は見送り"})<br/>
              <b>長期{sel.long.score}点</b>=「会社として持っていて安心か」({sel.long.score>=70?"◎ 質の高い会社":sel.long.score>=50?"△ 条件付き":"× おすすめしない"})<br/>
              <b style={{color:C.purple}}>→ {sel.quadrant==="本命"?"会社も良く、今が買い場。一番おいしい状態です":sel.quadrant==="押し目待ち"?"良い会社ですが今は高い。下がるのを待ちましょう":sel.quadrant==="短期限定"?"値動きは良いが会社の質は普通。短期の売買だけに":"今は手を出さない方が良い状態です"}</b>
            </div>
            <StockScoreBar label={`⚡ 短期テクニカル（${sel.short.signal==="buy"?"買い候補":sel.short.signal==="watch"?"監視":"見送り"}）`} score={sel.short.score}/>
            <div style={{marginBottom:"0.7rem"}}>
              {sel.short.breakdown.map((b,i)=>(
                <div key={i} style={{fontSize:"0.72rem",color:b.max===0?C.red:C.textSub,lineHeight:1.55,marginTop:"0.2rem"}}>
                  <b style={{color:b.max===0?C.red:C.text}}>{b.max===0?"⚠️ "+b.category:`${b.category} ${b.points}/${b.max}`}</b>　{b.reason}
                </div>
              ))}
            </div>
            <StockScoreBar label={`🏛️ 長期ファンダ（${sel.long.signal==="buy"?"投資候補":sel.long.signal==="watch"?"条件付き":"見送り"}）`} score={sel.long.score}/>
            <div>
              {sel.long.breakdown.map((b,i)=>(
                <div key={i} style={{fontSize:"0.72rem",color:C.textSub,lineHeight:1.55,marginTop:"0.2rem"}}>
                  <b style={{color:C.text}}>{b.category} {b.points}/{b.max}</b>　{b.reason}
                </div>
              ))}
              {sel.long.missing&&sel.long.missing.length>0&&(
                <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.3rem"}}>※データ取得不可: {sel.long.missing.join("、")}</div>
              )}
              {sel.proChecklist&&sel.proChecklist.items&&sel.proChecklist.items.length>0&&(()=>{
                const pc = sel.proChecklist;
                const groups = [];
                pc.items.forEach(i=>{ if(!groups.includes(i.group)) groups.push(i.group); });
                const rate = pc.total>0 ? pc.passed/pc.total : 0;
                return (
                  <div style={{marginTop:"0.6rem",padding:"0.6rem 0.75rem",background:C.bg,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.35rem"}}>
                      <span style={{fontSize:"0.78rem",fontWeight:800,color:C.text}}>✅ プロのチェックリスト</span>
                      <span style={S.chip(rate>=0.75?C.greenBg:(rate>=0.5?C.yellowBg:C.redBg), rate>=0.75?C.green:(rate>=0.5?C.yellow:C.red))}>{pc.passed}/{pc.total} 合格</span>
                    </div>
                    {groups.map(g=>(
                      <div key={g} style={{marginBottom:"0.35rem"}}>
                        <div style={{fontSize:"0.68rem",fontWeight:800,color:C.textSub,marginBottom:"0.1rem"}}>
                          {g==="トレンドテンプレート"?"📐 トレンドテンプレート(ミネルヴィニ)":g==="CAN-SLIM"?"🚀 CAN-SLIM(オニール)":"🌡️ 過熱度"}
                        </div>
                        {pc.items.filter(i=>i.group===g).map((i,k)=>(
                          <div key={k} style={{fontSize:"0.7rem",lineHeight:1.6,color:i.pass===false?C.textMuted:C.textSub,display:"flex",gap:"0.35rem"}}>
                            <span style={{flexShrink:0}}>{i.pass===true?"✅":i.pass===false?"❌":"➖"}</span>
                            <span><b style={{color:i.pass===true?C.text:C.textMuted}}>{i.name}</b> <span style={{color:C.textMuted}}>{i.detail}</span></span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
              {sel.finHistory&&sel.finHistory.years&&sel.finHistory.years.length>0&&(
                <div style={{marginTop:"0.5rem",padding:"0.5rem 0.7rem",background:C.bg,borderRadius:8,fontSize:"0.7rem",color:C.textSub,lineHeight:1.7}}>
                  {sel.finHistory.eps.some(e=>e!=null)&&(
                    <div>📈 <b style={{color:C.text}}>EPS推移</b>: {sel.finHistory.years.map((y,i)=>`${y}年 ${sel.finHistory.eps[i]!=null?sel.finHistory.eps[i]:"—"}`).join(" → ")}</div>
                  )}
                  {sel.finHistory.roe.some(r=>r!=null)&&(
                    <div>🏦 <b style={{color:C.text}}>ROE推移</b>: {sel.finHistory.years.map((y,i)=>`${y}年 ${sel.finHistory.roe[i]!=null?sel.finHistory.roe[i]+"%":"—"}`).join(" → ")}</div>
                  )}
                </div>
              )}
              {/* 外部リサーチリンク(ワンタップで裏取り) */}
              <div style={{marginTop:"0.6rem",display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
                {(sel.market==="JP"
                  ? [["Yahoo!ファイナンス",`https://finance.yahoo.co.jp/quote/${sel.ticker}`],
                     ["株探",`https://kabutan.jp/stock/?code=${sel.ticker.replace(".T","")}`],
                     ["みんかぶ",`https://minkabu.jp/stock/${sel.ticker.replace(".T","")}`],
                     ["IR BANK",`https://irbank.net/${sel.ticker.replace(".T","")}`]]
                  : [["Yahoo Finance",`https://finance.yahoo.com/quote/${sel.ticker}`],
                     ["TradingView",`https://www.tradingview.com/symbols/${sel.ticker}/`],
                     ["Finviz",`https://finviz.com/quote.ashx?t=${sel.ticker}`]]
                ).map(([l,u])=>(
                  <a key={l} href={u} target="_blank" rel="noopener noreferrer" style={{...S.chip(C.accentBg,C.accentDark),textDecoration:"none"}}>{l} ↗</a>
                ))}
              </div>
            </div>
          </div>

          {/* 右: AI判定 + ニュース */}
          <div style={{flex:"1 1 380px",minWidth:0,display:"flex",flexDirection:"column",gap:"0.85rem"}}>
            {/* プロトレーダー脳 */}
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
                <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text}}>🧠 プロトレーダーAI判定</div>
                <button onClick={()=>runBrain(sel.ticker)} disabled={busy.brain}
                  style={{padding:"0.45rem 0.85rem",borderRadius:8,border:"none",background:"linear-gradient(135deg,#7A5AD9,#0070D4)",color:"white",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.brain?0.6:1}}>
                  {busy.brain?"分析中(〜30秒)...":selBrain?"🔄 再分析":"▶ AI分析を実行"}
                </button>
              </div>
              {!selBrain&&!busy.brain&&(
                <div style={{fontSize:"0.75rem",color:C.textMuted,lineHeight:1.6}}>
                  テクニカル・ファンダ・最新ニュース・地合いを統合し、プロトレーダーの思考プロセスで
                  「エントリー戦略・損切り・利確目標」までを提示します。
                </div>
              )}
              {selBrain&&selBrain.brain&&(()=>{
                const b = selBrain.brain;
                const vm = STOCK_VERDICT_META[b.verdict]||STOCK_VERDICT_META.hold;
                return (
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                      <span style={{...S.chip(vm.bg,vm.color),fontSize:"0.82rem",padding:"0.3rem 0.75rem"}}>{vm.label}</span>
                      <span style={{fontSize:"0.78rem",color:"#BE4A04",fontWeight:700}}>確信度 {"★".repeat(Math.max(1,Math.min(5,b.conviction||1)))}{"☆".repeat(5-Math.max(1,Math.min(5,b.conviction||1)))}</span>
                      {b.news_sentiment&&<span style={S.chip(b.news_sentiment==="positive"?C.greenBg:(b.news_sentiment==="negative"?C.redBg:C.borderLight), b.news_sentiment==="positive"?C.green:(b.news_sentiment==="negative"?C.red:C.textSub))}>ニュース{b.news_sentiment==="positive"?"好材料":b.news_sentiment==="negative"?"悪材料":"中立"}</span>}
                    </div>
                    <div style={{fontSize:"0.8rem",color:C.text,lineHeight:1.7,marginBottom:"0.7rem",whiteSpace:"pre-wrap"}}>{b.summary}</div>
                    {b.position_advice&&b.position_advice!=="null"&&(
                      <div style={{padding:"0.5rem 0.7rem",background:C.accentBg,borderRadius:8,marginBottom:"0.5rem"}}>
                        <div style={{fontSize:"0.7rem",fontWeight:800,color:C.accentDark,marginBottom:"0.15rem"}}>💼 保有ポジション判断</div>
                        <div style={{fontSize:"0.78rem",color:C.text,lineHeight:1.6}}>{b.position_advice}</div>
                      </div>
                    )}
                    {[["🎯 エントリー",b.entry_plan],["🛑 損切り",b.stop_loss],["💰 利確目標",b.targets],["⏳ 想定期間",b.time_horizon]].map(([l,v])=>v&&(
                      <div key={l} style={{display:"flex",gap:"0.5rem",fontSize:"0.75rem",lineHeight:1.6,marginBottom:"0.3rem"}}>
                        <span style={{flexShrink:0,fontWeight:700,color:C.textSub,minWidth:86}}>{l}</span>
                        <span style={{color:C.text}}>{v}</span>
                      </div>
                    ))}
                    {b.catalysts&&b.catalysts.length>0&&(
                      <div style={{marginTop:"0.5rem",padding:"0.5rem 0.7rem",background:C.greenBg,borderRadius:8}}>
                        <div style={{fontSize:"0.7rem",fontWeight:800,color:C.green,marginBottom:"0.2rem"}}>📈 カタリスト</div>
                        {b.catalysts.map((x,i)=><div key={i} style={{fontSize:"0.73rem",color:C.text,lineHeight:1.55}}>・{x}</div>)}
                      </div>
                    )}
                    {b.risks&&b.risks.length>0&&(
                      <div style={{marginTop:"0.4rem",padding:"0.5rem 0.7rem",background:C.redBg,borderRadius:8}}>
                        <div style={{fontSize:"0.7rem",fontWeight:800,color:C.red,marginBottom:"0.2rem"}}>⚠️ リスク</div>
                        {b.risks.map((x,i)=><div key={i} style={{fontSize:"0.73rem",color:C.text,lineHeight:1.55}}>・{x}</div>)}
                      </div>
                    )}
                    <div style={{fontSize:"0.62rem",color:C.textMuted,marginTop:"0.5rem",textAlign:"right"}}>分析: {selBrain.market?.moodLabel||""} / {new Date(selBrain.updatedAt).toLocaleString("ja-JP")}</div>
                  </div>
                );
              })()}
            </div>

            {/* ニュース */}
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
                <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text}}>📰 関連ニュース</div>
                <button onClick={()=>loadNews(sel.ticker)} disabled={busy.news} style={{...S.iconBtn,color:C.accent,fontSize:"0.75rem",fontWeight:700}}>{busy.news?"取得中...":"🔄 更新"}</button>
              </div>
              {(!selNews||selNews.length===0)&&<div style={{fontSize:"0.75rem",color:C.textMuted}}>{busy.news?"取得中...":"ニュースが見つかりません"}</div>}
              {(selNews||[]).map((n,i)=>(
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                  style={{display:"block",padding:"0.45rem 0",borderBottom:`1px solid ${C.borderLight}`,textDecoration:"none"}}>
                  <div style={{fontSize:"0.77rem",fontWeight:600,color:C.accentDark,lineHeight:1.5}}>{n.title}</div>
                  <div style={{fontSize:"0.64rem",color:C.textMuted,marginTop:"0.1rem"}}>{n.source}{n.published?` / ${n.published}`.slice(0,30):""}</div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {!sel&&(
        <div style={{background:"white",borderRadius:"1rem",padding:"2rem",border:`1px solid ${C.border}`,textAlign:"center"}}>
          <div style={{color:C.textMuted,fontSize:"0.85rem",marginBottom:watchlist.length?0:"0.9rem"}}>
            {watchlist.length?"上のチップから銘柄を選んでください":"銘柄を追加すると、ローソク足・スコア・プロのチェックリスト・AI売買判定が見られます"}
          </div>
          {!watchlist.length&&(
            <button onClick={addStarterPack} disabled={busy.all}
              style={{padding:"0.65rem 1.1rem",borderRadius:9,border:"none",background:C.accent,color:"white",fontWeight:800,fontSize:"0.83rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.all?0.6:1}}>
              {busy.all?"分析中...":"⚡ 日米の主力10銘柄をまとめて追加"}
            </button>
          )}
        </div>
      )}

      </>)}

      {view==="demo"&&(<>
      {/* 💴 デモトレード */}
      <div style={{...card,marginBottom:"0.85rem",padding:"1rem 1.1rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.6rem"}}>
          <div>
            <div style={{fontWeight:800,fontSize:"0.95rem",color:C.text}}>💴 デモ売買 <span style={{fontSize:"0.68rem",fontWeight:600,color:C.textMuted}}>仮想資金で練習・実際のお金は動きません</span></div>
            <div style={{fontSize:"0.68rem",color:C.textMuted}}>実際の株価で約定します(手数料0.1%・日本株は100株単位)</div>
          </div>
          <div style={{display:"flex",gap:"0.4rem"}}>
            <button onClick={loadPaper} disabled={busy.paper} style={{padding:"0.45rem 0.8rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>🔄 更新</button>
            <button onClick={async()=>{ if(!confirm("デモ口座を初期資金100万円にリセットしますか？(保有と履歴が消えます)"))return;
                setBusy(b=>({...b,paper:true}));
                try{ const r=await api({action:"paper-reset",initial:1000000},120000); setPaper(r);}catch(e){setErrMsg(e.message);}
                setBusy(b=>({...b,paper:false})); }}
              style={{padding:"0.45rem 0.8rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textMuted,fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit"}}>リセット</button>
          </div>
        </div>

        {/* 🤖 AI自動デモ売買 */}
        <div style={{padding:"0.7rem 0.85rem",background:autoCfg&&autoCfg.enabled?"linear-gradient(135deg,#F0FDF4,#E6F0FF)":C.bg,borderRadius:10,marginBottom:"0.75rem",border:`1.5px solid ${autoCfg&&autoCfg.enabled?C.green:C.border}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.5rem"}}>
            <div>
              <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>🤖 AIにおまかせ運用
                <span style={{...S.chip(autoCfg&&autoCfg.enabled?C.greenBg:C.borderLight, autoCfg&&autoCfg.enabled?C.green:C.textSub),marginLeft:"0.4rem"}}>
                  {autoCfg&&autoCfg.enabled?"稼働中":"停止中"}
                </span>
              </div>
              <div style={{fontSize:"0.68rem",color:C.textSub,marginTop:"0.15rem",lineHeight:1.6}}>
                毎朝8時にAIの判断で自動売買します。損切り・利確も自動。<b>実績が自動で貯まるので精度が見えるようになります</b>
              </div>
            </div>
            <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap"}}>
              <button onClick={()=>saveAuto({enabled:!(autoCfg&&autoCfg.enabled)})} disabled={busy.auto}
                style={{padding:"0.5rem 1rem",borderRadius:8,border:"none",background:autoCfg&&autoCfg.enabled?C.textMuted:C.green,color:"white",fontWeight:800,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit"}}>
                {autoCfg&&autoCfg.enabled?"停止する":"▶ 開始する"}
              </button>
              <button onClick={runAuto} disabled={busy.auto}
                style={{padding:"0.5rem 0.9rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit"}}>
                {busy.auto?"実行中...":"今すぐ1回実行"}
              </button>
            </div>
          </div>
          {autoCfg&&(
            <div style={{display:"flex",gap:"0.8rem",flexWrap:"wrap",alignItems:"center",marginTop:"0.5rem",fontSize:"0.7rem",color:C.textSub}}>
              <span>1回の損失上限
                <select value={autoCfg.riskPct} onChange={e=>saveAuto({riskPct:parseFloat(e.target.value)})}
                  style={{marginLeft:"0.25rem",padding:"0.15rem",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.7rem"}}>
                  {[1,2,3].map(v=><option key={v} value={v}>資産の{v}%</option>)}
                </select>
              </span>
              <span>同時保有
                <select value={autoCfg.maxPositions} onChange={e=>saveAuto({maxPositions:parseInt(e.target.value,10)})}
                  style={{marginLeft:"0.25rem",padding:"0.15rem",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.7rem"}}>
                  {[3,5,8,10].map(v=><option key={v} value={v}>{v}銘柄まで</option>)}
                </select>
              </span>
              <span>確信度
                <select value={autoCfg.minConviction} onChange={e=>saveAuto({minConviction:parseInt(e.target.value,10)})}
                  style={{marginLeft:"0.25rem",padding:"0.15rem",borderRadius:6,border:`1px solid ${C.border}`,fontFamily:"inherit",fontSize:"0.7rem"}}>
                  {[2,3,4,5].map(v=><option key={v} value={v}>★{v}以上</option>)}
                </select>
              </span>
            </div>
          )}
          {autoCfg&&(autoCfg.log||[]).length>0&&(
            <div style={{marginTop:"0.5rem",paddingTop:"0.45rem",borderTop:`1px solid ${C.borderLight}`}}>
              <div style={{fontSize:"0.68rem",fontWeight:800,color:C.textSub,marginBottom:"0.2rem"}}>📋 自動売買の記録</div>
              {(autoCfg.log||[]).slice(-5).reverse().map((l,i)=>(
                <div key={i} style={{fontSize:"0.68rem",color:C.textSub,lineHeight:1.6}}>
                  <b style={{color:C.text}}>{l.date}</b> 資産{Number(l.equity).toLocaleString()}円
                  {(l.actions||[]).length===0?" / 売買なし":(l.actions||[]).map((a,j)=>(
                    <span key={j} style={{marginLeft:"0.35rem",color:a.type==="buy"?C.blue:(a.type==="sell"?C.orange:C.textMuted)}}>
                      {a.type==="buy"?"買":a.type==="sell"?"売":"—"}{a.name||a.ticker}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {!paper&&<div style={{fontSize:"0.8rem",color:C.textMuted}}>{busy.paper?"読み込み中...":"「🔄 更新」を押してください"}</div>}
        {paper&&(<>
          {/* サマリー */}
          <div style={{display:"flex",gap:"0.6rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
            {[["総資産",paper.equity,true],["現金",paper.cash,false],["株式評価額",paper.positionValue,false]].map(([l,v,big],i)=>(
              <div key={i} style={{flex:"1 1 130px",padding:"0.6rem 0.75rem",background:C.bg,borderRadius:10,border:`1px solid ${C.borderLight}`}}>
                <div style={{fontSize:"0.66rem",fontWeight:700,color:C.textMuted}}>{l}</div>
                <div style={{fontSize:big?"1.15rem":"0.95rem",fontWeight:800,color:C.text}}>{Number(v).toLocaleString()}<span style={{fontSize:"0.7rem",fontWeight:600}}>円</span></div>
              </div>
            ))}
            <div style={{flex:"1 1 150px",padding:"0.6rem 0.75rem",background:paper.totalPnl>=0?C.greenBg:C.redBg,borderRadius:10}}>
              <div style={{fontSize:"0.66rem",fontWeight:700,color:paper.totalPnl>=0?C.green:C.red}}>損益(初期100万円比)</div>
              <div style={{fontSize:"1.15rem",fontWeight:800,color:paper.totalPnl>=0?C.green:C.red}}>
                {paper.totalPnl>=0?"+":""}{Number(paper.totalPnl).toLocaleString()}<span style={{fontSize:"0.7rem"}}>円</span>
                <span style={{fontSize:"0.78rem",marginLeft:"0.35rem"}}>({paper.totalPnlPct>=0?"+":""}{paper.totalPnlPct}%)</span>
              </div>
            </div>
          </div>

          {/* 資産推移グラフ */}
          {paper.history&&paper.history.length>1&&(()=>{
            const h=paper.history, vals=h.map(x=>x.equity);
            const mn=Math.min(...vals,paper.initial), mx=Math.max(...vals,paper.initial), rg=(mx-mn)||1;
            const W=560,H=70;
            const pts=h.map((x,i)=>`${(i/(h.length-1)*W).toFixed(1)},${(H-4-((x.equity-mn)/rg)*(H-8)).toFixed(1)}`).join(" ");
            const zeroY=H-4-((paper.initial-mn)/rg)*(H-8);
            return (
              <div style={{marginBottom:"0.75rem",padding:"0.5rem",background:C.bg,borderRadius:8}}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
                  <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke={C.textMuted} strokeWidth="1" strokeDasharray="4 3"/>
                  <polyline points={pts} fill="none" stroke={paper.totalPnl>=0?"#009122":"#DA1313"} strokeWidth="2"/>
                </svg>
                <div style={{fontSize:"0.62rem",color:C.textMuted,textAlign:"right"}}>資産推移(点線=初期資金100万円) / {h.length}日分</div>
              </div>
            );
          })()}

          {/* 成績 */}
          {paper.stats&&paper.stats.closed>0&&(
            <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
              <span style={S.chip(C.borderLight,C.textSub)}>決済{paper.stats.closed}回</span>
              {paper.stats.winRate!=null&&<span style={S.chip(paper.stats.winRate>=50?C.greenBg:C.redBg,paper.stats.winRate>=50?C.green:C.red)}>勝率{paper.stats.winRate}%</span>}
              {paper.stats.profitFactor!=null&&<span style={S.chip(paper.stats.profitFactor>=1.5?C.greenBg:C.yellowBg,paper.stats.profitFactor>=1.5?C.green:C.yellow)}>PF {paper.stats.profitFactor}</span>}
              <span style={S.chip(C.greenBg,C.green)}>平均利益 +{Number(paper.stats.avgWin).toLocaleString()}円</span>
              <span style={S.chip(C.redBg,C.red)}>平均損失 {Number(paper.stats.avgLoss).toLocaleString()}円</span>
            </div>
          )}

          {/* 発注フォーム */}
          <div style={{padding:"0.7rem 0.8rem",background:C.accentBg,borderRadius:10,marginBottom:"0.75rem"}}>
            <div style={{fontSize:"0.76rem",fontWeight:800,color:C.accentDark,marginBottom:"0.4rem"}}>📝 注文する</div>
            <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap",alignItems:"center"}}>
              <select value={orderForm.ticker} onChange={e=>setOrderForm(f=>({...f,ticker:e.target.value}))}
                style={{flex:"1 1 200px",padding:"0.5rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit"}}>
                <option value="">銘柄を選ぶ</option>
                {watchlist.map(w=><option key={w.ticker} value={w.ticker}>{(results[w.ticker]&&results[w.ticker].name)||w.name} ({w.ticker})</option>)}
                {(brief&&brief.plans||[]).filter(p=>!watchlist.some(w=>w.ticker===p.ticker)).map(p=><option key={p.ticker} value={p.ticker}>⭐ {p.name} ({p.ticker})</option>)}
              </select>
              <input type="number" step="100" value={orderForm.qty} onChange={e=>setOrderForm(f=>({...f,qty:e.target.value}))} placeholder="株数"
                style={{width:100,padding:"0.5rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit",outline:"none"}}/>
              <button onClick={()=>{ if(!orderForm.ticker||!orderForm.qty){alert("銘柄と株数を入力してください");return;} paperOrder(orderForm.ticker,"buy",orderForm.qty,"手動"); }}
                disabled={busy.paper} style={{padding:"0.5rem 1rem",borderRadius:8,border:"none",background:C.green,color:"white",fontWeight:800,fontSize:"0.8rem",cursor:"pointer",fontFamily:"inherit"}}>買う</button>
              <button onClick={()=>{ if(!orderForm.ticker||!orderForm.qty){alert("銘柄と株数を入力してください");return;} paperOrder(orderForm.ticker,"sell",orderForm.qty,"手動"); }}
                disabled={busy.paper} style={{padding:"0.5rem 1rem",borderRadius:8,border:"none",background:C.red,color:"white",fontWeight:800,fontSize:"0.8rem",cursor:"pointer",fontFamily:"inherit"}}>売る</button>
            </div>
            <div style={{fontSize:"0.66rem",color:C.textSub,marginTop:"0.35rem"}}>
              日本株は100株単位です。ホームの「💰具体的な売買プラン」からワンタップ発注もできます。
            </div>
          </div>

          {/* 保有 */}
          <div style={{fontSize:"0.78rem",fontWeight:800,color:C.text,marginBottom:"0.3rem"}}>📦 保有銘柄</div>
          {paper.positions.length===0
            ? <div style={{fontSize:"0.75rem",color:C.textMuted,padding:"0.5rem 0"}}>保有なし。上のフォームか、ホームの売買プランから買ってみてください</div>
            : paper.positions.map(p=>(
              <div key={p.ticker} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.5rem 0",borderBottom:`1px solid ${C.borderLight}`,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 150px",minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:"0.82rem",color:C.text}}>{p.name}</div>
                  <div style={{fontSize:"0.68rem",color:C.textMuted}}>{p.qty}株 / 平均取得 {Number(p.avgPrice).toLocaleString()} → 現在 {Number(p.price).toLocaleString()}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,fontSize:"0.85rem",color:p.pnl>=0?C.green:C.red}}>{p.pnl>=0?"+":""}{Number(p.pnl).toLocaleString()}円</div>
                  <div style={{fontSize:"0.7rem",color:p.pnlPct>=0?C.green:C.red}}>{p.pnlPct>=0?"+":""}{p.pnlPct}%</div>
                </div>
                <button onClick={()=>{ if(confirm(`${p.name} ${p.qty}株を全部売りますか？`)) paperOrder(p.ticker,"sell",p.qty,"全売却"); }}
                  style={{padding:"0.35rem 0.7rem",borderRadius:7,border:"none",background:C.redBg,color:C.red,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:"inherit"}}>全部売る</button>
              </div>
            ))}

          {/* 履歴 */}
          {paper.trades.length>0&&(
            <div style={{marginTop:"0.75rem"}}>
              <div style={{fontSize:"0.78rem",fontWeight:800,color:C.text,marginBottom:"0.3rem"}}>📜 売買履歴</div>
              {paper.trades.map((t,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",gap:"0.5rem",fontSize:"0.73rem",padding:"0.3rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                  <span style={{color:C.textMuted,flexShrink:0}}>{t.date}</span>
                  <span style={{...S.chip(t.side==="buy"?C.blueBg:C.orangeBg,t.side==="buy"?C.blue:C.orange),flexShrink:0}}>{t.side==="buy"?"買":"売"}</span>
                  <span style={{flex:1,minWidth:0,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name} {t.qty}株 @{Number(t.price).toLocaleString()}</span>
                  {t.pnl!=null&&<b style={{color:t.pnl>=0?C.green:C.red,flexShrink:0}}>{t.pnl>=0?"+":""}{Number(t.pnl).toLocaleString()}円</b>}
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
      </>)}

      {view==="portfolio"&&(<>

      {/* 💼 ポートフォリオ全体ビュー(保有がある時のみ) */}
      {(()=>{
        const holds = watchlist.filter(w=>w.holding&&w.holding.price).map(w=>({...w, a:results[w.ticker]}));
        if(!holds.length) return (
          <div style={{...card,marginBottom:"0.85rem",padding:"1.5rem",textAlign:"center",color:C.textMuted,fontSize:"0.85rem"}}>
            保有銘柄がまだありません。分析タブで銘柄を開き「💼 保有を登録」すると、損益追跡・ポートフォリオ診断・AI売り時判断が使えます
          </div>
        );
        const withQty = holds.filter(h=>h.holding.qty&&h.a);
        const totalCost = withQty.reduce((s,h)=>s+h.holding.price*h.holding.qty,0);
        const totalVal  = withQty.reduce((s,h)=>s+h.a.price*h.holding.qty,0);
        const bySector = {};
        withQty.forEach(h=>{ const k=(h.a&&h.a.sector)||"その他"; bySector[k]=(bySector[k]||0)+h.a.price*h.holding.qty; });
        const warns = [];
        Object.entries(bySector).forEach(([k,v])=>{ if(totalVal>0&&v/totalVal>0.5) warns.push(`セクター集中: ${k}が${Math.round(v/totalVal*100)}%`); });
        withQty.forEach(h=>{ if(totalVal>0&&h.a.price*h.holding.qty/totalVal>0.4) warns.push(`1銘柄集中: ${h.a.name}が${Math.round(h.a.price*h.holding.qty/totalVal*100)}%`); });
        for(let i=0;i<holds.length;i++) for(let j=i+1;j<holds.length;j++){
          if(holds[i].a&&holds[j].a&&holds[i].a.spark&&holds[j].a.spark){
            const c = corrOf(holds[i].a.spark, holds[j].a.spark);
            if(c>0.85) warns.push(`高相関: ${holds[i].a.name}×${holds[j].a.name}(${c.toFixed(2)}) 分散効果なし`);
          }
        }
        return (
          <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.5rem"}}>
              <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>💼 ポートフォリオ <span style={{fontSize:"0.68rem",fontWeight:600,color:C.textMuted}}>{holds.length}銘柄保有</span></div>
              <button onClick={runPfBrain} disabled={busy.pf}
                style={{padding:"0.45rem 0.85rem",borderRadius:8,border:"none",background:"linear-gradient(135deg,#7A5AD9,#0070D4)",color:"white",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.pf?0.6:1}}>
                {busy.pf?"診断中(〜1分)...":"🧠 ポートフォリオAI診断"}
              </button>
            </div>
            {withQty.length>0&&(
              <div style={{display:"flex",gap:"1.25rem",flexWrap:"wrap",fontSize:"0.78rem",marginBottom:warns.length?"0.5rem":0}}>
                <span style={{color:C.textSub}}>評価額 <b style={{color:C.text}}>{Math.round(totalVal).toLocaleString()}</b></span>
                <span style={{color:C.textSub}}>評価損益 <b style={{color:totalVal>=totalCost?C.green:C.red}}>{totalVal>=totalCost?"+":""}{Math.round(totalVal-totalCost).toLocaleString()} ({((totalVal/totalCost-1)*100).toFixed(1)}%)</b></span>
                {Object.entries(bySector).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>(
                  <span key={k} style={{color:C.textMuted}}>{k} {Math.round(v/totalVal*100)}%</span>
                ))}
              </div>
            )}
            {warns.length>0&&(
              <div style={{padding:"0.45rem 0.7rem",background:C.orangeBg,borderRadius:8,marginBottom:pfBrain?"0.5rem":0}}>
                {warns.map((w,i)=><div key={i} style={{fontSize:"0.73rem",fontWeight:700,color:C.orange,lineHeight:1.6}}>⚠️ {w}</div>)}
              </div>
            )}
            {pfBrain&&pfBrain.brain&&(()=>{
              const b = pfBrain.brain;
              return (
                <div style={{marginTop:"0.5rem",padding:"0.7rem 0.85rem",background:C.bg,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                  {b.health_score!=null&&(
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.4rem"}}>
                      <span style={{fontWeight:800,fontSize:"0.8rem",color:C.text}}>健全度</span>
                      <div style={{flex:1,maxWidth:200,height:8,borderRadius:4,background:C.borderLight,overflow:"hidden"}}>
                        <div style={{width:`${Math.min(100,b.health_score)}%`,height:"100%",background:b.health_score>=70?C.green:(b.health_score>=45?C.yellow:C.red)}}/>
                      </div>
                      <span style={{fontWeight:800,fontSize:"0.85rem",color:b.health_score>=70?C.green:(b.health_score>=45?C.yellow:C.red)}}>{b.health_score}点</span>
                    </div>
                  )}
                  <div style={{fontSize:"0.78rem",color:C.text,lineHeight:1.65,marginBottom:"0.4rem",whiteSpace:"pre-wrap"}}>{b.summary}</div>
                  {b.biggest_risk&&<div style={{fontSize:"0.74rem",color:C.red,fontWeight:700,marginBottom:"0.35rem"}}>⚠️ 最大リスク: {b.biggest_risk}</div>}
                  {(b.actions||[]).map((a,i)=>(
                    <div key={i} style={{fontSize:"0.73rem",color:C.text,lineHeight:1.6}}>・<b>{a.ticker}</b>: {a.advice}</div>
                  ))}
                  {b.habit_feedback&&b.habit_feedback!=="null"&&(
                    <div style={{marginTop:"0.4rem",padding:"0.45rem 0.65rem",background:C.purpleBg,borderRadius:8,fontSize:"0.73rem",color:C.text,lineHeight:1.6}}>
                      <b style={{color:C.purple}}>📒 売買のクセ: </b>{b.habit_feedback}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* 📒 トレード日誌 */}
      <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
        <div onClick={()=>{const n=!showJournal; setShowJournal(n); if(n&&!journal&&!busy.journal) loadJournal();}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>📒 トレード日誌 <span style={{fontSize:"0.68rem",fontWeight:600,color:C.textMuted}}>決済のたびに実現損益を自動記録・勝率とクセを可視化</span></div>
          <span style={{fontSize:"0.8rem",color:C.textMuted}}>{showJournal?"▲":"▼"}</span>
        </div>
        {showJournal&&(
          <div style={{marginTop:"0.75rem"}}>
            {busy.journal&&<div style={{fontSize:"0.75rem",color:C.textMuted}}>取得中...</div>}
            {journal&&!journal.stats&&<div style={{fontSize:"0.75rem",color:C.textMuted,lineHeight:1.6}}>
              まだ決済記録がありません。保有銘柄を「解除」する際に決済価格を入力すると自動で記録されます。
            </div>}
            {journal&&journal.stats&&(()=>{
              const s = journal.stats;
              return (
                <div>
                  <div style={{display:"flex",gap:"0.4rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    <span style={S.chip(C.borderLight,C.textSub)}>{s.n}トレード</span>
                    <span style={S.chip(s.winRate>=50?C.greenBg:C.redBg, s.winRate>=50?C.green:C.red)}>勝率{s.winRate}%</span>
                    <span style={S.chip(C.greenBg,C.green)}>平均利益+{s.avgWin}%</span>
                    <span style={S.chip(C.redBg,C.red)}>平均損失{s.avgLoss}%</span>
                    {s.profitFactor!=null&&<span style={S.chip(s.profitFactor>=1.5?C.greenBg:(s.profitFactor>=1?C.yellowBg:C.redBg), s.profitFactor>=1.5?C.green:(s.profitFactor>=1?C.yellow:C.red))}>PF {s.profitFactor}</span>}
                    {s.totalAmount!==0&&<span style={S.chip(s.totalAmount>0?C.greenBg:C.redBg, s.totalAmount>0?C.green:C.red)}>累計 {s.totalAmount>0?"+":""}{Number(s.totalAmount).toLocaleString()}</span>}
                  </div>
                  {(journal.trades||[]).map((t,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",gap:"0.5rem",fontSize:"0.74rem",padding:"0.35rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                      <span style={{color:C.text,fontWeight:700}}>{t.name} <span style={{color:C.textMuted,fontWeight:500}}>{t.entryDate||"?"}→{t.exitDate}</span></span>
                      <span style={{color:C.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textAlign:"right"}}>{t.reason||""}</span>
                      <b style={{color:t.pnlPct>=0?C.green:C.red,flexShrink:0}}>{t.pnlPct>=0?"+":""}{t.pnlPct}%</b>
                    </div>
                  ))}
                  <div style={{fontSize:"0.66rem",color:C.textMuted,marginTop:"0.4rem"}}>※PF(プロフィットファクター)=総利益÷総損失。1.5以上で優秀。この成績はAIの教訓生成・ポートフォリオ診断にも使われます</div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      </>)}

      {view==="learn"&&(<>

      {/* 🎓 AI学習・成績パネル */}
      <div style={{...card,marginBottom:"0.85rem",padding:"0.85rem 1rem"}}>
        <div onClick={()=>{const next=!showLearn; setShowLearn(next); if(next&&!perf&&!busy.perf) loadPerf();}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div style={{fontWeight:800,fontSize:"0.85rem",color:C.text}}>🎓 AI学習・成績 <span style={{fontSize:"0.68rem",fontWeight:600,color:C.textMuted}}>過去の判定実績とバックテストで精度を自動改善</span></div>
          <span style={{fontSize:"0.8rem",color:C.textMuted}}>{showLearn?"▲":"▼"}</span>
        </div>
        {showLearn&&(
          <div style={{marginTop:"0.75rem"}}>
            {/* 📊 運用成績(デイリー/累積/リアルタイム) */}
            {dash&&(()=>{
              const d=dash.demo, ac=dash.accuracy||{}, au=dash.auto||{};
              const live=(ac.live&&ac.live.bySignal5d&&ac.live.bySignal5d.buy)||null;
              const bt=ac.backtest;
              return (
                <div style={{marginBottom:"0.85rem"}}>
                  <div style={{fontSize:"0.85rem",fontWeight:800,color:C.text,marginBottom:"0.4rem"}}>
                    📊 運用成績 <span style={{fontSize:"0.66rem",fontWeight:600,color:C.textMuted}}>
                    デモ口座{d.days>0?`(${d.days}日間)`:"(開始前)"} / 現在値で常時更新</span>
                  </div>
                  <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    <div style={{flex:"1 1 150px",padding:"0.6rem 0.75rem",background:d.totalPnl>=0?C.greenBg:C.redBg,borderRadius:10}}>
                      <div style={{fontSize:"0.66rem",fontWeight:700,color:d.totalPnl>=0?C.green:C.red}}>累計損益</div>
                      <div style={{fontSize:"1.1rem",fontWeight:800,color:d.totalPnl>=0?C.green:C.red}}>
                        {d.totalPnl>=0?"+":""}{Number(d.totalPnl).toLocaleString()}<span style={{fontSize:"0.7rem"}}>円</span>
                        <span style={{fontSize:"0.78rem",marginLeft:"0.3rem"}}>({d.totalPnlPct>=0?"+":""}{d.totalPnlPct}%)</span>
                      </div>
                    </div>
                    {[["総資産",Number(d.equity).toLocaleString()+"円"],
                      ["勝率",d.stats.winRate!=null?d.stats.winRate+"%":"—"],
                      ["PF",d.stats.profitFactor!=null?d.stats.profitFactor:"—"],
                      ["最大下落",d.maxDrawdownPct+"%"],
                      ["決済回数",d.stats.closed+"回"]].map(([l,v],i)=>(
                      <div key={i} style={{flex:"1 1 92px",padding:"0.6rem 0.7rem",background:C.bg,borderRadius:10,border:`1px solid ${C.borderLight}`}}>
                        <div style={{fontSize:"0.64rem",fontWeight:700,color:C.textMuted}}>{l}</div>
                        <div style={{fontSize:"0.92rem",fontWeight:800,color:C.text}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* 精度: 実運用 vs 検証値 */}
                  <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    <div style={{flex:"1 1 240px",padding:"0.6rem 0.75rem",background:"white",borderRadius:10,border:`1.5px solid ${live?C.green:C.border}`}}>
                      <div style={{fontSize:"0.7rem",fontWeight:800,color:live?C.green:C.textMuted,marginBottom:"0.15rem"}}>🔴 実運用の精度(本番の成績)</div>
                      {live
                        ? <div style={{fontSize:"0.8rem",color:C.text}}>買いシグナル {live.n}件 / <b>勝率{live.winRate}%</b> / 平均{live.avgRet>=0?"+":""}{live.avgRet}%</div>
                        : <div style={{fontSize:"0.72rem",color:C.textMuted}}>まだ0件。予測を記録してから5営業日後に自動で集計されます(現在{(ac.live&&ac.live.total)||0}件を記録中)</div>}
                    </div>
                    <div style={{flex:"1 1 240px",padding:"0.6rem 0.75rem",background:"white",borderRadius:10,border:`1px solid ${C.border}`}}>
                      <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,marginBottom:"0.15rem"}}>📘 検証値(過去データでの成績)</div>
                      {bt
                        ? <div style={{fontSize:"0.8rem",color:C.text}}>{bt.years||25}年検証 {bt.n}件 / <b>勝率{bt.winRate}%</b> / 平均{bt.avgRet>=0?"+":""}{bt.avgRet}%{bt.avgExcess!=null?` (対指数${bt.avgExcess>=0?"+":""}${bt.avgExcess}%)`:""}</div>
                        : <div style={{fontSize:"0.72rem",color:C.textMuted}}>毎月1日に自動で25年検証が走ります(次回まで未生成)</div>}
                    </div>
                  </div>
                  {/* 日次成績 */}
                  {(d.daily||[]).length>0&&(
                    <div style={{padding:"0.6rem 0.75rem",background:C.bg,borderRadius:10,marginBottom:"0.6rem"}}>
                      <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,marginBottom:"0.25rem"}}>📅 日次の成績</div>
                      {d.daily.slice(0,10).map((x,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:"0.73rem",padding:"0.2rem 0",borderBottom:`1px solid ${C.borderLight}`}}>
                          <span style={{color:C.textSub}}>{x.date}</span>
                          <span style={{color:C.text}}>{Number(x.equity).toLocaleString()}円</span>
                          <b style={{color:x.change>=0?C.green:C.red,minWidth:110,textAlign:"right"}}>
                            {x.change>=0?"+":""}{Number(x.change).toLocaleString()}円 ({x.changePct>=0?"+":""}{x.changePct}%)
                          </b>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 自動売買の記録 */}
                  <div style={{padding:"0.6rem 0.75rem",background:au.enabled?C.greenBg:C.bg,borderRadius:10}}>
                    <div style={{fontSize:"0.72rem",fontWeight:800,color:au.enabled?C.green:C.textMuted,marginBottom:"0.2rem"}}>
                      🤖 AI自動売買 {au.enabled?`稼働中(1回の損失上限${au.riskPct}% / 最大${au.maxPositions}銘柄)`:"停止中 — デモ売買タブで開始できます"}
                    </div>
                    {(au.log||[]).length===0
                      ? <div style={{fontSize:"0.71rem",color:C.textMuted}}>売買記録はまだありません</div>
                      : (au.log||[]).slice(0,5).map((l,i)=>(
                        <div key={i} style={{fontSize:"0.71rem",color:C.textSub,lineHeight:1.6}}>
                          <b style={{color:C.text}}>{l.date}</b> 資産{Number(l.equity).toLocaleString()}円
                          {(l.actions||[]).length===0?" / 売買なし":(l.actions||[]).map((a,j)=>
                            <span key={j} style={{marginLeft:"0.3rem",color:a.type==="buy"?C.blue:C.orange}}>{a.type==="buy"?"買":a.type==="sell"?"売":"—"}{a.name||a.ticker}</span>)}
                        </div>
                      ))}
                  </div>
                </div>
              );
            })()}

            {/* 🧪 戦略シミュレーション(この戦略を25年運用していたら) */}
            <div style={{marginBottom:"0.85rem",padding:"0.8rem 0.95rem",background:"white",borderRadius:10,border:`2px solid ${C.purple}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem",marginBottom:"0.4rem"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:"0.88rem",color:C.purple}}>🧪 この戦略を過去25年運用していたら</div>
                  <div style={{fontSize:"0.68rem",color:C.textMuted}}>損切り・利確・2%ルール・最大5銘柄まで含めた「戦略まるごと」の検証</div>
                </div>
                <button onClick={()=>loadSim(true)} disabled={busy.sim}
                  style={{padding:"0.45rem 0.9rem",borderRadius:8,border:"none",background:"linear-gradient(135deg,#7A5AD9,#0070D4)",color:"white",fontWeight:700,fontSize:"0.75rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.sim?0.6:1}}>
                  {busy.sim?"計算中(5〜10分)...":sim&&sim.result?"🔄 再計算":"▶ 25年で試算する"}
                </button>
              </div>
              {(!sim||sim.empty)&&!busy.sim&&(
                <div style={{fontSize:"0.75rem",color:C.textSub,lineHeight:1.7}}>
                  「勝率60%」だけでは、実際にお金が増えるかは分かりません。<br/>
                  <b>100万円が25年でいくらになったか / 途中で最大どれだけ減ったか / 何連敗まで耐える必要があったか</b>を計算します。<br/>
                  <span style={{color:C.textMuted}}>実弾を入れる前に、必ず一度実行してください(5〜10分かかります)</span>
                </div>
              )}
              {sim&&sim.result&&(()=>{
                const r=sim.result, p=sim.period;
                const good = r.cagrPct>=5 && r.profitFactor>=1.3;
                return (
                  <div>
                    <div style={{fontSize:"0.68rem",color:C.textMuted,marginBottom:"0.5rem"}}>
                      {p.from}〜{p.to}({p.years}年) / {sim.settings.tickers}銘柄 / 1回の損失上限{sim.settings.riskPct}% / 最大{sim.settings.maxPositions}銘柄同時保有
                    </div>
                    <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                      <div style={{flex:"1 1 180px",padding:"0.7rem 0.85rem",background:r.totalReturnPct>=0?C.greenBg:C.redBg,borderRadius:10}}>
                        <div style={{fontSize:"0.66rem",fontWeight:700,color:r.totalReturnPct>=0?C.green:C.red}}>100万円が…</div>
                        <div style={{fontSize:"1.35rem",fontWeight:800,color:r.totalReturnPct>=0?C.green:C.red}}>
                          {Number(r.finalEquity).toLocaleString()}<span style={{fontSize:"0.75rem"}}>円</span>
                        </div>
                        <div style={{fontSize:"0.72rem",fontWeight:700,color:r.totalReturnPct>=0?C.green:C.red}}>({r.totalReturnPct>=0?"+":""}{r.totalReturnPct}%)</div>
                      </div>
                      {[["年利(CAGR)",`${r.cagrPct>=0?"+":""}${r.cagrPct}%`,"1年あたり平均何%増えたか"],
                        ["最大下落",`${r.maxDrawdownPct}%`,"途中で最大どれだけ減ったか"],
                        ["勝率",r.winRate!=null?`${r.winRate}%`:"—","勝ったトレードの割合"],
                        ["PF",r.profitFactor!=null?r.profitFactor:"—","総利益÷総損失。1.5以上で優秀"],
                        ["最大連敗",`${r.maxLossStreak}回`,"何連敗まで耐える必要があったか"],
                        ["取引回数",`${r.trades}回`,""]].map(([l,v,note],i)=>(
                        <div key={i} style={{flex:"1 1 105px",padding:"0.6rem 0.7rem",background:C.bg,borderRadius:10,border:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:"0.63rem",fontWeight:700,color:C.textMuted}}>{l}</div>
                          <div style={{fontSize:"0.98rem",fontWeight:800,color:C.text}}>{v}</div>
                          {note&&<div style={{fontSize:"0.58rem",color:C.textMuted,lineHeight:1.35,marginTop:"0.1rem"}}>{note}</div>}
                        </div>
                      ))}
                    </div>
                    {/* 資産曲線 */}
                    {(sim.curve||[]).length>2&&(()=>{
                      const cv=sim.curve, vals=cv.map(x=>x.equity);
                      const mn=Math.min(...vals,sim.settings.initial), mx=Math.max(...vals), rg=(mx-mn)||1;
                      const W=560,H=110;
                      const pts=cv.map((x,i)=>`${(i/(cv.length-1)*W).toFixed(1)},${(H-6-((x.equity-mn)/rg)*(H-12)).toFixed(1)}`).join(" ");
                      const baseY=H-6-((sim.settings.initial-mn)/rg)*(H-12);
                      return (
                        <div style={{padding:"0.5rem",background:C.bg,borderRadius:8,marginBottom:"0.5rem"}}>
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
                            <line x1="0" x2={W} y1={baseY} y2={baseY} stroke={C.textMuted} strokeWidth="1" strokeDasharray="4 3"/>
                            <polyline points={pts} fill="none" stroke={C.purple} strokeWidth="1.8"/>
                          </svg>
                          <div style={{fontSize:"0.62rem",color:C.textMuted,textAlign:"right"}}>資産の推移(点線=初期100万円)</div>
                        </div>
                      );
                    })()}
                    {/* 年別 */}
                    {(sim.yearly||[]).length>0&&(
                      <div style={{marginBottom:"0.5rem"}}>
                        <div style={{fontSize:"0.7rem",fontWeight:800,color:C.textSub,marginBottom:"0.2rem"}}>📅 年別リターン</div>
                        <div style={{display:"flex",gap:"0.25rem",flexWrap:"wrap"}}>
                          {sim.yearly.map((y,i)=>(
                            <span key={i} style={S.chip(y.returnPct>=0?C.greenBg:C.redBg, y.returnPct>=0?C.green:C.red)}>
                              {y.year} {y.returnPct>=0?"+":""}{y.returnPct}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{padding:"0.55rem 0.7rem",background:good?C.greenBg:C.yellowBg,borderRadius:8,fontSize:"0.74rem",lineHeight:1.7,color:C.text}}>
                      <b style={{color:good?C.green:C.yellow}}>{good?"✅ この戦略は過去データ上は機能しています":"⚠️ 慎重に判断してください"}</b><br/>
                      勝率{r.winRate}%でも{r.profitFactor>=1?"利益が出ている":"利益が出ていない"}のは、平均利益{r.avgWinPct>=0?"+":""}{r.avgWinPct}%に対して平均損失{r.avgLossPct}%と<b>損小利大</b>{r.profitFactor>=1?"になっている":"になっていない"}ためです。<br/>
                      実際に運用するなら<b>最大{Math.abs(r.maxDrawdownPct)}%の含み損と{r.maxLossStreak}連敗に耐える</b>覚悟が必要です。<br/>
                      <span style={{color:C.textMuted}}>※過去の成績が将来を保証するものではありません。上場廃止銘柄を含まないため実際より良く出ます</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 📖 点数の見方 */}
            <details style={{marginBottom:"0.85rem",background:"white",borderRadius:10,border:`1px solid ${C.border}`,padding:"0.7rem 0.85rem"}}>
              <summary style={{fontSize:"0.85rem",fontWeight:800,color:C.accentDark,cursor:"pointer"}}>📖 点数の見方(はじめての方はこちら)</summary>
              <div style={{fontSize:"0.75rem",color:C.text,lineHeight:1.85,marginTop:"0.5rem"}}>
                <b style={{color:C.orange}}>⚡ 短期(0〜100点)= 「今が買うタイミングか」</b><br/>
                値動きの勢い・トレンド・出来高から判定。<b>70点以上=買い場</b> / 45〜69=様子見 / 45未満=見送り<br/>
                <span style={{color:C.textMuted}}>内訳: トレンド25点(移動平均の並び) + モメンタム25点(RSI・MACD) + 出来高20点 + 価格位置15点(過熱していないか) + 相対力15点(市場平均に勝っているか)</span><br/><br/>

                <b style={{color:C.green}}>🏛️ 長期(0〜100点)= 「会社として持っていて安心か」</b><br/>
                業績・割安さ・財務から判定。<b>70点以上=質が高い</b> / 50〜69=条件付き / 50未満=おすすめしない<br/>
                <span style={{color:C.textMuted}}>内訳: 割安性25点(PER・PBR) + 収益性25点(ROE・利益率) + 成長性25点(EPSが伸びているか) + 財務健全性15点(借金の少なさ) + 株主還元10点(配当)</span><br/><br/>

                <b style={{color:C.accent}}>📊 総合 = 短期と長期を合わせた点数</b>(設定タブで比率を変えられます)<br/><br/>

                <b>🏷️ 判定の意味</b><br/>
                <span style={{...S.chip(C.greenBg,C.green)}}>本命</span> 会社も良く、今が買い場。<b>一番おいしい状態</b><br/>
                <span style={{...S.chip(C.blueBg,C.blue)}}>押し目待ち</span> 良い会社だが今は高い。<b>下がるのを待つ</b><br/>
                <span style={{...S.chip(C.yellowBg,C.yellow)}}>短期限定</span> 値動きは良いが会社の質は普通。<b>長期保有は避ける</b><br/>
                <span style={{...S.chip(C.borderLight,C.textSub)}}>見送り</span> 今は手を出さない<br/><br/>

                <b>⚖️ 因子重み(×1.03など)</b> = AIが過去25年を学習して決めた「どの要素を重視するか」。<br/>
                1.0より大きい=よく当たる要素なので重視、小さい=当たりにくいので軽視。<b>毎朝自動で更新</b>されます。<br/>
                <span style={{color:C.textMuted}}>ICは予測力の指標。プラスなら「その要素が高い銘柄はよく上がった」という意味です</span><br/><br/>

                <b>🔴実運用 と 📘検証値のちがい</b><br/>
                実運用=このアプリが実際に予測して当たった割合(本番の成績)。<br/>
                検証値=過去25年のデータで同じロジックを試した成績。<b>実運用の数字が出るまでは検証値が目安</b>です。
              </div>
            </details>

            {/* 手動操作(通常は不要) */}
            <div onClick={()=>setShowManual(!showManual)} style={{fontSize:"0.72rem",color:C.textMuted,cursor:"pointer",marginBottom:"0.5rem"}}>
              🔧 手動操作 {showManual?"▲":"▼"} <span style={{fontSize:"0.66rem"}}>(通常は不要です。全自動で回っています)</span>
            </div>
            <div style={{display:showManual?"flex":"none",gap:"0.5rem",flexWrap:"wrap",marginBottom:"0.75rem"}}>
              <button onClick={loadDash} disabled={busy.dash}
                style={{padding:"0.5rem 0.95rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit"}}>
                {busy.dash?"取得中...":"🔄 成績を再取得"}
              </button>
              <button onClick={runLearn} disabled={busy.learn}
                style={{padding:"0.5rem 0.95rem",borderRadius:8,border:"none",background:"linear-gradient(135deg,#7A5AD9,#0070D4)",color:"white",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.learn?0.6:1}}>
                {busy.learn?"学習中(1〜2分)...":"📚 過去実績＋バックテストで学習"}
              </button>
              <div style={{display:"flex",gap:"0.35rem",alignItems:"center"}}>
                <select value={btYears} onChange={e=>setBtYears(e.target.value)}
                  style={{padding:"0.45rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.78rem",fontFamily:"inherit",fontWeight:700}}>
                  {[["10","過去10年"],["15","過去15年"],["20","過去20年"],["25","過去25年"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={runBacktest} disabled={busy.bt}
                  style={{padding:"0.5rem 0.95rem",borderRadius:8,border:"none",background:C.text,color:"white",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit",opacity:busy.bt?0.6:1}}>
                  {busy.bt?"検証中(2〜5分)...":"📊 ウォークフォワード検証"}
                </button>
              </div>
              <button onClick={loadPerf} disabled={busy.perf}
                style={{padding:"0.5rem 0.95rem",borderRadius:8,border:`1px solid ${C.border}`,background:"white",color:C.textSub,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:"inherit"}}>
                {busy.perf?"取得中...":"🔄 成績を更新"}
              </button>
            </div>
            {btRep&&(()=>{
              const fmt = s=>s?`${s.n}件 / 勝率${s.winRate}% / 平均${s.avgRet>=0?"+":""}${s.avgRet}% / 対指数${s.avgExcess>=0?"+":""}${s.avgExcess}%`:"—";
              const rows = [
                ["① 素点のまま", btRep.testRaw&&btRep.testRaw.buy],
                ["② 因子重み学習後", btRep.testWeighted&&btRep.testWeighted.buy],
                ["③ ②＋地合いフィルタ", btRep.testWeightedRegime&&btRep.testWeightedRegime.buy],
              ];
              return (
                <div style={{marginBottom:"0.75rem",padding:"0.7rem 0.85rem",background:C.bg,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                  <div style={{fontSize:"0.75rem",fontWeight:800,color:C.text,marginBottom:"0.3rem"}}>
                    📊 10年ウォークフォワード検証結果
                    <span style={{fontWeight:600,color:C.textMuted,marginLeft:"0.4rem"}}>
                      {btRep.period.from}〜{btRep.period.to} / {btRep.samples}サンプル / {btRep.period.trainTestSplit}以降は学習に使っていない未知データで測定
                    </span>
                  </div>
                  <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textSub,marginBottom:"0.15rem"}}>「買い(70点以上)」シグナルの20営業日後成績(検証期間のみ):</div>
                  {rows.map(([l,s])=>(
                    <div key={l} style={{fontSize:"0.72rem",color:C.text,lineHeight:1.7,display:"flex",gap:"0.5rem"}}>
                      <span style={{minWidth:150,fontWeight:700,color:C.textSub}}>{l}</span><span>{fmt(s)}</span>
                    </div>
                  ))}
                  {btRep.thresholds&&Object.keys(btRep.thresholds).length>0&&(
                    <div style={{marginTop:"0.4rem"}}>
                      <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textSub,marginBottom:"0.15rem"}}>買い閾値別(③条件下):</div>
                      <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap"}}>
                        {Object.entries(btRep.thresholds).map(([th,s])=>(
                          <span key={th} style={S.chip(s.winRate>=55?C.greenBg:C.borderLight, s.winRate>=55?C.green:C.textSub)}>
                            {th}点↑: 勝率{s.winRate}% ({s.n}件)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {btRep.byEra&&Object.keys(btRep.byEra).length>0&&(
                    <div style={{marginTop:"0.4rem"}}>
                      <div style={{fontSize:"0.7rem",fontWeight:700,color:C.textSub,marginBottom:"0.15rem"}}>時代別の買いシグナル成績(どの相場でも通用するか):</div>
                      <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap"}}>
                        {Object.entries(btRep.byEra).map(([era,s])=>(
                          <span key={era} style={S.chip(s.winRate>=55?C.greenBg:(s.winRate>=45?C.yellowBg:C.redBg), s.winRate>=55?C.green:(s.winRate>=45?C.yellow:C.red))}>
                            {era}年: 勝率{s.winRate}% ({s.n}件)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:"0.66rem",color:C.textMuted,marginTop:"0.4rem"}}>
                    ✓ 検証済みの因子重みと地合いフィルタは本番スコアリングに自動適用されました(重み学習は半減期5年の直近重視)<br/>
                    ※長期検証の注意: 対象は現在の主力銘柄のため、生き残った企業だけを見る分だけ成績が実際より良く出ます(サバイバーシップバイアス)
                  </div>
                </div>
              );
            })()}
            <div style={{padding:"0.55rem 0.75rem",background:C.greenBg,borderRadius:8,marginBottom:"0.6rem",fontSize:"0.72rem",color:C.text,lineHeight:1.7}}>
              <b style={{color:C.green}}>🤖 全自動運用中</b>(手動操作は不要です)<br/>
              毎朝7:00 スキャン＋答え合わせ　/　毎朝7:30 過去10年＋実績で再学習　/　毎朝7:45 全435銘柄ランキング　/　毎朝7:50 相場観生成　/　毎月1日 25年で再検証<br/>
              <span style={{color:C.textMuted}}>下のボタンは「今すぐ手動で回したい時」だけ使ってください</span>
            </div>
            {!perf&&!busy.perf&&<div style={{fontSize:"0.75rem",color:C.textMuted,lineHeight:1.6}}>
              分析するたびに予測が自動記録され、5営業日後・20営業日後に答え合わせされます。<br/>
              学習は過去のバックテストで因子の重みを最適化し、外れた判定から教訓を抽出してAI判定に反映します。
            </div>}
            {perf&&(()=>{
              const cfg = perf.config||{};
              const st = perf.stats||cfg.stats||{};
              const SIG_LABEL = {buy:"🟢買い候補",watch:"🟡監視",avoid:"⚪見送り"};
              const VD_LABEL = {strong_buy:"🚀強い買い",buy:"🟢買い",hold:"🟡様子見",avoid:"⚪見送り",sell:"🔴売り"};
              const statTable = (title,obj,labels)=>obj&&Object.keys(obj).length>0&&(
                <div style={{flex:"1 1 220px",minWidth:0}}>
                  <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,marginBottom:"0.3rem"}}>{title}</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.72rem"}}>
                    <tbody>
                      {Object.entries(obj).map(([k,v])=>(
                        <tr key={k} style={{borderBottom:`1px solid ${C.borderLight}`}}>
                          <td style={{padding:"0.3rem 0.2rem",fontWeight:700,color:C.text}}>{labels[k]||k}</td>
                          <td style={{padding:"0.3rem 0.2rem",textAlign:"right",color:C.textMuted}}>{v.n}件</td>
                          <td style={{padding:"0.3rem 0.2rem",textAlign:"right",fontWeight:800,color:v.winRate>=55?C.green:(v.winRate>=45?C.yellow:C.red)}}>勝率{v.winRate}%</td>
                          <td style={{padding:"0.3rem 0.2rem",textAlign:"right",fontWeight:700,color:v.avgRet>=0?C.green:C.red}}>{v.avgRet>=0?"+":""}{v.avgRet}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
              return (
                <div>
                  {cfg.updatedAt&&(
                    <div style={{fontSize:"0.68rem",color:C.textMuted,marginBottom:"0.5rem"}}>
                      最終学習: {new Date(cfg.updatedAt).toLocaleString("ja-JP")} / バックテスト{cfg.backtestSamples||0}サンプル＋実運用{cfg.liveSamples||0}件 / 記録済み予測{st.total||0}件(答え合わせ済{st.evaluated||0}件)
                    </div>
                  )}
                  {cfg.factor_weights&&(
                    <div style={{marginBottom:"0.6rem"}}>
                      <div style={{fontSize:"0.72rem",fontWeight:800,color:C.textSub,marginBottom:"0.3rem"}}>⚖️ 学習済み因子重み(短期スコアに自動適用中)</div>
                      <div style={{display:"flex",gap:"0.35rem",flexWrap:"wrap"}}>
                        {Object.entries(cfg.factor_weights).map(([k,v])=>(
                          <span key={k} style={S.chip(v>1.05?C.greenBg:(v<0.95?C.redBg:C.borderLight), v>1.05?C.green:(v<0.95?C.red:C.textSub))}>
                            {k} ×{v}{cfg.factor_ic&&cfg.factor_ic[k]!=null?` (IC ${cfg.factor_ic[k]>=0?"+":""}${cfg.factor_ic[k]})`:""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"0.6rem"}}>
                    {statTable("短期シグナル別成績(5日後)", st.bySignal5d, SIG_LABEL)}
                    {statTable("AI判定別成績(5日後)", st.byVerdict5d, VD_LABEL)}
                    {statTable("短期シグナル別成績(20日後)", st.bySignal20d, SIG_LABEL)}
                    {statTable("AI判定別成績(20日後)", st.byVerdict20d, VD_LABEL)}
                  </div>
                  {(!st.evaluated||st.evaluated===0)&&(
                    <div style={{fontSize:"0.72rem",color:C.textMuted,marginBottom:"0.5rem"}}>
                      ※実運用の答え合わせはまだありません(予測記録から5営業日後に自動確定)。それまでは過去2年のバックテストが学習を担います。
                    </div>
                  )}
                  {cfg.lessons&&cfg.lessons.length>0&&(
                    <div style={{padding:"0.6rem 0.8rem",background:C.purpleBg,borderRadius:8}}>
                      <div style={{fontSize:"0.72rem",fontWeight:800,color:C.purple,marginBottom:"0.25rem"}}>📖 AIが実績から学んだ教訓(次回の判定に自動反映)</div>
                      {cfg.lessons.map((l,i)=><div key={i} style={{fontSize:"0.73rem",color:C.text,lineHeight:1.6}}>・{l}</div>)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      </>)}

      {view==="settings"&&(<>

      {/* ⚙️ 設定 */}
      <div style={{maxWidth:560}}>
        <div style={{background:"white",borderRadius:"1rem",padding:"1.1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,marginBottom:"0.85rem"}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"0.6rem"}}>🔌 API接続</div>
          <div style={{fontSize:"0.72rem",color:C.textMuted,marginBottom:"0.35rem"}}>分析Lambda(mydesk-stock-analysis)のFunction URL</div>
          <input type="text" defaultValue={apiUrl} onBlur={e=>{const u=e.target.value.trim(); if(u&&u.startsWith("https://")){localStorage.setItem("md_stock_api_url",u);setApiUrl(u);}}}
            style={{width:"100%",padding:"0.6rem 0.75rem",borderRadius:"0.625rem",border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          <div style={{fontSize:"0.66rem",color:C.textMuted,marginTop:"0.3rem"}}>変更するとフォーカスを外した時に保存されます</div>
        </div>
        <div style={{background:"white",borderRadius:"1rem",padding:"1.1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,marginBottom:"0.85rem"}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"0.6rem"}}>⚖️ 総合スコアの加重</div>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",fontSize:"0.78rem",fontWeight:700,color:C.textSub}}>
            長期重視
            <input type="range" min="0" max="100" step="10" value={weight}
              onChange={e=>{const v=parseInt(e.target.value,10);setWeight(v);localStorage.setItem("md_stock_weight",String(v));}}
              style={{flex:1,accentColor:C.accent}}/>
            短期重視
          </div>
          <div style={{textAlign:"center",fontSize:"0.75rem",color:C.accent,fontWeight:800,marginTop:"0.3rem"}}>短期 {weight}% : 長期 {100-weight}%</div>
        </div>
        <div style={{background:"white",borderRadius:"1rem",padding:"1.1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow,marginBottom:"0.85rem"}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"0.6rem"}}>💰 資金管理(推奨ロット計算)</div>
          <div style={{display:"flex",gap:"0.6rem",alignItems:"center",fontSize:"0.78rem",color:C.textSub,flexWrap:"wrap"}}>
            投資資金
            <input type="number" value={capital} onChange={e=>{setCapital(e.target.value);localStorage.setItem("md_stock_capital",e.target.value);}} placeholder="300"
              style={{width:90,padding:"0.45rem 0.6rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit",outline:"none"}}/>万
            / 1トレード許容リスク
            <select value={riskPct} onChange={e=>{setRiskPct(e.target.value);localStorage.setItem("md_stock_risk",e.target.value);}}
              style={{padding:"0.45rem",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:"0.8rem",fontFamily:"inherit"}}>
              {["1","2","3"].map(v=><option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
          <div style={{fontSize:"0.68rem",color:C.textMuted,marginTop:"0.4rem"}}>銘柄詳細の推奨ロット(2%ルール: 資金×リスク%÷損切り幅2ATR)に使われます</div>
        </div>
        <div style={{background:"white",borderRadius:"1rem",padding:"1.1rem",border:`1px solid ${C.border}`,boxShadow:C.shadow}}>
          <div style={{fontWeight:800,fontSize:"0.9rem",color:C.text,marginBottom:"0.5rem"}}>ℹ️ MyTradeについて</div>
          <div style={{fontSize:"0.74rem",color:C.textSub,lineHeight:1.8}}>
            ビルド: {MYTRADE_BUILD}<br/>
            データ: Yahoo Finance(日本株は約20分遅延) / Google News<br/>
            AI: AWS Bedrock Claude(売買判定・学習・診断)<br/>
            <span style={{color:C.textMuted}}>本アプリの情報は参考情報であり、投資勧誘・投資助言ではありません。投資判断はご自身の責任で行ってください。</span>
          </div>
        </div>
      </div>

      </>)}

      {/* 免責 */}
      <div style={{marginTop:"1rem",fontSize:"0.65rem",color:C.textMuted,textAlign:"center",lineHeight:1.6}}>
        本画面の情報は参考情報であり、投資勧誘・投資助言ではありません。投資判断はご自身の責任で行ってください。<br/>
        株価データはYahoo Finance（日本株は約20分遅延）、ニュースはYahoo Finance/Google Newsより取得。
      </div>
    </div>
  );
}

// ─── アプリ本体 ───────────────────────────────────────────────
export default function App() {
  return (
    <div style={{minHeight:"100vh",background:C.bg}}>
      <div style={{background:"white",borderBottom:`1px solid ${C.border}`,padding:"0.7rem 1.25rem",display:"flex",alignItems:"center",gap:"0.6rem",position:"sticky",top:0,zIndex:50}}>
        <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#0070D4,#7A5AD9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem"}}>📈</div>
        <span style={{fontWeight:800,fontSize:"1.05rem",color:C.text,letterSpacing:"-0.02em"}}>MyTrade</span>
        <span style={{fontSize:"0.65rem",color:C.textMuted,fontWeight:600}}>プロトレーダーダッシュボード</span>
      </div>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"1.25rem 1rem 2rem"}}>
        <ErrorBoundary>
          <StockView/>
        </ErrorBoundary>
      </div>
    </div>
  );
}
