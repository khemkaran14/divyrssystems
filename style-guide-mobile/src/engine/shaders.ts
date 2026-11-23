/**
 * SkSL runtime shaders for the Dressing Room. They run the same maths as the CPU reference
 * (recolour.ts, bodyType.ts). Children are premultiplied, so each shader unpremultiplies first.
 */

/** Recolour one mask (a channel of a packed RGB mask image) towards `target`. SPEC 6.4. */
export const RECOLOUR_SKSL = `
uniform shader img;
uniform shader mask;
uniform float3 chan;
uniform float3 target;
uniform float mean;
half4 main(float2 p) {
  half4 c = img.eval(p);
  float a = dot(float3(mask.eval(p).rgb), chan);
  if (a <= 0.0) { return c; }
  float3 rgb = c.a > 0.0 ? float3(c.rgb) / float(c.a) : float3(c.rgb);
  float s = dot(rgb * 255.0, float3(0.299, 0.587, 0.114)) / mean;
  float3 v = s <= 1.0 ? target * pow(s, 1.15) : target + (1.0 - target) * min(1.0, (s - 1.0) * 1.2);
  float3 o = rgb * (1.0 - a) + min(v, float3(1.0)) * a;
  return half4(half3(o * float(c.a)), c.a);
}`;

/** 50 % rani highlight over a selected, uncoloured region. */
export const HIGHLIGHT_SKSL = `
uniform shader img;
uniform shader mask;
uniform float3 hl;
half4 main(float2 p) {
  half4 c = img.eval(p);
  if (mask.eval(p).r <= 0.502) { return c; }
  float3 rgb = c.a > 0.0 ? float3(c.rgb) / float(c.a) : float3(c.rgb);
  rgb = rgb * 0.5 + hl * 0.5;
  return half4(half3(rgb * float(c.a)), c.a);
}`;

/**
 * Body-type warp (SPEC 6.6). The width keys are uniforms (9 points, padded with y = 1), so the
 * per-row tables are evaluated exactly in the shader instead of being read from a texture.
 */
export const WARP_SKSL = `
uniform shader img;
uniform float2 size;
uniform float cx;
uniform float opaqueOutside;
uniform float kk;
uniform float legScale;
uniform float y0;
uniform float ky[9];
uniform float kf[9];
float widthAt(float t) {
  for (int i = 1; i < 9; i++) {
    if (t <= ky[i]) {
      float d = ky[i] - ky[i - 1];
      return kf[i - 1] + (kf[i] - kf[i - 1]) * (t - ky[i - 1]) / (d == 0.0 ? 1.0 : d);
    }
  }
  return kf[8];
}
half4 main(float2 p) {
  float y = floor(p.y);
  float yv = y * kk;
  float f = widthAt(y / size.y) / kk;
  float vy = yv;
  if (legScale > 0.0 && yv > y0) { vy = y0 + (yv - y0) / legScale; }
  vy = min(size.y - 1.0, vy);
  float sx = cx + (floor(p.x) - cx) / f;
  if (sx < 0.0 || sx > size.x - 1.0) { return opaqueOutside > 0.5 ? half4(0, 0, 0, 1) : half4(0); }
  return img.eval(float2(sx + 0.5, vy + 0.5));
}`;
