const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'extintor_huc.db');

let db;

function getDB() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'inspector',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extintores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vistorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      inspector_name TEXT NOT NULL,
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS vistoria_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vistoria_id INTEGER NOT NULL,
      extintor_id INTEGER NOT NULL,
      resultado TEXT NOT NULL,
      observacoes TEXT,
      inspector_name TEXT,
      inspected_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id),
      FOREIGN KEY (extintor_id) REFERENCES extintores(id)
    );
  `);

  // Create default admin if not exists
  const adminExists = database.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!adminExists) {
    const hashed = bcrypt.hashSync('1223', 10);
    database.prepare(
      "INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)"
    ).run('Administrador', 'admin', hashed, 'admin');
    console.log('Default admin user created (username: admin, password: 1223)');
  }

  console.log('Database initialized successfully.');
  return database;
}

module.exports = { getDB, initDB };
