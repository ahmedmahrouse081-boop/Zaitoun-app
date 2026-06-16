const { Router } = require('express');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = Router();

router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT c.* FROM categories c ORDER BY c.sort_order, c.name
  `).all();

  const items = db.prepare(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi
    JOIN categories c ON c.id = mi.category_id
    WHERE mi.available = 1
    ORDER BY c.sort_order, mi.name
  `).all();

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

router.get('/item/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(req.params.id);
  if (!item) return res.redirect('/');

  const additions = db.prepare(`
    SELECT a.* FROM additions a
    JOIN item_additions ia ON ia.addition_id = a.id
    WHERE ia.item_id = ? AND a.available = 1
    ORDER BY a.name
  `).all(req.params.id);

  res.render('customize', { item, additions });
});

router.get('/cart', (req, res) => {
  res.render('cart', { cart: req.session.cart || [] });
});

router.post('/cart/add', (req, res) => {
  const { itemId, quantity, additions: selectedAdditions } = req.body;
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(itemId);
  if (!item) return res.status(400).json({ error: 'Item not found' });

  const additions = db.prepare(`
    SELECT a.* FROM additions a
    JOIN item_additions ia ON ia.addition_id = a.id
    WHERE ia.item_id = ? AND a.available = 1
  `).all(itemId);

  const chosen = [];
  let additionsTotal = 0;
  if (selectedAdditions) {
    const ids = Array.isArray(selectedAdditions) ? selectedAdditions : [selectedAdditions];
    for (const id of ids) {
      const add = additions.find(a => a.id == id);
      if (add) {
        chosen.push(add);
        additionsTotal += add.price;
      }
    }
  }

  const unitPrice = item.base_price + additionsTotal;

  if (!req.session.cart) req.session.cart = [];

  req.session.cart.push({
    id: Date.now() + Math.random(),
    itemId: item.id,
    itemName: item.name,
    quantity: parseInt(quantity) || 1,
    basePrice: item.base_price,
    additions: chosen,
    unitPrice
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

router.post('/checkout', (req, res) => {
  const { customerName, customerPhone, notes } = req.body;
  if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');

  const orderId = uuidv4().slice(0, 8).toUpperCase();
  const subtotal = req.session.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalPrice = subtotal;

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer_name, customer_phone, notes, subtotal, total_price, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, item_id, item_name, quantity, unit_price)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertAddition = db.prepare(`
    INSERT INTO order_item_additions (order_item_id, addition_name, addition_price)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertOrder.run(orderId, customerName, customerPhone, notes, subtotal, totalPrice);
    for (const cartItem of req.session.cart) {
      const result = insertItem.run(orderId, cartItem.itemId, cartItem.itemName, cartItem.quantity, cartItem.unitPrice);
      const orderItemId = result.lastInsertRowid;
      for (const add of cartItem.additions) {
        insertAddition.run(orderItemId, add.name, add.price);
      }
    }
  });

  transaction();

  req.session.cart = [];

  res.redirect(`/order/${orderId}`);
});

router.get('/order/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/');

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  for (const item of items) {
    item.additions = db.prepare('SELECT * FROM order_item_additions WHERE order_item_id = ?').all(item.id);
  }

  res.render('order-confirmation', { order, items });
});

router.get('/track', (req, res) => {
  res.render('track');
});

router.post('/track', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.body.orderId);
  if (!order) {
    return res.render('track', { error: 'Order not found. Check your order ID.' });
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  for (const item of items) {
    item.additions = db.prepare('SELECT * FROM order_item_additions WHERE order_item_id = ?').all(item.id);
  }
  res.render('track', { order, items });
});

module.exports = router;
