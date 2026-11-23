import {
  AlphaType, ColorType, FilterMode, ImageFormat, MipmapMode, Skia, TileMode,
  type SkImage, type SkRuntimeEffect, type SkSurface,
} from '@shopify/react-native-skia';
import { hexRGB } from './colour';
import { HIGHLIGHT_SKSL, RECOLOUR_SKSL, WARP_SKSL } from './shaders';
import type { BodyType, Pixels } from './types';
import { warpUniforms } from './warpMath';

let fx: { recolour: SkRuntimeEffect; highlight: SkRuntimeEffect; warp: SkRuntimeEffect } | null = null;
function effects() {
  if (fx) return fx;
  const make = (src: string, name: string) => {
    const e = Skia.RuntimeEffect.Make(src);
    if (!e) throw new Error(`Shader failed to compile: ${name}`);
    return e;
  };
  fx = { recolour: make(RECOLOUR_SKSL, 'recolour'), highlight: make(HIGHLIGHT_SKSL, 'highlight'), warp: make(WARP_SKSL, 'warp') };
  return fx;
}

/** Upload unpremultiplied RGBA bytes as an image. */
export function imageFromRGBA(data: Uint8Array | Uint8ClampedArray, w: number, h: number, opaque = false): SkImage {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const img = Skia.Image.MakeImage(
    { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: opaque ? AlphaType.Opaque : AlphaType.Unpremul },
    Skia.Data.fromBytes(bytes), w * 4,
  );
  if (!img) throw new Error('Could not create image');
  return img;
}

/** Pack up to three 0–255 masks into the R, G and B channels of one opaque image. */
export function packMasks(masks: (Uint8Array | null)[], w: number, h: number): SkImage {
  const N = w * h, rgba = new Uint8Array(N * 4);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    rgba[p] = masks[0] ? masks[0][i] : 0;
    rgba[p + 1] = masks[1] ? masks[1][i] : 0;
    rgba[p + 2] = masks[2] ? masks[2][i] : 0;
    rgba[p + 3] = 255;
  }
  return imageFromRGBA(rgba, w, h, true);
}

/** Read an image's pixels as unpremultiplied RGBA. */
export function readRGBA(img: SkImage): Pixels {
  const w = img.width(), h = img.height();
  const px = img.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px || px instanceof Float32Array) throw new Error('Could not read pixels');
  return { w, h, data: px };
}

/** Draw an image (any size) into a w×h frame and read it back. */
export function resampleRGBA(img: SkImage, w: number, h: number): Pixels {
  if (img.width() === w && img.height() === h) return readRGBA(img);
  const s = offscreen(w, h);
  s.getCanvas().drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  s.flush();
  return readRGBA(s.makeImageSnapshot());
}

function offscreen(w: number, h: number): SkSurface {
  const s = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!s) throw new Error('Could not create a drawing surface');
  return s;
}

const nearest = (img: SkImage) => img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None);
const linear = (img: SkImage) => img.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None);

function shaderPass(w: number, h: number, effect: SkRuntimeEffect, uniforms: number[], children: ReturnType<typeof nearest>[]): SkImage {
  const s = offscreen(w, h);
  const paint = Skia.Paint();
  paint.setShader(effect.makeShaderWithChildren(uniforms, children));
  s.getCanvas().drawRect(Skia.XYWHRect(0, 0, w, h), paint);
  s.flush();
  return s.makeImageSnapshot();
}

export type LayerPiece = { image: SkImage; x: number; y: number; w: number; h: number };

/** Step 1: subject photo plus try-on pieces in layer order (alpha = mask R). */
export function layerOnGpu(src: SkImage, w: number, h: number, pieces: LayerPiece[]): SkImage {
  const s = offscreen(w, h), c = s.getCanvas();
  c.clear(Skia.Color('transparent'));
  c.drawImageRect(src, Skia.XYWHRect(0, 0, src.width(), src.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  for (const p of pieces) c.drawImageRect(p.image, Skia.XYWHRect(0, 0, p.w, p.h), Skia.XYWHRect(p.x, p.y, p.w, p.h), Skia.Paint());
  s.flush();
  return s.makeImageSnapshot();
}

export type RecolourStep = { masks: SkImage; channel: 0 | 1 | 2; hex: string; mean: number };

/** Steps 2–4: recolours in order, the selection highlight, then the body-type warp. */
export function finishOnGpu(layered: SkImage, w: number, h: number, steps: RecolourStep[], highlight: SkImage | null,
  warp: { bt: BodyType; cx: number; opaqueOutside: boolean }): SkImage {
  const e = effects();
  let img = layered;
  for (const st of steps) {
    const chan = [0, 0, 0]; chan[st.channel] = 1;
    img = shaderPass(w, h, e.recolour, [...chan, ...hexRGB(st.hex), st.mean], [nearest(img), nearest(st.masks)]);
  }
  if (highlight) img = shaderPass(w, h, e.highlight, [214 / 255, 36 / 255, 110 / 255], [nearest(img), nearest(highlight)]);
  if (warp.bt !== 'regular') img = shaderPass(w, h, e.warp, warpUniforms(warp.bt, w, h, warp.cx, warp.opaqueOutside), [linear(img)]);
  return img.makeNonTextureImage() ?? img;
}

/** JPEG data URL of the image scaled to `width` px wide (saved-look thumbnails). */
export function thumbnail(img: SkImage, width = 240): string {
  const h = Math.round((width * img.height()) / img.width());
  const s = offscreen(width, h), c = s.getCanvas();
  c.clear(Skia.Color('white'));
  const paint = Skia.Paint();
  c.drawImageRectOptions(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, width, h), FilterMode.Linear, MipmapMode.None, paint);
  s.flush();
  return 'data:image/jpeg;base64,' + s.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 75);
}
