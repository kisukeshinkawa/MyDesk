// リアル水面: 手続き波法線 + 太陽スペキュラ + フレネル空映り込み + 艇の落ち影
// テクスチャ不要・全て数式で動く水。Built-in RP ForwardBase。
Shader "BoatRace/Water"
{
    Properties
    {
        _Color ("Water Color", Color) = (0.12, 0.42, 0.75, 1)
        _DeepColor ("Deep Color", Color) = (0.03, 0.14, 0.32, 1)
        _SkyColor ("Sky Reflect Color", Color) = (0.74, 0.88, 0.99, 1)
        _WaveScale ("Wave Strength", Range(0, 0.5)) = 0.16
        _SpecPower ("Specular Power", Float) = 260
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        Pass
        {
            Tags { "LightMode" = "ForwardBase" }
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #pragma multi_compile_fog
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            fixed4 _Color, _DeepColor, _SkyColor;
            float _WaveScale, _SpecPower;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 wpos : TEXCOORD0;
                SHADOW_COORDS(1)
                UNITY_FOG_COORDS(2)
            };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o)
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            // 3方向のsin波の勾配を合成した動く法線(ノーマルマップ不要)
            float3 waveNormal(float2 p, float t)
            {
                float2 d1 = normalize(float2(1.0, 0.55));
                float2 d2 = normalize(float2(-0.72, 1.0));
                float2 d3 = normalize(float2(0.35, -1.0));
                float2 grad =
                    d1 * cos(dot(p, d1) * 0.50 + t * 1.4) * 0.50 * 0.55 +
                    d2 * cos(dot(p, d2) * 0.95 + t * 2.0) * 0.95 * 0.30 +
                    d3 * cos(dot(p, d3) * 1.80 + t * 2.9) * 1.80 * 0.15;
                grad *= _WaveScale;
                return normalize(float3(-grad.x, 1.0, -grad.y));
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float t = _Time.y;
                float3 n = waveNormal(i.wpos.xz, t);
                float3 n2 = waveNormal(i.wpos.xz * 3.6 + 31.7, t * 1.7); // 細かいさざ波
                n = normalize(n + n2 * 0.45);

                float3 viewDir = normalize(_WorldSpaceCameraPos - i.wpos);
                float3 lightDir = normalize(_WorldSpaceLightPos0.xyz);

                // 波の起伏で水色に濃淡
                float ndl = saturate(dot(n, lightDir));
                fixed3 col = lerp(_DeepColor.rgb, _Color.rgb, 0.30 + 0.70 * ndl);

                // 艇や建物の影を受ける(水面の落ち影で立体感)
                fixed atten = SHADOW_ATTENUATION(i);
                col *= lerp(0.62, 1.0, atten);

                // フレネル: 視線が浅い角度ほど空の色が映り込む
                float fres = pow(1.0 - saturate(dot(n, viewDir)), 3.0);
                col = lerp(col, _SkyColor.rgb, fres * 0.62);

                // 太陽のスペキュラ(波に乗ってギラギラ揺れる)
                float3 h = normalize(lightDir + viewDir);
                float spec = pow(saturate(dot(n, h)), _SpecPower);
                col += _LightColor0.rgb * spec * 1.4 * atten;

                UNITY_APPLY_FOG(i.fogCoord, col);
                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
