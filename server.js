const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { dbGet, dbAll, dbRun, initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'huc-extintor-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
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

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  const valid = await bcrypt.compare(password, user.password);
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

app.get('/api/extintores/search', requireAuth, async (req, res) => {
  const q = req.query.q || '';
  if (!q.trim()) return res.json([]);
  const like = `%${q.trim()}%`;
  const rows = await dbAll(
    'SELECT * FROM extintores WHERE num_extintor LIKE ? OR num_cilindro LIKE ? ORDER BY num_extintor LIMIT 20',
    [like, like]
  );
  res.json(rows);
});

app.get('/api/extintores', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM extintores ORDER BY num_extintor', []);
  res.json(rows);
});

app.post('/api/extintores', requireAuth, async (req, res) => {
  const {
    torre_pav_anexo, tipo, local, num_extintor, num_cilindro,
    data_ultima_recarga, data_prox_recarga, status_recarga,
    data_ultimo_teste, data_prox_teste, status_teste,
    sinalizacao_vertical, sinalizacao_horizontal, placas_corretas, observacoes
  } = req.body;

  if (!num_extintor) {
    return res.status(400).json({ error: 'Número do extintor é obrigatório' });
  }

  const now = new Date().toISOString();
  const info = await dbRun(`
    INSERT INTO extintores (
      torre_pav_anexo, tipo, local, num_extintor, num_cilindro,
      data_ultima_recarga, data_prox_recarga, status_recarga,
      data_ultimo_teste, data_prox_teste, status_teste,
      sinalizacao_vertical, sinalizacao_horizontal, placas_corretas,
      observacoes, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [
    torre_pav_anexo || null, tipo || null, local || null,
    num_extintor, num_cilindro || null,
    data_ultima_recarga || null, data_prox_recarga || null, status_recarga || null,
    data_ultimo_teste || null, data_prox_teste || null, status_teste || null,
    sinalizacao_vertical || null, sinalizacao_horizontal || null, placas_corretas || null,
    observacoes || null, now, now
  ]);
  const created = await dbGet('SELECT * FROM extintores WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(created);
});

app.put('/api/extintores/:id', requireAuth, async (req, res) => {
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

  const existing = await dbGet('SELECT id FROM extintores WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Extintor não encontrado' });

  const now = new Date().toISOString();
  await dbRun(`
    UPDATE extintores SET
      torre_pav_anexo=?, tipo=?, local=?, num_extintor=?, num_cilindro=?,
      data_ultima_recarga=?, data_prox_recarga=?, status_recarga=?,
      data_ultimo_teste=?, data_prox_teste=?, status_teste=?,
      sinalizacao_vertical=?, sinalizacao_horizontal=?, placas_corretas=?,
      observacoes=?, updated_at=?
    WHERE id=?
  `, [
    torre_pav_anexo || null, tipo || null, local || null,
    num_extintor, num_cilindro || null,
    data_ultima_recarga || null, data_prox_recarga || null, status_recarga || null,
    data_ultimo_teste || null, data_prox_teste || null, status_teste || null,
    sinalizacao_vertical || null, sinalizacao_horizontal || null, placas_corretas || null,
    observacoes || null, now, id
  ]);
  const updated = await dbGet('SELECT * FROM extintores WHERE id = ?', [id]);
  res.json(updated);
});

app.delete('/api/extintores/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await dbGet('SELECT id FROM extintores WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Extintor não encontrado' });
  await dbRun('DELETE FROM vistoria_items WHERE extintor_id = ?', [id]);
  await dbRun('DELETE FROM extintores WHERE id = ?', [id]);
  res.json({ success: true });
});

// =====================
// VISTORIAS ROUTES
// =====================

app.get('/api/vistorias', requireAuth, async (req, res) => {
  const rows = await dbAll(`
    SELECT v.*, COUNT(vi.id) as item_count
    FROM vistorias v
    LEFT JOIN vistoria_items vi ON vi.vistoria_id = v.id
    GROUP BY v.id
    ORDER BY v.started_at DESC
  `, []);
  // COUNT(*) returns string in pg — coerce to number
  const mapped = rows.map(r => ({ ...r, item_count: parseInt(r.item_count, 10) }));
  res.json(mapped);
});

app.post('/api/vistorias', requireAuth, async (req, res) => {
  const { titulo, inspector_name } = req.body;
  if (!titulo || !inspector_name) {
    return res.status(400).json({ error: 'Título e nome do inspetor são obrigatórios' });
  }
  const now = new Date().toISOString();
  const info = await dbRun(
    'INSERT INTO vistorias (titulo, inspector_name, user_id, status, started_at) VALUES (?,?,?,?,?)',
    [titulo, inspector_name, req.session.user.id, 'em_andamento', now]
  );
  const created = await dbGet('SELECT * FROM vistorias WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(created);
});

app.get('/api/vistorias/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const vistoria = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });

  const items = await dbAll(`
    SELECT vi.*, e.num_extintor, e.num_cilindro, e.torre_pav_anexo, e.tipo, e.local,
           e.status_recarga, e.status_teste
    FROM vistoria_items vi
    JOIN extintores e ON e.id = vi.extintor_id
    WHERE vi.vistoria_id = ?
    ORDER BY vi.inspected_at DESC
  `, [id]);

  const countRow = await dbGet('SELECT COUNT(*) as cnt FROM extintores', []);
  const total = parseInt(countRow.cnt, 10);

  res.json({ ...vistoria, items, total_extintores: total });
});

app.post('/api/vistorias/:id/items', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { extintor_id, resultado, observacoes, inspector_name } = req.body;

  if (!extintor_id || !resultado) {
    return res.status(400).json({ error: 'Extintor e resultado são obrigatórios' });
  }

  const vistoria = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  if (vistoria.status === 'finalizada') {
    return res.status(400).json({ error: 'Vistoria já finalizada' });
  }

  const now = new Date().toISOString();
  // Upsert: update if extintor already in this vistoria, otherwise insert
  const existing = await dbGet(
    'SELECT id FROM vistoria_items WHERE vistoria_id = ? AND extintor_id = ?',
    [id, extintor_id]
  );

  if (existing) {
    await dbRun(
      'UPDATE vistoria_items SET resultado=?, observacoes=?, inspector_name=?, inspected_at=? WHERE id=?',
      [resultado, observacoes || null, inspector_name || req.session.user.name, now, existing.id]
    );
    const updated = await dbGet('SELECT * FROM vistoria_items WHERE id = ?', [existing.id]);
    return res.json(updated);
  }

  const info = await dbRun(
    'INSERT INTO vistoria_items (vistoria_id, extintor_id, resultado, observacoes, inspector_name, inspected_at) VALUES (?,?,?,?,?,?)',
    [id, extintor_id, resultado, observacoes || null, inspector_name || req.session.user.name, now]
  );
  const created = await dbGet('SELECT * FROM vistoria_items WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(created);
});

app.post('/api/vistorias/:id/finalizar', requireAuth, async (req, res) => {
  const { id } = req.params;
  const vistoria = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  const now = new Date().toISOString();
  await dbRun("UPDATE vistorias SET status='finalizada', finished_at=? WHERE id=?", [now, id]);
  const updated = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  res.json(updated);
});

app.post('/api/vistorias/:id/reabrir', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const vistoria = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  if (!vistoria) return res.status(404).json({ error: 'Vistoria não encontrada' });
  await dbRun("UPDATE vistorias SET status='em_andamento', finished_at=NULL WHERE id=?", [id]);
  const updated = await dbGet('SELECT * FROM vistorias WHERE id = ?', [id]);
  res.json(updated);
});

// =====================
// USUARIOS ROUTES
// =====================

app.get('/api/usuarios', requireAdmin, async (req, res) => {
  const rows = await dbAll('SELECT id, name, username, role, created_at FROM users ORDER BY name', []);
  res.json(rows);
});

app.post('/api/usuarios', requireAdmin, async (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }
  const exists = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
  if (exists) return res.status(409).json({ error: 'Username já existe' });
  const hashed = await bcrypt.hash(password, 10);
  const info = await dbRun(
    'INSERT INTO users (name, username, password, role) VALUES (?,?,?,?)',
    [name, username, hashed, role || 'inspector']
  );
  const created = await dbGet('SELECT id, name, username, role, created_at FROM users WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(created);
});

app.put('/api/usuarios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, username, password, role } = req.body;
  if (!name || !username) {
    return res.status(400).json({ error: 'Nome e usuário são obrigatórios' });
  }
  const existing = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Check username uniqueness (excluding self)
  const conflict = await dbGet('SELECT id FROM users WHERE username = ? AND id != ?', [username, id]);
  if (conflict) return res.status(409).json({ error: 'Username já existe' });

  if (password && password.trim()) {
    const hashed = await bcrypt.hash(password, 10);
    await dbRun('UPDATE users SET name=?, username=?, password=?, role=? WHERE id=?', [name, username, hashed, role || 'inspector', id]);
  } else {
    await dbRun('UPDATE users SET name=?, username=?, role=? WHERE id=?', [name, username, role || 'inspector', id]);
  }
  const updated = await dbGet('SELECT id, name, username, role, created_at FROM users WHERE id = ?', [id]);
  res.json(updated);
});

app.delete('/api/usuarios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.user.id) {
    return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
  }
  const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });
  await dbRun('DELETE FROM users WHERE id = ?', [id]);
  res.json({ success: true });
});

// Change own password
app.post('/api/me/senha', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
  }
  const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
  const hashed = await bcrypt.hash(new_password, 10);
  await dbRun('UPDATE users SET password=? WHERE id=?', [hashed, req.session.user.id]);
  res.json({ success: true });
});

// =====================
// TIPOS EXTINTOR ROUTES
// =====================

app.get('/api/tipos', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM tipos_extintor ORDER BY nome', []);
  res.json(rows);
});

app.post('/api/tipos', requireAdmin, async (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const exists = await dbGet('SELECT id FROM tipos_extintor WHERE nome = ?', [nome.trim()]);
  if (exists) return res.status(409).json({ error: 'Tipo já cadastrado' });
  const info = await dbRun('INSERT INTO tipos_extintor (nome) VALUES (?)', [nome.trim()]);
  const created = await dbGet('SELECT * FROM tipos_extintor WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json(created);
});

app.put('/api/tipos/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const existing = await dbGet('SELECT id FROM tipos_extintor WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Tipo não encontrado' });
  const conflict = await dbGet('SELECT id FROM tipos_extintor WHERE nome = ? AND id != ?', [nome.trim(), id]);
  if (conflict) return res.status(409).json({ error: 'Já existe um tipo com esse nome' });
  await dbRun('UPDATE tipos_extintor SET nome = ? WHERE id = ?', [nome.trim(), id]);
  const updated = await dbGet('SELECT * FROM tipos_extintor WHERE id = ?', [id]);
  res.json(updated);
});

app.delete('/api/tipos/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await dbGet('SELECT id FROM tipos_extintor WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Tipo não encontrado' });
  await dbRun('DELETE FROM tipos_extintor WHERE id = ?', [id]);
  res.json({ success: true });
});

// Initialize DB and start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
