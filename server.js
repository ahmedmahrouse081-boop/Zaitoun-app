const express = require('express');
const session = require('express-session');
const path = require('path');
const SQLiteStore = require('connect-sqlite3')(session);
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: 'zaitoun-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  res.locals.adminName = req.session.adminName || null;
  res.locals.cartCount = req.session.cart ? req.session.cart.reduce((s, i) => s + i.quantity, 0) : 0;
  const rows = req.app.locals.settings ? req.app.locals.settings : [];
  const settings = {};
  if (req.app.locals.settings) {
    for (const row of req.app.locals.settings) {
      settings[row.key] = row.value;
    }
  }
  res.locals.settings = settings;
  next();
});

const db = require('./db');
app.locals.settings = db.prepare('SELECT * FROM settings').all();

app.use('/', customerRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`Zaitoun Restaurant app running at http://localhost:${PORT}`);
});
