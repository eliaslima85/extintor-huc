const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { getDB, initDB } = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'huc-extintor-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middlewares
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// =====================
// AUTH ROUTES
// =====================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  req.session.user = { id: user.id, name: user.name, username: user.username, role: user.role };
  res.json({ success: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// =====================
// EXTINTORES ROUTES
// =====================

app.get('/api/extintores/search', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  const db = getDB();
  const like = `%${q.trim()}%`;
  const rows = db.prepare(
    'SELECT * FROM extintores WHERE num_extintor LIKE ? OR num_cilindro LIKE ? ORDER BY num_extintor LIMIT 20'
  ).all(like, like);
  res.json(rows);
});

app.get('/api/extintores', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM extintores ORDER BY num_extintor').all();
  res.json(rows);
});

app.post('/api/extintores', requireAuth, (req, res) => {
  const {
    torre_pav_anexo, tipo, local, num_extintor, num_cilindro,
    data_ultima_recarga, data_prox_recarga, status_recarga,
    data_ultimo_teste, data_prox_teste, status_teste,
    sinalizacao_vertical, sinalizacao_horizontal, placas_corretas, observacoes
  } = req.body;

  if (!num_extintor) {
    return res.status(400).json({ error: 'Número do extintor é obrigatório' });
  }

  const db = getDB();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO extintores (
      torre_pav_anexo, tipo, local, num_extintor, num_cilindro,
      data_ultima_recarga, data_prox_recarga, status_recarga,
      data_ultimo_teste, data_prox_teste, status_teste,
      sinalizacao_vertical, sinalizacao_horizontal, placas_corretas,
      observacoes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const info = stmt.run(
    torre_pav_anexo || null, tipo || null, local || null,
    num_extintor, num_cilindro || null,
    data_ultima_recarga || null, data_prox_recarga || null, status_recarga || null,
    data_ultimo_teste || null, data_prox_teste || null, status_teste || null,
    sinalizacao_vertical || null, sinalizacao_horizontal || null, placas_corretas || null,
    observacoes || null, now, now
  );
  const created = db.prepare('SELECT * FROM extintores WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/extintores/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    torre_pav_anexo, tipo, local, num_extintor, num_cilindro,
    data_ultima_recarga, data_prox_recarga, status_recarga,
    data_ultimo_teste, data_prox_teste, status_teste,
    sinalizacao_vertical, sinalizacao_horizontal, placas_corretas, observacoes
  } = req.body;

  if (!num_extintor) {
    return res.status(400).json({ error: 'Número do extintor é obrigatório' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM extintores WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Extintor não encontrado' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE extintores SET
      torre_pav_anexo=?, tipo=?, local=?, num_extintor=?, num_cilindro=?,
      data_ultima_recarga=?, data_prox_recarga=?, status_recarga=?,
      data_ultimo_teste=?, data_prox_teste=?, status_teste=?,
      sinalizacao_vertical=?, sinalizacao_horizontal=?, placas_corretas=?,
      observacoes=?, updated_at=?
    WHERE id=?
  `).run(
    torre_pav_anexo || null, tipo || null, local || null,
    num_extintor, num_cilindro || null,
    data_ultima_recarga || null, data_prox_recarga || null, status_recarga || null,
    data_ultimo_teste || null, data_prox_teste || null, status_teste || null,
    sinalizacao_vertical || null, sinalizacao_horizontal || null, placas_corretas || null,
    observacoes || null, now, id
  );
  const updated = db.prepare('SELECT * FROM extintores WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/extintores/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const existing = db.prepare('SELECT id FROM extintores WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Extintor não encontrado' });
  db.prepare('DELETE FROM vistoria_items WHERE extintor_id = ?').run(id);
  db.prepare('DELETE FROM extintores WHERE id = ?').run(id);
  res.json({ success: true });
});

// =====================
// VISTORIAS ROUTES
// =====================

app.get('/api/vistorias', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT v.*, COUNT(vi.id) as item_count
    FROM vistorias v
    LEFT JOIN vistoria_items vi ON vi.vistoria_id = v.id
    GROUP BY v.id
    ORDER BY v.started_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/vistorias', requireAuth, (req, res) => {
  const { titulo, inspector_name } = req.body;
  if (!titulo || !inspector_name) {
    return res.status(400).json({ error: 'Título e nome do inspetor são obrigatórios' });
  }
  const db = getDB();
  const now = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO vistorias (titulo, inspector_name, user_id, status, started_at) VALUES (?,?,?,?,?)'
  ).run(titulo, inspector_name, req.session.user.id, 'em_andamento', now);
  const created = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.get('/api/vistorias/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const vistoria = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });

  const items = db.prepare(`
    SELECT vi.*, e.num_extintor, e.num_cilindro, e.torre_pav_anexo, e.tipo, e.local,
           e.status_recarga, e.status_teste
    FROM vistoria_items vi
    JOIN extintores e ON e.id = vi.extintor_id
    WHERE vi.vistoria_id = ?
    ORDER BY vi.inspected_at DESC
  `).all(id);

  const total = db.prepare('SELECT COUNT(*) as cnt FROM extintores').get().cnt;

  res.json({ ...vistoria, items, total_extintores: total });
});

app.post('/api/vistorias/:id/items', requireAuth, (req, res) => {
  const { id } = req.params;
  const { extintor_id, resultado, observacoes, inspector_name } = req.body;

  if (!extintor_id || !resultado) {
    return res.status(400).json({ error: 'Extintor e resultado são obrigatórios' });
  }

  const db = getDB();
  const vistoria = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  if (vistoria.status === 'finalizada') {
    return res.status(400).json({ error: 'Vistoria já finalizada' });
  }

  const now = new Date().toISOString();
  // Upsert: update if extintor already in this vistoria, otherwise insert
  const existing = db.prepare(
    'SELECT id FROM vistoria_items WHERE vistoria_id = ? AND extintor_id = ?'
  ).get(id, extintor_id);

  if (existing) {
    db.prepare(
      'UPDATE vistoria_items SET resultado=?, observacoes=?, inspector_name=?, inspected_at=? WHERE id=?'
    ).run(resultado, observacoes || null, inspector_name || req.session.user.name, now, existing.id);
    const updated = db.prepare('SELECT * FROM vistoria_items WHERE id = ?').get(existing.id);
    return res.json(updated);
  }

  const info = db.prepare(
    'INSERT INTO vistoria_items (vistoria_id, extintor_id, resultado, observacoes, inspector_name, inspected_at) VALUES (?,?,?,?,?,?)'
  ).run(id, extintor_id, resultado, observacoes || null, inspector_name || req.session.user.name, now);
  const created = db.prepare('SELECT * FROM vistoria_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.post('/api/vistorias/:id/finalizar', requireAuth, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const vistoria = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  const now = new Date().toISOString();
  db.prepare("UPDATE vistorias SET status='finalizada', finished_at=? WHERE id=?").run(now, id);
  const updated = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  res.json(updated);
});

app.post('/api/vistorias/:id/reabrir', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const vistoria = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  db.prepare("UPDATE vistorias SET status='em_andamento', finished_at=NULL WHERE id=?").run(id);
  const updated = db.prepare('SELECT * FROM vistorias WHERE id = ?').get(id);
  res.json(updated);
});

// =====================
// USUARIOS ROUTES
// =====================

app.get('/api/usuarios', requireAdmin, (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT id, name, username, role, created_at FROM users ORDER BY name').all();
  res.json(rows);
});

app.post('/api/usuarios', requireAdmin, (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }
  const db = getDB();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username já existe' });
  const hashed = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (name, username, password, role) VALUES (?,?,?,?)'
  ).run(name, username, hashed, role || 'inspector');
  const created = db.prepare('SELECT id, name, username, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/usuarios/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, username, password, role } = req.body;
  if (!name || !username) {
    return res.status(400).json({ error: 'Nome e usuário são obrigatórios' });
  }
  const db = getDB();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Check username uniqueness (excluding self)
  const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
  if (conflict) return res.status(409).json({ error: 'Username já existe' });

  if (password && password.trim()) {
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET name=?, username=?, password=?, role=? WHERE id=?').run(name, username, hashed, role || 'inspector', id);
  } else {
    db.prepare('UPDATE users SET name=?, username=?, role=? WHERE id=?').run(name, username, role || 'inspector', id);
  }
  const updated = db.prepare('SELECT id, name, username, role, created_at FROM users WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/usuarios/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.user.id) {
    return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
  }
  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// Change own password
app.post('/api/me/senha', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  const valid = bcrypt.compareSync(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, req.session.user.id);
  res.json({ success: true });
});

// Initialize DB and start server
initDB();
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
