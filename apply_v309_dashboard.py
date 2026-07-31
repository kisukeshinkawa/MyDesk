#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MyDesk v309 適用（見積比較マトリクス：店舗×業者で1回金額・最安・未回答・対応地域外を一覧）
使い方: dashboard.jsx と同じフォルダで  python3 apply_v309_dashboard.py"""
import gzip, base64, json, sys, os
PATH="dashboard.jsx"
if not os.path.exists(PATH):
    print("❌ dashboard.jsx が見つかりません。同じフォルダで実行してください。"); sys.exit(1)
PAIRS=json.loads('[["H4sIADA/bGoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zU21C0zNrDQLS7JL0rVTS/KLy0o1q1KTSpKVLJW0NdXeNw8+XHz6sfNnS/WznjasfTp2gkANkf2HFAAAAA=", "H4sIADA/bGoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zWw0DUw1C0zNrDULSzNL0nVTc7PLUgsStXNTSwpyqxQslbQ11d43Dz5cfPqx82dL9bOeNqx9OnaCQCojcfBUgAAAA=="], ["H4sIADA/bGoC/1NQSM7PKy5RiC7ILypJzHEqLa7UUShOLQmAc2MVbBWCUhOTS/RKi1ODSxJLUjWUlDStAUrMEac5AAAA", "H4sIADA/bGoC/1NQSM7PKy5RiC7ILypJzHEqLa7UUShOLQmAc2MVbBWCUhOTS/RKi1ODSxJLUjWUlDStuRRgOosz8sud83MLEotSwVqDEXwsetMSc4pTNa0BS3/hc3gAAAA="], ["H4sIADA/bGoC/1NQAIFqfS0FWxBQeLp+34uNC5/umv6iYzpUSEu/FgBFEc1hJgAAAA==", "H4sIADA/bGoC/21SQWsTQRS++yvGQUpT1k0KFuKSjdCI4MFLe/AgQie7082Q2ZllZpK0bhfcqNBYpWBLKyhKD4pVatGjBH+MS9L1FH+Cu5tkk4pzeu9737z55r0PgPT4xSVgpgfEH/cuTl8Ozw/j/pP45NMEXSoGV8CYuejpbcxsLuTOzoOHBZ1i5qhGtQQWFkBSk4oL/L/S5D4AFZu0gVTbFJu+7yLhELbKleKuAZcFdmEQVHNuwq63khoDnNUosZqmv1gwqxKr9Qbv1LjrIYEX22b1arsQ5E1tIj2Ktg1IGCUMX9+keAtqiBKH3VXYlQa0MFNYQM1BngFL+o30Xc1Dtk2YkwErCQJK+s2sUOfCxmIN2aQljfIkNTaW9RVvC0hOiQ2u+TUdWWnbYEOrI6vpCN5itiFnMm9NGcY0WHU0i1MuLrFgp0EUhjnpNhJNbZMzdR8Tp6GMcqmUpevkEU6lljOJVkvIpBH0OBn/LKXcQS6h2RgaWBCVTta/9NSvo+8gX3XUffX7qBeFr6PuHjTgn/cHz/91w6i/G4WnUfh1+OEsfvwsCl9k6UEUfonCp1G4H3V7o/7+8O3nwZt3F2eHo34PBpXieIXzW52XkbqjMo6J5OweUoIkY818ZPrzjgpAmxKpUnDOggmaJWu8k/BncQBqpl8LitVgZr1i4r2pjkJu6dz8g/Of8beTwY/jePd45vy/tQQiCiMDAAA="], ["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"]]')
def dec(b): return gzip.decompress(base64.b64decode(b)).decode("utf-8")
raw=open(PATH,"rb").read(); had_crlf=b"\r\n" in raw
text=raw.replace(b"\r\n",b"\n").decode("utf-8")
applied=skipped=0
for eo,en in PAIRS:
    old,new=dec(eo),dec(en)
    if text.count(new)>=1: skipped+=1; continue
    c=text.count(old)
    if c==0:
        print("❌ 対象が見つかりません（現在のビルドを確認）:"); print("   "+old[:80].replace("\n"," / ")); print("   grep MYDESK_BUILD dashboard.jsx"); sys.exit(1)
    if c!=1:
        print("❌ 対象が%d箇所（1箇所想定）"%c); sys.exit(1)
    text=text.replace(old,new,1); applied+=1
out=text.replace("\n","\r\n").encode("utf-8") if had_crlf else text.encode("utf-8")
open(PATH,"wb").write(out)
print("✅ v309 適用完了 (適用 %d / スキップ %d)"%(applied,skipped))
print("   ビルド: 2026-08-01-v309-quote-compare-matrix")
