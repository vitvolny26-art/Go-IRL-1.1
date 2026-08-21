---
title: GO IRL Beauty Product Definition
owner: Product Lead
status: Draft
source_of_truth: false
work_id: BEAUTY001
parent_work_id: BOOKING001
domain: Services
vertical: Beauty
segment: Manicure and Pedicure
last_review: 2026-07-30
next_review: 2026-08-06
---

# GO IRL Beauty

> Product taxonomy (2026-08-21): user-facing category is **Services / Grooming**, with current specializations **Nails** and **Barbering**. The existing `beauty` code/routes/RPC namespace remains a compatibility implementation detail and is not renamed by this taxonomy change. Product Definition

## Decision

GO IRL Beauty is the first approved vertical inside the `Services` domain. BEAUTY001 defines a bounded first product for solo manicure and pedicure professionals and their clients.

Approved structure:

```text
GO IRL
├── Activities
└── Services
    └── Beauty
        └── Manicure & Pedicure
```

`Services` is the domain. `Booking` is the client process of selecting a service and time. `Appointment` is the resulting scheduled record.

BEAUTY001 authorizes product definition, UX planning, research validation, and local or mock prototype planning only. It does not authorize production schema, SQL, migrations, RLS, authentication, secrets, provider credentials, Google OAuth configuration, WhatsApp Cloud API configuration, deployment, production configuration, or production-data changes.

## Product outcome

Create the simplest useful appointment service for an independent nail professional who currently coordinates clients through WhatsApp, phone calls, notebooks, and ad hoc calendar entries.

The professional should be able to:

- publish a booking page quickly;
- define services, price, duration, and buffer time;
- define working hours and unavailable periods;
- see upcoming Appointments;
- add Appointments received by phone or WhatsApp;
- confirm, reschedule, cancel, complete, or mark no-show;
- avoid confirmed double bookings;
- use Google Calendar without making it the canonical Appointment database;
- contact clients through WhatsApp without requiring a complex messaging platform in the first release.

The client should be able to:

- open a public browser link;
- select one service;
- select an available date and time;
- provide minimal contact data;
- submit a Booking without creating an account;
- receive a clear Appointment state;
- add the Appointment to a calendar;
- cancel or request rescheduling through a secure link;
- contact the professional in WhatsApp when needed.

## Problem evidence

Current evidence consists of:

- one directly supplied professional workflow involving notebook, phone, and WhatsApp coordination;
- the Gemini research document `GO IRL Beauty Product Research` in Google Drive;
- competitor and integration claims contained in that research document.

This is enough to define a product hypothesis and pilot design. It is not broad market validation. Quantitative claims in the research document, competitor pricing, Google limits, Meta rules, conversion effects, no-show baselines, and time-saved estimates require independent verification before they become product commitments.

## Primary segment

### Professional

- independent manicure or pedicure professional;
- solo operator;
- one primary location;
- Czechia-first, preferably Olomouc and nearby;
- mobile-first operation;
- existing client communication through WhatsApp or phone;
- no requirement for staff scheduling, rooms, inventory, payroll, deposits, or accounting in the first pilot.

### Client

- opens a public browser link;
- does not need Telegram or a GO IRL account;
- books one service at a time;
- provides name and phone number;
- receives a clear pending or confirmed state;
- can use a secure change link.

Small studios, multiple professionals, multiple locations, rooms, chairs, and resources are later segments, not first-MVP requirements.

## Jobs to be done

### Professional JTBD

> When a client asks for an appointment, I want one reliable place to show available time and manage the resulting Appointment, so I spend less time negotiating in messages and do not create conflicting confirmed bookings.

### Client JTBD

> When I want a manicure or pedicure, I want to see the service, price, duration, and free time, book without registration, and change the Appointment without a long message exchange.

## Product principles

1. Browser-first client flow.
2. Mobile-first professional flow.
3. No mandatory Telegram login for clients.
4. GO IRL owns Appointment state.
5. Google Calendar is an integration, not the canonical database.
6. WhatsApp is a communication channel, not the Booking engine.
7. One professional, one location, one service per Booking in MVP.
8. Manual professional entry remains mandatory.
9. No confirmed double booking.
10. Collect the minimum client data required for the Appointment.
11. Keep Activities and Services data and UX boundaries explicit.
12. Do not add CRM breadth before the core loop is validated.

## Product model

Core concepts:

- `Professional` — the service provider;
- `Client` — the person receiving the service;
- `Service` — one manicure or pedicure offer;
- `Availability` — recurring working-time rules;
- `Time Block` — a non-bookable interval;
- `Booking` — the client selection and submission process;
- `Appointment` — the scheduled record created by Booking or manual professional entry;
- `Confirmation` — the professional decision that makes a pending Appointment confirmed;
- `Rescheduling` — changing the Appointment time;
- `Cancellation` — ending the Appointment before completion;
- `Reminder` — a service message before the Appointment;
- `No-show` — the client did not attend.

The module must not use Activity participants, public Activity Chat, capacity, join requests, or attendance mechanics as its primary model.

## Core hypotheses

Primary hypothesis:

> GO IRL Beauty reduces manual appointment coordination for solo nail professionals while maintaining zero confirmed double bookings.

Supporting hypotheses:

1. Clients will complete a browser Booking that starts from a WhatsApp or social link.
2. One service per Booking is sufficient for the first pilot.
3. Weekly Availability plus manual Time Blocks is sufficient for solo professionals.
4. Manual confirmation is acceptable for the first pilot and reduces operational risk.
5. Google Calendar busy time can improve availability accuracy without becoming the Appointment source of truth.
6. WhatsApp Click-to-Chat provides useful communication value without Cloud API complexity.
7. Secure self-service cancellation and rescheduling reduce repetitive messages.

## Professional journey

### Setup

1. Enable Beauty.
2. Add display name, photo, city, location, short description, and WhatsApp number.
3. Add at least one Service.
4. Set price, duration, and optional buffer.
5. Define weekly Availability.
6. Add Time Blocks when needed.
7. Optionally connect Google Calendar after the integration is separately approved.
8. Publish the booking page.

Target setup time is a pilot hypothesis, not a commitment. It must be measured in BEAUTY002 and BEAUTY004.

### Daily operation

1. Open Today or Week.
2. Review pending and confirmed Appointments.
3. Confirm, decline, reschedule, cancel, complete, or mark no-show.
4. Add a manual Appointment received by phone or WhatsApp.
5. Add or remove a Time Block.
6. Open WhatsApp contact when direct communication is needed.

## Client journey

1. Open the professional's public page.
2. Review identity, location, Service, price, duration, and applicable rules.
3. Choose one Service.
4. Choose an available date and time.
5. Enter name and phone number.
6. Review privacy and communication notices.
7. Submit the Booking.
8. Receive pending or confirmed status.
9. Add the Appointment to a calendar.
10. Use a secure link to cancel or request rescheduling.
11. Open WhatsApp when direct communication is needed.

No password, account creation, application download, or Telegram authentication is required for this client flow.

## Appointment policy for the first pilot

Default model:

- client Booking creates a `pending` Appointment;
- the selected slot is temporarily protected for a bounded period defined in BEAUTY003;
- the professional confirms or declines;
- only a confirmed Appointment is treated as final;
- manual professional Appointments may be created directly as confirmed;
- a slot conflict must be rejected at the authoritative data boundary;
- client rescheduling is a request until the professional confirms the new time;
- cancellation rules and windows must be visible before submission.

Automatic confirmation may be tested later for selected Services after conflict prevention and operational behavior are proven.

## MVP scope

### Must have

- one Professional per public page;
- one location;
- manicure and pedicure Services;
- Service name, description, price, duration, and optional buffer;
- weekly Availability;
- manual Time Blocks;
- available-slot calculation;
- one Service per Booking;
- public browser booking page;
- guest Booking without account creation;
- client name and phone number;
- pending, confirmed, declined, cancelled, completed, and no-show states;
- professional Today and Week views;
- manual Appointment creation;
- professional confirmation, decline, reschedule, and cancellation;
- secure client cancellation and rescheduling request links;
- calendar-add action for the client;
- WhatsApp Click-to-Chat with prefilled text;
- clear timezone handling;
- privacy and contact-use notice;
- conflict handling when a slot becomes unavailable before submission;
- Czech-first UX with Russian and English support through existing localization patterns.

### Integration boundary for MVP

Google Calendar:

- product requirement: optional connection;
- GO IRL remains the Appointment source of truth;
- external busy intervals may become anonymous Time Blocks;
- confirmed GO IRL Appointments may be exported to the selected calendar;
- exact OAuth scopes, sync method, conflict policy, token storage, webhook renewal, deletion behavior, and failure handling belong to BEAUTY003;
- no Google integration work is authorized by BEAUTY001.

WhatsApp:

- MVP uses `wa.me` or equivalent Click-to-Chat links;
- the user initiates the conversation;
- GO IRL does not automate inbound chat or use WhatsApp as the Booking database;
- Cloud API confirmations and reminders are deferred until Meta requirements, consent, templates, pricing, and operations are independently verified and separately approved.

### Should have after the core loop is validated

- Google Calendar read-busy and Appointment export;
- configurable cancellation window;
- repeat Booking shortcut;
- reminder delivery through an approved channel;
- simple delivery status;
- limited gallery of work;
- automatic confirmation for selected Services;
- basic pilot analytics.

### Explicitly deferred

- online payments, deposits, subscriptions, invoicing, or billing;
- marketplace search, ranking, advertising, or paid placement;
- public ratings and reviews;
- multiple professionals;
- multiple locations;
- rooms, chairs, equipment, or resource scheduling;
- inventory and consumables;
- payroll and accounting;
- loyalty programs;
- unified messaging inbox;
- Instagram Direct automation;
- WhatsApp chatbot Booking;
- AI scheduling assistant;
- autonomous marketing;
- medical records or health questionnaires;
- complex CRM automation;
- selection of multiple Services in one Booking.

## Critical UX states

BEAUTY002 must define:

- no Services;
- no Availability;
- no free slots;
- slot became unavailable;
- Booking submission in progress;
- pending confirmation;
- confirmed Appointment;
- professional decline;
- client cancellation;
- rescheduling requested;
- professional changed the Appointment;
- invalid, expired, or used secure link;
- network failure;
- timezone warning;
- Google Calendar disconnected or stale;
- WhatsApp unavailable;
- professional temporarily stops accepting Bookings.

## Privacy and safety boundary

The public page may expose only Professional-approved public information. Client contact details must not appear in Activities, public chat, public profiles, discovery results, analytics payloads, or operational reports unless explicitly required and reviewed.

BEAUTY003 must define:

- controller and processor roles;
- lawful basis for Appointment administration;
- separate consent requirements for optional WhatsApp messaging;
- minimum retention period and deletion process;
- correction and export paths;
- access rules for Client contact data;
- secure link entropy, expiry, revocation, and single-use behavior;
- rate limiting and abuse protection;
- audit requirements;
- integration credential storage;
- separation from public GO IRL data;
- incident and support ownership.

Data not required in MVP:

- date of birth;
- medical history;
- health conditions;
- government identifiers;
- payment card data;
- full conversation history;
- unnecessary email address;
- marketing profile data.

## Pilot definition

Pilot proposal:

- 3 to 5 solo manicure or pedicure professionals;
- Olomouc or nearby;
- one primary design partner;
- 4 weeks;
- at least 50 real Booking attempts across the pilot;
- both public-link and manually entered Appointments tracked;
- no online payments;
- manual support;
- no additional Beauty categories without a separate decision.

This proposal requires explicit Product Owner approval at Gate F before production implementation.

## Pilot metrics

Primary:

- zero confirmed double bookings;
- percentage of Booking attempts completed through the public page;
- median time to create and publish a usable page;
- median professional confirmation time;
- reported weekly coordination time saved;
- number of Professionals that continue using the product;
- no critical Client-contact privacy incident.

Secondary:

- Booking completion rate;
- percentage of manually entered Appointments;
- cancellation rate;
- rescheduling rate;
- no-show rate;
- repeat Booking rate;
- Google Calendar conflict and sync failure rate after integration;
- WhatsApp Click-to-Chat usage;
- support incidents;
- weekly active Professionals;
- percentage of clients completing without Telegram.

No numeric success threshold from the Gemini research is adopted automatically. Thresholds must be approved after baseline interviews or prototype evidence.

## Failure signals

Pause, narrow, or reject the experiment if:

- confirmed double bookings occur;
- Professionals must recreate most Bookings manually;
- Clients consistently refuse or abandon the public flow;
- Professionals cannot keep Availability accurate;
- the workflow immediately requires staff or resource scheduling;
- privacy or provider requirements outweigh pilot value;
- Google Calendar creates unresolved Appointment conflicts;
- WhatsApp becomes a required dependency for completing Booking;
- the track displaces unresolved Activities release work without explicit approval.

## Delivery sequence

1. `BEAUTY001` — product definition and boundaries.
2. `BEAUTY002` — UX and information architecture specification.
3. `BEAUTY003` — architecture, privacy, safety, retention, integration, and data-boundary review.
4. `BEAUTY004` — local or mock-data prototype.
5. `BEAUTY005` — bounded production pilot after Gate F and protected-change approvals.

## BEAUTY001 exit criteria

BEAUTY001 may move from Draft only when the Product Owner explicitly confirms:

- primary segment is solo manicure and pedicure Professionals;
- first geography is Czechia, with Olomouc as the preferred pilot area;
- one Professional, one location, and one Service per Booking are accepted MVP constraints;
- client Booking does not require an account;
- pending-by-default confirmation model is accepted for the first pilot;
- Google Calendar is optional and non-canonical;
- WhatsApp MVP is Click-to-Chat only;
- payments, CRM breadth, marketplace mechanics, and multi-professional scheduling are excluded;
- pilot size and evidence expectations are acceptable.

## Current recommendation

Proceed to BEAUTY002 only after explicit confirmation of the BEAUTY001 exit criteria. BEAUTY002 must remain docs-only. Do not start database, auth, RLS, Google OAuth, WhatsApp Cloud API, provider configuration, or production implementation.

## Evidence ledger

Claim | Evidence | Scope
--- | --- | ---
Beauty is the first approved vertical inside Services | `docs/decisions/2026-07-29-beauty-inclusion.md` on current `main` | Product structure and terminology
Services work remains Draft / Gated and follows BEAUTY001–005 | `docs/roadmap/ROADMAP_PART_05_GROWTH_DECISION_GATES.md` on current `main` | Delivery sequence and protected gates
The source research recommends a lightweight booking page, GO IRL-owned Appointment state, Google Calendar integration, and WhatsApp Click-to-Chat | Drive document `19UKhXOUrl-8pqEpuDs5R5-8gdLDmanbJ1LkcbKV3Y1E`, revision `AIroW34ZmOhBZAuYT5jBWV9wSNrAc8HsmLAKXoUCHVi21tDL0-4D428f4rKjq3DtdfYgo5SascPKVsjnnsNj-veysh62YlQbIeXyLXZVotI` | Research input only; external claims require verification
Initial notebook, phone, and WhatsApp workflow | Product Owner supplied discovery context | Initial case only; not broad market validation
