const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Convert ? placeholders to $1, $2, ...
function pg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function dbGet(sql, params = []) {
  const result = await pool.query(pg(sql), params);
  return result.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const result = await pool.query(pg(sql), params);
  return result.rows;
}

async function dbRun(sql, params = []) {
  const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
  const finalSql = isInsert ? sql + ' RETURNING id' : sql;
  const result = await pool.query(pg(finalSql), params);
  return { lastInsertRowid: result.rows[0]?.id || null, changes: result.rowCount };
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'inspector',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS extintores (
      id SERIAL PRIMARY KEY,
      torre_pav_anexo TEXT,
      tipo TEXT,
      local TEXT,
      num_extintor TEXT NOT NULL,
      num_cilindro TEXT,
      data_ultima_recarga TEXT,
      data_prox_recarga TEXT,
      status_recarga TEXT,
      data_ultimo_teste TEXT,
      data_prox_teste TEXT,
      status_teste TEXT,
      sinalizacao_vertical TEXT,
      sinalizacao_horizontal TEXT,
      placas_corretas TEXT,
      observacoes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vistorias (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      inspector_name TEXT NOT NULL,
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vistoria_items (
      id SERIAL PRIMARY KEY,
      vistoria_id INTEGER NOT NULL,
      extintor_id INTEGER NOT NULL,
      resultado TEXT NOT NULL,
      observacoes TEXT,
      inspector_name TEXT,
      inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id),
      FOREIGN KEY (extintor_id) REFERENCES extintores(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tipos_extintor (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Default tipos
  const tiposDefault = ['CO2 4kg', 'CO2 6kg', 'PQS 4kg', 'PQS 6kg', 'Água 10L', 'Espuma 10L'];
  for (const t of tiposDefault) {
    await pool.query(
      'INSERT INTO tipos_extintor (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING',
      [t]
    );
  }

  // Default admin user
  const adminRow = await pool.query("SELECT id FROM users WHERE username = 'admin'");
  if (adminRow.rows.length === 0) {
    const hashed = await bcrypt.hash('1223', 10);
    await pool.query(
      'INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4)',
      ['Administrador', 'admin', hashed, 'admin']
    );
    console.log('Default admin user created (username: admin, password: 1223)');
  }

  console.log('Database initialized successfully.');
}

module.exports = { pool, dbGet, dbAll, dbRun, initDB };
