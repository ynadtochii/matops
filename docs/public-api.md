# matops public booking API

One small REST API per academy: read the gym's shared schedule, book a visitor
onto a class, cancel that booking. Four calls, no payments, no member data.

Everything here is settled in [ADR 115](issues/115-public-booking-api-and-the-lead-path.md) and
[the plan](public-booking-api-plan.md). This page is what an integrator needs.

## What it is for

A gym's website, a landing page, a schedule block in a footer, a QR poster that
points at any of them. matops builds the academy's web presence as part of the
offer, so matops is the first integrator, and `/book/<code>` is the reference
implementation of these same four calls.

## Turning it on

The owner does two things in matops:

1. **Settings → Public booking**, switch it on. That mints the API key and turns
   on the shared link at `/book/<code>`.
2. **Schedule → tick "Share this class publicly"** on each class or recurring
   template that may appear. Nothing is shared until they do. This is also how
   kids classes and competition training stay off the internet.

Optionally the owner lists the websites allowed to call the API from a browser.
An empty list allows any.

## The key

Send it on every request:

```
X-Matops-Key: mk_pub_...
```

The key names one academy, so no request carries an academy id and a caller
cannot reach another gym by editing a URL. It is **not a secret**: it ships
inside a browser page. Its job is attribution, revocation and per-academy limits.
The owner can replace it at any time, and the old one stops working immediately.

**A gym with two mats has two keys.** Each academy is its own place, with its
own schedule, its own six-digit code and its own booking link, so a key never
answers for a sibling academy even under the same owner. Publish the key of the
academy whose page you are building.

Base URL: `https://<your matops host>/api/public/v1`

## GET /academy

```json
{
  "name": "Alma BJJ",
  "timeZone": "Europe/Lisbon",
  "country": "PT",
  "address": "Rua Example 12, Lisboa",
  "mapUrl": "https://maps.app.goo.gl/..."
}
```

`country` is the ISO 3166-1 alpha-2 code the gym set, or `null` if it has not.
Use it to default the country code on a phone field.

## GET /classes?from=2026-09-01&to=2026-09-08

Published, scheduled, future classes. `from` defaults to now, `to` to seven days
after `from`. The range is capped at 31 days and the answer at 200 classes.
Cancelled, deleted, past and unshared classes are absent.

```json
{
  "timeZone": "Europe/Lisbon",
  "classes": [
    {
      "id": "9c1e...",
      "title": "Fundamentals gi",
      "discipline": "bjj",
      "startsAt": "2026-09-01T18:30:00+01:00",
      "durationMinutes": 60,
      "bookable": true
    }
  ]
}
```

`bookable` is false only when the class is inside the 60-minute cut-off or has
already started. It is never false because a class is full: **full is not a
concept this API has.**

## POST /bookings

```json
{
  "classId": "9c1e...",
  "firstName": "Ana",
  "lastName": "Silva",
  "phone": "+351912345678",
  "email": "ana@example.com",
  "consent": true,
  "source": "web"
}
```

All fields are required except `source`, which defaults to `api`.

```json
{
  "bookingId": "4f7a...",
  "cancelToken": "b7d2...",
  "class": {
    "id": "9c1e...",
    "title": "Fundamentals gi",
    "startsAt": "2026-09-01T18:30:00+01:00",
    "durationMinutes": 60
  }
}
```

`cancelToken` is returned once. Store it if your page offers a cancel link.
Posting the same phone to the same class again returns the same booking, so a
double tap on a bad connection is harmless.

A booking creates or updates a **drop-in lead** in the gym's own list. It never
creates an account and never makes anyone a member.

## DELETE /bookings/{cancelToken}

Returns `204`. The class roster stops showing the person. The **lead stays**:
someone who cancelled still wanted to train, and the gym still wants their
number. An unknown token also answers `204`, so the endpoint cannot be used to
test guesses.

## Errors

Always the same shape:

```json
{
  "error": {
    "code": "class_closed",
    "message": "That class starts too soon to book online."
  }
}
```

`message` is a plain sentence your page can show a person.

| Status | Code                  | When                                                 |
| ------ | --------------------- | ---------------------------------------------------- |
| 401    | `invalid_key`         | Missing, unknown or replaced key                     |
| 403    | `origin_not_allowed`  | Your website is not on the gym's allowlist           |
| 403    | `public_api_disabled` | The owner switched public booking off                |
| 404    | `class_not_found`     | Unknown, unshared, deleted or past class             |
| 409    | `class_cancelled`     | The gym cancelled it after your page loaded          |
| 409    | `class_closed`        | Inside the 60-minute cut-off, or already started     |
| 422    | `validation_error`    | A field failed validation. Names the field           |
| 429    | `rate_limited`        | Over a limit below. Carries `Retry-After` in seconds |

## Limits

| Bucket               | Limit            |
| -------------------- | ---------------- |
| Reads per key        | 60 per minute    |
| Reads per address    | 60 per minute    |
| Bookings per address | 5 per 10 minutes |
| Bookings per phone   | 3 per day        |
| Bookings per academy | 30 per day       |
| Cancels per address  | 10 per hour      |

Known ceiling: the counters live in the server process, so on a scaled-out host
each instance keeps its own and a cold start forgets them. Treat the numbers
above as product rules, not an exact global ceiling. A separate edge rule blocks
a flood before it reaches this code at all, so a client hammering the API can be
blocked for a while rather than seeing a `429` on each call.

## What you must show your visitor

Two lines, and they are a condition of using the API.

1. **The consent line**, beside the checkbox and not inside its label, with a
   link to the gym's privacy page: "OK for the gym to contact me about
   training." `consent: true` means the person actually ticked it.
2. **The waiver line** on the confirmation: the visitor signs the gym's waiver at
   the desk before stepping on the mat. A booking holds a place, it is not
   permission to train.

## What the API never returns

Capacity, booking counts, how full a class is, any member or visitor name, any
instructor name or id, template ids, plans, prices, dues, notes, ranks,
attendance, anything about who trains at the gym, and any class the owner has
not shared.

## Not in this version

Payments, confirmation or reminder messages, webhooks, a digital waiver,
guardian consent for children, waitlists, a visitor login, booking several
people at once, and any public write other than a booking.
