const { Router } = require('express');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = Router();

const toBool = (v) => v === 'on' || v === '1' || v === true || v === 1;

router.get('/', async (req, res) => {
  const catResult = await db.query('SELECT c.* FROM categories c ORDER BY c.sort_order, c.name');
  const categories = catResult.rows;

  const itemResult = await db.query(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    WHERE mi.available = TRUE
    ORDER BY c.sort_order, mi.name
  `);
  const items = itemResult.rows;

  const grouped = {};
  for (const item of items) {
    if (!grouped[item.category_id]) {
      grouped[item.category_id] = {
        id: item.category_id,
        name: item.category_name,
        items: []
      };
    }
    grouped[item.category_id].items.push(item);
  }

  res.render('index', { categories: Object.values(grouped) });
});

router.get('/item/:id', async (req, res) => {
  const result = await db.query('SELECT * FROM menu_items WHERE id = $1 AND available = TRUE', [req.params.id]);
  const item = result.rows[0];
  if (!item) return res.redirect('/');

  const addResult = await db.query(`
    SELECT a.* FROM additions a
    JOIN item_additions ia ON ia.addition_id = a.id
    WHERE ia.item_id = $1 AND a.available = TRUE
    ORDER BY a.name
  `, [req.params.id]);

  res.render('customize', { item, additions: addResult.rows });
});

router.get('/cart', (req, res) => {
  res.render('cart', { cart: req.session.cart || [] });
});

router.post('/cart/add', async (req, res) => {
  const { itemId, quantity, additions: selectedAdditions } = req.body;
  const result = await db.query('SELECT * FROM menu_items WHERE id = $1 AND available = TRUE', [itemId]);
  const item = result.rows[0];
  if (!item) return res.status(400).json({ error: 'Item not found' });

  const addResult = await db.query(`
    SELECT a.* FROM additions a
    JOIN item_additions ia ON ia.addition_id = a.id
    WHERE ia.item_id = $1 AND a.available = TRUE
  `, [itemId]);

  const chosen = [];
  let additionsTotal = 0;
  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const id of ids) {
      const add = addResult.rows.find(a => a.id == id);
      if (add) {
        chosen.push(add);
        additionsTotal += parseFloat(add.price);
      }
    }
  }

  const unitPrice = parseFloat(item.base_price) + additionsTotal;

  if (!req.session.cart) req.session.cart = [];

  req.session.cart.push({
    id: Date.now() + Math.random(),
    itemId: item.id,
    itemName: item.name,
    quantity: parseInt(quantity) || 1,
    basePrice: parseFloat(item.base_price),
    additions: chosen,
    unitPrice,
  });

  res.redirect('/cart');
});

router.post('/cart/update', (req, res) => {
  const { id, quantity } = req.body;
  if (!req.session.cart) return res.redirect('/cart');
  const idx = req.session.cart.findIndex(c => c.id == id);
  if (idx !== -1) {
    req.session.cart[idx].quantity = Math.max(1, parseInt(quantity) || 1);
  }
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  const { id } = req.body;
  if (!req.session.cart) return res.redirect('/cart');
  req.session.cart = req.session.cart.filter(c => c.id != id);
  res.redirect('/cart');
});

router.get('/checkout', (req, res) => {
  if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');
  res.render('checkout', { cart: req.session.cart });
});

router.post('/checkout', async (req, res) => {
  const { customerName, customerPhone, notes } = req.body;
  if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');

  const orderId = uuidv4().slice(0, 8).toUpperCase();
  const subtotal = req.session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalPrice = subtotal;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO orders (id, customer_name, customer_phone, notes, subtotal, total_price, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [orderId, customerName, customerPhone, notes || '', subtotal, totalPrice, 'pending']
    );
    for (const cartItem of req.session.cart) {
      const itemResult = await client.query(
        'INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [orderId, cartItem.itemId, cartItem.itemName, cartItem.quantity, cartItem.unitPrice]
      );
      const orderItemId = itemResult.rows[0].id;
      for (const add of cartItem.additions) {
        await client.query(
          'INSERT INTO order_item_additions (order_item_id, addition_name, addition_price) VALUES ($1, $2, $3)',
          [orderItemId, add.name, add.price]
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

  req.session.cart = [];
  res.redirect(`/order/${orderId}`);
});

router.get('/order/:id', async (req, res) => {
  const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const order = orderResult.rows[0];
  if (!order) return res.redirect('/');

  const itemsResult = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const items = itemsResult.rows;
  for (const item of items) {
    const addsResult = await db.query('SELECT * FROM order_item_additions WHERE order_item_id = $1', [item.id]);
    item.additions = addsResult.rows;
  }

  res.render('order-confirmation', { order, items });
});

router.get('/track', (req, res) => {
  res.render('track');
});

router.post('/track', async (req, res) => {
  const result = await db.query('SELECT * FROM orders WHERE id = $1', [req.body.orderId]);
  const order = result.rows[0];
  if (!order) {
    return res.render('track', { error: 'الطلب غير موجود. تأكد من رقم الطلب.' });
  }
  const itemsResult = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const items = itemsResult.rows;
  for (const item of items) {
    const addsResult = await db.query('SELECT * FROM order_item_additions WHERE order_item_id = $1', [item.id]);
    item.additions = addsResult.rows;
  }
  res.render('track', { order, items });
});

module.exports = router;
