#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MyDesk v302 適用（対象店舗のインポートを1ボタン化：テンプレDL / アップロード取込を選択）
使い方: dashboard.jsx と同じフォルダで  python3 apply_v302_dashboard.py"""
import gzip, base64, json, sys, os
PATH="dashboard.jsx"
if not os.path.exists(PATH):
    print("❌ dashboard.jsx が見つかりません。同じフォルダで実行してください。"); sys.exit(1)
PAIRS=json.loads('[["H4sIAL5La2oC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zUy0S0zNjDULSzNL0nVLS7JL0rVLSjKTM7MS1eyVtDXV3jcPPlx8+rHzZ0v1s542rH06doJAGJ3xCpRAAAA", "H4sIAL5La2oC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zUy1S0zNjDSLS7JL0rVzcwtyC8q0S1JzS3ISSxJVbJW0NdXeNw8+XHz6sfNnS/WznjasfTp2gkA23c2NFMAAAA="], ["H4sIAL5La2oC/1NQSM7PKy5RiC7ILypJzHEqLa7UUShOLQmAc2MVbBWCUhOTS/RKi1ODSxJLUjWUlDStAUrMEac5AAAA", "H4sIAL5La2oC/1NQSM7PKy5RiC7ILypJzHEqLa7UUShOLQmAc2MVbBWCUhOTS/RKi1ODSxJLUjWUlDStuRRgOjNzC3xT80rB2jwhbCx60hJzilORtKVl5qQGpaYhKwRyNfJKc3I0rQFMcsTwlgAAAA=="], ["H4sIAL5La2oC/1NQSM7PKy5RyEjMS8lJda1ITs1RsFVILK7MS1bQSNVUsLVTqAYAnoTlOiQAAAA=", "H4sIAL5La2oC/21UX0/bSBB/v0/hy0Pl6IiJnYAqkOndwyGdTtW93BuqkJNsm6hOHMVGpiJIsX1AaEhNCyhQkiY0tEe5FkqvFZDS9rt0WTt54it0NhtSmtZa2zOz8/e3s8NxcS2jG1xCMzOqpiT+RumsqhiIkzlFv5eJc3yQkye4uZ84eHRk/JHO3kSZGf62ouooON4VG7l7bJ/rOZtV9dmbWkJWTCVlcKl0VssZfCBpGFl9bHgY6WlBTw5TpV/DgnhdGAkEx69Yyj1zIYFuKzOqkc/3BOPfBEkiJYFy8lTA39gn7nFgKOA9e+UtlIDA9h529rH99OKs2HE+dKw10qr61RXsvCcnNllp+estr/bw4myZWpUavn1KVssXZy5pVdrFCtAgP//gessFSnyq+Qc7pPEWWPCAnQK2T7FTxE4VOw62D4H1nAXSOAIPnfK7r/k8eESWWmTN8rcPgCXbT4j7oNN4T1rPgRWBx5aNrTq273sbrztLLpW2n5YgiEgKpf5mZ6nMNom91S44UBQ5eQUWtJyPa1A1WdthrL982t7bPG+VOo0FWt2tbyFDsyLgJVJP3UIpPM03nWadIeE/d8mbHcCJrFTOT2vk+AmgBfLPlRIsMOHIa5cUqCouPLoelkLhcFjkrmozBZAAyGJICkVAt910idv8IWw0gfI7UYpEWQbEPfSXHGytY+sTsJ3CUQRQAkoCWOA3cvfOMKMYApEwPbRLDEbpwX1fcgxqBouBdX5SHgglslAiCxDph/q8+JCsrmBrk3UKtg4kdqbYtnDB/g0XqpOkWMHWof+i5b38B1v//vXn93lIkIZEA7dKpLTFWquPOCOuwo3tfexsYLsJMPUAFyngosj1lUn5Mdl9DFBHQyOhUZr7JNfZXvRflJl74u76b7doJ1aLEqtuxKvVqWIYymPkYKY5zdTlKXa7hgA++sbgIw3ogRa9l8KMkVJ1QdGUaUOb1pMIGTx1EbzUNvWpwM9xTdUDt2TmVUgrWZ5PDqWC8gQ/Z8aTY3xKluVIPk9/0eANKQqSCXn0hhgdE6XgfDA4EDp2NXRM0+5OZ5DJwxQZFCvZLMokemmZsSFTh37c2yQLz7B9jJ0z6MdA33nX2MylDDSZUhFV790TbO9i53/s1JgFdha7bAU7LwVqdOliPq4Y8SSPgnOcmcrASBUUFdHRd9UC+sdfr3vFVWz9R3aPvA3oHFgfu9/6GBf4hUfXriEhjXRduYPyeQTlc/MQYJ5G6Q0/JZNQ0e+zcaR+ndSIjeov7bQ6uNMFAAA="], ["H4sIAL5La2oC/52TP2/UMBjGdz6FsRhaKeSOP9WhKDlEC0hITNzQtU78Xs46x44c58gRRYKJlhs6tUIsMFRUqlRmhgDfBUh12/ERSHw0VcQEHhL5cd7nfexfjNB6uJTNUKLnHLw8j4gKmXgKY+1gkmqJLcqSmJO5g8ccMmyFJHZw376rIMJFMbyG2uFy4gNvndo6JjgTcHNdTjgLxRMNUeLgAIQG1VreaSytmFDKRGiErVpBfXtgFnypKKhnhLI0ce79mTp7t+ytOEOJ5IyiG/mOTYLGttizfBJMQyVTQZ1LdTu0AsmlaoWHRE2tsRR6F1g40c6g3zfTEXsBTYLBbdM6SFVSV+FYMpO4u2+EchbF22kyv4+XZ+fLr+XPz+ffX37EDv71/uQYPcoC4NXhcb2wKvcvTt9W5eHy9Vm1OKr2T6pP71blAS46fi4TcaqRnsfg4THjgFGTN9YetjOeZFbzxEiKnQkRYX3Y9YtyMI2KvwEIKaDOjGqB+Byod5m36HX49QzAjuSnWkvRdOIsmHr5xqY3TECPtFTwgNKNmTe8Ptu86vnP9Drs1mqXHX4+YRpwC05Dpkep/x/UzDePScS4+SknoJhuUK7KBbo4WNQ8frw6XX77Ur354PbWG786C7dX35Lhb5ieuU0zAwAA", "H4sIAL5La2oC/7WUTUsbQRiA7/6K6dBKAktcP1LLaixqWxD0ooJXNzuzyeBkZtmdjdGwoEmxWg9CRS2F0hasgtVeepGS2v/iNpKe7E/ozMaPRJNSqN1DknkzO+/M8z7vAFB/BhHJA08sUJwqFnOmmyFsHNvCgKYvONQQ8RxqLhjQprgAtYzpGFBP9Lk4B4NgqANcPU3rONwjgnBmQBdTU5A8vjFbzk/7QnAGOBulxJpLFWPx1JCHxVjOmcDMj+VTQ/fy8eB6SRMhwjIqe29Spgd6ol/tQktzF2F30kTE94xHF0NjtjuRdArA45QgcL84mjAtCzMRzGpp05rLuNxnyLiMjmQ0i1PuXgWemO6cZnMmZjDJZIXRr+vRcIosYrWD/p4oteW7nnwLOpwwgV0YzXlm5giVwAjLYpcIdfAiyTkjvrfwGNYOjmonlR/HR6dLe9CAv95tfgTVrzu11Z2wtBuWv4Tlt2G5EpZXwen2CQwGu+qUmtGp5RSjzs5YU7xtEcy05OALDDXBZf26df0B1NzoZLq2OMYQLhh9eiMZOJ8lav4VzSaW9ahieZN9YSprIj4vQXrRjwmk1Z2alon7tBxhMwSJrNHTq2s8j12byskwSxDC7JYiLTWRizLKTTSNc1JMga8NuVI1Tbk1B7X5KNPFaQUuiGFKMpIGlXpDrcGn5KVPyQahDMg4UwRuQ/mrsjf78rDuy4VkajPysLL6z0F1Y1saEZZXourvhOXDsPQqLC+Fpb0ochT5sNbahLaNVGzoJNukHo4PAGLHbELxJLYT8gSu1DwObgQSlloiFh8I/jvWaKSsaOnWuJKzuVnvmv7p4cr58QYIy1th6UPUfZ8k+Z/Lx2FpM1zer9flvLJ6tv+6WtmovTiorm9VV3ern9+cV9qWY7BLdmBzMB50/OH/dtfglOAuHkbo3+/BNp3bAmwDnyk/fYf333llHZytrUuAEmzt+7fqy/etAA4S5vgCiAUHp6AyEwIX26nihaQBUJezI1IwUaBeQVOfUIHLmiwj0cgvRPHTgoVpC3sj7YKg6zphvRa/AXKMgkcIBwAA"]]')
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
print("✅ v302 適用完了 (適用 %d / スキップ %d)"%(applied,skipped))
print("   ビルド: 2026-07-25-v302-store-import-template")
