import { NextRequest } from 'next/server';
import { schedulePickup } from '@/lib/automation';

export const runtime = 'nodejs';
export const maxDuration = 120; // requires Vercel Pro

export async function POST(req: NextRequest) {
  let packages: unknown, weight: unknown;

  try {
    ({ packages, weight } = await req.json());
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Number.isInteger(packages) || (packages as number) < 1 || (packages as number) > 100) {
    return new Response(
      JSON.stringify({ success: false, message: 'packages must be an integer 1–100' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (typeof weight !== 'number' || (weight as number) < 0 || (weight as number) > 70) {
    return new Response(
      JSON.stringify({ success: false, message: 'weight must be 0–70 lbs' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // client disconnected
        }
      };

      try {
        const result = await schedulePickup(
          packages as number,
          weight as number,
          (step: string) => send('progress', { step }),
        );
        send('done', result);
      } catch (err) {
        send('done', { success: false, message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
