const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+02:00'
});

pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL konekcija OK');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL greška:', err.message);
  });

module.exports = pool;