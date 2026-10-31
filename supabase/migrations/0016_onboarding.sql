-- Marketplace (5 of 9): onboarding. The premium vetting application, KYC by country, the categories a seller may
-- list in, samples, the request-more-info loop and the review history.
--
-- * Applying (apply_as_seller) opens the seller's file: story, relationship to the brands, years trading, links,
--   categories requested. The seller then completes it in the dashboard (portfolio photos, screened like every
--   upload; legal entity, tax and bank details; the documents their country requires; a pickup address) and sends it
--   (submit_seller_application), which only works when every step on the checklist is done.
-- * Owner/manager review it (mp_review_seller): ask for more information (the seller sees the message, answers and
--   sends it again), approve, reject, suspend or reinstate. Approval checks the KYC decision, the sample (passed or
--   not needed), and that a marketplace corridor from the seller's country is open (or a pilot that includes them).
--   The review-seller function approves through the same check and publishes the shop's logo and banner.
-- * Every decision and message is kept in seller_review_events (append-only); the audit log records every change.
-- * A seller lists only in the categories approved for them (a department or group approval covers what is under it).
-- * Staff notes on seller_private stay with staff (members read every other column).

-- ================================================================ settings
alter table mp_settings
  add column require_kyc_before_approval boolean not null default true,
  add column require_sample boolean not null default true,
  add column min_portfolio_photos int not null default 3 check (min_portfolio_photos between 0 and 12),
  add column min_story_chars int not null default 100 check (min_story_chars between 0 and 2000);

create or replace function mp_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'allow_modest_models_in_fashion', allow_modest_models_in_fashion, 'min_quality_score', min_quality_score,
    'quality_weights', quality_weights, 'default_min_photos', default_min_photos, 'default_min_long_side_px', default_min_long_side_px,
    'price_change_review_bps', price_change_review_bps, 'strike_limit', strike_limit, 'strike_window_days', strike_window_days,
    'perf_window_days', perf_window_days, 'perf_thresholds', perf_thresholds,
    'require_sample', require_sample, 'min_portfolio_photos', min_portfolio_photos, 'min_story_chars', min_story_chars,
    'marketplace_open', marketplace_open, 'sellers_open', sellers_open,
    'max_upload_bytes', 10485760, 'upload_types', jsonb_build_array('image/jpeg', 'image/png', 'image/webp'))
  from mp_settings where id = 1;
$$;
grant execute on function mp_public_settings() to anon, authenticated;

-- ================================================================ staff notes stay with staff
revoke select on seller_private from anon, authenticated;
grant select (seller_id, contact_name, contact_email, contact_phone, legal_name, registration_no, tax_registration_no, product_summary,
  legal_entity_type, export_code, iban, bank_name, account_holder, kyc_status, kyc_note, kyc_reviewed_at, kyc_reviewed_by)
  on seller_private to authenticated;

-- ================================================================ guards: definer functions are trusted
-- Functions that change a seller on someone's behalf (submitting, reviewing) run as their owner and do their own
-- checks; the guard limits what people change directly through the API. Staff cannot approve directly either:
-- approval goes through mp_review_seller, which checks KYC, the sample and the corridor. A seller row created straight
-- through the API (by staff too) always starts pending.
--
-- The shop page (review H5): what a seller or an applicant writes on it is checked for contact details (phone numbers
-- however written, emails, links, handles, messaging apps, bank details, "order directly") and for our own name. Once
-- the shop is live, every change to its text waits in profile_pending until our team approves it (mp_review_seller
-- 'approve_profile'), so the public page only ever shows what was approved. A logo or banner can only be the seller's
-- own upload: our team publishes it (review-seller) after its photo check; a link to anywhere else is refused.
alter table sellers
  add column profile_pending jsonb check (profile_pending is null or jsonb_typeof(profile_pending) = 'object'),
  add column profile_submitted_at timestamptz;

-- Numbers (review R3-1, REVIEW-3): the same rules as contact.ts (phoneShaped, classifyNumber), so the server and the
-- database agree on every text. A run of digits is a phone number only when it looks like one: a trunk 0, 00 or +,
-- a Gulf mobile without its 0, or a country code with that country's length; anything else of nine to fifteen digits
-- only when it is written like one (one run, or up to four groups with the same separator), and never a list of sizes,
-- measurements or prices, codes of the same length, a number after a word that says what it is (tracking, order,
-- booking, size...), or one glued to letters. Dates, times and amounts never join a number.
create or replace function private.phone_shaped(d text, plus boolean default false) returns boolean
language sql immutable as $$
  select case when plus then length(d) between 8 and 15
    else d ~ ('^(0[0-9]{8,10}|5[0-9]{8}|00[0-9]{8,15}|966[0-9]{9}|971[0-9]{8,9}|96[58][0-9]{8}|97[34][0-9]{8}|962[0-9]{9}|961[0-9]{7,8}'
              || '|964[0-9]{10}|963[0-9]{9}|967[0-9]{9}|970[0-9]{9}|20[0-9]{10}|21[23][0-9]{9}|216[0-9]{8}|218[0-9]{9}|249[0-9]{9}|44[0-9]{10}'
              || '|1[0-9]{10}|9[12][0-9]{10}|880[0-9]{10}|90[0-9]{10}|60[0-9]{9,10}|62[0-9]{9,12}|63[0-9]{10}|234[0-9]{10}|254[0-9]{9}'
              || '|27[0-9]{9}|33[0-9]{9}|49[0-9]{10,11}|7[0-9]{10}|86[0-9]{11})$') end;
$$;

create or replace function private.luhn_ok(d text) returns boolean
language plpgsql immutable as $$
declare
  s int := 0;
  x int;
  n int := length(d);
begin
  if coalesce(d, '') !~ '^[0-9]+$' then return false; end if;
  for i in 0 .. n - 1 loop
    x := substr(d, n - i, 1)::int;
    if i % 2 = 1 then x := x * 2; if x > 9 then x := x - 9; end if; end if;
    s := s + x;
  end loop;
  return s % 10 = 0;
end $$;

create or replace function private.ean13_ok(d text) returns boolean
language plpgsql immutable as $$
declare s int := 0;
begin
  if coalesce(d, '') !~ '^[0-9]{13}$' then return false; end if;
  for i in 1 .. 12 loop s := s + substr(d, i, 1)::int * case when i % 2 = 0 then 3 else 1 end; end loop;
  return (10 - s % 10) % 10 = substr(d, 13, 1)::int;
end $$;

-- One run of digits: its groups and separators, a + before it, how many digits were written as digits (real) and as
-- words, the text before it (lower case) and whether letters touch it. 'phone', 'bank', 'card' or null.
create or replace function private.number_kind(g text[], seps text[], plus boolean, p_real int, p_words int, p_before text, glued boolean, rtl boolean default false) returns text
language plpgsql immutable as $$
declare
  d text := array_to_string(g, '');
  n int := length(d);
  ng int := coalesce(array_length(g, 1), 0);
  bank boolean;
  lst boolean;
  rev text := '';
  back boolean := false;
  shaped boolean;
  anchored boolean;
  lens text;
  kinds text[];
  anchor constant text := '^(0|96[5-8]|97[134])';
  carriers constant text := 'smsa|aramex|dhl|fedex|ups|naqel|spl|zajil|ajex|imile';
  code_words constant text := 'isbn|ean|gtin|barcode|sku|upc|ref|reference|model|batch|lot|serial|codes?|items?|orders?|invoices?|inv|receipt|tracking|track|awb'
    || '|waybill|shipments?|parcels?|bookings?|reservations?|confirmation|voucher|coupon|discount|promo|gift\s*card|card|room|sizes?|chest|length|sleeve'
    || '|measurements?|prices?|total|sar|sr|riyals?|ml|cm|kg'
    || '|باركود|الباركود|الدفعة|دفعة|الطلب|طلب|طلبي|الطلبية|طلبية|الطلبات|طلبات|طلباتي|الطلبان|الطلبين|الفاتورة|فاتورة|الشحنة|شحنة|الشحنات|التتبع|تتبع'
    || '|الحجز|حجز|الكود|كود|الرمز|رمز|الخصم|خصم|الكوبون|كوبون|المقاس|مقاس|المقاسات|مقاسات|القياس|قياس|القياسات|قياسات|السعر|سعر|الاسعار|اسعار|ريال|الغرفة|غرفة|القسيمة|قسيمة|البطاقة|بطاقة';
begin
  if p_words >= 7 and n >= 7 then return 'phone'; end if;                       -- a number spelled out
  if n < 9 or (p_real < 6 and p_words < 7) then return null; end if;
  bank := right(p_before, 20) ~* '(iban|account|acct|a/c|ايبان|حساب|الحساب)[^0-9]{0,14}$';
  if n > 15 then
    -- an account number, two phone numbers run together, or a card number
    if bank then return 'bank'; end if;
    for k in 9 .. n - 9 loop
      if private.phone_shaped(left(d, k), plus) and private.phone_shaped(substr(d, k + 1)) then return 'phone'; end if;
    end loop;
    lens := array_to_string(array(select length(x) from unnest(g) x), ',');
    if n <= 19 and private.luhn_ok(d) and (ng = 1 or lens ~ '^4(,4)*$' or lens in ('4,6,5', '4,6,4')) then return 'card'; end if;
    return null;
  end if;
  lst := ng >= 3 and not exists (select 1 from unnest(g) x where length(x) not between 2 and 3)
         and not exists (select 1 from unnest(seps) x where x !~ '^[\s,،/–—+|;-]+$');
  -- a right-to-left line (Arabic) shows groups in reverse order: "67 45 23 01 05" reads 05 01 23 45 67; read that way
  -- only when it then starts like a phone number (0, 00, a Gulf code)
  if rtl and ng >= 2 then rev := array_to_string(array(select x from unnest(g) with ordinality u(x, i) order by i desc), ''); end if;
  back := rev <> '' and rev ~ anchor and private.phone_shaped(rev);
  shaped := (private.phone_shaped(d, plus) and (plus or d ~ anchor or not lst)) or back;
  if shaped then
    anchored := plus or d ~ anchor or back;
    if not anchored and (p_before ~* '(isbn|ean|gtin|barcode|sku|upc|باركود|الرقم الدولي)[\s:#.-]*$' or (n = 13 and private.ean13_ok(d))
                         or (not plus and d ~ '^97[89][0-9]{10}$')) then
      return null;                                                               -- a barcode, an ISBN
    end if;
    return case when bank then 'bank' else 'phone' end;
  end if;
  if lst then return null; end if;                                               -- sizes, measurements, prices
  if ng >= 2 and length(g[1]) >= 5 and not exists (select 1 from unnest(g) x where length(x) <> length(g[1])) then return null; end if;   -- codes
  if glued or p_before ~* ('(^|[^a-zء-ي])(' || code_words || '|' || carriers || ')([\s:#.-]*(number|num|no|nos|is|are|رقم|رقمه|رقمها|هو|هي)(?![a-zء-ي]))*'
                         || '[\s:#.-]*((' || carriers || ')[\s:#.-]*)?$') then
    return null;                                                                 -- a tracking number, a code
  end if;
  kinds := array(select coalesce(nullif(regexp_replace(x, '\s+', '', 'g'), ''), ' ') from unnest(seps) x);
  if ng > 4 or exists (select 1 from unnest(kinds) x where x <> kinds[1]) then return null; end if;   -- not written like a phone number
  if n = 13 and private.ean13_ok(d) then return null; end if;
  return case when bank then 'bank' else 'phone' end;
end $$;

-- The numbers of a normalised text (digits 0-9; digits written as words are ٠-٩ here, so they can be counted):
-- the first that is a phone, a bank account or a card number, or null.
create or replace function private.number_hint(p text) returns text
language plpgsql immutable as $$
declare
  t text := p;
  letter constant text := 'a-zÀ-ɏͰ-ԯ֐-׿ؠ-يٮ-ۓەۺ-ۿ';
  dg constant text := '0-9٠-٩';
  after_ constant text := '(?![0-9])(?![.,٫:/][0-9])';
  before_ constant text := '(?<![0-9])(?<![0-9][.,٫:/])';
  m text;
  core text;
  g text[];
  seps text[];
  plus boolean;
  off int := 1;
  st int;
  en int;
  k text;
  ctx text;
  glued boolean;
begin
  -- dates (a four-digit year), times and amounts (decimals or thousands) never join a number
  t := regexp_replace(t, before_ || '(?:(?:19|20)[0-9]{2}([-/.])(?:0?[1-9]|1[0-2])\1(?:0?[1-9]|[12][0-9]|3[01])|(?:0?[1-9]|[12][0-9]|3[01])([-/.])'
                         || '(?:0?[1-9]|1[0-2])\2(?:19|20)[0-9]{2}|(?:0?[1-9]|1[0-2])([-/.])(?:0?[1-9]|[12][0-9]|3[01])\3(?:19|20)[0-9]{2})' || after_, 'q', 'g');
  t := regexp_replace(t, before_ || '(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?' || after_, 'q', 'g');
  t := regexp_replace(t, before_ || '(?:[1-9][0-9]{0,2},[0-9]{3}(?:[.٫][0-9]{1,2})?|(?:[1-9][0-9]{0,5}|0)[.٫][0-9]{1,2})' || after_, 'q', 'g');
  -- a comma and a space (a list: "sizes 50, 52, 54", "size 56, 12 ml") join only groups of three digits or more
  t := regexp_replace(t, '(?<![' || dg || '])([' || dg || ']{1,2})\s*[,،]\s+(?=[' || dg || '])', '\1 x ', 'g');
  t := regexp_replace(t, '([' || dg || '])\s*[,،]\s+(?=[' || dg || ']{1,2}(?![' || dg || ']))', '\1 x ', 'g');
  -- digits with up to four non-letters between them
  for m in select x[1] from regexp_matches(t, '(\+?[' || dg || '](?:[^' || letter || dg || ']{0,4}[' || dg || '])*)', 'g') as x loop
    st := strpos(substr(t, off), m) + off - 1;
    en := st + length(m);
    off := en;
    plus := left(m, 1) = '+';
    core := case when plus then substr(m, 2) else m end;
    g := regexp_split_to_array(core, '[^' || dg || ']+');
    seps := coalesce(array(select y[1] from regexp_matches(core, '([^' || dg || ']+)', 'g') y), '{}');
    glued := (st > 1 and substr(t, st - 1, 1) ~ ('[' || letter || ']')) or (en <= length(t) and substr(t, en, 1) ~ ('[' || letter || ']'));
    ctx := translate(lower(substr(t, greatest(1, st - 40), st - greatest(1, st - 40))), '٠١٢٣٤٥٦٧٨٩', '0123456789');
    k := private.number_kind(array(select translate(x, '٠١٢٣٤٥٦٧٨٩', '0123456789') from unnest(g) x), seps, plus,
                             length(regexp_replace(core, '[^0-9]', '', 'g')), length(regexp_replace(core, '[^٠-٩]', '', 'g')), ctx, glued,
                             t ~ '[\u0621-\u064A]');
    if k is not null then return k; end if;
  end loop;
  return null;
end $$;
-- (pure functions without side effects: the shop page guard runs them as the person editing it, like contact_hint)

-- The first contact detail in a text ('phone', 'email', 'link', 'handle', 'messaging', 'bank', 'card', 'solicit'), or null.
-- The same rules as the server's contact.ts (review M3, R3-1): invisible characters (zero-width, direction marks) are
-- dropped; look-alike forms made plain (NFKC: full-width, mathematical, circled and superscript digits and letters);
-- every digit system made 0-9; Arabic marks dropped and alef forms made plain; number words made digits; o and l
-- between digits read as 0 and 1. Then: numbers (private.number_hint); emails however the @ and the dots are written;
-- links; handles (also "ig:@name", not "@home"); messaging apps (also spaced out, or a short name with a marked handle:
-- "snap: name"); IBANs and invitations to deal or pay outside Al Mukarramah, in English and Arabic ("call me Maryam"
-- gives a name: not one).
create or replace function private.contact_hint(p text) returns text
language plpgsql immutable set search_path = public as $$
declare
  t text;
  tn text;
  cam text;
  squeezed text;
  hint text;
  n int;
  letter constant text := 'a-zÀ-ɏͰ-ԯ֐-׿ؠ-يٮ-ۓەۺ-ۿ';
  tld constant text := '(com|net|org|sa|ae|kw|qa|om|bh|in|co|io|me|shop|store|info|biz|ly|gl|link|site|online|app|uk|us|pk|eg|tr|my|id|tv|page|website|ru|de|fr)';
  at_ constant text := '(@|\(at\)|\[at\]|\{at\}|<at>)';
  dot_ constant text := '(\.|\(dot\)|\[dot\]|\{dot\}|<dot>|\s+dot\s+)';
  providers constant text := '(gmail|googlemail|hotmail|yahoo|ymail|outlook|icloud|aol|protonmail|proton|yandex|zoho|gmx)';
  words constant text[] := array['zero', '0', 'oh', '0', 'one', '1', 'two', '2', 'three', '3', 'four', '4', 'five', '5', 'six', '6', 'seven', '7',
    'eight', '8', 'nine', '9', 'صفر', '0', 'واحد', '1', 'اثنان', '2', 'اثنين', '2', 'اثنتان', '2', 'ثلاثة', '3', 'ثلاث', '3', 'اربعة', '4', 'اربع', '4',
    'خمسة', '5', 'خمس', '5', 'ستة', '6', 'ست', '6', 'سبعة', '7', 'سبع', '7', 'ثمانية', '8', 'ثماني', '8', 'ثمان', '8', 'تسعة', '9', 'تسع', '9'];
begin
  if coalesce(p, '') = '' then return null; end if;
  t := regexp_replace(p, '[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻]', '', 'g');
  t := normalize(t, NFKC);
  t := translate(t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹߀߁߂߃߄߅߆߇߈߉०१२३४५६७८९০১২৩৪৫৬৭৮৯੦੧੨੩੪੫੬੭੮੯૦૧૨૩૪૫૬૭૮૯୦୧୨୩୪୫୬୭୮୯௦௧௨௩௪௫௬௭௮௯౦౧౨౩౪౫౬౭౮౯೦೧೨೩೪೫೬೭೮೯൦൧൨൩൪൫൬൭൮൯෦෧෨෩෪෫෬෭෮෯๐๑๒๓๔๕๖๗๘๙໐໑໒໓໔໕໖໗໘໙༠༡༢༣༤༥༦༧༨༩၀၁၂၃၄၅၆၇၈၉႐႑႒႓႔႕႖႗႘႙០១២៣៤៥៦៧៨៩᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙꘠꘡꘢꘣꘤꘥꘦꘧꘨꘩꣐꣑꣒꣓꣔꣕꣖꣗꣘꣙꤀꤁꤂꤃꤄꤅꤆꤇꤈꤉꧐꧑꧒꧓꧔꧕꧖꧗꧘꧙꧰꧱꧲꧳꧴꧵꧶꧷꧸꧹꩐꩑꩒꩓꩔꩕꩖꩗꩘꩙꯰꯱꯲꯳꯴꯵꯶꯷꯸꯹', '01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789');
  t := regexp_replace(t, '[ً-ٰٟـۖ-ۜ۟-۪ۤۧۨ-ۭ]', '', 'g');
  t := translate(t, 'أإآٱى', 'ااااي');
  cam := t;
  t := lower(t);
  tn := t;
  -- number words become digits (for the numbers, as ٠-٩: digits written as words are counted apart)
  for n in 1 .. array_length(words, 1) / 2 loop
    t := regexp_replace(t, '(^|[^' || letter || '])' || words[2 * n - 1] || '(?=[^' || letter || ']|$)', '\1' || words[2 * n], 'g');
    tn := regexp_replace(tn, '(^|[^' || letter || '])' || words[2 * n - 1] || '(?=[^' || letter || ']|$)', '\1' || translate(words[2 * n], '0123456789', '٠١٢٣٤٥٦٧٨٩'), 'g');
  end loop;
  for n in 1 .. 3 loop
    t := regexp_replace(t, '(?<=[0-9])[oq](?=[oqil|]*[0-9])', '0', 'g');
    t := regexp_replace(t, '(?<=[0-9])[il|](?=[0il|]*[0-9])', '1', 'g');
    tn := regexp_replace(tn, '(?<=[0-9٠-٩])[oq](?=[oqil|]*[0-9٠-٩])', '0', 'g');
    tn := regexp_replace(tn, '(?<=[0-9٠-٩])[il|](?=[0il|]*[0-9٠-٩])', '1', 'g');
  end loop;
  hint := private.number_hint(tn);
  if hint is not null then return hint; end if;
  -- emails ("ali at outlook" only at the end of a phrase: "we met at Outlook cafe" is not one)
  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or t ~ ('[a-z0-9._%+-]{2,}\s*' || at_ || '\s*[a-z0-9-]{2,}(\s*' || dot_ || '\s*[a-z0-9-]{2,})*?\s*' || dot_ || '\s*' || tld || '(?![a-z])')
     or t ~ ('[a-z0-9._%+-]{2,}\s+at\s+[a-z0-9-]{2,}\s*(\(dot\)|\[dot\]|\{dot\}|<dot>|\s+dot\s+)\s*' || tld || '(?![a-z])')
     or t ~ ('[a-z0-9._%+-]{2,}\s*' || at_ || '\s*' || providers || '(?![a-z])')
     or t ~ '[a-z0-9._%+-]{2,}\s+at\s+(gmail|googlemail|hotmail|ymail|icloud|protonmail)(?![a-z])'
     or t ~ ('[a-z0-9._%+-]{2,}\s+at\s+' || providers || '(?=\s*($|[.,;:!?)\]،؟]))')
     or cam ~ ('[a-z0-9._-]{2,}AT[a-z0-9-]{2,}DOT' || tld || '(?![a-z])') then
    return 'email';
  end if;
  if t ~ '(https?://|www\.|wa\.me|t\.me/)' or t ~ ('\m[a-z0-9-]{2,}\.' || tld || '\M') then return 'link'; end if;
  if t ~ '(^|[^a-z0-9._%+-])@(?!(home|work|school|office|night|noon|gym|mall|mosque|masjid|haram|hotel|airport|beach|park|the|all|once|least|most|last|first|here|there)(?![a-z0-9_.]))[a-z0-9_.]{3,30}' then
    return 'handle';
  end if;
  if t ~ '(^|[^a-z])(ig|snap|tg|fb)\s*[:/@]+\s*[a-z0-9_.]{3,30}' then return 'handle'; end if;
  squeezed := regexp_replace(t, '[\s._*·•/|\\-]', '', 'g');
  if squeezed ~ '(whatsapp|watsapp|whatsap|telegram|instagram|insta|snapchat|tiktok|facebook|twitter|wechat|viber|واتساب|واتس|وتساب|تلغرام|تلجرام|تليجرام|انستقرام|انستغرام|انستا|سناب|تيكتوك|فيسبوك|تويتر)' then
    return 'messaging';
  end if;
  -- an IBAN as a word of its own (not "SMSA 29...", not "from 31..."), as contact.ts's IBAN_RE; spaced out letters
  -- ("S A 0 3 8 ...") are a long number after "IBAN" (number_hint)
  hint := substring(t from '\m(?:sa|ae|kw|qa|om|bh|gb|de|fr|nl|be|ie|es|it|in|pk|eg|tr|jo|lb)[0-9]{2}(?:[ -]?[0-9a-z]){10,30}\M');
  if hint is not null and length(regexp_replace(hint, '[^0-9]', '', 'g')) >= 10 then return 'bank'; end if;
  -- invitations ("call me Maryam" gives a name: left out)
  t := lower(regexp_replace(cam, '\m[Cc]all\s+(?:[Mm]e|[Uu]s)\s+(?!(?:On|At|Via|WhatsApp|Whatsapp|Telegram|Back|Now|Later|Today|Tomorrow)\M)([A-Z][a-z])', ' \1', 'g'));
  if t ~ ('((contact|call|text|message|dm|whatsapp|ring|reach)\s+(me|us)\M|\m(order|buy|pay)\s+(directly|outside)|direct\s+(order|sale|contact)|(bank|wire)\s+transfer'
          || '|\mpay\s+(me|us)\s+(by|via|with|through)\M|\m(transfer|send)\s+(the\s+)?(money|payment|amount)\s+(to\s+)?(me|us|my|our)\M'
          || '|\m(send|give|share|text)\s+(me|us)\s+(your\s+)?(number|phone|mobile|whats\s?app|email|e-mail|contact|details)\M'
          || '|\mwhat(''|’)?s\s+your\s+(number|phone|mobile|whats\s?app|email)\M|\moutside\s+(the\s+)?(app|platform|site|website)\M'
          || '|تواصل\s+(معي|معنا)|اتصل\s+(بي|بنا)|راسلني|راسلنا|كلمني|كلمنا|اطلب\s+مباشرة|للطلب\s+(عبر|على)|خارج\s+(المنصة|التطبيق|الموقع)'
          || '|تحويل\s+بنكي|حوالة\s+بنكية|حول\s+لي|ادفع\s+لي|حول\s+(المبلغ|الفلوس|المال|القيمة)|حسابي\s+البنكي|(على|ع)\s+الخاص|بالخاص'
          || '|(ارسل|ابعث|ابعت|اعطني|عطني|هات)(ي)?\s+(لي\s+)?(رقمك|رقم\s+(جوالك|هاتفك|تلفونك|موبايلك)|ايميلك|بريدك|واتسابك|حسابك))') then
    return 'solicit';
  end if;
  return null;
end $$;

-- A field of the shop page: no contact details, and not our name. The city is a place name (letters, spaces and
-- punctuation of names only); the shop's address (slug) is checked with its dashes read as spaces.
create or replace function private.check_shop_text(p_field text, p_value text) returns void
language plpgsql immutable set search_path = public as $$
declare hint text;
begin
  if coalesce(p_value, '') = '' then return; end if;
  if p_field = 'website' then return; end if;   -- a link by nature (https only, a check on the table); never public
  if p_field = 'city' and p_value !~ '^[A-Za-z\u00C0-\u024F\u0600-\u06FF .''’()-]{2,60}$' then
    raise exception using message = 'Please write the city''s name only (letters)', detail = 'يُرجى كتابة اسم المدينة فقط (بالحروف)';
  end if;
  if p_field in ('name_en', 'name_ar', 'slug') and (lower(p_value) ~ 'mu?kk?arr?am' or lower(p_value) ~ 'mokarr?am'
      or regexp_replace(p_value, '[ً-ٰٟـ]', '', 'g') ~ 'مكرم') then
    raise exception using message = 'Your shop name cannot include "Al Mukarramah": please choose your own name',
      detail = 'لا يمكن أن يتضمن اسم متجرك «المكرمة»: يُرجى اختيار اسم خاص بمتجرك';
  end if;
  hint := private.contact_hint(p_value);
  if hint is not null then
    raise exception using message = format('Contact details are not allowed on your shop page (%s found). Customers reach you through Al Mukarramah messages.', hint),
      detail = 'لا يُسمح ببيانات التواصل في صفحة متجرك، فالعملاء يتواصلون معك عبر رسائل المكرمة.';
  end if;
end $$;

create or replace function sellers_guard() returns trigger language plpgsql set search_path = public as $$
declare
  -- every field of the public shop page a seller writes (the city too: review H5, REVIEW-2), and the website
  fields constant text[] := array['name_en', 'name_ar', 'tagline_en', 'tagline_ar', 'about_en', 'about_ar', 'returns_en', 'returns_ar', 'city', 'website'];
  f text;
  v_new jsonb;
  v_old jsonb;
  pend jsonb;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    -- straight through the API (staff included): a seller always starts pending and is approved by the review (L1)
    if current_user in ('authenticated', 'anon') then
      new.status := 'pending';
      new.approved_at := null;
      new.profile_pending := null;
      new.profile_submitted_at := null;
    end if;
    if private.is_end_user() then
      foreach f in array fields loop perform private.check_shop_text(f, to_jsonb(new) ->> f); end loop;
      perform private.check_shop_text('slug', replace(new.slug, '-', ' '));
      if new.logo is not null or new.banner is not null then raise exception 'Upload your logo and banner through the seller dashboard' using detail = 'ارفع الشعار والغلاف من لوحة البائع'; end if;
    end if;
    return new;
  end if;
  if current_user = 'authenticated' and private.is_staff() and new.status is distinct from old.status and new.status = 'approved' then
    raise exception 'Approve sellers from the seller review (it checks KYC, the sample and the corridor)';
  end if;
  if not private.is_end_user() or current_user not in ('authenticated', 'anon') then
    if new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := coalesce(old.approved_at, now());
      new.suspended_reason := null;
    end if;
    return new;
  end if;
  new.status := old.status;
  new.kind := old.kind;
  new.commission_bps := old.commission_bps;
  new.review_note := old.review_note;
  new.approved_at := old.approved_at;
  new.agreed_guidelines_at := old.agreed_guidelines_at;
  new.country := old.country;
  new.created_at := old.created_at;
  new.flagged_at := old.flagged_at;
  new.flag_reason := old.flag_reason;
  new.suspended_reason := old.suspended_reason;
  new.profile_pending := old.profile_pending;
  new.profile_submitted_at := old.profile_submitted_at;
  -- the seller's own uploads only (published by our team after the photo check); never a link
  if new.logo is distinct from old.logo and new.logo is not null and new.logo !~ ('^' || new.id::text || '/media/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception using message = 'Upload your logo through the seller dashboard', detail = 'ارفع شعارك من لوحة البائع';
  end if;
  if new.banner is distinct from old.banner and new.banner is not null and new.banner !~ ('^' || new.id::text || '/media/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$') then
    raise exception using message = 'Upload your banner through the seller dashboard', detail = 'ارفع صورة الغلاف من لوحة البائع';
  end if;
  -- the text: checked, and on a live shop held for our team
  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  pend := coalesce(old.profile_pending, '{}'::jsonb);
  foreach f in array fields loop
    continue when (v_new -> f) is not distinct from (v_old -> f);
    perform private.check_shop_text(f, v_new ->> f);
    if old.status in ('approved', 'suspended') then pend := pend || jsonb_build_object(f, v_new -> f); end if;
  end loop;
  if old.status in ('approved', 'suspended') and pend is distinct from coalesce(old.profile_pending, '{}'::jsonb) then
    new := jsonb_populate_record(new, (select jsonb_object_agg(x, v_old -> x) from unnest(fields) x));
    new.profile_pending := pend;
    new.profile_submitted_at := now();
  end if;
  -- the shop's address: fixed once approved; checked like the rest before that (review N10)
  if old.status = 'approved' then new.slug := old.slug;
  elsif new.slug is distinct from old.slug then perform private.check_shop_text('slug', replace(new.slug, '-', ' '));
  end if;
  return new;
end $$;
drop trigger if exists sellers_guard on sellers;
create trigger sellers_guard before insert or update on sellers for each row execute function sellers_guard();

-- ================================================================ the application
create table seller_applications (
  seller_id uuid primary key references sellers on delete cascade,
  relationship text check (relationship in ('own_brand', 'maker', 'authorised_distributor', 'retailer')),
  years_in_business int check (years_in_business between 0 and 300),
  brand_story text check (char_length(brand_story) <= 3000),
  links text[] not null default '{}' check (cardinality(links) <= 6),          -- website and social pages (https)
  portfolio text[] not null default '{}' check (cardinality(portfolio) <= 12),  -- screened media (kind 'portfolio'), private
  monthly_orders_estimate int check (monthly_orders_estimate between 0 and 1000000),
  submitted_at timestamptz,
  -- our team: the product sample
  sample_status text not null default 'not_requested'
    check (sample_status in ('not_requested', 'requested', 'received', 'passed', 'failed', 'not_needed')),
  sample_note text check (char_length(sample_note) <= 2000),                   -- shown to the seller (where to send it, what we found)
  sample_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table seller_applications enable row level security;
create policy "members and staff read applications" on seller_applications for select
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager', 'marketing', 'finance']::staff_role[]));
create policy "members and managers edit applications" on seller_applications for update
  using (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]))
  with check (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]));
-- rows are created with the seller (apply_as_seller, staff_create_seller)

create or replace function seller_applications_guard() returns trigger language plpgsql set search_path = public as $$
declare st seller_status;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.seller_id := old.seller_id;
    new.created_at := old.created_at;
  end if;
  if exists (select 1 from unnest(new.links) l where l !~* '^https://[^\s]{3,250}$') then
    raise exception 'Links must start with https://' using detail = 'يجب أن تبدأ الروابط بـ https://';
  end if;
  if exists (select 1 from unnest(new.portfolio) img where img not like new.seller_id::text || '/media/%') then
    raise exception 'Upload portfolio photos through the seller dashboard' using detail = 'ارفع صور أعمالك من لوحة البائع';
  end if;
  if tg_op = 'INSERT' or not private.is_end_user() or current_user not in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and new.sample_status is distinct from old.sample_status then new.sample_updated_at := now(); end if;
    return new;
  end if;
  -- sellers never set the sample decision or the submission time, and a decided application is fixed
  new.sample_status := old.sample_status;
  new.sample_note := old.sample_note;
  new.sample_updated_at := old.sample_updated_at;
  new.submitted_at := old.submitted_at;
  select status into st from sellers where id = new.seller_id;
  if st in ('approved', 'suspended', 'rejected') and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'Your application has been decided: please contact Al Mukarramah to change it' using detail = 'تم البت في طلبك: تواصل مع المكرمة لتغييره';
  end if;
  return new;
end $$;
create trigger seller_applications_guard before insert or update on seller_applications for each row execute function seller_applications_guard();
create trigger audit_seller_applications after insert or update or delete on seller_applications for each row execute function audit_keyed('seller_id');

-- ================================================================ categories a seller may list in
create table seller_categories (
  seller_id uuid not null references sellers on delete cascade,
  category_id uuid not null references categories on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'declined')),
  note text check (char_length(note) <= 1000),          -- our team's reason, shown to the seller
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users,
  primary key (seller_id, category_id)
);
alter table seller_categories enable row level security;
create policy "members and staff read seller categories" on seller_categories for select
  using (private.is_seller_member(seller_id) or private.is_staff());
create policy "members request categories" on seller_categories for insert
  with check (private.is_seller_member(seller_id) or private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "members withdraw requests" on seller_categories for delete
  using ((private.is_seller_member(seller_id) and status = 'requested') or private.is_staff(array['owner', 'manager']::staff_role[]));
create policy "managers decide categories" on seller_categories for update
  using (private.is_staff(array['owner', 'manager']::staff_role[])) with check (private.is_staff(array['owner', 'manager']::staff_role[]));

create or replace function seller_categories_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not private.is_end_user() or current_user not in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.decided_at := now();
      new.decided_by := auth.uid();
    end if;
    return new;
  end if;
  -- sellers only ask
  new.status := 'requested';
  new.note := null;
  new.decided_at := null;
  new.decided_by := null;
  new.requested_at := now();
  return new;
end $$;
create trigger seller_categories_guard before insert or update on seller_categories for each row execute function seller_categories_guard();
create trigger audit_seller_categories after insert or update or delete on seller_categories for each row execute function audit_keyed('seller_id', 'category_id');

-- May this seller list in this category? An approval of the category or of a department or group above it counts.
-- Partners (our own private-label and fulfilment partners) list wherever our team puts them.
create or replace function private.seller_may_list(p_seller uuid, p_category uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sellers s where s.id = p_seller and s.kind = 'partner')
      or exists (select 1 from seller_categories sc join mp_category_chain(p_category) ch on ch.id = sc.category_id
                 where sc.seller_id = p_seller and sc.status = 'approved');
$$;

-- ================================================================ review history (append-only)
create table seller_review_events (
  id bigint generated always as identity primary key,
  seller_id uuid not null references sellers on delete cascade,
  actor uuid references auth.users,
  kind text not null check (kind in ('applied', 'submitted', 'resubmitted', 'info_requested', 'approved', 'rejected',
                                      'suspended', 'reinstated', 'note', 'profile_approved', 'profile_rejected')),
  message text check (char_length(message) <= 4000),
  visible_to_seller boolean not null default true,      -- staff notes are not
  created_at timestamptz not null default now()
);
create index seller_review_events_seller on seller_review_events (seller_id, id desc);
alter table seller_review_events enable row level security;
create policy "staff read review events" on seller_review_events for select using (private.is_staff());
create policy "members read messages" on seller_review_events for select using (visible_to_seller and private.is_seller_member(seller_id));
-- written only by the functions below
create or replace function seller_review_events_immutable() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- a seller the owner deletes takes its history with it (the foreign key's cascade, once the seller is gone; review N4)
  if tg_op = 'DELETE' and not exists (select 1 from sellers where id = old.seller_id) then return old; end if;
  raise exception 'The review history is never edited or deleted';
end $$;
create trigger seller_review_events_immutable before update or delete on seller_review_events for each row execute function seller_review_events_immutable();
create trigger audit_seller_review_events after insert on seller_review_events for each row execute function audit_trigger();

-- ================================================================ documents: KYC and brand papers
-- KYC files go in <seller>/kyc/, brand papers (authorised-distributor letters, trademark registrations) in
-- <seller>/brand/ with the brand they cover. Listing reviewers (marketing) see the brand papers, not the KYC files.
alter table seller_documents add column subject text check (char_length(subject) <= 120);   -- brand documents: which brand
drop policy "members add documents" on seller_documents;
create policy "members add documents" on seller_documents for insert with check (
  private.is_seller_member(seller_id)
  and exists (select 1 from document_types t where t.code = doc_type and t.scope in ('kyc', 'brand')
              and path like seller_id::text || '/' || t.scope || '/%'));
create policy "listing reviewers read brand documents" on seller_documents for select using (
  private.is_staff(array['marketing']::staff_role[]) and exists (select 1 from document_types t where t.code = doc_type and t.scope = 'brand'));
create policy "listing reviewers decide brand documents" on seller_documents for update
  using (private.is_staff(array['marketing']::staff_role[]) and exists (select 1 from document_types t where t.code = doc_type and t.scope = 'brand'))
  with check (private.is_staff(array['marketing']::staff_role[]) and exists (select 1 from document_types t where t.code = doc_type and t.scope = 'brand'));
create policy "listing reviewers read brand document files" on storage.objects for select to authenticated
  using (bucket_id = 'seller-kyc' and (storage.foldername(name))[2] = 'brand'
         and private.is_staff(array['owner', 'manager', 'marketing']::staff_role[]));

-- ================================================================ the checklist
-- What is still missing before the seller can send the application (the same list the dashboard shows).
create or replace function mp_application_checklist(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s sellers; p seller_private; a seller_applications; st mp_settings;
  gcc boolean; tax_needed boolean;
  photos int; missing jsonb; items jsonb;
begin
  if not (private.is_seller_member(p_seller) or private.is_staff() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into s from sellers where id = p_seller;
  if s.id is null then raise exception 'Seller not found' using detail = 'لم يُعثر على البائع'; end if;
  select * into p from seller_private where seller_id = p_seller;
  select * into a from seller_applications where seller_id = p_seller;
  select * into st from mp_settings where id = 1;
  gcc := s.country in ('SA', 'AE', 'KW', 'QA', 'BH', 'OM');
  tax_needed := exists (select 1 from kyc_requirements r where r.country = s.country and r.required
                        and r.doc_type in ('vat_certificate', 'trn_certificate', 'gstin_certificate'));
  select count(*) into photos from unnest(coalesce(a.portfolio, '{}')) img
    join media_assets m on m.id = private.asset_of(img, p_seller) and m.seller_id = p_seller and m.status in ('passed', 'review');
  select coalesce(jsonb_agg(jsonb_build_object('code', r.doc_type, 'en', r.label_en, 'ar', r.label_ar) order by r.sort), '[]'::jsonb) into missing
  from (select doc_type, label_en, label_ar, sort from kyc_requirements where country = s.country and required
        union all
        select code, label_en, label_ar, 90 from document_types where code = 'bank_letter' and not gcc) r
  where not exists (select 1 from seller_documents d where d.seller_id = p_seller and d.doc_type = r.doc_type and d.status <> 'rejected');

  items := jsonb_build_array(
    jsonb_build_object('key', 'story', 'done', char_length(coalesce(a.brand_story, '')) >= st.min_story_chars and a.relationship is not null and a.years_in_business is not null,
      'en', 'Your story: who you are, how long you have been trading and your relationship to the brands you sell.',
      'ar', 'قصتك: من أنت، ومنذ متى تمارس التجارة، وما علاقتك بالعلامات التجارية التي تبيعها.'),
    jsonb_build_object('key', 'categories', 'done', exists (select 1 from seller_categories c where c.seller_id = p_seller and c.status in ('requested', 'approved')),
      'en', 'The categories you want to sell in.', 'ar', 'الفئات التي تريد البيع فيها.'),
    jsonb_build_object('key', 'portfolio', 'done', photos >= st.min_portfolio_photos,
      'en', format('At least %s photos of your products (they stay private).', st.min_portfolio_photos),
      'ar', format('%s صور على الأقل لمنتجاتك (تبقى خاصة).', st.min_portfolio_photos)),
    jsonb_build_object('key', 'business', 'done', coalesce(p.legal_name, '') <> '' and p.legal_entity_type is not null and coalesce(p.registration_no, '') <> '',
      'en', 'Your legal entity: its name, type and registration number.', 'ar', 'كيانك النظامي: اسمه ونوعه ورقم سجله.'));
  if tax_needed then
    items := items || jsonb_build_object('key', 'tax', 'done', coalesce(p.tax_registration_no, '') <> '',
      'en', 'Your tax registration number.', 'ar', 'رقم تسجيلك الضريبي.');
  end if;
  items := items || jsonb_build_array(
    jsonb_build_object('key', 'bank', 'done', coalesce(p.account_holder, '') <> '' and coalesce(p.bank_name, '') <> '' and (not gcc or private.iban_valid(p.iban)),
      'en', case when gcc then 'Your bank account: IBAN, bank and account holder (the holder must be your legal entity).'
                 else 'Your bank account: bank and account holder (the holder must be your legal entity).' end,
      'ar', case when gcc then 'حسابك البنكي: الآيبان واسم البنك وصاحب الحساب (يجب أن يكون صاحب الحساب كيانك النظامي).'
                 else 'حسابك البنكي: اسم البنك وصاحب الحساب (يجب أن يكون صاحب الحساب كيانك النظامي).' end),
    jsonb_build_object('key', 'documents', 'done', jsonb_array_length(missing) = 0, 'missing', missing,
      'en', 'The documents your country requires.', 'ar', 'المستندات المطلوبة في بلدك.'),
    jsonb_build_object('key', 'pickup', 'done', exists (select 1 from seller_locations l where l.seller_id = p_seller and l.active),
      'en', 'The address our couriers collect your parcels from.', 'ar', 'العنوان الذي يستلم منه المندوب شحناتك.'),
    jsonb_build_object('key', 'guidelines', 'done', s.agreed_guidelines_at is not null,
      'en', 'You accepted the seller guidelines.', 'ar', 'وافقت على إرشادات البائعين.'));
  return jsonb_build_object('items', items, 'complete', not exists (select 1 from jsonb_array_elements(items) x where not (x ->> 'done')::boolean),
    'status', s.status, 'submitted_at', a.submitted_at, 'sample_status', a.sample_status);
end $$;
revoke all on function mp_application_checklist(uuid) from public, anon;
grant execute on function mp_application_checklist(uuid) to authenticated;

-- ================================================================ applying and sending the file
create or replace function apply_as_seller(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  base text; s text; n int := 1; sid uuid; mail text; cat uuid;
begin
  if uid is null then raise exception using message = 'Please sign in first', detail = 'يُرجى تسجيل الدخول أولًا'; end if;
  if not private.sellers_open() and not private.is_staff() then
    raise exception using message = 'Al Mukarramah is not open to new sellers yet: we are opening soon',
      detail = 'لم تفتح المكرمة باب التسجيل للبائعين بعد، وسنفتحه قريبًا';
  end if;
  if exists (select 1 from seller_members where user_id = uid) then raise exception using message = 'You already have a seller account', detail = 'لديك حساب بائع بالفعل'; end if;
  if coalesce((p ->> 'agree')::boolean, false) is not true then raise exception 'Please accept the seller guidelines' using detail = 'يُرجى الموافقة على إرشادات البائعين'; end if;
  if coalesce(trim(p ->> 'name_en'), '') = '' or coalesce(trim(p ->> 'country'), '') = '' or coalesce(trim(p ->> 'contact_name'), '') = '' then
    raise exception 'Shop name, country and contact name are required' using detail = 'اسم المتجر والبلد واسم جهة التواصل مطلوبة';
  end if;
  if not exists (select 1 from corridors where scope = 'marketplace' and from_country = upper(trim(p ->> 'country'))) then
    raise exception 'We do not take sellers from that country yet' using detail = 'لا نقبل بائعين من هذا البلد بعد';
  end if;
  select email into mail from auth.users where id = uid;

  base := trim(both '-' from regexp_replace(lower(p ->> 'name_en'), '[^a-z0-9]+', '-', 'g'));
  if base = '' or char_length(base) < 2 then base := 'shop'; end if;
  base := left(base, 50);
  s := base;
  while exists (select 1 from sellers where slug = s) loop
    n := n + 1;
    s := base || '-' || n;
  end loop;

  insert into sellers (slug, name_en, name_ar, tagline_en, tagline_ar, country, city, website, status, agreed_guidelines_at)
  values (s, trim(p ->> 'name_en'), nullif(trim(p ->> 'name_ar'), ''), nullif(trim(p ->> 'tagline_en'), ''), nullif(trim(p ->> 'tagline_ar'), ''),
          upper(trim(p ->> 'country')), nullif(trim(p ->> 'city'), ''), nullif(trim(p ->> 'website'), ''), 'pending', now())
  returning id into sid;

  insert into seller_private (seller_id, contact_name, contact_email, contact_phone, legal_name, registration_no, product_summary)
  values (sid, trim(p ->> 'contact_name'), coalesce(nullif(trim(p ->> 'contact_email'), ''), mail), nullif(trim(p ->> 'contact_phone'), ''),
          nullif(trim(p ->> 'legal_name'), ''), nullif(trim(p ->> 'registration_no'), ''), left(p ->> 'product_summary', 2000));

  insert into seller_applications (seller_id, relationship, years_in_business, brand_story, links, monthly_orders_estimate)
  values (sid, nullif(p ->> 'relationship', ''), nullif(p ->> 'years_in_business', '')::int, nullif(left(trim(p ->> 'brand_story'), 3000), ''),
          coalesce(array(select trim(x) from jsonb_array_elements_text(coalesce(p -> 'links', '[]')) x where trim(x) <> '' limit 6), '{}'),
          nullif(p ->> 'monthly_orders_estimate', '')::int);

  for cat in select (x)::uuid from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) x limit 20 loop
    if exists (select 1 from categories c where c.id = cat) then
      insert into seller_categories (seller_id, category_id) values (sid, cat) on conflict do nothing;
    end if;
  end loop;

  insert into seller_members (seller_id, user_id, role) values (sid, uid, 'owner');
  insert into seller_review_events (seller_id, actor, kind, message) values (sid, uid, 'applied', null);
  return sid;
end $$;
revoke all on function apply_as_seller(jsonb) from public, anon;
grant execute on function apply_as_seller(jsonb) to authenticated;

-- Our own partners are opened by owner/manager: approved, no sample, listing wherever our team puts them.
create or replace function staff_create_seller(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  base text; s text; n int := 1; sid uuid;
begin
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  if coalesce(trim(p ->> 'name_en'), '') = '' or coalesce(trim(p ->> 'country'), '') !~ '^[A-Za-z]{2}$' then
    raise exception 'Name and country are required';
  end if;
  base := left(trim(both '-' from regexp_replace(lower(p ->> 'name_en'), '[^a-z0-9]+', '-', 'g')), 50);
  if coalesce(base, '') = '' then base := 'partner'; end if;
  s := base;
  while exists (select 1 from sellers where slug = s) loop n := n + 1; s := base || '-' || n; end loop;
  insert into sellers (slug, name_en, name_ar, country, city, kind, status, commission_bps, agreed_guidelines_at)
  values (s, trim(p ->> 'name_en'), nullif(trim(p ->> 'name_ar'), ''), upper(trim(p ->> 'country')), nullif(trim(p ->> 'city'), ''),
          case when p ->> 'kind' = 'marketplace' then 'marketplace' else 'partner' end,
          case when p ->> 'kind' = 'marketplace' then 'pending'::seller_status else 'approved'::seller_status end,
          nullif(p ->> 'commission_bps', '')::int, now())
  returning id into sid;
  insert into seller_private (seller_id, contact_name, contact_email, contact_phone)
  values (sid, coalesce(nullif(trim(p ->> 'contact_name'), ''), trim(p ->> 'name_en')), coalesce(trim(p ->> 'contact_email'), ''), nullif(trim(p ->> 'contact_phone'), ''));
  insert into seller_applications (seller_id, sample_status) values (sid, case when p ->> 'kind' = 'marketplace' then 'not_requested' else 'not_needed' end);
  insert into seller_review_events (seller_id, actor, kind, message, visible_to_seller) values (sid, auth.uid(), 'note', 'Opened by our team', false);
  return sid;
end $$;
revoke all on function staff_create_seller(jsonb) from public, anon;
grant execute on function staff_create_seller(jsonb) to authenticated;

-- The seller sends the completed file (or answers a request for more information). Every checklist step must be done.
create or replace function submit_seller_application(p_seller uuid, p_message text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s sellers;
  c jsonb;
  again boolean;
begin
  if not exists (select 1 from seller_members m where m.seller_id = p_seller and m.user_id = auth.uid()) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into s from sellers where id = p_seller for update;
  if s.status not in ('pending', 'info_requested') then raise exception 'Your application is already %', s.status using detail = format('حالة طلبك: %s', private.status_ar(s.status::text)); end if;
  c := mp_application_checklist(p_seller);
  if not (c ->> 'complete')::boolean then raise exception 'Please complete every step first' using detail = 'يُرجى إكمال كل الخطوات أولًا'; end if;
  again := s.status = 'info_requested' or exists (select 1 from seller_applications where seller_id = p_seller and submitted_at is not null);
  update seller_applications set submitted_at = now() where seller_id = p_seller;
  update seller_private set kyc_status = 'submitted' where seller_id = p_seller and kyc_status in ('not_started', 'info_requested', 'rejected', 'expired');
  update sellers set status = 'pending' where id = p_seller;
  insert into seller_review_events (seller_id, actor, kind, message)
  values (p_seller, auth.uid(), case when again then 'resubmitted' else 'submitted' end, nullif(left(trim(coalesce(p_message, '')), 4000), ''));
  return jsonb_build_object('status', 'pending', 'submitted_at', now());
end $$;
revoke all on function submit_seller_application(uuid, text) from public, anon;
grant execute on function submit_seller_application(uuid, text) to authenticated;

-- ================================================================ the review (owner and manager)
--   request_info: pending -> info_requested (the message tells the seller what to add)
--   approve:      pending / info_requested / rejected -> approved (KYC approved, sample passed or not needed,
--                 a marketplace corridor from their country open or piloting them; approves the chosen categories)
--   reject:       pending / info_requested -> rejected     suspend: approved -> suspended
--   reinstate:    suspended -> approved                      note: a staff-only note
create or replace function mp_review_seller(p_seller uuid, p_action text, p_message text default null, p_categories uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s sellers; p seller_private; a seller_applications; st mp_settings;
  msg text := nullif(left(trim(coalesce(p_message, '')), 2000), '');
begin
  if p_action = 'note' then
    if not private.is_staff() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
    if msg is null then raise exception 'Write the note'; end if;
    insert into seller_review_events (seller_id, actor, kind, message, visible_to_seller) values (p_seller, uid, 'note', msg, false);
    return jsonb_build_object('ok', true);
  end if;
  if not private.is_staff(array['owner', 'manager']::staff_role[]) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  select * into s from sellers where id = p_seller for update;
  if s.id is null then raise exception 'Seller not found' using detail = 'لم يُعثر على البائع'; end if;
  select * into p from seller_private where seller_id = p_seller;
  select * into a from seller_applications where seller_id = p_seller;
  select * into st from mp_settings where id = 1;

  if p_action = 'request_info' then
    if s.status not in ('pending', 'info_requested') then raise exception 'This seller is %', s.status; end if;
    if msg is null then raise exception 'Tell the seller what to add'; end if;
    update sellers set status = 'info_requested', review_note = msg where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'info_requested', msg);
  elsif p_action = 'approve' then
    if s.status not in ('pending', 'info_requested', 'rejected') then raise exception 'This seller is %', s.status; end if;
    if s.kind = 'marketplace' then
      if a.submitted_at is null then raise exception 'The seller has not sent the application yet'; end if;
      if st.require_kyc_before_approval and coalesce(p.kyc_status, '') <> 'approved' then raise exception 'Approve the KYC first'; end if;
      if st.require_sample and coalesce(a.sample_status, '') not in ('passed', 'not_needed') then
        raise exception 'Record the sample as passed (or not needed) first';
      end if;
      if not exists (select 1 from corridors c where c.scope = 'marketplace' and c.from_country = s.country
                     and (c.status = 'open' or (c.status = 'pilot' and s.id = any(c.pilot_seller_ids)))) then
        raise exception 'No marketplace corridor from % is open: add the seller to a pilot corridor first', s.country;
      end if;
    end if;
    update seller_categories set status = 'approved'
    where seller_id = s.id and status = 'requested' and (p_categories is null or category_id = any(p_categories));
    if s.kind = 'marketplace' and not exists (select 1 from seller_categories where seller_id = s.id and status = 'approved') then
      raise exception 'Approve at least one category';
    end if;
    update sellers set status = 'approved', review_note = msg where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'approved', msg);
  elsif p_action = 'reject' then
    if s.status not in ('pending', 'info_requested') then raise exception 'This seller is %', s.status; end if;
    if msg is null then raise exception 'Write the reason for the seller'; end if;
    update sellers set status = 'rejected', review_note = msg where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'rejected', msg);
  elsif p_action = 'suspend' then
    if s.status <> 'approved' then raise exception 'This seller is %', s.status; end if;
    if msg is null then raise exception 'Write the reason for the seller'; end if;
    update sellers set status = 'suspended', suspended_reason = 'staff', review_note = msg where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'suspended', msg);
  elsif p_action = 'reinstate' then
    if s.status <> 'suspended' or s.approved_at is null then raise exception 'Only a suspended seller who was approved before can be reinstated'; end if;
    if msg is null then raise exception 'Write what was reviewed'; end if;
    update sellers set status = 'approved', review_note = msg where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'reinstated', msg);
  elsif p_action = 'approve_profile' then
    -- the shop page changes the seller made while live go public (checked again here)
    if s.profile_pending is null then raise exception 'No shop page changes are waiting'; end if;
    perform private.check_shop_text(k, s.profile_pending ->> k) from jsonb_object_keys(s.profile_pending) k;
    update sellers set
      name_en = case when profile_pending ? 'name_en' then profile_pending ->> 'name_en' else name_en end,
      name_ar = case when profile_pending ? 'name_ar' then profile_pending ->> 'name_ar' else name_ar end,
      tagline_en = case when profile_pending ? 'tagline_en' then profile_pending ->> 'tagline_en' else tagline_en end,
      tagline_ar = case when profile_pending ? 'tagline_ar' then profile_pending ->> 'tagline_ar' else tagline_ar end,
      about_en = case when profile_pending ? 'about_en' then profile_pending ->> 'about_en' else about_en end,
      about_ar = case when profile_pending ? 'about_ar' then profile_pending ->> 'about_ar' else about_ar end,
      returns_en = case when profile_pending ? 'returns_en' then profile_pending ->> 'returns_en' else returns_en end,
      returns_ar = case when profile_pending ? 'returns_ar' then profile_pending ->> 'returns_ar' else returns_ar end,
      city = case when profile_pending ? 'city' then profile_pending ->> 'city' else city end,
      website = case when profile_pending ? 'website' then profile_pending ->> 'website' else website end,
      profile_pending = null, profile_submitted_at = null
    where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'profile_approved', msg);
  elsif p_action = 'reject_profile' then
    if s.profile_pending is null then raise exception 'No shop page changes are waiting'; end if;
    if msg is null then raise exception 'Write the reason for the seller'; end if;
    update sellers set profile_pending = null, profile_submitted_at = null where id = s.id;
    insert into seller_review_events (seller_id, actor, kind, message) values (s.id, uid, 'profile_rejected', msg);
  else
    raise exception 'Unknown action %', p_action;
  end if;
  return jsonb_build_object('ok', true, 'status', (select status from sellers where id = s.id));
end $$;
revoke all on function mp_review_seller(uuid, text, text, uuid[]) from public, anon;
grant execute on function mp_review_seller(uuid, text, text, uuid[]) to authenticated;

-- ================================================================ submission needs an approved category
-- The pictures of a made-to-measure listing's design options (tailoring.options[].choices[].image).
create or replace function private.option_images(p_tailoring jsonb) returns setof text
language sql immutable set search_path = public as $$
  select c ->> 'image'
  from jsonb_array_elements(case when jsonb_typeof(p_tailoring -> 'options') = 'array' then p_tailoring -> 'options' else '[]'::jsonb end) o,
       jsonb_array_elements(case when jsonb_typeof(o -> 'choices') = 'array' then o -> 'choices' else '[]'::jsonb end) c
  where coalesce(c ->> 'image', '') <> '';
$$;
create or replace function mp_begin_listing_check(p_product uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p products;
  bad int;
begin
  select * into p from products where id = p_product for update;
  if p.id is null or p.seller_id is null then raise exception using message = 'Listing not found', detail = 'لم يُعثر على المنتج'; end if;
  if not exists (select 1 from seller_members m where m.seller_id = p.seller_id and m.user_id = p_user) then raise exception using message = 'Not allowed', detail = 'غير مسموح'; end if;
  if not private.sellers_open() and not exists (select 1 from staff_members where user_id = p_user) then
    raise exception using message = 'Listings cannot be sent for review yet: Al Mukarramah opens to sellers soon',
      detail = 'لا يمكن إرسال المنتجات للمراجعة بعد، وستفتح المكرمة للبائعين قريبًا';
  end if;
  if not private.seller_approved(p.seller_id) then raise exception using message = 'Your seller account is not approved', detail = 'حساب البائع لم تتم الموافقة عليه'; end if;
  if p.listing_status not in ('draft', 'rejected', 'check_pending') then
    raise exception using message = format('This listing is already %s', p.listing_status), detail = format('حالة هذا المنتج الآن: %s', p.listing_status);
  end if;
  if p.category_id is null then raise exception using message = 'Choose a category first', detail = 'اختر الفئة أولًا'; end if;
  if not private.seller_may_list(p.seller_id, p.category_id) then
    raise exception using message = 'Your shop is not approved for this category yet: request it from your application page',
      detail = 'متجرك غير معتمد لهذه الفئة بعد: اطلبها من صفحة طلبك';
  end if;
  select count(*) into bad from unnest(coalesce(p.images, '{}')) img
  where not exists (select 1 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id and a.status in ('passed', 'review'));
  if bad > 0 then raise exception using message = 'Every photo must pass the photo check before you submit', detail = 'يجب أن تجتاز كل صورة فحص الصور قبل الإرسال'; end if;
  -- design-option pictures (made to measure) are photos too (review H6)
  select count(*) into bad from private.option_images(p.tailoring) img
  where not exists (select 1 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id and a.status in ('passed', 'review'));
  if bad > 0 then
    raise exception using message = 'Every design-option picture must pass the photo check before you submit',
      detail = 'يجب أن تجتاز كل صورة من صور خيارات التصميم فحص الصور قبل الإرسال';
  end if;
  update products set listing_status = 'check_pending', submitted_at = now() where id = p.id;
  return jsonb_build_object('product_id', p.id, 'updated_at', (select updated_at from products where id = p.id));
end $$;
revoke all on function mp_begin_listing_check(uuid, uuid) from public, anon, authenticated;

-- Brand papers on file count for the listing check: an authorised-distributor letter covers listings of that brand.
create or replace function mp_listing_check_context(p_product uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product;
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'product', to_jsonb(p),
    'seller', (select jsonb_build_object('id', s.id, 'name_en', s.name_en, 'country', s.country, 'kind', s.kind, 'status', s.status) from sellers s where s.id = p.seller_id),
    'requirements', case when p.category_id is null then null else mp_category_requirements(p.category_id) end,
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('path', img, 'position', ord, 'asset', (
                 select jsonb_build_object('id', a.id, 'status', a.status, 'flags', a.flags, 'width', a.width, 'height', a.height, 'mime', a.mime, 'bucket', a.bucket, 'path', a.path)
                 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id)) order by ord), '[]'::jsonb)
               from unnest(coalesce(p.images, '{}')) with ordinality as x(img, ord)),
    'variants', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'label_en', v.label_en, 'label_ar', v.label_ar, 'options', v.options, 'sku', v.sku,
                   'price_minor', v.price_minor, 'stock', v.stock, 'is_active', v.is_active) order by v.sort, v.label_en), '[]'::jsonb)
                 from product_variants v where v.product_id = p.id),
    'option_photos', (select coalesce(jsonb_agg(jsonb_build_object('path', img, 'asset', (
                 select jsonb_build_object('id', a.id, 'status', a.status, 'flags', a.flags)
                 from media_assets a where a.id = private.asset_of(img, p.seller_id) and a.seller_id = p.seller_id))), '[]'::jsonb)
               from private.option_images(p.tailoring) img),
    'new_seller', (select s.approved_at is null or s.approved_at > now() - interval '90 days'
                          or (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'approved') < 5
                   from sellers s where s.id = p.seller_id),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('permit_key', permit_key, 'status', status)), '[]'::jsonb) from product_permits where product_id = p.id),
    'documents', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                    select jsonb_build_object('doc_type', doc_type, 'status', status) x from product_documents where product_id = p.id and status <> 'rejected'
                    union all
                    select jsonb_build_object('doc_type', d.doc_type, 'status', d.status, 'subject', d.subject) from seller_documents d
                    join document_types t on t.code = d.doc_type and t.scope = 'brand'
                    where d.seller_id = p.seller_id and d.status <> 'rejected'
                      and (d.subject is null or lower(trim(d.subject)) = lower(trim(coalesce(p.attributes ->> 'brand', ''))))) q),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name_en', name_en, 'name_ar', name_ar) order by sort), '[]'::jsonb)
                   from categories where kind = 'category' and listable and parent_id is not null),
    'rules', (select coalesce(jsonb_agg(to_jsonb(r) - 'updated_by' order by r.level, r.sort), '[]'::jsonb) from policy_rules r where r.active),
    'settings', (select to_jsonb(s) from mp_settings s where id = 1));
end $$;
revoke all on function mp_listing_check_context(uuid) from public, anon, authenticated;

-- ================================================================ what the seller and staff read
-- The seller's whole file for the dashboard: application, categories, documents, requirements, pickup addresses,
-- messages from our team and the checklist.
create or replace function my_seller_file(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_seller_member(p_seller) then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return jsonb_build_object(
    'application', (select to_jsonb(a) from seller_applications a where a.seller_id = p_seller),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category_id', c.category_id, 'status', c.status, 'note', c.note, 'name_en', k.name_en, 'name_ar', k.name_ar, 'kind', k.kind)
                     order by k.sort), '[]'::jsonb) from seller_categories c join categories k on k.id = c.category_id where c.seller_id = p_seller),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'status', d.status, 'note', d.note, 'file_name', d.file_name,
                    'subject', d.subject, 'expires_on', d.expires_on, 'uploaded_at', d.uploaded_at) order by d.uploaded_at desc), '[]'::jsonb)
                  from seller_documents d where d.seller_id = p_seller),
    'requirements', (select coalesce(jsonb_agg(jsonb_build_object('doc_type', r.doc_type, 'label_en', r.label_en, 'label_ar', r.label_ar, 'required', r.required) order by r.sort), '[]'::jsonb)
                     from kyc_requirements r join sellers s on s.country = r.country where s.id = p_seller),
    'locations', (select coalesce(jsonb_agg(to_jsonb(l) - 'provider_refs' order by l.is_default desc, l.created_at), '[]'::jsonb) from seller_locations l where l.seller_id = p_seller and l.active),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'message', e.message, 'at', e.created_at) order by e.id desc), '[]'::jsonb)
                 from (select * from seller_review_events where seller_id = p_seller and visible_to_seller order by id desc limit 30) e),
    'checklist', mp_application_checklist(p_seller));
end $$;
revoke all on function my_seller_file(uuid) from public, anon;
grant execute on function my_seller_file(uuid) to authenticated;

-- Staff: every seller with the application, KYC, documents, categories, checklist, strikes and recent history.
create or replace function admin_sellers() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_staff() then raise exception 'Not allowed' using detail = 'غير مسموح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'seller', to_jsonb(s), 'application', to_jsonb(a),
      -- the seller's private file (bank details, legal and tax numbers, contact details, our notes, the KYC note) only
      -- for the owner, managers and finance (review M12, N11); other staff see the KYC state and what they plan to sell
      'private', case when p.seller_id is null then null
                      when private.is_staff(array['owner', 'manager', 'finance']::staff_role[]) then to_jsonb(p)
                      else jsonb_build_object('seller_id', p.seller_id, 'kyc_status', p.kyc_status, 'contact_name', p.contact_name,
                                              'product_summary', p.product_summary, 'legal_entity_type', p.legal_entity_type) end,
      'live', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'approved' and x.is_active),
      'waiting', (select count(*) from products x where x.seller_id = s.id and x.listing_status = 'pending_review'),
      -- KYC papers for the owner, managers and finance; brand papers for marketing too (they review listings)
      'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.uploaded_at desc), '[]'::jsonb) from seller_documents d where d.seller_id = s.id
                    and (private.is_staff(array['owner', 'manager', 'finance']::staff_role[])
                         or (private.is_staff(array['marketing']::staff_role[]) and d.path like s.id::text || '/brand/%'))),
      'required', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sort), '[]'::jsonb) from kyc_requirements r where r.country = s.country),
      'categories', (select coalesce(jsonb_agg(jsonb_build_object('category_id', c.category_id, 'status', c.status, 'note', c.note, 'name_en', k.name_en, 'kind', k.kind) order by k.sort), '[]'::jsonb)
                     from seller_categories c join categories k on k.id = c.category_id where c.seller_id = s.id),
      'locations', (select count(*) from seller_locations l where l.seller_id = s.id and l.active),
      'strikes', (select count(*) from seller_strikes k, mp_settings st where k.seller_id = s.id and k.voided_at is null
                  and st.id = 1 and k.created_at > now() - make_interval(days => st.strike_window_days)),
      'events', (select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'message', e.message, 'at', e.created_at, 'visible', e.visible_to_seller) order by e.id desc), '[]'::jsonb)
                 from (select * from seller_review_events where seller_id = s.id order by id desc limit 20) e),
      'checklist', mp_application_checklist(s.id)
    ) order by (s.status in ('pending', 'info_requested') and a.submitted_at is not null) desc, (p.kyc_status = 'submitted') desc, s.created_at desc)
    from sellers s left join seller_private p on p.seller_id = s.id left join seller_applications a on a.seller_id = s.id
  ), '[]'::jsonb);
end $$;
revoke all on function admin_sellers() from public, anon;
grant execute on function admin_sellers() to authenticated;

-- The handbook and the application page know which countries we take sellers from and what each requires.
create or replace function mp_guidance() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'categories', mp_category_tree(),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'level', level, 'severity', severity, 'title_en', title_en, 'title_ar', title_ar,
               'guidance_en', guidance_en, 'guidance_ar', guidance_ar, 'rejected_examples', rejected_examples, 'accepted_examples', accepted_examples,
               'needs_scholar_confirmation', needs_scholar_confirmation and scholar_confirmed_at is null) order by level, sort), '[]'::jsonb)
              from policy_rules where active),
    'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.sort), '[]'::jsonb) from document_types d),
    'styles', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'garment', garment, 'label_en', label_en, 'label_ar', label_ar,
                'countries', countries, 'default_measurements', default_measurements) order by sort), '[]'::jsonb) from garment_styles where active),
    'permits', (select coalesce(jsonb_agg(jsonb_build_object('to_country', to_country, 'permit_key', permit_key, 'label_en', label_en,
                'label_ar', label_ar, 'category_slugs', category_slugs) order by to_country, permit_key), '[]'::jsonb) from permit_rules where active),
    'kyc', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'doc_type', doc_type, 'label_en', label_en, 'label_ar', label_ar, 'required', required)
             order by country, sort), '[]'::jsonb) from kyc_requirements),
    'seller_countries', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name_en', c.name_en, 'name_ar', c.name_ar,
             'open', exists (select 1 from corridors k where k.scope = 'marketplace' and k.from_country = c.code and k.status = 'open'),
             'phase', (select min(k.phase) from corridors k where k.scope = 'marketplace' and k.from_country = c.code)) order by c.code), '[]'::jsonb)
             from countries c where exists (select 1 from corridors k where k.scope = 'marketplace' and k.from_country = c.code)),
    'settings', mp_public_settings());
$$;
grant execute on function mp_guidance() to anon, authenticated;
