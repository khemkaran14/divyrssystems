import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';

const cache = new Map<number, Promise<SkImage>>();

/** Decode a bundled image (require() id) with Skia. Masks are PNG and decode losslessly. */
export function loadSkImage(mod: number): Promise<SkImage> {
  let p = cache.get(mod);
  if (!p) {
    p = (async () => {
      const asset = Asset.fromModule(mod);
      if (!asset.localUri) await asset.downloadAsync();
      const data = await Skia.Data.fromURI(asset.localUri || asset.uri);
      const img = Skia.Image.MakeImageFromEncoded(data);
      if (!img) throw new Error(`Could not decode ${asset.name}`);
      return img;
    })();
    cache.set(mod, p);
    p.catch(() => cache.delete(mod));
  }
  return p;
}
