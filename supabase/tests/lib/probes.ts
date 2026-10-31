// The independent re-review's disguised contact details (REVIEW-2, M3: js/mask2.mts), with what must not survive the
// masking, and ordinary text that must be left alone. Used for both checks: the server's (contact.ts, cleanText) and
// the database's (private.contact_hint).

/** A disguised contact detail, and a pattern of what must not be left readable after masking. */
export const CONTACT_PROBES: [string, RegExp][] = [
  // two numbers joined by a separator: one run of more than 15 digits
  ['My numbers: 0501234567 / 0551234567', /0501234567|0551234567/],
  ['call 0501234567 - 0551234567', /0501234567|0551234567/],
  ['+966501234567 0551234567', /966501234567|0551234567/],
  // zero-width and direction characters between the digits
  ['call 050​123​4567', /123/],
  ['call 05‌01‌23‌45‌67', /45/],
  ['call 050⁠123⁠4567', /123/],
  ['call 050‎123‎4567', /123/],
  // any separator
  ['call 050*123*4567', /123/],
  ['call 050·123·4567', /123/],
  ['call 050,123,4567', /123/],
  ['call 050+123+4567', /123/],
  ['call 050~123~4567', /123/],
  ['call 050 ، 123 ، 4567', /123/],
  ['call 050٫123٫4567', /123/],
  ['call 050—123—4567', /123/],
  // other digit systems
  ['call ०५०१२३४५६७', /१२३/],
  ['call ০৫০১২৩৪৫৬৭', /১২৩/],
  ['call 𝟎𝟓𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕', /𝟏𝟐𝟑/u],
  ['call ⓪⑤⓪①②③④⑤⑥⑦', /①②③/],
  ['call ⁰⁵⁰¹²³⁴⁵⁶⁷', /¹²³/],
  // words and digits mixed
  ['call 050 one two three 4567', /4567|one two three/],
  ['zero five zero 1234567', /1234567/],
  ['٠٥٠ واحد اثنان ثلاثة ٤٥٦٧', /٤٥٦٧|واحد اثنان/],
  // emails
  ['ali @ gmail . com', /gmail/],
  ['ali@gmail dot com', /gmail/],
  ['ali {at} gmail {dot} com', /gmail/],
  ['ali at gmail', /gmail/],
  ['ali at gmail.com', /gmail/],
  ['aliATgmailDOTcom', /gmail/i],
  // handles, and the name after an app
  ['find us on insta: oudhouse_official', /oudhouse/],
  ['ig:@oudhouse', /oudhouse/],
  ['IG/@oudhouse', /oudhouse/],
  ['snap: oud.house', /oud\.house/],
  ['t.me/oudhouse', /oudhouse/],
  ['telegram oudhouse_sa', /oudhouse/],
  // bank accounts
  ['SA٠٣٨٠٠٠٠٠٠٠٦٠٨٠١٠١٦٧٥١٩', /٦٠٨٠|0608/],
  ['bank account 0380000000608010167519', /0608010167519/],
  ['IBAN: S A 0 3 8 0 0 0 0 0 0 0 6 0 8 0 1 0 1 6 7 5 1 9', /6 0 8 0 1/],
  ['ايبان SA03 8000 0000 6080 1016 7519', /6080 1016/],
];

/** Invitations to deal or pay outside Al Mukarramah: flagged for our team (the words stay readable). */
export const SOLICIT_PROBES = ['حوّل المبلغ على حسابي', 'كلمني على الخاص', 'ارسل لي رقمك', 'send me your number'];

/**
 * More disguises that the stricter number rules of the third review (R3-1) must still catch: a phone number whatever
 * its grouping (also after a word like "order", glued to a word, or written in reverse group order, which a
 * right-to-left line shows the right way round), a foreign number without +, a card number.
 */
export const EXTRA_PROBES: [string, RegExp][] = [
  ['رقمي 67 45 23 01 05', /67 45 23/],
  ['call 5 0 1 2 3 4 5 6 7', /5 0 1 2 3/],
  ['whatsapp 966 50 123 4567', /123 4567/],
  ['966 501 234 567', /501 234/],
  ['+966 501 234 567', /501 234/],
  ['00966 50 123 4567', /123 4567/],
  ['+44 7911 123456', /7911/],
  ['my US number 555 123 4567', /555 123 4567/],
  ['4567 123 050', /4567 123/],
  ['card 4111 1111 1111 1111', /1111 1111/],
  ['call0501234567', /0501234567/],
  ['Order 0501234567', /0501234567/],
  ['Tracking: 0501234567', /0501234567/],
  ['Sizes 52 54 56, call 0501234567', /0501234567/],
  ['Prices 450 / 650 / 950, my number 0551234567', /0551234567/],
  ['٠٥٠١٢٣٤٥٦٧ على الواتس', /١٢٣٤/],
  ['ali at hotmail', /hotmail/],
  ['ali@outlook', /outlook/],
  ['Call me on 0501234567, Maryam', /0501234567/],
];

/**
 * The fourth review's disguises (REVIEW-4, R4-2 and R4-4: js/new_bypass.mts): a phone number next to another number,
 * through a date, time or amount, grouped like a list, an 8-digit Gulf mobile, and more. Each must be caught.
 */
export const R4_PROBES: string[] = [
  'My number 0501234567 / 123456', 'Order 104912 / 0501234567', 'Order 104912 0501234567 thanks', '123456 0501234567',
  'call 0501234567 #123456', '0501234567 / 0551234567 / 12', 'my number 050 1,234 567', 'call 05:01 23:45 67', 'call 050 12:34 567',
  'call 0501 234.56 7', 'call 05/01/2023 4567', 'my number 50 12 34 567', 'my number 55 123 45 67', 'my number 501 234 567',
  'my number 5 0 1 2 3 4 5 6 7', 'my number 99123456', 'my number 9912 3456', 'my number 965 9912 3456', 'my number +965 9912 3456',
  'my number 00965 99123456', 'whatsapp me 3312 3456', 'رقمي 3612 3456', 'رقمي ٩١٢٣٤٥٦٧', 'call me 98765 43210', 'call me 9876543210',
  'call (555) 123-4567', 'order 0501234567', 'size 501234567', 'tracking 966501234567', 'رقمي ٦٧ ٤٥ ٢٣ ٠١ ٠٥', 'tel0501234567ok',
  'my card 4111 1111 1111 1111', '05😀01😀23😀45😀67', 'رقمي ٠٥٠ ثم ١٢٣ ثم ٤٥٦٧', 'price 0501234567 SAR', 'call 050x123x4567',
  'IBAN 03 8000 0000 6080 1016 7519',
  // the 8-digit Gulf mobiles without a contact word, and in Arabic digits; "501 234 567" after a contact word
  '9912 3456', '33123456', '٩٩١٢ ٣٤٥٦', '٣٣١٢٣٤٥٦', 'جوالي ٦٦١٢ ٣٤٥٦', 'رقمي ٥٠١ ٢٣٤ ٥٦٧', 'واتس ٥٥ ١٢٣ ٤٥ ٦٧',
];

/** Natural messages with a phone number next to another number (js/natural.mts): only the phone number is masked. */
export const R4_NATURAL: [string, string][] = [
  ['Order 104912, 0501234567', 'Order 104912, •••'],
  ['طلبي ١٠٤٩١٢ رقمي ٠٥٠١٢٣٤٥٦٧', 'طلبي ١٠٤٩١٢ رقمي •••'],
  ['طلبي ١٠٤٩١٢ - ٠٥٠١٢٣٤٥٦٧', 'طلبي ١٠٤٩١٢ - •••'],
  ['My order 104912 / mobile 0501234567', 'My order 104912 / mobile •••'],
  ['AM-104912 0501234567', 'AM-104912 •••'],
  ['Tracking 290012345678 call 0501234567', 'Tracking 290012345678 call •••'],
  ['Room 1204 0501234567', 'Room 1204 •••'],
  ['Room 1204, 0501234567', 'Room 1204, •••'],
  ['Hotel booking 4567890 0501234567', 'Hotel booking 4567890 •••'],
  ['0501234567 (2 bottles)', '••• (2 bottles)'],
  ['my number 050 123 4567 x2', 'my number ••• x2'],
  ['+966 50 123 4567 / 123456', '••• / 123456'],
];

/** Numbers that look like an 8-digit Gulf mobile but are not one: after a code word, a date, glued to letters. */
export const R4_ORDINARY = ['Order 99123456 arrived', 'Model 77889900', 'Tracking: 51234567', 'Invoice 30000003', 'Delivered 31102026', 'SKU77889900',
  'طلب رقم ٩٩١٢٣٤٥٦ وصل', 'Gift card 5678 1234'];

/**
 * The re-review's everyday texts (REVIEW-3, R3-1: js/ordinary.mts): messages, return details and cancellation
 * reasons that must reach the other person untouched and unflagged, and that a shop page may say.
 */
export const EVERYDAY = [
  'Order AM-104912-1 arrived, thank you',
  'My orders 104912, 104913 both arrived',
  'Orders 104912 and 104913',
  'Return R-104912-1 and R-104912-2',
  'Your tracking number is 7701234567890',
  'Tracking: SMSA 290012345678',
  'Thobe sizes 52 54 56 58 60',
  'sizes 50, 52, 54, 56, 58',
  'المقاسات ٥٢ ٥٤ ٥٦ ٥٨ ٦٠',
  'Measurements chest/length/sleeve: 104/140/60/45',
  'chest 104 cm, length 140 cm, sleeve 60 cm',
  'Height 170 cm, weight 65 kg, shoe size 42',
  'Total 1,250.00 + 30.00 delivery = 1,280.00 SAR',
  'Prices: 450 / 650 / 950 SAR',
  'Price SAR 1,250.00',
  'From 31/10/2026 - 05/11/2026 we are closed',
  'Dates 2026-10-31 to 2026-11-05',
  'Pick up between 10:00-12:00 or 16:00-18:00',
  'Surah Al-Baqarah 2:255',
  'Booking number 4567-8901-2345 at the Pullman Zamzam',
  'Hotel room 1204, floor 12, tower 3, check-in 2026-11-02',
  'Product codes 10234 10235 10236',
  'I bought 3 x 12 ml and 2 x 6 ml',
  'I have one, two, three, four, five, six and seven kids',
  'one or two bottles, maybe three',
  'أريد ثلاث علب، وواحدة لأختي، خلال سبعة أيام',
  'السعر ٤٥٠ ريال والتوصيل ٣٠ ريال',
  'وصلت الطلبية رقم ١٠٤٩١٢ شكرا جزيلا',
  'الطلبان ١٠٤٩١٢-١٠٤٩١٣ وصلا',
  'We met at Outlook cafe',
  'I bought it at Yahoo shopping years ago',
  'I am @home all day',
  'Lot 2024-11 batch 778899001',
  'Gift card 4829 1734 5521',
  'Model 2024, 2025 and 2026 editions',
  '12 ml, 24 ml, 36 ml, 48 ml',
  'Order 104912 (2 items) and order 104913 (1 item)',
  'Call me Maryam please 🙂',
  'Price 1450 SAR, was 1950 SAR, save 500',
  '٢٠٢٦/١٠/٣١ - ٢٠٢٦/١١/٠٥',
  '3 bottles × 450 = 1350 SAR',
  'Delivery 2-3 days, returns 7-14 days',
  // and the Arabic ones (js/arabic_fp.mts), with the direction marks people type around an English name
  'المقاسات المتوفرة: ٥٢،٥٤،٥٦،٥٨،٦٠',
  'المقاسات المتوفرة: ٥٢، ٥٤، ٥٦، ٥٨، ٦٠',
  'الصدر ١٠٤ والطول ١٤٠ والكم ٦٠',
  'القياسات: ١٠٤/١٤٠/٦٠/٤٥',
  'طلبي رقم ١٠٤٩١٢ وطلب أختي ١٠٤٩١٣',
  'الأسعار ٤٥٠ - ٦٥٠ - ٩٥٠ ريال',
  'من ٣١/١٠ إلى ٥/١١',
  'ست الحبايب، شكرًا على العطر 🌹',
  'طلبت ‏Royal Oud‏ حجم ١٢ مل',
];

/** Listing descriptions with size charts and measurements (js/listing_fp.mts): never blocked as contact details. */
export const LISTING_TEXTS = [
  'Classic Saudi thobe in Japanese fabric. Available in sizes 52 54 56 58 60.',
  'Size chart (chest/length): 104/140, 108/145, 112/150',
  'Chest 104 / 108 / 112 / 116 cm',
  'Prayer mat 70 x 110 cm, 1.2 kg. Colours: green, blue.',
  'ثوب سعودي، المقاسات ٥٢ ٥٤ ٥٦ ٥٨ ٦٠',
  'Pack of 3: 12 ml, 24 ml and 36 ml',
  'Ajwa dates 500 g / 1 kg / 2 kg / 5 kg',
  'Batch 2026-10 harvested 2026-09-15 / packed 2026-10-01',
];

/** Two messages in a row (js/split_fp.mts): ordinary pairs stay untouched; a phone number split across them is caught. */
export const SPLIT_PAIRS: [string, string, boolean][] = [
  ['My order number is 104912', '104913 is my sister\'s order', false],
  ['It was delivered on 2026-10-30', '2026-10-31 I opened it', false],
  ['Chest 104', '140 length please', false],
  ['The price was 450', '650 for the bigger one', false],
  ['my number is 05012', '34567 thanks', true],
];

/** Ordinary text: never masked or flagged. */
export const ORDINARY = [
  'The 3 ml bottle arrived on 2026-10-30, thank you.',
  'Size 52, chest 104 cm',
  'Order AM-104912 arrived',
  'I love it at home',
  'Two boxes of dates and one bottle of oud, please.',
  'Price 450.00 SAR for 3 ml',
  'وصل الطلب، شكرًا جزيلاً 🌹',
  'الطلب يظهر على حسابي',
  'Please send it before Eid ❤️',
  'Delivered at 5 pm, the box was fine.',
  'Thank you so much! ⭐️⭐️⭐️⭐️⭐️',
  'Line 2 of the label was smudged.',
  'Hand-woven prayer mats from Madinah',
  'Cambodian oud oil, 12 ml, aged ten years',
  'ثوب سعودي بقصة كلاسيكية، قماش ياباني',
];
