import { NextResponse } from 'next/server';
import { donneesPubliques } from '@/lib/placement';

// Questions et barème du test de placement : générés une fois au build, servis comme un fichier statique.
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(donneesPubliques());
}
