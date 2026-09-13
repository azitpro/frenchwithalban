import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';

/**
 * Protège tout l'espace d'administration, pages et routes API comprises :
 * le navigateur demande le mot de passe avant même que la page se charge.
 */
export function proxy(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
