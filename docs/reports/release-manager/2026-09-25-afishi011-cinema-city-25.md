# AFISHI011 — Cinema City 25 Years Offer/Card Prep

Date: 2026-09-25  
Role: Release Manager / City Posters Publisher  
Repository: `vitvolny26-art/Go-IRL-1.1`  
Base branch: `main`  
Base SHA: `dc181daa43c96337d648325ce3967242fbf3e928`

## Scope

Prepare the approved Cinema City 25 years campaign for GO IRL:

- `/offers` promotional card for four large Czech cities.
- City Posters canonical planning/share hooks by slug.
- Generated Czech offer artwork.
- Official Cinema City artwork asset for Afishi.
- No merge, deploy, production SQL apply, or publication in this PR.

## Approved Semantic Package

Official source:

`https://www.cinemacity.cz/static/cs/cz/offers/25let`

Approved cities:

- Praha
- Brno
- Ostrava
- Olomouc

Approved surfaces:

- `Акции и бонусы`
- `Афиша`

Approved Telegram topic:

- `Культура и кино / Culture / 4`

Approved offer image copy:

- `Cinema City slaví 25 let`
- `Hity za 125 Kč`

Approved Telegram copy:

```text
📽 Cinema City празднует 25 лет в Чехии

С 5 октября в кинотеатры возвращаются культовые фильмы прошлых лет. Отличный повод пересмотреть хиты на большом экране.

🎟 Билет на кассе — 125 Kč
Для Cinema City Club — ещё на 20 Kč дешевле.
При покупке онлайн добавляется сервисный сбор.

👉 Подробнее — расписание и билеты на сайте Cinema City.
```

## Canonical Slugs

- `cinema-city-25-let-praha`
- `cinema-city-25-let-brno`
- `cinema-city-25-let-ostrava`
- `cinema-city-25-let-olomouc`

## Assets

- Offers generated artwork: `images/offers/cinema-city-25-let.webp`
- Afishi official artwork: `images/afishi/cinema-city-25-let.webp`

The Vite public directory is `images`, therefore runtime paths are:

- `/offers/cinema-city-25-let.webp`
- `/afishi/cinema-city-25-let.webp`

## Production Data Manifest

This PR does not apply production data. Use this manifest only after a separate explicit production-data mutation approval and current production duplicate check.

Required `city_posters_events` per city:

| city_id | canonical_slug | vertical | subcategory | organizer_name | status | hero_media_url |
| --- | --- | --- | --- | --- | --- | --- |
| `praha` | `cinema-city-25-let-praha` | `cinema` | `promotion` | `Cinema City Česko` | `ready` | `https://go-irl.fun/afishi/cinema-city-25-let.webp` |
| `brno` | `cinema-city-25-let-brno` | `cinema` | `promotion` | `Cinema City Česko` | `ready` | `https://go-irl.fun/afishi/cinema-city-25-let.webp` |
| `ostrava` | `cinema-city-25-let-ostrava` | `cinema` | `promotion` | `Cinema City Česko` | `ready` | `https://go-irl.fun/afishi/cinema-city-25-let.webp` |
| `olomouc` | `cinema-city-25-let-olomouc` | `cinema` | `promotion` | `Cinema City Česko` | `ready` | `https://go-irl.fun/afishi/cinema-city-25-let.webp` |

Required occurrence:

- `starts_at`: `2026-10-05T00:00:00+02:00`
- `ends_at`: unresolved from source; set only after current Cinema City schedule confirms campaign end, or use a bounded conservative review date with owner approval.
- `timezone`: `Europe/Prague`
- `occurrence_url`: `https://www.cinemacity.cz/static/cs/cz/offers/25let`
- `metadata`: `{ "allDay": true, "campaign": "cinema-city-25-let" }`

Required offer:

- `provider_name`: `Cinema City Česko`
- `url`: `https://www.cinemacity.cz/static/cs/cz/offers/25let`
- `price_from`: `125`
- `price_to`: `125`
- `currency`: `CZK`
- `availability_state`: `available`
- `official`: `true`
- `active`: `true`
- `metadata`: `{ "discountText": "Hity za 125 Kč", "clubPriceDeltaCzk": 20, "onlineFeeCzk": 24 }`

## Current Gate

Prepared for PR only.

Not authorized in this task:

- merge
- deploy
- production SQL apply
- final exact publication
- Telegram send

## Runtime Acceptance After Later Deploy/Data Apply

- `/offers` shows the card in Praha, Brno, Ostrava, Olomouc only.
- Card artwork is `/offers/cinema-city-25-let.webp`.
- Details opens the official Cinema City URL.
- Want-to-go uses City Posters planning for the canonical slug.
- Telegram share uses prepared City Posters share.
- No Telegram publication before final exact publish approval.
