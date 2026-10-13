# SAAML Frontend - Panel de Control & Demostración

Dashboard interactivo y cliente web para el **Sistema de Aprovisionamiento Autónomo basado en Machine Learning y Restricciones Presupuestales (SAAML)**.

Desarrollado con **Vite**, **Vanilla JavaScript** y diseño moderno **Dark Glassmorphic**.

---

## 🚀 Puesta en Marcha Local

### 1. Instalar Dependencias
Desde la carpeta del frontend:
```powershell
npm install
```

### 2. Ejecutar en Modo Desarrollo
```powershell
npm run dev
```
La aplicación abrirá automáticamente en tu navegador en:
👉 [http://localhost:3000](http://localhost:3000)

---

## 🌐 Conexión con Backend (Localhost vs Render)

En la esquina superior derecha del panel encontrarás el botón de configuración de API:
* **Local:** Por defecto se conecta a `http://localhost:8000/api/v1`.
* **Render:** Haz clic en el botón de engranaje (⚙️), selecciona **Render URL** o ingresa la URL de tu backend desplegado (ej. `https://saaml-api.onrender.com/api/v1`), haz clic en **Guardar y Reconectar**.

---

## ☁️ Despliegue en Vercel (1 Clic)

1. Sube esta carpeta a un nuevo repositorio independiente en GitHub (por ejemplo, `SAAML-frontend`).
2. Entra a [Vercel](https://vercel.com) e importa el repositorio `SAAML-frontend`.
3. Vercel detectará automáticamente la configuración de Vite:
   * **Framework Preset:** `Vite`
   * **Build Command:** `vite build`
   * **Output Directory:** `dist`
4. Haz clic en **Deploy**. ¡Tu frontend estará en vivo en segundos!

---

## 🔑 Credenciales de Prueba para la Demo

En el modal de inicio de sesión puedes usar los botones rápidos o ingresar:
* **Administrador:** `admin@saaml.com` / `Admin123*`
* **Gerente de Compras:** `gerente@saaml.com` / `Gerente123*`

---

## 📋 Flujo de la Presentación de Avance

1. **Catálogo & Stock (RF01):** Visualiza los 5 SKUs, costos unitarios, stock actual y alertas de quiebre.
2. **Predicción ML (RF02 / RF06):** Selecciona el horizonte (7, 14, 30 días) y revisa la demanda proyectada, las bandas de confianza ($P_{10}$ y $P_{90}$) y el gráfico de barras.
3. **Optimizador Knapsack (RF04):** Ajusta el presupuesto de prueba (ej. $15,000 USD), haz clic en **Resolver Knapsack** y observa la resolución matemática óptima en milisegundos con el desglose de productos y cobertura.
4. **Órdenes de Compra (RF05):** Haz clic en **Generar Órdenes de Compra Propuestas**, ajusta las cantidades si lo deseas y haz clic en **Aprobar Orden**.
