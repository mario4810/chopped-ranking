import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

export type PickedAsset = { uri: string; width: number; height: number };

/**
 * Center-crops to a square (picker's aspect:[1,1] editing UI is native-only —
 * web ignores it) and downsizes/re-encodes so uploads stay well under the
 * backend's upload size limit. Falls back to the original uri if manipulation
 * fails for any reason.
 */
export async function compressImageUri(asset: PickedAsset): Promise<string> {
  try {
    const side = Math.min(asset.width, asset.height);
    const originX = Math.round((asset.width - side) / 2);
    const originY = Math.round((asset.height - side) / 2);

    const actions: Action[] = [{ crop: { originX, originY, width: side, height: side } }];
    if (side > MAX_DIMENSION) {
      actions.push({ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } });
    }

    const result = await manipulateAsync(asset.uri, actions, {
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return asset.uri;
  }
}
