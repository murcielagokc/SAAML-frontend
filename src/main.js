import { api } from './api.js';

// Estado global de la aplicación
let activeProducts = [];
let activeProjections = [];
let lastOptimizationResult = null;
let activeCycleId = null;

// Inicialización de la Aplicación
document.addEventListener('DOMContentLoaded', async () => {
  initModals();
  await checkServerHealth();
  updateUserUI();

  // Si no está autenticado, intentar auto-login con demo para que funcione inmediatamente
  if (!api.isAuthenticated()) {
    try {
      await api.login('admin@saaml.com', 'Admin123*');
      updateUserUI();
    } catch (_) {}
  }

  // Cargar datos iniciales
  await loadDashboardData();

  // Escuchadores de eventos
  document.getElementById('selectHorizon').addEventListener('change', () => loadDashboardData());
  document.getElementById('btnRunPredictionAndPlan').addEventListener('click', handleRunPlan);
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
// SALUD DEL SERVIDOR & CONFIGURACIÓN
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
      text.textContent = '🟢 Sistema en línea (Atlas Conectado)';
    } else {
      dot.className = 'status-dot disconnected';
      text.textContent = 'API OK (Base de datos sin conexión)';
    }
  } catch (err) {
    dot.className = 'status-dot disconnected';
    text.textContent = '🔴 Servidor desconectado';
  }
}

// -----------------------------------------------------------------------------
// GESTIÓN DE SESIÓN Y MODALES
// -----------------------------------------------------------------------------
function initModals() {
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
      showToast('Sesión iniciada con éxito', 'success');
      loadDashboardData();
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
    showToast(`Conectado a: ${newUrl}`, 'info');
    loadDashboardData();
  });
}

function updateUserUI() {
  const container = document.getElementById('userContainer');
  if (api.isAuthenticated()) {
    const user = api.getUser() || { email: 'Admin', rol: 'ADMIN' };
    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span style="font-size: 0.85rem; font-weight: 700; color: #ffffff;">👤 ${user.nombre_completo || user.email}</span>
        <button class="btn btn-secondary btn-sm" id="btnLogout" title="Salir">Salir</button>
      </div>
    `;
    document.getElementById('btnLogout').addEventListener('click', () => {
      api.logout();
      updateUserUI();
      showToast('Sesión cerrada', 'info');
    });
  } else {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btnOpenLogin">👤 Ingresar</button>
    `;
    document.getElementById('btnOpenLogin').addEventListener('click', () => {
      document.getElementById('loginModal').classList.add('active');
    });
  }
}

// -----------------------------------------------------------------------------
// CARGA Y CÁLCULO PRINCIPAL DEL DASHBOARD
// -----------------------------------------------------------------------------
async function loadDashboardData() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Consultando catálogo e inferencia de Machine Learning...</p>
    </div>
  `;

  const horizonDays = parseInt(document.getElementById('selectHorizon').value, 10) || 14;
  document.getElementById('kpiDemandHorizon').textContent = `En los próximos ${horizonDays} días`;

  try {
    // 1. Obtener catálogo y ciclos presupuestales en paralelo
    const [prodRes, cycleRes] = await Promise.all([
      api.getProducts(),
      api.getBudgetCycles()
    ]);

    activeProducts = prodRes.items || [];
    const cycles = cycleRes.items || [];
    if (cycles.length > 0) {
      activeCycleId = cycles[0]._id;
    }

    if (activeProducts.length === 0) {
      grid.innerHTML = `<p style="text-align: center; color: var(--text-dim); grid-column: 1/-1;">No hay productos registrados en el catálogo.</p>`;
      return;
    }

    // 2. Obtener pronósticos de ML para el horizonte seleccionado
    const forecastRes = await api.getForecastAll(horizonDays);
    activeProjections = forecastRes.proyecciones || [];

    // Mapear proyecciones por SKU
    const projectionMap = {};
    activeProjections.forEach(p => {
      projectionMap[p.sku_code] = p;
    });

    // 3. Calcular métricas y construir tarjetas visuales
    let totalDemandUnits = 0;
    let riskCount = 0;
    let totalRecommendedCost = 0;

    const cardsHtml = activeProducts.map(prod => {
      const fc = projectionMap[prod.sku_code] || { demanda_total_proyectada: 0 };
      const expectedDemand = Math.round(fc.demanda_total_proyectada || 0);
      totalDemandUnits += expectedDemand;

      const stockActual = prod.stock_actual || 0;
      const stockSeguridad = prod.stock_seguridad || 0;

      // Cálculo del déficit neto
      const deficit = Math.max(0, expectedDemand + stockSeguridad - stockActual);
      const isRisk = deficit > 0;

      if (isRisk) {
        riskCount++;
      }

      // Cálculo de compra ajustada a lotes y MOQ
      const lote = prod.incremento_lote || 1;
      const moq = prod.moq || 1;
      let unitsToOrder = 0;
      let orderCost = 0;

      if (deficit > 0) {
        const minUnits = Math.max(moq, lote);
        const batches = Math.max(Math.ceil(minUnits / lote), Math.ceil(deficit / lote));
        unitsToOrder = batches * lote;
        orderCost = unitsToOrder * (prod.costo_unitario || 0);
        totalRecommendedCost += orderCost;
      }

      // Porcentaje de cobertura de stock
      const stockCoveragePct = expectedDemand > 0 ? Math.min(100, Math.round((stockActual / expectedDemand) * 100)) : 100;

      // Estimación de días de stock restantes
      const dailySalesRate = expectedDemand / horizonDays;
      const daysOfStockLeft = dailySalesRate > 0 ? Math.max(0, Math.round(stockActual / dailySalesRate)) : 99;

      const alertText = isRisk
        ? `⚠️ Se agotará en aprox. ${daysOfStockLeft} días si no se compra`
        : `✅ Inventario suficiente para cubrir los ${horizonDays} días`;

      const alertClass = isRisk ? 'risk' : 'safe';
      const cardClass = isRisk ? 'risk' : 'safe';

      return `
        <div class="product-card ${cardClass}">
          <div>
            <div class="product-card-header">
              <div>
                <span class="product-sku">${prod.sku_code}</span>
                <h3 class="product-name">${prod.nombre}</h3>
                <span class="product-category">${prod.categoria}</span>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 0.75rem; color: var(--text-muted);">PRECIO VENTA</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #ffffff;">$${prod.precio_venta.toFixed(2)}</div>
              </div>
            </div>

            <!-- Caja Principal de Predicción -->
            <div class="prediction-box">
              <div class="prediction-highlight">
                <span class="prediction-title">Ventas Esperadas (IA):</span>
                <span class="prediction-number">${expectedDemand} uds</span>
              </div>

              <div class="stock-meter">
                <span>Stock Actual: <strong>${stockActual} uds</strong></span>
                <span>Cobertura: <strong>${stockCoveragePct}%</strong></span>
              </div>

              <div class="meter-bar">
                <div class="meter-fill ${alertClass}" style="width: ${stockCoveragePct}%;"></div>
              </div>

              <div class="status-alert ${alertClass}">
                ${alertText}
              </div>
            </div>
          </div>

          <!-- Recomendación de Compra Clara -->
          <div class="purchase-recommendation">
            <div class="recommendation-title">Sugerencia Automática de Compra:</div>
            ${isRisk ? `
              <div class="recommendation-action">
                👉 Comprar <strong>${unitsToOrder} unidades</strong>
              </div>
              <div class="recommendation-cost">
                Inversión estimada: <strong>$${orderCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong> (en paquetes de ${lote} uds)
              </div>
            ` : `
              <div class="recommendation-action" style="color: var(--success);">
                ✓ No requiere compra en este ciclo
              </div>
              <div class="recommendation-cost">
                El inventario actual cubre la demanda esperada sin riesgo.
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');

    grid.innerHTML = cardsHtml;

    // Actualizar Resumen Ejecutivo
    document.getElementById('kpiTotalDemand').textContent = `${totalDemandUnits.toLocaleString()} uds`;
    document.getElementById('kpiRiskCount').textContent = `${riskCount} de ${activeProducts.length}`;
    document.getElementById('kpiRecommendedBudget').textContent = `$${totalRecommendedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const userBudget = parseFloat(document.getElementById('inputBudget').value) || 15000;
    if (totalRecommendedCost <= userBudget) {
      document.getElementById('kpiBudgetStatus').textContent = `Totalmente viable (Te sobran $${(userBudget - totalRecommendedCost).toLocaleString('en-US')})`;
      document.getElementById('kpiBudgetStatus').style.color = 'var(--success)';
    } else {
      document.getElementById('kpiBudgetStatus').textContent = `Supera el presupuesto (Faltan $${(totalRecommendedCost - userBudget).toLocaleString('en-US')})`;
      document.getElementById('kpiBudgetStatus').style.color = 'var(--warning)';
    }

  } catch (err) {
    grid.innerHTML = `<p style="text-align: center; color: var(--danger); grid-column: 1/-1;">Error al consultar datos: ${err.message}. Asegúrate de que el backend esté corriendo en localhost:8000.</p>`;
  }
}

// -----------------------------------------------------------------------------
// BOTÓN: CALCULAR Y OPTIMIZAR PLAN DE COMPRAS
// -----------------------------------------------------------------------------
async function handleRunPlan() {
  const btn = document.getElementById('btnRunPredictionAndPlan');
  const userBudget = parseFloat(document.getElementById('inputBudget').value) || 15000;
  const horizonDays = parseInt(document.getElementById('selectHorizon').value, 10) || 14;

  if (!activeCycleId) {
    showToast('No se encontró un ciclo presupuestal activo en el backend.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Optimizando compras con presupuesto...';

  try {
    // 1. Ejecutar el optimizador en el backend
    const optRes = await api.runOptimization({
      ciclo_presupuestal_id: activeCycleId,
      presupuesto_limite: userBudget,
      horizon_days: horizonDays,
      considerar_volumen_almacen: true,
      factor_seguridad: 1.0
    });

    lastOptimizationResult = optRes.sesion;
    showToast(`¡Plan optimizado! ${lastOptimizationResult.skus_seleccionados_conteo} productos seleccionados en ${lastOptimizationResult.tiempo_ejecucion_ms} ms`, 'success');

    // 2. Generar automáticamente las órdenes de compra propuestas
    const orderRes = await api.generateOrdersFromSession(lastOptimizationResult._id);
    showToast('Órdenes de compra generadas por proveedor.', 'success');

    // 3. Renderizar las órdenes generadas
    renderOrdersSection(orderRes.ordenes || []);

  } catch (err) {
    showToast(`Error al generar el plan: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Calcular Predicciones y Plan de Compras';
  }
}

// -----------------------------------------------------------------------------
// SECCIÓN DE ÓRDENES GENERADAS
// -----------------------------------------------------------------------------
function renderOrdersSection(orders) {
  const section = document.getElementById('ordersSection');
  const container = document.getElementById('ordersCardsContainer');

  if (!orders || orders.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  container.innerHTML = orders.map(ord => {
    const totalCostStr = ord.costo_total_orden?.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const etaDate = ord.fecha_entrega_estimada ? new Date(ord.fecha_entrega_estimada).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Próximos días';

    const itemsListHtml = (ord.items || []).map(it => `
      <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div>
          <strong>${it.nombre_producto}</strong> <span style="color: var(--text-dim);">(${it.sku_code})</span>
        </div>
        <div>
          <span>${it.cantidad_sugerida_ml} unidades</span> — <strong style="color: #ffffff;">$${it.subtotal.toFixed(2)}</strong>
        </div>
      </div>
    `).join('');

    return `
      <div class="order-banner-card" id="order-card-${ord._id}">
        <div class="order-banner-header">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="order-code">${ord.codigo_orden}</span>
              <span class="order-badge draft">Propuesta en Borrador</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.35rem;">
              Fecha estimada de llegada: <strong>${etaDate}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.75rem; color: var(--text-dim);">INVERSIÓN TOTAL</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #ffffff;">$${totalCostStr} USD</div>
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Productos incluidos en este pedido:</div>
          ${itemsListHtml}
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button class="btn btn-success btn-approve" data-id="${ord._id}">
            ✅ Aprobar Orden para Despacho
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Asignar listeners de aprobación
  container.querySelectorAll('.btn-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = 'Aprobando...';
      try {
        await api.approveOrder(orderId);
        showToast('¡Orden de compra aprobada exitosamente!', 'success');
        const card = document.getElementById(`order-card-${orderId}`);
        const badge = card.querySelector('.order-badge');
        badge.className = 'order-badge approved';
        badge.textContent = '✓ Aprobada Formalmente';
        btn.remove();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✅ Aprobar Orden para Despacho';
      }
    });
  });

  // Scroll suave hacia la sección de órdenes
  section.scrollIntoView({ behavior: 'smooth' });
}
