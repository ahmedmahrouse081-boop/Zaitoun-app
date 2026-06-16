const { Router } = require('express');
const db = require('../db');
const bcrypt = require('bcryptjs');
const { requireAdmin } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');

const router = Router();

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

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (admin && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.adminId = admin.id;
    req.session.adminName = admin.display_name;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Invalid credentials' });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAdmin, (req, res) => {
  const stats = {
    totalOrders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    pendingOrders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c,
    preparingOrders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'preparing'").get().c,
    completedOrders: db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'completed'").get().c,
    totalRevenue: db.prepare('SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE status != ?').get('cancelled').total,
    menuItems: db.prepare('SELECT COUNT(*) as c FROM menu_items').get().c,
    additions: db.prepare('SELECT COUNT(*) as c FROM additions').get().c,
    recentOrders: db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5").all()
  };
  res.render('admin/dashboard', { stats });
});

router.get('/categories', requireAdmin, (req, res) => {
  const categories = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM menu_items WHERE category_id = c.id) as item_count FROM categories c ORDER BY c.sort_order, c.name').all();
  res.render('admin/categories', { categories });
});

router.get('/categories/new', requireAdmin, (req, res) => {
  res.render('admin/category-form', { category: null });
});

router.post('/categories', requireAdmin, (req, res) => {
  const { name, sort_order } = req.body;
  db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name, parseInt(sort_order) || 0);
  res.redirect('/admin/categories');
});

router.get('/categories/:id/edit', requireAdmin, (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!category) return res.redirect('/admin/categories');
  res.render('admin/category-form', { category });
});

router.post('/categories/:id', requireAdmin, (req, res) => {
  const { name, sort_order } = req.body;
  db.prepare('UPDATE categories SET name = ?, sort_order = ? WHERE id = ?').run(name, parseInt(sort_order) || 0, req.params.id);
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.redirect('/admin/categories');
});

router.get('/menu-items', requireAdmin, (req, res) => {
  const items = db.prepare(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    ORDER BY c.sort_order, mi.name
  `).all();
  res.render('admin/menu-items', { items });
});

router.get('/menu-items/new', requireAdmin, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  const allAdditions = db.prepare('SELECT * FROM additions ORDER BY name').all();
  res.render('admin/item-form', { item: null, categories, allAdditions, selectedAdditions: [] });
});

router.post('/menu-items', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, base_price, category_id, available, additions: selectedAdditions } = req.body;
  let image = null;
  if (req.file) image = '/images/' + req.file.filename;

  const insertItem = db.prepare('INSERT INTO menu_items (category_id, name, description, base_price, image, available) VALUES (?, ?, ?, ?, ?, ?)');
  const insertLink = db.prepare('INSERT OR IGNORE INTO item_additions (item_id, addition_id) VALUES (?, ?)');

  const result = insertItem.run(category_id, name, description, parseFloat(base_price), image, available ? 1 : 0);
  const itemId = result.lastInsertRowid;

  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const aid of ids) {
      insertLink.run(itemId, aid);
    }
  }

  res.redirect('/admin/menu-items');
});

router.get('/menu-items/:id/edit', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.redirect('/admin/menu-items');
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  const allAdditions = db.prepare('SELECT * FROM additions ORDER BY name').all();
  const selectedAdditions = db.prepare('SELECT addition_id FROM item_additions WHERE item_id = ?').all(req.params.id).map(r => r.addition_id);
  res.render('admin/item-form', { item, categories, allAdditions, selectedAdditions });
});

router.post('/menu-items/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, base_price, category_id, available, additions: selectedAdditions } = req.body;
  let sql = 'UPDATE menu_items SET name = ?, description = ?, base_price = ?, category_id = ?, available = ?';
  const params = [name, description, parseFloat(base_price), category_id, available ? 1 : 0];

  if (req.file) {
    sql += ', image = ?';
    params.push('/images/' + req.file.filename);
  }

  sql += ' WHERE id = ?';
  params.push(req.params.id);

  db.prepare(sql).run(...params);

  db.prepare('DELETE FROM item_additions WHERE item_id = ?').run(req.params.id);
  const insertLink = db.prepare('INSERT OR IGNORE INTO item_additions (item_id, addition_id) VALUES (?, ?)');
  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const aid of ids) {
      insertLink.run(req.params.id, aid);
    }
  }

  res.redirect('/admin/menu-items');
});

router.post('/menu-items/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM item_additions WHERE item_id = ?').run(req.params.id);
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.redirect('/admin/menu-items');
});

router.get('/additions', requireAdmin, (req, res) => {
  const additions = db.prepare('SELECT a.*, (SELECT COUNT(*) FROM item_additions WHERE addition_id = a.id) as item_count FROM additions a ORDER BY a.name').all();
  res.render('admin/additions', { additions });
});

router.get('/additions/new', requireAdmin, (req, res) => {
  res.render('admin/addition-form', { addition: null });
});

router.post('/additions', requireAdmin, (req, res) => {
  const { name, price } = req.body;
  db.prepare('INSERT INTO additions (name, price) VALUES (?, ?)').run(name, parseFloat(price) || 0);
  res.redirect('/admin/additions');
});

router.get('/additions/:id/edit', requireAdmin, (req, res) => {
  const addition = db.prepare('SELECT * FROM additions WHERE id = ?').get(req.params.id);
  if (!addition) return res.redirect('/admin/additions');
  res.render('admin/addition-form', { addition });
});

router.post('/additions/:id', requireAdmin, (req, res) => {
  const { name, price, available } = req.body;
  db.prepare('UPDATE additions SET name = ?, price = ?, available = ? WHERE id = ?').run(name, parseFloat(price) || 0, available ? 1 : 0, req.params.id);
  res.redirect('/admin/additions');
});

router.post('/additions/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM item_additions WHERE addition_id = ?').run(req.params.id);
  db.prepare('DELETE FROM additions WHERE id = ?').run(req.params.id);
  res.redirect('/admin/additions');
});

router.get('/orders', requireAdmin, (req, res) => {
  const statusFilter = req.query.status || 'all';
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (statusFilter !== 'all') {
    sql += ' WHERE status = ?';
    params.push(statusFilter);
  }
  sql += ' ORDER BY created_at DESC';
  const orders = db.prepare(sql).all(...params);

  for (const order of orders) {
    order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    for (const item of order.items) {
      item.additions = db.prepare('SELECT * FROM order_item_additions WHERE order_item_id = ?').all(item.id);
    }
  }

  res.render('admin/orders', { orders, statusFilter });
});

router.post('/orders/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/admin/orders');
});

// ─── Settings ───
router.get('/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings ORDER BY key').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.render('admin/settings', { settings });
});

router.post('/settings', requireAdmin, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
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
  const transaction = db.transaction(() => {
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        upsert.run(key, req.body[key]);
      }
    }
  });
  transaction();
  res.redirect('/admin/settings');
});

module.exports = router;
