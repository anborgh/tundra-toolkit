import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: [ 'src/utils/storage.ts' ],
  bundle: true,
  format: 'iife',
  globalName: '__TT_STORAGE_MODULE__',
  outfile: 'src/scripts/safeStorage.js',
  footer: {
    js: `
globalThis.__TT_SAFE_STORAGE__ = {
  STORAGE_FALLBACKS_KEY: __TT_STORAGE_MODULE__.STORAGE_FALLBACKS_KEY,
  getStorageFallbacks: __TT_STORAGE_MODULE__.getStorageFallbacks,
  isStorageKeyLocal: __TT_STORAGE_MODULE__.isStorageKeyLocal,
  isStorageItemLocal: __TT_STORAGE_MODULE__.isStorageItemLocal,
  isChunkedStorageChange: __TT_STORAGE_MODULE__.isChunkedStorageChange,
  safeStorageSet: __TT_STORAGE_MODULE__.safeStorageSet,
  safeStorageGet: __TT_STORAGE_MODULE__.safeStorageGet,
  safeStoragePromoteFallbacks: __TT_STORAGE_MODULE__.safeStoragePromoteFallbacks,
  ensureMigrated: __TT_STORAGE_MODULE__.ensureMigrated,
  getItemLocation: __TT_STORAGE_MODULE__.getItemLocation,
  getCollectionLocations: __TT_STORAGE_MODULE__.getCollectionLocations,
  setItemCloudPinned: __TT_STORAGE_MODULE__.setItemCloudPinned,
};
`,
  },
});

console.log('safeStorage.js rebuilt from storage.ts');
