---
title: GROOMING018 Communication Router
owner: Technical Lead
status: Draft
source_of_truth: false
last_review: 2026-08-29
next_review: 2026-09-12
---

# GROOMING018 Communication Router

Business code addresses a canonical GO IRL `user_key`; it never chooses Telegram, email, Messenger, Instagram, WhatsApp, or a provider destination. The server-side resolver selects only the user's explicit primary route and returns `executable`, `no_route`, or `needs_attention`.

Authentication identity, linked provider evidence, route readiness/capability, consent, route health, and preference are separate state. A linked login is initially `candidate`; only a server-side provider verification boundary may promote it to `ready`. No external fallback is inferred. In-app is the safe first-class route.

The implementation reuses `user_provider_identities`, `event_notifications`, reminder timing, delivery retries, and the Beauty master claim/draft/publish flow. Destination identifiers remain in the existing server-side identity record and are not returned by the browser settings RPC.

The migration is source-only until the protected Supabase migration/RLS apply gate is explicitly executed. Provider verification/configuration is also a separate production gate.
