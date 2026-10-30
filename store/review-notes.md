# Notes for the App Store and Google Play reviewers

Paste the Apple text into App Store Connect > the version > App Review Information > Notes (under 4,000
characters), and the Google text into Play Console > App content > App access. The review account's email and
password go only into the sign-in fields of those forms, never into this repository.

Before pasting, replace **[PUBLISHER]** (twice below) with the publisher's legal name from the "Publisher" line at
the top of `docs/app-stores.md`, the only place it is written. No city anywhere in these notes.

## Apple (App Review Information > Notes)

Al Mukarramah is a curated marketplace for physical products: perfumes, oud, prayer mats, dates and gifts.
Sign-in is optional; you can browse and check out as a guest.

PUBLISHER AND STORE
Al Mukarramah is the brand of [PUBLISHER] (app publisher). The online store at almukarramah.com is operated by Al Mukarramah Stores Trading Est. (مؤسسة متاجر المكرمة للتجارة, Saudi Arabia). Both are managed by Afzal Nakheeb.

PAYMENTS
- Physical products, and the Dates Club (a box of dates delivered every month to an address in Saudi Arabia), are
  paid on the secure payment page of Moyasar, a payment company licensed by the Saudi Central Bank, opened in an
  in-app Safari view. These are physical goods used outside the app (Guideline 3.1.3(e)). You do not need to pay: you
  can stop at the payment page.
- The membership is digital (it opens the Quran Trail lessons in the app) and is sold only with In-App Purchase:
  the auto-renewable subscription "Member monthly" in the group "Al Mukarramah Membership". The app never shows
  another way to buy it. Restore purchases is on the Membership screen, with the renewal terms and the links to our
  terms, privacy policy and Apple's standard licence agreement.
- Sign-in is needed before subscribing because the membership belongs to the customer's account and also works on
  our website.

QURAN TEXT
The Quran Trail shows Quran text from the Quran Foundation API, exactly as published: never edited, summarised,
reordered or translated by AI. Lessons are reviewed by a qualified scholar before publication.

AI ASSISTANT
"Ask Al Mukarramah" (the round button at the bottom of the screen, and Gift assistant) uses Anthropic's Claude to
suggest products from our live catalogue and to write gift-card messages. Before the first message the app explains
what is sent to Anthropic and asks for permission. Every reply has "Report this reply". It gives no religious
rulings and cannot place orders.

SIGN-IN AND THE REVIEW ACCOUNT
Account tab: Sign in with Apple, Continue with Google, or an email code. For this review use the account in the
sign-in fields: on the Account tab tap "Have a password? Sign in with it", then enter the email and password.

HOW TO REACH EVERY FEATURE
1. Home tab: the collections, the fragrance house, occasions, and "Help me choose a gift" for the gift assistant.
2. Shop tab: every product with filters. Open a product, then Add to bag.
3. Bag tab: change quantities, add a gift message, Continue to delivery. On the delivery page choose a hotel,
   home or office, see the delivery options and charge, then Pay securely opens Moyasar's page.
4. Account tab: orders and tax invoices, your details and marketing choice, Membership, Our apps, The app
   (language, help and contact, privacy policy, terms, version) and Delete my account.
5. Membership: Account tab (signed in) > the Membership tile. Join opens the App Store purchase sheet (sandbox).
   Afterwards the screen shows "Open the Quran Trail".
6. Account deletion: Account tab > Delete my account > tick "I understand" > Delete my account permanently. If you
   delete the review account we will create it again before the next submission.
7. Language: Account tab > The app > Language (the layout switches to right-to-left Arabic after the app restarts),
   or set the iPhone's language to Arabic.

Contact: hello@almukarramah.com

## Google Play (App content > App access)

Choose "All or some functionality in my app is restricted" and add one set of instructions:
- Name: Review account
- Username / Password: the review account (Play Console fields only)
- Any other instructions (kept under 500 characters, in case the form limits it):

  Sign-in is optional; shopping and checkout work as a guest. For orders, the membership and account deletion: Account tab > "Have a password? Sign in with it". Products are paid on Moyasar's page; no payment is needed. Membership: Google Play subscription (Account > Membership > Join; Restore purchases there). The AI gift assistant asks for consent first; each reply has "Report this reply". Delete: Account > Delete my account.

If the form takes more text, add the publisher paragraph:

  Al Mukarramah is the brand of [PUBLISHER] (app publisher). The online store at almukarramah.com is operated by Al Mukarramah Stores Trading Est. (مؤسسة متاجر المكرمة للتجارة, Saudi Arabia). Both are managed by Afzal Nakheeb.

Google has no other notes field; if a reviewer asks who runs the store, reply with that paragraph.

## The review account (Afzal creates it)

- **Where**: Supabase dashboard > Authentication > Users > Add user > Create new user.
- **Email**: an address on our domain that Afzal can read, for example review@almukarramah.com (not published
  anywhere; the public contact stays hello@almukarramah.com).
- **Password**: 16 or more random characters, kept in a password manager and typed only into App Store Connect and
  Play Console.
- **Auto Confirm User**: ticked, so no email is needed.
- **Profile**: after the first sign-in, set the name to "App Review" on the Account tab. No phone, no address.
- **Not staff and not a seller**: never add it to `staff_members` or a seller shop.
- **No orders**: do not place paid test orders on the live site; every paid order creates a tax invoice that can
  never be deleted.
- **In-app purchases**: Apple reviewers buy with their own sandbox accounts. For Google, add your own testers under
  Play Console > Settings > License testing to test the subscription yourself.
- **After each review**: check the account still exists (the reviewer may delete it) and recreate it with the same
  email if needed.
- **Before submitting**: sign in with it once on a TestFlight or internal-testing build to check it works.
