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

# ═══════════════════════ Bedrock呼び出し(モデル自動選択・自己修復) ═══════════════════════
# Bedrockのモデルは提供終了(Legacy化)でIDが使えなくなることがあるため、
# 設定IDが失敗したら利用可能なモデルを自動探索して切り替え、成功したIDをS3に記憶する。
JOB_STATUS_KEY = "stock-learn/job_status.json"
MODEL_STATE_KEY = "stock-learn/bedrock_model.json"
MODEL_PREFERENCE = ("haiku-4-5", "haiku-4", "sonnet-4-5", "sonnet-4", "haiku-3-5", "sonnet-3-5", "haiku", "sonnet")


def _discover_models():
    """このアカウント・リージョンで実際に呼べるAnthropicモデルIDを列挙(推奨順)。"""
    ids = []
    try:
        b = boto3.client("bedrock", region_name=BEDROCK_REGION)
        try:  # 新しめのモデルは推論プロファイル経由が必須
            for p in b.list_inference_profiles().get("inferenceProfileSummaries", []):
                pid = p.get("inferenceProfileId", "")
                if "anthropic" in pid and p.get("status", "ACTIVE") == "ACTIVE":
                    ids.append(pid)
        except Exception as e:
            print("list_inference_profiles failed:", e)
        try:
            for m in b.list_foundation_models(byProvider="anthropic").get("modelSummaries", []):
                if (m.get("modelLifecycle", {}).get("status") == "ACTIVE"
                        and "ON_DEMAND" in (m.get("inferenceTypesSupported") or [])):
                    ids.append(m["modelId"])
        except Exception as e:
            print("list_foundation_models failed:", e)
    except Exception as e:
        print("bedrock client failed:", e)

    def rank(mid):
        for i, key in enumerate(MODEL_PREFERENCE):
            if key.replace("-", "") in mid.replace("-", "").replace(".", ""):
                return i
        return len(MODEL_PREFERENCE)
    return sorted(dict.fromkeys(ids), key=rank)


def bedrock_invoke(messages, system=None, max_tokens=1500):
    """Bedrock呼び出し。失敗時は使えるモデルを自動探索してリトライし、成功IDを記憶する。"""
    rt = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    remembered = (_load_json_s3(MODEL_STATE_KEY, {}) or {}).get("modelId")
    candidates = [m for m in (remembered, BEDROCK_MODEL) if m]
    last_err = None

    def call(mid):
        body = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
                "messages": messages}
        if system:
            body["system"] = system
        resp = rt.invoke_model(modelId=mid, body=json.dumps(body))
        return json.loads(resp["body"].read())["content"][0]["text"]

    for mid in dict.fromkeys(candidates):
        try:
            return call(mid)
        except Exception as e:
            last_err = e
            print(f"bedrock model {mid} failed: {e}")

    for mid in _discover_models():
        if mid in candidates:
            continue
        try:
            out = call(mid)
            _save_json_s3(MODEL_STATE_KEY, {"modelId": mid,
                                            "updatedAt": datetime.now(timezone.utc).isoformat()})
            print(f"bedrock model switched to: {mid}")
            return out
        except Exception as e:
            last_err = e
            print(f"bedrock candidate {mid} failed: {e}")
    raise Exception(f"利用可能なBedrockモデルが見つかりません: {last_err}")

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


def _self_invoke(job, **kw):
    """自分自身を非同期で呼び出して重い処理を裏で走らせる(画面は待たせない)。"""
    try:
        fn = os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        if not fn:
            return False
        boto3.client("lambda", region_name=BEDROCK_REGION).invoke(
            FunctionName=fn, InvocationType="Event",
            Payload=json.dumps({"job": job, **kw}).encode())
        return True
    except Exception as e:
        print("self invoke failed:", job, e)
        return False


def _age_hours(iso):
    try:
        return (datetime.now(timezone.utc)
                - datetime.fromisoformat(str(iso).replace("Z", "+00:00"))).total_seconds() / 3600
    except Exception:
        return 9999


def run_tick():
    """アプリを開くたびに呼ばれる。ニュースはその場で更新し、
    重い処理(ランキング・相場観・学習)は古ければ裏で自動起動する。"""
    started = []
    news = {}
    try:
        news = get_market_news()          # 15分キャッシュ。開くたびに最新化
    except Exception as e:
        print("tick news failed:", e)

    jobs = _load_json_s3(JOB_STATUS_KEY, {})
    ranking = cache_get("ranking.json", 30 * 24 * 3600) or {}
    brief = _load_json_s3("stock-learn/brief.json", {})
    cfg = load_learn_config()

    # それぞれ古くなっていたら裏で更新(多重起動しないよう実行中フラグで抑制)
    if _age_hours(ranking.get("updatedAt")) > 6 and _age_hours((jobs.get("ranking") or {}).get("at")) > 1:
        if _self_invoke("ranking"):
            started.append("ranking")
    if _age_hours(brief.get("updatedAt")) > 6 and _age_hours((jobs.get("brief") or {}).get("at")) > 1:
        if _self_invoke("brief"):
            started.append("brief")
    flow = cache_get("flow.json", 30 * 24 * 3600) or {}
    if _age_hours(flow.get("updatedAt")) > 6 and _age_hours((jobs.get("flow") or {}).get("at")) > 1:
        if _self_invoke("flow"):
            started.append("flow")
    if _age_hours(cfg.get("updatedAt")) > 20 and _age_hours((jobs.get("learn") or {}).get("at")) > 6:
        if _self_invoke("learn"):
            started.append("learn")
    if _age_hours((jobs.get("autotrade") or {}).get("at")) > 2:
        if _self_invoke("autotrade"):
            started.append("autotrade")

    return {"started": started,
            "news": news.get("news", [])[:8],
            "lastUpdated": {
                "news": news.get("updatedAt"),
                "ranking": ranking.get("updatedAt"),
                "brief": brief.get("updatedAt"),
                "flow": flow.get("updatedAt"),
                "learn": cfg.get("updatedAt"),
                "autotrade": (jobs.get("autotrade") or {}).get("at"),
            },
            "jobs": jobs, "now": datetime.now(timezone.utc).isoformat()}


def _record_job(job, ok=True, detail=""):
    """定期ジョブの実行結果を記録。画面で稼働状況を確認するために使う。"""
    try:
        st = _load_json_s3(JOB_STATUS_KEY, {})
        st[job] = {"at": datetime.now(timezone.utc).isoformat(), "ok": ok, "detail": str(detail)[:200]}
        _save_json_s3(JOB_STATUS_KEY, st)
    except Exception as e:
        print("job status save failed:", e)


def lambda_handler(event, context):
    # EventBridge定期実行。定数入力 {"job":"..."} でジョブを切り替える
    #   job未指定 → 朝レポート(スキャン+答え合わせ)  … 毎朝7:00 JST
    #   job=learn    → 因子重み再学習+教訓更新        … 毎朝7:30 JST
    #   job=backtest → 長期ウォークフォワード再検証   … 毎月1日
    job = event.get("job")
    if job or event.get("source") == "aws.events":
        jname = job or "report"
        try:
            if job == "learn":
                wl = _load_json_s3(WATCHLIST_KEY, [])
                r = run_learn([w["ticker"] for w in wl] or None)
                _record_job(jname, True, f"{r.get('backtestSamples',0)}サンプル")
                return _res(200, r)
            if job == "backtest":
                r = run_backtest(None, int(event.get("years", 25)), True)
                _record_job(jname, True, f"{r.get('samples',0)}サンプル")
                return _res(200, r)
            if job == "ranking":
                r = run_ranking(force=True)
                _record_job(jname, True, f"{r.get('scanned',0)}銘柄 財務{r.get('finCovered',0)}")
                return _res(200, r)
            if job == "corr-verify":
                r = verify_correlation(None, int(event.get("years", 25)))
                _save_json_s3("stock-learn/corr_verify.json", r)
                _record_job(jname, True, (r.get("recommended") or {}).get("name", "採用なし"))
                return _res(200, {"recommended": r.get("recommended"), "verdict": r["verdict"]})
            if job == "corr":
                r = compare_correlation(None, int(event.get("years", 25)))
                _save_json_s3("stock-learn/corr_compare.json", r)
                _record_job(jname, True, r.get("verdict", "")[:60])
                return _res(200, {"winner": r["winner"], "verdict": r["verdict"]})
            if job == "flow":
                r = market_flow(force=True)
                _record_job(jname, True, f"業種{len(r.get('sectors') or [])} / "
                                         f"テーマ{len(r.get('themes') or [])} / β{r.get('betaCovered')}銘柄")
                return _res(200, {"sectors": (r.get("sectors") or [])[:5],
                                  "themes": [t["theme"] for t in r.get("themes") or []]})
            if job == "brief":
                r = run_brief()
                _record_job(jname, True, f"狙い目{len((r.get('brief') or {}).get('focus') or [])}件")
                return _res(200, r)
            if job == "autotrade":
                r = run_autotrade()
                _record_job(jname, True, ("停止中" if r.get("enabled") is False
                                          else f"{len(r.get('actions') or [])}件の売買"))
                return _res(200, r)
            if job == "optimize":
                r = simulate_grid(None, int(event.get("years", 25)))
                _save_json_s3("stock-learn/optimize.json", r)
                # 運用タイプを選んであれば、最新の検証結果で自動売買の設定を更新する
                tuned = None
                try:
                    c = autotrade_config()
                    if c.get("autoTune"):
                        tuned = apply_trade_mode(c.get("tradeMode", "balanced"),
                                                 enable=bool(c.get("enabled", True)))["note"]
                except Exception as e:
                    print("autoTune failed:", e)
                _record_job(jname, True, f"{len(r.get('combos') or [])}条件"
                                         + (f" / {tuned}" if tuned else ""))
                return _res(200, {"presets": r.get("presets"), "best": r["bestRiskAdjusted"],
                                  "current": r["current"], "period": r.get("period"),
                                  "autoTuned": tuned})
            if job == "simulate":
                r = simulate_strategy(None, int(event.get("years", 25)))
                _save_json_s3("stock-learn/simulation.json", r)
                return _res(200, {"result": r["result"], "period": r["period"]})
            r = run_daily_report()
            _record_job(jname, True, f"アラート{len(r.get('alerts') or [])}件")
            return _res(200, r)
        except Exception as e:
            import traceback
            traceback.print_exc()
            _record_job(jname, False, str(e))
            return _res(500, {"error": str(e), "job": jname})
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
                                          max(2, min(25, int(body.get("years", 10)))),
                                          bool(body.get("apply", False))))
        if action == "watchlist-get":
            return _res(200, {"items": _load_json_s3(WATCHLIST_KEY, [])})
        if action == "watchlist-set":
            items = (body.get("items") or [])[:50]
            _save_json_s3(WATCHLIST_KEY, items)
            return _res(200, {"ok": True, "count": len(items)})
        if action == "screen":
            return _res(200, run_screen(body.get("exclude") or [], body.get("market", "all")))
        if action == "ranking":
            return _res(200, run_ranking(bool(body.get("force", False))))
        if action == "models":
            return _res(200, {"available": _discover_models(),
                              "remembered": (_load_json_s3(MODEL_STATE_KEY, {}) or {}).get("modelId"),
                              "configured": BEDROCK_MODEL})
        if action == "simulate":
            cached = None if body.get("force") else _load_json_s3("stock-learn/simulation.json", None)
            if cached:
                return _res(200, cached)
            r = simulate_strategy(body.get("tickers"), int(body.get("years", 25)),
                                  int(body.get("initial", 1000000)),
                                  float(body.get("riskPct", 2.0)),
                                  int(body.get("maxPositions", 5)),
                                  int(body.get("entryScore", 70)))
            _save_json_s3("stock-learn/simulation.json", r)
            return _res(200, r)
        if action == "optimize":
            cached = None if body.get("force") else _load_json_s3("stock-learn/optimize.json", None)
            if cached:
                return _res(200, cached)
            r = simulate_grid(body.get("tickers"), int(body.get("years", 25)))
            _save_json_s3("stock-learn/optimize.json", r)
            return _res(200, r)
        if action == "recommend":
            return _res(200, recommend_config(float(body.get("maxDrawdown", -35)),
                                              bool(body.get("allowLeverage", False)),
                                              int(body.get("minTrades", 30))))
        if action == "optimize-latest":
            return _res(200, _load_json_s3("stock-learn/optimize.json", {}))
        if action == "simulation-latest":
            return _res(200, _load_json_s3("stock-learn/simulation.json", {}))
        if action == "tick":
            return _res(200, run_tick())
        if action == "job-status":
            return _res(200, {"jobs": _load_json_s3(JOB_STATUS_KEY, {}),
                              "autotrade": {"enabled": bool(autotrade_config().get("enabled"))},
                              "now": datetime.now(timezone.utc).isoformat()})
        if action == "dashboard":
            return _res(200, performance_dashboard())
        if action == "autotrade":
            return _res(200, {"config": autotrade_config(), "state": paper_state()})
        if action == "autotrade-config":
            return _res(200, {"config": autotrade_config(body.get("config") or {})})
        if action == "autotrade-run":
            return _res(200, run_autotrade())
        if action == "apply-recommended":
            # 周辺の安定性で選んだ設定を、そのまま自動売買に入れる。
            # プリセットは年利1位を拾う作りで、まぐれを掴みやすいため別経路にする
            r = recommend_config(float(body.get("maxDrawdown", -40)), False, 30)
            pick = ([r["recommended"]] + (r.get("runnerUps") or []))[int(body.get("index", 0))]
            upd = _row_to_autotrade(pick)
            upd["enabled"] = True
            upd["tradeMode"] = "custom"
            # 自動追従を切る。切らないと次の再検証でプリセットに戻され、
            # せっかく選んだ安定した設定が上書きされてしまう
            upd["autoTune"] = False
            upd["appliedFrom"] = {k: pick.get(k) for k in
                                  ("entryScore", "rr", "maxPositions", "riskPct", "method",
                                   "cagrPct", "maxDrawdownPct", "winRate", "profitFactor",
                                   "trades", "neighborCagr", "stability")}
            upd["appliedNote"] = "周辺の条件も同水準だった安定領域から選定"
            cfg = autotrade_config(upd)
            return _res(200, {"config": cfg, "applied": pick,
                              "note": (f"年利{pick['cagrPct']}% / 最大下落{pick['maxDrawdownPct']}% の設定を入れました。"
                                       f"周辺条件の平均は年利{pick.get('neighborCagr')}%なので、"
                                       "たまたま当たった設定ではありません。"
                                       "自動追従はOFFにしました(次の再検証で上書きされないように)。")})
        if action == "corr-verify":
            r = verify_correlation(None, int(body.get("years", 25)))
            _save_json_s3("stock-learn/corr_verify.json", r)
            return _res(200, r)
        if action == "corr-verify-latest":
            return _res(200, _load_json_s3("stock-learn/corr_verify.json", {}))
        if action == "corr-compare":
            r = compare_correlation(None, int(body.get("years", 25)))
            _save_json_s3("stock-learn/corr_compare.json", r)
            return _res(200, r)
        if action == "corr-latest":
            return _res(200, _load_json_s3("stock-learn/corr_compare.json", {}))
        if action == "flow":
            return _res(200, market_flow(bool(body.get("force"))))
        if action == "trade-mode":
            r = apply_trade_mode(body.get("mode", "aggressive"),
                                 bool(body.get("enable", True)))
            # 売買は裏で走らせる(同期で待つと全銘柄の分析で数分固まるため)
            if body.get("runNow"):
                r["runQueued"] = _self_invoke("autotrade")
            return _res(200, r)
        if action == "chart":
            iv = body.get("interval", "1d")
            if iv in INTRADAY:
                return _res(200, get_intraday(body["ticker"], iv))
            return _res(200, get_chart(body["ticker"], body.get("period", "6mo"), iv))
        if action == "paper":
            acc = body.get("account")
            if acc:
                return _res(200, paper_state(acc))
            return _res(200, {"ai": paper_state("ai"), "me": paper_state("me")})
        if action == "paper-order":
            return _res(200, paper_order(body["ticker"], body.get("side", "buy"),
                                         body.get("qty", 0), body.get("note", ""),
                                         meta=body.get("meta"),
                                         account=body.get("account", "me")))
        if action == "paper-reset":
            return _res(200, paper_reset(body.get("initial", PAPER_INITIAL),
                                         body.get("account", "me")))
        if action == "market-news":
            return _res(200, get_market_news())
        if action == "brief":
            if body.get("force"):
                return _res(200, run_brief())
            return _res(200, _load_json_s3("stock-learn/brief.json", {"brief": None}))
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


def _pearson_w(xs, ys, ws):
    """重み付き相関。長期学習で「直近の市場環境を重視」するために使う。"""
    sw = sum(ws)
    if len(xs) < 2 or sw <= 0:
        return 0.0
    mx = sum(x * w for x, w in zip(xs, ws)) / sw
    my = sum(y * w for y, w in zip(ys, ws)) / sw
    cov = sum(w * (x - mx) * (y - my) for x, y, w in zip(xs, ys, ws)) / sw
    vx = sum(w * (x - mx) ** 2 for x, w in zip(xs, ws)) / sw
    vy = sum(w * (y - my) ** 2 for y, w in zip(ys, ws)) / sw
    return cov / math.sqrt(vx * vy) if vx > 0 and vy > 0 else 0.0


# ═══════════════════════ データ取得 ═══════════════════════
def fetch_history(ticker, period="400d"):
    """日足OHLCV。periodは "400d"/"10y"/"max" 形式。
    Yahooのrangeパラメータは固定値(1y,2y,5y,10y,max等)しか受けないため、
    "25y"のような任意期間は開始日指定に変換して取得する。"""
    import yfinance as yf
    from datetime import timedelta
    m = re.fullmatch(r"(\d+)([dy])", period)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        days = n if unit == "d" else int(n * 365.25) + 5
        start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
        df = yf.Ticker(ticker).history(start=start, interval="1d", auto_adjust=True)
    else:
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


def fetch_fin_history(ticker):
    """年次のEPS・ROE推移(yfinanceの年次財務諸表・最大4年)。
    「EPSが伸び続けているか」「ROE10%を安定維持か」の判定に使う。取れなければ空。"""
    key = f"fin/{ticker}.json"
    cached = cache_get(key, 24 * 3600)
    if cached is not None:
        return cached
    out = {"years": [], "eps": [], "roe": []}
    try:
        import yfinance as yf
        import pandas as pd
        tk = yf.Ticker(ticker)
        inc, bal = tk.income_stmt, tk.balance_sheet
        if inc is not None and not getattr(inc, "empty", True):
            eps_row = next((inc.loc[n] for n in ("Diluted EPS", "Basic EPS") if n in inc.index), None)
            ni_row = inc.loc["Net Income"] if "Net Income" in inc.index else None
            eq_row = None
            if bal is not None and not getattr(bal, "empty", True):
                eq_row = next((bal.loc[n] for n in ("Stockholders Equity", "Common Stock Equity",
                                                    "Total Equity Gross Minority Interest") if n in bal.index), None)
            for c in sorted(inc.columns):
                eps = roe = None
                if eps_row is not None and c in eps_row.index and pd.notna(eps_row[c]):
                    eps = round(float(eps_row[c]), 2)
                if (ni_row is not None and eq_row is not None and c in ni_row.index
                        and c in getattr(eq_row, "index", []) and pd.notna(ni_row[c])
                        and pd.notna(eq_row[c]) and float(eq_row[c]) != 0):
                    roe = round(float(ni_row[c]) / float(eq_row[c]) * 100, 1)
                if eps is not None or roe is not None:
                    out["years"].append(str(c)[:4])
                    out["eps"].append(eps)
                    out["roe"].append(roe)
    except Exception as e:
        print("fin history failed:", ticker, e)
    cache_put(key, out)
    return out


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


def score_long(info, fin=None):
    """長期ファンダ100点。finに年次EPS/ROE推移があれば
    「EPS連続増加」「ROE安定10%超」を単年指標より優先して評価する。"""
    br, missing = [], []
    eps_hist = [e for e in (fin or {}).get("eps", []) if e is not None]
    roe_hist = [r for r in (fin or {}).get("roe", []) if r is not None]

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

    # ② 収益性 25 (ROEは水準+複数年の安定性。「ROE10%安定維持=優良」の基準)
    pts, whys = 0, []
    roe_stable = len(roe_hist) >= 3 and all(x >= 10 for x in roe_hist)
    if roe is not None:
        r = roe * 100
        if roe_stable: pts += 12; whys.append(f"ROE{r:.1f}%かつ{len(roe_hist)}期連続10%以上(安定した稼ぐ力)")
        elif r >= 15: pts += 12; whys.append(f"ROE{r:.1f}%と優秀")
        elif r >= 10: pts += 8; whys.append(f"ROE{r:.1f}%と良好")
        elif r >= 8: pts += 4; whys.append(f"ROE{r:.1f}%")
        else: whys.append(f"ROE{r:.1f}%と低い")
    elif roe_stable:
        pts += 12; whys.append(f"ROE {len(roe_hist)}期連続10%以上(年次財務より)")
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
    # EPSは複数年トレンドを最優先(「EPSが伸び続けている企業=ほぼ間違いなく良い企業」)
    if len(eps_hist) >= 3:
        inc_years = sum(1 for i in range(1, len(eps_hist)) if eps_hist[i] > eps_hist[i - 1])
        if inc_years == len(eps_hist) - 1:
            pts += 13; whys.append(f"EPSが{len(eps_hist)}期連続増加(1株利益=投資家の取り分が拡大し続けている)")
        elif eps_hist[-1] > eps_hist[0]:
            pts += 8; whys.append(f"EPSは{len(eps_hist)}期通算で増加(うち増益{inc_years}回)")
        elif eps_hist[-1] <= 0:
            whys.append(f"EPSがマイナス圏(直近{eps_hist[-1]})")
        else:
            pts += 2; whys.append(f"EPSは{len(eps_hist)}期で伸び悩み")
    elif epsg is not None:
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


# ═══════════════════════ プロのチェックリスト ═══════════════════════
# 出典(ネット上のプロ手法のコンセンサス):
# ・ミネルヴィニ「トレンドテンプレート」8条件(成長株投資法)
# ・オニール「CAN-SLIM」(成長株発掘法)の定量化可能な項目
# ・25日線乖離率±10%(国内証券各社が示す過熱/底値の目安)
def build_pro_checklist(df, info, fin, rel3m, regime_on):
    close = df["Close"]
    price = float(close.iloc[-1])
    items = []

    def add(group, name, ok, detail):
        items.append({"group": group, "name": name, "pass": ok, "detail": detail})

    # ── ミネルヴィニ・トレンドテンプレート ──
    G = "トレンドテンプレート"
    if len(close) >= 200:
        ma50 = float(close.rolling(50).mean().iloc[-1])
        ma150 = float(close.rolling(150).mean().iloc[-1])
        ma200 = close.rolling(200).mean()
        ma200_now, ma200_prev = float(ma200.iloc[-1]), float(ma200.iloc[-21])
        win = close.iloc[-250:] if len(close) >= 250 else close
        hi52, lo52 = float(win.max()), float(win.min())
        add(G, "株価が150日・200日線の上", price > ma150 and price > ma200_now,
            f"株価{price:,.0f} / 150日線{ma150:,.0f} / 200日線{ma200_now:,.0f}")
        add(G, "150日線 > 200日線", ma150 > ma200_now, "中期線が長期線の上=上昇の並び")
        add(G, "200日線が1ヶ月以上上向き", ma200_now > ma200_prev,
            f"200日線 1ヶ月前比{(ma200_now/ma200_prev-1)*100:+.1f}%")
        add(G, "50日線 > 150日線 > 200日線", ma50 > ma150 > ma200_now, "パーフェクトオーダー")
        add(G, "株価が50日線の上", price > ma50, f"50日線{ma50:,.0f}")
        add(G, "52週安値から+30%以上", price >= lo52 * 1.3,
            f"安値{lo52:,.0f}から{(price/lo52-1)*100:+.0f}%")
        add(G, "52週高値から25%以内", price >= hi52 * 0.75,
            f"高値{hi52:,.0f}まで{(1-price/hi52)*100:.0f}%")
        add(G, "相対力: 3ヶ月で指数に勝つ(簡易版)", rel3m is not None and rel3m > 0,
            f"対指数3ヶ月{rel3m:+.1f}%" if rel3m is not None else "算出不可")
    # ── CAN-SLIM(定量化できる項目のみ) ──
    G = "CAN-SLIM"
    qeg = _g(info, "earningsQuarterlyGrowth")
    add(G, "C: 四半期EPS成長+20%以上",
        (qeg * 100 >= 20) if qeg is not None else None,
        f"四半期利益成長{qeg*100:.0f}%" if qeg is not None else "データなし")
    eps_hist = [e for e in (fin or {}).get("eps", []) if e is not None]
    aeg = None
    if len(eps_hist) >= 2 and eps_hist[-2] > 0:
        aeg = (eps_hist[-1] / eps_hist[-2] - 1) * 100
    roe_v = _g(info, "returnOnEquity")
    add(G, "A: 年間EPS成長+25%かつROE17%以上",
        (aeg >= 25 and roe_v is not None and roe_v * 100 >= 17) if aeg is not None else None,
        (f"年間EPS成長{aeg:+.0f}% / ROE{roe_v*100:.0f}%" if aeg is not None and roe_v is not None
         else f"年間EPS成長{aeg:+.0f}%" if aeg is not None else "データなし"))
    if len(close) >= 200:
        add(G, "N: 新高値圏(52週高値まで5%以内)", price >= hi52 * 0.95,
            f"高値まで{(1-price/hi52)*100:.1f}%")
    inst = _g(info, "heldPercentInstitutions")
    if inst is not None:
        add(G, "I: 機関投資家が保有(30%以上)", inst >= 0.3, f"機関保有{inst*100:.0f}%")
    add(G, "M: 地合い(指数が200日線の上)", bool(regime_on), "市場全体が上昇局面か")
    # ── 過熱度(25日線乖離率) ──
    if len(close) >= 25:
        ma25v = float(close.rolling(25).mean().iloc[-1])
        dev = (price / ma25v - 1) * 100
        add("過熱度", "25日線乖離率±10%以内", -10 <= dev <= 10,
            f"乖離{dev:+.1f}%" + ("(買われすぎ・利確検討ゾーン)" if dev > 10 else "(売られすぎゾーン)" if dev < -10 else ""))

    evaluable = [i for i in items if i["pass"] is not None]
    return {"items": items,
            "passed": sum(1 for i in evaluable if i["pass"]),
            "total": len(evaluable)}


def _trade_levels(tech, df):
    """チャートに引く売買ライン。AIの文章とは別に、常に同じ計算で数値を出す。
    損切り=2ATR下と直近安値の高い方 / 利確=リスクリワード2倍・3倍 / 押し目=25日線"""
    price, atr = tech["price"], tech["atr"]
    low20 = float(df["Low"].iloc[-20:].min()) if len(df) >= 20 else price - 2 * atr
    stop = max(price - 2 * atr, low20 * 0.995)
    risk = max(price - stop, atr * 0.5)
    return {
        "price": round(price, 2),
        "entry": round(min(price, tech["ma25"]) if tech["ma25"] and tech["ma25"] < price else price, 2),
        "stop": round(stop, 2),
        "target1": round(price + risk * 2, 2),
        "target2": round(price + risk * 3, 2),
        "ma25": round(tech["ma25"], 2) if tech["ma25"] else None,
        "riskPct": round((price - stop) / price * 100, 1),
        "rewardPct": round(risk * 2 / price * 100, 1),
        "rr": 2.0,
    }


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
    index_ret1m, regime_on, rel3m = 0, True, None
    try:
        idx_df = fetch_history(idx_sym, "400d")
        idx_close = idx_df["Close"]
        if len(idx_close) >= 21:
            index_ret1m = (float(idx_close.iloc[-1]) / float(idx_close.iloc[-21]) - 1) * 100
        if len(idx_close) >= 200:
            regime_on = float(idx_close.iloc[-1]) > float(idx_close.rolling(200).mean().iloc[-1])
        if len(idx_close) >= 63 and len(df["Close"]) >= 63:
            stock_r3 = (float(df["Close"].iloc[-1]) / float(df["Close"].iloc[-63]) - 1) * 100
            idx_r3 = (float(idx_close.iloc[-1]) / float(idx_close.iloc[-63]) - 1) * 100
            rel3m = stock_r3 - idx_r3
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
    fin = fetch_fin_history(ticker)
    long_ = score_long(info, fin)

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
        "sectorJa": SECTOR_JA.get(_g(info, "sector")) or _g(info, "sector"),
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
        "tradeLevels": _trade_levels(tech, df),
        "regime": {"benchAboveMa200": regime_on,
                   "bench": "日経平均" if is_jp else "S&P500"},
        "spark": tech["spark"], "sparkMa25": tech["spark_ma25"],
        "finHistory": fin,  # 年次EPS/ROE推移
        "proChecklist": build_pro_checklist(df, info, fin, rel3m, regime_on),
        "candles": [{"d": d.strftime("%m/%d"), "o": round(float(o), 2), "h": round(float(hi), 2),
                     "l": round(float(lo), 2), "c": round(float(cl), 2), "v": float(v)}
                    for d, o, hi, lo, cl, v in zip(df.index[-60:], df["Open"].iloc[-60:], df["High"].iloc[-60:],
                                                   df["Low"].iloc[-60:], df["Close"].iloc[-60:], df["Volume"].iloc[-60:])],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    # 連動係数(この銘柄が何に引っ張られて動くか)。毎朝のランキングで実測済みのものを流用する
    try:
        rk = cache_get("ranking.json", 24 * 3600) or {}
        row = next((r for r in rk.get("rows", []) if r["ticker"] == ticker), None)
        if row and row.get("beta"):
            out["beta"], out["corr"], out["drivenBy"] = row["beta"], row.get("corr"), row.get("drivenBy")
    except Exception as e:
        print("beta lookup failed:", ticker, e)

    # 予測を記録(後日答え合わせして学習に使う)
    record_prediction({
        "type": "score", "ticker": ticker,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "price": out["price"], "signal": short["signal"], "quadrant": quadrant,
        "short_score": short["score"], "long_score": long_["score"],
        "factors": {b["category"]: round(b["points"] / b["max"], 3)
                    for b in short["breakdown"] if b["max"]},  # 地合いフィルタ(max=0)は除外
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


# ═══════════════════════ 戦略シミュレーション(資産曲線・年利・最大DD) ═══════════════════════
def _prepare_sim(tickers, years, min_score=65, limit=20):
    """シミュレーション用の下ごしらえ。スコアはパラメータに依存しないので一度だけ計算し、
    買い候補(スコアが最低基準以上かつ地合いOKの日)を銘柄ごとに列挙しておく。
    これにより複数のパラメータ条件を高速に比較できる。"""
    cfg = load_learn_config()
    weights = cfg.get("factor_weights")
    bench = {}
    for sym, key in (("^N225", "JP"), ("^GSPC", "US")):
        try:
            b = fetch_history(sym, f"{years}y")["Close"]
            bench[key] = {"close": b, "ma200": b.rolling(200).mean(),
                          "ret1m": b.pct_change(20) * 100,
                          "pos": {d.strftime("%Y-%m-%d"): i for i, d in enumerate(b.index)}}
        except Exception as e:
            print("sim bench failed:", sym, e)

    drivers = _sim_drivers(years)
    driver_up = {k: v["up"] for k, v in drivers.items()}

    # 銘柄数が多いときは一括ダウンロードに切り替える。
    # 1銘柄ずつだと通信の往復だけで数百秒かかり、Lambdaの時間内に終わらない
    target = tickers[:limit]
    bulk = {}
    if len(target) > 40:
        t0 = time.time()
        bulk = fetch_bulk_ohlcv(target, days=int(years * 366))
        print(f"sim bulk download: {len(bulk)}/{len(target)}銘柄 {time.time()-t0:.0f}秒")

    budget = float(os.environ.get("SIM_BUDGET", "480"))   # 秒。準備にかけてよい上限
    started = time.time()
    prep = {}
    skipped = 0
    for t in target:
        if time.time() - started > budget:
            skipped += 1
            continue          # 時間切れ。集めたぶんだけで検証する(件数は結果に出す)
        try:
            df = bulk.get(t) if bulk else fetch_history(t, f"{years}y")
            if df is None or len(df) < 250:
                continue
            f = build_indicator_frame(df)
            atr = (df["High"] - df["Low"]).rolling(14).mean()
            low20 = df["Low"].rolling(20).min()
            dates = [d.strftime("%Y-%m-%d") for d in df.index]
            mkt = "JP" if t.endswith(".T") else "US"
            b = bench.get(mkt)
            cands = {}
            if b:
                for i in range(200, len(df) - 1):
                    d = dates[i]
                    bi = b["pos"].get(d)
                    if bi is None or bi < 200:
                        continue
                    if not (float(b["close"].iloc[bi]) > float(b["ma200"].iloc[bi])):
                        continue   # 地合いフィルタ
                    br = float(b["ret1m"].iloc[bi])
                    if math.isnan(br):
                        br = 0
                    try:
                        sc = score_short(_row_to_tech(f, i), br, weights)
                    except Exception:
                        continue
                    if sc["score"] < min_score:
                        continue
                    a = float(atr.iloc[i])
                    if math.isnan(a) or a <= 0:
                        continue
                    cands[d] = {"score": sc["score"], "entryPx": float(df["Open"].iloc[i + 1]),
                                "atr": a, "low20": float(low20.iloc[i]), "nextDate": dates[i + 1]}
            maL = df["Close"].rolling(200).mean()
            prep[t] = {"maLong": [None if math.isnan(x) else float(x) for x in maL],
                       "dates": dates, "idx": {d: i for i, d in enumerate(dates)},
                       "high": [float(x) for x in df["High"]], "low": [float(x) for x in df["Low"]],
                       "close": [float(x) for x in df["Close"]], "cands": cands}
            prep[t].update(_rolling_links(df, drivers, mkt))
            prep[t]["drvUp"] = driver_up      # 全銘柄で同じ辞書を参照(実体は1つ)
        except Exception as e:
            print("sim prep failed:", t, e)

    # 日付 → その日の買い候補(スコアの高い順)。
    # 銘柄ごとに毎日全銘柄を見に行くと、909銘柄では走査が数百万回になり終わらない
    by_date = {}
    for t, v in prep.items():
        for d, c in v["cands"].items():
            by_date.setdefault(d, []).append((t, c))
    for d in by_date:
        by_date[d].sort(key=lambda x: -x[1]["score"])
    for v in prep.values():
        v["byDate"] = by_date            # 全銘柄で同じ辞書を参照(実体は1つ)
    if skipped:
        print(f"sim prep: 時間切れで{skipped}銘柄をスキップ")
    print(f"sim prep: {len(prep)}銘柄 / 候補のある日 {len(by_date)}日")
    return prep


def _sim_drivers(years):
    """検証用に牽引役の値動きを用意する。
    up = その日、牽引役自体が上昇トレンド(50日線の上)にあったか。"""
    out = {}
    for sym, label, key in DRIVER_TICKERS + MARKET_DRIVERS:
        try:
            c = fetch_history(sym, f"{years}y")["Close"].dropna()
            if len(c) < 250:
                continue
            r = c.pct_change()
            r.index = [d.date() for d in c.index]
            up = (c > c.rolling(50).mean())
            out[key] = {"label": label, "ret": r,
                        "up": {d.strftime("%Y-%m-%d"): bool(v) for d, v in zip(c.index, up)}}
        except Exception as e:
            print("sim driver failed:", sym, e)
    return out


def _rolling_links(df, drivers, mkt, win=120, min_corr=0.30):
    """その日までの過去120日だけを使って連動係数を計算する。
    全期間のβで過去を判定すると「未来を知っている」ことになり、
    検証結果が実際より良く出てしまうため、必ず後ろ向きの窓で計算する。"""
    import pandas as pd
    if not drivers:
        return {"drivenBy": {}, "mktBeta": {}}
    s = df["Close"].pct_change()
    s.index = [d.date() for d in df.index]
    theme_keys = [k for _, _, k in DRIVER_TICKERS if k in drivers]
    bench_key = "n225" if mkt == "JP" else "sp500"

    best, mbeta = {}, {}
    for key in theme_keys + ([bench_key] if bench_key in drivers else []):
        sub = pd.DataFrame({"s": s, "d": drivers[key]["ret"]}).dropna()
        if len(sub) < win + 10:
            continue
        var = sub["d"].rolling(win).var()
        beta = sub["s"].rolling(win).cov(sub["d"]) / var.where(var > 0)
        corr = sub["s"].rolling(win).corr(sub["d"])
        for d, b, c in zip(sub.index, beta, corr):
            if b != b or c != c:          # NaN(窓が埋まっていない期間)
                continue
            ds = d.strftime("%Y-%m-%d")
            if key == bench_key:
                mbeta[ds] = round(float(b), 2)
            if key in theme_keys and abs(c) >= min_corr:
                cur = best.get(ds)
                if not cur or abs(c) > abs(cur["corr"]):
                    best[ds] = {"key": key, "beta": round(float(b), 2), "corr": round(float(c), 2)}
    return {"drivenBy": best, "mktBeta": mbeta}


def _sim_pass(prep, all_dates, initial=1000000, risk_pct=2.0, max_pos=5,
              entry_score=70, rr=2.0, fee=0.001, odd_lot=True,
              partial=False, partial_rr=1.5, time_stop=0, trail=0.0, leverage=1.0,
              hold_mode="trade", ma_exit=200,
              max_same_driver=0, driver_trend=False, beta_size=False):
    """1条件ぶんの運用を再現。
    partial   : 分割利確(第1目標で半分利確し、残りは損切りを建値に上げて伸ばす)
    time_stop : N日経っても損切り/利確に当たらなければ手仕舞い(資金効率を上げる)
    trail     : 建値超え後、高値からこの割合下げたら手仕舞い(トレーリングストップ)
    leverage  : 信用取引の倍率。リターンも下落も同じ倍率で拡大する(金利は考慮していない)
    hold_mode : trade=利確目標で降りる(短期売買) / trend=長期移動平均を割るまで持ち続ける
                (バフェット型の「売らない」を機械化したもの) / buyhold=売らない

    ここから下は「連動性(相関)を使う仕組み」。効果があるかを検証するためのもの:
    max_same_driver : 同じ牽引役に連動する銘柄を何個まで持つか(0=無制限)。
                      8銘柄持っていても全部が半導体連動なら実質1銘柄なので、それを防ぐ
    driver_trend    : その銘柄の牽引役自体が上昇トレンド(50日線の上)のときだけ買う。
                      逆風の中で個別の点数だけ見て買うのを止める
    beta_size       : 市場に対する感応度(β)が高い銘柄ほど枚数を減らし、実質リスクを揃える
    """
    drv_up = next((v.get("drvUp") for v in prep.values() if v.get("drvUp")), {})
    by_date = next((v.get("byDate") for v in prep.values() if v.get("byDate")), {})
    cash, positions, trades, curve = float(initial), {}, [], []
    peak, maxdd = float(initial), 0.0
    risk_used = []
    for d in all_dates:
        equity = cash
        for t, p in positions.items():
            i = prep[t]["idx"].get(d)
            equity += (prep[t]["close"][i] if i is not None else p["entry"]) * p["qty"]
        peak = max(peak, equity)
        maxdd = min(maxdd, equity / peak - 1)
        curve.append({"date": d, "equity": round(equity, 0)})

        for t in list(positions.keys()):
            i = prep[t]["idx"].get(d)
            if i is None:
                continue
            p = positions[t]
            hi, lo, cl = prep[t]["high"][i], prep[t]["low"][i], prep[t]["close"][i]
            p["hold"] = p.get("hold", 0) + 1
            p["peak"] = max(p.get("peak", p["entry"]), hi)

            # ① 分割利確: 第1目標で半分を利確し、損切りを建値へ上げる(以降は負けない形)
            if partial and not p.get("half") and hi >= p["t1"]:
                half = p["qty"] // 2
                if half > 0:
                    proceeds = p["t1"] * half * (1 - fee)
                    cash += proceeds
                    trades.append({"ticker": t, "entryDate": p["date"], "exitDate": d,
                                   "entry": round(p["entry"], 2), "exit": round(p["t1"], 2),
                                   "qty": half, "pnl": round(proceeds - p["entry"] * half, 0),
                                   "pnlPct": round((p["t1"] / p["entry"] - 1) * 100, 2),
                                   "reason": "分割利確"})
                    p["qty"] -= half
                p["half"] = True
                p["stop"] = max(p["stop"], p["entry"])   # 建値ストップ

            # ── 長期保有モード: 利確目標では降りず、трендが崩れるまで持つ ──
            if hold_mode in ("trend", "buyhold"):
                exit_px = reason = None
                if hold_mode == "trend":
                    maL = prep[t].get("maLong")
                    mv = maL[i] if maL and i < len(maL) else None
                    if mv and cl < mv:
                        exit_px, reason = cl, f"{ma_exit}日線割れ"
                    elif trail and p["peak"] > p["entry"] and cl <= p["peak"] * (1 - trail):
                        exit_px, reason = cl, "トレーリング"
                if exit_px:
                    proceeds = exit_px * p["qty"] * (1 - fee)
                    cash += proceeds
                    trades.append({"ticker": t, "entryDate": p["date"], "exitDate": d,
                                   "entry": round(p["entry"], 2), "exit": round(exit_px, 2),
                                   "qty": p["qty"], "pnl": round(proceeds - p["entry"] * p["qty"], 0),
                                   "pnlPct": round((exit_px / p["entry"] - 1) * 100, 2), "reason": reason})
                    del positions[t]
                continue

            exit_px = reason = None
            if lo <= p["stop"]:
                exit_px = p["stop"]
                reason = "建値撤退" if p.get("half") and p["stop"] >= p["entry"] else "損切り"
            elif hi >= p["target"]:
                exit_px, reason = p["target"], "利確"
            elif trail and p["peak"] > p["entry"] and cl <= p["peak"] * (1 - trail):
                exit_px, reason = cl, "トレーリング"
            elif time_stop and p["hold"] >= time_stop:
                exit_px, reason = cl, "時間切れ"
            if exit_px:
                proceeds = exit_px * p["qty"] * (1 - fee)
                cash += proceeds
                trades.append({"ticker": t, "entryDate": p["date"], "exitDate": d,
                               "entry": round(p["entry"], 2), "exit": round(exit_px, 2),
                               "qty": p["qty"], "pnl": round(proceeds - p["entry"] * p["qty"], 0),
                               "pnlPct": round((exit_px / p["entry"] - 1) * 100, 2), "reason": reason})
                del positions[t]

        if len(positions) >= max_pos:
            continue
        for t, c in (by_date.get(d) or ()):
            if len(positions) >= max_pos:
                break
            if t in positions or c["score"] < entry_score:
                continue
            v = prep[t]
            link = (v.get("drivenBy") or {}).get(d)
            # 牽引役が下降トレンドなら見送る(逆風の中で個別の点数だけ見て買わない)
            if driver_trend and link and not (drv_up.get(link["key"]) or {}).get(d, True):
                continue
            # 同じ牽引役に連動する銘柄を持ちすぎない(分散しているつもりの集中を防ぐ)
            if max_same_driver and link:
                same = sum(1 for pp in positions.values() if pp.get("driver") == link["key"])
                if same >= max_same_driver:
                    continue
            px = c["entryPx"]
            stop = max(px - 2 * c["atr"], c["low20"] * 0.995)
            if stop >= px:
                continue
            risk = px - stop
            unit = 1 if (odd_lot or not t.endswith(".T")) else 100
            qty_risk = int(equity * risk_pct / 100 / risk)          # 2%ルール
            qty_cap = int(equity * leverage / max_pos / px)         # 1銘柄あたりの上限
            qty = min(qty_risk, qty_cap)
            if beta_size:
                # 市場に対して1.5倍動く銘柄は、同じ枚数でも実質1.5倍のリスクを負っている。
                # 2%ルールと上限のどちらが効いていても縮むよう、最終的な枚数に掛ける
                mb = (v.get("mktBeta") or {}).get(d)
                if mb and mb > 1.0:
                    qty = int(qty / min(mb, 2.5))
            qty = (qty // unit) * unit
            if qty < unit:
                # 実運用と同じ救済ルール
                one_risk = risk * unit / equity * 100 if equity else 999
                one_cost = px * unit * (1 + fee)
                if odd_lot:
                    if one_cost <= max(cash, equity * (leverage - 1)) and one_risk <= risk_pct * 2:
                        qty = unit
                elif (one_risk <= risk_pct * 1.5 and one_cost <= equity / max_pos * 2
                      and one_cost <= cash * 0.5):
                    qty = unit
            cost = px * qty * (1 + fee)
            invested = sum(pp["entry"] * pp["qty"] for pp in positions.values())
            if qty < unit or invested + cost > equity * leverage:
                continue
            cash -= cost
            risk_used.append(risk * qty / equity * 100 if equity else 0)
            positions[t] = {"qty": qty, "entry": px, "stop": stop,
                            "t1": px + risk * partial_rr,
                            "target": px + risk * rr, "date": c["nextDate"],
                            "hold": 0, "peak": px, "half": False,
                            "driver": link["key"] if link else None}

    final = curve[-1]["equity"] if curve else initial
    yrs = max(1e-9, len(curve) / 252)
    wins = [x for x in trades if x["pnl"] > 0]
    gw = sum(x["pnl"] for x in wins)
    gl = abs(sum(x["pnl"] for x in trades if x["pnl"] <= 0))
    rets = [curve[i]["equity"] / curve[i - 1]["equity"] - 1
            for i in range(1, len(curve)) if curve[i - 1]["equity"]]
    mean_r = sum(rets) / len(rets) if rets else 0
    var = sum((r - mean_r) ** 2 for r in rets) / len(rets) if rets else 0
    return {
        "result": {
            "finalEquity": round(final, 0),
            "totalReturnPct": round((final / initial - 1) * 100, 1),
            "cagrPct": round(((final / initial) ** (1 / yrs) - 1) * 100 if final > 0 else -100, 2),
            "maxDrawdownPct": round(maxdd * 100, 1),
            "sharpe": round((mean_r * 252) / math.sqrt(var * 252), 2) if var > 0 else 0,
            "trades": len(trades),
            "winRate": round(len(wins) / len(trades) * 100, 1) if trades else None,
            "profitFactor": round(gw / gl, 2) if gl > 0 else None,
            "avgWinPct": round(sum(x["pnlPct"] for x in wins) / len(wins), 2) if wins else 0,
            "avgLossPct": round(sum(x["pnlPct"] for x in trades if x["pnl"] <= 0)
                                / max(1, len(trades) - len(wins)), 2),
            "maxLossStreak": _max_streak(trades),
            # 実際に1トレードあたり資産の何%をリスクに晒したか(設定値との乖離を確認する)
            "effectiveRiskPct": round(sum(risk_used) / len(risk_used), 2) if risk_used else 0,
        },
        "curve": curve, "trades": trades,
        "period": {"from": curve[0]["date"] if curve else None,
                   "to": curve[-1]["date"] if curve else None, "years": round(yrs, 1)}}


def simulate_strategy(tickers=None, years=25, initial=1000000, risk_pct=2.0,
                      max_pos=5, entry_score=70, fee=0.001, rr=2.0, odd_lot=True):
    """自動売買のルールをそのまま過去に当てはめて資産の推移を再現する。"""
    tickers = tickers or DEFAULT_UNIVERSE
    prep = _prepare_sim(tickers, years)
    if not prep:
        raise Exception("シミュレーション用のデータが取得できません")
    all_dates = sorted({d for v in prep.values() for d in v["dates"]})[200:]
    r = _sim_pass(prep, all_dates, initial, risk_pct, max_pos, entry_score, rr, fee, odd_lot)

    curve = r["curve"]
    by_year = {}
    for c in curve:
        y = c["date"][:4]
        by_year.setdefault(y, {"start": c["equity"], "end": c["equity"]})
        by_year[y]["end"] = c["equity"]
    yearly = [{"year": y, "returnPct": round((v["end"] / v["start"] - 1) * 100, 1)}
              for y, v in sorted(by_year.items()) if v["start"]]
    step = max(1, len(curve) // 400)
    return {"period": r["period"],
            "settings": {"initial": initial, "riskPct": risk_pct, "maxPositions": max_pos,
                         "entryScore": entry_score, "rr": rr, "oddLot": odd_lot,
                         "tickers": len(prep), "fee": fee},
            "result": r["result"], "curve": curve[::step], "yearly": yearly,
            "recentTrades": r["trades"][-15:][::-1],
            "updatedAt": datetime.now(timezone.utc).isoformat()}


def simulate_grid(tickers=None, years=25, initial=1000000):
    """複数のパラメータ条件を一括比較し、最適な設定を提示する。
    スコアの計算は1回だけなので、条件を増やしても時間はほとんど増えない。

    銘柄数について: 20銘柄で回すと「候補が足りないだけ」の結果を掴む。
    実運用は909銘柄をスキャンしているので、検証も同じ土俵に近づける。"""
    tickers = tickers or FULL_UNIVERSE
    prep = _prepare_sim(tickers, years, limit=int(os.environ.get("GRID_TICKERS", "300")))
    if not prep:
        raise Exception("シミュレーション用のデータが取得できません")
    all_dates = sorted({d for v in prep.values() for d in v["dates"]})[200:]

    # 信用取引は外した。デモ口座は現物のみで、検証上の数字どおりには回らないため。
    # 同時保有は8までしか試していなかったが、12〜20のほうが良い可能性があるので広げる。
    # 同時保有数を一番内側にする。時間切れになっても全ての保有数が均等に試され、
    # 「何銘柄が良いか」の比較が欠けないようにするため
    combos = []
    for entry in (65, 70, 75):
        for rr in (3.0, 4.0):
            for risk in (2.0, 3.0):
                for adv in ({}, {"partial": True}, {"trail": 0.08},
                            {"hold_mode": "trend"},
                            {"hold_mode": "trend", "trail": 0.25}):
                    for mp in (3, 5, 8, 12, 16, 20):
                        combos.append({"entryScore": entry, "rr": rr, "maxPositions": mp,
                                       "riskPct": risk, "leverage": 1.0, **adv})

    budget = float(os.environ.get("GRID_BUDGET", "600"))   # 秒。条件の試行にかけてよい上限
    t0 = time.time()
    rows, done = [], 0
    for c in combos:
        if time.time() - t0 > budget:
            break        # 時間切れ。試せたぶんだけで比較する(件数は結果に出す)
        done += 1
        try:
            r = _sim_pass(prep, all_dates, initial, c["riskPct"], c["maxPositions"],
                          c["entryScore"], c["rr"], odd_lot=True,
                          partial=c.get("partial", False), time_stop=c.get("time_stop", 0),
                          trail=c.get("trail", 0.0), leverage=c.get("leverage", 1.0),
                          hold_mode=c.get("hold_mode", "trade"))
            res = r["result"]
            # リターン÷リスクで評価(下落幅に対してどれだけ増やせたか)
            calmar = (res["cagrPct"] / abs(res["maxDrawdownPct"])) if res["maxDrawdownPct"] else 0
            rows.append({**c, "method": ("長期保有+トレーリング" if c.get("hold_mode")=="trend" and c.get("trail")
                                         else "長期保有(利確しない)" if c.get("hold_mode")=="trend"
                                         else "分割+トレーリング" if c.get("partial") and c.get("trail")
                                         else "分割利確" if c.get("partial")
                                         else "トレーリング" if c.get("trail") else "標準"),
                         **{k: res[k] for k in
                                 ("finalEquity", "totalReturnPct", "cagrPct", "maxDrawdownPct",
                                  "sharpe", "trades", "winRate", "profitFactor", "maxLossStreak",
                                  "effectiveRiskPct")},
                         "calmar": round(calmar, 2)})
        except Exception as e:
            print("grid combo failed:", c, e)

    if done < len(combos):
        print(f"grid: 時間切れ {done}/{len(combos)}条件のみ試行")
    current = next((r for r in rows if r["entryScore"] == 70 and r["rr"] == 3.0
                    and r["maxPositions"] == 8 and r["riskPct"] == 2.0), None)
    valid = [r for r in rows if r["trades"] >= 20]   # 取引が少なすぎる条件は信頼できない

    def pick(cond, key):
        c = [r for r in valid if cond(r)]
        return max(c, key=key) if c else None

    # 3タイプ: 下落を抑える / バランス / リターン重視(下落は深くなる)
    presets = {
        "safe": pick(lambda r: r["maxDrawdownPct"] >= -15, lambda r: r["cagrPct"]),
        "balanced": pick(lambda r: True, lambda r: r["calmar"]),
        "aggressive": pick(lambda r: r["maxDrawdownPct"] >= -45 and r.get("leverage", 1) == 1,
                           lambda r: r["cagrPct"]),
        # 年利最大を狙う。下落は非常に深くなる(信用取引を含む)
        "max": pick(lambda r: True, lambda r: r["cagrPct"]),
    }
    if not presets["safe"]:
        presets["safe"] = pick(lambda r: r["maxDrawdownPct"] >= -25, lambda r: r["cagrPct"])
    # 同時保有数ごとの平均。「何銘柄に分散するのが良いか」は単独で見る価値がある
    by_pos = {}
    for r in rows:
        by_pos.setdefault(r["maxPositions"], []).append(r)
    pos_summary = [{"maxPositions": mp,
                    "n": len(v),
                    "avgCagr": round(sum(x["cagrPct"] for x in v) / len(v), 2),
                    "avgDd": round(sum(x["maxDrawdownPct"] for x in v) / len(v), 1),
                    "avgCalmar": round(sum(x["calmar"] for x in v) / len(v), 3),
                    "bestCagr": round(max(x["cagrPct"] for x in v), 2)}
                   for mp, v in sorted(by_pos.items())]

    return {"period": {"years": years, "tickers": len(prep)},
            "combosTried": done, "combosTotal": len(combos),
            "byPositions": pos_summary,
            "combos": sorted(rows, key=lambda r: -r["calmar"]),
            "current": current,
            "presets": presets,
            "bestReturn": max(valid, key=lambda r: r["cagrPct"]) if valid else None,
            "bestRiskAdjusted": presets["balanced"],
            "updatedAt": datetime.now(timezone.utc).isoformat()}


def verify_correlation(tickers=None, years=25, initial=1000000):
    """集中回避などが「たまたま1つの設定で効いただけ」でないかを確かめる。
    本物の優位性なら、設定を変えても同じ方向に効くはず。
    1つの設定でしか効かないものは偶然とみなし、採用しない。"""
    tickers = tickers or FULL_UNIVERSE
    prep = _prepare_sim(tickers, years, limit=int(os.environ.get("CORR_TICKERS", "400")))
    if not prep:
        raise Exception("シミュレーション用のデータが取得できません")
    all_dates = sorted({d for v in prep.values() for d in v["dates"]})[200:]

    # 前半4つは同時保有数だけを変えた設定。他をすべて同じにしてあるので、
    # 「効く/効かない」が保有数で決まるのかどうかを切り分けられる。
    # (牽引役は6種類しかないため、保有数が多いほど集中回避が実際の制約になる)
    def _b(mp, **kw):
        d = {"entry_score": 70, "rr": 3.0, "max_pos": mp, "risk_pct": 2.0,
             "partial": True, "trail": 0.0, "hold_mode": "trade"}
        d.update(kw)
        return d

    BASES = [
        ("保有3銘柄",  _b(3)), ("保有5銘柄",  _b(5)),
        ("保有8銘柄",  _b(8)), ("保有12銘柄", _b(12)),
        # 性格の違う設定でも確認する
        ("積極(65点/3銘柄/リスク3%)", _b(3, entry_score=65, rr=4.0, risk_pct=3.0, partial=False)),
        ("長期保有(65点/8銘柄)",      _b(8, entry_score=65, trail=0.25, partial=False, hold_mode="trend")),
    ]
    MECHS = [("集中回避(1銘柄まで)", {"max_same_driver": 1}),
             ("集中回避(2銘柄まで)", {"max_same_driver": 2}),
             ("牽引役の順張り",      {"driver_trend": True}),
             ("β調整サイズ",        {"beta_size": True})]

    results, tally = [], {name: {"win": 0, "n": 0, "cagr": [], "calmar": []} for name, _ in MECHS}
    for bname, b in BASES:
        try:
            base_r = _sim_pass(prep, all_dates, initial, **b)["result"]
        except Exception as e:
            print("verify base failed:", bname, e)
            continue
        base_calmar = (base_r["cagrPct"] / abs(base_r["maxDrawdownPct"])) if base_r["maxDrawdownPct"] else 0
        row = {"base": bname, "baseCagr": base_r["cagrPct"], "baseDd": base_r["maxDrawdownPct"],
               "baseCalmar": round(base_calmar, 2), "mechs": []}
        for mname, extra in MECHS:
            try:
                r = _sim_pass(prep, all_dates, initial, **b, **extra)["result"]
            except Exception as e:
                print("verify mech failed:", bname, mname, e)
                continue
            cal = (r["cagrPct"] / abs(r["maxDrawdownPct"])) if r["maxDrawdownPct"] else 0
            dc, dcal = round(r["cagrPct"] - base_r["cagrPct"], 2), round(cal - base_calmar, 3)
            win = dcal > 0.01
            tally[mname]["n"] += 1
            tally[mname]["win"] += 1 if win else 0
            tally[mname]["cagr"].append(dc)
            tally[mname]["calmar"].append(dcal)
            tally[mname].setdefault("wonIn", []).append(bname if win else None)
            tally[mname].setdefault("maxPos", []).append((b["max_pos"], win))
            row["mechs"].append({"name": mname, "cagrPct": r["cagrPct"],
                                 "maxDrawdownPct": r["maxDrawdownPct"], "calmar": round(cal, 2),
                                 "cagrDiff": dc, "ddDiff": round(r["maxDrawdownPct"] - base_r["maxDrawdownPct"], 1),
                                 "calmarDiff": dcal, "win": win})
        results.append(row)

    summary = []
    for mname, extra in MECHS:
        t = tally[mname]
        if not t["n"]:
            continue
        avg_c = round(sum(t["cagr"]) / t["n"], 2)
        avg_cal = round(sum(t["calmar"]) / t["n"], 3)
        # 全部の設定で効いて初めて「本物」。半分以下なら偶然として退ける
        verdict = ("本物(すべての設定で改善)" if t["win"] == t["n"] else
                   "たぶん本物(大半で改善)" if t["win"] >= t["n"] - 1 and t["win"] > t["n"] / 2 else
                   "偶然の可能性が高い" if t["win"] > 0 else "効かない")
        # 保有数で効き方が分かれていないかを見る(条件つきで効く仕組みを見逃さないため)
        won = [mp for mp, w in t.get("maxPos", []) if w]
        lost = [mp for mp, w in t.get("maxPos", []) if not w]
        # 勝ちが1点だけだと、それが端にあるだけで「きれいに分かれている」ように見える。
        # 規則性と呼ぶには最低2点が同じ側で勝っている必要がある
        split = bool(len(set(won)) >= 2 and lost and min(won) > max(lost))
        summary.append({"name": mname, "wins": t["win"], "of": t["n"], "avgCagrDiff": avg_c,
                        "avgCalmarDiff": avg_cal, "verdict": verdict,
                        "robust": t["win"] == t["n"], "config": extra,
                        "wonIn": [x for x in t.get("wonIn", []) if x],
                        "wonPos": sorted(set(won)), "lostPos": sorted(set(lost)),
                        "posSplit": split,
                        "posNote": (f"同時保有{min(won)}銘柄以上でのみ効いています"
                                    f"(効いた={sorted(set(won))} / 効かない={sorted(set(lost))})"
                                    if split else "")})
    summary.sort(key=lambda x: (-x["wins"], -x["avgCalmarDiff"]))

    best = next((s for s in summary if s["robust"]), None)
    return {"bases": results, "summary": summary, "recommended": best,
            "tickers": len(prep), "universe": len(tickers),
            "requested": min(len(tickers), int(os.environ.get("CORR_TICKERS", "400"))),
            "period": {"years": years, "days": len(all_dates)},
            "conditional": [s for s in summary if not s["robust"] and s["posSplit"]],
            "verdict": (f"「{best['name']}」は{best['of']}種類すべての設定で効率が改善しました。"
                        f"設定を変えても効くので、本物の優位性と判断できます"
                        f"(平均で年利{best['avgCagrDiff']:+}ポイント)。"
                        if best else
                        "どの仕組みも「すべての設定で改善」を満たしませんでした。"
                        "1つの設定でだけ効いたものは偶然の可能性が高いので、採用は見送るべきです。"),
            "updatedAt": datetime.now(timezone.utc).isoformat()}


def compare_correlation(tickers=None, years=25, initial=1000000, base=None):
    """連動性(相関)を売買判断に使うと本当に成績が上がるのかを、過去25年で測る。
    今の設定を基準に、仕組みを1つずつ足して比べる。効かなかったものは採用しない。"""
    # 候補が少ないと「弾いた枠を別の銘柄で埋める」ができず、集中回避を過小評価してしまう
    # 全ユニバースを対象にする。時間内に終わらなかったぶんは結果に件数を出す
    tickers = tickers or FULL_UNIVERSE
    prep = _prepare_sim(tickers, years, limit=int(os.environ.get("CORR_TICKERS", "400")))
    if not prep:
        raise Exception("シミュレーション用のデータが取得できません")
    all_dates = sorted({d for v in prep.values() for d in v["dates"]})[200:]
    linked = len([t for t, v in prep.items() if v.get("drivenBy")])

    cfg = autotrade_config()
    b = base or {"entry_score": int(cfg.get("entryScore", 70)), "rr": float(cfg.get("rr", 3.0)),
                 "max_pos": int(cfg.get("maxPositions", 8)), "risk_pct": float(cfg.get("riskPct", 2.0)),
                 "partial": bool(cfg.get("partial", True)),
                 "trail": float(cfg.get("trailPct", 0) or 0) / 100,
                 "hold_mode": cfg.get("holdMode", "trade")}

    variants = [
        ("今のまま(基準)", {}),
        ("＋集中回避(同じ牽引役は2銘柄まで)", {"max_same_driver": 2}),
        ("＋集中回避(同じ牽引役は1銘柄まで)", {"max_same_driver": 1}),
        ("＋牽引役の順張り", {"driver_trend": True}),
        ("＋β調整サイズ", {"beta_size": True}),
        ("全部入り", {"max_same_driver": 2, "driver_trend": True, "beta_size": True}),
    ]
    rows = []
    for label, extra in variants:
        try:
            r = _sim_pass(prep, all_dates, initial, **b, **extra)["result"]
            calmar = (r["cagrPct"] / abs(r["maxDrawdownPct"])) if r["maxDrawdownPct"] else 0
            rows.append({"label": label, **extra,
                         **{k: r[k] for k in ("cagrPct", "maxDrawdownPct", "sharpe", "trades",
                                              "winRate", "profitFactor", "maxLossStreak",
                                              "finalEquity", "totalReturnPct")},
                         "calmar": round(calmar, 2)})
        except Exception as e:
            print("compare variant failed:", label, e)

    if not rows:
        raise Exception("検証に失敗しました")
    base_row = rows[0]
    for r in rows:
        r["cagrDiff"] = round(r["cagrPct"] - base_row["cagrPct"], 2)
        r["ddDiff"] = round(r["maxDrawdownPct"] - base_row["maxDrawdownPct"], 1)
        r["calmarDiff"] = round(r["calmar"] - base_row["calmar"], 2)
        # 取引が激減していたら「別の銘柄に入れ替えた」のではなく「買わずに見送った」だけ。
        # 候補が足りていないサインなので、結論を出す前に確認できるようにする
        r["tradesDiff"] = r["trades"] - base_row["trades"]
        r["tradeKeepPct"] = round(r["trades"] / base_row["trades"] * 100) if base_row["trades"] else 0
        # 採用の可否は「効率(年利÷最大下落)が上がったか」で決める。
        # 下落だけ浅くなってもリターンをそれ以上削っていたら、採用する理由はない
        up_c, up_d = r["cagrDiff"] > 0.1, r["ddDiff"] > 1.0
        if up_c and up_d:
            r["helped"], r["grade"] = True, "★効いた(両方改善)"
        elif r["calmarDiff"] > 0.02:
            r["helped"], r["grade"] = True, "★効いた"
        elif up_d and r["cagrDiff"] < -0.1:
            r["helped"], r["grade"] = False, "下落は浅いがリターン減"
        elif up_d:
            r["helped"], r["grade"] = False, "下落だけ浅い"
        else:
            r["helped"], r["grade"] = False, "効果なし"

    winner = max(rows, key=lambda r: r["calmar"])
    improved = winner["label"] != base_row["label"] and winner["calmar"] > base_row["calmar"]
    return {"rows": rows, "base": base_row, "winner": winner, "improved": improved,
            "baseSettings": b, "linkedTickers": linked, "tickers": len(prep),
            "requested": min(len(tickers), int(os.environ.get("CORR_TICKERS", "400"))),
            "universe": len(tickers),
            "period": {"years": years, "days": len(all_dates)},
            "verdict": (f"「{winner['label']}」が最も効率が良く、"
                        f"年利{winner['cagrDiff']:+}ポイント・最大下落{winner['ddDiff']:+}ポイントでした。"
                        if improved else
                        "どの仕組みも基準を上回りませんでした。相関は表示だけに留め、"
                        "売買条件には入れないのが正解です。"),
            "updatedAt": datetime.now(timezone.utc).isoformat()}


def recommend_config(max_dd=-35.0, allow_leverage=False, min_trades=30):
    """検証結果から実運用に適した設定を選ぶ。
    単純な年利1位は「たまたま当たった条件」の可能性が高いため、
    近傍の条件(1項目だけ違う設定)も good かどうかで安定性を評価する。
    さらに追証リスク(信用取引)と、耐えられる下落幅で足切りする。"""
    grid = _load_json_s3("stock-learn/optimize.json", None)
    if not grid or not grid.get("combos"):
        raise Exception("先に条件の比較(optimize)を実行してください")
    rows = grid["combos"]
    key = lambda r: (r["entryScore"], r["rr"], r["maxPositions"], r["riskPct"],
                     r.get("leverage", 1.0), r.get("method", "標準"))
    by_key = {key(r): r for r in rows}
    ENTRY = sorted({r["entryScore"] for r in rows})
    RR = sorted({r["rr"] for r in rows})
    MP = sorted({r["maxPositions"] for r in rows})
    RISK = sorted({r["riskPct"] for r in rows})

    def neighbors(r):
        """1項目だけ1段階ずらした設定(周辺の安定性を見るため)"""
        out = []
        for lst, idx in ((ENTRY, 0), (RR, 1), (MP, 2), (RISK, 3)):
            cur = key(r)
            try:
                pos = lst.index(cur[idx])
            except ValueError:
                continue
            for d in (-1, 1):
                if 0 <= pos + d < len(lst):
                    k = list(cur)
                    k[idx] = lst[pos + d]
                    n = by_key.get(tuple(k))
                    if n:
                        out.append(n)
        return out

    cands = [r for r in rows
             if (allow_leverage or r.get("leverage", 1.0) == 1.0)
             and r["maxDrawdownPct"] >= max_dd
             and r["trades"] >= min_trades
             and r["cagrPct"] > 0]
    scored = []
    for r in cands:
        nb = neighbors(r)
        if len(nb) < 3:
            continue
        nb_cagr = sum(x["cagrPct"] for x in nb) / len(nb)
        nb_dd = sum(x["maxDrawdownPct"] for x in nb) / len(nb)
        # 周辺も良い設定を高く評価し、突出しすぎ(まぐれ)は割り引く
        gap = r["cagrPct"] - nb_cagr
        robust = min(r["cagrPct"], nb_cagr * 1.15)
        stability = 1.0 if gap <= 0 else max(0.55, 1 - gap / max(1.0, r["cagrPct"]))
        score = robust * stability / max(1.0, abs(nb_dd) / 20)
        scored.append({**r, "neighborCagr": round(nb_cagr, 2), "neighborDd": round(nb_dd, 1),
                       "robustCagr": round(robust, 2), "stability": round(stability, 2),
                       "score": round(score, 3), "neighbors": len(nb)})
    if not scored:
        raise Exception("条件を満たす設定が見つかりません(下落許容を広げてください)")
    scored.sort(key=lambda x: -x["score"])
    best = scored[0]
    peak = max(cands, key=lambda r: r["cagrPct"])
    return {
        "recommended": best, "runnerUps": scored[1:4],
        "peakCagr": peak,
        "criteria": {"maxDrawdown": max_dd, "allowLeverage": allow_leverage,
                     "minTrades": min_trades, "candidates": len(cands)},
        "reason": (f"年利{best['cagrPct']}%(周辺条件の平均{best['neighborCagr']}%)。"
                   f"周辺{best['neighbors']}条件も同水準なので、たまたま当たった設定ではなく安定した領域です。"
                   f"最大下落{best['maxDrawdownPct']}%は許容範囲({max_dd}%)内。"
                   + ("信用取引を使わないので追証で強制決済される心配がありません。"
                      if best.get("leverage", 1) == 1 else "")),
        "updatedAt": datetime.now(timezone.utc).isoformat()}


#  maxDd = そのタイプで許容する最大下落。conv = 買いに必要な確信度(低いほど機会が増える)
TRADE_MODES = {
    "safe":       {"label": "安定型",     "maxDd": -20, "conv": 4},
    "balanced":   {"label": "バランス型", "maxDd": -30, "conv": 3},
    "aggressive": {"label": "積極型",     "maxDd": -45, "conv": 2},
    "max":        {"label": "最大攻撃型", "maxDd": -70, "conv": 2},
}


def _row_to_autotrade(row):
    """検証結果の1行を、自動売買が実際に使える設定に翻訳する。
    デモ口座は現物のみ(信用取引の建玉を持てない)ので、
    レバレッジ付きの条件は同条件の現物版に置き換える。"""
    trail = float(row.get("trail", 0) or 0)
    return {"riskPct": float(row["riskPct"]), "maxPositions": int(row["maxPositions"]),
            "entryScore": int(row["entryScore"]), "rr": float(row["rr"]),
            "partial": bool(row.get("partial", False)),
            "trailPct": round(trail * 100, 1),
            "holdMode": row.get("hold_mode", "trade"), "oddLot": True}


def apply_trade_mode(mode="aggressive", enable=True):
    """運用タイプ(安定/バランス/積極/最大攻撃)を選ぶと、
    25年検証でその枠内で最も年利が高かった条件を自動売買に流し込む。
    以降は検証が回るたびに自動で最新の最適値へ追従する(autoTune)。"""
    mode = mode if mode in TRADE_MODES else "aggressive"
    grid = _load_json_s3("stock-learn/optimize.json", None)
    if not grid or not grid.get("combos"):
        raise Exception("先に条件の比較(optimize)を実行してください")
    rows = grid["combos"]
    # 運用タイプの許容下落と、ユーザーが耐えられる下落の厳しいほうを使う。
    # これが無いと「最大攻撃型」を選んでいる限り、再検証のたびに
    # 際限なく過激な設定へ自動で載せ替わってしまう
    user_limit = float((_load_json_s3(AUTO_KEY, {}) or {}).get("ddLimit", -45))
    limit = max(TRADE_MODES[mode]["maxDd"], user_limit)
    # 取引が少なすぎる条件は「たまたま」なので採用しない
    pool = [r for r in rows if r["trades"] >= 30 and r["maxDrawdownPct"] >= limit]
    if not pool:
        pool = [r for r in rows if r["trades"] >= 20]
    if not pool:
        raise Exception("採用できる条件がありません")

    swapped = None
    best = max(pool, key=lambda r: r["cagrPct"])
    if best.get("leverage", 1.0) > 1.0:
        # 同じ条件の現物版(レバレッジ1倍)を探して差し替える
        same = [r for r in rows
                if r.get("leverage", 1.0) == 1.0 and r["entryScore"] == best["entryScore"]
                and r["rr"] == best["rr"] and r["maxPositions"] == best["maxPositions"]
                and r["riskPct"] == best["riskPct"] and r.get("method") == best.get("method")]
        cash = [r for r in pool if r.get("leverage", 1.0) == 1.0]
        alt = same[0] if same else (max(cash, key=lambda r: r["cagrPct"]) if cash else None)
        if alt:
            swapped = {"from": best, "to": alt}
            best = alt

    upd = _row_to_autotrade(best)
    upd["enabled"] = bool(enable)
    upd["minConviction"] = TRADE_MODES[mode]["conv"]
    cfg = autotrade_config(upd)
    cfg["tradeMode"] = mode
    cfg["autoTune"] = True          # 検証が更新されるたびに自動で追従する
    cfg["appliedFrom"] = {k: best.get(k) for k in
                          ("entryScore", "rr", "maxPositions", "riskPct", "method",
                           "cagrPct", "maxDrawdownPct", "winRate", "profitFactor", "trades")}
    cfg["appliedAt"] = datetime.now(timezone.utc).isoformat()
    _save_json_s3(AUTO_KEY, cfg)

    note = (f"{TRADE_MODES[mode]['label']}を適用しました。"
            f"検証では年利{best['cagrPct']}% / 最大下落{best['maxDrawdownPct']}% / "
            f"勝率{best['winRate']}%の条件です。")
    if user_limit > TRADE_MODES[mode]["maxDd"]:
        note += (f"(耐えられる下落の設定が{user_limit}%なので、"
                 f"{TRADE_MODES[mode]['label']}本来の範囲より安全側に寄せています)")
    if swapped:
        note += (f"(年利{swapped['from']['cagrPct']}%の条件は信用{swapped['from'].get('leverage')}倍が前提でした。"
                 "デモ口座は現物のみなので、同じ考え方の現物版に置き換えています)")
    return {"config": cfg, "mode": mode, "label": TRADE_MODES[mode]["label"],
            "applied": best, "swappedFromLeverage": swapped, "note": note}


def _max_streak(trades):
    """最大連敗数(何連敗まで耐える必要があったか)"""
    worst = cur = 0
    for t in trades:
        cur = cur + 1 if t["pnl"] <= 0 else 0
        worst = max(worst, cur)
    return worst


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

# 連動性(相関)の検証用。集中回避は「弾いた枠を別の銘柄で埋められるか」で価値が決まるため、
# 候補が少ないと入れ替えではなく単なる機会損失になり、正しく評価できない。
# 業種と連動先(半導体/資源/金融/内需/ヘルスケア等)を意図的に散らしてある。
CORR_UNIVERSE = [
    # 日本: 半導体・電子
    "6501.T", "6503.T", "6594.T", "6758.T", "6857.T", "6920.T", "6981.T", "8035.T", "4063.T", "4062.T",
    # 日本: 自動車・機械
    "7203.T", "7267.T", "7011.T", "6301.T", "6367.T", "6273.T",
    # 日本: 金融・不動産
    "8306.T", "8316.T", "8411.T", "8766.T", "8801.T", "8802.T",
    # 日本: 資源・素材・エネルギー
    "5401.T", "5019.T", "5020.T", "8058.T", "8001.T", "4005.T",
    # 日本: 内需・通信・小売・医薬
    "9433.T", "9432.T", "9983.T", "3382.T", "4502.T", "4503.T", "2914.T", "4661.T", "9020.T", "7974.T",
    # 米国: 半導体・IT
    "NVDA", "AMD", "AVGO", "AMAT", "LRCX", "MU", "AAPL", "MSFT", "GOOGL", "ORCL",
    # 米国: 金融・エネルギー・資源
    "JPM", "BAC", "GS", "XOM", "CVX", "SLB", "FCX", "NEM",
    # 米国: 生活必需品・ヘルスケア・公益・小売
    "JNJ", "PFE", "UNH", "PG", "KO", "WMT", "COST", "SO", "DUK", "AMZN",
]


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

    # trainで重み学習(対指数超過リターンとのICベース+直近重視の指数重み)
    weights, ics = derive_weights([{"factors": s["factors"], "ret": s["ex20"], "date": s["date"]} for s in train])

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

    # 時代別成績(5年区切り・全期間の素点買いシグナル+地合いフィルタ):
    # どの相場環境でも通用する因子構成かを確認する(長期学習の安定性チェック)
    by_era = {}
    for s in samples:
        if s["score"] >= 70 and s["regime"]:
            y = int(s["date"][:4])
            era = f"{y - y % 5}〜{y - y % 5 + 4}"
            e = by_era.setdefault(era, {"n": 0, "win": 0, "sum": 0.0})
            e["n"] += 1
            e["win"] += 1 if s["fwd20"] > 0 else 0
            e["sum"] += s["fwd20"]
    report["byEra"] = {k: {"n": v["n"], "winRate": round(v["win"] / v["n"] * 100, 1),
                           "avgRet": round(v["sum"] / v["n"], 2)}
                       for k, v in sorted(by_era.items()) if v["n"] >= 10}

    if apply_weights:  # 検証済み重みを本番スコアリングに反映
        cfg = load_learn_config()
        cfg.update({"factor_weights": weights, "factor_ic": ics,
                    "backtestSamples": len(samples), "backtestYears": years,
                    "backtestUpdatedAt": datetime.now(timezone.utc).isoformat(),
                    "backtest_report": report,
                    "updatedAt": datetime.now(timezone.utc).isoformat()})
        _save_json_s3(CONFIG_KEY, cfg)
    return report


FACTOR_CATS = ["トレンド", "モメンタム", "出来高", "価格位置", "相対力"]


def derive_weights(samples, half_life_years=5.0):
    """因子スコアと将来リターンの相関(IC)から重みを算出。
    IC正=予測に効く因子→重み増、IC負=逆効果→重み減。0.5〜1.5にクリップ。
    サンプルにdateがあれば半減期5年の指数重みで直近の市場環境を重視
    (10年超の長期学習でも、古い相場に引きずられて今効かない因子を過大評価しない)。"""
    now = datetime.now(timezone.utc)

    def recency(s):
        d = s.get("date")
        if not d:
            return 1.0
        try:
            age = (now - datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=timezone.utc)).days / 365.25
            return 0.5 ** (age / half_life_years)
        except Exception:
            return 1.0

    weights, ics = {}, {}
    for c in FACTOR_CATS:
        trip = [(s["factors"][c], s["ret"], recency(s)) for s in samples
                if c in s.get("factors", {}) and s.get("ret") is not None]
        ic = _pearson_w([t[0] for t in trip], [t[1] for t in trip], [t[2] for t in trip]) if len(trip) >= 30 else 0.0
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
        raw = bedrock_invoke([{"role": "user", "content": prompt}], max_tokens=800)
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
    # ランキング上位も学習対象に加えて母数を確保(ウォッチリストだけだと偏るため)
    try:
        rk = cache_get("ranking.json", 24 * 3600) or {}
        top = [r["ticker"] for r in sorted(rk.get("rows", []), key=lambda x: -x.get("short", 0))[:10]]
        tickers = list(dict.fromkeys(list(tickers) + top))[:16]
    except Exception:
        pass
    # 直近重視の重み(半減期5年)が効くので期間は長めに取る
    bt = [{"factors": s["factors"], "ret": s["ex20"], "date": s["date"]}
          for s in backtest_universe(tickers, years=int(os.environ.get("LEARN_YEARS", "25")))]
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
7. 長期の質は「EPSが複数年伸び続けているか」「ROE10%以上を安定維持しているか」を最重視する
   (EPS=1株あたり利益こそ投資家の実質的な取り分。増資による希薄化・自社株買いの効果も織り込まれる)
8. エントリー提案は必ずリスクリワード比(利確幅÷損切り幅)が2倍以上になる価格設計にする。
   2倍を確保できない位置なら、買い判定にせず「押し目待ち」または「見送り」とする(勝率4割でも資産が増えるライン)
9. プロ手法チェックリスト(ミネルヴィニのトレンドテンプレート/オニールCAN-SLIM/乖離率)が与えられた場合は
   合格状況を判定根拠に織り込む。特にトレンドテンプレート不合格の銘柄への強気判定は慎重に

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

    # 何に連動して動く銘柄かを渡す(ニュースの材料がこの銘柄に効くかの判断に使う)
    link_text = ""
    db = analysis.get("drivenBy")
    if db:
        link_text = (f"\n【連動性(過去120日の実測)】{db['label']}に対してβ{db['beta']}・相関{db['corr']}。"
                     f"{db['label']}が1%動くとこの銘柄は平均{db['beta']}%動く傾向。")
        others = [f"{k}β{v}" for k, v in (analysis.get("beta") or {}).items()
                  if k != db["key"] and abs((analysis.get("corr") or {}).get(k, 0)) >= 0.3]
        if others:
            link_text += " 他: " + " / ".join(others[:4])

    user_prompt = f"""以下の銘柄を分析してください。

【銘柄】{analysis['name']} ({ticker}) / {analysis.get('sectorJa') or analysis.get('sector') or '業種不明'} / {analysis['market']}市場{link_text}
【現在値】{analysis['price']} {analysis['currency']} (前日比{analysis['chg1d']}%) / 52週レンジ {analysis['lo52']}〜{analysis['hi52']} / ATR(14) {analysis['atr']} / RSI {analysis['rsi']}

【地合い】{market['moodLabel']}
{idx_text}

【短期テクニカルスコア {analysis['short']['score']}/100】
{short_text}

【長期ファンダスコア {analysis['long']['score']}/100】
{long_text}

【直近ニュース】
{news_text}"""

    pc = analysis.get("proChecklist")
    if pc and pc.get("items"):
        user_prompt += f"\n\n【プロ手法チェックリスト(合格{pc['passed']}/{pc['total']})】\n" + "\n".join(
            f"- [{'○' if i['pass'] else ('×' if i['pass'] is False else '?')}] {i['group']}/{i['name']}: {i['detail']}"
            for i in pc["items"])

    fin = analysis.get("finHistory") or {}
    if fin.get("years"):
        if any(e is not None for e in fin.get("eps", [])):
            user_prompt += "\n\n【EPS推移(年次)】" + " → ".join(
                f"{y}年:{e if e is not None else '?'}" for y, e in zip(fin["years"], fin["eps"]))
        if any(r is not None for r in fin.get("roe", [])):
            user_prompt += "\n【ROE推移(年次)】" + " → ".join(
                f"{y}年:{str(r)+'%' if r is not None else '?'}" for y, r in zip(fin["years"], fin["roe"]))

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

    raw = bedrock_invoke([{"role": "user", "content": user_prompt}],
                         system=BRAIN_SYSTEM, max_tokens=1500)
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


# ═══════════════════════ 拡張ユニバース(日経225相当 + 米国主要) ═══════════════════════
# 銘柄名はinfo取得時に自動で埋まるためコードのみ保持(構成銘柄の入れ替えに強い)
UNIVERSE_JP = """1332 1605 1721 1801 1802 1803 1808 1812 1925 1928 1963 2002 2269 2282 2413 2432
2501 2502 2503 2531 2768 2801 2802 2871 2914 3086 3099 3101 3103 3105 3289 3382 3401 3402 3405 3407
3436 3659 3861 3863 4004 4005 4021 4042 4043 4061 4063 4151 4183 4188 4208 4324 4452 4502 4503 4506
4507 4519 4523 4528 4543 4544 4568 4578 4661 4689 4704 4751 4755 4901 4902 4911 5019 5020 5101 5108
5201 5202 5214 5233 5301 5332 5333 5401 5406 5411 5541 5631 5706 5711 5713 5714 5801 5802 5803 5831
6098 6103 6113 6146 6178 6273 6301 6302 6305 6326 6361 6367 6471 6472 6473 6479 6501 6503 6504 6506
6526 6532 6594 6645 6674 6701 6702 6723 6724 6752 6753 6758 6762 6770 6841 6857 6861 6902 6920 6923
6952 6954 6963 6971 6976 6981 6988 7003 7011 7012 7013 7186 7201 7202 7203 7205 7211 7261 7267 7269
7270 7272 7731 7733 7735 7741 7751 7752 7762 7832 7911 7912 7951 7974 7984 8001 8002 8015 8031 8035
8053 8058 8113 8233 8252 8253 8267 8304 8306 8308 8309 8316 8331 8354 8411 8570 8591 8601 8604 8630
8697 8725 8750 8766 8795 8801 8802 8804 8830 9001 9005 9007 9008 9009 9020 9021 9022 9064 9101 9104
9107 9147 9201 9202 9301 9432 9433 9434 9501 9502 9503 9531 9532 9602 9613 9735 9766 9843 9983 9984""".split()

UNIVERSE_US = """AAPL MSFT GOOGL AMZN NVDA META TSLA BRK-B JPM V MA UNH XOM JNJ WMT PG HD CVX LLY
ABBV AVGO MRK PEP KO COST ADBE CSCO TMO MCD ACN ABT CRM DHR NFLX LIN VZ TXN NKE WFC DIS PM NEE RTX
BMY UPS ORCL QCOM HON AMD INTC T CAT LOW IBM GS BA SBUX INTU ELV DE PLD AMGN MDT GILD ADP ISRG BLK
MDLZ SPGI TJX VRTX SYK CVS MMC CI ZTS AXP C MO SCHW PGR BDX SO DUK CB ETN EOG ITW MU APD SLB BSX AON
NOC CSX CL PNC USB LRCX KLAC ADI PANW SNPS CDNS MRVL FTNT ORLY MCK HCA PSX MPC VLO WM EMR GD TGT F
GM DAL UAL ABNB UBER PYPL SHOP SPOT COIN PLTR SNOW DDOG NET CRWD ZS TEAM WDAY NOW DELL HPQ STX WDC
ON SWKS TER AMAT ASML TSM ARM SMCI ANET MSI GLW APH TEL KEYS ROK PH CMI PCAR FDX NSC UNP ODFL EXPD
LMT LHX TDG HWM TXT LDOS PWR TT CARR JCI LII FAST GWW POOL MMM KHC GIS K SYY KR DG DLTR ROST BBY
EBAY ETSY LULU YUM CMG DPZ MAR HLT RCL CCL LVS WYNN MGM""".split()

# 中型株まで拡張(TOPIX Mid400相当 + 米国中大型)
UNIVERSE_JP2 = """1333 1414 1515 1719 1720 1780 1820 1821 1860 1878 1911 1919 1934 1944 1949 1951
1959 1961 1964 1967 1969 1972 1973 1979 2001 2003 2004 2058 2124 2127 2138 2148 2153 2181 2196 2201
2206 2212 2229 2264 2267 2270 2281 2286 2296 2337 2371 2372 2379 2384 2393 2395 2402 2412 2427 2429
2440 2453 2461 2462 2464 2471 2475 2483 2492 2497 2498 2531 2533 2540 2579 2587 2593 2597 2607
2651 2670 2685 2695 2702 2715 2726 2729 2730 2735 2749 2751 2760 2782 2784 2792 2796 2797 2801 2810
2811 2815 2830 2871 2875 2882 2884 2897 2899 2903 2908 2910 2915 2917 2929 2931 3038 3048 3050 3064
3076 3082 3088 3091 3092 3093 3105 3132 3134 3141 3148 3150 3151 3167 3168 3179 3186 3193 3197 3222
3231 3244 3252 3254 3258 3271 3276 3283 3291 3292 3294 3299 3300 3315 3319 3323 3328 3341 3350 3355
3360 3374 3377 3387 3391 3395 3397 3400 3402 3416 3421 3423 3433 3441 3443 3445 3447 3457 3465 3475
3480 3482 3489 3491 3497 3498 3543 3546 3549 3550 3563 3566 3569 3577 3591 3593 3597 3608 3612 3625
3626 3627 3635 3639 3641 3648 3652 3656 3663 3665 3668 3669 3672 3673 3675 3676 3678 3680 3681 3684
3687 3688 3689 3691 3694 3697 3701 3708 3712 3715 3719 3723 3724 3739 3744 3760 3765 3769 3774 3778
3782 3787 3788 3798 3800 3814 3823 3825 3830 3836 3837 3839 3842 3844 3847 3853 3854 3856 3857 3858
3859 3902 3903 3904 3906 3908 3909 3914 3915 3922 3923 3925 3926 3928 3932 3934 3936 3937 3939 3940
3941 3949 3962 3966 3968 3969 3975 3976 3978 3981 3983 3985 3987 3988 3990 3991 3992 3994 3996 3997
3998 3999 4004 4005 4008 4021 4023 4025 4028 4041 4046 4047 4088 4091 4092 4095 4098 4099 4100 4109
4114 4118 4123 4124 4128 4151 4165 4176 4180 4185 4186 4187 4188 4189 4192 4194 4196 4197 4198 4200""".split()

UNIVERSE_US2 = """ADSK APP ARES AXON BKNG BX CEG CHTR CMCSA COF COP CTAS CTSH DASH DXCM ECL EFX EL
EW EXC FANG FCX FI FIS FITB GEHC GEV GIS HAL HES HIG HPE HSY HUM IDXX ILMN INCY IP IQV IR IRM ITT
IVZ JBHT JKHY KDP KEY KIM KMB KMI KMX KO L LEN LH LKQ LNT LUV LVS LW MAA MAS MCHP MCO MDLZ MET MGM
MKC MLM MNST MOH MOS MPWR MRNA MTB MTCH NDAQ NEM NI NRG NTAP NTRS NUE NVR NWS O OKE OMC OTIS OXY
PAYX PCG PEG PFG PHM PKG PNR PPG PPL PRU PSA PTC RCL REG REGN RF RJF RMD ROL ROP RSG SBAC SJM SNA
SO SPG SRE STE STLD STT SWK SYF SYY TAP TDY TFC TRGP TRMB TROW TRV TSCO TSN TTWO TXT TYL UDR ULTA
URI VICI VMC VRSK VRSN VST VTR WAB WAT WBD WEC WELL WRB WST WTW WY XEL XYL YUM ZBH ZBRA ZION""".split()

FULL_UNIVERSE = ([f"{c}.T" for c in UNIVERSE_JP] + [f"{c}.T" for c in UNIVERSE_JP2]
                 + UNIVERSE_US + UNIVERSE_US2)
FULL_UNIVERSE = list(dict.fromkeys(FULL_UNIVERSE))


def fetch_bulk_ohlcv(tickers, days=450, chunk=80):
    """複数銘柄の日足を一括取得(yf.download)。1銘柄ずつのループより桁違いに速く、
    400銘柄超のユニバースでもLambdaのタイムアウト内で短期スコアを算出できる。"""
    import yfinance as yf
    from datetime import timedelta
    start = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    out = {}
    for i in range(0, len(tickers), chunk):
        part = tickers[i:i + chunk]
        try:
            data = yf.download(part, start=start, interval="1d", auto_adjust=True,
                               group_by="ticker", threads=True, progress=False)
        except Exception as e:
            print("bulk download failed:", part[:3], e)
            continue
        for t in part:
            try:
                df = (data[t] if len(part) > 1 else data).dropna()
                if len(df) >= 80:
                    out[t] = df
            except Exception:
                pass
    return out


# ═══════════════════ 資金の流れ・連動係数(β)・テーマ ═══════════════════
# 「戦争が起きたら何が上がるか」「半導体が上がるとどこが連動するか」に答えるための土台。
#
# 設計方針: テーマ辞書は「その出来事で何が動くか(=牽引役)」までしか人間が決めない。
#   「ではどの銘柄が連動するか」は、各銘柄のβ(実測値)に判断させる。
#   銘柄リストを手書きすると思い込みが混ざり、当たらなくなるため。
DRIVER_TICKERS = [
    ("^SOX",  "半導体(SOX指数)", "sox"),
    ("CL=F",  "原油(WTI)",       "oil"),
    ("GC=F",  "金",              "gold"),
    ("ITA",   "防衛(米ETF)",     "defense"),
    ("^TNX",  "米10年金利",      "rate"),
    ("JPY=X", "ドル円",          "fx"),
]
# 市場全体の動き。ほぼ全銘柄が連動するので「特徴」にはならず、テーマ判定からは外す
MARKET_DRIVERS = [("^N225", "日経平均", "n225"), ("^GSPC", "S&P500", "sp500")]

THEMES = {
    "有事・地政学": {
        "keywords": ["戦争", "侵攻", "空爆", "紛争", "ミサイル", "有事", "軍事", "制裁", "停戦",
                     "テロ", "衝突", "war", "invasion", "airstrike", "missile", "sanction",
                     "ceasefire", "conflict", "military"],
        "drivers": ["defense", "oil", "gold"],
        "note": "防衛・エネルギー・金が買われ、消費や旅行など平時に強い銘柄は売られやすい",
    },
    "インフレ・資源高": {
        "keywords": ["インフレ", "物価高", "原油高", "資源高", "商品市況", "利上げ", "CPI",
                     "inflation", "crude", "commodity", "rate hike"],
        "drivers": ["oil", "gold", "rate"],
        "note": "資源・エネルギーが強く、借金の多い成長株は金利上昇で弱くなりやすい",
    },
    "半導体・AI": {
        "keywords": ["半導体", "AI", "生成AI", "データセンター", "GPU", "エヌビディア",
                     "semiconductor", "nvidia", "chip", "data center"],
        "drivers": ["sox"],
        "note": "半導体指数(SOX)に連動する銘柄が動く。装置・素材・電子部品まで波及しやすい",
    },
    "円安・輸出": {
        "keywords": ["円安", "為替介入", "ドル円", "日銀", "金融緩和", "yen", "boj",
                     "intervention"],
        "drivers": ["fx"],
        "note": "輸出企業の採算が改善。逆に輸入・内需はコスト増で圧迫される",
    },
    "金利上昇": {
        "keywords": ["金利上昇", "長期金利", "利上げ", "国債利回り", "FRB", "利下げ",
                     "yield", "fed", "treasury"],
        "drivers": ["rate"],
        "note": "銀行・保険は利ざや改善で買われ、不動産や高PER株は売られやすい",
    },
}

SECTOR_JA = {
    "Technology": "情報技術", "Financial Services": "金融", "Healthcare": "ヘルスケア",
    "Consumer Cyclical": "一般消費財", "Industrials": "資本財・工業", "Energy": "エネルギー",
    "Communication Services": "通信・メディア", "Consumer Defensive": "生活必需品",
    "Basic Materials": "素材・化学", "Real Estate": "不動産", "Utilities": "公益",
}


def _ret_by_date(close, days=120):
    """日次リターン。市場ごとに休場日が違うので、日付をキーにして突き合わせられるようにする。
    (日本株と米国指数を比べるとき、そのままの索引では噛み合わないため)"""
    s = close.dropna()
    r = s.pct_change().dropna()
    try:
        r.index = [i.date() if hasattr(i, "date") else i for i in r.index]
    except Exception:
        pass
    return r.iloc[-days:]


def compute_driver_betas(frames, days=120, min_overlap=50):
    """各銘柄が「何に連動して動いているか」を実データから測る。
    β1.8 = その牽引役が1%動くと、この銘柄は平均1.8%動く傾向。
    相関(corr)は連動の確からしさ。βが大きくても相関が低ければ「たまたま」なので採用しない。"""
    drivers = {}
    for sym, label, key in DRIVER_TICKERS + MARKET_DRIVERS:
        try:
            r = _ret_by_date(fetch_history(sym, "300d")["Close"], days)
            if len(r) >= min_overlap:
                drivers[key] = {"label": label, "ret": r}
        except Exception as e:
            print("driver fetch failed:", sym, e)
    if not drivers:
        return {}, {}

    theme_keys = {k for _, _, k in DRIVER_TICKERS}
    out = {}
    for t, df in frames.items():
        try:
            rs = _ret_by_date(df["Close"], days)
            if len(rs) < min_overlap:
                continue
            beta, corr = {}, {}
            for key, d in drivers.items():
                a, b = rs.align(d["ret"], join="inner")
                if len(a) < min_overlap:
                    continue
                var = float(b.var())
                if not var or var <= 0:
                    continue
                bv, cv = float(a.cov(b)) / var, float(a.corr(b))
                if bv != bv or cv != cv:      # NaN(データ不足)は捨てる
                    continue
                beta[key] = round(bv, 2)
                corr[key] = round(cv, 2)
            if not beta:
                continue
            # 「この銘柄は何で動いているか」= 相関が最も強い牽引役(市場全体は除く)
            cands = [(k, v) for k, v in corr.items() if k in theme_keys and abs(v) >= 0.30]
            top = max(cands, key=lambda kv: abs(kv[1])) if cands else None
            out[t] = {"beta": beta, "corr": corr,
                      "drivenBy": ({"key": top[0], "label": drivers[top[0]]["label"],
                                    "beta": beta.get(top[0]), "corr": top[1]} if top else None)}
        except Exception:
            pass
    return out, {k: v["label"] for k, v in drivers.items()}


def sector_flow(rows):
    """業種ごとに資金がどちらへ向かっているかを集計する。
    プロが最初に見る「今どこが買われているか」を数字にしたもの。"""
    by = {}
    for r in rows:
        s = r.get("sector")
        if not s:
            continue
        g = by.setdefault(s, {"sector": s, "label": SECTOR_JA.get(s, s),
                              "n": 0, "d1": [], "d5": [], "d20": [], "buy": 0, "top": []})
        g["n"] += 1
        for k, src in (("d1", "chg1d"), ("d5", "chg5d"), ("d20", "chg20d")):
            if r.get(src) is not None:
                g[k].append(r[src])
        if r.get("shortSignal") == "buy":
            g["buy"] += 1
        g["top"].append(r)

    def avg(v):
        return round(sum(v) / len(v), 2) if v else None

    out = []
    for g in by.values():
        if g["n"] < 3:      # 銘柄数が少ない業種は平均が暴れるので除外
            continue
        best = sorted(g["top"], key=lambda r: -(r.get("short") or 0))[:3]
        out.append({"sector": g["sector"], "label": g["label"], "count": g["n"],
                    "chg1d": avg(g["d1"]), "chg5d": avg(g["d5"]), "chg20d": avg(g["d20"]),
                    "buyRatio": round(g["buy"] / g["n"] * 100),
                    "leaders": [{"ticker": r["ticker"], "name": r.get("name"),
                                 "short": r.get("short"), "chg5d": r.get("chg5d")} for r in best]})
    out.sort(key=lambda g: -(g["chg5d"] if g["chg5d"] is not None else -99))
    return out


def detect_themes(news_items):
    """市場ニュースの見出しから、今どのテーマが効いているかを拾う。"""
    text = " ".join((n.get("title") or "") for n in news_items).lower()
    hits = []
    for name, th in THEMES.items():
        words = [w for w in th["keywords"] if w.lower() in text]
        if words:
            hits.append({"theme": name, "score": len(words), "words": words[:5],
                         "drivers": th["drivers"], "note": th["note"]})
    hits.sort(key=lambda h: -h["score"])
    return hits


def market_flow(force=False):
    """資金の流れ(業種別) + 今効いているテーマ + テーマに連動する銘柄。
    テーマは辞書で「何が動くか」を決め、銘柄は各社のβ(実測)で選ぶので、
    「戦争だから防衛株」という思い込みではなく「実際にその動きに連動してきた銘柄」が出る。"""
    cached = cache_get("flow.json", 3 * 3600)
    if cached and not force:
        return cached

    rk = run_ranking(force=False)
    rows = rk.get("rows", [])
    # β・5日騰落を入れる前のキャッシュを掴むと中身が空になる。
    # 項目が欠けていたらランキングを作り直す(機能追加の直後に必ず起きるため)
    if rows and not any(r.get("chg5d") is not None and r.get("beta") for r in rows):
        print("ranking cache is stale (no beta/chg5d)")
        if force:
            rk = run_ranking(force=True)
            rows = rk.get("rows", [])
        else:
            _self_invoke("ranking")      # 裏で作り直して次回に間に合わせる
    news = get_market_news()
    themes = detect_themes(news.get("news", []))

    # 牽引役そのものの直近の値動き(テーマが本当に効いているかの裏取り)
    drivers = []
    for sym, label, key in DRIVER_TICKERS:
        try:
            c = fetch_history(sym, "120d")["Close"].dropna()
            drivers.append({"key": key, "label": label, "price": round(float(c.iloc[-1]), 2),
                            "chg1d": round((float(c.iloc[-1]) / float(c.iloc[-2]) - 1) * 100, 2)
                            if len(c) >= 2 else None,
                            "chg5d": round((float(c.iloc[-1]) / float(c.iloc[-6]) - 1) * 100, 2)
                            if len(c) >= 6 else None,
                            "chg20d": round((float(c.iloc[-1]) / float(c.iloc[-21]) - 1) * 100, 2)
                            if len(c) >= 21 else None})
        except Exception as e:
            print("driver quote failed:", sym, e)
    dmap = {d["key"]: d for d in drivers}

    # テーマごとに「その牽引役に最も連動してきた銘柄」を実測βから選ぶ
    for th in themes:
        live = [dmap[k] for k in th["drivers"] if k in dmap]
        th["driverMoves"] = live
        # 牽引役が実際に動いているか(5日で±1.5%以上)。動いていなければ話題だけの可能性
        th["confirmed"] = any(abs(d.get("chg5d") or 0) >= 1.5 for d in live)
        picks = []
        for r in rows:
            beta, corr = (r.get("beta") or {}), (r.get("corr") or {})
            best = None
            for k in th["drivers"]:
                if k in beta and abs(corr.get(k, 0)) >= 0.30:
                    # 連動の強さ = β × 相関。βだけ大きい「たまたま」を弾く
                    sc = abs(beta[k]) * abs(corr[k])
                    if not best or sc > best["strength"]:
                        best = {"key": k, "label": dmap.get(k, {}).get("label", k),
                                "beta": beta[k], "corr": corr[k], "strength": round(sc, 2)}
            if best:
                picks.append({"ticker": r["ticker"], "name": r.get("name") or r["ticker"],
                              "market": r.get("market"), "sector": SECTOR_JA.get(r.get("sector"), r.get("sector")),
                              "short": r.get("short"), "shortSignal": r.get("shortSignal"),
                              "chg5d": r.get("chg5d"), "quadrant": r.get("quadrant"), **best})
        picks.sort(key=lambda p: -p["strength"])
        th["stocks"] = picks[:8]

    _save_json_s3("stock-learn/flow_drivers.json", drivers)
    out = {"sectors": sector_flow(rows), "themes": themes, "drivers": drivers,
           "scanned": len(rows),
           "rankingAt": rk.get("updatedAt"),
           "betaCovered": len([r for r in rows if r.get("beta")]),
           "sectorCovered": len([r for r in rows if r.get("sector")]),
           "newsCount": len(news.get("news", [])),
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put("flow.json", out)
    return out


# ═══════════════════════ 全銘柄ランキング(短期/長期/狙い目) ═══════════════════════
def run_ranking(force=False, universe=None):
    """全ユニバース(日経225相当+米国主要=約400銘柄)を採点してランキング化。
    ① 株価は一括取得(yf.download)で全銘柄の短期スコアを高速算出
    ② 財務は重いので「短期上位＋ウォッチリスト」に絞り、24時間キャッシュを再利用
       (毎日走るので日を追うごとにカバー範囲が広がる)
    結果は6時間キャッシュ。毎朝のjob=rankingで温めておけば画面表示は即時。"""
    if not force:
        cached = cache_get("ranking.json", 6 * 3600)
        if cached:
            return cached

    start = time.time()
    BUDGET = int(os.environ.get("RANK_BUDGET", "700"))  # 秒。タイムアウト900秒に対する安全域
    cfg = load_learn_config()
    weights = cfg.get("factor_weights")
    tickers = universe or FULL_UNIVERSE

    # ── 指数(地合い・相対力の基準) ──
    bench = {}
    for sym, key in (("^N225", "JP"), ("^GSPC", "US")):
        try:
            b = fetch_history(sym, "300d")["Close"]
            bench[key] = ((float(b.iloc[-1]) / float(b.iloc[-21]) - 1) * 100 if len(b) >= 21 else 0,
                          float(b.iloc[-1]) > float(b.rolling(200).mean().iloc[-1]) if len(b) >= 200 else True)
        except Exception:
            bench[key] = (0, True)

    # ── ① 全銘柄の株価を一括取得 → 短期スコア ──
    frames = fetch_bulk_ohlcv(tickers)
    rows, errors = [], 0
    for ticker, df in frames.items():
        mkt = "JP" if ticker.endswith(".T") else "US"
        try:
            f = build_indicator_frame(df)
            tech = _row_to_tech(f, len(f) - 1)
            b_ret, b_regime = bench[mkt]
            sc = score_short(tech, b_ret, weights)
            if not b_regime and sc["signal"] == "buy":
                sc["signal"] = "watch"
            c = df["Close"].dropna()
            chg5 = round((float(c.iloc[-1]) / float(c.iloc[-6]) - 1) * 100, 2) if len(c) >= 6 else None
            chg20 = round((float(c.iloc[-1]) / float(c.iloc[-21]) - 1) * 100, 2) if len(c) >= 21 else None
            rows.append({
                "ticker": ticker, "name": ticker, "market": mkt,
                "price": round(tech["price"], 2), "chg1d": round(tech["chg1d"], 2),
                "chg5d": chg5, "chg20d": chg20,
                "short": sc["score"], "shortSignal": sc["signal"],
                "shortReasons": [b["reason"] for b in sorted(
                    sc["breakdown"], key=lambda x: -(x["points"] / x["max"] if x["max"] else 0))[:2]],
                "regimeOn": bool(b_regime)})
        except Exception as e:
            errors += 1
            print("ranking short failed:", ticker, e)

    # ── ①' 連動係数(β): 何に引っ張られて動く銘柄かを実測する ──
    # 株価は取得済みなので追加のダウンロードは牽引役の数本だけで済む
    try:
        betas, driver_labels = compute_driver_betas(frames)
        for r in rows:
            b = betas.get(r["ticker"])
            if b:
                r.update({"beta": b["beta"], "corr": b["corr"], "drivenBy": b["drivenBy"]})
    except Exception as e:
        print("beta calc failed:", e)

    # ── ② 財務: ウォッチリスト + 短期上位 + キャッシュ済みを優先して長期スコア ──
    wl = {w["ticker"] for w in _load_json_s3(WATCHLIST_KEY, [])}
    by_ticker = {r["ticker"]: r for r in rows}
    # 前回の続きから回すことで、日を追うごとに全銘柄の財務が揃う
    done_before = set((_load_json_s3("stock-learn/fin_progress.json", {}) or {}).get("done", []))
    ranked = [r["ticker"] for r in sorted(rows, key=lambda x: -x["short"])]
    order = ([t for t in wl if t in by_ticker]
             + [t for t in ranked if t not in wl and t not in done_before]
             + [t for t in ranked if t not in wl and t in done_before])
    deep_n = 0
    for ticker in order:
        row = by_ticker[ticker]
        cached_info = cache_get(f"info/{ticker}.json", 24 * 3600)
        # 時間切れ後はキャッシュ済みのものだけ処理(新規取得はしない)
        if cached_info is None and time.time() - start > BUDGET:
            continue
        try:
            info = cached_info
            if info is None:
                info = fetch_info(ticker)
                cache_put(f"info/{ticker}.json", info)
            fin = fetch_fin_history(ticker)
            lg = score_long(info, fin)
            row.update({
                "name": _g(info, "longName", "shortName") or ticker,
                "long": lg["score"], "longSignal": lg["signal"],
                "longReasons": [b["reason"] for b in sorted(
                    lg["breakdown"], key=lambda x: -(x["points"] / x["max"] if x["max"] else 0))[:2]
                    if b["reason"] != "データ不足"],
                "sector": _g(info, "sector"),
                "per": _g(info, "trailingPE"), "pbr": _g(info, "priceToBook"),
                "roe": (_g(info, "returnOnEquity") * 100) if _g(info, "returnOnEquity") is not None else None,
                "divYield": _g(info, "dividendYield"),
            })
            if row["short"] >= 70 and row["long"] >= 70: row["quadrant"] = "本命"
            elif row["long"] >= 70: row["quadrant"] = "押し目待ち"
            elif row["short"] >= 70: row["quadrant"] = "短期限定"
            else: row["quadrant"] = "見送り"
            deep_n += 1
        except Exception as e:
            print("ranking long failed:", ticker, e)

    try:
        newly = [r["ticker"] for r in rows if r.get("long") is not None]
        merged = list(dict.fromkeys(list(done_before) + newly))
        if len(merged) >= len(rows) * 0.95:
            merged = newly  # 一巡したらリセットして再取得サイクルへ
        _save_json_s3("stock-learn/fin_progress.json", {"done": merged[-1200:],
                      "updatedAt": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        print("fin progress save failed:", e)

    out = {"rows": rows, "scanned": len(rows), "universe": len(tickers), "deepScanned": deep_n,
           "finCovered": len([r for r in rows if r.get("long") is not None]),
           "errors": errors, "elapsed": round(time.time() - start),
           "complete": deep_n >= len(rows),
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put("ranking.json", out)
    return out


# ═══════════════════════ 市場ニュース(全体の材料を自動収集) ═══════════════════════
def get_market_news():
    """市場全体のニュースをGoogle News RSSから収集(日本語+英語)。15分キャッシュ。"""
    cached = cache_get("market-news.json", 15 * 60)
    if cached:
        return cached
    items = []
    for q, hl, gl, ceid, tag in (
            ("日経平均 株式市場", "ja", "JP", "JP:ja", "JP"),
            ("stock market S&P 500 Fed", "en-US", "US", "US:en", "US")):
        try:
            url = (f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}"
                   f"&hl={hl}&gl={gl}&ceid={ceid}")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as r:
                root = ET.fromstring(r.read())
            for it in list(root.iter("item"))[:10]:
                items.append({"title": it.findtext("title") or "", "link": it.findtext("link") or "",
                              "source": it.findtext("source") or "Google News",
                              "published": it.findtext("pubDate") or "", "market": tag})
        except Exception as e:
            print("market news failed:", tag, e)
    seen, out = set(), []
    for it in items:
        k = re.sub(r"\s+", "", it["title"])[:40]
        if k not in seen:
            seen.add(k)
            out.append(it)
    res = {"news": out[:20], "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put("market-news.json", res)
    return res


# ═══════════════════════ プロトレーダーの視点(常時表示用の日次ブリーフ) ═══════════════════════
BRIEF_SYSTEM = """あなたは機関投資家出身のプロトレーダーです。毎朝チームに向けて相場観を共有します。
与えられた地合い・ニュース・全銘柄スキャン結果・自分の判定実績をもとに、
「今日は何を狙うべきか」「何に警戒すべきか」を実践的に述べてください。
実績が与えられた場合は自分の勝率を踏まえて強気/弱気を調整すること。
出力は必ず次のJSONのみ:
{"market_view":"相場観を3〜4行。地合いとニュースを踏まえた今日のスタンス",
 "stance":"aggressive|neutral|defensive",
 "focus":[{"ticker":"銘柄コード","name":"銘柄名","reason":"なぜ今狙い目か(1行)","action":"打診買い|押し目待ち|様子見|利確検討"}],
 "warnings":["警戒すべきこと1〜3個"]}"""


def run_brief():
    """毎朝のプロトレーダー視点を生成してS3保存(ホーム画面に常時表示)。"""
    market = get_market_overview()
    news = get_market_news()
    ranking = run_ranking(force=False)
    cfg = load_learn_config()
    stats = (cfg.get("stats") or {})

    rows = [r for r in ranking.get("rows", []) if r.get("long") is not None]
    top = sorted(rows, key=lambda r: -(r["long"] * 0.5 + r["short"] * 0.5
                                       + (18 if r.get("quadrant") == "本命" else
                                          10 if r.get("quadrant") == "押し目待ち" else 0)))[:12]
    cand = "\n".join(f"- {r['name']}({r['ticker']}) 短期{r['short']}/長期{r['long']} [{r.get('quadrant')}] "
                     f"{r.get('sector') or ''} {'/'.join((r.get('longReasons') or [])[:1])}" for r in top) or "(候補なし)"
    news_txt = "\n".join(f"- [{n['market']}] {n['title']}" for n in news["news"][:12]) or "(ニュースなし)"
    idx = "\n".join(f"- {r['label']}: {r.get('price')} (前日比{r.get('chg1d')}% / 5日{r.get('chg5d')}%)"
                    for r in market["indices"] if "error" not in r)
    acc = ""
    v5 = stats.get("byVerdict5d") or {}
    s5 = stats.get("bySignal5d") or {}
    if v5 or s5:
        acc = ("\n\n【自分の判定実績(5営業日後)】\n"
               + "\n".join(f"- AI判定{k}: {v['n']}件 勝率{v['winRate']}% 平均{v['avgRet']:+}%" for k, v in v5.items())
               + "\n" + "\n".join(f"- スコア{k}: {v['n']}件 勝率{v['winRate']}% 平均{v['avgRet']:+}%" for k, v in s5.items()))

    # 資金の流れとテーマ(実測βで選んだ連動銘柄つき)を渡す。
    # 「戦争→防衛」のような筋道を、AIが見出しから推測するのではなく数字で受け取れるようにする。
    flow_txt = ""
    try:
        fl = market_flow()
        secs = [s for s in fl.get("sectors") or [] if s.get("chg5d") is not None]
        if secs:
            up = "\n".join(f"- {s['label']}: 5日{s['chg5d']:+}% / 20日{s['chg20d']:+}% "
                           f"(買いシグナル{s['buyRatio']}%・{s['count']}銘柄)" for s in secs[:4])
            dn = "\n".join(f"- {s['label']}: 5日{s['chg5d']:+}%" for s in secs[-3:])
            flow_txt += f"\n\n【資金の流れ・買われている業種】\n{up}\n【売られている業種】\n{dn}"
        for th in (fl.get("themes") or [])[:2]:
            mv = " / ".join(f"{d['label']}5日{d.get('chg5d')}%" for d in th.get("driverMoves") or [])
            st = " / ".join(f"{p['name']}({p['ticker']}) {p['label']}にβ{p['beta']}"
                            for p in (th.get("stocks") or [])[:5])
            flow_txt += (f"\n\n【効いているテーマ: {th['theme']}】"
                         f"{'(牽引役が実際に動いている)' if th.get('confirmed') else '(見出しのみ・牽引役は未反応)'}\n"
                         f"{th['note']}\n牽引役: {mv}\n過去の連動が強い銘柄: {st}")
    except Exception as e:
        print("brief flow failed:", e)

    prompt = (f"【地合い】{market['moodLabel']}\n{idx}\n\n【市場ニュース】\n{news_txt}{flow_txt}\n\n"
              f"【全銘柄スキャン上位({ranking.get('scanned')}銘柄中)】\n{cand}{acc}")

    brief = {}
    try:
        raw = bedrock_invoke([{"role": "user", "content": prompt}],
                             system=BRIEF_SYSTEM, max_tokens=1500)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        brief = json.loads(m.group(0)) if m else {"market_view": raw}
    except Exception as e:
        print("brief failed:", e)
        brief = {"market_view": f"AI生成に失敗しました({e})", "stance": "neutral", "focus": [], "warnings": []}

    # ── 狙い目の上位3銘柄は具体的な売買プラン(エントリー/損切り/利確)まで生成 ──
    # 「打診買い」だけでは判断できないため、価格まで落として初めて実用になる
    plans = []
    for f in (brief.get("focus") or [])[:3]:
        tk = f.get("ticker")
        if not tk:
            continue
        try:
            ba = brain_analysis(tk, f.get("name", ""))
            b2 = ba.get("brain", {})
            plans.append({
                "ticker": tk, "name": ba["analysis"]["name"],
                "price": ba["analysis"]["price"], "currency": ba["analysis"]["currency"],
                "verdict": b2.get("verdict"), "conviction": b2.get("conviction"),
                "entry": b2.get("entry_plan"), "stop": b2.get("stop_loss"),
                "targets": b2.get("targets"), "horizon": b2.get("time_horizon"),
                "risks": (b2.get("risks") or [])[:2],
                "short": ba["analysis"]["short"]["score"], "long": ba["analysis"]["long"]["score"],
                "atr": ba["analysis"]["atr"],
            })
        except Exception as e:
            print("brief plan failed:", tk, e)

    # ── 精度: 実運用実績が無い間はバックテスト検証値を提示(何を根拠にした精度かを明示) ──
    bt = (cfg.get("backtest_report") or {})
    bt_acc = None
    reg = bt.get("testWeightedRegime") or {}
    if reg.get("buy"):
        bt_acc = {"source": "backtest", "winRate": reg["buy"]["winRate"], "n": reg["buy"]["n"],
                  "avgRet": reg["buy"]["avgRet"], "avgExcess": reg["buy"].get("avgExcess"),
                  "period": (bt.get("period") or {}).get("from"),
                  "note": "学習に使っていない検証期間での買いシグナル20営業日後成績"}

    out = {"brief": brief, "mood": market["moodLabel"], "stance": brief.get("stance", "neutral"),
           "plans": plans, "backtestAccuracy": bt_acc,
           "topPicks": top[:6], "news": news["news"][:8],
           "accuracy": {"byVerdict5d": v5, "bySignal5d": s5,
                        "evaluated": stats.get("evaluated", 0), "total": stats.get("total", 0)},
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    _save_json_s3("stock-learn/brief.json", out)
    return out


# ═══════════════════════ 朝レポート(定期スキャン・シグナル変化検知) ═══════════════════════
def run_daily_report(send_mail=True):
    """ウォッチリスト全銘柄をスキャンし、シグナル変化・保有損益・地合いをレポート化。
    EventBridge(毎朝)から自動実行され、S3保存+メール送信(環境変数設定時)。"""
    wl = _load_json_s3(WATCHLIST_KEY, [])
    market = get_market_overview()
    prev = _load_json_s3(SIGNALS_KEY, {})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # 毎朝、過去予測の答え合わせを自動実行(実運用データが日々学習に蓄積される)
    # 重み再学習はこの直後に別ジョブ(job=learn)が毎日走るのでここでは行わない
    try:
        evaluate_predictions()
    except Exception as e:
        print("auto evaluate failed:", e)
    try:
        paper_snapshot()   # デモ口座の資産推移を毎日記録
    except Exception as e:
        print("paper snapshot failed:", e)
    learned = False

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
    body = (f"【MyTrade 朝レポート】{today}\n\n"
            f"■ 地合い: {market['moodLabel']}\n\n"
            f"■ アラート\n" + ("\n".join(alerts) if alerts else "特になし") + "\n\n"
            f"■ ウォッチリスト({len(wl)}銘柄)\n" + ("\n".join(lines) if lines else "登録なし") + "\n\n"
            + ("※週次自動学習を実行しました(因子重み・教訓を更新)\n" if learned else "")
            + f"※参考情報であり投資助言ではありません")
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

    raw = bedrock_invoke([{"role": "user", "content": prompt}],
                         system=PORTFOLIO_SYSTEM, max_tokens=1200)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    brain = json.loads(m.group(0)) if m else {"summary": raw}
    return {"brain": brain, "holdings": len(holds), "market": market["moodLabel"],
            "updatedAt": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════ AI自動デモ売買(実績を自動で貯める) ═══════════════════════
AUTO_KEY = "stock-learn/autotrade.json"


def autotrade_config(update=None):
    # 既定値は25年バックテストで効率(年利÷最大下落)が最良だった組み合わせ
    cfg = _load_json_s3(AUTO_KEY, {"enabled": True, "riskPct": 2.0, "maxPositions": 8,
                                   "minConviction": 3, "rr": 3.0, "oddLot": True,
                                   "log": [], "userToggled": False})
    cfg.setdefault("rr", 3.0)
    cfg.setdefault("oddLot", True)   # 単元未満株(S株など)を使う。100万円でも値がさ株を分散できる
    cfg.setdefault("entryScore", 70)  # 買いの最低スコア。下げるほど機会が増えるが精度は落ちる
    cfg.setdefault("trailPct", 8)     # トレーリングストップ(%)。高値からこの割合下げたら手仕舞い
    cfg.setdefault("partial", True)   # 分割利確(第1目標で半分利確し損切りを建値へ)
    cfg.setdefault("timeStopDays", 0) # N日経っても動かなければ手仕舞い(0で無効)
    cfg.setdefault("holdMode", "trade")  # trade=利確目標で降りる / trend=200日線を割るまで持つ(長期保有)
    cfg.setdefault("maxSameDriver", 0)   # 同じ牽引役に連動する銘柄の上限(0=無制限)
    cfg.setdefault("driverTrend", False) # 牽引役が上昇トレンドのときだけ買う
    cfg.setdefault("betaSize", False)    # βが高い銘柄ほど枚数を減らす
    cfg.setdefault("ddLimit", -45)        # 耐えられる最大下落。自動追従でもこれを超えさせない
    cfg.setdefault("tradeMode", "balanced")  # safe/balanced/aggressive/max/custom
    cfg.setdefault("autoTune", False)    # 検証が更新されるたびに最適値へ自動追従するか
    # 手動で切り替えるまでは常にON(「ボタンを押さなくても回っている」状態にする)
    if not cfg.get("userToggled") and not cfg.get("enabled"):
        cfg["enabled"] = True
    if update:
        for k in ("enabled", "riskPct", "maxPositions", "minConviction", "rr", "oddLot",
                  "entryScore", "trailPct", "partial", "timeStopDays", "holdMode",
                  "tradeMode", "autoTune", "maxSameDriver", "driverTrend", "betaSize",
                  "ddLimit", "appliedFrom", "appliedNote"):
            if k in update:
                cfg[k] = update[k]
        if "enabled" in update:
            cfg["userToggled"] = True     # 以降はユーザーの選択を尊重
        _save_json_s3(AUTO_KEY, cfg)
    return cfg


def run_autotrade():
    """毎朝、AIの判断に従ってデモ口座を自動売買する。
    ① 保有中の銘柄が損切りライン/利確目標に達していれば手仕舞い
    ② ブリーフの推奨(買い判定かつ確信度が基準以上)を、2%ルールの株数で新規建て
    実際のお金は一切動かない。運用実績を自動で貯めて精度検証に使うのが目的。"""
    cfg = autotrade_config()
    if not cfg.get("enabled"):
        return {"skipped": "自動売買は無効です", "enabled": False}
    rr = float(cfg.get("rr", 3.0))   # 利確目標(損切り幅の何倍か)。25年検証で3倍が最良

    st = paper_state("ai")
    actions = []
    sold_now = set()   # この実行で手仕舞いした銘柄は買い直さない(回転売買を防ぐ)
    risk_pct = float(cfg.get("riskPct", 2.0))
    max_pos = int(cfg.get("maxPositions", 5))
    min_conv = int(cfg.get("minConviction", 3))
    odd_lot = bool(cfg.get("oddLot", True))
    entry_score = int(cfg.get("entryScore", 70))
    trail = float(cfg.get("trailPct", 8)) / 100
    use_partial = bool(cfg.get("partial", True))
    time_stop = int(cfg.get("timeStopDays", 0))
    hold_mode = cfg.get("holdMode", "trade")
    max_same_driver = int(cfg.get("maxSameDriver", 0) or 0)
    driver_trend = bool(cfg.get("driverTrend"))
    beta_size = bool(cfg.get("betaSize"))
    # 保有中の銘柄が「何に連動しているか」。同じ牽引役に偏らせないために数える
    driver_count = {}
    for pos in st["positions"]:
        k = (pos.get("drivenBy") or {}).get("key")
        if k:
            driver_count[k] = driver_count.get(k, 0) + 1

    # ── ① 手仕舞い判定 ──
    for pos in list(st["positions"]):
        try:
            a = analyze_ticker(pos["ticker"])
            lv = a.get("tradeLevels") or {}
            px = a["price"]
            # 建玉時に決めたラインで判定する(現在値から引き直すと永久に到達しない)
            stop = pos.get("stop")
            target = pos.get("target")
            if stop is None:   # 手動保有など建玉時ラインが無い場合の保険
                stop = lv.get("stop")
                target = lv.get("target1")
            # 高値を更新して記録(トレーリングストップの基準)
            peak = max(float(pos.get("peak") or pos["avgPrice"]), px)
            held_days = 0
            try:
                held_days = (datetime.now(timezone.utc)
                             - datetime.strptime(pos.get("openedAt", ""), "%Y-%m-%d").replace(tzinfo=timezone.utc)).days
            except Exception:
                pass

            # ① 分割利確: 第1目標で半分を利確し、損切りを建値へ引き上げる(以降は負けない形)
            t1 = pos.get("t1")
            if use_partial and not pos.get("half") and t1 and px >= t1 and pos["qty"] >= 2:
                half = pos["qty"] // 2
                st = paper_order(pos["ticker"], "sell", half,
                                 f"[自動] 分割利確(第1目標{t1:,.0f}到達・残りは建値ストップで伸ばす)",
                                 account="ai")
                actions.append({"type": "sell", "ticker": pos["ticker"], "name": pos["name"],
                                "qty": half, "price": round(px, 2),
                                "reason": f"分割利確(半分を{t1:,.0f}で確定・残りは利益を伸ばす)"})
                _paper_update_position("ai", pos["ticker"],
                                       {"half": True, "stop": pos["avgPrice"], "peak": peak})
                continue

            # 長期保有モード: 利確目標では降りず、200日線を割るまで持ち続ける
            if hold_mode == "trend":
                ma200 = None
                try:
                    sp = a.get("sparkMa25")  # 200日線はanalyzeに無いので終値と比較で代用
                    ma200 = a.get("tradeLevels", {}).get("ma25")
                except Exception:
                    pass
                reason = None
                if not a.get("regime", {}).get("benchAboveMa200", True) and a["short"]["signal"] == "avoid":
                    reason = "地合い悪化かつシグナル消滅(長期保有の解除条件)"
                elif trail and peak > pos["avgPrice"] and px <= peak * (1 - max(trail, 0.20)):
                    reason = f"トレーリング(高値{peak:,.0f}から{max(trail,0.20)*100:.0f}%下落)"
                elif stop and px <= stop:
                    reason = f"損切り({stop:,.0f}を割った)"
                if reason:
                    st = paper_order(pos["ticker"], "sell", pos["qty"], "[自動] " + reason, account="ai")
                    sold_now.add(pos["ticker"])
                    actions.append({"type": "sell", "ticker": pos["ticker"], "name": pos["name"],
                                    "qty": pos["qty"], "price": round(px, 2), "reason": reason})
                elif peak > float(pos.get("peak") or 0):
                    _paper_update_position("ai", pos["ticker"], {"peak": peak})
                continue

            reason = None
            if stop and px <= stop:
                reason = (f"建値撤退({stop:,.0f})" if pos.get("half") and stop >= pos["avgPrice"]
                          else f"損切り(建玉時に決めた{stop:,.0f}を割った)")
            elif target and px >= target:
                reason = f"利確(目標{target:,.0f}に到達)"
            elif trail and peak > pos["avgPrice"] and px <= peak * (1 - trail):
                reason = f"トレーリング(高値{peak:,.0f}から{trail*100:.0f}%下落)"
            elif time_stop and held_days >= time_stop:
                reason = f"時間切れ({time_stop}日動きなし)"
            elif a["short"]["signal"] == "avoid" and (px / pos["avgPrice"] - 1) * 100 < -5:
                reason = "シグナル悪化かつ含み損5%超"

            if reason:
                st = paper_order(pos["ticker"], "sell", pos["qty"], "[自動] " + reason, account="ai")
                sold_now.add(pos["ticker"])
                actions.append({"type": "sell", "ticker": pos["ticker"], "name": pos["name"],
                                "qty": pos["qty"], "price": round(px, 2), "reason": reason})
            elif peak > float(pos.get("peak") or 0):
                _paper_update_position("ai", pos["ticker"], {"peak": peak})
        except Exception as e:
            print("autotrade sell check failed:", pos["ticker"], e)

    # ── ② 新規建て ──
    # AI推奨(brief)を優先し、枠が余ればランキング上位(909銘柄スキャン)から補充する。
    # 24時間動かすので候補が尽きないようにしておく。
    brief = _load_json_s3("stock-learn/brief.json", {})
    held = {p["ticker"] for p in st["positions"]}
    candidates = list(brief.get("plans") or [])
    try:
        rk = cache_get("ranking.json", 24 * 3600) or {}
        extra = [r for r in sorted(rk.get("rows", []), key=lambda x: -(x.get("short", 0)))
                 if r.get("shortSignal") == "buy" and r.get("regimeOn")
                 and r.get("quadrant") in ("本命", "押し目待ち", "短期限定")
                 and r["ticker"] not in {c.get("ticker") for c in candidates}]
        candidates += [{"ticker": r["ticker"], "name": r.get("name"), "verdict": "buy",
                        "conviction": 4 if r.get("quadrant") == "本命" else 3,
                        "source": "ranking"} for r in extra[:25]]
    except Exception as e:
        print("candidate fill failed:", e)

    skipped_cost = 0
    for pl in candidates:
        if len(held) >= max_pos:
            break
        tk = pl.get("ticker")
        if not tk or tk in held or tk in sold_now:
            continue
        if pl.get("verdict") not in ("buy", "strong_buy"):
            continue
        if (pl.get("conviction") or 0) < min_conv:
            continue
        if len(held) >= max_pos:
            break
        try:
            a = analyze_ticker(tk)
            lv = a.get("tradeLevels") or {}
            px, stop = a["price"], lv.get("stop")
            if not stop or stop >= px:
                continue
            # ランキング由来の候補は最新スコアで再確認(古い情報で買わない)
            if pl.get("source") == "ranking":
                if a["short"]["signal"] != "buy" or a["short"]["score"] < entry_score:
                    continue
            # ── 連動性(相関)による足切り ──
            link = a.get("drivenBy")
            if link:
                if driver_trend:
                    dm = next((d for d in (_load_json_s3("stock-learn/flow_drivers.json", []) or [])
                               if d.get("key") == link["key"]), None)
                    if dm and (dm.get("chg20d") or 0) < 0:
                        actions.append({"type": "skip", "ticker": tk, "name": pl.get("name"),
                                        "reason": f"{link['label']}が下降トレンドのため見送り"})
                        continue
                if max_same_driver and driver_count.get(link["key"], 0) >= max_same_driver:
                    actions.append({"type": "skip", "ticker": tk, "name": pl.get("name"),
                                    "reason": f"{link['label']}連動の銘柄をすでに"
                                              f"{driver_count[link['key']]}銘柄保有(集中回避)"})
                    continue
            # 2%ルール: 1トレードの想定損失が資産のrisk_pct%以内になる株数
            # 単元未満株が使えるなら1株単位。使えないなら日本株は100株単位
            unit = 1 if (odd_lot or not tk.endswith(".T")) else 100
            qty_risk = int(st["equity"] * risk_pct / 100 / (px - stop))   # 2%ルール
            qty_cap = int(st["equity"] / max_pos / px)                    # 1銘柄あたりの上限
            qty = min(qty_risk, qty_cap)
            if beta_size:
                # 市場に対して大きく動く銘柄は、同じ枚数でも実質のリスクが大きい
                mb = (a.get("beta") or {}).get("n225" if tk.endswith(".T") else "sp500")
                if mb and mb > 1.0:
                    qty = int(qty / min(mb, 2.5))
            qty = (qty // unit) * unit
            if qty < unit:
                # 枠に収まらない場合の救済。
                # 単元未満株ONなら「最低1株」は買えるようにする(買えない銘柄を作らない)。
                # 単元株のみの場合は分散を壊さない範囲(1枠の2倍・リスク1.5倍)に限る。
                one_risk = (px - stop) * unit / st["equity"] * 100 if st["equity"] else 999
                one_cost = px * unit * 1.001
                if odd_lot:
                    if one_cost <= st["cash"] and one_risk <= risk_pct * 2:
                        qty = unit
                elif (one_risk <= risk_pct * 1.5
                      and one_cost <= st["equity"] / max_pos * 2
                      and one_cost <= st["cash"] * 0.5):
                    qty = unit
            if qty < unit:
                skipped_cost += 1
                if skipped_cost <= 3:   # 記録は3件までに留める(候補が多いため)
                    actions.append({"type": "skip", "ticker": tk, "name": pl.get("name"),
                                    "reason": (f"1株{int(px):,}円が現金残高({int(st['cash']):,}円)を超える"
                                               if odd_lot else
                                               f"1単元({unit}株={int(px*unit):,}円)が資金・リスク許容を超える")})
                continue
            st = paper_order(tk, "buy", qty,
                             f"[自動] AI推奨 確信度{pl.get('conviction')}/5",
                             meta={"stop": round(stop, 2),
                                   "t1": round(px + (px - stop) * 1.5, 2),
                                   "target": round(px + (px - stop) * rr, 2),
                                   "rr": rr, "peak": round(px, 2), "half": False,
                                   "drivenBy": link},
                             account="ai")
            held.add(tk)
            if link:
                driver_count[link["key"]] = driver_count.get(link["key"], 0) + 1
            actions.append({"type": "buy", "ticker": tk, "name": pl.get("name") or tk, "qty": qty,
                            "price": round(px, 2), "stop": round(stop, 2),
                            "target": round(px + (px - stop) * rr, 2),
                            "reason": (f"AI判定{pl.get('verdict')} 確信度{pl.get('conviction')}/5"
                                       if pl.get("source") != "ranking"
                                       else f"ランキング上位(短期{a['short']['score']}点/{a.get('quadrant','')})")})
        except Exception as e:
            print("autotrade buy failed:", tk, e)

    now_iso = datetime.now(timezone.utc).isoformat()
    log = (cfg.get("log") or [])
    if actions:   # 1時間ごとに走るのでログは売買があった時だけ残す
        log.append({"date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
                    "actions": actions, "equity": st["equity"]})
    cfg["log"] = log[-60:]
    cfg["lastRunAt"] = now_iso
    cfg["lastEquity"] = st["equity"]
    _save_json_s3(AUTO_KEY, cfg)
    try:
        paper_snapshot()   # 収支を常に最新化(24時間いつでも正しい数字が出るように)
    except Exception as e:
        print("snapshot after autotrade failed:", e)
    return {"enabled": True, "actions": actions, "state": st,
            "updatedAt": datetime.now(timezone.utc).isoformat()}


def performance_dashboard():
    """運用成績のまとめ: AI口座と自分の口座の対戦成績、AI判定の精度、自動売買の記録。"""
    st = paper_state("ai")
    me = paper_state("me")
    cfg = load_learn_config()
    auto = _load_json_s3(AUTO_KEY, {})
    hist = st.get("history") or []

    # 日次リターンと最大ドローダウン
    daily, peak, maxdd = [], None, 0.0
    prev = None
    for h in hist:
        eq = h["equity"]
        if prev is not None:
            daily.append({"date": h["date"], "equity": eq,
                          "changePct": round((eq / prev - 1) * 100, 2),
                          "change": round(eq - prev, 0)})
        peak = eq if peak is None else max(peak, eq)
        if peak:
            maxdd = min(maxdd, (eq / peak - 1) * 100)
        prev = eq

    stats = cfg.get("stats") or {}
    bt = (cfg.get("backtest_report") or {})
    reg = (bt.get("testWeightedRegime") or {}).get("buy")

    return {
        "demo": {
            "initial": st["initial"], "equity": st["equity"], "cash": st["cash"],
            "totalPnl": st["totalPnl"], "totalPnlPct": st["totalPnlPct"],
            "positions": st["positions"], "stats": st["stats"],
            "maxDrawdownPct": round(maxdd, 2), "days": len(hist),
            "daily": daily[-30:][::-1], "history": hist[-120:],
        },
        "me": {"initial": me["initial"], "equity": me["equity"], "cash": me["cash"],
               "totalPnl": me["totalPnl"], "totalPnlPct": me["totalPnlPct"],
               "positions": me["positions"], "stats": me["stats"],
               "history": (me.get("history") or [])[-120:]},
        "auto": {"enabled": bool(auto.get("enabled")),
                 "log": (auto.get("log") or [])[-10:][::-1],
                 "riskPct": auto.get("riskPct"), "maxPositions": auto.get("maxPositions")},
        "accuracy": {
            "live": {"bySignal5d": stats.get("bySignal5d") or {},
                     "byVerdict5d": stats.get("byVerdict5d") or {},
                     "bySignal20d": stats.get("bySignal20d") or {},
                     "evaluated": stats.get("evaluated", 0), "total": stats.get("total", 0)},
            "backtest": ({"winRate": reg["winRate"], "n": reg["n"], "avgRet": reg["avgRet"],
                          "avgExcess": reg.get("avgExcess"),
                          "period": (bt.get("period") or {}).get("from"),
                          "years": bt.get("years")} if reg else None),
            "byEra": bt.get("byEra") or {},
        },
        "jobs": _load_json_s3(JOB_STATUS_KEY, {}),
        "learn": {"weights": cfg.get("factor_weights"), "ic": cfg.get("factor_ic"),
                  "samples": cfg.get("backtestSamples"), "years": cfg.get("backtestYears"),
                  "lessons": cfg.get("lessons") or [], "updatedAt": cfg.get("updatedAt")},
        "updatedAt": datetime.now(timezone.utc).isoformat()}


# ═══════════════════════ チャートデータ(期間切替+サブ指標) ═══════════════════════
CHART_PERIODS = {"3mo": (120, 1), "6mo": (200, 1), "1y": (400, 1), "3y": (1150, 3), "5y": (1900, 5)}


INTRADAY = {"1m": ("1d", 60), "5m": ("5d", 90), "15m": ("1mo", 120), "1h": ("3mo", 300)}


def get_intraday(ticker, interval="5m"):
    """分足・時間足(ザラ場の値動き)。株価と同じく約20分遅延だが、日中の動きが見える。"""
    period, ttl = INTRADAY.get(interval, INTRADAY["5m"])
    key = f"chart/{ticker}_intra_{interval}.json"
    cached = cache_get(key, ttl)
    if cached:
        return cached
    import yfinance as yf
    df = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if df is None or len(df) < 3:
        raise Exception(f"{ticker}: {interval}足のデータが取得できません")
    df = df.dropna()
    close = df["Close"]
    ma_fast = close.rolling(min(9, max(2, len(df) // 10))).mean()
    ma_slow = close.rolling(min(25, max(3, len(df) // 4))).mean()
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rsi = 100 - 100 / (1 + gain / loss.replace(0, float("nan")))
    e12 = close.ewm(span=12, adjust=False).mean()
    e26 = close.ewm(span=26, adjust=False).mean()
    macd = e12 - e26
    hist = macd - macd.ewm(span=9, adjust=False).mean()

    n = min(len(df), 160)
    idx = list(range(len(df) - n, len(df)))

    def val(sr, i):
        v = sr.iloc[i]
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), 2)

    fmt = "%H:%M" if interval in ("1m", "5m") else "%m/%d %H:%M"
    out = {"ticker": ticker, "period": period, "interval": interval, "intraday": True,
           "candles": [{"d": df.index[i].strftime(fmt),
                        "o": round(float(df["Open"].iloc[i]), 2), "h": round(float(df["High"].iloc[i]), 2),
                        "l": round(float(df["Low"].iloc[i]), 2), "c": round(float(close.iloc[i]), 2),
                        "v": float(df["Volume"].iloc[i])} for i in idx],
           "ma25": [val(ma_fast, i) for i in idx],
           "ma75": [val(ma_slow, i) for i in idx],
           "ma200": [None] * len(idx),
           "rsi": [val(rsi, i) for i in idx],
           "macdHist": [val(hist, i) for i in idx],
           "lastClose": round(float(close.iloc[-1]), 2),
           "lastDate": df.index[-1].strftime("%Y-%m-%d %H:%M"),
           "prevClose": round(float(close.iloc[0]), 2),
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put(key, out)
    return out


def get_chart(ticker, period="6mo", interval="1d"):
    """ローソク足+各種インジケーター。interval=1d/1wk/1mo で足種を切替。
    移動平均3本・ボリンジャーバンド・一目均衡表・RSI・MACD・出来高とその移動平均。"""
    key = f"chart/{ticker}_{period}_{interval}.json"
    cached = cache_get(key, PRICE_TTL)
    if cached:
        return cached
    days, step = CHART_PERIODS.get(period, CHART_PERIODS["6mo"])
    df = fetch_history(ticker, f"{days + 300}d")

    if interval in ("1wk", "1mo"):
        rule = "W" if interval == "1wk" else "ME"
        df = df.resample(rule).agg({"Open": "first", "High": "max", "Low": "min",
                                    "Close": "last", "Volume": "sum"}).dropna()
        step = 1
        days = max(30, days // (5 if interval == "1wk" else 21))

    f = build_indicator_frame(df)
    close, high, low = df["Close"], df["High"], df["Low"]
    ma75 = close.rolling(75).mean()
    ma200 = close.rolling(200).mean()
    # ボリンジャーバンド(20,2σ)
    mid20 = close.rolling(20).mean()
    sd20 = close.rolling(20).std()
    bb_u, bb_l = mid20 + 2 * sd20, mid20 - 2 * sd20
    # 一目均衡表(9/26/52)
    ten = (high.rolling(9).max() + low.rolling(9).min()) / 2
    kij = (high.rolling(26).max() + low.rolling(26).min()) / 2
    span_a = ((ten + kij) / 2).shift(26)
    span_b = ((high.rolling(52).max() + low.rolling(52).min()) / 2).shift(26)
    vol_ma = df["Volume"].rolling(20).mean()

    n = min(len(df), days)
    idx = list(range(max(0, len(df) - n), len(df), step))

    def val(sr, i):
        try:
            v = sr.iloc[i]
        except Exception:
            return None
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), 2)

    fmt = "%y/%m/%d" if interval == "1d" else "%y/%m"
    candles = [{"d": df.index[i].strftime(fmt),
                "o": round(float(df["Open"].iloc[i]), 2), "h": round(float(high.iloc[i]), 2),
                "l": round(float(low.iloc[i]), 2), "c": round(float(close.iloc[i]), 2),
                "v": float(df["Volume"].iloc[i])} for i in idx]
    out = {"ticker": ticker, "period": period, "interval": interval, "candles": candles,
           "ma25": [val(f["ma25"], i) for i in idx],
           "ma75": [val(ma75, i) for i in idx],
           "ma200": [val(ma200, i) for i in idx],
           "bbUpper": [val(bb_u, i) for i in idx],
           "bbLower": [val(bb_l, i) for i in idx],
           "tenkan": [val(ten, i) for i in idx],
           "kijun": [val(kij, i) for i in idx],
           "spanA": [val(span_a, i) for i in idx],
           "spanB": [val(span_b, i) for i in idx],
           "volMa": [val(vol_ma, i) for i in idx],
           "rsi": [val(f["rsi"], i) for i in idx],
           "macdHist": [val(f["hist"], i) for i in idx],
           "lastClose": round(float(close.iloc[-1]), 2),
           "lastDate": df.index[-1].strftime("%Y-%m-%d"),
           "updatedAt": datetime.now(timezone.utc).isoformat()}
    cache_put(key, out)
    return out


# ═══════════════════════ デモトレード(ペーパートレード) ═══════════════════════
PAPER_KEY = "stock-learn/paper.json"          # 旧形式(移行元)
PAPER_INITIAL = 1000000  # 初期資金100万円
FEE_RATE = 0.001         # 売買手数料0.1%(国内ネット証券の実勢に近い水準)
# AIと自分で別々の口座を持ち、同じ土俵で成績を比べられるようにする
PAPER_ACCOUNTS = {"ai": "stock-learn/paper_ai.json", "me": "stock-learn/paper_me.json"}


def _paper_key(account="me"):
    return PAPER_ACCOUNTS.get(account, PAPER_ACCOUNTS["me"])


def _paper_load(account="me"):
    st = _load_json_s3(_paper_key(account), None)
    if st is None and account == "me":
        legacy = _load_json_s3(PAPER_KEY, None)   # 旧単一口座からの移行
        if legacy:
            _save_json_s3(_paper_key("me"), legacy)
            return legacy
    if st is None:
        st = {"initial": PAPER_INITIAL, "cash": PAPER_INITIAL,
              "positions": [], "trades": [], "history": [],
              "createdAt": datetime.now(timezone.utc).isoformat()}
    return st


def _paper_price(ticker):
    """現在値。ランキング/分析キャッシュを優先し、無ければ取得。"""
    rk = cache_get("ranking.json", 24 * 3600) or {}
    for r in rk.get("rows", []):
        if r["ticker"] == ticker:
            return float(r["price"]), r.get("name") or ticker
    a = cache_get(f"analyze/{ticker}.json", PRICE_TTL)
    if a:
        return float(a["price"]), a.get("name") or ticker
    df = fetch_history(ticker, "10d")
    return float(df["Close"].iloc[-1]), ticker


def paper_state(account="me"):
    """評価額・損益を現在値で再計算して返す。"""
    st = _paper_load(account)
    rk = cache_get("ranking.json", 24 * 3600) or {}
    rk_map = {r["ticker"]: r for r in rk.get("rows", [])}
    total_val, positions = 0.0, []
    for p in st.get("positions", []):
        try:
            px, name = _paper_price(p["ticker"])
        except Exception:
            px, name = p["avgPrice"], p.get("name", p["ticker"])
        val = px * p["qty"]
        cost = p["avgPrice"] * p["qty"]
        total_val += val
        # 値動きの情報はキャッシュから拾う(追加の通信をしないので高速)
        r = rk_map.get(p["ticker"], {})
        a = cache_get(f"analyze/{p['ticker']}.json", 24 * 3600) or {}
        stop, target = p.get("stop"), p.get("target")
        positions.append({**p,
                          "name": p.get("name") or a.get("name") or name,
                          "price": round(px, 2),
                          "value": round(val, 0), "cost": round(cost, 0),
                          "pnl": round(val - cost, 0),
                          "pnlPct": round((px / p["avgPrice"] - 1) * 100, 2),
                          "chg1d": r.get("chg1d", a.get("chg1d")),
                          "market": r.get("market") or a.get("market"),
                          "sector": r.get("sector") or a.get("sector"),
                          "short": r.get("short") or (a.get("short") or {}).get("score"),
                          "long": r.get("long") or (a.get("long") or {}).get("score"),
                          "spark": (a.get("spark") or [])[-30:],
                          "hi52": a.get("hi52"), "lo52": a.get("lo52"),
                          # 損切り/利確までの距離(%)。あとどれくらいで到達するかが分かる
                          "toStopPct": round((stop / px - 1) * 100, 1) if stop else None,
                          "toTargetPct": round((target / px - 1) * 100, 1) if target else None})
    equity = st["cash"] + total_val
    closed = [t for t in st.get("trades", []) if t["side"] == "sell"]
    wins = [t for t in closed if t.get("pnl", 0) > 0]
    gw = sum(t.get("pnl", 0) for t in wins)
    gl = abs(sum(t.get("pnl", 0) for t in closed if t.get("pnl", 0) <= 0))
    return {
        "account": account,
        "initial": st["initial"], "cash": round(st["cash"], 0),
        "positionValue": round(total_val, 0), "equity": round(equity, 0),
        "totalPnl": round(equity - st["initial"], 0),
        "totalPnlPct": round((equity / st["initial"] - 1) * 100, 2),
        "positions": positions, "trades": st.get("trades", [])[-30:][::-1],
        "history": st.get("history", [])[-90:],
        "stats": {"closed": len(closed),
                  "winRate": round(len(wins) / len(closed) * 100, 1) if closed else None,
                  "profitFactor": round(gw / gl, 2) if gl > 0 else None,
                  "avgWin": round(gw / len(wins), 0) if wins else 0,
                  "avgLoss": round(-gl / (len(closed) - len(wins)), 0) if len(closed) > len(wins) else 0},
        "updatedAt": datetime.now(timezone.utc).isoformat()}


def paper_order(ticker, side, qty, note="", meta=None, account="me"):
    st = _paper_load(account)
    qty = int(qty)
    if qty <= 0:
        raise Exception("株数が不正です")
    if ticker.endswith(".T") and qty % 100 != 0:
        if not bool((_load_json_s3(AUTO_KEY, {}) or {}).get("oddLot", True)):
            raise Exception("日本株は100株単位で注文してください(単元未満株を使う設定にすると1株から買えます)")
    px, name = _paper_price(ticker)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pos = next((p for p in st["positions"] if p["ticker"] == ticker), None)

    if side == "buy":
        cost = px * qty * (1 + FEE_RATE)
        if cost > st["cash"]:
            raise Exception(f"資金不足です(必要 {int(cost):,}円 / 残高 {int(st['cash']):,}円)")
        st["cash"] -= cost
        if pos:
            tot = pos["qty"] + qty
            pos["avgPrice"] = round((pos["avgPrice"] * pos["qty"] + px * qty) / tot, 2)
            pos["qty"] = tot
        else:
            pos_new = {"ticker": ticker, "name": name, "qty": qty,
                       "avgPrice": round(px, 2), "openedAt": today}
            if meta:
                pos_new.update({k: v for k, v in meta.items() if v is not None})
            st["positions"].append(pos_new)
        st["trades"].append({"date": today, "ticker": ticker, "name": name, "side": "buy",
                             "qty": qty, "price": round(px, 2), "fee": round(px * qty * FEE_RATE, 0),
                             "note": note[:120]})
    else:
        if not pos or pos["qty"] < qty:
            raise Exception("保有株数が足りません")
        proceeds = px * qty * (1 - FEE_RATE)
        pnl = proceeds - pos["avgPrice"] * qty
        st["cash"] += proceeds
        pos["qty"] -= qty
        if pos["qty"] == 0:
            st["positions"] = [p for p in st["positions"] if p["ticker"] != ticker]
        st["trades"].append({"date": today, "ticker": ticker, "name": name, "side": "sell",
                             "qty": qty, "price": round(px, 2), "fee": round(px * qty * FEE_RATE, 0),
                             "pnl": round(pnl, 0),
                             "pnlPct": round((px / pos["avgPrice"] - 1) * 100, 2), "note": note[:120]})
        # 実現損益はトレード日誌にも自動記録(学習・成績分析に使われる)
        try:
            log_trade({"ticker": ticker, "name": name, "entryPrice": pos["avgPrice"],
                       "exitPrice": px, "qty": qty, "entryDate": pos.get("openedAt"),
                       "reason": f"[{'AI' if account == 'ai' else '自分'}] " + (note or "決済")})
        except Exception as e:
            print("paper->journal failed:", e)

    _save_json_s3(_paper_key(account), st)
    return paper_state(account)


def _paper_update_position(account, ticker, patch):
    """保有ポジションの属性(高値・建値ストップ等)を更新する。"""
    st = _paper_load(account)
    for p in st.get("positions", []):
        if p["ticker"] == ticker:
            p.update(patch)
            _save_json_s3(_paper_key(account), st)
            return True
    return False


def paper_snapshot(account=None):
    """毎日の資産推移を記録(グラフ用)。朝の定期実行から呼ばれる。"""
    out = {}
    for acc in ([account] if account else list(PAPER_ACCOUNTS)):
        st = _paper_load(acc)
        s2 = paper_state(acc)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        hist = [h for h in st.get("history", []) if h["date"] != today]
        hist.append({"date": today, "equity": s2["equity"], "cash": s2["cash"]})
        st["history"] = hist[-400:]
        _save_json_s3(_paper_key(acc), st)
        out[acc] = s2
    return out


def paper_reset(initial=PAPER_INITIAL, account="me"):
    _save_json_s3(_paper_key(account), {"initial": int(initial), "cash": int(initial),
                                        "positions": [], "trades": [], "history": [],
                                        "createdAt": datetime.now(timezone.utc).isoformat()})
    return paper_state(account)


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
