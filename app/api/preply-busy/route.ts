import { NextResponse } from 'next/server';
import { chargerOccupations } from '@/lib/preply-ical';

/** Plages occupées sur Preply, sans aucun nom : lues par la page publique des créneaux. */
export async function GET() {
  if (!process.env.PREPLY_ICAL_URL) {
    return NextResponse.json({ error: 'PREPLY_ICAL_URL not configured' }, { status: 500 });
  }
  const occupations = await chargerOccupations();
  if (!occupations) {
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
  return NextResponse.json(occupations);
}
