import { readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ASSETS_MOUNT_POINT,
  CACHE_BUSTER,
  CLIENT_BUNDLE_LOCATION,
} from '~/constants';

export const cssFile = `/${ASSETS_MOUNT_POINT}/css/style.css?_=${CACHE_BUSTER}`;
type Bundle = 'app' | 'editor';

const bundleNames: Record<Bundle, string> = {
  app: '',
  editor: '',
};

export const getBundleFilename = (bundle: Bundle): string => {
  // In production, we know the name of the JS bundle as we start
  // and we don't need to read the directory again and again
  if (process.env.NODE_ENV === 'production' && bundleNames[bundle] !== '') {
    return bundleNames[bundle];
  }

  try {
    const files = readdirSync(
      path.join(__dirname, CLIENT_BUNDLE_LOCATION)
    ).filter((file) => file.startsWith(`${bundle}-`) && file.endsWith('.js'));

    if (files.length === 1) {
      bundleNames[bundle] = `/${ASSETS_MOUNT_POINT}/js/${files[0]}`;
      return bundleNames[bundle];
    }
  } catch {
    // Never mind
  }

  return '';
};
