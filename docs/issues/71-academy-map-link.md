# 71 · A pinned map link for the academy

_(Spec **O6** + **S7**. Extends ADR [68](68-academy-time-zone-address-and-delete.md), which added the free-text address. Migration `0022`, one column, no new dependency.)_

## Context

ADR 68 gave the academy an address: free text, up to 200 characters, rendered with an "Open in Maps" link. That link is a Google Maps **search** for the typed string.

A search is a guess. It lands on the wrong building, on a list of results, or on nothing, and the gyms it fails for are ordinary ones: a unit inside a mall, a basement, an industrial park, a building with no street number, an address written in a language the geocoder handles badly. Nobody finds out it failed. The owner types the address once and never taps it; the person who taps it is a new student, on their first visit, when being lost is most expensive.

The obvious answer is "validate the address". You cannot. Without a geocoder there is no check that an address is real, and a regex check ("has a digit", "has a comma") rejects valid addresses while passing wrong ones. A geocoder means a Places API key, billing, and key handling on two clients, which is a lot for one field.

The mobile link had a second, smaller problem: it opened an `https://www.google.com/maps/...` URL, which only reaches the Google Maps **app** if that app is installed. On an iPhone without it, tapping the gym's address opened Safari.

## Decision

**Two honest checks instead of one impossible one.**

**1. Show the owner what the student will see.** While the address is being edited, the card shows a **Check the pin ↗** link built by the same `academyMapUrl` the student's tap uses. The owner opens it once and sees the pin. A human eye on the real result is the only validation that validates anything here, and it costs no schema and no API key.

**2. Let the owner paste an exact pin.** `organization.map_url` holds an optional share link from a map app. When it is set, the student's tap opens that link; when it is not, the tap searches the address as before. This is validation by construction: a share link came out of a map, so it always resolves, including for plus codes, mall units, and places with no address at all.

**The link is host-restricted, and that is a security decision, not a convenience one.** It is rendered as a tappable `href` for every member of the gym, so an open URL field would let one careless or compromised owner send the whole roster to a phishing page. `MapUrlSchema` accepts https only (reusing `HttpUrlSchema`, which already pins the scheme) and only these hosts and their subdomains: `maps.google.com`, `maps.app.goo.gl`, `maps.apple.com`, `openstreetmap.org`, `osm.org`, `waze.com`, plus `google.com` when the path starts with `/maps` (the desktop share URL).

**Two things the first cut of this list got wrong.** Bare `google.com` and `goo.gl` were on it, which defeats the point: `https://www.google.com/url?q=…` is an open redirect, a `goo.gl` shortlink resolves to anything, and `sites.google.com` hosts pages anyone can write. An allowlist that admits a redirector allows the phishing page it was built to stop, so Google is reachable only as `maps.google.com` or `google.com/maps`. And the host was read with a regex whose userinfo group is greedy, which handles `https://google.com@evil.example.com/` but not `https://evil.example.com\.google.com/` — every browser and `Linking.openURL` read the backslash in the authority as a path separator, so the real host there is `evil.example.com` while the regex saw `.google.com` and passed it. The host now comes from `new URL()`, the same parser the browser will use. `@matops/validators` is framework-free, so its tsconfig adds the `dom` lib for the `URL` type, the way `@matops/ui` already does; `URL` itself is global in Node, every browser, and Hermes.

**The field is disabled until an address is typed.** Students tap the **address text**; a pin with no text to tap shows up nowhere. Blocking it in the form keeps that dead state unreachable without a rule in the database layer.

**On mobile, the fallback uses the phone's own map app.** With no pinned link, the tap now opens `maps://?q=<address>` on iOS and `geo:0,0?q=<address>` on Android, with the Google web URL as the catch. A pinned link is opened as-is: `maps.app.goo.gl` and `maps.apple.com` already hand off to their apps.

## Consequences

The address stays the thing students **read**, and it cannot be replaced by the link: a Google share link is a shortener (`maps.app.goo.gl/xyz`), so nothing readable can be recovered from it.

The allowlist will eventually refuse a link somebody wants — 2GIS and Yandex Maps are the likely ones in this market. Adding a host is one line in `MAP_HOSTS`, and the refusal is a clear message rather than a broken link.

None of this validates that the pin is **their** gym. Only the owner's eye does, which is what the preview link is for.

Still not done, and deliberately: geocoding, autocomplete, stored coordinates, a distance or directions button, and any link on the join-by-code confirm step, which still shows the address as plain text.
