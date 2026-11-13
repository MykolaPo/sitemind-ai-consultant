const { db, genId } = require('./db');
const { indexDocumentChunks } = require('./rag');

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM sites').get().cnt;
  if (count > 0) return;

  // Site 1: NordicTech Store (E-Commerce)
  const site1 = 'site_nordic_tech';
  db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, strict_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    site1,
    'NordicTech Store',
    'nordictech.example.com',
    'sm_live_nordic_8842a1f9',
    'Консультант NordicTech',
    'Здравствуйте! Помогу подобрать технику, проверить актуальную цену и наличие, а также расскажу о доставке и гарантии.',
    '#0284c7',
    'bottom-right',
    'ru',
    'Ты — AI-консультант магазина электроники NordicTech. Цены и наличие бери только из Live API. Не выдумывай скидки.',
    1
  );

  const doc1 = genId('doc');
  const doc1Text = `Доставка и оплата в NordicTech Store:
Курьерская доставка по Москве и Санкт-Петербургу занимает 1–2 рабочих дня. При заказе от 15 000 ₽ доставка бесплатная, иначе — 490 ₽.
Самовывоз из шоурума на Арбате, д. 18 доступен ежедневно с 10:00 до 21:00 бесплатно.
Оплата принимается банковскими картами (Мир, Visa, Mastercard), через СБП и по счёту для юридических лиц.`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc1, site1, 'Условия доставки и оплаты', 'txt', 'https://nordictech.example.com/delivery', doc1Text);
  indexDocumentChunks(site1, doc1, doc1Text);

  const doc2 = genId('doc');
  const doc2Text = `Гарантия и возврат:
На всю технику NordicTech действует официальная гарантия 24 месяца.
Возврат товара надлежащего качества возможен в течение 14 дней при сохранении упаковки и чека.
Для оформления заказа добавьте товар в корзину на сайте или назовите артикул (SKU) менеджеру.`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc2, site1, 'Гарантия, возврат и оформление заказа', 'txt', 'https://nordictech.example.com/warranty', doc2Text);
  indexDocumentChunks(site1, doc2, doc2Text);

  db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
    .run(genId('faq'), site1, 'Какие способы оплаты доступны?', 'Мы принимаем банковские карты (Мир, Visa, Mastercard), СБП и оплату по счёту для юрлиц.', 'FAQ: Оплата');
  db.prepare('INSERT INTO faqs (id, site_id, question, answer, source_label) VALUES (?, ?, ?, ?, ?)')
    .run(genId('faq'), site1, 'Где находится шоурум и пункт самовывоза?', 'Шоурум NordicTech находится по адресу: ул. Арбат, д. 18. Работаем ежедневно с 10:00 до 21:00.', 'FAQ: Самовывоз');

  const prods1 = [
    ['NT-LAP-14', 'Ноутбук NordicBook Pro 14', 'Ноутбуки', 114900, 124900, '₽', 12, 'https://nordictech.example.com/p/nordicbook-pro-14', '14" IPS, 16 ГБ RAM, 512 ГБ SSD'],
    ['NT-AUD-02', 'Наушники ArcticSound ANC', 'Аудио', 14900, 17900, '₽', 28, 'https://nordictech.example.com/p/arcticsound-anc', 'Активное шумоподавление, 40 ч автономности'],
    ['NT-MON-27', 'Монитор GlacioView 27 4K', 'Мониторы', 42500, null, '₽', 5, 'https://nordictech.example.com/p/glacioview-27', '27" 4K UHD IPS, USB-C 90W'],
    ['NT-KEY-01', 'Клавиатура FrostKey Mechanical', 'Периферия', 8900, null, '₽', 0, 'https://nordictech.example.com/p/frostkey-mech', 'Беспроводная механика, Hot-Swap'],
  ];
  const insProd = db.prepare('INSERT INTO live_products (id, site_id, sku, name, category, price, old_price, currency, stock, url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const p of prods1) {
    insProd.run(genId('prd'), site1, ...p);
  }

  // Site 2: ArcticMed Clinic (Isolated tenant!)
  const site2 = 'site_arctic_clinic';
  db.prepare(`
    INSERT INTO sites (id, name, domain, api_key, widget_title, widget_welcome, widget_color, widget_position, language, system_prompt, strict_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    site2,
    'ArcticMed Clinic',
    'arcticmed.example.com',
    'sm_live_clinic_7710c2b4',
    'Ассистент ArcticMed',
    'Добрый день! Подскажу стоимость приёма врачей, подготовку к анализам и свободное время для записи.',
    '#0369a1',
    'bottom-right',
    'ru',
    'Ты — AI-ассистент клиники ArcticMed. Не ставь диагнозы, называй только подтверждённые цены на услуги.',
    1
  );

  const doc3 = genId('doc');
  const doc3Text = `Режим работы клиники ArcticMed:
Клиника открыта ежедневно с 08:00 до 21:00 по адресу: пр. Мира, 42.
Запись на МРТ и УЗИ проводится предварительно. Перед сдачей крови рекомендуется приходить натощак (8–12 часов без еды).`;
  db.prepare('INSERT INTO knowledge_docs (id, site_id, title, source_type, source_url, raw_content) VALUES (?, ?, ?, ?, ?, ?)')
    .run(doc3, site2, 'Правила приёма и подготовка', 'txt', 'https://arcticmed.example.com/rules', doc3Text);
  indexDocumentChunks(site2, doc3, doc3Text);

  insProd.run(genId('prd'), site2, 'MED-CONS-01', 'Первичный приём терапевта', 'Консультации', 3200, null, '₽', 9, 'https://arcticmed.example.com/s/therapist', 'Осмотр, сбор анамнеза, план обследования');
  insProd.run(genId('prd'), site2, 'MED-MRI-02', 'МРТ головного мозга', 'Диагностика', 6800, 7500, '₽', 4, 'https://arcticmed.example.com/s/mri-brain', 'Высокопольный томограф 1.5 Тесла');
}

module.exports = { seedIfEmpty };
