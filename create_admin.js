require('dotenv').config();
const db = require('./config/db');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const username = 'admin';
  const password = 'adtrack2024';
  const hash = await bcrypt.hash(password, 10);
  await db.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
  console.log('Admin kreiran: admin / adtrack2024');
  process.exit(0);
}

createAdmin().catch(console.error);
