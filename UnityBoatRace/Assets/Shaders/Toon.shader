// ウマ娘/イナイレ系の「アニメ調だが立体感のある」セルシェーディング。
// ・3段ランプ(境界はソフト)＋落ち影の受光＋球面調和の環境光で奥行きを出す
// ・裏面押し出しの輪郭線でアニメらしさを残す
// ・リムライト/トゥーンスペキュラ/フォグ対応
Shader "BoatRace/Toon"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Texture", 2D) = "white" {}
        _OutlineWidth ("Outline Width", Range(0, 0.01)) = 0.0018
        _OutlineColor ("Outline Color", Color) = (0.06, 0.09, 0.18, 1)
        _SpecStrength ("Specular Strength", Range(0, 1)) = 0.30
        _RimColor ("Rim Color", Color) = (0.72, 0.86, 1.0, 1)
        _ShadeTint ("Shade Tint", Color) = (0.55, 0.62, 0.82, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }

        // ---- 輪郭線(裏面を法線方向へ押し出す) ----
        Pass
        {
            Cull Front
            ZWrite On
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _OutlineWidth;
            fixed4 _OutlineColor;

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };

            float4 vert (appdata v) : SV_POSITION
            {
                float4 pos = UnityObjectToClipPos(v.vertex);
                float3 n = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                float2 offset = normalize(n.xy + 1e-5) * _OutlineWidth * pos.w * 2.0;
                pos.xy += offset;
                return pos;
            }

            fixed4 frag () : SV_Target { return _OutlineColor; }
            ENDCG
        }

        // ---- 本体(影を受ける3段トゥーン) ----
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

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            fixed4 _RimColor;
            fixed4 _ShadeTint;
            float _SpecStrength;

            struct appdata_t
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 texcoord : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 normal : TEXCOORD1;
                float3 world : TEXCOORD2;
                SHADOW_COORDS(3)
                UNITY_FOG_COORDS(4)
            };

            v2f vert (appdata_t v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.texcoord, _MainTex);
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.world = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o)
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 n = normalize(i.normal);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float atten = SHADOW_ATTENUATION(i);

                // 3段ランプ。境界をわずかにぼかしてアニメ塗りのまま立体を保つ
                float ndl = saturate(dot(n, L));
                float ramp = smoothstep(0.010, 0.055, ndl) * 0.30
                           + smoothstep(0.240, 0.300, ndl) * 0.30
                           + smoothstep(0.600, 0.680, ndl) * 0.40;
                ramp *= lerp(0.40, 1.0, atten);          // 落ち影で沈める

                // 環境光は球面調和(空/地面のグラデ)。一律加算をやめて白飛びを防ぐ
                float3 ambient = ShadeSH9(float4(n, 1.0)) * _ShadeTint.rgb * 1.35;

                float3 viewDir = normalize(_WorldSpaceCameraPos - i.world);
                float rim = pow(1.0 - saturate(dot(viewDir, n)), 3.5) * 0.32;
                float3 h = normalize(L + viewDir);
                float spec = smoothstep(0.90, 0.965, saturate(dot(n, h))) * atten;

                float3 col = tex.rgb * (ambient + _LightColor0.rgb * ramp)
                           + _RimColor.rgb * rim
                           + _LightColor0.rgb * spec * _SpecStrength;

                fixed4 outc = fixed4(col, 1.0);
                UNITY_APPLY_FOG(i.fogCoord, outc);
                return outc;
            }
            ENDCG
        }

        // ---- 追加ライト(ナイターの照明塔) ----
        Pass
        {
            Tags { "LightMode" = "ForwardAdd" }
            Blend One One
            ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdadd
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            fixed4 _Color;

            struct appdata_t
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 normal : TEXCOORD0;
                float3 world : TEXCOORD1;
            };

            v2f vert (appdata_t v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.world = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.normal);
                float3 toLight = _WorldSpaceLightPos0.xyz - i.world * _WorldSpaceLightPos0.w;
                float dist = length(toLight);
                float3 L = toLight / max(dist, 1e-4);
                float ndl = saturate(dot(n, L));
                float band = smoothstep(0.05, 0.12, ndl) * 0.45 + smoothstep(0.45, 0.55, ndl) * 0.55;
                float falloff = 1.0 / (1.0 + dist * dist * 0.00004);
                return fixed4(_Color.rgb * _LightColor0.rgb * band * falloff, 1.0);
            }
            ENDCG
        }

        // ---- 影を落とす ----
        Pass
        {
            Tags { "LightMode" = "ShadowCaster" }
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_shadowcaster
            #include "UnityCG.cginc"

            struct v2f { V2F_SHADOW_CASTER; };

            v2f vert (appdata_base v)
            {
                v2f o;
                TRANSFER_SHADOW_CASTER_NORMALOFFSET(o)
                return o;
            }

            float4 frag (v2f i) : SV_Target { SHADOW_CASTER_FRAGMENT(i) }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
