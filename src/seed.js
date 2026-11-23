const { db, genId } = require('./db');
const { indexDocumentChunks } = require('./rag');

/**
 * Seeds English showcase dental & medspa demo clinics idempotently so
 * live interactive widgets and smart search work out-of-the-box on existing DBs too.
 */
function seedShowcaseClinics() {
  const insSite = db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, strict_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insDoc = db.prepare(
    'INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insFaq = db.prepare(
    'INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)'
  );
  const insProd = db.prepare(
    'INSERT INTO live_products (id, site_id, sku, name, category, price, old_price, currency, stock, url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // Showcase 1: Aurelia Cosmetic Dental Miami
  if (!db.prepare('SELECT id FROM sites WHERE id = ?').get('site_dental_demo')) {
    const dentalId = 'site_dental_demo';
    insSite.run(
      dentalId,
      'Aurelia Cosmetic Dental Miami',
      'aureliasmile.com',
      'sm_live_dental_98a1c402',
      'Aurelia AI Concierge',
      'Hi! Welcome to Aurelia Cosmetic Dental Miami. Ask me about porcelain veneers, All-on-4 implants, Invisalign pricing, 0% financing, or booking a consultation 24/7.',
      '#000080',
      'bottom-right',
      'en',
      'You are the 24/7 AI Patient Concierge for Aurelia Cosmetic Dental Miami. Be concise, warm, and cite only verified clinic data and live treatment pricing.',
      1
    );

    const dDoc1 = genId('doc');
    const dDoc1Text = `Porcelain Veneers & Digital Smile Design at Aurelia Cosmetic Dental (Brickell, Miami):
Custom hand-layered E-max porcelain veneers are completed in just 2 visits over 7-10 days with our in-house master ceramist.
Every smile makeover begins with a 3D Digital Smile Design scan so you can preview your new smile before any prep work.
All-on-4 full arch dental implants include 3D CBCT imaging, sedation options, and same-day provisional teeth.`;
    insDoc.run(dDoc1, dentalId, 'Porcelain Veneers & Digital Smile Design Process', 'txt', 'https://aureliasmile.com/veneers', dDoc1Text);
    indexDocumentChunks(dentalId, dDoc1, dDoc1Text);

    const dDoc2 = genId('doc');
    const dDoc2Text = `Financing, Insurance & 24/7 After-Hours Booking:
Aurelia Cosmetic Dental offers 0% APR financing for up to 24 months through CareCredit and Cherry with instant soft-credit pre-qualification.
Most PPO dental plans (Delta Dental, Cigna, Aetna, MetLife) are accepted for restorative and implant procedures.
Our Brickell clinic is open Mon-Sat 8:00 AM - 7:00 PM, and our 24/7 AI Concierge books next-day priority consultations or virtual smile assessments overnight.`;
    insDoc.run(dDoc2, dentalId, '0% Financing, PPO Insurance & Hours', 'txt', 'https://aureliasmile.com/financing', dDoc2Text);
    indexDocumentChunks(dentalId, dDoc2, dDoc2Text);

    insFaq.run(genId('faq'), dentalId, 'How much do porcelain veneers cost?', 'Custom hand-layered E-max porcelain veneers start at $1,450 per tooth (regularly $1,650), with 0% APR monthly financing available through CareCredit and Cherry.', 'FAQ: Veneer Pricing');
    insFaq.run(genId('faq'), dentalId, 'Do you offer financing or payment plans?', 'Yes — we provide 0% APR financing for up to 24 months via CareCredit and Cherry, plus PPO insurance coordination for restorative and implant care.', 'FAQ: Financing');
    insFaq.run(genId('faq'), dentalId, 'Can I book an after-hours or virtual consultation?', 'Yes! Our AI Concierge captures your preferred time 24/7 and reserves complimentary 3D Digital Smile Design consult slots for the very next morning.', 'FAQ: Booking');

    insProd.run(genId('prd'), dentalId, 'VEN-POR-01', 'Porcelain Veneers (per tooth)', 'Cosmetic', 1450, 1650, '$', 12, 'https://aureliasmile.com/veneers', 'Hand-layered E-max ceramic veneers in 2 visits');
    insProd.run(genId('prd'), dentalId, 'IMP-ALL-04', 'All-on-4 Full Arch Implants', 'Implants', 18500, 21000, '$', 4, 'https://aureliasmile.com/implants', 'Includes 3D CBCT scan, implants, and same-day arch');
    insProd.run(genId('prd'), dentalId, 'INV-FULL-01', 'Invisalign Complete Package', 'Orthodontics', 4800, 5400, '$', 8, 'https://aureliasmile.com/invisalign', '3D iTero scan, all aligners, and retainers included');
    insProd.run(genId('prd'), dentalId, 'CON-SMILE-00', '3D Digital Smile Design Consult', 'Consultation', 0, 250, '$', 20, 'https://aureliasmile.com/consult', 'Complimentary smile preview & treatment roadmap');
  }

  // Showcase 2: Lumiere MedSpa Midtown NYC
  if (!db.prepare('SELECT id FROM sites WHERE id = ?').get('site_medspa_demo')) {
    const spaId = 'site_medspa_demo';
    insSite.run(
      spaId,
      'Lumiere MedSpa Midtown NYC',
      'lumieremedspa.nyc',
      'sm_live_medspa_98b2d511',
      'Lumiere AI Concierge',
      'Hi! Welcome to Lumiere MedSpa NYC. Ask about Morpheus8, Botox, lip fillers, downtime, package pricing, or book an evening consultation 24/7.',
      '#0f766e',
      'bottom-right',
      'en',
      'You are the 24/7 AI Concierge for Lumiere MedSpa Midtown NYC. Answer concisely using verified clinic protocols and live treatment rates.',
      1
    );

    const sDoc1 = genId('doc');
    const sDoc1Text = `Morpheus8 RF Microneedling & Injectable Protocols (Midtown Manhattan, E 52nd St):
All injectable and laser procedures at Lumiere MedSpa are performed or supervised on-site by board-certified medical providers.
Morpheus8 RF microneedling tightens jawline, neck, and under-eye skin with only 24-48 hours of mild redness (social downtime). Results build over 3-6 weeks.
Botox Cosmetic and dermal fillers (Juvederm, Restylane) take 20-30 minutes with zero downtime; clients can return to work immediately.`;
    insDoc.run(sDoc1, spaId, 'Morpheus8 Downtime & Injectable Protocols', 'txt', 'https://lumieremedspa.nyc/morpheus8', sDoc1Text);
    indexDocumentChunks(spaId, sDoc1, sDoc1Text);

    const sDoc2 = genId('doc');
    const sDoc2Text = `Evening Hours, Packages & 24/7 Booking Policy:
Lumiere MedSpa Midtown is open Mon-Fri 9:00 AM - 8:00 PM and Sat-Sun 10:00 AM - 6:00 PM.
You can safely combine Botox and Morpheus8 in the same treatment plan (our provider sequences them for optimal lift).
No upfront deposit is required to reserve a complimentary aesthetic consultation 24/7.`;
    insDoc.run(sDoc2, spaId, 'Evening Hours & Combined Treatments', 'txt', 'https://lumieremedspa.nyc/booking', sDoc2Text);
    indexDocumentChunks(spaId, sDoc2, sDoc2Text);

    insFaq.run(genId('faq'), spaId, 'What is the downtime for Morpheus8?', 'Morpheus8 has minimal downtime: expect 24-48 hours of mild redness and warmth (similar to a light sunburn), and makeup can typically be worn after 24 hours.', 'FAQ: Morpheus8 Downtime');
    insFaq.run(genId('faq'), spaId, 'How much is Botox per unit?', 'Botox Cosmetic at Lumiere MedSpa Midtown is $14 per unit with transparent dosing and zero hidden studio fees.', 'FAQ: Botox Pricing');
    insFaq.run(genId('faq'), spaId, 'Can I combine Morpheus8 and Botox?', 'Yes! Many NYC clients combine Morpheus8 skin tightening with Botox or fillers; our medical provider sequences them safely during your visit.', 'FAQ: Combos');

    insProd.run(genId('prd'), spaId, 'MED-MOR-08', 'Morpheus8 Full Face & Neck', 'Skin Tightening', 950, 1150, '$', 10, 'https://lumieremedspa.nyc/morpheus8', 'RF microneedling for collagen & jawline lift');
    insProd.run(genId('prd'), spaId, 'MED-BOT-20', 'Botox Cosmetic (per unit)', 'Injectables', 14, null, '$', 50, 'https://lumieremedspa.nyc/botox', 'Forehead, frown lines, crow’s feet — zero downtime');
    insProd.run(genId('prd'), spaId, 'MED-FIL-01', 'Juvederm / Restylane Lip Filler', 'Injectables', 750, 850, '$', 15, 'https://lumieremedspa.nyc/fillers', 'Natural-looking hydration & symmetry (1 full syringe)');
    insProd.run(genId('prd'), spaId, 'MED-PDO-01', 'PDO Thread Lift Package', 'Lifting', 1800, 2100, '$', 6, 'https://lumieremedspa.nyc/threads', 'Non-surgical brow & mid-face contour lift');
  }
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM sites').get().cnt;
  if (count > 0) {
    seedShowcaseClinics();
    return;
  }

  // Site 1: NordicTech Store (Ukraine & Europe E-Commerce)
  const site1 = 'site_nordic_tech';
  db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, strict_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    site1,
    'NordicTech UA & EU',
    'nordictech.eu',
    'sm_live_nordic_8842a1f9',
    'Консультант NordicTech',
    'Вітаємо! Помогу подобрать технику, проверить актуальную цену в € / ₴ и наличие, а также оформить доставку по Украине и Европе.',
    '#0284c7',
    'bottom-right',
    'ru',
    'Ты — AI-консультант магазина электроники NordicTech (Украина и ЕС). Цены и наличие бери только из Live API. Не выдумывай скидки.',
    1
  );

  const doc1 = genId('doc');
  const doc1Text = `Доставка и оплата в NordicTech UA & EU:
Доставка по Украине (Киев, Львов, Одесса, Днепр, Харьков) службой Нова Пошта занимает 1–2 рабочих дня. При заказе от 150 € доставка бесплатная, иначе — 4 €.
Доставка по странам ЕС (Варшава, Берлин, Прага, Вильнюс) через DHL Express занимает 2–4 рабочих дня.
Шоурум и пункт самовывоза в Киеве: ул. Крещатик, 24, ежедневно с 10:00 до 21:00.
Оплата: Visa, Mastercard, Apple Pay, Google Pay, Monobank / Приват24 и SEPA-перевод для компаний ЕС.`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc1, site1, 'Условия доставки по Украине и ЕС', 'txt', 'https://nordictech.eu/delivery', doc1Text);
  indexDocumentChunks(site1, doc1, doc1Text);

  const doc2 = genId('doc');
  const doc2Text = `Гарантия и возврат:
На всю технику NordicTech действует официальная европейская гарантия 24 месяца.
Возврат товара надлежащего качества возможен в течение 14 дней по законодательству Украины и ЕС при сохранении упаковки и чека.
Для оформления заказа нажмите «Подтвердить заказ» в чате или назовите артикул (SKU).`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc2, site1, 'Гарантия 24 мес. и возврат', 'txt', 'https://nordictech.eu/warranty', doc2Text);
  indexDocumentChunks(site1, doc2, doc2Text);

  db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
    .run(genId('faq'), site1, 'Какие способы оплаты доступны?', 'Мы принимаем Visa, Mastercard, Apple Pay, Google Pay, Monobank / Приват24 и SEPA-перевод для юрлиц в ЕС.', 'FAQ: Оплата');
  db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
    .run(genId('faq'), site1, 'Где находится шоурум и пункт самовывоза?', 'Шоурум NordicTech находится в Киеве по адресу: ул. Крещатик, 24. Работаем ежедневно с 10:00 до 21:00.', 'FAQ: Самовывоз');

  const prods1 = [
    ['NT-LAP-14', 'Ноутбук NordicBook Pro 14', 'Ноутбуки', 1190, 1290, '€', 12, 'https://nordictech.eu/p/nordicbook-pro-14', '14" IPS, 16 ГБ RAM, 512 ГБ SSD'],
    ['NT-AUD-02', 'Наушники ArcticSound ANC', 'Аудио', 169, 199, '€', 28, 'https://nordictech.eu/p/arcticsound-anc', 'Активное шумоподавление, 40 ч автономности'],
    ['NT-MON-27', 'Монитор GlacioView 27 4K', 'Мониторы', 449, null, '€', 5, 'https://nordictech.eu/p/glacioview-27', '27" 4K UHD IPS, USB-C 90W'],
    ['NT-KEY-01', 'Клавиатура FrostKey Mechanical', 'Периферия', 95, null, '€', 0, 'https://nordictech.eu/p/frostkey-mech', 'Беспроводная механика, Hot-Swap'],
  ];
  const insProd = db.prepare('INSERT INTO live_products (id, site_id, sku, name, category, price, old_price, currency, stock, url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const p of prods1) {
    insProd.run(genId('prd'), site1, ...p);
  }

  // Site 2: ArcticMed Europe (Isolated tenant!)
  const site2 = 'site_arctic_clinic';
  db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, strict_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    site2,
    'ArcticMed Europe',
    'arcticmed.eu',
    'sm_live_clinic_7710c2b4',
    'Ассистент ArcticMed',
    'Добрый день! Подскажу стоимость приёма врачей в €, подготовку к анализам и свободное время в клиниках Киева и Варшавы.',
    '#0369a1',
    'bottom-right',
    'ru',
    'Ты — AI-ассистент европейской клиники ArcticMed. Не ставь диагнозы, называй только подтверждённые цены на услуги.',
    1
  );

  const doc3 = genId('doc');
  const doc3Text = `Режим работы клиник ArcticMed:
Отделения открыты ежедневно с 08:00 до 21:00 в Киеве (ул. Саксаганского, 42) и Варшаве (ul. Marszałkowska 42).
Запись на МРТ и УЗИ проводится предварительно. Перед сдачей крови рекомендуется приходить натощак (8–12 часов без еды).`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc3, site2, 'Филиалы в Киеве и Варшаве, правила приёма', 'txt', 'https://arcticmed.eu/rules', doc3Text);
  indexDocumentChunks(site2, doc3, doc3Text);

  insProd.run(genId('prd'), site2, 'MED-CONS-01', 'Первичный приём терапевта', 'Консультации', 85, null, '€', 9, 'https://arcticmed.eu/s/therapist', 'Осмотр, сбор анамнеза, план обследования');
  insProd.run(genId('prd'), site2, 'MED-MRI-02', 'МРТ головного мозга', 'Диагностика', 180, 210, '€', 4, 'https://arcticmed.eu/s/mri-brain', 'Высокопольный томограф 1.5 Тесла');

  seedShowcaseClinics();
}

module.exports = { seedIfEmpty, seedShowcaseClinics };
