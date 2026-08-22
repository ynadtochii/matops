# 70 · An in-app QR scanner, on its own tab

_(Mobile IA + spec **S8**. Supersedes two lines of ADR [45](45-mobile-ease-of-use.md): "no in-app QR scanner" and "tabs go 4 → 3". No migration, no router change, no domain rule beyond one parser.)_

## Context

Checking in as a member took four taps and a trip through the browser. The gym poster encodes the public `https://<host>/checkin/<academyId>` page. A student opened the phone's camera app, tapped the notification banner, waited for the page, tapped "Open the app to check in", and a custom-scheme link (`matops://checkin/<id>`) handed off to the app.

That last step is the weak one. ADR [31](31-deep-link-approach.md) deferred universal and App links, so the hand-off is a custom scheme, and a browser is free to ignore it. The same hand-off already fails for Google sign-in (`docs/mobile-google-login-handoff.md`). A student standing on the mat with 30 seconds before warm-up should not be debugging a browser.

ADR 45 ruled the in-app scanner out on purpose: it wanted three clean tabs and no camera permission. The permission was the honest cost. The four taps were not counted.

## Decision

**The app scans the poster itself, on a fourth tab that does one job.** Tabs go Schedule · My classes · **Scan** · Profile. A tab, not a button on Schedule, because check-in is a moment with its own intent: you are at the door, you want one target to hit. Burying it in a header would make it a thing you hunt for.

**The scanner is the operating system's, not ours.** `CameraView.launchScanner()` from `expo-camera` presents the phone's own scanner sheet: `DataScannerViewController` on iOS 16+, the Google code scanner on Android. We write no camera preview, no framing overlay, no torch button, no scan-throttling. It is also the honest choice for this repo: there is no device in the build environment, and a camera never works in the iOS Simulator, so the less camera UI we own untested, the better.

**The QR does not change.** Same poster, same URL, same `checkin.today` / `checkin.checkIn` routers, same `checkin/[academyId]` screen doing set-academy → resolve the live class → book + attend. The only new logic is one pure function, `parseCheckInLink`, which pulls the academy id out of the scanned string. It accepts the https poster URL and the `matops://` deep link, and returns `null` for anything else, including the gym's own `/join/<token>` invite poster. A regex rather than `new URL()`, because Hermes does not parse custom schemes.

**Every other path stays.** The poster still points at a public web page, so a first-time visitor with no app still gets the drop-in form (§4). "Open the app to check in" stays on that page for anyone who scans with the camera app out of habit. The owner marking attendance (O5) is still the safety net.

## Consequences

The app now asks for **camera permission**, which it never did. It is asked on the first tap of the Scan tab, not at launch, and the prompt string says what it is for. If it is refused for good, the tab shows why and offers a button to system settings rather than a screen that does nothing.

**Two phones cannot use the OS scanner:** iOS 15 and older, and Android without Play Services. `CameraView.isModernBarcodeScannerAvailable` reports this, and the tab tells those users to point their camera app at the poster instead, which is exactly the old flow. If that group turns out to matter, the upgrade is one file: swap `launchScanner` for a `<CameraView onBarcodeScanned>` screen. The parse and the routing stay.

**`expo-camera` is a native module.** The dev client must be rebuilt (`apps/expo/ios` and `android` are generated, so `pnpm dev:ios` regenerates them), and **the flow cannot be verified in the Simulator**. It needs a real phone, and joins the queue in `docs/mobile-device-test.md`.

Static QR abuse is unchanged and still accepted. Someone can photograph the poster and check in from home. ADR [24](24-qr-self-checkin.md) decided physical presence is the gate and the gym is where the code lives. A rotating code is a separate slice, not this one.

Out: scanning the `/join/<token>` invite poster (a person joining a gym does not have the app yet), scanning from a saved photo, manual code entry as a scanner fallback, and any change to what the poster encodes.
