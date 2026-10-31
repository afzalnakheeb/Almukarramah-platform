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
