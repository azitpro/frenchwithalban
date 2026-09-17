import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { readTodo, saveTodo } from '@/lib/todo-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// To-do list personnelle. Aucune route publique ne lit ces données.

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const result = await readTodo(redis);
  if (!result.ok) {
    return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ todo: result.todo, revision: result.revision }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const result = await saveTodo(redis, body?.todo, body?.revision);

  switch (result.status) {
    case 'saved':
      return NextResponse.json({ success: true, todo: result.todo, revision: result.revision }, { headers: NO_STORE });
    case 'conflict':
      return NextResponse.json(
        { error: 'La liste a été modifiée ailleurs entre-temps.', todo: result.todo, revision: result.revision },
        { status: 409, headers: NO_STORE },
      );
    case 'invalid':
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
    default:
      return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
}
