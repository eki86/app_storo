const db = require('../config/db');
const bcrypt = require('bcryptjs');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Unesite korisničko ime i lozinku.' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka.' });
    }

    const user = rows[0];
    const now = new Date();

    if (user.locked_until && new Date(user.locked_until) > now) {
      const remaining = Math.ceil((new Date(user.locked_until) - now) / 60000);
      return res.status(403).json({ error: `Nalog je zaključan. Pokušajte za ${remaining} min.` });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      const attempts = user.failed_attempts + 1;
      let lockedUntil = null;
      if (attempts >= MAX_ATTEMPTS) {
        lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60000);
      }
      await db.query('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockedUntil, user.id]);
      const left = MAX_ATTEMPTS - attempts;
      return res.status(401).json({ error: left > 0 ? `Pogrešna lozinka. Preostalo pokušaja: ${left}` : `Nalog zaključan na ${LOCK_MINUTES} minuta.` });
    }

    await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Greška na serveru.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('adtrack_sid');
    res.json({ success: true });
  });
};

exports.me = (req, res) => {
  if (req.session.userId) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
};
