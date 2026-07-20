// =====================================================================
// FERENA — app.js
// Lógica de: login de administrador, catálogo en tiempo real,
// alta / edición / borrado de prendas, subida de fotos.
// =====================================================================

import { firebaseApp } from "./firebase-config.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, where, getDocs, serverTimestamp, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ---------------------------------------------------------------
// Estado
// ---------------------------------------------------------------
let isAdmin = false;
let editingId = null; // id de la prenda que se está editando (null = alta nueva)
const CATEGORIAS = [
  { key: "talle", label: "Talle" },
  { key: "marca", label: "Marca" },
  { key: "tipo", label: "Tipo" }
];

let etiquetasGlobales = []; // [{id, nombre, categoria}, ...]
let selectedByCat = { talle: new Set(), marca: new Set(), tipo: new Set() }; // filtro activo
let productos = []; // catálogo (se llena por Firestore onSnapshot)

// ---------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const gate = $("gate");
const adminLoginForm = $("adminLoginForm");
const adminBack = $("adminBack");
const adminError = $("adminError");
const adminSubmit = $("adminSubmit");

const roleChip = $("roleChip");
const roleChipText = $("roleChipText");
const btnExit = $("btnExit");
const footerRole = $("footerRole");

const grid = $("grid");
const catalogCount = $("catalogCount");
const filterBar = $("filterBar");
const btnManageTags = $("btnManageTags");

const tagPicker = $("tagPicker");
const tagPickerEmpty = $("tagPickerEmpty");

const tagsModalOverlay = $("tagsModalOverlay");
const tagsModalClose = $("tagsModalClose");
const newTagForm = $("newTagForm");
const newTagCategoria = $("newTagCategoria");
const newTagInput = $("newTagInput");
const tagsError = $("tagsError");
const tagsManageList = $("tagsManageList");

const modalOverlay = $("modalOverlay");
const modalTitle = $("modalTitle");
const productForm = $("productForm");
const modalCancel = $("modalCancel");
const productError = $("productError");
const productSubmit = $("productSubmit");
const pFoto = $("pFoto");
const pFotoList = $("pFotoList");

const toast = $("toast");

const detailOverlay = $("detailOverlay");
const detailClose = $("detailClose");
const detailImg = $("detailImg");
const detailPrev = $("detailPrev");
const detailNext = $("detailNext");
const detailDots = $("detailDots");
const detailThumbs = $("detailThumbs");
const detailTitulo = $("detailTitulo");
const detailPrecio = $("detailPrecio");
const detailStock = $("detailStock");
const detailDescripcion = $("detailDescripcion");
const detailTags = $("detailTags");
const detailBuyWrap = $("detailBuyWrap");

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------
let toastTimer = null;
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ---------------------------------------------------------------
// GATE: login de administrador (el sitio entra como invitado por defecto)
// ---------------------------------------------------------------
function openAdminGate(){
  adminError.textContent = "";
  adminLoginForm.reset();
  gate.classList.remove("hidden");
  $("adminEmail").focus();
}

function closeAdminGate(){
  gate.classList.add("hidden");
  adminError.textContent = "";
}

adminBack.addEventListener("click", closeAdminGate);

adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  adminError.textContent = "";
  adminSubmit.disabled = true;
  adminSubmit.textContent = "Ingresando…";
  try {
    await signInWithEmailAndPassword(auth, $("adminEmail").value.trim(), $("adminPass").value);
    // onAuthStateChanged se encarga de cerrar el gate y activar modo admin
  } catch (err) {
    adminError.textContent = "Email o contraseña incorrectos.";
  } finally {
    adminSubmit.disabled = false;
    adminSubmit.textContent = "Ingresar";
  }
});

function setRoleUI(admin){
  roleChip.classList.toggle("admin", admin);
  roleChipText.textContent = admin ? "Administrador" : "Invitado";
  footerRole.textContent = admin ? "Modo administrador" : "Modo invitado";
  btnManageTags.classList.toggle("hidden", !admin);
  renderProducts(); // re-renderizar para mostrar/ocultar controles y tile "agregar"
}

// el sitio siempre arranca en modo invitado, sin popup
setRoleUI(false);

btnExit.addEventListener("click", async () => {
  if (isAdmin) {
    await signOut(auth); // onAuthStateChanged se encarga del resto
  } else {
    openAdminGate();
  }
});

// ---------------------------------------------------------------
// Autenticación: detectar sesión de administrador
// ---------------------------------------------------------------
onAuthStateChanged(auth, (user) => {
  if (user) {
    isAdmin = true;
    closeAdminGate();
    setRoleUI(true);
    showToast("Sesión de administrador iniciada");
  } else if (isAdmin) {
    // se cerró sesión
    isAdmin = false;
    setRoleUI(false);
  }
});

// ---------------------------------------------------------------
// ETIQUETAS (colección global "etiquetas", con categoría: talle/marca/tipo)
// ---------------------------------------------------------------
const tagsQuery = query(collection(db, "etiquetas"), orderBy("nombre"));
onSnapshot(tagsQuery, (snap) => {
  etiquetasGlobales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // sacar del filtro activo etiquetas que ya no existan
  const nombres = new Set(etiquetasGlobales.map(t => t.nombre));
  CATEGORIAS.forEach(c => {
    [...selectedByCat[c.key]].forEach(t => { if (!nombres.has(t)) selectedByCat[c.key].delete(t); });
  });
  renderFilterBar();
  renderTagPicker();
  renderTagsManageList();
  renderProducts();
}, (err) => console.error(err));

function tagsPorCategoria(catKey){
  return etiquetasGlobales.filter(t => t.categoria === catKey);
}

function renderFilterBar(){
  filterBar.innerHTML = "";
  filterBar.classList.toggle("hidden", etiquetasGlobales.length === 0);

  CATEGORIAS.forEach(cat => {
    const opciones = tagsPorCategoria(cat.key);
    if (opciones.length === 0) return;

    const group = document.createElement("div");
    group.className = "filter-group";

    const count = selectedByCat[cat.key].size;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-dd-btn" + (count > 0 ? " active" : "");
    btn.textContent = count > 0 ? `${cat.label} (${count})` : cat.label;

    const panel = document.createElement("div");
    panel.className = "filter-dd-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());
    opciones.forEach(t => {
      const label = document.createElement("label");
      const checked = selectedByCat[cat.key].has(t.nombre) ? "checked" : "";
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(t.nombre)}" ${checked}> ${escapeHtml(t.nombre)}`;
      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) selectedByCat[cat.key].add(t.nombre);
        else selectedByCat[cat.key].delete(t.nombre);
        renderFilterBar();
        renderProducts();
      });
      panel.appendChild(label);
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = panel.classList.contains("open");
      document.querySelectorAll(".filter-dd-panel.open").forEach(p => p.classList.remove("open"));
      if (!wasOpen) panel.classList.add("open");
    });

    group.append(btn, panel);
    filterBar.appendChild(group);
  });

  const totalSelected = CATEGORIAS.reduce((sum, c) => sum + selectedByCat[c.key].size, 0);
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn-text filter-clear" + (totalSelected === 0 ? " hidden" : "");
  clearBtn.textContent = "Limpiar filtros";
  clearBtn.addEventListener("click", () => {
    CATEGORIAS.forEach(c => selectedByCat[c.key].clear());
    renderFilterBar();
    renderProducts();
  });
  filterBar.appendChild(clearBtn);
}

document.addEventListener("click", () => {
  document.querySelectorAll(".filter-dd-panel.open").forEach(p => p.classList.remove("open"));
});

// ---------------------------------------------------------------
// Modal "Gestionar etiquetas" (admin)
// ---------------------------------------------------------------
btnManageTags.addEventListener("click", () => {
  tagsError.textContent = "";
  newTagForm.reset();
  tagsModalOverlay.classList.remove("hidden");
});
tagsModalClose.addEventListener("click", () => tagsModalOverlay.classList.add("hidden"));
tagsModalOverlay.addEventListener("click", (e) => { if (e.target === tagsModalOverlay) tagsModalOverlay.classList.add("hidden"); });

newTagForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  tagsError.textContent = "";
  const nombre = newTagInput.value.trim();
  const categoria = newTagCategoria.value;
  if (!nombre) return;
  const yaExiste = etiquetasGlobales.some(t => t.nombre.toLowerCase() === nombre.toLowerCase());
  if (yaExiste) {
    tagsError.textContent = "Esa etiqueta ya existe.";
    return;
  }
  try {
    await addDoc(collection(db, "etiquetas"), { nombre, categoria });
    newTagInput.value = "";
    newTagInput.focus();
    showToast("Etiqueta creada");
  } catch (err) {
    console.error(err);
    tagsError.textContent = "No se pudo crear la etiqueta.";
  }
});

function renderTagsManageList(){
  tagsManageList.innerHTML = "";
  if (etiquetasGlobales.length === 0) {
    tagsManageList.innerHTML = `<p class="empty">Todavía no hay etiquetas.</p>`;
    return;
  }
  CATEGORIAS.forEach(cat => {
    const opciones = tagsPorCategoria(cat.key);
    if (opciones.length === 0) return;
    const heading = document.createElement("p");
    heading.className = "cat-heading";
    heading.textContent = cat.label;
    tagsManageList.appendChild(heading);
    opciones.forEach(t => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span>${escapeHtml(t.nombre)}</span><button type="button" title="Eliminar">✕</button>`;
      row.querySelector("button").addEventListener("click", () => deleteTag(t));
      tagsManageList.appendChild(row);
    });
  });
}

async function deleteTag(t){
  if (!confirm(`¿Eliminar la etiqueta "${t.nombre}"? Se va a quitar de todas las prendas que la tengan.`)) return;
  try {
    // sacarla de todas las prendas que la tengan
    const q2 = query(collection(db, "productos"), where("etiquetas", "array-contains", t.nombre));
    const snap = await getDocs(q2);
    await Promise.all(snap.docs.map(d => updateDoc(doc(db, "productos", d.id), { etiquetas: arrayRemove(t.nombre) })));
    await deleteDoc(doc(db, "etiquetas", t.id));
    showToast("Etiqueta eliminada");
  } catch (err) {
    console.error(err);
    showToast("No se pudo eliminar la etiqueta");
  }
}

// ---------------------------------------------------------------
// Selector de etiquetas dentro del formulario de alta/edición
// ---------------------------------------------------------------
let pickedTags = new Set();

function renderTagPicker(){
  tagPicker.innerHTML = "";
  tagPickerEmpty.style.display = etiquetasGlobales.length === 0 ? "block" : "none";
  CATEGORIAS.forEach(cat => {
    const opciones = tagsPorCategoria(cat.key);
    if (opciones.length === 0) return;

    const group = document.createElement("div");
    group.className = "cat-group";
    const heading = document.createElement("p");
    heading.className = "cat-heading";
    heading.textContent = cat.label;
    const options = document.createElement("div");
    options.className = "cat-options";

    opciones.forEach(t => {
      const label = document.createElement("label");
      const checked = pickedTags.has(t.nombre) ? "checked" : "";
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(t.nombre)}" ${checked}> ${escapeHtml(t.nombre)}`;
      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) pickedTags.add(t.nombre);
        else pickedTags.delete(t.nombre);
      });
      options.appendChild(label);
    });

    group.append(heading, options);
    tagPicker.appendChild(group);
  });
}
// ---------------------------------------------------------------
// CATÁLOGO en tiempo real
// ---------------------------------------------------------------

const q = query(collection(db, "productos"), orderBy("creado", "desc"));
onSnapshot(q, (snap) => {
  productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderProducts();
}, (err) => {
  console.error(err);
  grid.innerHTML = `<p class="empty-state">No se pudo cargar el catálogo. Revisá la configuración de Firebase en firebase-config.js.</p>`;
});

function renderProducts(){
  grid.innerHTML = "";

  if (isAdmin) {
    const addTile = document.createElement("button");
    addTile.className = "add-tile";
    addTile.innerHTML = `<span class="plus">+</span><span class="label">Agregar prenda</span>`;
    addTile.addEventListener("click", () => openModal());
    grid.appendChild(addTile);
  }

  const catsActivas = CATEGORIAS.filter(c => selectedByCat[c.key].size > 0);
  const visibles = catsActivas.length === 0
    ? productos
    : productos.filter(p => {
        const etq = Array.isArray(p.etiquetas) ? p.etiquetas : [];
        return catsActivas.every(c => etq.some(t => selectedByCat[c.key].has(t)));
      });

  if (visibles.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    if (catsActivas.length > 0) {
      empty.textContent = "Ninguna prenda coincide con los filtros seleccionados.";
    } else {
      empty.textContent = isAdmin
        ? "Todavía no hay prendas cargadas. Usá \"Agregar prenda\" para sumar la primera."
        : "Por ahora no hay prendas publicadas.";
    }
    grid.appendChild(empty);
  } else {
    visibles.forEach(p => grid.appendChild(renderCard(p)));
  }

  catalogCount.textContent = `${visibles.length} prenda${visibles.length === 1 ? "" : "s"}`;
}

function renderCard(p){
  const fotos = Array.isArray(p.fotos) ? p.fotos : (p.fotoUrl ? [p.fotoUrl] : []);
  let idx = 0;

  const card = document.createElement("article");
  card.className = "card";

  const photoWrap = document.createElement("div");
  photoWrap.className = "photo-wrap";

  let img = null;
  if (fotos.length) {
    img = document.createElement("img");
    img.src = fotos[0];
    img.alt = p.titulo || "Prenda";
    img.loading = "lazy";
    photoWrap.appendChild(img);
  } else {
    photoWrap.innerHTML = `<div class="photo-placeholder">Sin foto</div>`;
  }

  let dotsEl = null;
  if (fotos.length > 1) {
    const prev = document.createElement("button");
    prev.className = "slide-arrow prev";
    prev.type = "button";
    prev.setAttribute("aria-label", "Foto anterior");
    prev.textContent = "‹";

    const next = document.createElement("button");
    next.className = "slide-arrow next";
    next.type = "button";
    next.setAttribute("aria-label", "Foto siguiente");
    next.textContent = "›";

    dotsEl = document.createElement("div");
    dotsEl.className = "slide-dots";
    fotos.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === 0) dot.classList.add("active");
      dotsEl.appendChild(dot);
    });

    const show = (i) => {
      idx = (i + fotos.length) % fotos.length;
      img.src = fotos[idx];
      [...dotsEl.children].forEach((d, i2) => d.classList.toggle("active", i2 === idx));
    };
    prev.addEventListener("click", (e) => { e.stopPropagation(); show(idx - 1); });
    next.addEventListener("click", (e) => { e.stopPropagation(); show(idx + 1); });

    photoWrap.append(prev, next, dotsEl);
  }

  photoWrap.addEventListener("click", () => openDetail(p, fotos, idx));
  card.appendChild(photoWrap);

  const tag = document.createElement("div");
  tag.className = "tag";
  tag.innerHTML = `
    <h3 class="title">${escapeHtml(p.titulo || "Sin título")}</h3>
    <div class="meta-row">
      <span class="price">${escapeHtml(p.precio || "")}</span>
      <span class="stock">${escapeHtml(p.stock || "")}</span>
    </div>
    <p class="desc">${escapeHtml(p.descripcion || "")}</p>
    ${Array.isArray(p.etiquetas) && p.etiquetas.length
      ? `<div class="pill-row">${p.etiquetas.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("")}</div>`
      : ""}
    ${p.link ? `<a class="btn-buy" href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">Comprar</a>` : ""}
  `;
  tag.querySelector(".title").style.cursor = "pointer";
  tag.querySelector(".title").addEventListener("click", () => openDetail(p, fotos, idx));
  card.appendChild(tag);

  if (isAdmin) {
    const controls = document.createElement("div");
    controls.className = "admin-controls";
    controls.innerHTML = `<button data-action="edit" title="Editar">✎</button><button data-action="delete" title="Eliminar">✕</button>`;
    controls.querySelector('[data-action="edit"]').addEventListener("click", (e) => { e.stopPropagation(); openModal(p); });
    controls.querySelector('[data-action="delete"]').addEventListener("click", (e) => { e.stopPropagation(); deleteProduct(p); });
    card.appendChild(controls);
  }

  return card;
}

function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// DETALLE flotante (estilo Marketplace, sin mapa ni mensaje)
// ---------------------------------------------------------------
let detailFotos = [];
let detailIdx = 0;

function openDetail(p, fotos, startIdx = 0){
  detailFotos = fotos;
  detailIdx = startIdx;

  detailTitulo.textContent = p.titulo || "Sin título";
  detailPrecio.textContent = p.precio || "";
  detailStock.textContent = p.stock || "";
  detailDescripcion.textContent = p.descripcion || "Sin descripción.";
  detailTags.innerHTML = Array.isArray(p.etiquetas) && p.etiquetas.length
    ? p.etiquetas.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("")
    : "";
  detailBuyWrap.innerHTML = p.link
    ? `<a class="btn-buy" href="${escapeHtml(p.link)}" target="_blank" rel="noopener noreferrer">Comprar</a>`
    : "";

  renderDetailSlide();
  detailOverlay.classList.remove("hidden");
}

function renderDetailSlide(){
  const wrap = detailImg.parentElement;
  const has = detailFotos.length > 0;

  if (has) {
    detailImg.src = detailFotos[detailIdx];
    detailImg.style.display = "block";
    let placeholder = wrap.querySelector(".photo-placeholder");
    if (placeholder) placeholder.remove();
  } else {
    detailImg.style.display = "none";
    if (!wrap.querySelector(".photo-placeholder")) {
      const ph = document.createElement("div");
      ph.className = "photo-placeholder";
      ph.textContent = "Sin foto";
      wrap.appendChild(ph);
    }
  }

  const multi = detailFotos.length > 1;
  detailPrev.classList.toggle("hidden", !multi);
  detailNext.classList.toggle("hidden", !multi);

  detailDots.innerHTML = "";
  if (multi) {
    detailFotos.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === detailIdx) dot.classList.add("active");
      detailDots.appendChild(dot);
    });
  }

  detailThumbs.innerHTML = "";
  detailThumbs.classList.toggle("hidden", !multi);
  if (multi) {
    detailFotos.forEach((src, i) => {
      const t = document.createElement("img");
      t.src = src;
      if (i === detailIdx) t.classList.add("active");
      t.addEventListener("click", () => { detailIdx = i; renderDetailSlide(); });
      detailThumbs.appendChild(t);
    });
  }
}

function detailShow(i){
  detailIdx = (i + detailFotos.length) % detailFotos.length;
  renderDetailSlide();
}
detailPrev.addEventListener("click", () => detailShow(detailIdx - 1));
detailNext.addEventListener("click", () => detailShow(detailIdx + 1));

function closeDetail(){ detailOverlay.classList.add("hidden"); }
detailClose.addEventListener("click", closeDetail);
detailOverlay.addEventListener("click", (e) => { if (e.target === detailOverlay) closeDetail(); });
document.addEventListener("keydown", (e) => {
  if (detailOverlay.classList.contains("hidden")) return;
  if (e.key === "Escape") closeDetail();
  if (e.key === "ArrowLeft") detailShow(detailIdx - 1);
  if (e.key === "ArrowRight") detailShow(detailIdx + 1);
});

// ---------------------------------------------------------------
// Comprimir foto en el navegador antes de guardarla
// (sin Firebase Storage: la guardamos como texto dentro del
// documento de Firestore, así que tiene que ser liviana)
// ---------------------------------------------------------------
function compressImage(file, maxSize = 720, quality = 0.65){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round(height * (maxSize / width));
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round(width * (maxSize / height));
        height = maxSize;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------
// MODAL: alta / edición
// ---------------------------------------------------------------
let pendingFotos = []; // array de dataURL (comprimidas) que se van a guardar

function openModal(p = null){
  productError.textContent = "";
  productForm.reset();
  pFoto.value = "";

  if (p) {
    editingId = p.id;
    pendingFotos = Array.isArray(p.fotos) ? [...p.fotos] : (p.fotoUrl ? [p.fotoUrl] : []);
    pickedTags = new Set(Array.isArray(p.etiquetas) ? p.etiquetas : []);
    modalTitle.textContent = "Editar prenda";
    $("pTitulo").value = p.titulo || "";
    $("pDescripcion").value = p.descripcion || "";
    $("pPrecio").value = p.precio || "";
    $("pStock").value = p.stock || "";
    $("pLink").value = p.link || "";
  } else {
    editingId = null;
    pendingFotos = [];
    pickedTags = new Set();
    modalTitle.textContent = "Agregar prenda";
  }
  renderPhotoList();
  renderTagPicker();
  modalOverlay.classList.remove("hidden");
}

function closeModal(){
  modalOverlay.classList.add("hidden");
  editingId = null;
}

function renderPhotoList(){
  pFotoList.innerHTML = "";
  pendingFotos.forEach((src, i) => {
    const thumb = document.createElement("div");
    thumb.className = "thumb" + (i === 0 ? " cover" : "");
    thumb.innerHTML = `<img src="${src}" alt=""><button type="button" title="Quitar">✕</button>`;
    thumb.querySelector("button").addEventListener("click", () => {
      pendingFotos.splice(i, 1);
      renderPhotoList();
    });
    pFotoList.appendChild(thumb);
  });
}

modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

pFoto.addEventListener("change", async () => {
  const files = [...pFoto.files];
  if (!files.length) return;
  productError.textContent = "Comprimiendo fotos…";
  for (const file of files) {
    try {
      const compressed = await compressImage(file);
      pendingFotos.push(compressed);
    } catch (err) {
      console.error(err);
    }
  }
  productError.textContent = "";
  pFoto.value = "";
  renderPhotoList();
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  productError.textContent = "";

  const totalSize = pendingFotos.reduce((sum, f) => sum + f.length, 0);
  if (totalSize > 900000) {
    productError.textContent = "Entre todas las fotos pesan demasiado para guardarse. Sacá alguna o usá menos resolución.";
    return;
  }

  productSubmit.disabled = true;
  productSubmit.textContent = "Guardando…";

  try {
    const titulo = $("pTitulo").value.trim();
    const descripcion = $("pDescripcion").value.trim();
    const precio = $("pPrecio").value.trim();
    const stock = $("pStock").value.trim();
    const link = $("pLink").value.trim();

    const data = { titulo, descripcion, precio, stock, link: link || null, fotos: pendingFotos, etiquetas: [...pickedTags] };

    if (editingId) {
      await updateDoc(doc(db, "productos", editingId), data);
      showToast("Prenda actualizada");
    } else {
      await addDoc(collection(db, "productos"), { ...data, creado: serverTimestamp() });
      showToast("Prenda publicada");
    }

    closeModal();
  } catch (err) {
    console.error(err);
    productError.textContent = "No se pudo guardar. Revisá tu conexión o los permisos de Firebase.";
  } finally {
    productSubmit.disabled = false;
    productSubmit.textContent = "Guardar";
  }
});

async function deleteProduct(p){
  if (!confirm(`¿Eliminar "${p.titulo}" del catálogo?`)) return;
  try {
    await deleteDoc(doc(db, "productos", p.id));
    showToast("Prenda eliminada");
  } catch (err) {
    console.error(err);
    showToast("No se pudo eliminar");
  }
}
