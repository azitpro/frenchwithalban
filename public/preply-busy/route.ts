import { NextResponse } from 'next/server';

type BusySlot = { date: string; startHour: number; endHour: number };

function parseICSDateTime(value: string): { y: number; mo: number; d: number; h: number; mi: number; isUTC: boolean } {
  const isUTC = value.endsWith('Z');
  const clean = value.replace('Z', '');
  const y = parseInt(clean.slice(0, 4));
  const mo = parseInt(clean.slice(4, 6));
  const d = parseInt(clean.slice(6, 8));
  const h = parseInt(clean.slice(9, 11));
  const mi = parseInt(clean.slice(11, 13));
  return { y, mo, d, h, mi, isUTC };
}

function toParisLocal(parsed: ReturnType<typeof parseICSDateTime>) {
  if (!parsed.isUTC) {
    return { date: `${parsed.y}-${String(parsed.mo).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`, hour: parsed.h + parsed.mi/60 };
  }
  const utcDate = new Date(Date.UTC(parsed.y, parsed.mo - 1, parsed.d, parsed.h, parsed.mi));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(utcDate);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour')) + parseInt(get('minute')) / 60;
  return { date, hour };
}

export async function GET() {
  const url = process.env.PREPLY_ICAL_URL;
  if (!url) {
    return NextResponse.json({ error: 'PREPLY_ICAL_URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    const text = await res.text();

    const events = text.split('BEGIN:VEVENT').slice(1);
    const busy: BusySlot[] = [];

    events.forEach(block => {
      const startMatch = block.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/);
      const endMatch = block.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/);
      if (!startMatch || !endMatch) return;

      const start = toParisLocal(parseICSDateTime(startMatch[1]));
      const end = toParisLocal(parseICSDateTime(endMatch[1]));

      if (start.date === end.date) {
        busy.push({ date: start.date, startHour: start.hour, endHour: end.hour });
      }
    });

    return NextResponse.json(busy);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 });
  }
}