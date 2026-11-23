import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Share a saved look's JPEG thumbnail (data URL). */
export async function shareDataUrl(dataUrl: string) {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File(Paths.cache, `look-${Date.now()}.jpg`);
  file.create({ overwrite: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg' });
}
