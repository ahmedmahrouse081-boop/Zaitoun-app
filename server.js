const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'zaitoun-secret-key-change-in-production',
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: 'lax',
}));

app.use(async (req, res, next) => {
  res.locals.adminName = req.session.adminName || null;
  res.locals.cartCount = req.session.cart ? req.session.cart.reduce((s, i) => s + i.quantity, 0) : 0;
  try {
    const db = require('./db');
    const result = await db.query('SELECT * FROM settings');
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.locals.settings = settings;
  } catch {
    res.locals.settings = {};
  }
  next();
});

app.use('/', customerRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zaitoun Restaurant app running at http://localhost:${PORT}`);
  });
}

module.exports = app;
