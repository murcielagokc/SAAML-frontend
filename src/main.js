import { api } from './api.js';

// Estado global de la aplicación
let lastOptimizationSessionId = null;
let currentProducts = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initModals();
  checkServerHealth();
  updateUserUI();

  // Cargar catálogo inicial
  loadCatalog();

  // Event Listeners
  document.getElementById('btnRefreshCatalog').addEventListener('click', loadCatalog);
  document.getElementById('selectHorizon').addEventListener('change', () => loadForecasts());
  document.getElementById('btnTrainML').addEventListener('click', handleTrainML);
  document.getElementById('btnRunOptimization').addEventListener('click', handleRunOptimization);
  document.getElementById('btnGenerateOrdersFromOpt').addEventListener('click', handleGenerateOrdersFromOpt);
  document.getElementById('filterOrderStatus').addEventListener('change', () => loadOrders());
  document.getElementById('btnRefreshOrders').addEventListener('click', loadOrders);
});

// -----------------------------------------------------------------------------
// NOTIFICACIONES TOAST
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// -----------------------------------------------------------------------------
// PESTAÑAS
// -----------------------------------------------------------------------------
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.style.display = 'block';
      }

      // Carga perezosa de datos según pestaña
      if (targetId === 'tab-ml') loadForecasts();
      if (targetId === 'tab-optimizer') loadBudgetCycles();
      if (targetId === 'tab-orders') loadOrders();
    });
  });
}

// -----------------------------------------------------------------------------
// SALUD DEL SERVIDOR & API CONFIG
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
      dot.className = 'status-dot connected';
      text.textContent = 'En línea (Atlas OK)';
    } else {
      dot.className = 'status-dot disconnected';
      text.textContent = 'API OK (BD desconectada)';
    }
  } catch (err) {
    dot.className = 'status-dot disconnected';
    text.textContent = 'Desconectado';
  }
}

// -----------------------------------------------------------------------------
// AUTENTICACIÓN & MODALES
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
      loadCatalog();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Modal Config API
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

  document.getElementById('btnSaveConfigApi')?.addEventListener('click', () => {
    const newUrl = document.getElementById('inputApiUrl').value;
    api.setBaseUrl(newUrl);
    configModal.classList.remove('active');
    checkServerHealth();
    showToast(`URL de API actualizada: ${newUrl}`, 'info');
    loadCatalog();
  });
}

function updateUserUI() {
  const container = document.getElementById('userContainer');
  if (api.isAuthenticated()) {
    const user = api.getUser() || { email: 'Usuario', rol: 'OPERADOR' };
    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="text-align: right; line-height: 1.2;">
          <div style="font-size: 0.82rem; font-weight: 700; color: #ffffff;">${user.email}</div>
          <span class="badge badge-blue" style="font-size: 0.65rem;">${user.rol}</span>
        </div>
        <button class="btn btn-secondary btn-sm" id="btnLogout" title="Cerrar sesión">Salir</button>
      </div>
    `;
    document.getElementById('btnLogout').addEventListener('click', () => {
      api.logout();
      updateUserUI();
      showToast('Sesión finalizada', 'info');
    });
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btnOpenLogin">
        👤 Iniciar Sesión
      </button>
    `;
    document.getElementById('btnOpenLogin').addEventListener('click', () => {
      document.getElementById('loginModal').classList.add('active');
    });
  }
}

// -----------------------------------------------------------------------------
// PANEL 1: CATÁLOGO DE PRODUCTOS (RF01)
// -----------------------------------------------------------------------------
async function loadCatalog() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">Cargando catálogo...</td></tr>`;

  try {
    const res = await api.getProducts();
    currentProducts = res.items || [];

    // KPIs
    document.getElementById('kpiTotalSkus').textContent = currentProducts.length;

    let totalVal = 0;
    let riskCount = 0;

    currentProducts.forEach(p => {
      totalVal += (p.stock_actual || 0) * (p.costo_unitario || 0);
      if ((p.stock_actual || 0) < (p.stock_seguridad || 0)) {
        riskCount++;
      }
    });

    document.getElementById('kpiStockValue').textContent = `$${totalVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpiStockRisk').textContent = riskCount;

    if (currentProducts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">No hay productos registrados en el catálogo.</td></tr>`;
      return;
    }

    tbody.innerHTML = currentProducts.map(p => {
      const isRisk = (p.stock_actual || 0) < (p.stock_seguridad || 0);
      const stockBadge = isRisk 
        ? `<span class="badge badge-red">${p.stock_actual} (Quiebre)</span>`
        : `<span class="badge badge-green">${p.stock_actual}</span>`;

      const margen = p.precio_venta - p.costo_unitario;
      const margenPct = Math.round((margen / p.precio_venta) * 100);

      return `
        <tr>
          <td><code style="color: #818cf8; font-weight: 700;">${p.sku_code}</code></td>
          <td style="font-weight: 600;">${p.nombre}</td>
          <td><span class="badge badge-blue">${p.categoria}</span></td>
          <td>${stockBadge}</td>
          <td>${p.stock_seguridad}</td>
          <td>$${p.costo_unitario.toFixed(2)}</td>
          <td>$${p.precio_venta.toFixed(2)}</td>
          <td style="color: var(--accent-emerald); font-weight: 700;">+$${margen.toFixed(2)} (${margenPct}%)</td>
          <td>Lote: ${p.incremento_lote} / MOQ: ${p.moq}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--accent-rose);">Error al cargar catálogo: ${err.message}. Asegúrate de iniciar sesión si es requerido.</td></tr>`;
  }
}

// -----------------------------------------------------------------------------
// PANEL 2: PRONÓSTICOS MACHINE LEARNING (RF02, RF06)
// -----------------------------------------------------------------------------
async function loadForecasts() {
  const horizon = parseInt(document.getElementById('selectHorizon').value, 10) || 14;
  const container = document.getElementById('forecastCardsContainer');
  container.innerHTML = `<p style="color: var(--text-dim);">Calculando proyecciones para horizonte de ${horizon} días...</p>`;

  try {
    const res = await api.getForecastAll(horizon);
    const projections = res.proyecciones || [];

    if (projections.length === 0) {
      container.innerHTML = `<p style="color: var(--text-dim);">No se encontraron proyecciones generadas.</p>`;
      return;
    }

    container.innerHTML = projections.map(fc => {
      const daily = fc.proyeccion_diaria || [];
      const maxVal = Math.max(...daily.map(d => d.demanda_estimada), 1);

      const chartBars = daily.slice(0, 14).map(d => {
        const heightPct = Math.round((d.demanda_estimada / maxVal) * 100);
        const dayLabel = d.fecha.slice(5); // MM-DD
        return `
          <div class="bar-col" title="${d.fecha}: ${d.demanda_estimada} unidades">
            <span class="bar-val">${d.demanda_estimada}</span>
            <div class="bar-fill" style="height: ${heightPct}%;"></div>
            <span class="bar-label">${dayLabel}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="metric-card" style="padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
            <div>
              <code style="color: #818cf8; font-weight: 700;">${fc.sku_code}</code>
              <h3 style="font-size: 1.05rem; font-weight: 700; margin-top: 0.2rem;">${fc.nombre}</h3>
            </div>
            <span class="badge badge-blue">Stock: ${fc.stock_actual}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: var(--radius-sm); margin-bottom: 1rem; text-align: center;">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">P10 PESIMISTA</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #fbbf24;">${fc.intervalo_confianza?.p10}</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; color: #818cf8; font-weight: 700;">DEMANDA ML</div>
              <div style="font-size: 1.35rem; font-weight: 800; color: #ffffff;">${fc.demanda_total_proyectada}</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">P90 OPTIMISTA</div>
              <div style="font-size: 1.1rem; font-weight: 700; color: #34d399;">${fc.intervalo_confianza?.p90}</div>
            </div>
          </div>

          <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Curva de Demanda Diaria:</div>
          <div class="chart-container">
            ${chartBars}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Error al cargar pronósticos: ${err.message}</p>`;
  }
}

async function handleTrainML() {
  const btn = document.getElementById('btnTrainML');
  btn.disabled = true;
  btn.textContent = '⏳ Entrenando en Atlas...';

  try {
    const res = await api.triggerTrainML();
    showToast('Reentrenamiento completado con éxito', 'success');
    loadForecasts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Reentrenar Modelo (RF06)';
  }
}

// -----------------------------------------------------------------------------
// PANEL 3: OPTIMIZACIÓN KNAPSACK (RF04)
// -----------------------------------------------------------------------------
async function loadBudgetCycles() {
  const select = document.getElementById('optSelectCycle');
  select.innerHTML = '<option value="">Cargando ciclos...</option>';

  try {
    const res = await api.getBudgetCycles();
    const cycles = res.items || [];

    if (cycles.length === 0) {
      select.innerHTML = '<option value="">No hay ciclos disponibles</option>';
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
    showToast('Selecciona un ciclo presupuestal activo', 'error');
    return;
  }

  const btn = document.getElementById('btnRunOptimization');
  btn.disabled = true;
  btn.textContent = '⏳ Resolviendo MILP...';

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

    // Mostrar métricas del resultado
    document.getElementById('optResStatus').textContent = s.solver_status;
    document.getElementById('optResTime').textContent = `Tiempo: ${s.tiempo_ejecucion_ms} ms (< 30s RNF01)`;
    document.getElementById('optResSpent').textContent = `$${s.presupuesto_total_asignado.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('optResRemaining').textContent = `Remanente: $${s.presupuesto_remanente.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('optResCoverage').textContent = `${s.demanda_total_cubierta_porcentaje}%`;
    document.getElementById('optResSkusCount').textContent = `${s.skus_seleccionados_conteo} SKUs seleccionados`;

    // Renderizar tabla de recomendaciones
    const tbody = document.getElementById('optItemsTableBody');
    const items = s.items_recomendados || [];

    tbody.innerHTML = items.map(item => `
      <tr>
        <td><code style="color: #818cf8; font-weight: 700;">${item.sku_code}</code></td>
        <td style="font-weight: 600;">${item.nombre_producto}</td>
        <td><span class="badge badge-blue">${item.proveedor_nombre}</span></td>
        <td>${item.demanda_proyectada}</td>
        <td>${item.stock_actual}</td>
        <td style="color: #fbbf24; font-weight: 700;">${item.deficit_unidades}</td>
        <td><span class="badge badge-green" style="font-size: 0.9rem;">${item.cantidad_sugerida_ml} uds</span></td>
        <td>$${item.costo_unitario.toFixed(2)}</td>
        <td style="font-weight: 800; color: #ffffff;">$${item.subtotal.toFixed(2)}</td>
        <td><span class="badge badge-green">${item.cobertura_deficit_porcentaje}%</span></td>
      </tr>
    `).join('');

    document.getElementById('optimizationResultWrapper').style.display = 'block';
    showToast(`Optimización ${s.solver_status} completada en ${s.tiempo_ejecucion_ms} ms`, 'success');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Resolver Knapsack';
  }
}

async function handleGenerateOrdersFromOpt() {
  if (!lastOptimizationSessionId) {
    showToast('No hay una sesión de optimización activa.', 'error');
    return;
  }

  const btn = document.getElementById('btnGenerateOrdersFromOpt');
  btn.disabled = true;
  btn.textContent = '⏳ Generando órdenes...';

  try {
    const res = await api.generateOrdersFromSession(lastOptimizationSessionId);
    showToast(res.message, 'success');

    // Cambiar a la pestaña de órdenes
    document.querySelector('[data-tab="tab-orders"]').click();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📄 Generar Órdenes de Compra Propuestas (RF05)';
  }
}

// -----------------------------------------------------------------------------
// PANEL 4: ÓRDENES DE COMPRA (RF05)
// -----------------------------------------------------------------------------
async function loadOrders() {
  const container = document.getElementById('ordersListContainer');
  const filter = document.getElementById('filterOrderStatus').value;
  container.innerHTML = '<p style="color: var(--text-dim);">Cargando órdenes de compra...</p>';

  try {
    const res = await api.getOrders(filter);
    const orders = res.items || [];

    if (orders.length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 2rem;">No se encontraron órdenes de compra para el filtro seleccionado.</p>';
      return;
    }

    container.innerHTML = orders.map(ord => {
      const isDraft = ord.estado === 'BORRADOR_PROPUESTA';
      const isApproved = ord.estado === 'APROBADA';
      const isReceived = ord.estado === 'RECIBIDA_TOTAL';

      const badgeClass = isDraft ? 'badge-yellow' : isApproved ? 'badge-green' : isReceived ? 'badge-blue' : 'badge-red';
      const dateStr = new Date(ord.fecha_generacion).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
      const etaStr = ord.fecha_entrega_estimada ? new Date(ord.fecha_entrega_estimada).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

      const itemsRows = (ord.items || []).map((it, idx) => `
        <tr>
          <td><code style="color: #818cf8; font-weight: 700;">${it.sku_code}</code></td>
          <td>${it.nombre_producto}</td>
          <td>${it.cantidad_sugerida_ml} uds</td>
          <td>
            ${isDraft 
              ? `<input type="number" class="form-input ord-item-qty" data-sku="${it.sku_code}" value="${it.cantidad_final_aprobada}" min="0" style="width: 90px; padding: 0.3rem 0.5rem; text-align: center;">`
              : `<span style="font-weight: 700; color: #ffffff;">${it.cantidad_final_aprobada} uds</span>`
            }
          </td>
          <td>$${it.costo_unitario?.toFixed(2)}</td>
          <td style="font-weight: 700; color: #ffffff;">$${it.subtotal?.toFixed(2)}</td>
        </tr>
      `).join('');

      return `
        <div class="metric-card" style="padding: 1.5rem;" id="card-${ord._id}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <h3 style="font-size: 1.25rem; font-weight: 800; font-family: var(--font-mono); color: #ffffff;">${ord.codigo_orden}</h3>
                <span class="badge ${badgeClass}">${ord.estado}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.35rem;">
                Emisión: <strong>${dateStr}</strong> | Entrega Estimada: <strong>${etaStr}</strong>
              </div>
            </div>

            <div style="text-align: right;">
              <div style="font-size: 0.75rem; color: var(--text-muted);">MONTO TOTAL</div>
              <div style="font-size: 1.5rem; font-weight: 800; color: #ffffff;">$${ord.costo_total_orden?.toFixed(2)}</div>
            </div>
          </div>

          <div class="table-responsive" style="margin-bottom: 1.25rem;">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Sugerido ML</th>
                  <th>Cantidad Final</th>
                  <th>Costo Unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          ${isDraft ? `
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <button class="btn btn-secondary btn-sm btn-save-qty" data-id="${ord._id}">💾 Guardar Cantidades</button>
              <button class="btn btn-danger btn-sm btn-cancel-order" data-id="${ord._id}">Cancelar</button>
              <button class="btn btn-success btn-sm btn-approve-order" data-id="${ord._id}">✅ Aprobar Orden</button>
            </div>
          ` : ''}

          ${isApproved ? `
            <div style="font-size: 0.8rem; color: var(--accent-emerald); text-align: right;">
              ✓ Orden formalmente aprobada y lista para despacho con el proveedor.
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Asignar listeners a botones de órdenes
    container.querySelectorAll('.btn-approve-order').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api.approveOrder(id);
          showToast('Orden aprobada exitosamente', 'success');
          loadOrders();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-cancel-order').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('¿Estás seguro de cancelar esta orden? Se liberará el presupuesto comprometido.')) return;
        try {
          await api.cancelOrder(id);
          showToast('Orden cancelada y presupuesto liberado', 'info');
          loadOrders();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-save-qty').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const card = document.getElementById(`card-${id}`);
        const inputs = card.querySelectorAll('.ord-item-qty');
        const adjustments = [];
        inputs.forEach(input => {
          adjustments.push({
            sku_code: input.dataset.sku,
            cantidad_final_aprobada: parseInt(input.value, 10) || 0
          });
        });

        try {
          const res = await api.adjustOrderItems(id, adjustments);
          showToast(res.message, 'success');
          loadOrders();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-rose);">Error al cargar órdenes: ${err.message}</p>`;
  }
}
