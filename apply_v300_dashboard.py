#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MyDesk v300 適用（見積ポータルの通信をCORSプリフライト不要方式に変更）
使い方: dashboard.jsx と同じフォルダで  python3 apply_v300_dashboard.py"""
import gzip, base64, json, sys, os
PATH="dashboard.jsx"
if not os.path.exists(PATH):
    print("❌ dashboard.jsx が見つかりません。同じフォルダで実行してください。"); sys.exit(1)
PAIRS=json.loads('[["H4sIAAf5amoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zUy1i0zsrTULSzNL0nVLcgvKknM0c3JzMtWslbQ11d43Dz5cfPqx82dL9bOeNqx9OnaCQCaKPtiTwAAAA==", "H4sIAAf5amoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zUy1i0zNjDQLSzNL0nVLcgvKknM0c3LLyhKTcvJTM8oUbJW0NdXeNw8+XHz6sfNnS/WznjasfTp2gkA9YjFo1YAAAA="], ["H4sIAAf5amoC/z2OS4vCMBSF9/MrLllVaHUf6YCjXShiOm1dl5hebXwkJbkyE0r/u1XBszpwHnwAyhpP0FlH8prb0aYgfTAKooNtgjicJ5B+Q/8Fo95dl8o/qQmOSKqNfveiyupcFNViW++LbdzfkFrbcJaLsmJxi7JB53nPxjWhoYRCh4wz2XVXrSRpa2Znbw2L2X9yCw36S+JROSTGVz/1Il/XZbYssmqIn0R8U4rd1JPT5qSP4UM5TOYvxnF3dwbeiG76fI5e0TB/APnkVuftAAAA", "H4sIAAf5amoC/0WQX0vCUBjG7/sUh11N0nkbkwVmBoW0tc3rMeexTWyT7USNMWjn9JeCSKi8COqiiLTwOjD8MG8aXfkVmhb0XL3wvM/Djwchy3MDgtqeT8yW4qWnhMwgdC3E17x6KNeaGSQto2gBpcrnUUlWNWC3wHrAroG9AH0Edgq0852MILkCeg7JPdAEEbxP8u2W6bhoEX09d8eDY6BvwIaQDCZ3r5ObE0j646MnoBdpaDpMO/pA34GOgD0A6wJjwA5m/7Tz+TECeglJD5LD6fBszvLL7UvmnukQ1MDEsvmtqqyXDUVW9WLFqKqVbLSDie3VRU6RNZ3L2tisYz8QIy5NE+ySHAnbmBO5f9iCZZt+gIlU1ddyS1ycna0gbmjyphAQ33G3nUbIR4Ig/K2TDbDlYyKurhhFZd3QyiW1rMeZOFOYU6bWru+iX0hfaAaey8+tuPADenkSVHsBAAA="]]')
def dec(b): return gzip.decompress(base64.b64decode(b)).decode("utf-8")
raw=open(PATH,"rb").read(); had_crlf=b"\r\n" in raw
text=raw.replace(b"\r\n",b"\n").decode("utf-8")
applied=skipped=0
for eo,en in PAIRS:
    old,new=dec(eo),dec(en)
    if text.count(new)>=1: skipped+=1; continue
    c=text.count(old)
    if c==0:
        print("❌ 対象が見つかりません（現在のビルドを確認）:"); print("   "+old[:80].replace("\n"," / ")); sys.exit(1)
    if c!=1:
        print("❌ 対象が%d箇所（1箇所想定）: %s"%(c,old[:60])); sys.exit(1)
    text=text.replace(old,new,1); applied+=1
out=text.replace("\n","\r\n").encode("utf-8") if had_crlf else text.encode("utf-8")
open(PATH,"wb").write(out)
print("✅ v300 適用完了 (適用 %d / スキップ %d)"%(applied,skipped))
print("   ビルド: 2026-07-23-v300-quote-portal-nopreflight")
