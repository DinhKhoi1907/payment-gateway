export function getLaravelUrl() {
  if (typeof window !== 'undefined') {
    if (window.env?.LARAVEL_URL) {
      return window.env.LARAVEL_URL;
    }
    if (window.__LARAVEL_URL__) {
      return window.__LARAVEL_URL__;
    }
  }

  if (typeof import.meta !== 'undefined') {
    const laravelFromImportMeta =
      import.meta.env?.LARAVEL_URL || import.meta.env?.VITE_LARAVEL_URL;
    if (laravelFromImportMeta) {
      return laravelFromImportMeta;
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const laravelFromProcess =
      process.env.LARAVEL_URL || process.env.VITE_LARAVEL_URL;
    if (laravelFromProcess) {
      return laravelFromProcess;
    }
  }

  return 'http://localhost:8000';
}

