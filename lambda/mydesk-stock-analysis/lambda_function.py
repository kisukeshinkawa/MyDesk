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
            return _res(200, brain_analysis(body["ticker"], body.get("name", "")))
        if action == "search":
            return _res(200, {"candidates": search_symbol(body.get("query", ""))})
        if action == "performance":
            return _res(200, get_performance())
        if action == "learn":
            return _res(200, run_learn(body.get("tickers")))
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
PRED_KEY   = "stock-learn/predictions.json"   # 予測の記録(あとで答え合わせ)
CONFIG_KEY = "stock-learn/config.json"        # 因子重み・教訓・成績


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

    # 指数との相対力
    idx_sym = "^N225" if is_jp else "^GSPC"
    try:
        idx_df = fetch_history(idx_sym, "90d")
        idx_close = idx_df["Close"]
        index_ret1m = (float(idx_close.iloc[-1]) / float(idx_close.iloc[-21]) - 1) * 100 if len(idx_close) >= 21 else 0
    except Exception:
        index_ret1m = 0

    learn_cfg = load_learn_config()
    short = score_short(tech, index_ret1m, learn_cfg.get("factor_weights"))

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


def backtest_factors(tickers):
    """過去2年を週次サンプリングし、各テクニカル因子と20日後リターンの関係を収集。
    実運用の予測が貯まる前から因子の有効性を学習できる。"""
    samples = []
    for t in tickers[:8]:
        try:
            df = fetch_history(t, "600d")
        except Exception as e:
            print("backtest fetch failed:", t, e)
            continue
        closes = [float(v) for v in df["Close"].tolist()]
        for i in range(90, len(df) - 21, 5):
            try:
                tech = compute_technical(df.iloc[:i + 1])
                sc = score_short(tech, 0)  # 素の因子スコア(重みなし)
                fwd = (closes[i + 20] / closes[i] - 1) * 100
                samples.append({"factors": {b["category"]: round(b["points"] / b["max"], 3)
                                            for b in sc["breakdown"]},
                                "ret": round(fwd, 2)})
            except Exception:
                continue
    return samples


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
        tickers = list(dict.fromkeys(p["ticker"] for p in reversed(preds)))[:8]
    bt = backtest_factors(tickers or [])
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
 "catalysts":["株価材料・カタリストを1〜3個"]}"""


def brain_analysis(ticker, name=""):
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
