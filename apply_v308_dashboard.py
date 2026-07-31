#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MyDesk v308 適用（対象店舗を都道府県ごとに折りたたみグループ化／見積表を1行おきに薄色＝見やすく）
使い方: dashboard.jsx と同じフォルダで  python3 apply_v308_dashboard.py"""
import gzip, base64, json, sys, os
PATH="dashboard.jsx"
if not os.path.exists(PATH):
    print("❌ dashboard.jsx が見つかりません。同じフォルダで実行してください。"); sys.exit(1)
PAIRS=json.loads('[["H4sIAJgXbGoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zU20C0zBtJlqXkp+UW6yfk5OYkFxam6iUWpiWmZOSWpRUrWCvr6Co+bJz9uXv24ufPF2hlPO5Y+XTsBAH8qRNZYAAAA", "H4sIAJgXbGoC/0vOzysuUfCNdHEN9o53CvX0cVGwVVAyMjAy0zUw1zU21C0zNrDQLS7JL0rVTS/KLy0o1q1KTSpKVLJW0NdXeNw8+XHz6sfNnS/WznjasfTp2gkANkf2HFAAAAA="], ["H4sIAJgXbGoC/33NwQrCMAwG4FeJt/Yy72LqYT6BspN4GCxqcXajKVjp+u6mc97EHEL4Q74AfCqpseIweOJpOp119WhHxQGN2h5LehiecKcXJg6V7TLISsYMNaY6g7cdJl9yOePG95iWIcPg6lvrroTJMRqmMHusfvyLaKLoiDh/2TneRK0LsaeeghBK/yEutg/kv8pqUQRYG2lvy0JjOOkAAAA=", "H4sIAJgXbGoC/1NQgACb4JL8olT3ovzSgmKFYhC72La6QA/CqqmJjq1VcLatdq5VKMpMsa0GErUKuYkFxaFFObbVUEatQnFqSTBUK5xZq28HABHRzbVkAAAA"], ["H4sIAJgXbGoC/9PXV3i6ft+LjQufLV37oqH1cdPqx817Hjd3vt/T8axrxuOmrseN88Fo/+Pm3S+WdT9f2fti4Yrop+27ns1d+nL1DP2n62a9XNgbC5R9sqPhWfcaIONx81yQIU1ALUDTdkNMftbc+nTBRiD3ZcOsFyuBjIWPmxe939MJAIEfBwGBAAAA", "H4sIAJgXbGoC/8VVW4vbRhR+318xK9oggZC9oW0W2eOlOG3oQwmsKX0whmitsT1YHglp1HijFaxtQnNpnlq6IWxoNzRlk23S5iWU3W3zX6rYaz/lL/TMSL51CS3tQ8HIc86c+eZ85zInl0PDn38fvzgYHu+Nb+0lvedJ/5dkcJQMTpPB3vjg8OyH4zentyaD3ya9r4fH+2f7XyW9b5LeYdI7Gt25n/TvJL3v5O/Vm9PbK42Q1Tl1Gapw1ydXfDf0AjVCgZACHZV15FNbRx3LCz7zHR0FhEvLAMVatIJQ3WUBR1XXI+yKDptXxaKGN4lV50YYkAq3OFGjWCvMjD2fNK42cMBxqcJ9yppqwA3LJ9bOjqJoBqg6qgZrYJH0D5PB06T/aLT/dHz4bPj8AfiszKGa0l8cxYVM4fo28XG1JkzUlMTOTrWmGQ3X/8iqt1Rxa5QZt3HqCii1AqINdTXFq7ZrWjRbCjQJa3hh0FLbWiFGs81UJ88vUgw9G7MAl2bRUpecgWiqXVzqGtTGGAzhf4MFZldbgLCJg2H7bRAN6nDiT1FWMdgun26ITOClMw5hTd4q4rW8MAS+Ka2ZWiYUIZ/w0GdILdr0CyiEbYfgKLJp4DnWtqk0HNJVdPG9TH0ia8dU6q4TdpiiNy3PVPLG+z7pKHFcis6xFuFXi5LQpnsdtck2jiD71I7hJrGMURlH5VhUHY58oc9KD0fZIkYuK7cs1gS3IM5CvEwcwkFUNVyCuKkSUYtzJU2LizmgUZKhiVfm5CTTf8/wvYyhhEEoSiMpGLbn9UUDmQPZG6KQMA4ZJIYyYm9kCTKnm4Vlz2beyQi1ZxdJ/VbIOXQshMGh9XZKe9p6amQYRtqNgGqupj7EWvw2npZDm+wTTjoBkCQMimo5jfp1avOWqazl8+8qOidd/qE4YSoOaXBF9yzbhhaWMRH2KG9ckse2ZEg2LZuGgbmeiea1Na+LAtehNnonKhupNr6mb1n1tmgqZpugber10A9c31Q8l6YuNVzGP7Y61AHHKWsRn/KF+GeBCTyLzXiKExV6gwjXLl2UPkESAbRsCBafhpzYokbTCG0of3x7qpjwfalAzQikvwP/nNBmi5vr+by+eNf6+bvENe1/iDpz+RxKJdwSQPO3J23c+PXJy/PQxVxaJYu6jOqFC/+x7vWO5Tcpm8ooD0m/mOb+g+W+yO6du/z/vAFLcRHPwVyTypkIT3tmPFPDwxGvrOSmQ3f0+Nl492bST8ftbRhRf5mpyeBk/OPdsyf3YBJXh18ejx4+nhzdz8Hkmhzcq8Hu6193R3d/gkUyeChA+q/k8D5JkUeDm8PvX4A42X0wfgKLg2TwCGben/pb/OX2BwAA"], ["H4sIAJgXbGoC/03NsQrCMBSF4Ve5BMcQquISrItToaMP0Oi9xotpGpIgLSHvbqWLZ/zO8AP874z8gTctbYmKM40dVkh5cdSWgpyCM4sWT0ezkNYELRp1OEUahQwGkb39yXEFaNTm9ykixdsU9LAPM6TJMcKuXNV29GxfuQ7SOLa+W4NJiwf5TFHUevkCOr06bZwAAAA=", "H4sIAJgXbGoC/02OvQ7CIBSFX4UQ3RqiNS7E6uDUxNEHKPYivSkFAqhtCO8upotn/E7ODyH/OgG+ySiXJnmGUU4tZBLiomWTEmBwWiycPrWcaaWE43TH6qOXE62cAECjfuRQANmxlT+sB+nv1vFu72YSrEYgm3Rlq3FDNcTcVUKjMm0ZDJz20kTpS1T0o/L2ZYB73NaXkin9n6H8ojmfv435oru5AAAA"]]')
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
print("✅ v308 適用完了 (適用 %d / スキップ %d)"%(applied,skipped))
print("   ビルド: 2026-07-31-v308-store-groups-zebra")
