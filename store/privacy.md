# Privacy answers: Apple App Privacy and Google Play Data safety

Written from what the code actually sends and stores (October 2026, branch `shots/apps`). Re-check this file whenever a
new SDK, analytics tool or data field is added; the marketplace branch adds saved body measurements (see the end).

## What the app actually handles

| Data | Where it comes from | Where it goes | Kept |
| --- | --- | --- | --- |
| Email address | Sign-in (email code, Google, Apple), checkout receipt | Supabase (auth, orders), Moyasar (payment page) | Until account deletion; on kept orders it is removed at deletion |
| Name | Profile, Google/Apple sign-in, delivery recipient | Supabase, delivery companies, tax invoice | Profile until deletion; invoices 6+ years (law) |
| Phone number | Profile, delivery details | Supabase, delivery companies | Until deletion (removed from kept orders) |
| Delivery address, hotel and stay dates | Checkout, box-club form | Supabase, delivery companies, tax invoice (address) | Orders kept for the law; stay dates removed at deletion |
| Gift message | Bag | Supabase (order), printed card | Removed from kept orders at deletion |
| Orders, subscriptions, invoices | Checkout, Moyasar, RevenueCat | Supabase, ZATCA (invoices) | Invoices 6+ years (law) |
| Account id (Supabase user id) | Supabase Auth | Supabase, RevenueCat (as the app user id) | Until deletion |
| App-store purchase records | App Store / Google Play via RevenueCat | RevenueCat, Supabase (membership status) | RevenueCat record deleted at account deletion |
| Assistant messages, page, bag, delivery choice, recent order status | "Ask Al Mukarramah" | Supabase function → Anthropic (Claude API) | Not stored by us; Anthropic may keep API data for a limited time for safety |
| Lesson progress | Quran Trail | Supabase | Until deletion |
| Card details | Typed only on Moyasar's page | Moyasar | Never reach our code or database |

Not in the app: analytics or tracking SDKs, advertising SDKs, crash reporting, device location, contacts, photos,
camera, microphone, health data, IDFA or advertising ID (blocked in app.json). RevenueCat is used without
`collectDeviceIdentifiers`. No data is sold or used for advertising.

## Apple: App Store Connect > App Privacy

**Do you or your third-party partners collect data from this app?** Yes.
**Tracking** (used to track across other companies' apps or websites): **No** for every type.

| Category > Data type | Collected | Linked to the user | Used for tracking | Purposes |
| --- | --- | --- | --- | --- |
| Contact Info > Name | Yes | Yes | No | App Functionality |
| Contact Info > Email Address | Yes | Yes | No | App Functionality; Developer's Advertising or Marketing (only when the customer ticks the marketing box) |
| Contact Info > Phone Number | Yes | Yes | No | App Functionality |
| Contact Info > Physical Address | Yes | Yes | No | App Functionality |
| User Content > Other User Content (gift messages; messages to the assistant) | Yes | Yes | No | App Functionality |
| Identifiers > User ID | Yes | Yes | No | App Functionality |
| Purchases > Purchase History | Yes | Yes | No | App Functionality |

Answer **Not collected** for: Health and Fitness, Financial Info (payment info goes only to Moyasar, Apple or Google;
we never receive it), Location, Sensitive Info, Contacts, Emails or Text Messages, Photos or Videos, Audio, Gameplay
Content, Customer Support (email outside the app), Browsing History, Search History (the shop search is answered in
real time and not stored), Device ID, Usage Data, Diagnostics, Other Data.

Why the assistant counts as collected: messages leave the device and Anthropic may retain API data for a limited
period for safety, which is longer than processing them in real time. They are linked because a signed-in shopper's
order status is added on the server. The app asks for permission before the first message (Guideline 5.1.2(i)).

### Privacy manifest (iOS)
`app.json > ios.privacyManifests` declares no tracking and the "required reason" APIs that React Native, Expo and
AsyncStorage use: UserDefaults (CA92.1), file timestamps (C617.1), system boot time (35F9.1), disk space (E174.1).
Expo modules and RevenueCat ship their own manifests, which Xcode merges. If App Store Connect emails an
ITMS-91053 warning after an upload, add the API it names to that list and build again.

## Google Play: Play Console > App content > Data safety

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request that their data is deleted? **Yes**: in the app (Account > Delete my
  account) and at https://almukarramah.com/delete-account
- Data shared with third parties: **None**. Delivery companies, Anthropic, Moyasar, RevenueCat and Supabase process
  data for us as service providers, which Google does not count as sharing; payments to Google Play are started by the user.

| Data type | Collected | Shared | Optional? | Purposes |
| --- | --- | --- | --- | --- |
| Personal info > Name | Yes | No | Required for orders; optional otherwise | App functionality, Account management |
| Personal info > Email address | Yes | No | Required to sign in or order | App functionality, Account management, Developer communications; Advertising or marketing (only with the customer's opt-in) |
| Personal info > User IDs | Yes | No | Required with an account | App functionality, Account management |
| Personal info > Address | Yes | No | Required for delivery | App functionality |
| Personal info > Phone number | Yes | No | Required for delivery | App functionality |
| Financial info > Purchase history | Yes | No | Required | App functionality |
| Messages > Other in-app messages (the assistant chat) | Yes | No | Optional | App functionality |
| App activity > Other user-generated content (gift messages) | Yes | No | Optional | App functionality |

Not collected: location, web browsing, health and fitness, photos and videos, audio, files and docs, calendar,
contacts, app interactions or in-app search history, installed apps, crash logs, diagnostics, device or other IDs,
user payment info (cards go only to Moyasar; Google Play handles its own payments), race, religion, politics or
other sensitive info.

Security practices to tick: data encrypted in transit; users can request deletion. Do not claim an independent
security review.

## When the marketplace branch is merged
Saved body measurements for tailor-made clothing (`measurement_profiles`) and seller details add data types:
- Apple: Other Data > Other Data Types (body measurements), linked, App Functionality; sellers' business details are
  collected on the website, not in the app.
- Google: Health and fitness > Fitness info is the closest type for body measurements (collected, optional,
  App functionality). Update both forms before the first release that includes the measuring guide.
