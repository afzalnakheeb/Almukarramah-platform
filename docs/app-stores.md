# App Store and Google Play: what Afzal does, in order

The app side is ready on branch `shots/apps`: build profiles (`eas.json`), icons and splash, Sign in with Apple,
account deletion, the in-app membership, store texts (`store/`), privacy answers (`store/privacy.md`), reviewer notes
(`store/review-notes.md`) and a release workflow. What is left needs accounts that only the company can open.
Steps marked **Claude** can be done by Claude Code once you say yes.

Keep every password, key file (.p8, .json) and token in a password manager. Never paste them into chat, the
repository or an email.

## 1. A company email for the store accounts (15 minutes)
1. Create a mailbox on our domain that only you read, for example `apps@almukarramah.com`.
2. Use it for Apple, Google, Expo and RevenueCat. Keep `hello@almukarramah.com` as the only public contact.

## 2. An Apple ID for the company (15 minutes)
1. Go to account.apple.com > Create your Apple ID, with `apps@almukarramah.com`.
2. Turn on two-factor authentication with your own mobile number (Apple requires it).

## 3. D-U-N-S number (free; 1 to 30 days)
Apple and Google both need it for an organisation account.
1. Open developer.apple.com/enroll/duns-lookup and sign in with the new Apple ID.
2. Enter the company **exactly as on the Saudi commercial registration (CR)**: legal name, address, phone.
3. If it is found, write the number down. If not, press **Submit** to request one; Dun & Bradstreet will email or
   call you. It can take up to 30 days; after you receive it, Apple needs up to 2 working days to see it.

## 4. Google Play organisation account (USD 25 once; 1 to 7 days)
1. Go to play.google.com/console/signup with a Google account on `apps@almukarramah.com`.
2. Choose **An organisation**; enter the D-U-N-S number, the legal name and address as on the CR, the website
   almukarramah.com, `hello@almukarramah.com` as the public contact email and a contact phone.
3. Create the **payments profile** for the organisation when asked and pay USD 25.
4. Verify the documents Google asks for (CR, ID). Organisation accounts skip the 12-tester rule for new apps.

## 5. Apple Developer Program, as an organisation (USD 99 a year; 2 days to 2 weeks)
1. Install the **Apple Developer** app on your iPhone (fastest) or go to developer.apple.com/programs/enroll.
2. Sign in with the company Apple ID > Enroll > **Organisation**.
3. Enter the D-U-N-S number, the legal name exactly as on the CR, the website almukarramah.com and your role (you
   must be able to sign legal agreements for the company).
4. Answer Apple's verification call or email, then pay USD 99.

## 6. Expo account and the GitHub secret (20 minutes)
1. Go to expo.dev > Sign up with `apps@almukarramah.com`; create an organisation **almukarramah**.
2. **Claude**: run `npx eas-cli init` in the project (you log in once); it adds the project id and owner to `app.json`.
3. expo.dev > the organisation > Settings > Access tokens (or Robot users > create a robot, then a token) > copy it.
4. GitHub > almukarramah-platform > Settings > Secrets and variables > Actions > **New repository secret**:
   name `EXPO_TOKEN`, value the token.

## 7. App Store Connect: agreements, bank and tax (30 minutes; checks take 1 to 3 days)
1. appstoreconnect.apple.com > **Business** (Agreements, Tax and Banking).
2. Accept the **Paid Apps** agreement (needed for the membership in-app purchase).
3. Add the company bank account (IBAN), the US tax form W-8BEN-E for a non-US company, and the contacts.
4. Enrol in the **App Store Small Business Program** at developer.apple.com/app-store/small-business-program
   (15% commission on the membership instead of 30%).

## 8. Create the apps in the stores (20 minutes)
1. App Store Connect > Apps > **+** > New App: iOS, name **Al Mukarramah**, primary language (see
   `store/listing.md`), bundle ID **com.almukarramah.app** (register it under Certificates, Identifiers & Profiles >
   Identifiers if it is not offered), SKU `almukarramah-ios`.
2. Open App Information and copy the **Apple ID** number. **Claude** adds it to `eas.json` as
   `submit.production.ios.ascAppId`.
3. Play Console > Create app: name **Al Mukarramah**, default language, App, Free, accept the declarations.

## 9. App Store Connect API key for Expo (10 minutes)
1. App Store Connect > Users and Access > **Integrations** > App Store Connect API > Team Keys > **+**:
   name `EAS`, access **App Manager** > Generate.
2. Download the `.p8` (only once possible); note the **Key ID** and the **Issuer ID** above the list.
3. In the project folder run `npx eas-cli credentials --platform ios` > App Store Connect: Manage your API Key >
   Add a new key, and give it the file, Key ID and Issuer ID. (Or answer the same questions at the first `eas submit`.)

## 10. Play Console: payments and a service account for uploads (30 minutes)
1. Play Console > Setup > **Payments profile**: check the bank account (needed to sell the membership).
2. console.cloud.google.com > create a project "almukarramah-play" > APIs & Services > enable
   **Google Play Android Developer API**.
3. IAM & Admin > Service accounts > Create `eas-submit` > Keys > Add key > **JSON** > download.
4. Play Console > Users and permissions > **Invite new users** > the service account's email > App permissions:
   Al Mukarramah > Release to testing tracks, Release to production, Manage store presence > Invite.
5. Run `npx eas-cli credentials --platform android` > Google Service Account > Upload the JSON key.

## 11. Sign in with Apple (20 minutes)
1. developer.apple.com > Certificates, Identifiers & Profiles > Identifiers > **com.almukarramah.app** >
   Capabilities: tick **Sign In with Apple** (Enable as a primary App ID) > Save. (The first EAS build can also do this.)
2. **Keys** > **+** > name `Sign in with Apple`, tick **Sign in with Apple** > Configure > primary App ID
   com.almukarramah.app > Save > Continue > Register > **Download** the `AuthKey_XXXXXXXXXX.p8` (only once). Note the
   **Key ID**, and the **Team ID** (top right of the page).
3. Supabase dashboard > Authentication > Sign In / Providers > **Apple** > Enable. Client IDs:
   `com.almukarramah.app` (add `host.exp.Exponent` only while testing in Expo Go). Leave "Secret Key (for OAuth)"
   empty: it is only for Sign in with Apple on the website, which we do not offer. Save.
4. Supabase > Edge Functions > Secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (paste the whole .p8,
   including the BEGIN and END lines), `APPLE_BUNDLE_ID` = `com.almukarramah.app`. They let account deletion revoke
   Apple's sign-in, as Apple requires.
5. Hidden emails: Certificates, Identifiers & Profiles > Services > **Sign in with Apple for Email Communication** >
   add the domain and the address our emails come from (needs SPF on almukarramah.com), so customers who hide their
   email still receive order and sign-in emails. If Supabase still sends sign-in emails from its own address, set up
   your own SMTP first (Supabase > Authentication > Emails > SMTP settings).
6. A Services ID is **not** needed now. Create one only if you later want Sign in with Apple on the website.

## 12. Supabase settings the app needs (10 minutes)
1. Authentication > Emails > **Magic Link** and **Confirm signup** templates: add the code next to the link, for
   example `<p>Your sign-in code: <strong>{{ .Token }}</strong></p>` and
   `<p>رمز الدخول: <strong>{{ .Token }}</strong></p>`. The app signs in with this code; the website keeps the link.
2. Authentication > URL Configuration > Redirect URLs: add `almukarramah://**` (Continue with Google returns to
   the app through it).
3. **Claude**, after your yes: apply migration `0010_account_deletion.sql` and deploy the `delete-account` and
   `revenuecat-webhook` functions. Account deletion must work before the first submission: Apple tests it.

## 13. RevenueCat and the membership (1 hour; after steps 7, 8 and 10)
Follow `store/in-app-purchases.md`: create the subscription in App Store Connect and Play Console (your price
decision), the RevenueCat project, entitlement `member`, offering `default`, the webhook and the keys. Then put the
public keys in EAS: expo.dev > the project > Environment variables > `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (environments: production and preview, plain text). Without them the app simply
does not offer the membership, which is fine for version 1.0.

## 14. The reviewer account (10 minutes)
Create it as described in `store/review-notes.md` (Supabase > Authentication > Users > Add user, Auto Confirm),
sign in with it once on a test build, and enter its email and password only in App Store Connect (App Review
Information > Sign-in required) and Play Console (App content > App access).

## 15. Build, test and submit
1. GitHub > Actions > **App release (store builds)** > Run workflow: platform `all`, submit off. EAS builds both apps
   (about 30 to 60 minutes) and keeps the build numbers.
2. iPhone: install from TestFlight (App Store Connect > TestFlight; add yourself as an internal tester).
   Android: the **first** upload must be by hand: download the `.aab` from expo.dev > Builds, then Play Console >
   Testing > Internal testing > Create release > upload. Later builds can use "submit" in the workflow.
3. Test on a phone: Sign in with Apple, Google and the email code; a product to the bag and up to Moyasar's page;
   Arabic; the assistant's permission; the membership in sandbox; Delete my account (with a spare account).
4. Fill the listings from `store/listing.md`, the privacy forms from `store/privacy.md`, upload the screenshots,
   paste the reviewer notes, then **Submit for review** (App Store Connect) and **Send for review** (Play Console).

## What each step unblocks

| Your step | Unblocks |
| --- | --- |
| 1–3 Email, Apple ID, D-U-N-S | Steps 4 and 5 |
| 4 Google Play account | Android store listing, service account (10), Play subscription (13), first Android upload (15) |
| 5 Apple Developer Program | Bundle ID and Sign in with Apple key (11), App Store Connect (7–9), TestFlight, iOS subscription (13) |
| 6 Expo account and `EXPO_TOKEN` | `eas init`, every build, the GitHub release workflow |
| 7 Agreements, bank, tax | Selling the membership; sandbox purchase testing |
| 8 App records and `ascAppId` | Submitting from the workflow (`eas submit`) and pushing the App Store texts (`eas metadata:push`) |
| 9 / 10 Upload keys | Automatic uploads to App Store Connect and Google Play |
| 11 Sign in with Apple | The Apple button working, and Apple-token revocation on account deletion |
| 12 Supabase settings and the deploy | Email-code sign-in and Google sign-in in the apps; account deletion |
| 13 RevenueCat | The membership appearing in the apps |
| 14 Reviewer account | Submission (both stores ask for it) |
