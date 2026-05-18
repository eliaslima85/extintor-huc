/* ================================================
   EXTINTORES HUC - Frontend SPA
   ================================================ */

'use strict';

// ====== STATE ======
let currentUser = null;
let currentVistoria = null;
let currentVistoriaItems = []; // items already inspected in currentVistoria
let selectedExtintor = null;   // extintor selected for inspection
let selectedResultado = null;  // 'conforme' | 'nao_conforme'
let allExtintores = [];
let allVistorias = [];
let currentVistoriaDetails = null; // for PDF / details modal
let searchDebounceTimer = null;

// ====== BOOTSTRAP INSTANCES ======
let extintorModalInstance = null;
let novaVistoriaModalInstance = null;
let vistoriaDetailsModalInstance = null;
let usuarioModalInstance = null;
let tipoModalInstance = null;

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  extintorModalInstance = new bootstrap.Modal(document.getElementById('extintorModal'));
  novaVistoriaModalInstance = new bootstrap.Modal(document.getElementById('novaVistoriaModal'));
  vistoriaDetailsModalInstance = new bootstrap.Modal(document.getElementById('vistoriaDetailsModal'));
  usuarioModalInstance = new bootstrap.Modal(document.getElementById('usuarioModal'));
  tipoModalInstance = new bootstrap.Modal(document.getElementById('tipoModal'));

  bindStaticEvents();
  checkAuth();
});

// ====== AUTH ======
async function checkAuth() {
  try {
    const res = await apiFetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      showMainApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('d-none');
  document.getElementById('mainApp').classList.add('d-none');
}

function showMainApp() {
  document.getElementById('loginScreen').classList.add('d-none');
  document.getElementById('mainApp').classList.remove('d-none');
  document.getElementById('navUsername').textContent = currentUser.name;
  if (currentUser.role === 'admin') {
    document.getElementById('navRoleBadge').classList.remove('d-none');
    document.getElementById('adminTabItem').style.display = '';
  } else {
    document.getElementById('navRoleBadge').classList.add('d-none');
    document.getElementById('adminTabItem').style.display = 'none';
  }
  switchTab('cadastro');
}

// ====== STATIC EVENT BINDINGS ======
function bindStaticEvents() {
  // Login form
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Extintor CRUD
  document.getElementById('btnNovoExtintor').addEventListener('click', openNewExtintorModal);
  document.getElementById('btnSalvarExtintor').addEventListener('click', saveExtintor);

  // Vistoria
  document.getElementById('btnNovaVistoria').addEventListener('click', openNovaVistoriaModal);
  document.getElementById('btnCriarVistoria').addEventListener('click', criarVistoria);
  document.getElementById('btnVoltarLista').addEventListener('click', voltarListaVistoria);
  document.getElementById('btnTerminarVistoria').addEventListener('click', terminarVistoria);
  document.getElementById('btnConforme').addEventListener('click', () => selecionarResultado('conforme'));
  document.getElementById('btnNaoConforme').addEventListener('click', () => selecionarResultado('nao_conforme'));
  document.getElementById('btnSalvarInspecao').addEventListener('click', salvarInspecao);
  document.getElementById('btnCancelarInspecao').addEventListener('click', cancelarInspecao);

  // Vistoria search (debounced)
  document.getElementById('vistoriaSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const q = e.target.value.trim();
    if (!q) {
      document.getElementById('vistoriaSearchResults').innerHTML = '';
      return;
    }
    searchDebounceTimer = setTimeout(() => buscarExtintor(q), 300);
  });

  // Histórico PDF & Reabrir
  document.getElementById('btnGerarPDF').addEventListener('click', gerarPDF);
  document.getElementById('btnReabrirVistoria').addEventListener('click', reabrirVistoria);

  // Admin - Tipos
  document.getElementById('btnNovoTipo').addEventListener('click', openNewTipoModal);
  document.getElementById('btnSalvarTipo').addEventListener('click', saveTipo);

  // Admin - Usuarios
  document.getElementById('btnNovoUsuario').addEventListener('click', openNewUsuarioModal);
  document.getElementById('btnSalvarUsuario').addEventListener('click', saveUsuario);

  // Change Password
  document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);

  // Auto-calcular próximas datas
  document.getElementById('fDataUltimaRecarga').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const prox = addYears(e.target.value, 1);
    document.getElementById('fDataProxRecarga').value = prox;
    autoSetStatus(prox, 'fStatusRecarga');
  });
  document.getElementById('fDataUltimoTeste').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const prox = addYears(e.target.value, 5);
    document.getElementById('fDataProxTeste').value = prox;
    autoSetStatus(prox, 'fStatusTeste');
  });
  document.getElementById('fDataProxRecarga').addEventListener('change', (e) => {
    if (e.target.value) autoSetStatus(e.target.value, 'fStatusRecarga');
  });
  document.getElementById('fDataProxTeste').addEventListener('change', (e) => {
    if (e.target.value) autoSetStatus(e.target.value, 'fStatusTeste');
  });

  // PDF de todos os extintores
  document.getElementById('btnPDFExtintores').addEventListener('click', gerarPDFExtintores);

  // Atualizar extintor direto da vistoria
  document.getElementById('btnAtualizarExtintorVistoria').addEventListener('click', () => {
    if (!selectedExtintor) return;
    extintorModalInstance.show();
    // After modal closes, refresh the card
    document.getElementById('extintorModal').addEventListener('hidden.bs.modal', async () => {
      if (selectedExtintor) {
        // Reload extintor data
        const res = await apiFetch(`/api/extintores/search?q=${encodeURIComponent(selectedExtintor.num_extintor)}`);
        if (res.ok) {
          const arr = await res.json();
          const updated = arr.find(e => e.id === selectedExtintor.id);
          if (updated) {
            selectedExtintor = updated;
            // Update allExtintores cache
            const idx = allExtintores.findIndex(e => e.id === updated.id);
            if (idx !== -1) allExtintores[idx] = updated;
            _showExtintorCard();
          }
        }
      }
    }, { once: true });
    openEditExtintorModal(selectedExtintor.id);
  });
}

// ====== TAB SWITCHING ======
function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content-area').forEach(el => el.classList.add('d-none'));

  const tabMap = {
    cadastro: 'tabCadastro',
    vistoria: 'tabVistoria',
    historico: 'tabHistorico',
    admin: 'tabAdmin'
  };

  const target = document.getElementById(tabMap[tab]);
  if (target) {
    target.classList.remove('d-none');
  }

  if (tab === 'cadastro') loadExtintores();
  if (tab === 'vistoria') {
    showVistoriaListView();
    loadVistoriasAtivas();
  }
  if (tab === 'historico') loadHistorico();
  if (tab === 'admin' && currentUser.role === 'admin') { loadUsuarios(); loadTipos(); }
}

// ====== API HELPERS ======
async function apiFetch(url, options = {}) {
  const defaults = {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  };
  const merged = { ...defaults, ...options };
  if (merged.headers) {
    merged.headers = { ...defaults.headers, ...(options.headers || {}) };
  }
  const res = await fetch(url, merged);
  if (res.status === 401) {
    currentUser = null;
    showLogin();
    throw new Error('Não autenticado');
  }
  return res;
}

// ====== TOAST NOTIFICATIONS ======
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const id = 'toast-' + Date.now();
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill' };
  const colors = { success: '#16a34a', error: '#dc2626', info: '#0ea5e9' };

  const toastEl = document.createElement('div');
  toastEl.id = id;
  toastEl.className = `toast toast-${type} align-items-center border-0 bg-white`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex align-items-center p-2">
      <i class="bi ${icons[type] || icons.info} me-2 fs-5" style="color:${colors[type] || colors.info}"></i>
      <div class="toast-body p-0 flex-grow-1">${escHtml(message)}</div>
      <button type="button" class="btn-close ms-2" data-bs-dismiss="toast"></button>
    </div>
  `;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ====== CONFIRM DIALOG ======
function confirmDialog(message, onConfirm, confirmText = 'Confirmar', confirmClass = 'btn-danger') {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <h6 class="fw-bold mb-3"><i class="bi bi-exclamation-triangle text-warning me-2"></i>Confirmar Ação</h6>
      <p class="mb-4">${escHtml(message)}</p>
      <div class="d-flex gap-2 justify-content-end">
        <button class="btn btn-secondary btn-sm" id="confirmCancel">Cancelar</button>
        <button class="btn ${confirmClass} btn-sm fw-bold" id="confirmOk">${escHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirmCancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirmOk').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

// ====== UTILITY ======
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  // Handle both ISO datetime and date-only strings
  const d = iso.length > 10 ? new Date(iso) : new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status, type = 'recarga') {
  if (!status) return '<span class="badge-status bg-light text-muted">—</span>';
  const map = {
    'Em dia': 'status-em-dia',
    'Vencida': 'status-vencida',
    'A vencer': 'status-a-vencer',
    'conforme': 'status-conforme',
    'nao_conforme': 'status-nao-conforme',
    'em_andamento': 'status-em-andamento',
    'finalizada': 'status-finalizada',
    'Conforme': 'status-conforme-sig',
    'Não Conforme': 'status-nao-conforme-sig',
    'Ausente': 'status-ausente',
  };
  const cls = map[status] || 'bg-secondary text-white';
  const label = status === 'conforme' ? 'Conforme' : status === 'nao_conforme' ? 'Não Conforme' : status === 'em_andamento' ? 'Em Andamento' : status === 'finalizada' ? 'Finalizada' : status;
  return `<span class="badge-status ${cls}">${escHtml(label)}</span>`;
}

function addYears(dateStr, years) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function autoSetStatus(proxDateStr, selectId) {
  const prox = new Date(proxDateStr + 'T12:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const em30dias = new Date(today); em30dias.setDate(em30dias.getDate() + 30);
  let status = prox < today ? 'Vencida' : prox <= em30dias ? 'A vencer' : 'Em dia';
  document.getElementById(selectId).value = status;
}

// ====== LOGIN ======
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const spinner = document.getElementById('loginSpinner');
  const btn = document.getElementById('loginBtn');

  errEl.classList.add('d-none');
  spinner.classList.remove('d-none');
  btn.disabled = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      showMainApp();
    } else {
      errEl.textContent = data.error || 'Erro ao fazer login';
      errEl.classList.remove('d-none');
    }
  } catch {
    errEl.textContent = 'Erro de conexão. Tente novamente.';
    errEl.classList.remove('d-none');
  } finally {
    spinner.classList.add('d-none');
    btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch { /* ignore */ }
  currentUser = null;
  currentVistoria = null;
  showLogin();
}

// ====== CADASTRO TAB ======
async function loadExtintores() {
  const tbody = document.getElementById('extintoresBody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</td></tr>';
  try {
    const res = await apiFetch('/api/extintores');
    const data = await res.json();
    allExtintores = data;
    renderExtintores(data);
  } catch (err) {
    if (err.message !== 'Não autenticado') {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Erro ao carregar extintores.</td></tr>';
    }
  }
}

function renderExtintores(extintores) {
  const tbody = document.getElementById('extintoresBody');
  if (!extintores.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <i class="bi bi-fire"></i>
          <p class="fw-semibold">Nenhum extintor cadastrado</p>
          <small>Clique em "Novo Extintor" para começar</small>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = extintores.map(e => `
    <tr>
      <td><strong>${escHtml(e.num_extintor)}</strong></td>
      <td>${escHtml(e.num_cilindro) || '—'}</td>
      <td>${escHtml(e.torre_pav_anexo) || '—'}</td>
      <td>${escHtml(e.tipo) || '—'}</td>
      <td>${escHtml(e.local) || '—'}</td>
      <td>${statusBadge(e.status_recarga)}</td>
      <td>${statusBadge(e.status_teste)}</td>
      <td class="text-center" style="white-space:nowrap">
        <button class="btn btn-outline-primary btn-action me-1" onclick="openEditExtintorModal(${e.id})" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        ${currentUser && currentUser.role === 'admin' ? `
        <button class="btn btn-outline-danger btn-action" onclick="deleteExtintor(${e.id}, '${escHtml(e.num_extintor)}')" title="Excluir">
          <i class="bi bi-trash"></i>
        </button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function openNewExtintorModal() {
  document.getElementById('extintorId').value = '';
  document.getElementById('extintorForm').reset();
  document.getElementById('extintorModalLabel').innerHTML = '<i class="bi bi-fire me-2"></i>Novo Extintor';
  await loadTiposSelect();
  extintorModalInstance.show();
}

async function loadTiposSelect(selectedValue = '') {
  try {
    const res = await apiFetch('/api/tipos');
    const tipos = await res.json();
    const sel = document.getElementById('fTipo');
    sel.innerHTML = '<option value="">-- Selecione o tipo --</option>' +
      tipos.map(t => `<option value="${escHtml(t.nome)}" ${t.nome === selectedValue ? 'selected' : ''}>${escHtml(t.nome)}</option>`).join('');
  } catch { /* ignore */ }
}

async function openEditExtintorModal(id) {
  const e = allExtintores.find(x => x.id === id);
  if (!e) return;

  await loadTiposSelect(e.tipo || '');
  document.getElementById('extintorId').value = e.id;
  document.getElementById('fTorrePavAnexo').value = e.torre_pav_anexo || '';
  document.getElementById('fTipo').value = e.tipo || '';
  document.getElementById('fLocal').value = e.local || '';
  document.getElementById('fNumExtintor').value = e.num_extintor || '';
  document.getElementById('fNumCilindro').value = e.num_cilindro || '';
  document.getElementById('fDataUltimaRecarga').value = e.data_ultima_recarga || '';
  document.getElementById('fDataProxRecarga').value = e.data_prox_recarga || '';
  document.getElementById('fStatusRecarga').value = e.status_recarga || '';
  document.getElementById('fDataUltimoTeste').value = e.data_ultimo_teste || '';
  document.getElementById('fDataProxTeste').value = e.data_prox_teste || '';
  document.getElementById('fStatusTeste').value = e.status_teste || '';
  document.getElementById('fSinalizacaoVertical').value = e.sinalizacao_vertical || '';
  document.getElementById('fSinalizacaoHorizontal').value = e.sinalizacao_horizontal || '';
  document.getElementById('fPlacasCorretas').value = e.placas_corretas || '';
  document.getElementById('fObservacoes').value = e.observacoes || '';

  document.getElementById('extintorModalLabel').innerHTML = `<i class="bi bi-pencil me-2"></i>Editar Extintor — ${escHtml(e.num_extintor)}`;
  extintorModalInstance.show();
}

async function saveExtintor() {
  const id = document.getElementById('extintorId').value;
  const numExtintor = document.getElementById('fNumExtintor').value.trim();

  if (!numExtintor) {
    showToast('Número do extintor é obrigatório', 'error');
    document.getElementById('fNumExtintor').focus();
    return;
  }

  const payload = {
    torre_pav_anexo: document.getElementById('fTorrePavAnexo').value.trim(),
    tipo: document.getElementById('fTipo').value.trim(),
    local: document.getElementById('fLocal').value.trim(),
    num_extintor: numExtintor,
    num_cilindro: document.getElementById('fNumCilindro').value.trim(),
    data_ultima_recarga: document.getElementById('fDataUltimaRecarga').value,
    data_prox_recarga: document.getElementById('fDataProxRecarga').value,
    status_recarga: document.getElementById('fStatusRecarga').value,
    data_ultimo_teste: document.getElementById('fDataUltimoTeste').value,
    data_prox_teste: document.getElementById('fDataProxTeste').value,
    status_teste: document.getElementById('fStatusTeste').value,
    sinalizacao_vertical: document.getElementById('fSinalizacaoVertical').value,
    sinalizacao_horizontal: document.getElementById('fSinalizacaoHorizontal').value,
    placas_corretas: document.getElementById('fPlacasCorretas').value,
    observacoes: document.getElementById('fObservacoes').value.trim(),
  };

  const spinner = document.getElementById('btnSalvarExtintorSpinner');
  const btn = document.getElementById('btnSalvarExtintor');
  spinner.classList.remove('d-none');
  btn.disabled = true;

  try {
    const url = id ? `/api/extintores/${id}` : '/api/extintores';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();

    if (res.ok) {
      extintorModalInstance.hide();
      showToast(id ? 'Extintor atualizado com sucesso!' : 'Extintor cadastrado com sucesso!', 'success');
      loadExtintores();
    } else {
      showToast(data.error || 'Erro ao salvar extintor', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') {
      showToast('Erro de conexão', 'error');
    }
  } finally {
    spinner.classList.add('d-none');
    btn.disabled = false;
  }
}

async function deleteExtintor(id, numExtintor) {
  confirmDialog(
    `Deseja excluir o extintor Nº ${numExtintor}? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        const res = await apiFetch(`/api/extintores/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast('Extintor excluído com sucesso!', 'success');
          loadExtintores();
        } else {
          showToast(data.error || 'Erro ao excluir', 'error');
        }
      } catch (err) {
        if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
      }
    },
    'Excluir',
    'btn-danger'
  );
}

// ====== VISTORIA TAB ======
function showVistoriaListView() {
  document.getElementById('vistoriaListView').classList.remove('d-none');
  document.getElementById('vistoriaActiveView').classList.add('d-none');
  currentVistoria = null;
  currentVistoriaItems = [];
  selectedExtintor = null;
  selectedResultado = null;
}

function showVistoriaActiveView() {
  document.getElementById('vistoriaListView').classList.add('d-none');
  document.getElementById('vistoriaActiveView').classList.remove('d-none');
}

async function loadVistoriasAtivas() {
  const container = document.getElementById('vistoriaListContainer');
  container.innerHTML = '<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</div>';

  try {
    const res = await apiFetch('/api/vistorias');
    const data = await res.json();
    allVistorias = data;
    const ativas = data.filter(v => v.status === 'em_andamento');
    renderVistoriasAtivas(ativas);
  } catch (err) {
    if (err.message !== 'Não autenticado') {
      container.innerHTML = '<div class="text-center py-4 text-danger">Erro ao carregar vistorias.</div>';
    }
  }
}

function renderVistoriasAtivas(vistorias) {
  const container = document.getElementById('vistoriaListContainer');

  if (!vistorias.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-clipboard-x"></i>
        <p class="fw-semibold">Nenhuma vistoria em andamento</p>
        <small>Clique em "Nova Vistoria" para iniciar uma nova vistoria</small>
      </div>`;
    return;
  }

  container.innerHTML = vistorias.map(v => `
    <div class="vistoria-card">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="vistoria-card-title">${escHtml(v.titulo)}</div>
          <div class="vistoria-card-meta mt-1">
            <i class="bi bi-person me-1"></i>${escHtml(v.inspector_name)} &nbsp;|&nbsp;
            <i class="bi bi-calendar me-1"></i>${fmtDateTime(v.started_at)}
          </div>
          <div class="mt-2">
            ${statusBadge('em_andamento')}
            <span class="ms-2 text-muted small"><i class="bi bi-list-check me-1"></i>${v.item_count} extintor(es) inspecionado(s)</span>
          </div>
        </div>
        <button class="btn btn-danger btn-sm fw-bold" onclick="continuarVistoria(${v.id})">
          <i class="bi bi-play-fill me-1"></i>Continuar
        </button>
      </div>
    </div>
  `).join('');
}

function openNovaVistoriaModal() {
  document.getElementById('novaVistoriaForm').reset();
  if (currentUser) {
    document.getElementById('vistoriaInspetorNome').value = currentUser.name;
  }
  novaVistoriaModalInstance.show();
}

async function criarVistoria() {
  const titulo = document.getElementById('vistoriaTitulo').value.trim();
  const inspector_name = document.getElementById('vistoriaInspetorNome').value.trim();

  if (!titulo) { showToast('Título é obrigatório', 'error'); return; }
  if (!inspector_name) { showToast('Nome do inspetor é obrigatório', 'error'); return; }

  const spinner = document.getElementById('btnCriarVistoriaSpinner');
  const btn = document.getElementById('btnCriarVistoria');
  spinner.classList.remove('d-none');
  btn.disabled = true;

  try {
    const res = await apiFetch('/api/vistorias', {
      method: 'POST',
      body: JSON.stringify({ titulo, inspector_name })
    });
    const data = await res.json();
    if (res.ok) {
      novaVistoriaModalInstance.hide();
      showToast('Vistoria criada com sucesso!', 'success');
      await continuarVistoria(data.id);
    } else {
      showToast(data.error || 'Erro ao criar vistoria', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
  } finally {
    spinner.classList.add('d-none');
    btn.disabled = false;
  }
}

async function continuarVistoria(id) {
  try {
    const res = await apiFetch(`/api/vistorias/${id}`);
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erro ao carregar vistoria', 'error'); return; }

    currentVistoria = data;
    currentVistoriaItems = data.items || [];

    document.getElementById('vistoriaTituloDisplay').textContent = data.titulo;
    document.getElementById('vistoriaInspetorDisplay').textContent = data.inspector_name;
    document.getElementById('vistoriaDataDisplay').textContent = fmtDateTime(data.started_at);

    // Pre-fill inspector field with session user
    document.getElementById('inspetorVistoria').value = currentUser ? currentUser.name : data.inspector_name;

    updateVistoriaCounter(data);
    renderVistoriaItemsList();
    resetInspectionForm();

    showVistoriaActiveView();
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro ao carregar vistoria', 'error');
  }
}

function updateVistoriaCounter(vistoriaData) {
  const inspected = currentVistoriaItems.length;
  const total = vistoriaData.total_extintores || 0;
  document.getElementById('vistoriaContador').textContent = `${inspected} / ${total} inspecionados`;
  document.getElementById('inspectedCount').textContent = inspected;
}

function renderVistoriaItemsList() {
  const container = document.getElementById('vistoriaItemsList');
  if (!currentVistoriaItems.length) {
    container.innerHTML = '<div class="p-3 text-muted text-center">Nenhum extintor inspecionado ainda.</div>';
    return;
  }

  container.innerHTML = currentVistoriaItems.map(item => `
    <div class="vistoria-item-row">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        ${statusBadge(item.resultado)}
        <strong>${escHtml(item.num_extintor)}</strong>
        ${item.num_cilindro ? `<span class="text-muted small">Cil: ${escHtml(item.num_cilindro)}</span>` : ''}
        ${item.torre_pav_anexo ? `<span class="text-muted small">${escHtml(item.torre_pav_anexo)}</span>` : ''}
        ${item.observacoes ? `<span class="text-muted small fst-italic">"${escHtml(item.observacoes)}"</span>` : ''}
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="inspector-badge"><i class="bi bi-person me-1"></i>${escHtml(item.inspector_name || '—')}</span>
        <small class="text-muted">${fmtDateTime(item.inspected_at)}</small>
      </div>
    </div>
  `).join('');
}

async function buscarExtintor(q) {
  const resultsEl = document.getElementById('vistoriaSearchResults');
  const spinnerEl = document.getElementById('vistoriaSearchSpinner');
  spinnerEl.style.display = '';

  try {
    const res = await apiFetch(`/api/extintores/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    spinnerEl.style.display = 'none';

    if (!data.length) {
      resultsEl.innerHTML = '<div class="text-muted small py-2 px-1"><i class="bi bi-search me-1"></i>Nenhum extintor encontrado.</div>';
      return;
    }

    // Map inspected extintor IDs for quick lookup
    const inspectedMap = {};
    currentVistoriaItems.forEach(item => {
      inspectedMap[item.extintor_id] = item.resultado;
    });

    resultsEl.innerHTML = data.map(e => {
      const alreadyInspected = inspectedMap.hasOwnProperty(e.id);
      const resultadoAtual = inspectedMap[e.id];
      return `
        <div class="extintor-search-result ${alreadyInspected ? 'already-inspected' : ''}"
             onclick="selecionarExtintorParaInspecao(${e.id})">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong><i class="bi bi-fire text-danger me-1"></i>Nº ${escHtml(e.num_extintor)}</strong>
              ${e.num_cilindro ? `<span class="text-muted ms-2 small">Cilindro: ${escHtml(e.num_cilindro)}</span>` : ''}
            </div>
            <div class="d-flex align-items-center gap-2">
              ${alreadyInspected ? `${statusBadge(resultadoAtual)} <span class="text-muted small">Já inspecionado</span>` : '<span class="badge bg-light text-muted small">Clique para inspecionar</span>'}
            </div>
          </div>
          <div class="mt-1 text-muted small">
            ${e.torre_pav_anexo ? `<span class="me-3"><i class="bi bi-building me-1"></i>${escHtml(e.torre_pav_anexo)}</span>` : ''}
            ${e.tipo ? `<span class="me-3"><i class="bi bi-tag me-1"></i>${escHtml(e.tipo)}</span>` : ''}
            ${e.local ? `<span><i class="bi bi-geo-alt me-1"></i>${escHtml(e.local)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    spinnerEl.style.display = 'none';
    if (err.message !== 'Não autenticado') {
      resultsEl.innerHTML = '<div class="text-danger small py-2">Erro ao buscar.</div>';
    }
  }
}

function selecionarExtintorParaInspecao(id) {
  selectedExtintor = allExtintores.find(e => e.id === id);
  if (!selectedExtintor) {
    // Might not be loaded yet — do a search fetch
    apiFetch(`/api/extintores/search?q=${id}`).then(async r => {
      const arr = await r.json();
      selectedExtintor = arr.find(e => e.id === id);
      if (selectedExtintor) _showExtintorCard();
    });
    return;
  }
  _showExtintorCard();
}

function _showExtintorCard() {
  const e = selectedExtintor;
  if (!e) return;

  // Check if already inspected
  const alreadyInspected = currentVistoriaItems.find(item => item.extintor_id === e.id);

  document.getElementById('extintorSelectedCard').innerHTML = `
    <div class="extintor-info-card">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <h6 class="fw-bold mb-0"><i class="bi bi-fire text-danger me-1"></i>Extintor Nº ${escHtml(e.num_extintor)}</h6>
        ${alreadyInspected ? `<span class="badge bg-warning text-dark"><i class="bi bi-arrow-repeat me-1"></i>Reinspecionando</span>` : ''}
      </div>
      <div class="info-row">
        ${e.num_cilindro ? `<div class="info-item"><span class="info-label">Nº Cilindro</span><span class="info-value">${escHtml(e.num_cilindro)}</span></div>` : ''}
        ${e.torre_pav_anexo ? `<div class="info-item"><span class="info-label">Torre/Pav/Anexo</span><span class="info-value">${escHtml(e.torre_pav_anexo)}</span></div>` : ''}
        ${e.tipo ? `<div class="info-item"><span class="info-label">Tipo</span><span class="info-value">${escHtml(e.tipo)}</span></div>` : ''}
        ${e.local ? `<div class="info-item"><span class="info-label">Local</span><span class="info-value">${escHtml(e.local)}</span></div>` : ''}
      </div>
      <div class="info-row">
        ${e.status_recarga ? `<div class="info-item"><span class="info-label">Status Recarga</span><span class="info-value">${statusBadge(e.status_recarga)}</span></div>` : ''}
        ${e.data_prox_recarga ? `<div class="info-item"><span class="info-label">Próx. Recarga</span><span class="info-value">${fmtDate(e.data_prox_recarga)}</span></div>` : ''}
        ${e.status_teste ? `<div class="info-item"><span class="info-label">Status Teste</span><span class="info-value">${statusBadge(e.status_teste)}</span></div>` : ''}
        ${e.data_prox_teste ? `<div class="info-item"><span class="info-label">Próx. Teste</span><span class="info-value">${fmtDate(e.data_prox_teste)}</span></div>` : ''}
      </div>
      ${e.sinalizacao_vertical || e.sinalizacao_horizontal || e.placas_corretas ? `
      <div class="info-row">
        ${e.sinalizacao_vertical ? `<div class="info-item"><span class="info-label">Sinal. Vertical</span><span class="info-value">${statusBadge(e.sinalizacao_vertical)}</span></div>` : ''}
        ${e.sinalizacao_horizontal ? `<div class="info-item"><span class="info-label">Sinal. Horizontal</span><span class="info-value">${statusBadge(e.sinalizacao_horizontal)}</span></div>` : ''}
        ${e.placas_corretas ? `<div class="info-item"><span class="info-label">Placas</span><span class="info-value">${escHtml(e.placas_corretas)}</span></div>` : ''}
      </div>` : ''}
      ${e.observacoes ? `<div class="mt-1 text-muted small fst-italic">${escHtml(e.observacoes)}</div>` : ''}
    </div>
  `;

  // Pre-fill if already inspected
  if (alreadyInspected) {
    selecionarResultado(alreadyInspected.resultado, false);
    document.getElementById('observacoesVistoria').value = alreadyInspected.observacoes || '';
  } else {
    resetResultadoButtons();
    document.getElementById('observacoesVistoria').value = '';
  }

  document.getElementById('vistoriaInspectionForm').classList.remove('d-none');
  document.getElementById('vistoriaSearchResults').innerHTML = '';
  document.getElementById('vistoriaSearch').value = '';
  document.getElementById('vistoriaInspectionForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selecionarResultado(resultado, scroll = true) {
  selectedResultado = resultado;
  const btnConf = document.getElementById('btnConforme');
  const btnNao = document.getElementById('btnNaoConforme');
  const obsGroup = document.getElementById('observacoesVistoriaGroup');

  if (resultado === 'conforme') {
    btnConf.className = 'btn btn-success btn-lg flex-fill fw-bold';
    btnNao.className = 'btn btn-outline-danger btn-lg flex-fill fw-bold';
    obsGroup.classList.add('d-none');
    document.getElementById('observacoesVistoria').value = '';
  } else {
    btnConf.className = 'btn btn-outline-success btn-lg flex-fill fw-bold';
    btnNao.className = 'btn btn-danger btn-lg flex-fill fw-bold';
    obsGroup.classList.remove('d-none');
    if (scroll) {
      setTimeout(() => document.getElementById('observacoesVistoria').focus(), 100);
    }
  }
}

function resetResultadoButtons() {
  selectedResultado = null;
  document.getElementById('btnConforme').className = 'btn btn-success btn-lg flex-fill fw-bold';
  document.getElementById('btnNaoConforme').className = 'btn btn-outline-danger btn-lg flex-fill fw-bold';
  document.getElementById('observacoesVistoriaGroup').classList.add('d-none');
}

function resetInspectionForm() {
  selectedExtintor = null;
  selectedResultado = null;
  document.getElementById('vistoriaInspectionForm').classList.add('d-none');
  document.getElementById('vistoriaSearchResults').innerHTML = '';
  document.getElementById('vistoriaSearch').value = '';
  resetResultadoButtons();
  document.getElementById('observacoesVistoria').value = '';
}

function cancelarInspecao() {
  resetInspectionForm();
}

async function salvarInspecao() {
  if (!selectedExtintor) { showToast('Selecione um extintor', 'error'); return; }
  if (!selectedResultado) { showToast('Selecione o resultado (Conforme ou Não Conforme)', 'error'); return; }

  const observacoes = document.getElementById('observacoesVistoria').value.trim();
  if (selectedResultado === 'nao_conforme' && !observacoes) {
    showToast('Observações são obrigatórias para Não Conforme', 'error');
    document.getElementById('observacoesVistoria').focus();
    return;
  }

  const inspector_name = document.getElementById('inspetorVistoria').value.trim() || currentUser.name;

  const btn = document.getElementById('btnSalvarInspecao');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Salvando...';

  try {
    const res = await apiFetch(`/api/vistorias/${currentVistoria.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        extintor_id: selectedExtintor.id,
        resultado: selectedResultado,
        observacoes: observacoes || null,
        inspector_name
      })
    });
    const data = await res.json();

    if (res.ok) {
      showToast('Inspeção registrada com sucesso!', 'success');
      // Reload vistoria to get updated items
      await refreshCurrentVistoria();
      resetInspectionForm();
    } else {
      showToast(data.error || 'Erro ao salvar inspeção', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-save me-1"></i>Salvar Inspeção';
  }
}

async function refreshCurrentVistoria() {
  try {
    const res = await apiFetch(`/api/vistorias/${currentVistoria.id}`);
    const data = await res.json();
    if (res.ok) {
      currentVistoria = data;
      currentVistoriaItems = data.items || [];
      updateVistoriaCounter(data);
      renderVistoriaItemsList();
    }
  } catch { /* ignore */ }
}

function voltarListaVistoria() {
  showVistoriaListView();
  loadVistoriasAtivas();
}

async function terminarVistoria() {
  const count = currentVistoriaItems.length;
  const total = currentVistoria.total_extintores || 0;
  const msg = count < total
    ? `Apenas ${count} de ${total} extintores foram inspecionados. Deseja terminar a vistoria assim mesmo?`
    : `Confirma a finalização da vistoria "${currentVistoria.titulo}"?`;

  confirmDialog(msg, async () => {
    try {
      const res = await apiFetch(`/api/vistorias/${currentVistoria.id}/finalizar`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('Vistoria finalizada com sucesso!', 'success');
        voltarListaVistoria();
      } else {
        showToast(data.error || 'Erro ao finalizar', 'error');
      }
    } catch (err) {
      if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
    }
  }, 'Finalizar Vistoria', 'btn-danger');
}

// ====== HISTÓRICO TAB ======
async function loadHistorico() {
  const tbody = document.getElementById('historicoBody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</td></tr>';

  try {
    const res = await apiFetch('/api/vistorias');
    const data = await res.json();
    allVistorias = data;
    renderHistorico(data);
  } catch (err) {
    if (err.message !== 'Não autenticado') {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-danger">Erro ao carregar histórico.</td></tr>';
    }
  }
}

function renderHistorico(vistorias) {
  const tbody = document.getElementById('historicoBody');
  if (!vistorias.length) {
    tbody.innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <i class="bi bi-clock-history"></i>
          <p class="fw-semibold">Nenhuma vistoria registrada</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = vistorias.map(v => `
    <tr>
      <td><strong>#${v.id}</strong></td>
      <td>${escHtml(v.titulo)}</td>
      <td>${escHtml(v.inspector_name)}</td>
      <td>${fmtDateTime(v.started_at)}</td>
      <td>${v.finished_at ? fmtDateTime(v.finished_at) : '—'}</td>
      <td>${statusBadge(v.status)}</td>
      <td><span class="badge bg-secondary">${v.item_count}</span></td>
      <td class="text-center" style="white-space:nowrap">
        <button class="btn btn-outline-primary btn-action me-1" onclick="verDetalhesVistoria(${v.id})" title="Ver detalhes">
          <i class="bi bi-eye"></i>
        </button>
        <button class="btn btn-outline-success btn-action" onclick="verDetalhesVistoria(${v.id}, true)" title="Gerar PDF">
          <i class="bi bi-file-earmark-pdf"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function verDetalhesVistoria(id, gerarPdfDireto = false) {
  const bodyEl = document.getElementById('vistoriaDetailsBody');
  const btnReabrir = document.getElementById('btnReabrirVistoria');
  bodyEl.innerHTML = '<div class="text-center py-4"><span class="spinner-border"></span></div>';
  vistoriaDetailsModalInstance.show();

  try {
    const res = await apiFetch(`/api/vistorias/${id}`);
    const data = await res.json();
    if (!res.ok) {
      bodyEl.innerHTML = `<div class="text-danger">${escHtml(data.error)}</div>`;
      return;
    }

    currentVistoriaDetails = data;

    // Show/hide Reabrir button (admin only, finalizada only)
    if (currentUser.role === 'admin' && data.status === 'finalizada') {
      btnReabrir.classList.remove('d-none');
    } else {
      btnReabrir.classList.add('d-none');
    }

    const conformeCount = (data.items || []).filter(i => i.resultado === 'conforme').length;
    const naoConformeCount = (data.items || []).filter(i => i.resultado === 'nao_conforme').length;

    bodyEl.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <table class="table table-sm">
            <tr><th style="width:40%">Título</th><td>${escHtml(data.titulo)}</td></tr>
            <tr><th>Inspetor</th><td>${escHtml(data.inspector_name)}</td></tr>
            <tr><th>Status</th><td>${statusBadge(data.status)}</td></tr>
          </table>
        </div>
        <div class="col-md-6">
          <table class="table table-sm">
            <tr><th style="width:40%">Data Início</th><td>${fmtDateTime(data.started_at)}</td></tr>
            <tr><th>Data Fim</th><td>${data.finished_at ? fmtDateTime(data.finished_at) : '—'}</td></tr>
            <tr><th>Total de Itens</th><td>${(data.items || []).length}</td></tr>
          </table>
        </div>
      </div>
      <div class="d-flex gap-3 mb-3">
        <div class="card border-success flex-fill text-center py-2">
          <div class="fs-4 fw-bold text-success">${conformeCount}</div>
          <div class="small text-muted">Conformes</div>
        </div>
        <div class="card border-danger flex-fill text-center py-2">
          <div class="fs-4 fw-bold text-danger">${naoConformeCount}</div>
          <div class="small text-muted">Não Conformes</div>
        </div>
        <div class="card border-secondary flex-fill text-center py-2">
          <div class="fs-4 fw-bold text-secondary">${(data.items || []).length}</div>
          <div class="small text-muted">Total</div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-striped table-sm">
          <thead class="table-dark">
            <tr>
              <th>Nº Extintor</th>
              <th>Nº Cilindro</th>
              <th>Torre/Local</th>
              <th>Tipo</th>
              <th>Resultado</th>
              <th>Inspetor</th>
              <th>Observações</th>
              <th>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            ${(data.items || []).length === 0
              ? '<tr><td colspan="8" class="text-center text-muted py-3">Nenhum item registrado</td></tr>'
              : (data.items || []).map(item => `
                <tr>
                  <td><strong>${escHtml(item.num_extintor)}</strong></td>
                  <td>${escHtml(item.num_cilindro) || '—'}</td>
                  <td>${escHtml(item.torre_pav_anexo) || '—'}</td>
                  <td>${escHtml(item.tipo) || '—'}</td>
                  <td>${statusBadge(item.resultado)}</td>
                  <td>${escHtml(item.inspector_name) || '—'}</td>
                  <td class="text-muted small fst-italic">${escHtml(item.observacoes) || '—'}</td>
                  <td class="small">${fmtDateTime(item.inspected_at)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;

    if (gerarPdfDireto) {
      setTimeout(() => gerarPDF(), 300);
    }

  } catch (err) {
    if (err.message !== 'Não autenticado') {
      bodyEl.innerHTML = '<div class="text-danger">Erro ao carregar detalhes.</div>';
    }
  }
}

async function reabrirVistoria() {
  if (!currentVistoriaDetails) return;
  confirmDialog(
    `Deseja reabrir a vistoria "${currentVistoriaDetails.titulo}"?`,
    async () => {
      try {
        const res = await apiFetch(`/api/vistorias/${currentVistoriaDetails.id}/reabrir`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          showToast('Vistoria reaberta!', 'success');
          vistoriaDetailsModalInstance.hide();
          loadHistorico();
        } else {
          showToast(data.error || 'Erro ao reabrir', 'error');
        }
      } catch (err) {
        if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
      }
    },
    'Reabrir',
    'btn-warning'
  );
}

// ====== PDF GENERATION ======
function gerarPDF() {
  if (!currentVistoriaDetails) {
    showToast('Nenhuma vistoria selecionada para gerar PDF', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const v = currentVistoriaDetails;
  const items = v.items || [];
  const conformeCount = items.filter(i => i.resultado === 'conforme').length;
  const naoConformeCount = items.filter(i => i.resultado === 'nao_conforme').length;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ---- HEADER ----
  // Red bar at top
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageWidth, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('HOSPITAL UNIVERSITÁRIO DE CAMPINAS - HUC', pageWidth / 2, 7.5, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('RELATÓRIO DE VISTORIA DE EXTINTORES', pageWidth / 2, 13.5, { align: 'center' });

  // ---- VISTORIA INFO BOX ----
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(220, 38, 38);
  doc.roundedRect(margin, 22, pageWidth - 2 * margin, 28, 2, 2, 'FD');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const col1x = margin + 5;
  const col2x = pageWidth / 2 + 5;
  let infoY = 29;

  doc.text('Título:', col1x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(v.titulo || '—', col1x + 20, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Inspetor:', col2x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(v.inspector_name || '—', col2x + 22, infoY);

  infoY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Data Início:', col1x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(fmtDateTime(v.started_at), col1x + 26, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Data Fim:', col2x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(v.finished_at ? fmtDateTime(v.finished_at) : '—', col2x + 22, infoY);

  infoY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Status:', col1x, infoY);
  doc.setFont('helvetica', 'normal');
  const statusLabel = v.status === 'finalizada' ? 'Finalizada' : 'Em Andamento';
  doc.text(statusLabel, col1x + 18, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Relatório gerado em:', col2x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleString('pt-BR'), col2x + 46, infoY);

  infoY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Inspecionados:', col1x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(String(items.length), col1x + 45, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Conformes:', col2x, infoY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(22, 163, 74);
  doc.text(String(conformeCount), col2x + 26, infoY);
  doc.setTextColor(30, 41, 59);

  const naoConformeX = col2x + 50;
  doc.setFont('helvetica', 'bold');
  doc.text('Não Conformes:', naoConformeX, infoY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 38, 38);
  doc.text(String(naoConformeCount), naoConformeX + 36, infoY);
  doc.setTextColor(30, 41, 59);

  // ---- TABLE ----
  const tableStartY = 54;

  doc.autoTable({
    startY: tableStartY,
    margin: { left: margin, right: margin },
    head: [[
      'Nº Extintor', 'Nº Cilindro', 'Torre/Pav/Anexo', 'Tipo', 'Local',
      'Resultado', 'Inspetor', 'Observações', 'Data/Hora'
    ]],
    body: items.map(item => [
      item.num_extintor || '—',
      item.num_cilindro || '—',
      item.torre_pav_anexo || '—',
      item.tipo || '—',
      item.local || '—',
      item.resultado === 'conforme' ? 'CONFORME' : 'NÃO CONFORME',
      item.inspector_name || '—',
      item.observacoes || '—',
      fmtDateTime(item.inspected_at)
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: 'linebreak',
      font: 'helvetica'
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 32 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 28, halign: 'center' },
      6: { cellWidth: 28 },
      7: { cellWidth: 45 },
      8: { cellWidth: 32 }
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: function(data) {
      if (data.section !== 'body') return;
      const rowItem = items[data.row.index];
      if (rowItem && rowItem.resultado === 'nao_conforme') {
        data.cell.styles.fillColor = [255, 235, 235];
      }
      if (data.column.index === 5) {
        if (data.cell.raw === 'CONFORME') {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'NÃO CONFORME') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: function(data) {
      // Footer with page numbers
      const pageCount = doc.internal.getNumberOfPages();
      const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Página ${currentPage} de ${pageCount}`,
        pageWidth - margin,
        pageHeight - 8,
        { align: 'right' }
      );
      doc.text(
        `HUC - Sistema de Extintores | ${new Date().toLocaleDateString('pt-BR')}`,
        margin,
        pageHeight - 8
      );
    }
  });

  // ---- SUMMARY AT END ----
  const finalY = doc.lastAutoTable.finalY + 8;
  if (finalY < pageHeight - 20) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(22, 163, 74);
    doc.roundedRect(margin, finalY, (pageWidth - 2 * margin) / 2 - 3, 14, 2, 2, 'FD');
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`✓ CONFORMES: ${conformeCount}`, margin + (pageWidth - 2 * margin) / 4 - 3, finalY + 9, { align: 'center' });

    doc.setFillColor(255, 242, 242);
    doc.setDrawColor(220, 38, 38);
    doc.roundedRect(pageWidth / 2 + 3, finalY, (pageWidth - 2 * margin) / 2 - 3, 14, 2, 2, 'FD');
    doc.setTextColor(220, 38, 38);
    doc.text(`✗ NÃO CONFORMES: ${naoConformeCount}`, pageWidth / 2 + 3 + (pageWidth - 2 * margin) / 4 - 3, finalY + 9, { align: 'center' });
  }

  // Save
  const safeTitle = (v.titulo || 'vistoria').replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio_extintores_${safeTitle}_${dateStr}.pdf`);
  showToast('PDF gerado com sucesso!', 'success');
}

// ====== ADMIN TAB ======
async function loadUsuarios() {
  const tbody = document.getElementById('usuariosBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</td></tr>';

  try {
    const res = await apiFetch('/api/usuarios');
    const data = await res.json();
    renderUsuarios(data);
  } catch (err) {
    if (err.message !== 'Não autenticado') {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Erro ao carregar usuários.</td></tr>';
    }
  }
}

function renderUsuarios(usuarios) {
  const tbody = document.getElementById('usuariosBody');
  if (!usuarios.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${escHtml(u.name)}</strong></td>
      <td><code>${escHtml(u.username)}</code></td>
      <td>
        <span class="badge-status ${u.role === 'admin' ? 'badge-admin' : 'badge-inspector'}">
          ${u.role === 'admin' ? '⚙ Admin' : '👤 Inspetor'}
        </span>
      </td>
      <td class="text-center" style="white-space:nowrap">
        <button class="btn btn-outline-primary btn-action me-1" onclick="openEditUsuarioModal(${u.id}, '${escHtml(u.name)}', '${escHtml(u.username)}', '${u.role}')" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        ${u.id !== currentUser.id ? `
        <button class="btn btn-outline-danger btn-action" onclick="deleteUsuario(${u.id}, '${escHtml(u.name)}')" title="Excluir">
          <i class="bi bi-trash"></i>
        </button>` : `<button class="btn btn-outline-secondary btn-action" disabled title="Não pode excluir a si mesmo"><i class="bi bi-trash"></i></button>`}
      </td>
    </tr>
  `).join('');
}

function openNewUsuarioModal() {
  document.getElementById('usuarioId').value = '';
  document.getElementById('usuarioForm').reset();
  document.getElementById('usuarioModalLabel').innerHTML = '<i class="bi bi-person-plus me-2"></i>Novo Usuário';
  document.getElementById('senhaHint').textContent = '(obrigatório para novo usuário)';
  document.getElementById('uSenha').required = true;
  usuarioModalInstance.show();
}

function openEditUsuarioModal(id, name, username, role) {
  document.getElementById('usuarioId').value = id;
  document.getElementById('uNome').value = name;
  document.getElementById('uUsername').value = username;
  document.getElementById('uSenha').value = '';
  document.getElementById('uPerfil').value = role;
  document.getElementById('usuarioModalLabel').innerHTML = `<i class="bi bi-pencil me-2"></i>Editar Usuário — ${escHtml(name)}`;
  document.getElementById('senhaHint').textContent = '(deixe em branco para manter a atual)';
  document.getElementById('uSenha').required = false;
  usuarioModalInstance.show();
}

async function saveUsuario() {
  const id = document.getElementById('usuarioId').value;
  const name = document.getElementById('uNome').value.trim();
  const username = document.getElementById('uUsername').value.trim();
  const password = document.getElementById('uSenha').value;
  const role = document.getElementById('uPerfil').value;

  if (!name) { showToast('Nome é obrigatório', 'error'); return; }
  if (!username) { showToast('Username é obrigatório', 'error'); return; }
  if (!id && !password) { showToast('Senha é obrigatória para novo usuário', 'error'); return; }

  const spinner = document.getElementById('btnSalvarUsuarioSpinner');
  const btn = document.getElementById('btnSalvarUsuario');
  spinner.classList.remove('d-none');
  btn.disabled = true;

  try {
    const url = id ? `/api/usuarios/${id}` : '/api/usuarios';
    const method = id ? 'PUT' : 'POST';
    const payload = { name, username, role };
    if (password) payload.password = password;

    const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();

    if (res.ok) {
      usuarioModalInstance.hide();
      showToast(id ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
      loadUsuarios();
    } else {
      showToast(data.error || 'Erro ao salvar usuário', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
  } finally {
    spinner.classList.add('d-none');
    btn.disabled = false;
  }
}

async function deleteUsuario(id, name) {
  confirmDialog(
    `Deseja excluir o usuário "${name}"?`,
    async () => {
      try {
        const res = await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          showToast('Usuário excluído!', 'success');
          loadUsuarios();
        } else {
          showToast(data.error || 'Erro ao excluir', 'error');
        }
      } catch (err) {
        if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
      }
    },
    'Excluir',
    'btn-danger'
  );
}

// ====== TIPOS DE EXTINTOR ======
async function loadTipos() {
  const tbody = document.getElementById('tiposBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Carregando...</td></tr>';
  try {
    const res = await apiFetch('/api/tipos');
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Nenhum tipo cadastrado.</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(t => `
      <tr>
        <td>${t.id}</td>
        <td><strong>${escHtml(t.nome)}</strong></td>
        <td class="text-center" style="white-space:nowrap">
          <button class="btn btn-outline-primary btn-action me-1" onclick="openEditTipoModal(${t.id}, '${escHtml(t.nome)}')" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger btn-action" onclick="deleteTipo(${t.id}, '${escHtml(t.nome)}')" title="Excluir">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    if (err.message !== 'Não autenticado')
      tbody.innerHTML = '<tr><td colspan="3" class="text-danger text-center py-3">Erro ao carregar.</td></tr>';
  }
}

function openNewTipoModal() {
  document.getElementById('tipoId').value = '';
  document.getElementById('tipoNome').value = '';
  document.getElementById('tipoModalLabel').innerHTML = '<i class="bi bi-tag me-2"></i>Novo Tipo de Extintor';
  tipoModalInstance.show();
}

function openEditTipoModal(id, nome) {
  document.getElementById('tipoId').value = id;
  document.getElementById('tipoNome').value = nome;
  document.getElementById('tipoModalLabel').innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Tipo';
  tipoModalInstance.show();
}

async function saveTipo() {
  const id = document.getElementById('tipoId').value;
  const nome = document.getElementById('tipoNome').value.trim();
  if (!nome) { showToast('Nome é obrigatório', 'error'); return; }

  const url = id ? `/api/tipos/${id}` : '/api/tipos';
  const method = id ? 'PUT' : 'POST';
  try {
    const res = await apiFetch(url, { method, body: JSON.stringify({ nome }) });
    const data = await res.json();
    if (res.ok) {
      tipoModalInstance.hide();
      showToast(id ? 'Tipo atualizado!' : 'Tipo cadastrado!', 'success');
      loadTipos();
    } else {
      showToast(data.error || 'Erro ao salvar', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
  }
}

async function deleteTipo(id, nome) {
  confirmDialog(`Excluir o tipo "${nome}"?`, async () => {
    try {
      const res = await apiFetch(`/api/tipos/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { showToast('Tipo excluído!', 'success'); loadTipos(); }
      else showToast(data.error || 'Erro ao excluir', 'error');
    } catch (err) {
      if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
    }
  }, 'Excluir', 'btn-danger');
}

// ====== PDF DE TODOS OS EXTINTORES ======
function gerarPDFExtintores() {
  if (!allExtintores.length) {
    showToast('Nenhum extintor cadastrado para gerar PDF', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // Agrupar por tipo
  const grupos = {};
  allExtintores.forEach(e => {
    const tipo = e.tipo || 'Sem Tipo';
    if (!grupos[tipo]) grupos[tipo] = [];
    grupos[tipo].push(e);
  });

  let isFirstPage = true;

  Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b)).forEach(([tipo, items]) => {
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    // Header vermelho
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HOSPITAL UNIVERSITÁRIO DE CAMPINAS - HUC', pageWidth / 2, 7, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('CADASTRO DE EXTINTORES', pageWidth / 2, 13, { align: 'center' });

    // Título do grupo
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Tipo: ${tipo}  (${items.length} extintor${items.length > 1 ? 'es' : ''})`, margin, 24);

    doc.autoTable({
      startY: 28,
      margin: { left: margin, right: margin },
      head: [[
        'Nº Extintor', 'Nº Cilindro', 'Torre/Pav/Anexo', 'Local',
        'Ult. Recarga', 'Próx. Recarga', 'St. Recarga',
        'Ult. Teste', 'Próx. Teste', 'St. Teste',
        'Sin. Vert.', 'Sin. Horiz.', 'Placas', 'Observações'
      ]],
      body: items.map(e => [
        e.num_extintor || '—',
        e.num_cilindro || '—',
        e.torre_pav_anexo || '—',
        e.local || '—',
        e.data_ultima_recarga ? fmtDate(e.data_ultima_recarga) : '—',
        e.data_prox_recarga ? fmtDate(e.data_prox_recarga) : '—',
        e.status_recarga || '—',
        e.data_ultimo_teste ? fmtDate(e.data_ultimo_teste) : '—',
        e.data_prox_teste ? fmtDate(e.data_prox_teste) : '—',
        e.status_teste || '—',
        e.sinalizacao_vertical || '—',
        e.sinalizacao_horizontal || '—',
        e.placas_corretas || '—',
        e.observacoes || '—'
      ]),
      styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak', font: 'helvetica' },
      headStyles: {
        fillColor: [30, 41, 59], textColor: [255, 255, 255],
        fontStyle: 'bold', fontSize: 7, halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 18, fontStyle: 'bold' },
        1: { cellWidth: 18 },
        2: { cellWidth: 28 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 16 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 },
        9: { cellWidth: 16 },
        10: { cellWidth: 16 },
        11: { cellWidth: 16 },
        12: { cellWidth: 14 },
        13: { cellWidth: 'auto' }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.section !== 'body') return;
        const rowItem = items[data.row.index];
        // Linha inteira em vermelho claro se tiver algum item vencido
        if (rowItem && (rowItem.status_recarga === 'Vencida' || rowItem.status_teste === 'Vencida')) {
          data.cell.styles.fillColor = [255, 235, 235];
        }
        const val = data.cell.raw;
        if (val === 'Vencida' || val === 'Não Conforme' || val === 'Não') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'Em dia' || val === 'Conforme' || val === 'Sim') {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (val === 'A vencer') {
          data.cell.styles.textColor = [161, 98, 7];
          data.cell.styles.fillColor = [255, 253, 235];
        }
      },
      didDrawPage(data) {
        const pageCount = doc.internal.getNumberOfPages();
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.setFont('helvetica', 'normal');
        doc.text(`Página ${currentPage} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
        doc.text(`HUC - Extintores | Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, pageHeight - 6);
      }
    });
  });

  // Página de resumo no final
  doc.addPage();
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageWidth, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('HOSPITAL UNIVERSITÁRIO DE CAMPINAS - HUC', pageWidth / 2, 7, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('RESUMO POR TIPO DE EXTINTOR', pageWidth / 2, 13, { align: 'center' });

  doc.autoTable({
    startY: 24,
    margin: { left: margin, right: margin },
    head: [['Tipo de Extintor', 'Quantidade', 'Recargas Vencidas', 'Testes Vencidos']],
    body: Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b)).map(([tipo, items]) => [
      tipo,
      items.length,
      items.filter(e => e.status_recarga === 'Vencida').length,
      items.filter(e => e.status_teste === 'Vencida').length
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    foot: [[
      'TOTAL', allExtintores.length,
      allExtintores.filter(e => e.status_recarga === 'Vencida').length,
      allExtintores.filter(e => e.status_teste === 'Vencida').length
    ]],
    footStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`extintores_huc_${dateStr}.pdf`);
  showToast('PDF gerado com sucesso!', 'success');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const current_password = document.getElementById('currentPassword').value;
  const new_password = document.getElementById('newPassword').value;
  const confirm_password = document.getElementById('confirmPassword').value;

  if (!current_password || !new_password || !confirm_password) {
    showToast('Todos os campos são obrigatórios', 'error');
    return;
  }

  if (new_password !== confirm_password) {
    showToast('Nova senha e confirmação não coincidem', 'error');
    return;
  }

  if (new_password.length < 4) {
    showToast('A nova senha deve ter pelo menos 4 caracteres', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/me/senha', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();

    if (res.ok) {
      showToast('Senha alterada com sucesso!', 'success');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(data.error || 'Erro ao alterar senha', 'error');
    }
  } catch (err) {
    if (err.message !== 'Não autenticado') showToast('Erro de conexão', 'error');
  }
}
