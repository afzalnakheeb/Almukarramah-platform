// Terms of service (linked from the footer, checkout and Google's sign-in screen).
import React from 'react';
import { LegalPage, type LegalDoc } from '@/components/legal';

const CONTACT = 'hello@almukarramah.com';

const en: LegalDoc = {
  title: 'Terms of service',
  updated: 'Last updated 29 October 2026',
  intro: 'These terms apply when you shop at almukarramah.com or use the Al Mukarramah apps. Al Mukarramah is based in Madinah, Saudi Arabia. By placing an order or creating an account you agree to them.',
  sections: [
    { h: 'Your account', p: [
      'You may shop as a guest or with an account. Keep your sign-in secure; you are responsible for activity on your account. We may suspend accounts used for fraud or abuse.',
    ] },
    { h: 'Prices and payment', p: [
      'Prices are in Saudi riyals and include 15% VAT. Prices shown in other currencies are converted for your convenience. The delivery charge is shown at checkout before you pay. Payment is taken by Moyasar; every paid order receives a tax invoice.',
      'If a price is shown in error we will tell you before dispatch and you may cancel for a full refund.',
    ] },
    { h: 'Delivery', p: [
      'We deliver to hotels in Madinah and Makkah, across Saudi Arabia and to the countries offered at checkout. Delivery times are estimates. Some items, such as alcohol-based perfume sprays, can only be delivered within Saudi Arabia.',
      'For hotel delivery, please give the correct hotel and stay dates; we are not responsible for delays caused by incorrect details.',
    ] },
    { h: 'Returns and refunds', p: [
      'If an item arrives damaged or is not what you ordered, contact us within 7 days of delivery with a photo and we will replace it or refund you.',
      'Because of hygiene and food safety, opened perfumes, oils, bakhoor and food items such as dates cannot be returned unless faulty. Other unused items may be returned within 7 days of delivery in their original condition; return shipping is paid by the customer unless the item was faulty.',
      'Refunds go back to the original payment method. A credit note is issued for every refund.',
    ] },
    { h: 'Subscriptions', p: [
      'Memberships and boxes renew every month until you cancel. You can cancel at any time in your account; you will not be charged again and the subscription continues until the end of the period already paid. Subscriptions bought inside the iPhone or Android app are managed in the App Store or Google Play.',
      'A membership bought inside the iPhone or Android app is charged to your Apple ID or Google Play account when you confirm the purchase. It renews automatically for the same period at the same price unless you cancel at least 24 hours before the end of the current period, in your App Store or Google Play account settings. Deleting your Al Mukarramah account does not cancel it. Purchases in our iPhone app are also covered by Apple\u2019s standard licence agreement for apps.',
    ] },
    { h: 'Content and religious material', p: [
      'Quran text in our apps is shown exactly as published by its source. Our assistant and content do not give religious rulings; please ask a qualified scholar.',
    ] },
    { h: 'Liability and law', p: [
      'We take care to describe products accurately. Nothing in these terms limits rights you have under Saudi consumer law. These terms are governed by the laws of the Kingdom of Saudi Arabia.',
    ] },
    { h: 'Contact', p: [`Al Mukarramah, Madinah, Saudi Arabia. Email: ${CONTACT}`] },
  ],
};

const ar: LegalDoc = {
  title: 'الشروط والأحكام',
  updated: 'آخر تحديث: ٢٩ أكتوبر ٢٠٢٦',
  intro: 'تنطبق هذه الشروط عند التسوق في almukarramah.com أو استخدام تطبيقات المكرمة. مقر المكرمة في المدينة المنورة بالمملكة العربية السعودية. بإتمام طلب أو إنشاء حساب فإنك توافق عليها.',
  sections: [
    { h: 'حسابك', p: [
      'يمكنك التسوق كضيف أو بحساب. حافظ على أمان دخولك، فأنت مسؤول عما يتم عبر حسابك. ويجوز لنا إيقاف الحسابات المستخدمة في الاحتيال أو الإساءة.',
    ] },
    { h: 'الأسعار والدفع', p: [
      'الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة ١٥٪. والأسعار المعروضة بعملات أخرى محوّلة لتسهيل الاطلاع. وتظهر رسوم التوصيل عند الدفع قبل إتمامه. تتولى ميسر تحصيل المبلغ، ويحصل كل طلب مدفوع على فاتورة ضريبية.',
      'إذا ظهر سعر بالخطأ فسنبلغك قبل الشحن، ويحق لك الإلغاء واسترداد المبلغ كاملًا.',
    ] },
    { h: 'التوصيل', p: [
      'نوصل إلى الفنادق في المدينة المنورة ومكة المكرمة، وإلى جميع مناطق المملكة، وإلى الدول المتاحة عند الدفع. مواعيد التوصيل تقديرية. وبعض المنتجات، مثل العطور البخاخة المحتوية على الكحول، لا توصل إلا داخل المملكة.',
      'في التوصيل إلى الفنادق، يرجى إدخال اسم الفندق وتواريخ الإقامة بدقة، ولسنا مسؤولين عن التأخير الناتج عن بيانات غير صحيحة.',
    ] },
    { h: 'الإرجاع والاسترداد', p: [
      'إذا وصلك منتج تالف أو مختلف عما طلبت، فتواصل معنا خلال ٧ أيام من الاستلام مع صورة، وسنستبدله أو نعيد لك المبلغ.',
      'لأسباب صحية وتتعلق بسلامة الغذاء، لا يمكن إرجاع العطور والدهون والبخور المفتوحة ولا المواد الغذائية كالتمور إلا إذا كان بها عيب. ويمكن إرجاع المنتجات الأخرى غير المستخدمة خلال ٧ أيام من الاستلام بحالتها الأصلية، ويتحمل العميل رسوم الشحن إلا إذا كان المنتج معيبًا.',
      'يُعاد المبلغ إلى وسيلة الدفع الأصلية، ويصدر إشعار دائن لكل استرداد.',
    ] },
    { h: 'الاشتراكات', p: [
      'تتجدد العضويات والصناديق شهريًا حتى تلغيها. يمكنك الإلغاء في أي وقت من حسابك، ولن يُخصم منك مبلغ آخر، ويستمر الاشتراك حتى نهاية الفترة المدفوعة. أما الاشتراكات المشتراة من تطبيق iPhone أو Android فتُدار من App Store أو Google Play.',
      'تُخصم العضوية المشتراة من داخل تطبيق iPhone أو Android من حساب Apple ID أو Google Play عند تأكيد الشراء، وتتجدد تلقائيًا للمدة نفسها وبالسعر نفسه ما لم تلغها قبل نهاية الفترة الحالية بـ٢٤ ساعة على الأقل من إعدادات حسابك في App Store أو Google Play. ولا يؤدي حذف حسابك في المكرمة إلى إلغائها. كما تخضع المشتريات في تطبيقنا على iPhone لاتفاقية الترخيص القياسية من Apple للتطبيقات.',
    ] },
    { h: 'المحتوى والمواد الدينية', p: [
      'يُعرض نص القرآن الكريم في تطبيقاتنا كما نشره مصدره تمامًا. ولا يقدّم المساعد ولا محتوانا فتاوى شرعية؛ يرجى سؤال أهل العلم.',
    ] },
    { h: 'المسؤولية والنظام', p: [
      'نحرص على وصف المنتجات بدقة. ولا يحدّ شيء في هذه الشروط من حقوقك بموجب أنظمة حماية المستهلك السعودية. وتخضع هذه الشروط لأنظمة المملكة العربية السعودية.',
    ] },
    { h: 'التواصل', p: [`المكرمة، المدينة المنورة، المملكة العربية السعودية. البريد: ${CONTACT}`] },
  ],
};

export default function Terms() {
  return <LegalPage path="/terms" seoTitle="Terms of service | Al Mukarramah" seoDescription="Orders, delivery, returns and subscriptions at Al Mukarramah." en={en} ar={ar} />;
}
