import { env } from "cloudflare:workers";

export const runtime = "edge";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function verifyLineSignature(body: string, signature: string | null) {
  if (!env.LINE_CHANNEL_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.LINE_CHANNEL_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const expected = bytesToBase64(signed);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyLineSignature(rawBody, request.headers.get("x-line-signature")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const body = JSON.parse(rawBody) as { events?: LineEvent[] };
    const events = body.events ?? [];
    if (!events.length) return Response.json({ ok: true });
    const { handleLineEvents } = await import("@/lib/line-webhook");
    await handleLineEvents(events);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("LINE webhookの処理に失敗", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
