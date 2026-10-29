// Privacy policy (linked from the footer, the sign-in page and Google's sign-in screen).
import React from 'react';
import { LegalPage, type LegalDoc } from '@/components/legal';

const CONTACT = 'hello@almukarramah.com';

const en: LegalDoc = {
  title: 'Privacy policy',
  updated: 'Last updated 29 October 2026',
  intro: 'Al Mukarramah is a gift house in Madinah, Saudi Arabia. This policy explains what we collect when you use almukarramah.com and our apps, why, and the choices you have. We collect only what we need to serve you, we never sell your data, and we show no advertising.',
  sections: [
    { h: 'What we collect', p: [
      'Account: your email address. If you sign in with Google, Google shares your name, email address and profile picture with us. We do not receive your Google password.',
      'Orders: what you buy, the delivery details you give us (recipient name, phone, hotel or address, stay dates), your gift message, and your order and invoice history.',
      'Payments: card payments are handled by Moyasar, a payment company licensed by the Saudi Central Bank. Card numbers never reach us. For subscriptions, Moyasar gives us a token so later months can be charged; we cannot see or use the card number.',
      'Shopping assistant: the messages you type to the "Ask Al Mukarramah" assistant, so it can answer you. Please do not type card numbers or passwords there.',
      'Basic technical data: your browser and device type and pages viewed, needed to keep the site working and secure.',
    ] },
    { h: 'How we use it', p: [
      'To create and run your account, process and deliver your orders, issue tax invoices required by ZATCA, run subscriptions you choose, answer your questions and keep the service secure.',
      'We send marketing messages only if you tick the box to receive them. You can switch this off at any time in your account.',
    ] },
    { h: 'Who we share it with', p: [
      'Only with the companies that help us provide the service, and only what each needs: Supabase (accounts and database), Vercel (website hosting), Moyasar (payments), delivery companies (the delivery details of your order), Anthropic (to generate the assistant’s replies), Google (if you choose Google sign-in), and ZATCA (tax invoices, as the law requires).',
      'We may also share information if Saudi law or an authority requires it.',
    ] },
    { h: 'How long we keep it', p: [
      'We keep your account while it is open. Tax invoices and order records are kept for as long as Saudi tax law requires, even after an account is closed. Assistant messages are not stored by us after the conversation.',
    ] },
    { h: 'Your rights', p: [
      `You can ask to see, correct or delete your personal data, or withdraw consent to marketing, by writing to ${CONTACT}. We reply within 30 days. Records we must keep by law, such as tax invoices, cannot be deleted early.`,
      'Our apps for children (such as Seerah Trails) have their own privacy policies on their websites.',
    ] },
    { h: 'Contact', p: [`Al Mukarramah, Madinah, Saudi Arabia. Email: ${CONTACT}`] },
  ],
};

const ar: LegalDoc = {
  title: 'سياسة الخصوصية',
  updated: 'آخر تحديث: ٢٩ أكتوبر ٢٠٢٦',
  intro: 'المكرمة دار هدايا في المدينة المنورة بالمملكة العربية السعودية. توضح هذه السياسة ما نجمعه عند استخدامك almukarramah.com وتطبيقاتنا، ولماذا، والخيارات المتاحة لك. نجمع فقط ما نحتاجه لخدمتك، ولا نبيع بياناتك أبدًا، ولا نعرض إعلانات.',
  sections: [
    { h: 'ما الذي نجمعه', p: [
      'الحساب: بريدك الإلكتروني. وإذا سجّلت الدخول عبر Google، تشاركنا Google اسمك وبريدك وصورة ملفك الشخصي. لا نتلقى كلمة مرور Google الخاصة بك.',
      'الطلبات: ما تشتريه، وبيانات التوصيل التي تقدّمها (اسم المستلم، الجوال، الفندق أو العنوان، تواريخ الإقامة)، ورسالة الإهداء، وسجل طلباتك وفواتيرك.',
      'المدفوعات: تتولى ميسر، شركة المدفوعات المرخّصة من البنك المركزي السعودي، الدفع بالبطاقات. لا تصلنا أرقام البطاقات أبدًا. وفي الاشتراكات تعطينا ميسر رمزًا لتحصيل الأشهر التالية، ولا يمكننا رؤية رقم البطاقة أو استخدامه.',
      'المساعد: الرسائل التي تكتبها لمساعد «اسأل المكرمة» ليتمكن من الرد عليك. يرجى عدم كتابة أرقام البطاقات أو كلمات المرور فيه.',
      'بيانات تقنية أساسية: نوع المتصفح والجهاز والصفحات التي تزورها، لإبقاء الموقع يعمل بأمان.',
    ] },
    { h: 'كيف نستخدمها', p: [
      'لإنشاء حسابك وإدارته، وتنفيذ طلباتك وتوصيلها، وإصدار الفواتير الضريبية التي تتطلبها هيئة الزكاة والضريبة والجمارك، وإدارة الاشتراكات التي تختارها، والرد على استفساراتك، والحفاظ على أمان الخدمة.',
      'لا نرسل رسائل تسويقية إلا إذا وافقت عليها بنفسك، ويمكنك إيقافها في أي وقت من حسابك.',
    ] },
    { h: 'مع من نشاركها', p: [
      'فقط مع الشركات التي تساعدنا في تقديم الخدمة، وبقدر ما تحتاجه كل منها: Supabase (الحسابات وقاعدة البيانات)، وVercel (استضافة الموقع)، وميسر (المدفوعات)، وشركات التوصيل (بيانات توصيل طلبك)، وAnthropic (لإنشاء ردود المساعد)، وGoogle (إذا اخترت الدخول عبرها)، وهيئة الزكاة والضريبة والجمارك (الفواتير الضريبية كما يقتضي النظام).',
      'وقد نشارك المعلومات إذا اقتضى ذلك النظام السعودي أو طلبته جهة مختصة.',
    ] },
    { h: 'مدة الاحتفاظ', p: [
      'نحتفظ بحسابك ما دام مفتوحًا. وتُحفظ الفواتير الضريبية وسجلات الطلبات المدة التي يقتضيها النظام الضريبي السعودي حتى بعد إغلاق الحساب. ولا نحتفظ برسائل المساعد بعد انتهاء المحادثة.',
    ] },
    { h: 'حقوقك', p: [
      `يمكنك طلب الاطلاع على بياناتك الشخصية أو تصحيحها أو حذفها، أو سحب موافقتك على التسويق، بالكتابة إلى ${CONTACT}. نرد خلال ٣٠ يومًا. ولا يمكن حذف السجلات التي يلزمنا النظام بحفظها، مثل الفواتير الضريبية، قبل انتهاء مدتها.`,
      'لتطبيقاتنا الموجهة للأطفال (مثل دروب السيرة) سياسات خصوصية خاصة بها على مواقعها.',
    ] },
    { h: 'التواصل', p: [`المكرمة، المدينة المنورة، المملكة العربية السعودية. البريد: ${CONTACT}`] },
  ],
};

export default function Privacy() {
  return <LegalPage path="/privacy" seoTitle="Privacy policy | Al Mukarramah" seoDescription="How Al Mukarramah collects, uses and protects your personal data." en={en} ar={ar} />;
}
