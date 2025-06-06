export const CACHE_BUSTER = Date.now().toString().slice(-5);
export const ASSETS_MOUNT_POINT = 'a';
export const POSITION_GAP_SIZE = 10_000;
export const NAVIGATION_CACHE_KEY = 'navigation-tree';
export const MAX_IMAGE_DIMENSION = 1_600;
export const MAX_IMAGE_SIZE = 10_000_000;
export const JPEG_QUALITY = 85;
export const MAGIC_TOKEN_EXPIRATION_MINUTES = 15;
export const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_COOKIE_NAME = 'session';
export const SEARCH_SNIPPET_LENGTH = 150;
// The search index is loaded in memory, so you may run out of memory.
// TODO: maybe move this to the .env? But does it make sense to have it configurable though?
export const MAX_INDEXABLE_DOCUMENTS = 1_000_000;
export const ANONYMOUS_AUTHOR_ID = 'Boxedo';
