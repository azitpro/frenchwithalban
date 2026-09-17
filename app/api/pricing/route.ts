import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

type Pricing = {
  realPrice: number;
  discountPrice: number;
  currency: string;
  duration: string;
};

const DEFAULT_PRICING: Pricing = {
  realPrice: 38,
  discountPrice: 38,
  currency: '$',
  duration: '50 min',
};

// Lecture publique des tarifs (pages Cours et Réserver).
// Modification : /api/admin/pricing, protégée par l'authentification d'administration.
export async function GET() {
  try {
    const pricing = await redis.get<Pricing>('pricing');
    return NextResponse.json(pricing || DEFAULT_PRICING);
  } catch {
    return NextResponse.json(DEFAULT_PRICING);
  }
}
