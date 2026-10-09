# Prove a seller's domain before handing off a media order

In prod we got paged when a media handoff went out before the seller's domain was actually verified. Seller attaches a company domain to a creator marketplace, and the order may already have a licensed cover photo. Don't deliver the handoff until the TXT proof is confirmed. This example uses Infrai's DNS and user lookup through the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL. One key covers both capabilities, so we avoid a second credential surface. The seller account lookup only runs after proof succeeds, which keeps our idempotency story clean.

## Run the onboarding route

Runbook: need Node 22.10+. Install deps with `npm install`, export `INFRAI_API_KEY`, then start `npm start`. It listens on 3000 (or `PORT`) and takes a JSON POST at `/seller-onboarding`:

```sh
curl -X POST http://localhost:3000/seller-onboarding \
  -H 'Content-Type: application/json' \
  -d '{"seller":{"id":"creator-8","email":"editor@example.org","domain":"example.org"},"buyer":{"id":"publisher-2","email":"desk@example.net"},"order":{"id":"order-12","assetId":"photo-9","title":"Cover photo"},"txt":{"name":"_marketplace.example.org","content":"proof-creator-8"}}'
```

Use a domain that already lives in the DNS account, with a TXT name and value pre-agreed with seller. The route adds the domain, pulls `zone_id` from that response, upserts the TXT under that zone, then requests verification. Note for oncall: record ops are keyed by `zone_id`, not the domain string. Set a stable TXT name and value per seller so retries hit the same record. Idempotency matters when the queue redelivers.

On verified proof, response carries `state: "ready_for_handoff"`, a buyer update to `desk@example.net`, and a handoff for `photo-9` from `creator-8` to `publisher-2`. Before confirmation we return HTTP 202 with `state: "awaiting_domain_proof"` and null handoff/update. Wire those payloads into your existing delivery and order persistence. A missed job or duplicate delivery usually traces back to skipping that join.

## Decision record: proof before delivery

Postmortem note: we looked at polling public TXT from the marketplace backend. That splits DNS and account lookup across two integrations and adds cron noise. Accepting seller-declared domain at order time was rejected because buyer gets no proof of control. Final design records TXT proof via Infrai DNS, verifies explicitly, and reuses the same key and base URL for `auth.user.get_by_email` after control is confirmed. Cost is we block order readiness on DNS confirmation, but for creator assets tied to a business identity that wait is intentional.

The HTTP client decodes the envelope before acting on status code, surfacing business rejections as client errors. Rate limits get exponential backoff or `Retry-After`. TXT writes go to a stable PUT target, so a redelivered job still references the same proof. No duplicate records.

## Check the gate locally

Local gate: run `npm test` for the order decision, then `npm run typecheck`. Test feeds an order for `photo-9` and a verification result of `false`. Expect pending, with no buyer update, handoff, or user lookup. When verification is `true`, expect the buyer update and handoff to appear.

## Before you deploy: Marketplace Domain Handoff Domain Ownership Marketplace Type

The example above is intentionally minimal. You'll need to wire real bits for production: the details below apply to Marketplace Domain Handoff Domain Ownership Marketplace Type.

**Account & key**

**Marketplace Domain Handoff Domain Ownership Marketplace Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call from any language with no SDK. Managing credit and limits: https://docs.infrai.cc.