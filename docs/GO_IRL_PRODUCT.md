---
title: GO IRL Product Bible
owner: Product Lead
status: Review
source_of_truth: false
last_review: 2026-08-13
next_review: 2026-08-20
---

# GO IRL Product Bible

## One-line vision

GO IRL helps people stop scrolling and meet in real life.

## Slogan

```text
Less scrolling. More living.
```

## What GO IRL is

GO IRL is a Telegram Mini App for small local real-life activities.

The current beta focus is Olomouc.

The core loop is:

```text
create event -> share -> join -> chat -> show up in real life
```

The product is not optimized for screen time.

The product is optimized for real attendance.

## Why GO IRL exists

People do not only need more events.

They need lower friction before meeting other people.

A user may want to go out, but still stay home because of:

- social fear;
- not knowing anyone;
- unclear format;
- weak trust in the event;
- fear of arriving alone;
- fear that nobody will come;
- too much coordination inside chaotic chats.

GO IRL exists to make the path from intention to real-life attendance shorter.

## Core user problem

The problem is not:

```text
I cannot find any events.
```

The deeper problem is:

```text
I see something interesting, but I do not feel enough trust or clarity to actually go.
```

GO IRL must solve this trust gap.

## Product promise

GO IRL should make a user feel:

```text
I know what this is.
I know where to go.
I know who is coming.
I can ask in chat.
I will not feel stupid if I arrive alone.
```

## North Star

The North Star is not daily active users.

The North Star is:

```text
Real-life attendance from joined users.
```

Practical beta metric:

```text
Join -> show-up rate
```

Supporting metrics:

- event creation completion;
- share link opens;
- join conversion;
- join -> first chat message;
- chat active before event;
- repeat attendance;
- beginner comfort feedback;
- event cancellation/no-show rate.

## Current MVP 1.1 focus

MVP 1.1 is about beta readiness, not feature expansion.

Focus:

- Olomouc;
- Telegram Mini App;
- browser demo mode;
- six beta categories;
- event creation;
- share/join;
- Activity Chat;
- Sport Coach;
- Coach/Role + Chat trust layer;
- weather for sport events;
- profile basics;
- bug report support link;
- stable cards and event details.

Canonical beta categories:

1. Volleyball
2. Running
3. Walking
4. Coffee meetup
5. Board games
6. Language exchange

## What GO IRL is not

GO IRL is not:

- a social feed;
- a dating app;
- a ticketing platform;
- a club CRM;
- a broad event directory;
- a public comment system;
- a permanent group chat replacement;
- an AI content feed;
- a photo album app;
- a marketplace before the core loop works.

## Product principles

### 1. Real life over screen time

If a feature keeps people in the app but does not help them meet, it is suspicious.

### 2. Small local events first

The beta is not about huge city catalogs.

It is about small activities where people can actually show up.

### 3. Trust before scale

Before growth, the product must make users feel safe enough to join and attend.

### 4. Telegram-first

The app must work naturally inside Telegram.

Sharing, joining, chat, and quick decisions must feel native to Telegram users.

### 5. Browser demo is local-only

Browser without Telegram context is for testing and demo.

Demo writes must not touch production Supabase.

### 6. One screen, one main action

Avoid overloaded screens.

Use direct actions and short copy.

### 7. Do not invent universal roles too early

Coach is sport-only in MVP 1.1.

Other categories later get native roles.

## User psychology

A user needs three things before showing up:

1. **Clarity**
   - What is this event?
   - When and where?
   - What level?
   - What should I bring?

2. **Trust**
   - Who created it?
   - Is anyone else coming?
   - Is there a helper/coach/host?
   - Can I ask questions?

3. **Social permission**
   - Is it okay to come alone?
   - Is it okay to be new?
   - Will someone help me fit in?

GO IRL must reduce the gap between interest and attendance.

## Current trust layers

### Organizer trust

The organizer creates the event and gives it structure.

### Participants trust

Visible participants make the event feel alive.

### Activity Chat

Chat allows coordination before arrival.

### Sport Coach

Sport Coach makes sport events less scary for beginners.

### Event Helper bridge

Generic non-sport events may show a temporary Event Helper panel next to chat.

This is a bridge to future Event Roles, not a final role system.

## Coach / Role rule

Do not call every helper a coach.

Correct:

```text
Sport -> Coach
Board games -> Game Master
Language exchange -> Language Buddy / Conversation Mentor
Walking -> Guide / Route Leader
Coffee meetup -> Host / Icebreaker
```

Current MVP:

```text
Sport -> Тренер
Generic non-sport -> Помощник события
```

## MVP feature filter

Before adding a feature, ask:

```text
Does this make it easier for people to meet in real life?
```

If the answer is not clearly yes, it is later scope.

## Explicit not-now list

Do not build before beta stability:

- payments;
- ticketing;
- subscriptions;
- paid coach marketplace;
- AI recommendations;
- dating;
- direct messages;
- photo feeds;
- public review marketplace;
- multi-city expansion;
- complex profiles;
- full recurring events;
- universal Event Roles database.

## Beta success definition

GO IRL beta is working when:

- users can create events quickly;
- shared links open the right event;
- users can join without confusion;
- Activity Chat helps coordination;
- browser demo works without production writes;
- sport events with Coach feel safer;
- people actually show up;
- users repeat attendance.

## Product decision rule

When in doubt, choose the option that makes the real-life meeting more likely.

Not the option that makes the UI more impressive.

Not the option that adds the most features.

Not the option that makes the app feel bigger.

GO IRL should feel small, useful, and alive.

## Current source-of-truth docs

- `README.md` - current repo scope and beta boundary.
- `DOCS_INDEX.md` - documentation registry.
- `ROADMAP.md` - current product and engineering roadmap.
- `docs/SPORT_COACH_MVP.md` - Sport Coach boundary.
- `docs/COACH_CHAT_TRUST_LAYER.md` - Role/Helper + Chat trust layer.
- `docs/MARKET_POSITIONING.md` - market positioning.
- `docs/COMPETITOR_WATCH.md` - competitor signal tracking.
