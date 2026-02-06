/* =========================================================
   Yukitas POS - JS completo (pegar dentro de <script>...</script>)
   - Clientes, Recibos, Stock
   - Producción con costo (lotes)
   - Reporte mensual (ventas/producción/costos/gastos)
   - Sync a Firestore vía window.cloud.load/save (definido en <head>)
   ========================================================= */

// ====== LOCAL STORAGE KEYS ======
const K_CLIENTES = "yuca_clientes_simple_pos_v1";
const K_RECIBOS  = "yuca_recibos_simple_pos_v1";
const K_STOCK    = "yuca_stock_kg_pos_v1";
const K_PROD     = "yuca_produccion_pos_v1";
const K_GASTOS   = "yuca_gastos_mensuales_pos_v1";

// ====== FORMAT ======
const money = (n) => (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });
const kgfmt  = (n) => (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const nowISOForInput = () => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// ====== LOCAL DATA ======
function getClientes(){ return JSON.parse(localStorage.getItem(K_CLIENTES)) || []; }
function setClientes(x){ localStorage.setItem(K_CLIENTES, JSON.stringify(x)); }

function getRecibos(){ return JSON.parse(localStorage.getItem(K_RECIBOS)) || []; }
function setRecibos(x){ localStorage.setItem(K_RECIBOS, JSON.stringify(x)); }

function getProduccion(){ return JSON.parse(localStorage.getItem(K_PROD)) || []; }
function setProduccion(x){ localStorage.setItem(K_PROD, JSON.stringify(x)); }

function getGastosMensuales(){ return JSON.parse(localStorage.getItem(K_GASTOS)) || {}; }
function setGastosMensuales(x){ localStorage.setItem(K_GASTOS, JSON.stringify(x)); }

function getStock(){
  const v = parseFloat(localStorage.getItem(K_STOCK));
  return Number.isFinite(v) ? v : 0;
}
function setStock(v){
  localStorage.setItem(K_STOCK, String(v));
  renderStock();
}

// ====== CLOUD SYNC ======
async function syncCloud(){
  await window.cloud.save({
    stock: getStock(),
    clientes: getClientes(),
    recibos: getRecibos(),
    produccion: getProduccion(),
    gastosMensuales: getGastosMensuales()
  });
}

// ====== MODALS ======
function openClientes(){
  document.getElementById("clientesModal").classList.add("open");
  renderClientes();
}
function closeClientes(){
  document.getElementById("clientesModal").classList.remove("open");
}
function modalBackdropClick(e){
  if(e.target && e.target.id === "clientesModal") closeClientes();
}

function openReportes(){
  document.getElementById("reportesModal").classList.add("open");
  const d = new Date();
  const pad = (x)=> String(x).padStart(2,'0');
  const ym = `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const mesInput = document.getElementById("repMes");
  if(!mesInput.value) mesInput.value = ym;

  const gastos = getGastosMensuales();
  document.getElementById("repGastosFijos").value = gastos[mesInput.value] || 0;

  calcularReporte();
}
function closeReportes(){
  document.getElementById("reportesModal").classList.remove("open");
}
function modalBackdropClickReport(e){
  if(e.target && e.target.id === "reportesModal") closeReportes();
}

// ====== STOCK UI ======
function renderStock(){
  const el = document.getElementById("stockActual");
  if(el) el.textContent = kgfmt(getStock());
}

// ====== PRODUCCIÓN ======
async function registrarProduccion(){
  const kg = parseFloat(document.getElementById("prodKg").value) || 0;
  const costo = parseFloat(document.getElementById("prodCosto").value) || 0;
  const detalle = (document.getElementById("prodDetalle").value || "").trim();

  if(kg <= 0) return alert("Kg producidos debe ser > 0");

  const nuevo = getStock() + kg;
  setStock(nuevo);

  const prod = getProduccion();
  prod.unshift({
    id: uid(),
    fechaISO: new Date().toISOString(),
    kg,
    costoTotal: costo,
    costoKg: kg > 0 ? (costo / kg) : 0,
    detalle
  });
  setProduccion(prod);

  document.getElementById("prodKg").value = "";
  document.getElementById("prodCosto").value = "";
  document.getElementById("prodDetalle").value = "";

  await syncCloud();
  alert(`Producción: +${kgfmt(kg)} Kg. Stock: ${kgfmt(nuevo)} Kg`);
}

async function aplicarAjusteStock(){
  const adj = parseFloat(document.getElementById("ajusteStock").value);
  if(!Number.isFinite(adj) || adj === 0) return alert("Ingresa un ajuste válido (ej: -5 o 10).");
  const nuevo = Math.max(0, getStock() + adj);
  setStock(nuevo);
  document.getElementById("ajusteStock").value = "";
  await syncCloud();
  alert(`Ajuste aplicado. Stock: ${kgfmt(nuevo)} Kg`);
}

async function resetStock(){
  if(!confirm("¿Seguro que quieres poner el stock en 0?")) return;
  setStock(0);
  await syncCloud();
}

// ====== CLIENTES ======
function limpiarClienteForm(){
  ["cliNombre","cliTel","cliId","cliDir","cliNota"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
}

async function crearCliente(){
  const nombre = document.getElementById("cliNombre").value.trim();
  const tel    = document.getElementById("cliTel").value.trim();
  const cid    = document.getElementById("cliId").value.trim();
  const dir    = document.getElementById("cliDir").value.trim();
  const nota   = document.getElementById("cliNota").value.trim();

  if(!nombre) return alert("Nombre es obligatorio.");

  const clientes = getClientes();
  if(cid && clientes.some(c => c.idNumber === cid)){
    return alert("Ya existe un cliente con esa identificación.");
  }

  clientes.unshift({ id: uid(), nombre, tel, idNumber: cid, dir, nota, createdAtISO: new Date().toISOString() });
  setClientes(clientes);

  limpiarClienteForm();
  renderClientes();
  refreshClientesSelect();
  await syncCloud();
}

async function eliminarCliente(id){
  if(!confirm("¿Eliminar cliente?")) return;
  setClientes(getClientes().filter(c => c.id !== id));
  renderClientes();
  refreshClientesSelect();
  await syncCloud();
}

async function borrarTodosClientes(){
  if(!confirm("¿Eliminar TODOS los clientes?")) return;
  localStorage.removeItem(K_CLIENTES);
  renderClientes();
  refreshClientesSelect();
  await syncCloud();
}

function renderClientes(){
  const q = (document.getElementById("cliBuscar")?.value || "").toLowerCase();
  const clientes = getClientes().filter(c => (`${c.nombre} ${c.tel} ${c.idNumber}`).toLowerCase().includes(q));
  const body = document.getElementById("clientesBody");
  if(!body) return;

  body.innerHTML = "";
  clientes.forEach(c => {
    body.innerHTML += `
      <tr>
        <td>${escapeHTML(c.nombre||"")}</td>
        <td>${escapeHTML(c.tel||"")}</td>
        <td>${escapeHTML(c.idNumber||"")}</td>
        <td>${escapeHTML(c.dir||"")}</td>
        <td>${escapeHTML(c.nota||"")}</td>
        <td><button class="btn danger small" onclick="eliminarCliente('${c.id}')">Eliminar</button></td>
      </tr>`;
  });
}

function exportarClientesCSV(){
  const clientes = getClientes();
  if(clientes.length === 0) return alert("No hay clientes.");

  const sep=";";
  let csv = "Nombre;Telefono;Identificacion;Direccion;Nota;Creado\n";
  clientes.slice().reverse().forEach(c=>{
    csv += [c.nombre||"", c.tel||"", c.idNumber||"", c.dir||"", c.nota||"", c.createdAtISO||""]
      .map(v => String(v).replaceAll("\n"," ").replaceAll(sep, ","))
      .join(sep) + "\n";
  });
  descargarBlob(csv, "clientes_yuca.csv", "text/csv;charset=utf-8;");
}

// ====== VENTA ======
function refreshClientesSelect(){
  const sel = document.getElementById("ventaCliente");
  if(!sel) return;

  const clientes = getClientes();
  sel.innerHTML = "";

  if(clientes.length === 0){
    sel.innerHTML = `<option value="">(Primero crea un cliente)</option>`;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML =
    `<option value="">Selecciona...</option>` +
    clientes.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)}${c.tel ? " - " + escapeHTML(c.tel) : ""}${c.idNumber ? " - " + escapeHTML(c.idNumber) : ""}</option>`).join("");
}

function recalcularTotal(){
  const kg = parseFloat(document.getElementById("ventaKg").value) || 0;
  const pk = parseFloat(document.getElementById("ventaPrecioKg").value) || 0;
  document.getElementById("ventaTotal").textContent = `$${money(kg * pk)}`;
}

function limpiarVenta(){
  document.getElementById("ventaCliente").value = "";
  document.getElementById("ventaFecha").value = nowISOForInput();
  document.getElementById("ventaPago").value = "Efectivo";
  document.getElementById("ventaKg").value = "";
  document.getElementById("ventaPrecioKg").value = "";
  document.getElementById("ventaNota").value = "";
  document.getElementById("ventaVendedor").value = "";
  recalcularTotal();
}

async function guardarRecibo(){
  const clienteId = document.getElementById("ventaCliente").value;
  if(!clienteId) return alert("Selecciona un cliente.");

  const kg = parseFloat(document.getElementById("ventaKg").value) || 0;
  const pk = parseFloat(document.getElementById("ventaPrecioKg").value) || 0;
  if(kg <= 0) return alert("Kg vendidos debe ser > 0");
  if(pk <= 0) return alert("Precio/Kg debe ser > 0");

  const stock = getStock();
  if(kg > stock){
    return alert(`Stock insuficiente.\nStock: ${kgfmt(stock)} Kg\nIntentas vender: ${kgfmt(kg)} Kg`);
  }

  const cli = getClientes().find(c => c.id === clienteId);
  if(!cli) return alert("Cliente no válido.");

  const fechaInput = document.getElementById("ventaFecha").value || nowISOForInput();
  const fechaISO = new Date(fechaInput).toISOString();
  const pago = document.getElementById("ventaPago").value;
  const total = kg * pk;

  const recibos = getRecibos();
  const numero = (recibos[0]?.numero || 0) + 1;

  const recibo = {
    id: uid(),
    numero,
    fechaISO,
    clienteId,
    clienteNombre: cli.nombre,
    clienteTel: cli.tel || "",
    clienteIdNumber: cli.idNumber || "",
    clienteDir: cli.dir || "",
    pago,
    vendedor: document.getElementById("ventaVendedor").value.trim(),
    nota: document.getElementById("ventaNota").value.trim(),
    kg,
    precioKg: pk,
    total
  };

  recibos.unshift(recibo);
  setRecibos(recibos);

  setStock(stock - kg);

  cargarReciboParaImprimir(recibo.id);

  limpiarVenta();
  renderRecibos();

  await syncCloud();
  alert(`Recibo #${numero} guardado.\nStock restante: ${kgfmt(getStock())} Kg`);
}

// ====== RECIBOS ======
function renderRecibos(){
  const q = (document.getElementById("recBuscar").value || "").toLowerCase();
  const recibos = getRecibos().filter(r => (`#${r.numero} ${r.clienteNombre}`).toLowerCase().includes(q));

  const body = document.getElementById("recibosBody");
  if(!body) return;

  body.innerHTML = "";
  recibos.forEach(r=>{
    const fecha = new Date(r.fechaISO).toLocaleString("es-CO");
    body.innerHTML += `
      <tr>
        <td>${r.numero}</td>
        <td>${escapeHTML(fecha)}</td>
        <td>${escapeHTML(r.clienteNombre)}</td>
        <td>${kgfmt(r.kg)}</td>
        <td>$${money(r.precioKg)}</td>
        <td>$${money(r.total)}</td>
        <td>${escapeHTML(r.pago)}</td>
        <td>
          <button class="btn blue small" onclick="verImprimir('${r.id}')">Imprimir</button>
          <button class="btn danger small" onclick="eliminarRecibo('${r.id}')">Eliminar</button>
        </td>
      </tr>`;
  });
}

async function eliminarRecibo(id){
  const recibos = getRecibos();
  const r = recibos.find(x => x.id === id);
  if(!r) return alert("Recibo no encontrado.");

  if(!confirm(`¿Eliminar el recibo #${r.numero}?\nSe devolverán ${kgfmt(r.kg)} Kg al stock.`)) return;

  setRecibos(recibos.filter(x => x.id !== id));
  setStock(getStock() + (Number(r.kg) || 0));

  renderRecibos();
  await syncCloud();
  alert(`Recibo eliminado. Stock actual: ${kgfmt(getStock())} Kg`);
}

async function borrarTodosRecibos(){
  const recibos = getRecibos();
  if(recibos.length === 0) return alert("No hay recibos para borrar.");

  const totalKg = recibos.reduce((a, r) => a + (Number(r.kg) || 0), 0);
  if(!confirm(`¿Eliminar TODOS los recibos?\nSe devolverán ${kgfmt(totalKg)} Kg al stock.`)) return;

  localStorage.removeItem(K_RECIBOS);
  setStock(getStock() + totalKg);

  renderRecibos();
  await syncCloud();
  alert(`Recibos borrados. Stock actual: ${kgfmt(getStock())} Kg`);
}

function exportarRecibosCSV(){
  const recibos = getRecibos();
  if(recibos.length === 0) return alert("No hay recibos.");

  const sep=";";
  let csv = "Numero;Fecha;Cliente;Kg;PrecioKg;Total;Pago;Nota;Vendedor\n";
  recibos.slice().reverse().forEach(r=>{
    const fecha = new Date(r.fechaISO).toLocaleString("es-CO");
    csv += [r.numero, fecha, r.clienteNombre, r.kg, r.precioKg, r.total, r.pago, r.nota||"", r.vendedor||""]
      .map(v => String(v).replaceAll("\n"," ").replaceAll(sep, ","))
      .join(sep) + "\n";
  });

  descargarBlob(csv, "recibos_yuca.csv", "text/csv;charset=utf-8;");
}

// ====== REPORTES ======
async function guardarGastosMes(){
  const mes = document.getElementById("repMes").value;
  if(!mes) return alert("Selecciona un mes.");

  const v = parseFloat(document.getElementById("repGastosFijos").value) || 0;
  const gastos = getGastosMensuales();
  gastos[mes] = v;
  setGastosMensuales(gastos);

  await syncCloud();
  calcularReporte();
}

function monthRange(ym){
  const [Y, M] = ym.split("-").map(Number);
  const start = new Date(Y, M-1, 1, 0,0,0,0);
  const end   = new Date(Y, M,   1, 0,0,0,0);
  return { start, end };
}

function calcularReporte(){
  const ym = document.getElementById("repMes").value;
  if(!ym) return;

  const { start, end } = monthRange(ym);

  const prod = getProduccion().filter(p=>{
    const t = new Date(p.fechaISO);
    return t >= start && t < end;
  });

  const rec = getRecibos().filter(r=>{
    const t = new Date(r.fechaISO);
    return t >= start && t < end;
  });

  const kgProd = prod.reduce((a,p)=> a + (Number(p.kg)||0), 0);
  const costoProd = prod.reduce((a,p)=> a + (Number(p.costoTotal)||0), 0);
  const costoKg = kgProd > 0 ? (costoProd / kgProd) : 0;

  const kgVend = rec.reduce((a,r)=> a + (Number(r.kg)||0), 0);
  const ventas = rec.reduce((a,r)=> a + (Number(r.total)||0), 0);
  const precioKg = kgVend > 0 ? (ventas / kgVend) : 0;

  const cogs = costoKg * kgVend;
  const uBruta = ventas - cogs;

  const gastos = getGastosMensuales();
  const gastosFijos = Number(gastos[ym] || 0);
  document.getElementById("repGastosFijos").value = gastosFijos;

  const uNeta = uBruta - gastosFijos;

  document.getElementById("repKgProd").textContent = kgfmt(kgProd);
  document.getElementById("repCostoProd").textContent = `$${money(costoProd)}`;
  document.getElementById("repCostoKg").textContent = `$${money(costoKg)}`;

  document.getElementById("repKgVend").textContent = kgfmt(kgVend);
  document.getElementById("repVentas").textContent = `$${money(ventas)}`;
  document.getElementById("repPrecioKg").textContent = `$${money(precioKg)}`;

  document.getElementById("repCogs").textContent = `$${money(cogs)}`;
  document.getElementById("repUBruta").textContent = `$${money(uBruta)}`;
  document.getElementById("repUNeta").textContent = `$${money(uNeta)}`;

  // detalle
  const body = document.getElementById("repDetalleBody");
  if(body){
    body.innerHTML = "";
    prod.slice().reverse().forEach(p=>{
      body.innerHTML += `
        <tr>
          <td>Producción</td>
          <td>${escapeHTML(new Date(p.fechaISO).toLocaleString("es-CO"))}</td>
          <td>${kgfmt(p.kg)}</td>
          <td>$${money(p.costoTotal||0)}</td>
          <td>${escapeHTML(p.detalle||"")}</td>
        </tr>`;
    });

    rec.slice().reverse().forEach(r=>{
      body.innerHTML += `
        <tr>
          <td>Venta #${r.numero}</td>
          <td>${escapeHTML(new Date(r.fechaISO).toLocaleString("es-CO"))}</td>
          <td>${kgfmt(r.kg)}</td>
          <td>$${money(r.total)}</td>
          <td>${escapeHTML(r.clienteNombre||"")}</td>
        </tr>`;
    });
  }
}

function exportarReporteCSV(){
  const ym = document.getElementById("repMes").value;
  if(!ym) return alert("Selecciona un mes.");

  const { start, end } = monthRange(ym);
  const prod = getProduccion().filter(p => new Date(p.fechaISO) >= start && new Date(p.fechaISO) < end);
  const rec  = getRecibos().filter(r => new Date(r.fechaISO) >= start && new Date(r.fechaISO) < end);

  const sep=";";
  let csv = "Tipo;Fecha;Kg;Valor;Nota\n";

  prod.slice().reverse().forEach(p=>{
    csv += ["Produccion", new Date(p.fechaISO).toLocaleString("es-CO"), p.kg, p.costoTotal||0, p.detalle||""]
      .map(v=> String(v).replaceAll("\n"," ").replaceAll(sep, ",")).join(sep) + "\n";
  });

  rec.slice().reverse().forEach(r=>{
    csv += [`Venta#${r.numero}`, new Date(r.fechaISO).toLocaleString("es-CO"), r.kg, r.total, r.clienteNombre||""]
      .map(v=> String(v).replaceAll("\n"," ").replaceAll(sep, ",")).join(sep) + "\n";
  });

  descargarBlob(csv, `reporte_${ym}.csv`, "text/csv;charset=utf-8;");
}

// ====== IMPRESIÓN ======
function verImprimir(reciboId){
  cargarReciboParaImprimir(reciboId);
  window.print();
}

function cargarReciboParaImprimir(reciboId){
  const r = getRecibos().find(x => x.id === reciboId);
  if(!r) return alert("Recibo no encontrado.");

  document.getElementById("pMeta").textContent =
    `Recibo #${r.numero} — ${new Date(r.fechaISO).toLocaleString("es-CO")} — Pago: ${r.pago}`;

  document.getElementById("pCliente").textContent = r.clienteNombre;
  document.getElementById("pTel").textContent = r.clienteTel || "";
  document.getElementById("pId").textContent = r.clienteIdNumber || "";
  document.getElementById("pDir").textContent = r.clienteDir || "";

  document.getElementById("pKg").textContent = kgfmt(r.kg);
  document.getElementById("pPrecioKg").textContent = `$${money(r.precioKg)}`;
  document.getElementById("pTotal").textContent = `$${money(r.total)}`;
  document.getElementById("pPago").textContent = r.pago;

  document.getElementById("pNota").textContent = r.nota || "";
  document.getElementById("pVendedor").textContent = r.vendedor || "";
}

// ====== DESCARGA ======
function descargarBlob(content, filename, mime){
  const blob = new Blob([content], { type: mime });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ====== SECURITY: escape HTML ======
function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ====== INIT ======
async function init(){
  // Espera a que el módulo Firebase cargue window.cloud
  let tries = 0;
  while (!window.cloud && tries < 50) {
    await new Promise(r => setTimeout(r, 100));
    tries++;
  }
  if(!window.cloud){
    alert("No se pudo inicializar Firebase (window.cloud).");
    return;
  }

  // nube -> localStorage
  const data = await window.cloud.load();
  localStorage.setItem(K_STOCK,    String(data.stock || 0));
  localStorage.setItem(K_CLIENTES, JSON.stringify(data.clientes || []));
  localStorage.setItem(K_RECIBOS,  JSON.stringify(data.recibos || []));
  localStorage.setItem(K_PROD,     JSON.stringify(data.produccion || []));
  localStorage.setItem(K_GASTOS,   JSON.stringify(data.gastosMensuales || {}));

  // UI
  const f = document.getElementById("ventaFecha");
  if(f) f.value = nowISOForInput();

  refreshClientesSelect();
  limpiarVenta();
  renderRecibos();
  renderStock();
  renderClientes();

  // Atajos POS
  const precioKg = document.getElementById("ventaPrecioKg");
  const kg = document.getElementById("ventaKg");
  const prodCosto = document.getElementById("prodCosto");

  if(precioKg){
    precioKg.addEventListener("keydown", (e)=>{
      if(e.key === "Enter") guardarRecibo();
    });
  }
  if(kg){
    kg.addEventListener("keydown", (e)=>{
      if(e.key === "Enter") document.getElementById("ventaPrecioKg")?.focus();
    });
  }
  if(prodCosto){
    prodCosto.addEventListener("keydown", (e)=>{
      if(e.key === "Enter") registrarProduccion();
    });
  }
}

window.onload = () => { init(); };
