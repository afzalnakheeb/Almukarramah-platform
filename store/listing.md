# Store listing: App Store and Google Play

The same text is kept in machine-readable form in `store/store.config.json` (App Store, pushed with
`npx eas-cli metadata:push`) and `store/google-play.json` (Google Play, pasted by hand in Play Console).
Change the JSON files first and copy from here, so the two never drift.

Tone: premium, warm, "For every Muslim home". Homepage headline: "Where your deen and dunya meet" / «حيث يلتقي دينك ودنياك».
Public contact: hello@almukarramah.com only.

**Public text rule (Afzal):** the brand is "Al Mukarramah", presented as a global initiative. No city, and nothing
about where the publishing company is registered, in anything public: names, subtitles, descriptions, promotional
text, keywords, screenshots, the copyright line, release notes. The publisher's legal name (written only in the
"Publisher" line at the top of `docs/app-stores.md`) goes only into the fields the stores require (enrolment,
agreements, payments, the private reviewer notes), never with a city.

## Decisions for Afzal before the first submission
1. **Primary language** in App Store Connect: English (U.K.) with an Arabic localisation (recommended), or Arabic as primary.
2. **Name**: "Al Mukarramah" / «المكرمة». If Apple or Google says the name is taken, use "Al Mukarramah Marketplace" / «سوق المكرمة».
3. **Subtitle**: "For every Muslim home" (brand line). A more searchable alternative: "Perfumes, oud & prayer mats" / «عطور وعود وسجادات صلاة».
4. **Membership in version 1.0**: if the in-app membership is not ready (products, RevenueCat keys), delete the MEMBERSHIP paragraph from both descriptions; the app then hides the membership by itself.
5. **App Store developer name** (set once, can never be changed): see `docs/app-stores.md`, decision A.

The copyright line is **"2026 Al Mukarramah"** (chosen; noted in `docs/app-stores.md`).

## App Store (iPhone and iPad)

| Field | English | Arabic |
| --- | --- | --- |
| App name (≤30) | Al Mukarramah (13) | المكرمة (7) |
| Subtitle (≤30) | For every Muslim home (21) | لكل بيت مسلم (12) |
| Promotional text (≤170) | Where your deen and dunya meet: perfumes, oud, prayer mats and gifts from trusted makers across the Muslim world, delivered to your hotel or to your door. (154) | حيث يلتقي دينك ودنياك: عطور وعود وسجادات صلاة وهدايا من صنّاع موثوقين في أنحاء العالم الإسلامي، نوصلها إلى فندقك أو إلى بابك. (125) |
| Keywords (≤100) | `oud,perfume,attar,bakhoor,prayer mat,sajjadah,islamic gifts,eid,ramadan,dates,umrah,hajj,musk,rug` (97) | `عود,عطور,عطر,بخور,دهن عود,مسك,سجادة صلاة,سجاد,هدايا إسلامية,هدايا,عيد,رمضان,تمور,عمرة,حج` (88) |
| What's new (1.0) | The first version of the Al Mukarramah app. | الإصدار الأول من تطبيق المكرمة. |
| Copyright | 2026 Al Mukarramah | (one field for all languages) |

Keywords leave out the words already in the name and subtitle (Apple searches those anyway), never name other apps
or brands, and never name a city.

- **Primary category**: Shopping. **Secondary**: Lifestyle.
- **Support URL**: https://almukarramah.com/support
- **Marketing URL**: https://almukarramah.com
- **Privacy policy URL**: https://almukarramah.com/privacy
- **Licence agreement**: Apple's standard EULA (leave the custom EULA empty). The description and the membership screen link to it and to our terms.

### Description (English, 1,865 of 4,000)

Where your deen and dunya meet.

Al Mukarramah is a curated marketplace for every Muslim home, bringing together trusted makers from across the Muslim world: perfumes and oud from celebrated Arabian houses, prayer mats and woven rugs inspired by the Haramain, premium dates, keepsakes and gift sets. Every product is approved by our team before it appears.

SHOP WITH CARE
• Perfumes, oud oils and bakhoor, prayer mats and woven rugs, dates and gifts, in English and Arabic
• Prices in Saudi riyals and other major currencies, with VAT included
• Delivery to your hotel during Umrah or Hajj, to homes and offices across Saudi Arabia, or abroad
• The delivery charge and timing are shown before you pay

GIFTS, TAKEN CARE OF
• Every order is wrapped and presented, ready to give
• A printed gift message, and prices never appear on anything the recipient sees
• A gift assistant that suggests ideas by occasion, recipient and budget, from our live catalogue, and writes your card

SECURE AND SIMPLE
• Pay on Moyasar's secure page with mada, Apple Pay, STC Pay or card; we never see or store your card details
• A ZATCA tax invoice with every order, kept in your account
• Shop as a guest, or sign in with Apple, Google or your email

MEMBERSHIP
The Al Mukarramah membership opens the Quran Trail: daily lessons, with the Quran text shown exactly as published by the Quran Foundation. It is a monthly subscription that renews automatically, paid through your Apple ID and managed in your App Store account settings.

DATES CLUB
A box of premium dates, delivered every month within Saudi Arabia.

YOUR ACCOUNT, YOUR CHOICE
Marketing messages only if you ask for them. Delete your account at any time in the app: Account, then Delete my account.

Terms of use: https://almukarramah.com/terms
Privacy policy: https://almukarramah.com/privacy
Help: hello@almukarramah.com

### الوصف (العربية، ١٬٦١٦ من ٤٬٠٠٠)

حيث يلتقي دينك ودنياك.

المكرمة سوق مختار لكل بيت مسلم، يجمع صنّاعًا موثوقين من أنحاء العالم الإسلامي: عطور وعود من دور عربية عريقة، وسجادات صلاة وسجاد منسوج مستوحى من الحرمين الشريفين، وتمور فاخرة، وتذكارات ومجموعات هدايا. يعتمد فريقنا كل منتج قبل أن يظهر في السوق.

تسوّق بعناية
• عطور ودهن عود وبخور، وسجادات صلاة وسجاد منسوج، وتمور وهدايا، بالعربية والإنجليزية
• الأسعار بالريال السعودي وعملات رئيسية أخرى، شاملة ضريبة القيمة المضافة
• التوصيل إلى فندقك خلال العمرة أو الحج، وإلى المنازل والمكاتب في جميع مناطق المملكة، وإلى الخارج
• تظهر رسوم التوصيل وموعده قبل الدفع

الإهداء علينا
• يُغلَّف كل طلب ويُقدَّم جاهزًا للإهداء
• رسالة إهداء مطبوعة، ولا تظهر الأسعار أبدًا على ما يصل إلى المُهدى إليه
• مساعد هدايا يقترح عليك حسب المناسبة والشخص والميزانية، من كتالوجنا الحالي، ويكتب لك بطاقة الإهداء

آمن وسهل
• ادفع عبر صفحة ميسر الآمنة بمدى أو Apple Pay أو STC Pay أو البطاقة، ولا نرى بيانات بطاقتك ولا نحفظها
• فاتورة ضريبية متوافقة مع هيئة الزكاة والضريبة والجمارك مع كل طلب، محفوظة في حسابك
• تسوّق كضيف، أو سجّل الدخول عبر Apple أو Google أو بريدك الإلكتروني

العضوية
تفتح لك عضوية المكرمة رحلة القرآن: دروس يومية يُعرض فيها نص القرآن الكريم كما نشرته مؤسسة القرآن (Quran Foundation) تمامًا. وهي اشتراك شهري يتجدد تلقائيًا، يُدفع عبر حساب Apple ID ويُدار من إعدادات حسابك في App Store.

نادي التمور
صندوق من التمور الفاخرة يصلك كل شهر داخل المملكة العربية السعودية.

حسابك واختيارك
لا رسائل تسويقية إلا إذا طلبتها. ويمكنك حذف حسابك في أي وقت من التطبيق: «حسابي» ثم «حذف حسابي».

الشروط والأحكام: https://almukarramah.com/terms
سياسة الخصوصية: https://almukarramah.com/privacy
المساعدة: hello@almukarramah.com

### Age rating (App Store Connect > App Information > Age Rating)
Answer **None / No** to everything; the expected rating is **4+**.
- Parental controls, age assurance: No.
- Unrestricted web access: **No** (the app opens only our own pages, Moyasar's payment page and our other apps' sites in an in-app browser).
- User-generated content: No (every product is written and approved by our team; there are no public posts or reviews).
- Messaging and chat between users: No. If App Store Connect asks about AI or chatbot features, answer **Yes**: a shopping assistant (Anthropic's Claude) that answers from our catalogue, asks before the first message, and gives no religious rulings.
- Advertising: No.
- Alcohol, tobacco or drug use or references: None (perfumes are fragrances, not drinks).
- Contests, gambling, simulated gambling, loot boxes: None / No.
- Medical or treatment information, health or wellness topics: None / No.
- Profanity, horror, mature or suggestive themes, sexual content or nudity, violence of any kind, guns or weapons: None.
- Made for Kids: No.

## Google Play

| Field | English | Arabic |
| --- | --- | --- |
| App name (≤30) | Al Mukarramah | المكرمة |
| Short description (≤80) | Perfumes, oud, prayer mats and gifts for every Muslim home, chosen with care. (77) | عطور وعود وسجادات صلاة وهدايا لكل بيت مسلم، مختارة بعناية. (58) |
| Full description (≤4,000) | `store/google-play.json`, 1,789 characters | `store/google-play.json`, 1,532 characters |

The Google text is the App Store text with three changes: payment is "mada, STC Pay or card" (Apple Pay only on Apple
devices), sign-in is "Google or your email", and the membership is "paid through Google Play and managed in your
Google Play subscriptions". Deletion also names almukarramah.com/delete-account.

- **App category**: Shopping. **Tags**: Shopping, Gifts, Lifestyle (pick the closest Google offers).
- **Developer name shown on Google Play**: Al Mukarramah. **Contact email**: hello@almukarramah.com. **Website**: https://almukarramah.com
- **Privacy policy**: https://almukarramah.com/privacy
- **Delete account URL** (Data safety): https://almukarramah.com/delete-account
- **Graphics**: app icon 512 × 512 (from `assets/app-icon.png`), feature graphic 1024 × 500, phone screenshots (see the screenshot folder).

### Content rating (IARC questionnaire)
Category: "All other app types". Violence, sexuality, language, controlled substances, crude humour, gambling:
**No** to all. Users interact or exchange content with each other: **No**. Shares the user's location: **No**.
Purchases of digital goods: **Yes** (the membership), otherwise No. Unrestricted internet access: **No**.
Expected rating: Everyone / PEGI 3 / 3+.

### App content declarations
- Ads: **No ads**.
- Target audience: **18 and over** (keeps the app outside the Families programme; it is a shop with payments).
- News app: No. COVID-19 app: No. Government app: No. Financial features: **No** (customers pay for goods; the app offers no financial services).
- Health app: No. Advertising ID: **No** (the permission is blocked in app.json).
- App access: some features need sign-in; give the review account and steps from `store/review-notes.md`.
- Data safety: `store/privacy.md`.
