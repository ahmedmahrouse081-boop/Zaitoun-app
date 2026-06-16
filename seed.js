const db = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Seeding Zaitoun database...');

  await db.query('DELETE FROM order_item_additions');
  await db.query('DELETE FROM order_items');
  await db.query('DELETE FROM orders');
  await db.query('DELETE FROM item_additions');
  await db.query('DELETE FROM additions');
  await db.query('DELETE FROM menu_items');
  await db.query('DELETE FROM categories');
  await db.query('DELETE FROM admin_users');
  await db.query('DELETE FROM settings');

  await db.query(
    'INSERT INTO admin_users (username, password_hash, display_name) VALUES ($1, $2, $3)',
    ['admin', bcrypt.hashSync('zaitoun123', 10), 'مدير زيتون']
  );

  // ─── Settings ───
  const settings = [
    ['site_name', 'زيتون'],
    ['site_tagline', 'مطعم مصري'],
    ['hero_title', 'زيتون'],
    ['hero_subtitle', 'فول - طعمية - فطار مصري - مشويات'],
    ['hero_desc', 'أشهى الأكلات المصرية الأصيلة. من الفول والطعمية إلى المشويات الساخنة — كل طبق يحكي حكاية.'],
    ['feature_1_title', 'مكونات طازجة'],
    ['feature_1_desc', 'نستخدم أجود المنتجات الطازجة يومياً. الفول يُطهى ببطء، والطعمية تُقلى عند الطلب، واللحوم طازجة دائماً.'],
    ['feature_2_title', 'وصفات تقليدية'],
    ['feature_2_desc', 'حكمة أجيال من الطهي المصري في كل قضمة. بهارات أصيلة، طرق تقليدية، طعم لا يُنسى.'],
    ['feature_3_title', 'توصيل سريع'],
    ['feature_3_desc', 'ساخن، طازج، وفي الوقت المحدد. نوصل لك الأكل المصري الشهي لباب البيت بسرعة وعناية.'],
    ['about_title', 'الطعام المصري، بروح عصرية'],
    ['about_desc_1', 'وُلد زيتون من شغفنا بالمطبخ المصري الأصيل. ننقل لك شوارع القاهرة النابضة بالحياة إلى مائدتك — من الفول المدمس الكريمي والطعمية المقرمشة إلى وجبات الفطار المصري الشهية والمشويات على الفحم.'],
    ['about_desc_2', 'كل طبق يُحضر بحب، باستخدام وصفات متوارثة وأفضل المكونات. سواء كنت ترغب في وجبة سريعة أو وليمة عائلية، زيتون يمنحك طعم مصر الذي لا يُنسى.'],
    ['footer_desc', 'الطعام المصري الأصيل — فول، طعمية، فطار مصري، مشويات. طازج، يُحضر بحب.'],
    ['contact_phone', '(02) 1234 5678'],
    ['contact_email', 'hello@zaitoun.eg'],
    ['contact_address', '٣٥ شارع النيل، القاهرة'],
    ['hours_weekdays', 'السبت - الخميس: ٨ ص - ١١ م'],
    ['hours_friday', 'الجمعة: ٢ م - ١١ م'],
  ];

  for (const [key, value] of settings) {
    await db.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, value]
    );
  }

  // ─── Categories ───
  const categories = [
    { name: 'سندوتشات', sort_order: 1 },
    { name: 'فراخ', sort_order: 2 },
    { name: 'مكرونة', sort_order: 3 },
    { name: 'وجبات', sort_order: 4 },
    { name: 'مشويات', sort_order: 5 },
    { name: 'مشروبات', sort_order: 6 },
  ];

  const catIds = {};
  for (const cat of categories) {
    const r = await db.query(
      'INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING id',
      [cat.name, cat.sort_order]
    );
    catIds[cat.name] = r.rows[0].id;
  }

  // ─── Additions ───
  const additions = [
    { name: 'جبنة إضافية', price: 1.50 },
    { name: 'لحم إضافي', price: 3.00 },
    { name: 'صوص إضافي', price: 0.75 },
    { name: 'مشروم', price: 1.25 },
    { name: 'بطاطس مقلية', price: 1.00 },
    { name: 'كاتشب', price: 0.00 },
    { name: 'مايونيز', price: 0.00 },
    { name: 'صوص ثومية', price: 0.50 },
    { name: 'صوص حار', price: 0.50 },
    { name: 'جبنة شيدر', price: 1.00 },
    { name: 'بيضة', price: 1.00 },
    { name: 'خبز إضافي', price: 0.75 },
  ];

  const addIds = {};
  for (const add of additions) {
    const r = await db.query(
      'INSERT INTO additions (name, price) VALUES ($1, $2) RETURNING id',
      [add.name, add.price]
    );
    addIds[add.name] = r.rows[0].id;
  }

  // ─── Menu Items ───
  const menuItems = [
    // سندوتشات
    { name: 'سندوتش فول', category: 'سندوتشات', description: 'فول مدمس بالزيت والليمون مع الطماطم والخيار', base_price: 3.50, additions: ['جبنة إضافية', 'صوص حار', 'صوص ثومية', 'خبز إضافي'] },
    { name: 'سندوتش طعمية', category: 'سندوتشات', description: 'طعمية مقلية ذهبية مع الطماطم والخيار والطحينة', base_price: 3.00, additions: ['جبنة إضافية', 'صوص حار', 'صوص ثومية', 'خبز إضافي'] },
    { name: 'سندوتش سجق', category: 'سندوتشات', description: 'سجق مصري مقلي مع الطماطم والفلفل الأخضر', base_price: 5.00, additions: ['جبنة إضافية', 'صوص حار', 'صوص ثومية', 'بيضة'] },
    { name: 'سندوتش كبدة', category: 'سندوتشات', description: 'كبدة اسكندراني مقلية مع الليمون والفلفل', base_price: 5.50, additions: ['جبنة إضافية', 'صوص حار', 'صوص ثومية', 'خبز إضافي'] },
    { name: 'سندوتش شاورما فراخ', category: 'سندوتشات', description: 'شاورما فراخ بالثومية والبطاطس والمخلل', base_price: 6.50, additions: ['جبنة إضافية', 'لحم إضافي', 'صوص إضافي', 'صوص حار'] },
    { name: 'سندوتش شاورما لحم', category: 'سندوتشات', description: 'شاورما لحم بالطحينة والبصل والمخلل', base_price: 7.00, additions: ['جبنة إضافية', 'لحم إضافي', 'صوص إضافي', 'صوص حار'] },

    // فراخ
    { name: 'نصف فرخة مشوية', category: 'فراخ', description: 'نصف فرخة مشوية على الفحم متبلة بالبهارات المصرية', base_price: 9.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },
    { name: 'فرخة كاملة مشوية', category: 'فراخ', description: 'فرخة كاملة مشوية على الفحم مع الأرز', base_price: 16.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },
    { name: 'أجنحة دجاج', category: 'فراخ', description: 'أجنحة دجاج مقلية مقرمشة مع صوص حلو وحار', base_price: 6.00, additions: ['صوص إضافي', 'صوص حار', 'مايونيز', 'كاتشب'] },
    { name: 'بانيه', category: 'فراخ', description: 'صدور دجاج بانيه مقلي مقرمش مع الأرز والسلطة', base_price: 8.00, additions: ['جبنة إضافية', 'بطاطس مقلية', 'صوص ثومية', 'صوص حار'] },
    { name: 'شيش طاووق', category: 'فراخ', description: 'أسياخ شيش طاووك مشوية على الفحم مع الخضار', base_price: 8.50, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },

    // مكرونة
    { name: 'مكرونة بشاميل', category: 'مكرونة', description: 'مكرونة بالبشاميل واللحم المفروم والجبنة', base_price: 7.00, additions: ['جبنة إضافية', 'جبنة شيدر', 'لحم إضافي', 'صوص إضافي'] },
    { name: 'مكرونة إسباجتي', category: 'مكرونة', description: 'إسباجتي بالصلصة الحمراء واللحم المفروم', base_price: 6.50, additions: ['جبنة إضافية', 'جبنة شيدر', 'لحم إضافي', 'صوص حار'] },
    { name: 'مكرونة بالنقانق', category: 'مكرونة', description: 'مكرونة بالصلصة الحمراء وشرائح النقانق', base_price: 6.00, additions: ['جبنة إضافية', 'جبنة شيدر', 'صوص حار', 'كاتشب'] },

    // وجبات
    { name: 'وجبة كشري', category: 'وجبات', description: 'كشري مصري أصلي — أرز، عدس، مكرونة، بصل مقرمش، صوص طماطم', base_price: 5.00, additions: ['صوص إضافي', 'صوص حار', 'خبز إضافي', 'بيضة'] },
    { name: 'وجبة فطار مصري', category: 'وجبات', description: 'فول، طعمية، بيض، جبنة، عيش بلدي، شاي', base_price: 8.00, additions: ['جبنة إضافية', 'بيضة', 'خبز إضافي', 'صوص حار'] },
    { name: 'وجبة حواوشي', category: 'وجبات', description: 'حواوشي لحم مفروم متبل في عيش بلدي مع البطاطس', base_price: 6.00, additions: ['جبنة إضافية', 'لحم إضافي', 'صوص حار', 'بطاطس مقلية'] },
    { name: 'وجبة كبسة', category: 'وجبات', description: 'كبسة دجاج مع أرز منكه بالبهارات العربية', base_price: 9.00, additions: ['لحم إضافي', 'صوص حار', 'خبز إضافي'] },
    { name: 'طبق فول مدمس', category: 'وجبات', description: 'فول مدمس بالزيت والليمون مع الطماطم والبصل', base_price: 4.00, additions: ['جبنة إضافية', 'بيضة', 'صوص حار', 'خبز إضافي'] },

    // مشويات
    { name: 'كفتة مشوية', category: 'مشويات', description: 'أسياخ كفتة لحم على الفحم مع الأرز والسلطة', base_price: 8.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },
    { name: 'كباب مشوي', category: 'مشويات', description: 'أسياخ كباب لحم مشوي على الفحم', base_price: 10.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },
    { name: 'مشكل مشويات', category: 'مشويات', description: 'تشكيلة مشويات (كفتة، كباب، شيش طاووق) مع الأرز', base_price: 14.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },
    { name: 'ريش كباب', category: 'مشويات', description: 'ريش كباب لحم ضأن مشوي على الفحم', base_price: 12.00, additions: ['بطاطس مقلية', 'صوص ثومية', 'صوص حار', 'خبز إضافي'] },

    // مشروبات
    { name: 'كولا', category: 'مشروبات', description: 'مشروب غازي بارد منعش', base_price: 1.50, additions: [] },
    { name: 'مياه معدنية', category: 'مشروبات', description: 'مياه معدنية ٥٠٠ مل', base_price: 1.00, additions: [] },
    { name: 'عصير برتقال طازج', category: 'مشروبات', description: 'عصير برتقال طازج', base_price: 3.00, additions: [] },
    { name: 'عصير ليمون بالنعناع', category: 'مشروبات', description: 'عصير ليمون منعش مع نعناع', base_price: 2.50, additions: [] },
    { name: 'شاي', category: 'مشروبات', description: 'شاي ساخن', base_price: 1.00, additions: [] },
    { name: 'قرفة', category: 'مشروبات', description: 'مشروب قرفة ساخن', base_price: 1.50, additions: [] },
  ];

  for (const item of menuItems) {
    const r = await db.query(
      'INSERT INTO menu_items (category_id, name, description, base_price, image, available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [catIds[item.category], item.name, item.description, item.base_price, null, true]
    );
    const itemId = r.rows[0].id;
    for (const addName of item.additions) {
      if (addIds[addName]) {
        await db.query(
          'INSERT INTO item_additions (item_id, addition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [itemId, addIds[addName]]
        );
      }
    }
  }

  console.log('Seed complete!');
  console.log('Admin login: admin / zaitoun123');
  console.log(`Created ${menuItems.length} menu items, ${additions.length} additions, ${categories.length} categories`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
