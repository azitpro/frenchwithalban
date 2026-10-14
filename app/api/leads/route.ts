import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

import { notifierEnArrierePlan } from '@/lib/courriel';

const redis = Redis.fromEnv();

type Lead = {
  id: string;
  firstName: string;
  email: string;
  timezone: string;
  availability: string[];
  level: string;
  goals: string;
  priorities: string;
  lessonsPerWeek: string;
  other: string;
  submittedAt: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Route publique : envoi du formulaire de la page Réserver.
// Lecture et suppression : /api/admin/leads, protégée par l'authentification d'administration.
export async function POST(req: NextRequest) {
  const data = await req.json();
  const leads: Lead[] = (await redis.get('leads')) || [];
  const newLead: Lead = {
    id: uid(),
    firstName: data.firstName || '',
    email: data.email || '',
    timezone: data.timezone || '',
    availability: data.availability || [],
    level: data.level || '',
    goals: data.goals || '',
    priorities: data.priorities || '',
    lessonsPerWeek: data.lessonsPerWeek || '',
    other: data.other || '',
    submittedAt: new Date().toISOString(),
  };
  leads.push(newLead);
  await redis.set('leads', leads);

  notifierEnArrierePlan({
    sujet: `Demande de contact : ${newLead.firstName || 'sans prénom'}`,
    repondreA: newLead.email || undefined,
    lignes: [
      `${newLead.firstName || 'Quelqu’un'} a rempli le formulaire de la page Réserver.`,
      '',
      `Email : ${newLead.email || 'non laissé'}`,
      `Fuseau : ${newLead.timezone || 'non précisé'}`,
      `Disponibilités : ${newLead.availability.join(', ') || 'non précisées'}`,
      `Niveau : ${newLead.level || 'non précisé'}`,
      `Cours par semaine : ${newLead.lessonsPerWeek || 'non précisé'}`,
      newLead.goals ? `Objectifs : ${newLead.goals}` : '',
      newLead.priorities ? `Priorités : ${newLead.priorities}` : '',
      newLead.other ? `Autre : ${newLead.other}` : '',
    ].filter(Boolean),
  });

  return NextResponse.json({ success: true });
}