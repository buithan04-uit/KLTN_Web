const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

let didLogInitialConnect = false;

pool.on('connect', () => {
    if (didLogInitialConnect) return;
    didLogInitialConnect = true;
    console.log('🐘 Database: Đã kết nối thành công (initial pool connection)');
});

pool.on('error', (err) => console.error('❌ Database Error:', err));

module.exports = pool;