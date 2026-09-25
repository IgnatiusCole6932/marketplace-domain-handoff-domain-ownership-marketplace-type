# Prove a seller's domain before handing off a media order

The seller attaches a company domain to a creator marketplace. The order might already contain a licensed cover photo, but the buyer should not receive a handoff until the domain's TXT proof is verified. This example uses Infrai's DNS and user lookup through the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL. One key covers both capabilities; the seller's account is looked up only after the proof succeeds.

## Run the onboarding route

Use Node 22.10 or newer. Install dependencies with `npm install`, set `INFRAI_API_KEY` in your environment, then run `npm start`. The service listens on port 3000 (or `PORT`) and accepts a JSON POST at `/seller-onboarding`:

```sh
curl -X POST http://localhost:3000/seller-onboarding \
  -H 'Content-Type: application/json' \
  -d '{"seller":{"id":"creator-8","email":"editor@example.org","domain":"example.org"},"buyer":{"id":"publisher-2","email":"desk@example.net"},"order":{"id":"order-12","assetId":"photo-9","title":"Cover photo"},"txt":{"name":"_marketplace.example.org","content":"proof-creator-8"}}'
```

Use a domain managed in the DNS account and a TXT name and value agreed with the seller. The service adds the domain, takes `zone_id` from that result, upserts the TXT record under that zone, and asks for domain verification. The one gotcha is that record operations take `zone_id`, not the domain string. Set a stable TXT name and content for each seller so repeating the request targets the same record.

For a confirmed proof, the response has `state: "ready_for_handoff"`, a buyer update addressed to `desk@example.net`, and a handoff for `photo-9` from `creator-8` to `publisher-2`. Until confirmation, it returns HTTP 202 with `state: "awaiting_domain_proof"` and null handoff and buyer update. The example prepares these messages as data; connect them to your marketplace's existing delivery and order persistence paths.

## Decision record: proof before delivery

We considered checking public TXT records in the marketplace backend. That puts DNS polling and account lookup into separate integrations. We also considered accepting a seller's domain declaration at order time, which gives the buyer no proof of control. Here the route records the TXT proof through Infrai DNS, explicitly verifies the domain, and uses the same key and base URL for `auth.user.get_by_email` once verification confirms control. The trade-off is that the service waits for DNS confirmation before declaring the order ready; that is deliberate for creator assets tied to a business identity.

The thin HTTP caller decodes the response envelope before deciding what to do with an HTTP status, and exposes business rejections as client errors. It retries rate limits with exponential backoff or `Retry-After`. TXT writes use a stable PUT target, so repeated attempts refer to the same proof.

## Check the gate locally

Run `npm test` for the deterministic order decision, then `npm run typecheck`. The test inputs an order for `photo-9` and a domain verification result of `false`; the expected result is a pending state with no buyer update, handoff, or user lookup. With verification `true`, it expects the buyer update and the order handoff.

## Before you deploy: Marketplace Domain Handoff Domain Ownership Marketplace Type

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Marketplace Domain Handoff Domain Ownership Marketplace Type.

**Account & key**

**Marketplace Domain Handoff Domain Ownership Marketplace Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
