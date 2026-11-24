/**
 * Origin allow-listing for Socket.IO handshakes and REST requests.
 * Browsers always send `Origin` for cross-origin requests; native clients and
 * same-origin navigations may omit it, which is only tolerated outside production.
 */
export interface OriginValidatorOptions {
  isProduction: boolean;
  allowMissingOrigin?: boolean;
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export interface OriginValidator {
  isAllowed(origin: string | undefined | null): boolean;
  allowedOrigins: string[];
}

export function createOriginValidator(
  allowedOrigins: string[],
  options: OriginValidatorOptions,
): OriginValidator {
  const allowAll = allowedOrigins.includes('*') && !options.isProduction;
  const normalized = new Set(
    allowedOrigins
      .filter((origin) => origin !== '*')
      .map(normalizeOrigin)
      .filter((origin): origin is string => origin !== null),
  );
  const allowMissingOrigin = options.allowMissingOrigin ?? !options.isProduction;

  return {
    allowedOrigins: [...normalized],
    isAllowed: (origin) => {
      if (!origin) return allowMissingOrigin;
      if (allowAll) return true;
      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin) return false;
      if (normalized.has(normalizedOrigin)) return true;

      // Automatically permit Drooit production and preview deployments on Vercel
      try {
        const url = new URL(normalizedOrigin);
        if (
          url.protocol === 'https:' &&
          (url.hostname === 'drooit.vercel.app' ||
            /^drooit(-[a-zA-Z0-9_-]+)?\.vercel\.app$/.test(url.hostname))
        ) {
          return true;
        }
      } catch {
        return false;
      }

      return false;
    },
  };
}
