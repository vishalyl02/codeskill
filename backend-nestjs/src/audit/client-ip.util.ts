/**
 * Accurately extracts the client's real IP address across load balancers,
 * Cloudflare, Nginx, and campus NAT reverse proxies.
 */
export function resolveClientIp(req: any): string {
  if (!req) return '';

  const headers = req.headers || {};

  // 1. Cloudflare connecting IP
  const cf = headers['cf-connecting-ip'];
  if (cf && typeof cf === 'string') {
    return cf.trim();
  }

  // 2. Standard X-Forwarded-For (client is the first IP in the list)
  const xff = headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    const firstIp = xff.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  // 3. X-Real-IP (used by Nginx and custom proxies)
  const xReal = headers['x-real-ip'];
  if (xReal && typeof xReal === 'string') {
    return xReal.trim();
  }

  // 4. Fallback to Express / Socket remote address
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
}

/**
 * Extracts a concise user agent / browser descriptor from request headers.
 */
export function resolveUserAgent(req: any): string {
  if (!req) return '';
  return req.headers?.['user-agent'] || '';
}
