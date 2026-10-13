import { api } from './api.js';

let activeProducts = [];
let activeProjections = [];
let lastOptimizationSessionId = null;

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initModals();
  await checkServerHealth();
  updateUserUI();

  // Si no hay sesión, auto-login con credenciales demo para mostrar los datos de inmediato
  if (!api.isAuthenticated()) {
    try {
      await api.login('admin@saaml.com', 'Admin123*');
      updateUserUI();
    } catch (_) {}
  }

  // Cargar pestaña inicial (Inventario)
  await loadInventory();

  // Escuchadores de eventos
  document.getElementById('btnRefreshCatalog').addEventListener('click', loadInventory);
  document.getElementById('selectHorizon').addEventListener('change', () => loadForecasts());
  document.getElementById('btnTrainML').addEventListener('click', handleTrainML);
  document.getElementById('btnRunOptimization').addEventListener('click', handleRunOptimization);
  document.getElementById('btnGenerateOrders').addEventListener('click', handleGenerateOrders);
  document.getElementById('filterOrderStatus').addEventListener('change', () => loadOrders());
  document.getElementById('btnRefreshOrders').addEventListener('click', loadOrders);
});

// -----------------------------------------------------------------------------
// NAVEGACIÓN POR VENTANAS / PESTAÑAS
// -----------------------------------------------------------------------------
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.dataset.tab;
      document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
      const targetView = document.getElementById(targetId);
      if (targetView) {
        targetView.classList.add('active');
      }

      // Cargar datos según pestaña
      if (targetId === 'tab-inventory') loadInventory();
      if (targetId === 'tab-forecast') loadForecasts();
      if (targetId === 'tab-budget-plan') loadBudgetCycles();
      if (targetId === 'tab-orders') loadOrders();
    });
  });
}

// -----------------------------------------------------------------------------
// NOTIFICACIONES
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// -----------------------------------------------------------------------------
// SALUD DEL SERVIDOR Y CONEXIÓN
// -----------------------------------------------------------------------------
async function checkServerHealth() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const hostLabel = document.getElementById('currentApiHost');

  try {
    const urlObj = new URL(api.getBaseUrl());
    hostLabel.textContent = urlObj.host;
  } catch (_) {
    hostLabel.textContent = api.getBaseUrl();
  }

  try {
    const health = await api.getHealth();
    if (health.status === 'OK' && health.database?.connected) {
      dot.className = 'status-dot online';
      text.textContent = 'En línea';
    } else {
      dot.className = 'status-dot offline';
      text.textContent = 'Sin base de datos';
    }
  } catch (_) {
    dot.className = 'status-dot offline';
    text.textContent = 'Desconectado';
  }
}

// -----------------------------------------------------------------------------
// MODALES Y AUTENTICACIÓN
// -----------------------------------------------------------------------------
function initModals() {
  // Modal Login
  const loginModal = document.getElementById('loginModal');
  document.getElementById('btnOpenLogin')?.addEventListener('click', () => loginModal.classList.add('active'));
  document.getElementById('btnCloseLogin')?.addEventListener('click', () => loginModal.classList.remove('active'));

  document.getElementById('btnFillAdmin')?.addEventListener('click', () => {
    document.getElementById('loginEmail').value = 'admin@saaml.com';
    document.getElementById('loginPassword').value = 'Admin123*';
  });
  document.getElementById('btnFillGerente')?.addEventListener('click', () => {
    document.getElementById('loginEmail').value = 'gerente@saaml.com';
    document.getElementById('loginPassword').value = 'Gerente123*';
  });

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    try {
      await api.login(email, pass);
      loginModal.classList.remove('active');
      updateUserUI();
      showToast('Sesión iniciada correctamente', 'success');
      loadInventory();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Modal API
  const configModal = document.getElementById('configApiModal');
  document.getElementById('btnConfigApi')?.addEventListener('click', () => {
    document.getElementById('inputApiUrl').value = api.getBaseUrl();
    configModal.classList.add('active');
  });
  document.getElementById('btnCloseConfigApi')?.addEventListener('click', () => configModal.classList.remove('active'));

  document.getElementById('btnSetLocalhost')?.addEventListener('click', () => {
    document.getElementById('inputApiUrl').value = 'http://localhost:8000/api/v1';
  });
  document.getElementById('btnSetRender')?.addEventListener('click', () => {
    document.getElementById('inputApiUrl').value = 'https://saaml.onrender.com/api/v1';
  });

  document.getElementById('btnSaveConfigApi')?.addEventListener('click', async () => {
    const newUrl = document.getElementById('inputApiUrl').value;
    api.setBaseUrl(newUrl);
    configModal.classList.remove('active');
    await checkServerHealth();
    showToast(`Conectado a ${newUrl}`, 'info');
    loadInventory();
  });
}

function updateUserUI() {
  const container = document.getElementById('userContainer');
  if (api.isAuthenticated()) {
    const user = api.getUser() || { email: 'Admin' };
    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 0.8rem; color: #ffffff;">${user.email}</span>
        <button class="btn btn-secondary btn-sm" id="btnLogout">Salir</button>
      </div>
    `;
    document.getElementById('btnLogout').addEventListener('click', () => {
      api.logout();
      updateUserUI();
      showToast('Sesión cerrada', 'info');
    });
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btnOpenLogin">Iniciar Sesión</button>
    `;
    document.getElementById('btnOpenLogin').addEventListener('click', () => {
      document.getElementById('loginModal').classList.add('active');
    });
  }
}

// -----------------------------------------------------------------------------
// VENTANA 1: INVENTARIO DE PRODUCTOS
// -----------------------------------------------------------------------------
async function loadInventory() {
  const tbody = document.getElementById('inventoryTableBody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">Cargando inventario...</td></tr>`;

  try {
    const res = await api.getProducts();
    activeProducts = res.items || [];

    // KPIs
    document.getElementById('kpiTotalSkus').textContent = activeProducts.length;

    let totalVal = 0;
    let lowCount = 0;

    activeProducts.forEach(p => {
      totalVal += (p.stock_actual || 0) * (p.costo_unitario || 0);
      if ((p.stock_actual || 0) < (p.stock_seguridad || 0)) {
        lowCount++;
      }
    });

    document.getElementById('kpiStockValue').textContent = `$${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpiLowStock').textContent = lowCount;

    if (activeProducts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem;">No hay productos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = activeProducts.map(p => {
      const isLow = (p.stock_actual || 0) < (p.stock_seguridad || 0);
      const statusBadge = isLow
        ? `<span class="badge badge-danger">Stock Bajo</span>`
        : `<span class="badge badge-success">Normal</span>`;

      return `
        <tr>
          <td><code style="font-family: var(--font-mono); color: #93c5fd;">${p.sku_code}</code></td>
          <td style="font-weight: 500;">${p.nombre}</td>
          <td><span class="badge badge-neutral">${p.categoria}</span></td>
          <td><strong>${p.stock_actual}</strong></td>
          <td style="color: var(--text-muted);">${p.stock_seguridad}</td>
          <td>$${p.costo_unitario.toFixed(2)}</td>
          <td>$${p.precio_venta.toFixed(2)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 2rem;">Error al conectar con el backend: ${err.message}</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// VENTANA 2: PREDICCIÓN DE VENTAS (DEMANDA)
// -----------------------------------------------------------------------------
async function loadForecasts() {
  const horizonDays = parseInt(document.getElementById('selectHorizon').value, 10) || 14;
  const container = document.getElementById('forecastCardsContainer');
  document.getElementById('kpiForecastDaysSubtitle').textContent = `En los próximos ${horizonDays} días`;
  container.innerHTML = `<p style="color: var(--text-dim); padding: 2rem;">Calculando predicciones...</p>`;

  try {
    const res = await api.getForecastAll(horizonDays);
    activeProjections = res.proyecciones || [];

    let totalDemand = 0;
    let riskCount = 0;
    let safeCount = 0;

    const cardsHtml = activeProjections.map(fc => {
      const demand = Math.round(fc.demanda_total_proyectada || 0);
      totalDemand += demand;

      const stockActual = fc.stock_actual || 0;
      const deficit = Math.max(0, demand - stockActual);

      if (deficit > 0) {
        riskCount++;
      } else {
        safeCount++;
      }

      const alertClass = deficit > 0 ? 'badge-warning' : 'badge-success';
      const alertText = deficit > 0 ? `Faltan ~${deficit} unidades` : 'Stock suficiente';

      return `
        <div class="item-card">
          <div class="item-card-header">
            <div>
              <div class="item-title">${fc.nombre}</div>
              <div class="item-sku">${fc.sku_code}</div>
            </div>
            <span class="badge ${alertClass}">${alertText}</span>
          </div>

          <div class="prediction-stat">
            <span>Ventas estimadas en ${horizonDays} días:</span>
            <span>${demand} unidades</span>
          </div>

          <div class="prediction-stat">
            <span>Stock disponible en bodega:</span>
            <span>${stockActual} unidades</span>
          </div>

          <div class="prediction-stat">
            <span>Rango estimado (Pesimista - Optimista):</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${fc.intervalo_confianza?.p10 || 0} - ${fc.intervalo_confianza?.p90 || 0} uds</span>
          </div>

          ${deficit > 0 ? `
            <div class="recommendation-alert alert-buy">
              <span>Sugerencia: Pedir al proveedor</span>
              <strong>+${deficit} unidades</strong>
            </div>
          ` : `
            <div class="recommendation-alert alert-ok">
              <span>Inventario suficiente</span>
              <strong>Sin compras urgentes</strong>
            </div>
          `}
        </div>
      `;
    }).join('');

    container.innerHTML = cardsHtml;

    document.getElementById('kpiTotalDemandForecast').textContent = `${totalDemand.toLocaleString()} uds`;
    document.getElementById('kpiForecastRiskCount').textContent = riskCount;
    document.getElementById('kpiForecastSafeCount').textContent = safeCount;

  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger); padding: 2rem;">Error al cargar predicciones: ${err.message}</p>`;
  }
}

async function handleTrainML() {
  const btn = document.getElementById('btnTrainML');
  btn.disabled = true;
  btn.textContent = 'Actualizando...';

  try {
    await api.triggerTrainML();
    showToast('Modelo de predicción actualizado con éxito', 'success');
    loadForecasts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar Modelo';
  }
}

// -----------------------------------------------------------------------------
// VENTANA 3: PLAN DE COMPRAS CON PRESUPUESTO
// -----------------------------------------------------------------------------
async function loadBudgetCycles() {
  const select = document.getElementById('optSelectCycle');
  select.innerHTML = '<option value="">Cargando ciclos...</option>';

  try {
    const res = await api.getBudgetCycles();
    const cycles = res.items || [];

    if (cycles.length === 0) {
      select.innerHTML = '<option value="">No hay ciclos presupuestales</option>';
      return;
    }

    select.innerHTML = cycles.map(c => {
      const libre = c.presupuesto_total_asignado - (c.presupuesto_comprometido || 0);
      return `<option value="${c._id}">${c.codigo_ciclo} (${c.periodo}) - Saldo: $${libre.toLocaleString('en-US')}</option>`;
    }).join('');

  } catch (err) {
    select.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

async function handleRunOptimization() {
  const cycleId = document.getElementById('optSelectCycle').value;
  const budget = parseFloat(document.getElementById('optInputBudget').value) || 15000;
  const days = parseInt(document.getElementById('optInputDays').value, 10) || 14;

  if (!cycleId) {
    showToast('Selecciona un ciclo presupuestal', 'error');
    return;
  }

  const btn = document.getElementById('btnRunOptimization');
  btn.disabled = true;
  btn.textContent = 'Calculando...';

  try {
    const res = await api.runOptimization({
      ciclo_presupuestal_id: cycleId,
      presupuesto_limite: budget,
      horizon_days: days,
      considerar_volumen_almacen: true,
      factor_seguridad: 1.0
    });

    const s = res.sesion;
    lastOptimizationSessionId = s._id;

    // Métricas de resultado
    document.getElementById('optResSpent').textContent = `$${s.presupuesto_total_asignado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('optResRemaining').textContent = `Presupuesto sobrante: $${s.presupuesto_remanente.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('optResCoverage').textContent = `${s.demanda_total_cubierta_porcentaje}%`;
    document.getElementById('optResCount').textContent = s.skus_seleccionados_conteo;

    // Tabla de compras sugeridas
    const tbody = document.getElementById('optItemsTableBody');
    const items = s.items_recomendados || [];

    tbody.innerHTML = items.map(item => `
      <tr>
        <td><code style="font-family: var(--font-mono); color: #93c5fd;">${item.sku_code}</code></td>
        <td style="font-weight: 500;">${item.nombre_producto}</td>
        <td><span class="badge badge-neutral">${item.proveedor_nombre}</span></td>
        <td>${item.demanda_proyectada} uds</td>
        <td>${item.stock_actual} uds</td>
        <td style="color: var(--warning); font-weight: 600;">${item.deficit_unidades} uds</td>
        <td><strong>${item.cantidad_sugerida_ml} uds</strong></td>
        <td>$${item.costo_unitario.toFixed(2)}</td>
        <td style="font-weight: 700; color: #ffffff;">$${item.subtotal.toFixed(2)}</td>
      </tr>
    `).join('');

    document.getElementById('optimizationResultsBlock').style.display = 'block';
    showToast('Plan de compras calculado con éxito', 'success');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Calcular Compras Óptimas';
  }
}

async function handleGenerateOrders() {
  if (!lastOptimizationSessionId) {
    showToast('Primero debes calcular un plan de compras', 'error');
    return;
  }

  const btn = document.getElementById('btnGenerateOrders');
  btn.disabled = true;
  btn.textContent = 'Generando órdenes...';

  try {
    const res = await api.generateOrdersFromSession(lastOptimizationSessionId);
    showToast(res.message, 'success');

    // Cambiar automáticamente a la ventana de órdenes
    document.querySelector('[data-tab="tab-orders"]').click();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generar Órdenes de Compra';
  }
}

// -----------------------------------------------------------------------------
// VENTANA 4: ÓRDENES DE COMPRA
// -----------------------------------------------------------------------------
async function loadOrders() {
  const container = document.getElementById('ordersContainer');
  const filter = document.getElementById('filterOrderStatus').value;
  container.innerHTML = '<p style="color: var(--text-dim); padding: 2rem;">Cargando órdenes...</p>';

  try {
    const res = await api.getOrders(filter);
    const orders = res.items || [];

    if (orders.length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); padding: 2rem; text-align: center;">No hay órdenes de compra registradas para este filtro.</p>';
      return;
    }

    container.innerHTML = orders.map(ord => {
      const isDraft = ord.estado === 'BORRADOR_PROPUESTA';
      const isApproved = ord.estado === 'APROBADA';

      const badgeClass = isDraft ? 'badge-warning' : isApproved ? 'badge-success' : 'badge-neutral';
      const statusLabel = isDraft ? 'Borrador pendiente' : isApproved ? 'Aprobada' : ord.estado;

      const dateStr = new Date(ord.fecha_generacion).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const etaStr = ord.fecha_entrega_estimada ? new Date(ord.fecha_entrega_estimada).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

      const itemsRows = (ord.items || []).map(it => `
        <tr>
          <td><code style="font-family: var(--font-mono); color: #93c5fd;">${it.sku_code}</code></td>
          <td>${it.nombre_producto}</td>
          <td><strong>${it.cantidad_sugerida_ml} uds</strong></td>
          <td>$${it.costo_unitario?.toFixed(2)}</td>
          <td style="font-weight: 700;">$${it.subtotal?.toFixed(2)}</td>
        </tr>
      `).join('');

      return `
        <div class="table-card" style="padding: 1.25rem;" id="order-${ord._id}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border-light); padding-bottom: 0.75rem;">
            <div>
              <span style="font-family: var(--font-mono); font-weight: 700; font-size: 1.05rem; color: #ffffff;">${ord.codigo_orden}</span>
              <span class="badge ${badgeClass}" style="margin-left: 0.5rem;">${statusLabel}</span>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
                Fecha: ${dateStr} | Llegada estimada: <strong>${etaStr}</strong>
              </div>
            </div>

            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">Total Orden</div>
              <div style="font-size: 1.3rem; font-weight: 700; color: #ffffff;">$${ord.costo_total_orden?.toFixed(2)} USD</div>
            </div>
          </div>

          <div class="table-wrapper" style="margin-bottom: 1rem;">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Cantidad Pedida</th>
                  <th>Costo Unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          ${isDraft ? `
            <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
              <button class="btn btn-danger btn-sm btn-cancel-ord" data-id="${ord._id}">Cancelar</button>
              <button class="btn btn-success btn-sm btn-approve-ord" data-id="${ord._id}">Aprobar Orden</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Listeners de aprobación y cancelación
    container.querySelectorAll('.btn-approve-ord').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api.approveOrder(id);
          showToast('Orden aprobada correctamente', 'success');
          loadOrders();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-cancel-ord').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('¿Deseas cancelar esta orden? El presupuesto volverá a estar disponible.')) return;
        try {
          await api.cancelOrder(id);
          showToast('Orden cancelada y presupuesto liberado', 'info');
          loadOrders();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger); padding: 2rem;">Error al cargar órdenes: ${err.message}</p>`;
  }
}
