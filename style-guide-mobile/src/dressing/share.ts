import { ImageFormat, type SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';

function writeJpeg(img: SkImage): string {
  const file = new File(Paths.cache, `styled-${Date.now()}.jpg`);
  file.create({ overwrite: true });
  file.write(img.encodeToBytes(ImageFormat.JPEG, 92));
  return file.uri;
}

/** Share the styled photo through the system share sheet. */
export async function shareImage(img: SkImage) {
  const uri = writeJpeg(img);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your look' });
}

/** Save the styled photo to the phone's photo library. */
export async function saveImageToPhotos(img: SkImage) {
  const perm = await requestPermissionsAsync(true);
  if (!perm.granted) throw new Error('Allow photo access in Settings to save looks');
  await Asset.create(writeJpeg(img));
}
