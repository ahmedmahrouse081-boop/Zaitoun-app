const { Router } = require('express');
const db = require('../db');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');

const router = Router();

const toBool = (v) => v === 'on' || v === '1' || v === true || v === 1;

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'images'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage });

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await db.query('SELECT * FROM admin_users WHERE username = $1', [username]);
  const admin = result.rows[0];
  if (admin && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.adminId = admin.id;
    req.session.adminName = admin.display_name;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'بيانات الدخول غير صحيحة' });
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

router.get('/', requireAdmin, async (req, res) => {
  const [
    totalR, pendingR, preparingR, completedR,
    revenueR, menuR, additionsR, recentR
  ] = await Promise.all([
    db.query('SELECT COUNT(*) as c FROM orders'),
    db.query("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'"),
    db.query("SELECT COUNT(*) as c FROM orders WHERE status = 'preparing'"),
    db.query("SELECT COUNT(*) as c FROM orders WHERE status = 'completed'"),
    db.query("SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE status != $1", ['cancelled']),
    db.query('SELECT COUNT(*) as c FROM menu_items'),
    db.query('SELECT COUNT(*) as c FROM additions'),
    db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5'),
  ]);

  const stats = {
    totalOrders: parseInt(totalR.rows[0].c),
    pendingOrders: parseInt(pendingR.rows[0].c),
    preparingOrders: parseInt(preparingR.rows[0].c),
    completedOrders: parseInt(completedR.rows[0].c),
    totalRevenue: parseFloat(revenueR.rows[0].total),
    menuItems: parseInt(menuR.rows[0].c),
    additions: parseInt(additionsR.rows[0].c),
    recentOrders: recentR.rows,
  };

  res.render('admin/dashboard', { stats });
});

router.get('/categories', requireAdmin, async (req, res) => {
  const result = await db.query(`
    SELECT c.*, (SELECT COUNT(*) FROM menu_items WHERE category_id = c.id) as item_count
    FROM categories c ORDER BY c.sort_order, c.name
  `);
  res.render('admin/categories', { categories: result.rows });
});

router.get('/categories/new', requireAdmin, (req, res) => {
  res.render('admin/category-form', { category: null });
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { name, sort_order } = req.body;
  await db.query('INSERT INTO categories (name, sort_order) VALUES ($1, $2)', [name, parseInt(sort_order) || 0]);
  res.redirect('/admin/categories');
});

router.get('/categories/:id/edit', requireAdmin, async (req, res) => {
  const result = await db.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  const category = result.rows[0];
  if (!category) return res.redirect('/admin/categories');
  res.render('admin/category-form', { category });
});

router.post('/categories/:id', requireAdmin, async (req, res) => {
  const { name, sort_order } = req.body;
  await db.query('UPDATE categories SET name = $1, sort_order = $2 WHERE id = $3',
    [name, parseInt(sort_order) || 0, req.params.id]);
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.redirect('/admin/categories');
});

router.get('/menu-items', requireAdmin, async (req, res) => {
  const result = await db.query(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    ORDER BY c.sort_order, mi.name
  `);
  res.render('admin/menu-items', { items: result.rows });
});

router.get('/menu-items/new', requireAdmin, async (req, res) => {
  const [catR, addR] = await Promise.all([
    db.query('SELECT * FROM categories ORDER BY sort_order, name'),
    db.query('SELECT * FROM additions ORDER BY name'),
  ]);
  res.render('admin/item-form', { item: null, categories: catR.rows, allAdditions: addR.rows, selectedAdditions: [] });
});

router.post('/menu-items', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, description, base_price, category_id, available, additions: selectedAdditions } = req.body;
  let image = null;
  if (req.file) image = '/images/' + req.file.filename;

  const itemResult = await db.query(
    'INSERT INTO menu_items (category_id, name, description, base_price, image, available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [category_id, name, description, parseFloat(base_price), image, toBool(available)]
  );
  const itemId = itemResult.rows[0].id;

  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const aid of ids) {
      await db.query('INSERT INTO item_additions (item_id, addition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [itemId, aid]);
    }
  }

  res.redirect('/admin/menu-items');
});

router.get('/menu-items/:id/edit', requireAdmin, async (req, res) => {
  const [itemR, catR, addR, selR] = await Promise.all([
    db.query('SELECT * FROM menu_items WHERE id = $1', [req.params.id]),
    db.query('SELECT * FROM categories ORDER BY sort_order, name'),
    db.query('SELECT * FROM additions ORDER BY name'),
    db.query('SELECT addition_id FROM item_additions WHERE item_id = $1', [req.params.id]),
  ]);
  const item = itemR.rows[0];
  if (!item) return res.redirect('/admin/menu-items');
  res.render('admin/item-form', {
    item,
    categories: catR.rows,
    allAdditions: addR.rows,
    selectedAdditions: selR.rows.map(r => r.addition_id),
  });
});

router.post('/menu-items/:id', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, description, base_price, category_id, available, additions: selectedAdditions } = req.body;
  let sql = 'UPDATE menu_items SET name = $1, description = $2, base_price = $3, category_id = $4, available = $5';
  const params = [name, description, parseFloat(base_price), category_id, toBool(available)];
  let idx = 6;

  if (req.file) {
    sql += `, image = $${idx++}`;
    params.push('/images/' + req.file.filename);
  }

  sql += ` WHERE id = $${idx}`;
  params.push(req.params.id);

  await db.query(sql, params);
  await db.query('DELETE FROM item_additions WHERE item_id = $1', [req.params.id]);

  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const aid of ids) {
      await db.query('INSERT INTO item_additions (item_id, addition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, aid]);
    }
  }

  res.redirect('/admin/menu-items');
});

router.post('/menu-items/:id/delete', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM item_additions WHERE item_id = $1', [req.params.id]);
  await db.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
  res.redirect('/admin/menu-items');
});

router.get('/additions', requireAdmin, async (req, res) => {
  const result = await db.query(`
    SELECT a.*, (SELECT COUNT(*) FROM item_additions WHERE addition_id = a.id) as item_count
    FROM additions a ORDER BY a.name
  `);
  res.render('admin/additions', { additions: result.rows });
});

router.get('/additions/new', requireAdmin, (req, res) => {
  res.render('admin/addition-form', { addition: null });
});

router.post('/additions', requireAdmin, async (req, res) => {
  const { name, price } = req.body;
  await db.query('INSERT INTO additions (name, price) VALUES ($1, $2)', [name, parseFloat(price) || 0]);
  res.redirect('/admin/additions');
});

router.get('/additions/:id/edit', requireAdmin, async (req, res) => {
  const result = await db.query('SELECT * FROM additions WHERE id = $1', [req.params.id]);
  const addition = result.rows[0];
  if (!addition) return res.redirect('/admin/additions');
  res.render('admin/addition-form', { addition });
});

router.post('/additions/:id', requireAdmin, async (req, res) => {
  const { name, price, available } = req.body;
  await db.query('UPDATE additions SET name = $1, price = $2, available = $3 WHERE id = $4',
    [name, parseFloat(price) || 0, toBool(available), req.params.id]);
  res.redirect('/admin/additions');
});

router.post('/additions/:id/delete', requireAdmin, async (req, res) => {
  await db.query('DELETE FROM item_additions WHERE addition_id = $1', [req.params.id]);
  await db.query('DELETE FROM additions WHERE id = $1', [req.params.id]);
  res.redirect('/admin/additions');
});

router.get('/orders', requireAdmin, async (req, res) => {
  const statusFilter = req.query.status || 'all';
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (statusFilter !== 'all') {
    sql += ' WHERE status = $1';
    params.push(statusFilter);
  }
  sql += ' ORDER BY created_at DESC';
  const orderR = await db.query(sql, params);
  const orders = orderR.rows;

  for (const order of orders) {
    const itemsR = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    order.items = itemsR.rows;
    for (const item of order.items) {
      const addsR = await db.query('SELECT * FROM order_item_additions WHERE order_item_id = $1', [item.id]);
      item.additions = addsR.rows;
    }
  }

  res.render('admin/orders', { orders, statusFilter });
});

router.post('/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  await db.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
  res.redirect('/admin/orders');
});

router.get('/settings', requireAdmin, async (req, res) => {
  const result = await db.query('SELECT * FROM settings ORDER BY key');
  const settings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  res.render('admin/settings', { settings });
});

router.post('/settings', requireAdmin, async (req, res) => {
  const allowed = [
    'site_name', 'site_tagline',
    'hero_title', 'hero_subtitle', 'hero_desc',
    'feature_1_title', 'feature_1_desc',
    'feature_2_title', 'feature_2_desc',
    'feature_3_title', 'feature_3_desc',
    'about_title', 'about_desc_1', 'about_desc_2',
    'footer_desc',
    'contact_phone', 'contact_email', 'contact_address',
    'hours_weekdays', 'hours_friday',
  ];
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        await client.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [key, req.body[key]]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  res.redirect('/admin/settings');
});

module.exports = router;
