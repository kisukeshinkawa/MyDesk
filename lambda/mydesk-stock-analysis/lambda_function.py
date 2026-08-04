# ─────────────────────────────────────────────────────────────
# mydesk-stock-analysis
# 国内株・米国株のプロトレーダー分析エンジン
#   - yfinance: 株価・財務・Yahooニュース
#   - Google News RSS: 銘柄関連ニュース(日本語/英語)
#   - Bedrock Claude: テクニカル×ファンダ×ニュース×地合いを統合した
#     「プロトレーダー脳」判定(エントリー/損切り/利確プラン付き)
#   - S3キャッシュ: 株価15分・財務/ニュース60分
#
# actions:
#   {action:"market"}                          … 地合い(指数・為替・VIX)
#   {action:"analyze", ticker:"7203.T"}        … 単一銘柄スコアリング
#   {action:"analyze-batch", tickers:[...]}    … 一括(最大30)
#   {action:"news", ticker, name}              … ニュース一覧
#   {action:"brain", ticker:"7203.T"}          … AI総合判定(プロトレーダー脳)
#   {action:"search", query:"トヨタ"}           … 銘柄検索(Yahoo autocomplete)
# 認証: ヘッダー x-mydesk-secret
# ─────────────────────────────────────────────────────────────
import json, os, re, time, math, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import boto3

SECRET        = os.environ.get("MYDESK_SECRET", "mydesk2026secret")
S3_BUCKET     = os.environ.get("S3_BUCKET", "mydesk-files-dustalk-1777302196")
CACHE_PREFIX  = "stock-cache/"
BEDROCK_MODEL = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
BEDROCK_REGION= os.environ.get("BEDROCK_REGION", "ap-northeast-1")

PRICE_TTL = 15 * 60      # 株価キャッシュ 15分
SLOW_TTL  = 60 * 60      # 財務・ニュースキャッシュ 60分

s3 = boto3.client("s3")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,x-mydesk-secret",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}

# ── 地合い判定に使う指数 ────────────────────────────────
MARKET_TICKERS = [
    ("^N225",   "日経平均",   "jp"),
    ("1306.T",  "TOPIX連動",  "jp"),
    ("^GSPC",   "S&P500",     "us"),
    ("^IXIC",   "NASDAQ",     "us"),
    ("JPY=X",   "ドル円",     "fx"),
    ("^VIX",    "VIX恐怖指数", "risk"),
]


def lambda_handler(event, context):
    # EventBridge定期実行(毎朝スキャン→朝レポート生成→メール)
    if event.get("source") == "aws.events":
        return _res(200, run_daily_report())
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "POST")
    if method == "OPTIONS":
        return _res(200, {})
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("x-mydesk-secret") != SECRET:
        return _res(403, {"error": "forbidden"})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _res(400, {"error": "invalid json"})

    action = body.get("action", "analyze")
    try:
        if action == "market":
            return _res(200, get_market_overview())
        if action == "analyze":
            return _res(200, analyze_ticker(body["ticker"]))
        if action == "analyze-batch":
            tickers = (body.get("tickers") or [])[:30]
            out, errors = [], []
            for t in tickers:
                try:
                    out.append(analyze_ticker(t))
                except Exception as e:
                    errors.append({"ticker": t, "error": str(e)})
            return _res(200, {"results": out, "errors": errors})
        if action == "news":
            return _res(200, {"news": get_news(body["ticker"], body.get("name", ""))})
        if action == "brain":
            return _res(200, brain_analysis(body["ticker"], body.get("name", ""),
                                            body.get("holding")))
        if action == "search":
            return _res(200, {"candidates": search_symbol(body.get("query", ""))})
        if action == "performance":
            return _res(200, get_performance())
        if action == "learn":
            return _res(200, run_learn(body.get("tickers")))
        if action == "backtest":
            return _res(200, run_backtest(body.get("tickers"),
                                          int(body.get("years", 10)),
                                          bool(body.get("apply", False))))
        if action == "watchlist-get":
            return _res(200, {"items": _load_json_s3(WATCHLIST_KEY, [])})
        if action == "watchlist-set":
            items = (body.get("items") or [])[:50]
            _save_json_s3(WATCHLIST_KEY, items)
            return _res(200, {"ok": True, "count": len(items)})
        if action == "screen":
            return _res(200, run_screen(body.get("exclude") or [], body.get("market", "all")))
        if action == "daily-report":
            return _res(200, run_daily_report(send_mail=bool(body.get("sendMail", False))))
        if action == "report-latest":
            return _res(200, _load_json_s3(REPORT_KEY, {"body": "", "date": None}))
        if action == "trade-log":
            return _res(200, {"logged": log_trade(body)})
        if action == "trade-stats":
            return _res(200, trade_stats())
        if action == "portfolio-brain":
            return _res(200, portfolio_brain())
        return _res(400, {"error": f"unknown action: {action}"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return _res(500, {"error": str(e)})


def _res(code, obj):
    return {"statusCode": code, "headers": CORS, "body": json.dumps(obj, ensure_ascii=False, default=str)}


# ═══════════════════════ S3 キャッシュ ═══════════════════════
def cache_get(key, ttl):
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=CACHE_PREFIX + key)
        data = json.loads(obj["Body"].read())
        if time.time() - data.get("_ts", 0) < ttl:
            return data.get("payload")
    except Exception:
        pass
    return None


def cache_put(key, payload):
    try:
        s3.put_object(Bucket=S3_BUCKET, Key=CACHE_PREFIX + key,
                      Body=json.dumps({"_ts": time.time(), "payload": payload}, ensure_ascii=False, default=str).encode(),
                      ContentType="application/json")
    except Exception as e:
        print("cache_put failed:", e)


# ═══════════════════════ 学習ストア(予測履歴・重み・教訓) ═══════════════════════
PRED_KEY      = "stock-learn/predictions.json"   # 予測の記録(あとで答え合わせ)
CONFIG_KEY    = "stock-learn/config.json"        # 因子重み・教訓・成績
WATCHLIST_KEY = "stock-learn/watchlist.json"     # ウォッチリスト(サーバー共有・保有情報含む)
SIGNALS_KEY   = "stock-learn/last_signals.json"  # 前回シグナル(変化検知用)
REPORT_KEY    = "stock-learn/daily_report.json"  # 最新の朝レポート
TRADES_KEY    = "stock-learn/trades.json"        # トレード日誌(実現損益)


def _load_json_s3(key, default):
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(obj["Body"].read())
    except Exception:
        return default


def _save_json_s3(key, data):
    try:
        s3.put_object(Bucket=S3_BUCKET, Key=key,
                      Body=json.dumps(data, ensure_ascii=False, default=str).encode(),
                      ContentType="application/json")
    except Exception as e:
        print("save_json failed:", key, e)


def load_predictions():
    return _load_json_s3(PRED_KEY, [])


def save_predictions(preds):
    _save_json_s3(PRED_KEY, preds[-2000:])  # 直近2000件のみ保持


def load_learn_config():
    return _load_json_s3(CONFIG_KEY, {})


def record_prediction(rec):
    """同一銘柄・同一日・同一種別は1回だけ記録"""
    try:
        preds = load_predictions()
        if any(p.get("ticker") == rec["ticker"] and p.get("date") == rec["date"]
               and p.get("type") == rec["type"] for p in preds):
            return
        preds.append(rec)
        save_predictions(preds)
    except Exception as e:
        print("record_prediction failed:", e)


def _pearson(xs, ys):
    n = len(xs)
    if n < 2:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    return cov / math.sqrt(vx * vy) if vx > 0 and vy > 0 else 0.0


# ═══════════════════════ データ取得 ═══════════════════════
def fetch_history(ticker, period="400d"):
    """日足OHLCV。yfinance。"""
    import yfinance as yf
    df = yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=True)
    if df is None or len(df) < 30:
        raise Exception(f"{ticker}: 価格データが取得できません")
    return df


def fetch_info(ticker):
    import yfinance as yf
    try:
        return yf.Ticker(ticker).info or {}
    except Exception:
        return {}


# ═══════════════════════ 地合い(market) ═══════════════════════
def get_market_overview():
    cached = cache_get("market.json", PRICE_TTL)
    if cached:
        return cached
    rows = []
    for sym, label, kind in MARKET_TICKERS:
        try:
            df = fetch_history(sym, "90d")
            close = df["Close"]
            price = float(close.iloc[-1])
            chg1d = (price / float(close.iloc[-2]) - 1) * 100 if len(close) >= 2 else 0
            chg5d = (price / float(close.iloc[-6]) - 1) * 100 if len(close) >= 6 else 0
            ma25 = float(close.rolling(25).mean().iloc[-1]) if len(close) >= 25 else price
            rows.append({"symbol": sym, "label": label, "kind": kind,
                         "price": round(price, 2), "chg1d": round(chg1d, 2),
                         "chg5d": round(chg5d, 2), "aboveMA25": price > ma25})
        except Exception as e:
            rows.append({"symbol": sym, "label": label, "kind": kind, "error": str(e)})

    # 地合いスコア: 指数がMA25の上にいる数 + VIX水準で risk-on/off を単純判定
    idx = [r for r in rows if r.get("kind") in ("jp", "us") and "error" not in r]
    above = sum(1 for r in idx if r["aboveMA25"])
    vix = next((r["price"] for r in rows if r["symbol"] == "^VIX" and "error" not in r), None)
    if vix is not None and vix >= 30:
        mood, moodLabel = "risk-off", "⚠️ リスクオフ(VIX30超) 新規は慎重に"
    elif above >= 3:
        mood, moodLabel = "risk-on", "🟢 リスクオン(主要指数が25日線上)"
    elif above <= 1:
        mood, moodLabel = "risk-off", "🔴 弱い地合い(指数が25日線割れ)"
    else:
        mood, moodLabel = "neutral", "🟡 中立(指数まちまち)"
    out = {"indices": rows, "mood": mood, "moodLabel": moodLabel,
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put("market.json", out)
    return out


# ═══════════════════════ テクニカル指標 ═══════════════════════
def compute_technical(df):
    close, high, low, vol = df["Close"], df["High"], df["Low"], df["Volume"]
    price = float(close.iloc[-1])
    ma5  = close.rolling(5).mean()
    ma25 = close.rolling(25).mean()
    ma75 = close.rolling(75).mean()

    # RSI(14)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, float("nan"))
    rsi = float((100 - 100 / (1 + rs)).iloc[-1])

    # MACD(12,26,9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist = macd - signal

    # ボリンジャー(20, 2σ)
    mid = close.rolling(20).mean()
    sd = close.rolling(20).std()
    bb_pos = float((close.iloc[-1] - mid.iloc[-1]) / (2 * sd.iloc[-1])) if sd.iloc[-1] else 0  # +1=+2σ, -1=-2σ

    # ATR(14) → 損切り幅の目安
    tr = (high - low).combine((high - close.shift()).abs(), max).combine((low - close.shift()).abs(), max)
    atr = float(tr.rolling(14).mean().iloc[-1])

    # 出来高比率
    vol5 = float(vol.rolling(5).mean().iloc[-1]) if len(vol) >= 5 else 0
    vol20 = float(vol.rolling(20).mean().iloc[-1]) if len(vol) >= 20 else 0
    vol_ratio = vol5 / vol20 if vol20 else 1.0

    # ゴールデンクロス/デッドクロス from MA5xMA25 (直近5営業日以内)
    cross = 0
    for i in range(1, 6):
        if len(ma5) > i and not (math.isnan(ma5.iloc[-i-1]) or math.isnan(ma25.iloc[-i-1])):
            if ma5.iloc[-i-1] <= ma25.iloc[-i-1] and ma5.iloc[-i] > ma25.iloc[-i]:
                cross = 1; break
            if ma5.iloc[-i-1] >= ma25.iloc[-i-1] and ma5.iloc[-i] < ma25.iloc[-i]:
                cross = -1; break

    # 直近1ヶ月リターン
    ret1m = (price / float(close.iloc[-21]) - 1) * 100 if len(close) >= 21 else 0
    # 52週高値/安値からの位置
    win = close.iloc[-250:] if len(close) >= 250 else close
    hi52, lo52 = float(win.max()), float(win.min())

    return {
        "price": price, "atr": atr, "rsi": rsi, "ret1m": ret1m,
        "ma5": float(ma5.iloc[-1]), "ma25": float(ma25.iloc[-1]),
        "ma75": float(ma75.iloc[-1]) if len(close) >= 75 else None,
        "macd_hist": float(hist.iloc[-1]), "macd_hist_prev3": float(hist.iloc[-4]) if len(hist) >= 4 else 0,
        "bb_pos": bb_pos, "vol_ratio": vol_ratio, "cross": cross,
        "hi52": hi52, "lo52": lo52,
        "chg1d": (price / float(close.iloc[-2]) - 1) * 100 if len(close) >= 2 else 0,
        "spark": [round(float(v), 2) for v in close.iloc[-60:].tolist()],
        "spark_ma25": [round(float(v), 2) if not math.isnan(v) else None for v in ma25.iloc[-60:].tolist()],
    }


def score_short(t, index_ret1m, weights=None):
    """短期テクニカル 100点。breakdown付き。
    weights: 学習で得た因子重み {カテゴリ名: 0.5〜1.5}。指定時は加重後100点換算。"""
    br = []
    # ① トレンド 25
    pts = 0
    if t["ma75"] is not None and t["ma5"] > t["ma25"] > t["ma75"]:
        pts, why = 25, "パーフェクトオーダー(MA5>MA25>MA75)の上昇配列"
    elif t["ma5"] > t["ma25"]:
        pts, why = 15, "MA5がMA25の上(短期上昇トレンド)"
    elif t["ma75"] is not None and t["ma5"] < t["ma25"] < t["ma75"]:
        pts, why = 0, "下降配列(MA5<MA25<MA75)"
    else:
        pts, why = 7, "トレンドレス(移動平均が交錯)"
    if t["cross"] == 1:
        pts = min(25, pts + 5); why += "。直近5日以内にゴールデンクロス発生"
    elif t["cross"] == -1:
        pts = max(0, pts - 5); why += "。直近5日以内にデッドクロス発生"
    br.append({"category": "トレンド", "points": pts, "max": 25, "reason": why})

    # ② モメンタム 25
    rsi = t["rsi"]
    if 50 <= rsi <= 65: pts, why = 15, f"RSI{rsi:.0f}: 上昇中かつ過熱前の好位置"
    elif 40 <= rsi < 50: pts, why = 10, f"RSI{rsi:.0f}: 中立"
    elif rsi < 30: pts, why = 10, f"RSI{rsi:.0f}: 売られすぎ(反発候補)"
    elif rsi > 70: pts, why = 5, f"RSI{rsi:.0f}: 過熱圏"
    else: pts, why = 8, f"RSI{rsi:.0f}"
    if t["macd_hist"] > 0 and t["macd_hist_prev3"] <= 0:
        pts += 10; why += "。MACDヒストグラムが直近でプラス転換"
    elif t["macd_hist"] > 0:
        pts += 5; why += "。MACD陽転継続中"
    br.append({"category": "モメンタム", "points": min(25, pts), "max": 25, "reason": why})

    # ③ 出来高 20
    vr = t["vol_ratio"]
    if vr >= 1.5 and t["chg1d"] > 0: pts, why = 20, f"出来高{vr:.1f}倍+株価上昇(資金流入)"
    elif vr >= 1.2: pts, why = 12, f"出来高{vr:.1f}倍に増加"
    elif vr < 0.7: pts, why = 0, f"出来高{vr:.1f}倍と閑散"
    else: pts, why = 6, f"出来高{vr:.1f}倍(通常)"
    br.append({"category": "出来高", "points": pts, "max": 20, "reason": why})

    # ④ 価格位置 15
    bb = t["bb_pos"]
    if 0 <= bb <= 0.5: pts, why = 15, "ボリンジャー中央〜+1σ(順行・過熱なし)"
    elif bb <= -0.9: pts, why = 10, "-2σ接触(逆張り反発候補)"
    elif bb > 1.0: pts, why = 3, "+2σ超え(短期過熱)"
    elif bb < 0: pts, why = 7, "ミッドバンド下(戻り待ち)"
    else: pts, why = 10, "+1σ〜+2σ(強いが引きつけたい)"
    br.append({"category": "価格位置", "points": pts, "max": 15, "reason": why})

    # ⑤ 相対力 15
    rel = t["ret1m"] - index_ret1m
    if rel >= 5: pts, why = 15, f"1ヶ月で指数を{rel:.1f}%アウトパフォーム"
    elif rel >= 0: pts, why = 10, f"指数並み〜やや強い(+{rel:.1f}%)"
    elif rel >= -5: pts, why = 5, f"指数にやや劣後({rel:.1f}%)"
    else: pts, why = 0, f"指数に大きく劣後({rel:.1f}%)"
    br.append({"category": "相対力", "points": pts, "max": 15, "reason": why})

    w = weights or {}
    if w:
        num = sum(b["points"] * w.get(b["category"], 1.0) for b in br)
        den = sum(b["max"] * w.get(b["category"], 1.0) for b in br)
        total = round(num / den * 100) if den else 0
    else:
        total = sum(b["points"] for b in br)
    signal = "buy" if total >= 70 else ("watch" if total >= 45 else "avoid")
    return {"score": total, "signal": signal, "breakdown": br, "weighted": bool(w)}


# ═══════════════════════ ファンダメンタルズ ═══════════════════════
def _g(info, *keys):
    for k in keys:
        v = info.get(k)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return v
    return None


def score_long(info):
    br, missing = [], []

    per  = _g(info, "trailingPE", "forwardPE")
    pbr  = _g(info, "priceToBook")
    peg  = _g(info, "trailingPegRatio", "pegRatio")
    roe  = _g(info, "returnOnEquity")
    opm  = _g(info, "operatingMargins")
    roa  = _g(info, "returnOnAssets")
    revg = _g(info, "revenueGrowth")
    epsg = _g(info, "earningsGrowth", "earningsQuarterlyGrowth")
    d2e  = _g(info, "debtToEquity")
    fcf  = _g(info, "freeCashflow")
    ocf  = _g(info, "operatingCashflow")
    dy   = _g(info, "dividendYield")
    payout = _g(info, "payoutRatio")

    # ① 割安性 25
    pts, whys = 0, []
    if per is not None:
        if per <= 0: whys.append(f"PER算出不可(赤字)")
        elif per <= 15: pts += 10; whys.append(f"PER{per:.1f}倍と割安")
        elif per <= 25: pts += 6; whys.append(f"PER{per:.1f}倍と標準")
        else: pts += 2; whys.append(f"PER{per:.1f}倍と割高")
    else: missing.append("PER")
    if pbr is not None:
        if pbr <= 1: pts += 8; whys.append(f"PBR{pbr:.2f}倍(解散価値割れ)")
        elif pbr <= 2: pts += 5; whys.append(f"PBR{pbr:.2f}倍")
        else: whys.append(f"PBR{pbr:.2f}倍")
    else: missing.append("PBR")
    if peg is not None and 0 < peg <= 1:
        pts += 7; whys.append(f"PEG{peg:.2f}(成長対比で割安)")
    br.append({"category": "割安性", "points": min(25, pts), "max": 25, "reason": "。".join(whys) or "データ不足"})

    # ② 収益性 25
    pts, whys = 0, []
    if roe is not None:
        r = roe * 100
        if r >= 15: pts += 12; whys.append(f"ROE{r:.1f}%と優秀")
        elif r >= 10: pts += 8; whys.append(f"ROE{r:.1f}%と良好")
        elif r >= 8: pts += 4; whys.append(f"ROE{r:.1f}%")
        else: whys.append(f"ROE{r:.1f}%と低い")
    else: missing.append("ROE")
    if opm is not None:
        m = opm * 100
        if m >= 15: pts += 8; whys.append(f"営業利益率{m:.1f}%")
        elif m >= 10: pts += 5; whys.append(f"営業利益率{m:.1f}%")
        else: whys.append(f"営業利益率{m:.1f}%")
    if roa is not None and roa * 100 >= 5:
        pts += 5; whys.append(f"ROA{roa*100:.1f}%")
    br.append({"category": "収益性", "points": min(25, pts), "max": 25, "reason": "。".join(whys) or "データ不足"})

    # ③ 成長性 25
    pts, whys = 0, []
    if revg is not None:
        g = revg * 100
        if g >= 10: pts += 12; whys.append(f"売上成長率{g:.1f}%")
        elif g >= 5: pts += 8; whys.append(f"売上成長率{g:.1f}%")
        elif g >= 0: pts += 4; whys.append(f"売上成長率{g:.1f}%と低成長")
        else: whys.append(f"売上{g:.1f}%と減収")
    else: missing.append("売上成長率")
    if epsg is not None:
        g = epsg * 100
        if g >= 10: pts += 13; whys.append(f"利益成長率{g:.1f}%")
        elif g >= 5: pts += 8; whys.append(f"利益成長率{g:.1f}%")
        elif g >= 0: pts += 4; whys.append(f"利益成長率{g:.1f}%")
        else: whys.append(f"利益{g:.1f}%と減益")
    else: missing.append("利益成長率")
    br.append({"category": "成長性", "points": min(25, pts), "max": 25, "reason": "。".join(whys) or "データ不足"})

    # ④ 財務健全性 15
    pts, whys = 0, []
    if d2e is not None:
        if d2e <= 50: pts += 8; whys.append(f"負債資本倍率{d2e:.0f}%と健全")
        elif d2e <= 120: pts += 5; whys.append(f"負債資本倍率{d2e:.0f}%")
        else: pts += 1; whys.append(f"負債資本倍率{d2e:.0f}%と高め")
    else: missing.append("負債比率")
    if ocf is not None and ocf > 0: pts += 4; whys.append("営業CFプラス")
    if fcf is not None and fcf > 0: pts += 3; whys.append("フリーCFプラス")
    br.append({"category": "財務健全性", "points": min(15, pts), "max": 15, "reason": "。".join(whys) or "データ不足"})

    # ⑤ 株主還元 10
    pts, whys = 0, []
    if dy is not None:
        y = dy * 100 if dy < 1 else dy  # yfinanceのdividendYieldは版により%表記が揺れる
        if y >= 3: pts += 5; whys.append(f"配当利回り{y:.2f}%")
        elif y >= 1.5: pts += 3; whys.append(f"配当利回り{y:.2f}%")
        else: whys.append(f"配当利回り{y:.2f}%")
    else: missing.append("配当")
    if payout is not None and 0.3 <= payout <= 0.6:
        pts += 3; whys.append(f"配当性向{payout*100:.0f}%と健全レンジ")
    br.append({"category": "株主還元", "points": min(10, pts), "max": 10, "reason": "。".join(whys) or "データ不足"})

    total = sum(b["points"] for b in br)
    signal = "buy" if total >= 70 else ("watch" if total >= 50 else "avoid")
    return {"score": total, "signal": signal, "breakdown": br, "missing": missing}


# ═══════════════════════ 銘柄分析(analyze) ═══════════════════════
def analyze_ticker(ticker):
    key = f"analyze/{ticker}.json"
    cached = cache_get(key, PRICE_TTL)
    if cached:
        return cached

    is_jp = ticker.endswith(".T")
    df = fetch_history(ticker)
    tech = compute_technical(df)

    # 指数との相対力 + 地合いレジーム(指数200日線)
    idx_sym = "^N225" if is_jp else "^GSPC"
    index_ret1m, regime_on = 0, True
    try:
        idx_df = fetch_history(idx_sym, "400d")
        idx_close = idx_df["Close"]
        if len(idx_close) >= 21:
            index_ret1m = (float(idx_close.iloc[-1]) / float(idx_close.iloc[-21]) - 1) * 100
        if len(idx_close) >= 200:
            regime_on = float(idx_close.iloc[-1]) > float(idx_close.rolling(200).mean().iloc[-1])
    except Exception:
        pass

    learn_cfg = load_learn_config()
    short = score_short(tech, index_ret1m, learn_cfg.get("factor_weights"))

    # 地合いフィルタ: 指数が200日線割れの局面は買いシグナルのダマシが増える
    # (10年バックテストの検証項目)ため、買いを保留に格下げして明示する
    if not regime_on and short["signal"] == "buy":
        short["signal"] = "watch"
        short["breakdown"].append({
            "category": "地合いフィルタ", "points": 0, "max": 0,
            "reason": f"{'日経平均' if is_jp else 'S&P500'}が200日線割れのため買いシグナルを保留(弱地合いでは買いのダマシが増えるため)"})

    info = cache_get(f"info/{ticker}.json", SLOW_TTL)
    if info is None:
        info = fetch_info(ticker)
        cache_put(f"info/{ticker}.json", info)
    long_ = score_long(info)

    # 4象限
    if short["score"] >= 70 and long_["score"] >= 70: quadrant = "本命"
    elif long_["score"] >= 70: quadrant = "押し目待ち"
    elif short["score"] >= 70: quadrant = "短期限定"
    else: quadrant = "見送り"

    out = {
        "ticker": ticker,
        "name": _g(info, "longName", "shortName") or ticker,
        "market": "JP" if is_jp else "US",
        "currency": _g(info, "currency") or ("JPY" if is_jp else "USD"),
        "sector": _g(info, "sector"),
        "price": round(tech["price"], 2),
        "chg1d": round(tech["chg1d"], 2),
        "hi52": round(tech["hi52"], 2), "lo52": round(tech["lo52"], 2),
        "atr": round(tech["atr"], 2),
        "rsi": round(tech["rsi"], 1),
        "short": short, "long": long_, "quadrant": quadrant,
        "earningsDate": (datetime.fromtimestamp(_g(info, "earningsTimestamp", "earningsTimestampStart"),
                                                tz=timezone.utc).strftime("%Y-%m-%d")
                         if isinstance(_g(info, "earningsTimestamp", "earningsTimestampStart"), (int, float)) else None),
        "exDividendDate": (datetime.fromtimestamp(_g(info, "exDividendDate"), tz=timezone.utc).strftime("%Y-%m-%d")
                           if isinstance(_g(info, "exDividendDate"), (int, float)) else None),
        "targetPrice": _g(info, "targetMeanPrice"),          # アナリスト平均目標株価
        "analystRating": _g(info, "recommendationKey"),      # strong_buy/buy/hold/underperform/sell
        "analystCount": _g(info, "numberOfAnalystOpinions"),
        "regime": {"benchAboveMa200": regime_on,
                   "bench": "日経平均" if is_jp else "S&P500"},
        "spark": tech["spark"], "sparkMa25": tech["spark_ma25"],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    # 予測を記録(後日答え合わせして学習に使う)
    record_prediction({
        "type": "score", "ticker": ticker,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "price": out["price"], "signal": short["signal"], "quadrant": quadrant,
        "short_score": short["score"], "long_score": long_["score"],
        "factors": {b["category"]: round(b["points"] / b["max"], 3) for b in short["breakdown"]},
    })
    cache_put(key, out)
    return out


# ═══════════════════════ ニュース収集 ═══════════════════════
def get_news(ticker, name=""):
    key = f"news/{ticker}.json"
    cached = cache_get(key, SLOW_TTL)
    if cached:
        return cached

    items = []
    # 1) Yahoo Finance ニュース (yfinance)
    try:
        import yfinance as yf
        for n in (yf.Ticker(ticker).news or [])[:8]:
            c = n.get("content", n)  # yfinance新旧フォーマット両対応
            title = c.get("title")
            if not title:
                continue
            link = (c.get("clickThroughUrl") or {}).get("url") or (c.get("canonicalUrl") or {}).get("url") or n.get("link", "")
            pub = c.get("pubDate") or c.get("displayTime") or ""
            items.append({"title": title, "link": link, "source": "Yahoo Finance",
                          "published": str(pub)})
    except Exception as e:
        print("yf news failed:", e)

    # 2) Google News RSS (日本株→日本語 / 米株→英語)
    is_jp = ticker.endswith(".T")
    query = name or ticker.replace(".T", "")
    try:
        if is_jp:
            url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{query} 株")
                   + "&hl=ja&gl=JP&ceid=JP:ja")
        else:
            url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(f"{query} stock")
                   + "&hl=en-US&gl=US&ceid=US:en")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            root = ET.fromstring(r.read())
        for item in root.iter("item"):
            title = item.findtext("title") or ""
            link = item.findtext("link") or ""
            pub = item.findtext("pubDate") or ""
            src = item.findtext("source") or "Google News"
            items.append({"title": title, "link": link, "source": src, "published": pub})
            if len(items) >= 20:
                break
    except Exception as e:
        print("google news failed:", e)

    # 重複タイトル除去
    seen, out = set(), []
    for it in items:
        k = re.sub(r"\s+", "", it["title"])[:40]
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    out = out[:15]
    cache_put(key, out)
    return out


# ═══════════════════════ 学習エンジン(答え合わせ・バックテスト・重み最適化) ═══════════════════════
def evaluate_predictions():
    """過去の予測に実際のリターンを書き込む(答え合わせ)。
    5営業日後リターン(ret5)は7日経過後、20営業日後(ret20)は30日経過後に確定。"""
    preds = load_predictions()
    now = datetime.now(timezone.utc)
    need = {}
    for p in preds:
        try:
            age = (now - datetime.strptime(p["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)).days
        except Exception:
            continue
        if (age >= 7 and p.get("ret5") is None) or (age >= 30 and p.get("ret20") is None):
            need.setdefault(p["ticker"], []).append(p)

    changed = False
    for ticker, plist in list(need.items())[:20]:
        try:
            df = fetch_history(ticker, "400d")
        except Exception as e:
            print("evaluate fetch failed:", ticker, e)
            continue
        dates = [d.strftime("%Y-%m-%d") for d in df.index]
        closes = [float(v) for v in df["Close"].tolist()]
        for p in plist:
            base = next((i for i, d in enumerate(dates) if d >= p["date"]), None)
            if base is None or not p.get("price"):
                continue
            if p.get("ret5") is None and base + 5 < len(closes):
                p["ret5"] = round((closes[base + 5] / p["price"] - 1) * 100, 2)
                changed = True
            if p.get("ret20") is None and base + 20 < len(closes):
                p["ret20"] = round((closes[base + 20] / p["price"] - 1) * 100, 2)
                changed = True
    if changed:
        save_predictions(preds)
    return preds


def compute_stats(preds):
    """シグナル別・AI判定別の勝率と平均リターン。sell/avoidは下落が「勝ち」。"""
    def bucket(items, key_fn, ret_key, invert_keys=()):
        out = {}
        for p in items:
            r, k = p.get(ret_key), key_fn(p)
            if r is None or not k:
                continue
            b = out.setdefault(k, {"n": 0, "win": 0, "sum": 0.0})
            b["n"] += 1
            b["win"] += 1 if ((r < 0) if k in invert_keys else (r > 0)) else 0
            b["sum"] += r
        return {k: {"n": v["n"], "winRate": round(v["win"] / v["n"] * 100),
                    "avgRet": round(v["sum"] / v["n"], 2)} for k, v in out.items()}
    scores = [p for p in preds if p.get("type") == "score"]
    brains = [p for p in preds if p.get("type") == "brain"]
    return {
        "bySignal5d":   bucket(scores, lambda p: p.get("signal"), "ret5"),
        "bySignal20d":  bucket(scores, lambda p: p.get("signal"), "ret20"),
        "byVerdict5d":  bucket(brains, lambda p: p.get("verdict"), "ret5",  ("sell", "avoid")),
        "byVerdict20d": bucket(brains, lambda p: p.get("verdict"), "ret20", ("sell", "avoid")),
        "evaluated": sum(1 for p in preds if p.get("ret5") is not None),
        "total": len(preds),
    }


# 銘柄未指定時のバックテスト対象(日米の主力・流動性上位)
DEFAULT_UNIVERSE = ["7203.T", "6758.T", "8306.T", "9984.T", "6501.T", "8058.T", "6981.T",
                    "9433.T", "4063.T", "7974.T",
                    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "JPM", "JNJ", "XOM", "PG", "KO"]


def build_indicator_frame(df):
    """全営業日分のテクニカル指標を一括計算(ベクトル化)。
    rolling/ewm/shiftは各行とも当日以前のデータのみ参照するため先読みバイアスなし。
    これにより10年×20銘柄のバックテストがLambdaタイムアウト内で完走する。"""
    import pandas as pd
    close, vol = df["Close"], df["Volume"]
    f = pd.DataFrame(index=df.index)
    f["close"] = close
    f["ma5"] = close.rolling(5).mean()
    f["ma25"] = close.rolling(25).mean()
    f["ma75"] = close.rolling(75).mean()
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    f["rsi"] = 100 - 100 / (1 + gain / loss.replace(0, float("nan")))
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    f["hist"] = macd - macd.ewm(span=9, adjust=False).mean()
    mid = close.rolling(20).mean()
    sd = close.rolling(20).std()
    f["bb"] = (close - mid) / (2 * sd)
    f["vr"] = vol.rolling(5).mean() / vol.rolling(20).mean()
    f["chg1d"] = close.pct_change() * 100
    f["ret1m"] = close.pct_change(20) * 100  # compute_technicalのiloc[-21]比と同一(20営業日前比)
    gc = (f["ma5"] > f["ma25"]) & (f["ma5"].shift(1) <= f["ma25"].shift(1))
    dc = (f["ma5"] < f["ma25"]) & (f["ma5"].shift(1) >= f["ma25"].shift(1))
    f["gc5"] = gc.rolling(5).max()
    f["dc5"] = dc.rolling(5).max()
    return f


def _row_to_tech(f, i):
    """指標フレームのi行目をscore_short互換のdictへ変換"""
    def v(col, default=None):
        x = f[col].iloc[i]
        return default if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)
    return {
        "price": v("close"), "rsi": v("rsi", 50), "ret1m": v("ret1m", 0),
        "ma5": v("ma5", 0), "ma25": v("ma25", 0), "ma75": v("ma75"),
        "macd_hist": v("hist", 0),
        "macd_hist_prev3": float(f["hist"].iloc[i - 3]) if i >= 3 and not math.isnan(f["hist"].iloc[i - 3]) else 0,
        "bb_pos": v("bb", 0), "vol_ratio": v("vr", 1.0),
        "cross": 1 if v("gc5", 0) else (-1 if v("dc5", 0) else 0),
        "chg1d": v("chg1d", 0),
    }


def backtest_universe(tickers, years=10, step=5):
    """週次サンプリングのバックテスト。各サンプルに
    因子スコア・5/20日後リターン・対指数超過リターン・地合い(指数200日線)を記録。"""
    samples = []
    bench_cache = {}

    def get_bench(sym):
        if sym not in bench_cache:
            bdf = fetch_history(sym, f"{years}y")
            bf = {"close": bdf["Close"],
                  "ma200": bdf["Close"].rolling(200).mean(),
                  "ret1m": bdf["Close"].pct_change(20) * 100,
                  "dates": [d.strftime("%Y-%m-%d") for d in bdf.index]}
            bf["pos"] = {d: i for i, d in enumerate(bf["dates"])}
            bench_cache[sym] = bf
        return bench_cache[sym]

    for t in tickers[:20]:
        try:
            df = fetch_history(t, f"{years}y")
            bench = get_bench("^N225" if t.endswith(".T") else "^GSPC")
            f = build_indicator_frame(df)
        except Exception as e:
            print("backtest fetch failed:", t, e)
            continue
        closes = [float(x) for x in df["Close"].tolist()]
        dates = [d.strftime("%Y-%m-%d") for d in df.index]
        for i in range(80, len(df) - 21, step):
            try:
                d = dates[i]
                bi = bench["pos"].get(d)
                if bi is None:  # 休日ズレは直前の指数営業日を使う
                    bi = max([j for j, bd in enumerate(bench["dates"]) if bd <= d] or [None])
                if bi is None or bi + 20 >= len(bench["close"]):
                    continue
                b_ret1m = float(bench["ret1m"].iloc[bi]) if not math.isnan(bench["ret1m"].iloc[bi]) else 0
                tech = _row_to_tech(f, i)
                sc = score_short(tech, b_ret1m)  # 素点(重みなし)
                fwd5 = (closes[i + 5] / closes[i] - 1) * 100
                fwd20 = (closes[i + 20] / closes[i] - 1) * 100
                b_fwd20 = (float(bench["close"].iloc[bi + 20]) / float(bench["close"].iloc[bi]) - 1) * 100
                ma200 = bench["ma200"].iloc[bi]
                regime_on = (not math.isnan(ma200)) and float(bench["close"].iloc[bi]) > float(ma200)
                samples.append({
                    "date": d, "ticker": t,
                    "factors": {b["category"]: round(b["points"] / b["max"], 3) for b in sc["breakdown"]},
                    "score": sc["score"], "signal": sc["signal"],
                    "fwd5": round(fwd5, 2), "fwd20": round(fwd20, 2),
                    "ex20": round(fwd20 - b_fwd20, 2), "regime": regime_on,
                })
            except Exception:
                continue
    return samples


FACTOR_MAX = {"トレンド": 25, "モメンタム": 25, "出来高": 20, "価格位置": 15, "相対力": 15}


def _weighted_score(factors, weights):
    num = sum(factors.get(c, 0) * m * weights.get(c, 1.0) for c, m in FACTOR_MAX.items())
    den = sum(m * weights.get(c, 1.0) for c, m in FACTOR_MAX.items())
    return round(num / den * 100) if den else 0


def run_backtest(tickers=None, years=10, apply_weights=False):
    """10年ウォークフォワード検証。
    期間の前70%(train)で因子重みを学習→後30%(test)で未知データ精度を測定。
    地合いフィルタ(指数200日線)の有無も比較し、レポートを返す。"""
    tickers = tickers or DEFAULT_UNIVERSE
    samples = backtest_universe(tickers, years)
    if len(samples) < 100:
        raise Exception(f"サンプル不足({len(samples)}件)。銘柄・期間を確認してください")
    samples.sort(key=lambda s: s["date"])
    split = samples[int(len(samples) * 0.7)]["date"]
    train = [s for s in samples if s["date"] < split]
    test = [s for s in samples if s["date"] >= split]

    # trainで重み学習(対指数超過リターンとのICベース=地合いに依存しない銘柄選択力)
    weights, ics = derive_weights([{"factors": s["factors"], "ret": s["ex20"]} for s in train])

    def stats_of(items, ret_key="fwd20"):
        out = {}
        for s in items:
            k = "buy" if s["_score"] >= 70 else ("watch" if s["_score"] >= 45 else "avoid")
            b = out.setdefault(k, {"n": 0, "win": 0, "sum": 0.0, "ex": 0.0})
            b["n"] += 1
            b["win"] += 1 if s[ret_key] > 0 else 0
            b["sum"] += s[ret_key]
            b["ex"] += s["ex20"]
        return {k: {"n": v["n"], "winRate": round(v["win"] / v["n"] * 100, 1),
                    "avgRet": round(v["sum"] / v["n"], 2), "avgExcess": round(v["ex"] / v["n"], 2)}
                for k, v in out.items()}

    for s in test:
        s["_score"] = _weighted_score(s["factors"], weights)

    report = {
        "period": {"from": samples[0]["date"], "to": samples[-1]["date"], "trainTestSplit": split},
        "tickers": tickers, "samples": len(samples), "trainSamples": len(train), "testSamples": len(test),
        "weights": weights, "ics": ics,
        # ① 素点のまま(重み学習なし)のtest成績 → ベースライン
        "testRaw": stats_of([{**s, "_score": s["score"]} for s in test]),
        # ② 学習済み重み適用後のtest成績
        "testWeighted": stats_of(test),
        # ③ さらに地合いフィルタ(指数200日線より上のときだけ買い)を掛けた成績
        "testWeightedRegime": stats_of([s for s in test if s["regime"]]),
        "testWeightedRegimeOff": stats_of([s for s in test if not s["regime"]]),
        # ④ 買い閾値ごとの成績(閾値調整の材料)
        "thresholds": {},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    for th in (60, 65, 70, 75, 80):
        hits = [s for s in test if s["_score"] >= th and s["regime"]]
        if hits:
            report["thresholds"][str(th)] = {
                "n": len(hits),
                "winRate": round(sum(1 for s in hits if s["fwd20"] > 0) / len(hits) * 100, 1),
                "avgRet": round(sum(s["fwd20"] for s in hits) / len(hits), 2),
                "avgExcess": round(sum(s["ex20"] for s in hits) / len(hits), 2)}

    if apply_weights:  # 検証済み重みを本番スコアリングに反映
        cfg = load_learn_config()
        cfg.update({"factor_weights": weights, "factor_ic": ics,
                    "backtestSamples": len(samples), "backtestYears": years,
                    "backtest_report": report,
                    "updatedAt": datetime.now(timezone.utc).isoformat()})
        _save_json_s3(CONFIG_KEY, cfg)
    return report


FACTOR_CATS = ["トレンド", "モメンタム", "出来高", "価格位置", "相対力"]


def derive_weights(samples):
    """因子スコアと将来リターンの相関(IC)から重みを算出。
    IC正=予測に効く因子→重み増、IC負=逆効果→重み減。0.5〜1.5にクリップ。"""
    weights, ics = {}, {}
    for c in FACTOR_CATS:
        pairs = [(s["factors"][c], s["ret"]) for s in samples
                 if c in s.get("factors", {}) and s.get("ret") is not None]
        ic = _pearson([p[0] for p in pairs], [p[1] for p in pairs]) if len(pairs) >= 30 else 0.0
        ics[c] = round(ic, 3)
        weights[c] = round(max(0.5, min(1.5, 1 + 2 * ic)), 2)
    return weights, ics


def generate_lessons(stats, preds):
    """答え合わせ済みのAI判定から「教訓」をBedrockに抽出させる。失敗時は空。"""
    done = [p for p in preds if p.get("type") == "brain" and p.get("ret5") is not None]
    if not done and not stats.get("bySignal5d"):
        return []
    cases = "\n".join(
        f"- {p['date']} {p['ticker']}: 判定{p.get('verdict','?')}(確信{p.get('conviction','?')}) "
        f"→ 5日後{p.get('ret5','?')}% / 20日後{p.get('ret20','未確定')}%"
        for p in done[-30:]) or "(AI判定の確定実績なし)"
    prompt = f"""あなたは株式トレーディングの検証担当です。以下は過去の売買判定と実際の結果です。

【判定別成績(5日後勝率)】{json.dumps(stats.get('byVerdict5d',{}), ensure_ascii=False)}
【シグナル別成績(5日後勝率)】{json.dumps(stats.get('bySignal5d',{}), ensure_ascii=False)}
【個別ケース】
{cases}

{(lambda ts: f"【実際の売買成績】{ts['stats']['n']}回 勝率{ts['stats']['winRate']}% 平均利益{ts['stats']['avgWin']}% 平均損失{ts['stats']['avgLoss']}% PF{ts['stats']['profitFactor']}" if ts.get("stats") else "")(trade_stats())}

この実績から、今後の判定精度を上げるための具体的な教訓を抽出してください。
「どういう状況の判定が当たり/外れやすいか」「確信度の付け方の癖」など実践的に。
出力はJSONのみ: {{"lessons":["教訓1","教訓2",...]}} (最大8個、各60文字以内)"""
    try:
        br = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
        resp = br.invoke_model(modelId=BEDROCK_MODEL, body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31", "max_tokens": 800,
            "messages": [{"role": "user", "content": prompt}]}))
        raw = json.loads(resp["body"].read())["content"][0]["text"]
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        return (json.loads(m.group(0)).get("lessons") or [])[:8] if m else []
    except Exception as e:
        print("generate_lessons failed:", e)
        return []


def run_learn(tickers=None):
    """学習の全工程: 答え合わせ→バックテスト→因子重み最適化→教訓抽出→保存。"""
    preds = evaluate_predictions()
    if not tickers:
        tickers = list(dict.fromkeys(p["ticker"] for p in reversed(preds)))[:8] or DEFAULT_UNIVERSE[:8]
    bt = [{"factors": s["factors"], "ret": s["ex20"]}
          for s in backtest_universe(tickers, years=3)]
    live = [{"factors": p.get("factors", {}), "ret": p.get("ret5")}
            for p in preds if p.get("type") == "score" and p.get("ret5") is not None]
    weights, ics = derive_weights(bt + live)
    stats = compute_stats(preds)
    lessons = generate_lessons(stats, preds)
    cfg = {"factor_weights": weights, "factor_ic": ics, "stats": stats,
           "lessons": lessons, "backtestSamples": len(bt), "liveSamples": len(live),
           "learnedTickers": tickers, "updatedAt": datetime.now(timezone.utc).isoformat()}
    _save_json_s3(CONFIG_KEY, cfg)
    return cfg


def get_performance():
    preds = evaluate_predictions()
    return {"stats": compute_stats(preds), "config": load_learn_config()}


# ═══════════════════════ プロトレーダー脳 (Bedrock) ═══════════════════════
BRAIN_SYSTEM = """あなたは機関投資家出身で20年のキャリアを持つプロトレーダーです。
テクニカル・ファンダメンタルズ・ニュースフロー・市場全体の地合いを統合して銘柄を判断します。
判断の流れ:
1. まず地合い(指数トレンド・VIX)を確認し、リスクを取れる環境か判断
2. ファンダで「持っていい会社か」、テクニカルで「今買っていいタイミングか」を分離して考える
3. ニュースは「株価にまだ織り込まれていない材料か」を最重視。古い既知の材料は無視
4. エントリーには必ず損切りライン(ATRベースで直近ボラの1.5〜2倍下 or 直近安値割れ)と利確目標をセットで示す
5. 確信度が低いときは正直に「見送り」と言う。ポジションを取らないのも戦略
6. 「過去の教訓」「自分の過去判定の実績」が与えられた場合は最優先で参照し、
   当たりやすいパターンでは確信度を上げ、外れやすいパターンの判定は慎重に修正する

出力は必ず次のJSONのみ(コードブロック不要):
{"verdict":"strong_buy|buy|hold|avoid|sell",
 "conviction":1-5,
 "news_sentiment":"positive|neutral|negative",
 "summary":"3〜4行の日本語総評。プロ目線の結論と根拠",
 "entry_plan":"エントリー戦略(指値目安・分割の考え方)",
 "stop_loss":"損切りライン(具体的価格と根拠)",
 "targets":"利確目標(第1・第2目標の価格)",
 "time_horizon":"想定保有期間",
 "risks":["リスク要因を2〜4個"],
 "catalysts":["株価材料・カタリストを1〜3個"],
 "position_advice":"保有中と伝えられた場合のみ: 継続/利確/損切りの具体的助言。未保有ならnull"}"""


def brain_analysis(ticker, name="", holding=None):
    analysis = analyze_ticker(ticker)
    news = get_news(ticker, name or analysis.get("name", ""))
    market = get_market_overview()

    news_text = "\n".join(f"- [{n.get('published','')[:16]}] {n['title']} ({n['source']})" for n in news[:12]) or "(ニュースなし)"
    short_text = "\n".join(f"- {b['category']} {b['points']}/{b['max']}点: {b['reason']}" for b in analysis["short"]["breakdown"])
    long_text = "\n".join(f"- {b['category']} {b['points']}/{b['max']}点: {b['reason']}" for b in analysis["long"]["breakdown"])
    idx_text = "\n".join(f"- {r['label']}: {r.get('price','?')} (前日比{r.get('chg1d','?')}% / 5日{r.get('chg5d','?')}%)"
                         for r in market["indices"] if "error" not in r)

    user_prompt = f"""以下の銘柄を分析してください。

【銘柄】{analysis['name']} ({ticker}) / {analysis.get('sector') or '業種不明'} / {analysis['market']}市場
【現在値】{analysis['price']} {analysis['currency']} (前日比{analysis['chg1d']}%) / 52週レンジ {analysis['lo52']}〜{analysis['hi52']} / ATR(14) {analysis['atr']} / RSI {analysis['rsi']}

【地合い】{market['moodLabel']}
{idx_text}

【短期テクニカルスコア {analysis['short']['score']}/100】
{short_text}

【長期ファンダスコア {analysis['long']['score']}/100】
{long_text}

【直近ニュース】
{news_text}"""

    if holding and holding.get("price"):
        pnl = (analysis["price"] / float(holding["price"]) - 1) * 100
        user_prompt += (f"\n\n【保有状況】取得単価{holding['price']} {analysis['currency']}"
                        f"{'×'+str(holding['qty'])+'株' if holding.get('qty') else ''}"
                        f" / 現在の損益 {pnl:+.1f}%。継続・利確・損切りの判断も必ず示すこと。")
    if analysis.get("earningsDate"):
        user_prompt += f"\n【決算予定日】{analysis['earningsDate']}(持ち越しリスクを考慮すること)"

    # ── 学習成果の注入(教訓・実績・この銘柄への過去判定) ──
    cfg = load_learn_config()
    preds = load_predictions()
    if cfg.get("lessons"):
        user_prompt += "\n\n【過去の失敗・成功から学んだ教訓】\n" + "\n".join(f"- {l}" for l in cfg["lessons"][:8])
    v_stats = (cfg.get("stats") or {}).get("byVerdict5d") or {}
    if v_stats:
        user_prompt += "\n\n【あなたの過去判定の実績(5日後勝率)】\n" + "\n".join(
            f"- {k}: {v['n']}件 勝率{v['winRate']}% 平均{v['avgRet']:+}%" for k, v in v_stats.items())
    past = [p for p in preds if p.get("ticker") == ticker and p.get("type") == "brain"
            and p.get("ret5") is not None][-5:]
    if past:
        user_prompt += "\n\n【この銘柄へのあなたの過去判定と結果】\n" + "\n".join(
            f"- {p['date']} {p.get('verdict','?')}(確信{p.get('conviction','?')}) → 5日後{p['ret5']}% / 20日後{p.get('ret20','未確定')}%"
            for p in past)

    br = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    resp = br.invoke_model(
        modelId=BEDROCK_MODEL,
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1500,
            "system": BRAIN_SYSTEM,
            "messages": [{"role": "user", "content": user_prompt}],
        }),
    )
    raw = json.loads(resp["body"].read())["content"][0]["text"]
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    brain = json.loads(m.group(0)) if m else {"verdict": "hold", "summary": raw}

    # AI判定も記録(後日答え合わせ→教訓生成に使う)
    record_prediction({
        "type": "brain", "ticker": ticker,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "price": analysis["price"], "verdict": brain.get("verdict"),
        "conviction": brain.get("conviction"),
    })

    return {"ticker": ticker, "analysis": analysis, "news": news,
            "market": {"mood": market["mood"], "moodLabel": market["moodLabel"]},
            "brain": brain, "updatedAt": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════ スクリーニング(有望銘柄の発掘) ═══════════════════════
SCREEN_UNIVERSE = [
    # 日本株(主力・流動性上位)
    ("7203.T", "トヨタ自動車"), ("6758.T", "ソニーG"), ("8306.T", "三菱UFJ"), ("9984.T", "ソフトバンクG"),
    ("6501.T", "日立製作所"), ("8058.T", "三菱商事"), ("6981.T", "村田製作所"), ("9433.T", "KDDI"),
    ("4063.T", "信越化学"), ("7974.T", "任天堂"), ("8035.T", "東京エレクトロン"), ("6098.T", "リクルート"),
    ("8766.T", "東京海上"), ("9983.T", "ファーストリテイリング"), ("4519.T", "中外製薬"), ("6902.T", "デンソー"),
    ("8001.T", "伊藤忠商事"), ("8031.T", "三井物産"), ("7741.T", "HOYA"), ("6367.T", "ダイキン工業"),
    ("6594.T", "ニデック"), ("4568.T", "第一三共"), ("9432.T", "NTT"), ("8316.T", "三井住友FG"),
    ("2914.T", "JT"), ("6273.T", "SMC"), ("6857.T", "アドバンテスト"), ("4901.T", "富士フイルム"),
    ("6954.T", "ファナック"), ("7011.T", "三菱重工"), ("9101.T", "日本郵船"), ("5401.T", "日本製鉄"),
    ("4503.T", "アステラス製薬"), ("8591.T", "オリックス"), ("2802.T", "味の素"),
    # 米国株(メガ・大型)
    ("AAPL", "Apple"), ("MSFT", "Microsoft"), ("GOOGL", "Alphabet"), ("AMZN", "Amazon"),
    ("NVDA", "NVIDIA"), ("META", "Meta"), ("TSLA", "Tesla"), ("BRK-B", "Berkshire"),
    ("JPM", "JPMorgan"), ("V", "Visa"), ("JNJ", "J&J"), ("WMT", "Walmart"),
    ("UNH", "UnitedHealth"), ("XOM", "ExxonMobil"), ("PG", "P&G"), ("MA", "Mastercard"),
    ("HD", "HomeDepot"), ("KO", "CocaCola"), ("COST", "Costco"), ("AMD", "AMD"),
    ("CRM", "Salesforce"), ("NFLX", "Netflix"), ("DIS", "Disney"), ("MCD", "McDonald's"),
    ("CAT", "Caterpillar"), ("GE", "GE Aerospace"), ("PFE", "Pfizer"), ("INTC", "Intel"),
    ("BA", "Boeing"), ("GS", "GoldmanSachs"),
]


def run_screen(exclude=None, market="all"):
    """スクリーニング: 日米主力ユニバースを短期スコアで一括採点し上位を返す。
    (長期ファンダはinfo取得が重くタイムアウトするため、追加後の個別分析で確認する設計)"""
    cache_key = f"screen/{market}.json"
    cached = cache_get(cache_key, PRICE_TTL)
    exclude = set(exclude or [])
    if cached:
        return {**cached, "results": [r for r in cached["results"] if r["ticker"] not in exclude]}

    cfg = load_learn_config()
    weights = cfg.get("factor_weights")
    bench_ret = {}
    for sym, key in (("^N225", "JP"), ("^GSPC", "US")):
        try:
            b = fetch_history(sym, "300d")["Close"]
            bench_ret[key] = ((float(b.iloc[-1]) / float(b.iloc[-21]) - 1) * 100 if len(b) >= 21 else 0,
                              float(b.iloc[-1]) > float(b.rolling(200).mean().iloc[-1]) if len(b) >= 200 else True)
        except Exception:
            bench_ret[key] = (0, True)

    results, errors = [], 0
    for ticker, name in SCREEN_UNIVERSE:
        mkt = "JP" if ticker.endswith(".T") else "US"
        if market != "all" and market != mkt:
            continue
        try:
            df = fetch_history(ticker, "300d")
            f = build_indicator_frame(df)
            tech = _row_to_tech(f, len(f) - 1)
            b_ret, b_regime = bench_ret[mkt]
            sc = score_short(tech, b_ret, weights)
            if not b_regime and sc["signal"] == "buy":
                sc["signal"] = "watch"
            results.append({"ticker": ticker, "name": name, "market": mkt,
                            "price": round(tech["price"], 2), "chg1d": round(tech["chg1d"], 2),
                            "score": sc["score"], "signal": sc["signal"],
                            "top": [b["reason"] for b in sorted(sc["breakdown"],
                                    key=lambda x: -(x["points"] / x["max"] if x["max"] else 0))[:2]]})
        except Exception as e:
            errors += 1
            print("screen failed:", ticker, e)
    results.sort(key=lambda r: -r["score"])
    out = {"results": results[:15], "scanned": len(results), "errors": errors,
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put(cache_key, out)
    out = {**out, "results": [r for r in out["results"] if r["ticker"] not in exclude]}
    return out


# ═══════════════════════ 朝レポート(定期スキャン・シグナル変化検知) ═══════════════════════
def run_daily_report(send_mail=True):
    """ウォッチリスト全銘柄をスキャンし、シグナル変化・保有損益・地合いをレポート化。
    EventBridge(毎朝)から自動実行され、S3保存+メール送信(環境変数設定時)。"""
    wl = _load_json_s3(WATCHLIST_KEY, [])
    market = get_market_overview()
    prev = _load_json_s3(SIGNALS_KEY, {})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    SIG_JA = {"buy": "買い候補", "watch": "監視", "avoid": "見送り"}
    alerts, lines, cur = [], [], {}
    for w in wl[:30]:
        try:
            a = analyze_ticker(w["ticker"])
        except Exception as e:
            lines.append(f"・{w.get('name', w['ticker'])}: 取得失敗({e})")
            continue
        sig = a["short"]["signal"]
        cur[w["ticker"]] = sig
        old = prev.get(w["ticker"])
        if old and old != sig:
            arrow = "📈" if sig == "buy" else ("📉" if sig == "avoid" else "🔔")
            alerts.append(f"{arrow} {a['name']}: シグナル変化 {SIG_JA.get(old, old)} → {SIG_JA.get(sig, sig)}")
        pnl_txt = ""
        h = w.get("holding")
        if h and h.get("price"):
            pct = (a["price"] / float(h["price"]) - 1) * 100
            pnl_txt = f" | 保有損益 {pct:+.1f}%"
            if pct <= -8:
                alerts.append(f"🛑 {a['name']}: 損失{pct:+.1f}% 損切り検討ライン")
            elif pct >= 20:
                alerts.append(f"💰 {a['name']}: 利益{pct:+.1f}% 利確検討ライン")
        if a.get("earningsDate"):
            try:
                days = (datetime.strptime(a["earningsDate"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                        - datetime.now(timezone.utc)).days
                if 0 <= days <= 7:
                    alerts.append(f"📅 {a['name']}: 決算発表が近い({a['earningsDate']}) 持ち越し注意")
            except Exception:
                pass
        lines.append(f"・{a['name']}({a['ticker']}) {a['price']:,} {a['chg1d']:+}% "
                     f"短期{a['short']['score']}点/長期{a['long']['score']}点 [{a['quadrant']}]{pnl_txt}")

    _save_json_s3(SIGNALS_KEY, cur)
    body = (f"【MyDesk 株式 朝レポート】{today}\n\n"
            f"■ 地合い: {market['moodLabel']}\n\n"
            f"■ アラート\n" + ("\n".join(alerts) if alerts else "特になし") + "\n\n"
            f"■ ウォッチリスト({len(wl)}銘柄)\n" + ("\n".join(lines) if lines else "登録なし") + "\n\n"
            f"※参考情報であり投資助言ではありません")
    report = {"date": today, "body": body, "alerts": alerts,
              "updatedAt": datetime.now(timezone.utc).isoformat()}
    _save_json_s3(REPORT_KEY, report)

    mail_url = os.environ.get("MAIL_SENDER_URL", "")
    mail_to = os.environ.get("REPORT_EMAIL_TO", "")
    if send_mail and mail_url and mail_to:
        try:  # mydesk-mail-sender経由で本人名義送信(payloadは実装に合わせて調整)
            payload = {"account": os.environ.get("REPORT_EMAIL_ACCOUNT", mail_to),
                       "to": [mail_to], "subject": f"📈 MyDesk株式 朝レポート {today}", "body": body}
            req = urllib.request.Request(mail_url, data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=30)
            report["mailed"] = True
        except Exception as e:
            print("report mail failed:", e)
            report["mailed"] = False
    return report


# ═══════════════════════ トレード日誌(実現損益と売買のクセ分析) ═══════════════════════
def log_trade(t):
    """決済記録: {ticker,name,entryPrice,exitPrice,qty,entryDate,exitDate,reason}"""
    trades = _load_json_s3(TRADES_KEY, [])
    entry, exit_ = float(t["entryPrice"]), float(t["exitPrice"])
    rec = {"ticker": t["ticker"], "name": t.get("name", t["ticker"]),
           "entryPrice": entry, "exitPrice": exit_,
           "qty": float(t.get("qty") or 0),
           "entryDate": t.get("entryDate"), "exitDate": t.get("exitDate") or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
           "reason": (t.get("reason") or "")[:200],
           "pnlPct": round((exit_ / entry - 1) * 100, 2),
           "pnlAmount": round((exit_ - entry) * float(t.get("qty") or 0), 2)}
    trades.append(rec)
    _save_json_s3(TRADES_KEY, trades[-500:])
    return rec


def trade_stats():
    trades = _load_json_s3(TRADES_KEY, [])
    if not trades:
        return {"trades": [], "stats": None}
    wins = [t for t in trades if t["pnlPct"] > 0]
    losses = [t for t in trades if t["pnlPct"] <= 0]
    gross_win = sum(t["pnlPct"] for t in wins)
    gross_loss = abs(sum(t["pnlPct"] for t in losses))
    stats = {
        "n": len(trades), "winRate": round(len(wins) / len(trades) * 100, 1),
        "avgWin": round(gross_win / len(wins), 2) if wins else 0,
        "avgLoss": round(-gross_loss / len(losses), 2) if losses else 0,
        # プロフィットファクター: 総利益÷総損失。1.5超で優秀、1未満はトータル負け
        "profitFactor": round(gross_win / gross_loss, 2) if gross_loss > 0 else None,
        "best": max(trades, key=lambda t: t["pnlPct"])["pnlPct"],
        "worst": min(trades, key=lambda t: t["pnlPct"])["pnlPct"],
        "totalAmount": round(sum(t.get("pnlAmount") or 0 for t in trades), 0),
    }
    return {"trades": trades[-20:][::-1], "stats": stats}


# ═══════════════════════ ポートフォリオAI診断 ═══════════════════════
PORTFOLIO_SYSTEM = """あなたは機関投資家のポートフォリオマネージャーです。
個別銘柄ではなくポートフォリオ全体を診断します。観点:
1. 集中リスク(1銘柄/1セクター/1市場への偏り)と相関(似た値動きの銘柄ばかりでないか)
2. 地合いに対するリスク量が適切か(弱地合いでフルポジションは危険)
3. 含み損の放置・利益の早すぎる確定(損大利小)がないか。トレード日誌のクセも指摘
4. ウォッチリストの高スコア銘柄で入れ替え候補があるか
出力は必ず次のJSONのみ:
{"health_score":0-100,
 "summary":"3〜4行の総評",
 "biggest_risk":"最大のリスク1つ",
 "actions":[{"ticker":"銘柄","advice":"具体的アクション"}],
 "habit_feedback":"トレード日誌から見た売買のクセへの助言(日誌が無ければnull)"}"""


def portfolio_brain():
    wl = _load_json_s3(WATCHLIST_KEY, [])
    market = get_market_overview()
    ts = trade_stats()
    holds, watch = [], []
    for w in wl[:30]:
        try:
            a = analyze_ticker(w["ticker"])
        except Exception:
            continue
        h = w.get("holding")
        if h and h.get("price"):
            pct = (a["price"] / float(h["price"]) - 1) * 100
            holds.append(f"- {a['name']}({a['ticker']}/{a['market']}/{a.get('sector') or '?'}): "
                         f"損益{pct:+.1f}%{'・'+str(h.get('qty'))+'株' if h.get('qty') else ''} "
                         f"短期{a['short']['score']}点/長期{a['long']['score']}点 [{a['quadrant']}]")
        else:
            watch.append(f"- {a['name']}({a['ticker']}): 短期{a['short']['score']}点/長期{a['long']['score']}点 [{a['quadrant']}]")

    prompt = (f"【地合い】{market['moodLabel']}\n\n【保有ポジション】\n" + ("\n".join(holds) or "なし")
              + "\n\n【ウォッチ中(未保有)】\n" + ("\n".join(watch[:15]) or "なし"))
    if ts["stats"]:
        s = ts["stats"]
        prompt += (f"\n\n【トレード日誌の成績】{s['n']}トレード 勝率{s['winRate']}% "
                   f"平均利益{s['avgWin']}% 平均損失{s['avgLoss']}% PF{s['profitFactor']}")
        prompt += "\n直近の決済:\n" + "\n".join(
            f"- {t['name']}: {t['pnlPct']:+}% ({t.get('reason') or '理由未記録'})" for t in ts["trades"][:8])

    br = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    resp = br.invoke_model(modelId=BEDROCK_MODEL, body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31", "max_tokens": 1200,
        "system": PORTFOLIO_SYSTEM,
        "messages": [{"role": "user", "content": prompt}]}))
    raw = json.loads(resp["body"].read())["content"][0]["text"]
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    brain = json.loads(m.group(0)) if m else {"summary": raw}
    return {"brain": brain, "holdings": len(holds), "market": market["moodLabel"],
            "updatedAt": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════ 銘柄検索 ═══════════════════════
def search_symbol(query):
    if not query.strip():
        return []
    url = ("https://query2.finance.yahoo.com/v1/finance/search?q=" + urllib.parse.quote(query)
           + "&quotesCount=10&newsCount=0")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    out = []
    for q in data.get("quotes", []):
        sym = q.get("symbol", "")
        if q.get("quoteType") not in ("EQUITY", "ETF"):
            continue
        out.append({"ticker": sym,
                    "name": q.get("longname") or q.get("shortname") or sym,
                    "exchange": q.get("exchDisp") or q.get("exchange", ""),
                    "market": "JP" if sym.endswith(".T") else "US"})
    return out[:8]
