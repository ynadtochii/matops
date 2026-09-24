# NFC check-in research

*Checked 16 August 2026 against platform documentation.*

## Recommendation

For NFC, start with **passive NDEF URL tags at the venue**. A tag contains the
same HTTPS check-in URL as the existing QR poster. Add iOS Universal Links and
Android App Links so that URL opens the existing Expo check-in route when the
app is installed and retains the web fallback otherwise. No NFC library is
needed for this version. Apple background tag reading still presents a
notification that the user taps; it is not an invisible automatic launch.
[Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
[Expo linking overview](https://docs.expo.dev/linking/overview/)


The check-in response should read the student's standing from the matops
database. Show a neutral success signal to the student and a private red/amber
status on the staff's "Tonight" screen. Do not make an audible public
"overdue" alert or automatically block attendance in the first release.

## NFC solution levels

### 1. Passive venue tag — recommended MVP

Write the existing `https://.../checkin/<academyId>` URL to an NDEF tag and make
it read-only. With Universal/App Links, an installed app opens the Expo route;
without the app, the existing public page remains the fallback. iOS supports
background reading of an NDEF URI but requires the user to tap the notification.
Android verified App Links route HTTPS URLs directly to the app.
[Apple background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
[Android App Links](https://developer.android.com/training/app-links/about)

This has the same trust level as the current static QR: the URL can be copied and
shared. NFC improves convenience, not proof of physical presence. A rotating
credential requires an active reader/display and is a different product.

### 2. Browser NFC

Do not make Web NFC the cross-platform foundation. Chrome documents Web NFC as
Android Chrome-only, NDEF-only, HTTPS-only, foreground-only, and permissioned
from a user gesture. It does not support peer-to-peer or host card emulation.
[Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc)

### 3. Student phone as an NFC credential

Do not build this for the MVP. Android supports host card emulation for native
apps, but this requires a reader protocol, native services, credential issuance,
security design, and hardware operations. It does not create a symmetric iOS
implementation. [Android HCE](https://developer.android.com/develop/connectivity/nfc/hce)

If a staff-visible hardware signal is mandatory, first compare it with a simpler
owner tablet/kiosk that scans a member QR pass. The latter is cross-platform and
lets the staff device display the member and payment exception without entering
the restricted phone-as-card path.

## Product and competitive implications

Recurring payments plus attendance are not by themselves unique. Gymdesk
markets recurring billing, check-ins, attendance and payment history together;
PushPress already documents check-in alerts for members without an active plan.
[Gymdesk martial arts software](https://gymdesk.com/software/martial-arts)
[PushPress check-ins](https://help.pushpress.com/en/articles/508409-core-members-check-ins)

The sharper matops wedge is for owner-operated grappling gyms with no front
desk: **tap the wall, attendance is done, and only payment exceptions reach the
owner**. The experience must be faster and calmer than a shared kiosk, and the
owner should leave class with a complete "who trained tonight" list.

Measure:

- share of attendees self-checked in;
- median time from tap to confirmation;
- minutes required to close attendance after the last class;
- false overdue signals (target: zero).

## Effort guidance

For one experienced full-time engineer in this codebase:

- passive NFC check-in plus Universal/App Links and on-phone result: **5-8 days**;
- staff "Tonight" feed with payment exception status and polling signal:
  **5-8 days**;
- dedicated phone-as-card NFC and reader hardware: **30-60+ days**, excluding
  hardware certification/procurement and store approvals.
