# In-app purchases: App Store Connect, Google Play and RevenueCat

What the app expects (src/lib/purchases.native.ts, supabase/functions/revenuecat-webhook):
- one RevenueCat **entitlement** with the identifier `member`;
- the **current offering** has a **monthly package** (`$rc_monthly`) holding the store products;
- the RevenueCat **app user id** is the Supabase user id (the app logs in with it after sign-in);
- the webhook records every app-store membership against the `member-monthly` plan in Supabase, which opens the
  Quran Trail lessons through row-level security (`private.is_member()`).

Physical goods and the Dates Club (`dates-club`, SAR 129.00 a month in the plans table) are never in-app purchases:
they are paid with Moyasar. Only the membership is sold through the stores.

## The product

| | App Store Connect | Google Play Console | RevenueCat |
| --- | --- | --- | --- |
| Type | Auto-renewable subscription | Subscription with one auto-renewing base plan | Product attached to entitlement `member` |
| Group / product | Subscription group **Al Mukarramah Membership** (one level) | Subscription **member_monthly** | Offering **default** (current), package **$rc_monthly** |
| Product ID | **com.almukarramah.app.member.monthly** | **member_monthly**, base plan **monthly** | iOS: `com.almukarramah.app.member.monthly`; Android: `member_monthly:monthly` |
| Duration | 1 month | 1 month, auto-renewing | |
| Display name | Membership · العضوية | Membership · العضوية | |
| Description | Quran Trail lessons and member benefits · رحلة القرآن ومزايا الأعضاء | same | |
| Price | **Decision for Afzal** (see below) | **Decision for Afzal** | |

### Price: Afzal decides
- The website membership is **SAR 29.00 a month** (plans table: `member-monthly`, `price_sar = 2900` halalas,
  VAT included).
- Apple and Google set store prices from their own price points per country, and keep a commission (15% for
  developers in Apple's Small Business Program and for Google subscriptions; enrol in Apple's programme in App Store
  Connect > Agreements). Pick the SAR price point nearest to what you want in each store; the app shows the store's
  own price, never the website's.
- Free trial or introductory offer: none unless you decide on one.

### Store listing for the subscription
- Review screenshot (App Store Connect asks for one): the Membership screen in the app with the store price showing.
- Review notes: "Opens the Quran Trail lessons in the app. Physical products are sold separately through Moyasar."
- Localisations: English and Arabic, with the names and descriptions above.

### Before the subscription goes on sale: decisions
1. The plan text in the database says "Quran Trail and Seerah Trail, member prices, early access, free gift
   wrapping". Today the app delivers the Quran Trail lessons only: Seerah Trail is a separate free website, and member
   prices and early access are not built. Apple rejects subscriptions whose description promises what the app does not
   deliver (Guidelines 2.3.1 and 3.1.2), so change `plans.description_en/ar` for `member-monthly` to what members get
   now (Claude can do it with your approval), or launch version 1.0 without the membership.
2. Set `plans.store_product_id_ios` and `store_product_id_android` for `member-monthly` to the product ids above
   (for reference; the app reads the offering from RevenueCat).

## RevenueCat set-up (after the developer accounts exist)
1. Create a RevenueCat project "Al Mukarramah".
2. Add the **App Store** app: bundle id `com.almukarramah.app`; upload the **In-App Purchase key** (.p8) from
   App Store Connect > Users and Access > Integrations > In-App Purchase; in App Store Connect > App Information,
   set the App Store Server Notifications URL (version 2) to the one RevenueCat shows.
3. Add the **Play Store** app: package `com.almukarramah.app`; upload a Google Cloud service-account JSON key whose
   account has, in Play Console > Users and permissions, "View financial data" and "Manage orders and
   subscriptions"; turn on Real-time developer notifications with the Pub/Sub topic RevenueCat creates.
4. Products: import both store products; create entitlement `member` and attach both; create offering `default`,
   make it current, add package `$rc_monthly` with both products.
5. Integrations > Webhooks: URL `https://axpwiixtqkjwjbsqzwqv.supabase.co/functions/v1/revenuecat-webhook`,
   Authorization header: a long random string. Put the same string in Supabase > Edge Functions > Secrets as
   `REVENUECAT_WEBHOOK_AUTH`.
6. API keys: the **public** app-specific keys (`appl_…` and `goog_…`) go into the app build as
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (EAS > Environment variables, production
   and preview; they are public keys). The **secret** key (`sk_…`, v1) goes only into Supabase secrets as
   `REVENUECAT_SECRET_KEY` (used to delete the customer record when an account is deleted). Never put it in the app.
7. Test: build the preview or development profile, sign in, buy with a sandbox Apple account or a Google licence
   tester, check that RevenueCat shows the purchase, that Supabase `subscriptions` gets a row with source
   `app_store` or `play_store`, and that "Open the Quran Trail" shows the lessons. Then Restore purchases.
