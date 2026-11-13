const { db, genId } = require('./db');
const { indexDocumentChunks } = require('./rag');

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM sites').get().cnt;
  if (count > 0) return;

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
}

module.exports = { seedIfEmpty };
