import { Platform } from 'react-native';

/** Public site address; product photos are served from the website's /products and /images folders. */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://almukarramah-platform.vercel.app';

/** Turns a stored image path ("/products/x.jpg") into a URL the website and the apps can both load. */
export function imageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return Platform.OS === 'web' ? path : `${SITE_URL}${path}`;
}
