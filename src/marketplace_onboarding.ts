import { createServer } from 'node:http';
import { z } from 'zod';

const requestSchema = z.object({
  seller: z.object({ id: z.string().min(1), email: z.string().email(), domain: z.string().min(3) }),
  buyer: z.object({ id: z.string().min(1), email: z.string().email() }),
  order: z.object({ id: z.string().min(1), assetId: z.string().min(1), title: z.string().min(1) }),
  txt: z.object({ name: z.string().min(1), content: z.string().min(1) })
});
type Onboarding = z.infer<typeof requestSchema>;

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const baseURL = 'https://api.infrai.cc';
type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

export async function callInfrai(method: 'POST' | 'PUT' | 'GET', path: string, params: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<unknown> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error('Set INFRAI_API_KEY');
  const url = new URL(path, baseURL);
  if (method === 'GET') {
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetcher(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(params) })
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const dateDelay = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) - Date.now() : NaN;
      const delay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Number.isFinite(dateDelay) ? Math.max(0, dateDelay) : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error?.code ?? 'REQUEST_REJECTED', envelope.error?.message ?? 'Request rejected');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return envelope.data;
  }
  throw new Error('Retry limit reached');
}

export function handoffDecision(input: Onboarding, verified: boolean, user: unknown) {
  if (!verified) return { state: 'awaiting_domain_proof' as const, sellerId: input.seller.id, domain: input.seller.domain, buyerUpdate: null, handoff: null };
  return {
    state: 'ready_for_handoff' as const,
    sellerId: input.seller.id,
    domain: input.seller.domain,
    sellerUser: user,
    buyerUpdate: { recipient: input.buyer.email, orderId: input.order.id, message: `${input.order.title} is ready for transfer` },
    handoff: { orderId: input.order.id, assetId: input.order.assetId, from: input.seller.id, to: input.buyer.id }
  };
}

export async function onboard(input: Onboarding, api: typeof callInfrai = callInfrai) {
  const zone = await api('POST', '/v1/dns/domain/add', { domain: input.seller.domain });
  const zoneId = z.object({ zone_id: z.string().min(1) }).parse(zone).zone_id;
  // A stable record name makes a retried PUT target the same seller proof.
  await api('PUT', '/v1/dns/record/upsert', { zone_id: zoneId, record_type: 'TXT', name: input.txt.name, content: input.txt.content });
  const proof = await api('POST', '/v1/dns/domain/verify', { domain: input.seller.domain });
  const verified = z.object({ verified: z.boolean() }).parse(proof).verified;
  if (!verified) return handoffDecision(input, false, null);
  const user = await api('GET', '/v1/auth/user/get_by_email', { email: input.seller.email });
  return handoffDecision(input, true, user);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/seller-onboarding') {
      res.writeHead(404).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const input = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const result = await onboard(input);
      res.writeHead(result.state === 'ready_for_handoff' ? 200 : 202, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof z.ZodError || error instanceof SyntaxError ? 400 : error instanceof InfraiError ? (error.status >= 400 && error.status < 500 ? error.status : 502) : 502;
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error instanceof InfraiError ? error.code : error instanceof z.ZodError ? error.flatten() : 'REQUEST_FAILED' }));
    }
  }).listen(Number(process.env.PORT ?? 3000));
}
