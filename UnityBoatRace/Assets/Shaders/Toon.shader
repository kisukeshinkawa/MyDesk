// イナズマイレブン風セルシェーディング:
// 3段階のアニメ塗り + 裏面押し出しの輪郭線 + リムライト
Shader "BoatRace/Toon"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _MainTex ("Texture", 2D) = "white" {}
        _OutlineWidth ("Outline Width", Range(0, 0.01)) = 0.0025
        _OutlineColor ("Outline Color", Color) = (0.06, 0.09, 0.18, 1)
        _SpecStrength ("Specular Strength", Range(0, 1)) = 0.28
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" }

        // ---- 輪郭線(裏面を法線方向へ押し出す) ----
        Pass
        {
            Cull Front
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

        // ---- トゥーンライティング本体 ----
        Pass
        {
            Tags { "LightMode" = "ForwardBase" }
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            float _SpecStrength;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 normal : TEXCOORD1;
                float3 world : TEXCOORD2;
            };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.texcoord, _MainTex);
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.world = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 n = normalize(i.normal);
                float ndl = dot(n, _WorldSpaceLightPos0.xyz) * 0.5 + 0.5;

                // 3段トゥーンランプ(アニメ塗り・コントラスト強めでパキッと)
                float band = ndl > 0.64 ? 1.05 : (ndl > 0.36 ? 0.72 : 0.44);
                float3 light = _LightColor0.rgb * band + float3(0.34, 0.37, 0.42);

                // リムライト(輪郭を白く光らせてセル画っぽく)
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.world);
                float rim = pow(1.0 - saturate(dot(viewDir, n)), 3.0) * 0.22;

                // トゥーン調スペキュラ(カウルや水しぶきに艶のハイライト)
                float3 h = normalize(_WorldSpaceLightPos0.xyz + viewDir);
                float spec = smoothstep(0.86, 0.93, saturate(dot(n, h)));

                float3 col = tex.rgb * saturate(light) + rim
                           + _LightColor0.rgb * spec * _SpecStrength;
                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
