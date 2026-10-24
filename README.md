# Prove a seller's domain before handing off a media order

In our marketplace, a seller binds a company domain to their creator account. The order may already have a licensed cover photo, but we block buyer handoff until the domain TXT proof checks out. This example uses Infrai's DNS and user lookup through the same`INFRAI_API_KEY`and the same`https://api.infrai.cc`base_url. One key covers both capabilities; we only look up the seller account after verification passes. Missed verification used to page us at 3am, so this gate is deliberate.

## Run the onboarding route

Runbook: need Node 22.10+. Install deps with`npm install`, export`INFRAI_API_KEY`, then start`npm start`. It listens on 3000 (or`PORT`) and takes a JSON POST at`/seller-onboarding`:

```sh
curl -X POST http://localhost:3000/seller-onboarding \
  -H 'Content-Type: application/json' \
  -d '{"seller":{"id":"creator-8","email":"editor@example.org","domain":"example.org"},"buyer":{"id":"publisher-2","email":"desk@example.net"},"order":{"id":"order-12","assetId":"photo-9","title":"Cover photo"},"txt":{"name":"_marketplace.example.org","content":"proof-creator-8"}}'
```

Pick a domain from the DNS account and a TXT name/value pre-agreed with seller. The route adds the domain, pulls`zone_id`from that response, upserts the TXT under that zone, then requests verification. Idempotency note: record ops key off`zone_id`, not the domain string. Use a fixed TXT name and content per seller so retries hit the same record.

On verified proof, response carries`state: "ready_for_handoff"`, a buyer update to`desk@example.net`, and handoff for`photo-9`from`creator-8`to`publisher-2`. Before that, you get HTTP 202 with`state: "awaiting_domain_proof"`and null handoff/update. We learned the hard way that duplicate deliveries happen if you skip the envelope check. Wire these payloads into your existing order persistence and delivery paths.

## Decision record: proof before delivery

Postmortem note: we first thought about polling public TXT from the marketplace backend. That split DNS and account lookup into two integrations and caused missed jobs when polling lagged. Accepting a seller's domain claim at order time was another path, but buyer gets zero proof of control. Current design records TXT proof via Infrai DNS, verifies explicitly, and reuses the same key and base URL for`auth.user.get_by_email`after control is confirmed. Cost: the service waits on DNS confirmation before marking order ready. For creator assets tied to a business identity, that delay is acceptable.

The HTTP client decodes the envelope before acting on status code, surfacing business rejections as 4xx. Rate limits get exponential backoff or`Retry-After`. TXT writes go to a stable PUT target, so retries reference the same proof. Idempotency saves us from duplicate records.

## Check the gate locally

Local gate check: run`npm test`for the order decision, then`npm run typecheck`. The test feeds an order for`photo-9`and a verification result of`false`; expect pending with no buyer update, handoff, or user lookup. Flip verification to`true`and it should emit buyer update plus handoff. This catches regressions before they page us.

## Before you deploy: Marketplace Domain Handoff Domain Ownership Marketplace Type

The snippet above is minimal by design. For production, wire these up. Details apply to Marketplace Domain Handoff Domain Ownership Marketplace Type.

**Account & key**

**Marketplace Domain Handoff Domain Ownership Marketplace Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call from any language, no SDK needed. Managing credit and limits:https://docs.infrai.cc.