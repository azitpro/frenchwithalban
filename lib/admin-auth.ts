import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Authentification HTTP Basic de l'espace d'administration.
 *
 * Appliquée par proxy.ts à /admin et /api/admin, puis revérifiée dans chaque
 * route /api/admin : une route ne doit jamais dépendre du seul proxy.
 * Le nom d'utilisateur est libre ; seul le mot de passe ADMIN_PASSWORD compte.
 */
export const ADMIN_REALM = 'Administration French with Alban';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false; // sans mot de passe configuré, tout est refusé

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return false;

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  const password = decoded.slice(separator + 1);

  // comparaison à durée constante, sur des empreintes de même longueur
  return timingSafeEqual(sha256(password), sha256(expected));
}

export function unauthorizedResponse(): Response {
  return new Response('Authentification requise.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${ADMIN_REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
