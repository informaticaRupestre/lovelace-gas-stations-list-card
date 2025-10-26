/**
 * Gas Stations List Card - v6.3
 * - Mapa Leaflet (CDN) con altura fija (map_height)
 * - Marcadores SVG "gota" coloreados por precio (umbrales configurables)
 * - Lista con scroll, orden dinámico y navegación Google/Apple/Waze
 * - Popup: "Ver en la lista" (scroll + highlight) y "Abrir en mapas" (misma lógica que lista)
 * - Nuevo: Evita que el swipe del dashboard se active al arrastrar el mapa (sin romper el drag del mapa)
 * - Editor visual estructurado (mapa/lista/umbrales&colores)
 * Compatible con Home Assistant 2025.10+
 */

(() => {
  const CARD_TYPE = "gas-stations-list-card";
  if (customElements.get(CARD_TYPE)) return;

  class GasStationsListCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });

      // Estado UI
      this.sortMode = "distancia";

      // Mapa
      this._map = null;
      this._mapInited = false;
      this._markersLayer = null;
      this._lastCoordsHash = "";
      this._markerById = new Map(); // mkid -> Leaflet marker
      this._popupOpenBound = false;

      // Config por defecto (se sobreescribe en setConfig)
      this.maxHeight = "380px";
      this.mapHeight = "300px";
      this.showMap = true;
      this.showList = true;
      this.focusZoom = 15; // zoom al pulsar "Ver en mapa"
      this.lock_gestures = true; // bloquear swipe del dashboard sobre mapa

      // Colores/umbrales por defecto (mapa y, opcionalmente, lista por precio)
      this.price_green_max  = 1.24;
      this.price_orange_max = 1.45;
      this.price_red_max    = 1.80;
      this.color_green   = "#2e7d32";
      this.color_orange  = "#fb8c00";
      this.color_red     = "#d32f2f";
      this.color_default = "#6e6e6e";

      // Lista: 'by_price' (usa umbrales) | 'single' (color fijo)
      this.list_color_mode = "single";
      this.list_color = "#4CAF50";
    }

    async connectedCallback() {
      await customElements.whenDefined("ha-icon");
    }

    // ---------------- Leaflet (CDN) ----------------
    async _ensureLeafletCssInShadow() {
      if (this.shadowRoot.querySelector("#leaflet-css-shadow")) return;
      const style = document.createElement("style");
      style.id = "leaflet-css-shadow";
      style.textContent = `@import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");`;
      this.shadowRoot.appendChild(style);
      await new Promise((r) => requestAnimationFrame(r));
    }

    async _ensureLeafletJsCdn() {
      if (window.L) return window.L;
      const existing = document.querySelector("#leaflet-js-cdn");
      if (existing) {
        await new Promise((r) => existing.addEventListener("load", r, { once: true }));
        return window.L;
      }
      const script = document.createElement("script");
      script.id = "leaflet-js-cdn";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.head.appendChild(script);
      await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
      return window.L;
    }

    async _ensureLeafletAssets() {
      await this._ensureLeafletCssInShadow();
      return await this._ensureLeafletJsCdn();
    }

    // ---------------- Utilidades de datos ----------------
    _coordsFromGas(gas) {
      return (gas || [])
        .filter((g) => g && g.latitud != null && g.longitud != null)
        .map((g) => [parseFloat(g.latitud), parseFloat(g.longitud)])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));
    }

    _coordsHash(coords) {
      return coords.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join("|");
    }

    _parsePrice(raw) {
      if (raw == null) return NaN;
      const num = Number(String(raw).replace(",", "."));
      return Number.isFinite(num) ? num : NaN;
    }

    _getColorForPrice(rawPrice) {
      const p = this._parsePrice(rawPrice);
      if (!Number.isFinite(p)) return this.color_default;

      if (p < this.price_green_max)  return this.color_green;
      if (p < this.price_orange_max) return this.color_orange;
      if (p < this.price_red_max)    return this.color_red;
      return this.color_default; // >= red_max
    }

    // ---------------- Helpers UI ----------------
    _scrollToListItem(mkid) {
      if (!this.showList) return; // si no hay lista visible, no hacemos nada
      const listEl = this.shadowRoot.getElementById("list");
      if (!listEl) return;
      const item = listEl.querySelector(`.item[data-mkid="${mkid}"]`);
      if (!item) return;
      item.scrollIntoView({ behavior: "smooth", block: "center" });
      item.classList.add("highlight");
      setTimeout(() => item.classList.remove("highlight"), 1500);
    }

    // ---------------- Config / Template ----------------
    setConfig(config) {
      if (!config?.entity) {
        throw new Error("Debes definir la entidad del sensor con las gasolineras.");
      }

      this.config = config;
      this.maxHeight = config.max_height || "380px";
      this.mapHeight = config.map_height || "300px";
      this.showMap = config.show_map !== false;   // por defecto true
      this.showList = config.show_list !== false; // por defecto true
      this.focusZoom = Number.isFinite(Number(config.focus_zoom)) ? Number(config.focus_zoom) : 15;
      this.lock_gestures = config.lock_gestures !== false; // por defecto true

      // Umbrales/colores (con defaults)
      this.price_green_max  = Number(config.price_green_max ?? 1.24);
      this.price_orange_max = Number(config.price_orange_max ?? 1.45);
      this.price_red_max    = Number(config.price_red_max ?? 1.80);
      this.color_green   = config.color_green   || "#2e7d32";
      this.color_orange  = config.color_orange  || "#fb8c00";
      this.color_red     = config.color_red     || "#d32f2f";
      this.color_default = config.color_default || "#6e6e6e";

      // Asegura orden ascendente de umbrales
      const a = Math.min(this.price_green_max, this.price_orange_max, this.price_red_max);
      const c = Math.max(this.price_green_max, this.price_orange_max, this.price_red_max);
      const b = this.price_green_max + this.price_orange_max + this.price_red_max - a - c;
      [this.price_green_max, this.price_orange_max, this.price_red_max] = [a, b, c];

      // Lista: modo color + color fijo
      this.list_color_mode = config.list_color_mode === "by_price" ? "by_price" : "single";
      this.list_color = config.list_color || "#4CAF50";

      // Clases/atributos para bloquear swipe en Swiper
      const noSwipeClass = this.lock_gestures ? 'swiper-no-swiping no-swipe' : '';
      const noSwipeAttr  = this.lock_gestures ? 'data-no-swiping="true"' : '';

      this.shadowRoot.innerHTML = `
        <style>
          :host { display:block; contain:content; }
          ha-card {
            display:flex; flex-direction:column;
            overflow:hidden; position:relative; contain:layout paint;
          }
          .header {
            display:flex; justify-content:space-between; align-items:center;
            padding:12px 16px; border-bottom:1px solid var(--divider-color,#ddd);
            background:var(--card-background-color); position:sticky; top:0; z-index:2;
          }
          .title { font-weight:600; font-size:18px; color:var(--primary-text-color); display:flex; align-items:center; gap:6px; }
          select {
            background:var(--secondary-background-color,#f0f0f0);
            color:var(--primary-text-color);
            border:1px solid var(--divider-color,#ccc);
            border-radius:6px; font-size:13px;
            padding:4px 8px; cursor:pointer; outline:none;
          }
          select:hover { border-color:var(--primary-color); }

          /* MAPA con altura fija */
          .map-slot { padding:12px 16px 0; }
          #map {
            width:100%;
            height: var(--map-height, 300px);
            border-radius:8px;
            overflow:hidden;
            border:1px solid var(--divider-color,#ccc);
            overscroll-behavior: contain;  /* evita "tirón" hacia el contenedor padre */
            touch-action: pan-x pan-y;     /* permite pan/zoom del mapa sin bloquear gestos */
          }

          /* Marcador SVG plano */
          .gs-flat-marker { background: transparent !important; border: none !important; }

          /* LISTA */
          .list-container {
            flex:1; overflow-y:auto; max-height:${this.maxHeight};
            padding:12px 16px 16px;
          }
          .item {
            padding:12px; margin-bottom:12px; border-radius:8px;
            background:var(--secondary-background-color,#f5f5f5);
            border-left:4px solid var(--primary-color); /* se sobrescribe inline por item */
            transition:transform .2s ease, box-shadow .2s ease, background-color .2s ease;
          }
          .item:hover { transform:translateX(4px); box-shadow:0 2px 6px rgba(0,0,0,0.15); }
          .item.highlight { background-color: rgba(255, 235, 59, 0.25); } /* resalte temporal */
          .name { font-weight:700; color:var(--primary-color); font-size:16px; display:flex; align-items:center; gap:6px; }
          .address { font-size:13px; color:var(--secondary-text-color); margin:4px 0 8px; }
          .details { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
          .price { font-size:18px; font-weight:700; color:#4CAF50; display:flex; align-items:center; gap:4px; }

          .actions { display:flex; align-items:center; gap:8px; }
          .distance, .goto-btn, .openmaps-btn, .gotolist-btn {
            background:var(--primary-color); color:#fff;
            padding:4px 10px; border-radius:12px;
            font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px;
            text-decoration:none; border:none;
          }
          .distance:hover, .goto-btn:hover, .openmaps-btn:hover, .gotolist-btn:hover { opacity:0.9; }
          .goto-btn, .gotolist-btn, .openmaps-btn { line-height:1; }

          .list-container::-webkit-scrollbar { width:8px; }
          .list-container::-webkit-scrollbar-thumb { background:var(--primary-color); border-radius:4px; }
          .empty { text-align:center; padding:24px; color:var(--secondary-text-color); }
        </style>

        <ha-card>
          <div class="header">
            <div class="title"><ha-icon icon="mdi:gas-station"></ha-icon> Gasolineras Cercanas</div>
            <select id="sort-select">
              <option value="distancia">Por cercan\u00EDa</option>
              <option value="precio">Por precio</option>
            </select>
          </div>

          ${this.showMap ? `
            <div class="map-slot ${noSwipeClass}" ${noSwipeAttr}>
              <div id="map" class="${noSwipeClass}" ${noSwipeAttr} style="--map-height:${this.mapHeight}"></div>
            </div>` : ``}

          ${this.showList ? `<div id="list" class="list-container"></div>` : `<div id="list" class="list-container" style="display:none;"></div>`}
        </ha-card>
      `;

      // Cambio de orden: solo refresca la lista
      this.shadowRoot.getElementById("sort-select")
        .addEventListener("change", (ev) => {
          this.sortMode = ev.target.value;
          this._renderList();
        });
    }

    // ---------------- HA updates ----------------
    set hass(hass) {
      this._hass = hass;
      if (!this.config) return;

      const entity = hass.states[this.config.entity];
      if (!entity) {
        this._renderMsg("Entidad no encontrada");
        return;
      }

      const gas = entity.attributes?.gasolineras;
      if (!Array.isArray(gas) || gas.length === 0) {
        this._renderMsg("No hay datos disponibles");
        return;
      }

      this._gasData = gas;
      this._renderList();

      if (this.showMap) {
        this._initMapOnce().then(() => this._updateMapViewAndMarkers());
      }
    }

    // ---------------- Orden/Lista ----------------
    _sortGasStations(gasolineras) {
      const sorted = [...gasolineras];
      if (this.sortMode === "precio") {
        sorted.sort((a, b) => (this._parsePrice(a.precio) || 9e9) - (this._parsePrice(b.precio) || 9e9));
      } else {
        sorted.sort((a, b) => (parseFloat(a.distancia_km) || 9e9) - (parseFloat(b.distancia_km) || 9e9));
      }
      return sorted;
    }

    _openMap(lat, lon) {
      const ua = navigator.userAgent || navigator.vendor || window.opera;
      if (/android/i.test(ua)) {
        window.location.href = `geo:${lat},${lon}?q=${lat},${lon}`;
      } else if (/iPad|iPhone|iPod/.test(ua)) {
        window.location.href = `maps://maps.apple.com/?q=${lat},${lon}`;
      } else {
        window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
      }
    }

    _focusOn(lat, lon, mkid) {
      // Si el mapa no existe, fallback a abrir navegador/mapas
      if (!this.showMap || !this._map || !this._mapInited) {
        this._openMap(lat, lon);
        return;
      }
      try {
        this._map.setView([lat, lon], this.focusZoom, { animate: true });
        const m = this._markerById.get(mkid);
        if (m) m.openPopup();
      } catch (e) {
        this._openMap(lat, lon);
      }
    }

    _renderList() {
      if (!this.showList) return;
      const listEl = this.shadowRoot.getElementById("list");
      if (!this._gasData || !listEl) {
        this._renderMsg("Sin datos");
        return;
      }

      const data = this._sortGasStations(this._gasData);

      listEl.innerHTML = data.map((g, i) => {
        const priceNum = this._parsePrice(g?.precio);
        const colorForItem = this.list_color_mode === "by_price"
          ? this._getColorForPrice(priceNum)
          : this.list_color;

        const lat = g.latitud;
        const lon = g.longitud;
        const mkid = g._mkid != null ? g._mkid : ""; // se asigna al crear marcadores

        return `
          <div class="item" data-i="${i}" data-mkid="${mkid}" style="border-left-color:${colorForItem}">
            <div class="name">
              <ha-icon icon="mdi:gas-station"></ha-icon>
              ${g.nombre ?? "Gasolinera"}
            </div>
            <div class="address">${g.direccion ?? ""}${g.localidad ? ", " + g.localidad : ""}</div>
            <div class="details">
              <div class="price">
                <ha-icon icon="mdi:currency-eur"></ha-icon>
                ${Number.isFinite(priceNum) ? priceNum.toFixed(3) : "-"} €/L
              </div>
              <div class="actions">
                <button class="goto-btn" data-lat="${lat}" data-lon="${lon}" data-mkid="${mkid}">
                  <ha-icon icon="mdi:crosshairs-gps"></ha-icon>
                  Ver en mapa
                </button>
                <div class="distance" data-lat="${lat}" data-lon="${lon}">
                  <ha-icon icon="mdi:map-marker"></ha-icon>
                  ${g.distancia_km ?? "-"} km
                </div>
              </div>
            </div>
          </div>`;
      }).join("");

      // Acciones
      listEl.querySelectorAll(".distance").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          const lat = ev.currentTarget.dataset.lat;
          const lon = ev.currentTarget.dataset.lon;
          if (lat && lon) this._openMap(lat, lon);
        });
      });

      listEl.querySelectorAll(".goto-btn").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          const lat = parseFloat(ev.currentTarget.dataset.lat);
          const lon = parseFloat(ev.currentTarget.dataset.lon);
          const mkid = ev.currentTarget.dataset.mkid;
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            this._focusOn(lat, lon, mkid);
          }
        });
      });
    }

    _renderMsg(msg) {
      const listEl = this.shadowRoot.getElementById("list");
      if (listEl) listEl.innerHTML = `<div class="empty">${msg}</div>`;
    }

    // ---------------- Mapa: init once + markers + fit ----------------
    async _initMapOnce() {
      if (this._mapInited) return;
      const mapEl = this.shadowRoot.getElementById("map");
      if (!mapEl) return;

      const L = await this._ensureLeafletAssets();
      if (!L) return;

      // Espera 2 frames para asegurar tamaño real del contenedor
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Centro inicial (primera gasolinera válida o Madrid)
      const coords = this._coordsFromGas(this._gasData);
      const center = coords.length ? coords[0] : [40.4168, -3.7038];

      this._map = L.map(mapEl, {
        center,
        zoom: 12,
        zoomControl: true,
        preferCanvas: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(this._map);

      // Capa reutilizable de marcadores
      this._markersLayer = L.layerGroup().addTo(this._map);

      // Igualar comportamiento de botones del popup
      if (!this._popupOpenBound) {
        this._map.on("popupopen", (ev) => {
          const el = ev?.popup?.getElement?.();
          if (!el) return;
          // Botón: Ver en la lista
          const listBtn = el.querySelector(".gotolist-btn");
          if (listBtn) {
            const cloned = listBtn.cloneNode(true);
            listBtn.replaceWith(cloned);
            cloned.addEventListener("click", (e) => {
              e.preventDefault(); e.stopPropagation();
              const mkid = cloned.dataset.mkid;
              this._scrollToListItem(mkid);
            });
          }
          // Botón: Abrir en mapas (misma lógica que lista)
          const openBtn = el.querySelector(".openmaps-btn");
          if (openBtn) {
            const cloned2 = openBtn.cloneNode(true);
            openBtn.replaceWith(cloned2);
            cloned2.addEventListener("click", (e) => {
              e.preventDefault(); e.stopPropagation();
              const lat = parseFloat(cloned2.dataset.lat);
              const lon = parseFloat(cloned2.dataset.lon);
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                this._openMap(lat, lon);
              }
            });
          }
        });
        this._popupOpenBound = true;
      }

      setTimeout(() => this._map?.invalidateSize(true), 200);
      this._mapInited = true;
    }

    _updateMapViewAndMarkers() {
      if (!this._map || !this._gasData) return;

      const coords = this._coordsFromGas(this._gasData);
      if (!coords.length) return;

      // Hash para evitar trabajo innecesario
      const hash = this._coordsHash(coords);
      const coordsChanged = hash !== this._lastCoordsHash;
      if (!coordsChanged) return;

      this._lastCoordsHash = hash;

      // --- 1) Refrescar marcadores ---
      this._markersLayer.clearLayers();
      this._markerById.clear();

      let mkidCounter = 0;

      this._gasData.forEach((g) => {
        const lat = parseFloat(g?.latitud);
        const lon = parseFloat(g?.longitud);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        // Asignar mkid estable por ciclo
        const mkid = mkidCounter++;
        g._mkid = String(mkid);

        const name = g?.nombre || "Gasolinera";
        const priceNum = this._parsePrice(g?.precio);
        const priceLabel = Number.isFinite(priceNum) ? `${priceNum.toFixed(3)} €/L` : "-";
        const address = [g?.direccion, g?.localidad].filter(Boolean).join(", ");
        const color = this._getColorForPrice(priceNum);

        const popupHtml = `
          <div style="min-width:200px">
            <div style="font-weight:700;margin-bottom:4px;">⭐ ${name}</div>
            <div style="font-size:13px;margin-bottom:8px;">⛽ ${address || ""}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="gotolist-btn"
                      data-mkid="${g._mkid}"
                      style="background:var(--primary-color);color:#fff;border:none;border-radius:10px;padding:4px 10px;cursor:pointer;font-size:13px;display:flex;gap:6px;align-items:center;">
                <span>Ver en la lista</span>
              </button>
              <button class="openmaps-btn"
                      data-lat="${lat}" data-lon="${lon}"
                      style="background:var(--primary-color);color:#fff;border:none;border-radius:10px;padding:4px 10px;cursor:pointer;font-size:13px;display:flex;gap:6px;align-items:center;">
                <span>Abrir en mapas</span>
              </button>
            </div>
            <div style="margin-top:6px;font-size:13px;">
              <b>Precio:</b> ${priceLabel}
            </div>
          </div>
        `;

        // Marcador SVG plano con color por precio
        const html = `
          <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M14 27c0 0 9-7.2 9-15A9 9 0 1 0 5 12c0 7.8 9 15 9 15z" fill="${color}"/>
            <circle cx="14" cy="12" r="4.5" fill="white" opacity="0.9"/>
          </svg>
        `;

        const icon = window.L.divIcon({
          className: "gs-flat-marker",
          html,
          iconSize: [28, 28],
          iconAnchor: [14, 27],
          popupAnchor: [0, -24],
        });

        const marker = window.L.marker([lat, lon], {
          title: name,
          icon,
          keyboard: true,
        });
        marker.bindPopup(popupHtml, { autoPan: true });
        marker.addTo(this._markersLayer);

        this._markerById.set(String(mkid), marker);
      });

      // --- 2) Ajustar vista (fit bounds o setView si solo 1) ---
      if (coords.length === 1) {
        this._map.setView(coords[0], 12);
      } else {
        const bounds = (window.L && window.L.latLngBounds) ? window.L.latLngBounds(coords) : null;
        if (bounds) {
          this._map.fitBounds(bounds, { padding: [24, 24] });
        } else {
          const avg = coords.reduce((acc, [la, lo]) => [acc[0] + la, acc[1] + lo], [0, 0]).map((v) => v / coords.length);
          this._map.setView(avg, 12);
        }
      }

      // Re-render lista para asegurar que todos los items tengan data-mkid actual
      this._renderList();

      setTimeout(() => this._map && this._map.invalidateSize(true), 120);
    }

    // ---------------- Lovelace metadata ----------------
    getCardSize() {
      if (this.showMap && this.showList) return 8;
      if (this.showMap && !this.showList) return 4;
      return 5;
    }

    static getConfigElement() {
      return document.createElement("gas-stations-list-card-editor");
    }

    static getStubConfig() {
      return {
        entity: "",
        max_height: "380px",
        map_height: "300px",
        show_map: true,
        show_list: true,
        focus_zoom: 15,
        lock_gestures: true,
        price_green_max: 1.24,
        price_orange_max: 1.45,
        price_red_max: 1.80,
        color_green: "#2e7d32",
        color_orange: "#fb8c00",
        color_red: "#d32f2f",
        color_default: "#6e6e6e",
        list_color_mode: "single",
        list_color: "#4CAF50",
      };
    }
  }

  customElements.define(CARD_TYPE, GasStationsListCard);

  // -------------------------------------------------------------
  // EDITOR VISUAL (estructura mapa/lista/umbrales&colores)
  // -------------------------------------------------------------
  class GasStationsListCardEditor extends HTMLElement {
    constructor() {
      super();
      this._config = {};
    }

    setConfig(config) {
      this._config = { ...config };
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._rendered) this._render();
    }

    _render() {
  if (!this._hass) return;
  this._rendered = true;

  // Cacheamos todas las entidades sensor para poder filtrarlas sin recalcular
  this._allSensors = Object.keys(this._hass.states)
    .filter((e) => e.startsWith("sensor."))
    .map((id) => ({
      id,
      name: this._hass.states[id].attributes.friendly_name || id,
      combo: `${id} ${this._hass.states[id].attributes.friendly_name || ""}`.toLowerCase(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const limit = 300; // límite de opciones mostradas para no saturar el editor

  // Helper para renderizar las opciones del <select> con filtro
  const renderSelectOptions = (filter = "") => {
    const select = this.querySelector("#entity-select");
    const countEl = this.querySelector("#entity-count");
    if (!select) return;
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? this._allSensors.filter((s) => s.combo.includes(q))
      : this._allSensors.slice();

    // Rellenar select (limpiar antes)
    select.innerHTML = `<option value="">-- Selecciona una entidad --</option>`;
    filtered.slice(0, limit).forEach(({ id, name }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = name;
      if (id === this._config.entity) opt.selected = true;
      select.appendChild(opt);
    });

    // Contador
    if (countEl) {
      const more = filtered.length > limit ? ` (mostrando ${limit})` : "";
      countEl.textContent = `${filtered.length} resultado(s)${more}`;
    }
  };

  this.innerHTML = `
    <style>
      .editor-container { padding: 16px; display: flex; flex-direction: column; gap: 20px; }
      .section { border:1px solid var(--divider-color,#ddd); border-radius:8px; padding:14px; }
      .section-title { font-weight:700; margin:0 0 12px; font-size:14px; display:flex; align-items:center; gap:8px; }
      .field { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
      .label { font-weight:600; font-size: 13px; color: var(--primary-text-color); }
      .hint { font-size:12px; color: var(--secondary-text-color); }
      input, select {
        padding: 8px 12px;
        border: 1px solid var(--divider-color,#ddd);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
      }
      .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }

      /* Contenedores responsive */
      .field-inline { display:flex; gap:12px; flex-wrap:wrap; }
      .field-inline > .field { flex: 1 1 320px; min-width: 260px; }

      /* Toggle/checkbox con input primero y texto después */
      .toggle-row { display:flex; align-items:center; gap:10px; }
      .toggle-row input { margin:0; }

      .radio-group { display:flex; gap:16px; flex-wrap:wrap; }
      input[type="color"] { height: 38px; padding: 0; }
      
      .pair { 
        display:flex; 
        align-items:center; 
        gap:12px; 
        flex-wrap:nowrap; 
      }
      .pair input[type="number"] {
        max-width: 140px;   /* evita que se coma todo el ancho */
      }
      @media (max-width: 600px) {
        .field-inline { flex-direction: column; gap: 12px; }
        .field-inline > .field { flex: 1 1 100%; min-width: 0; }
        .radio-group { flex-direction: column; gap: 8px; align-items: flex-start; }
        .row { flex-direction: column; align-items: stretch; gap:8px; }
        
        .pair { gap:10px; }
        .pair input[type="number"] { max-width: 120px; }
        input[type="color"] { height: 38px; padding: 0; }
      }
      
    </style>

    <div class="editor-container">
      <!-- FUENTE DE DATOS -->
      <div class="section">
        <h3 class="section-title">Fuente de datos</h3>

        <div class="field">
          <label class="label" for="entity-filter">Buscar entidad</label>
          <input id="entity-filter" type="text" placeholder="Escribe para filtrar por nombre o entity_id…" />
          <div class="hint" id="entity-count" style="margin-top:2px;"></div>
        </div>

        <div class="field">
          <label class="label" for="entity-select">Entidad del sensor</label>
          <select id="entity-select">
            <option value="">-- Selecciona una entidad --</option>
          </select>
          <div class="hint">Consejo: escribe arriba para filtrar. Se muestran como máximo ${limit} resultados.</div>
        </div>
      </div>

      <!-- MAPA -->
      <div class="section">
        <h3 class="section-title">Mapa</h3>

        <!-- Check primero, texto después -->
        <div class="field">
          <div class="toggle-row">
            <input type="checkbox" id="show-map" ${this._config.show_map !== false ? "checked" : ""} />
            <label class="label" for="show-map" style="cursor:pointer;">Mostrar mapa</label>
          </div>
        </div>

        <div class="field-inline">
          <div class="field">
            <label class="label" for="map-height-input">Altura mapa (px)</label>
            <input id="map-height-input" type="number" min="200" max="1000" step="10" value="${parseInt(this._config.map_height) || 300}" />
          </div>
          <div class="field">
            <div class="toggle-row">
              <input type="checkbox" id="lock-gestures" ${this._config.lock_gestures !== false ? "checked" : ""} />
              <label class="label" for="lock-gestures" style="cursor:pointer;">Bloquear swipe del dashboard sobre el mapa</label>
            </div>
            <div class="hint">Evita que el gesto de arrastre cambie de dashboard; no afecta al pan/zoom del mapa.</div>
          </div>
        </div>

        <!-- Umbrales & Colores (dos columnas en desktop, una en móvil) -->
        <div class="field-inline">
          <div class="field">
            <label class="label">Verde si &lt; (€/L)</label>
            <div class="pair">
              <input id="price-green-max" type="number" step="0.01" min="0" value="${this._config.price_green_max ?? 1.24}">
              <input id="color-green" type="color" value="${this._config.color_green || '#2e7d32'}">
            </div>
          </div>
          <div class="field">
            <label class="label">Naranja si &lt; (€/L)</label>
            <div class="pair">
              <input id="price-orange-max" type="number" step="0.01" min="0" value="${this._config.price_orange_max ?? 1.45}">
              <input id="color-orange" type="color" value="${this._config.color_orange || '#fb8c00'}">
            </div>
          </div>
        </div>
        
        <div class="field-inline">
          <div class="field">
            <label class="label">Rojo si &lt; (€/L)</label>
            <div class="pair">
              <input id="price-red-max" type="number" step="0.01" min="0" value="${this._config.price_red_max ?? 1.80}">
              <input id="color-red" type="color" value="${this._config.color_red || '#d32f2f'}">
            </div>
          </div>
          <div class="field">
            <label class="label">Color por defecto (≥ rojo o sin precio)</label>
            <div class="pair">
              <input id="color-default" type="color" value="${this._config.color_default || '#6e6e6e'}">
            </div>
          </div>
        </div>


      <!-- LISTA -->
      <div class="section">
        <h3 class="section-title">Lista</h3>

        <div class="field">
          <div class="toggle-row">
            <input type="checkbox" id="show-list" ${this._config.show_list !== false ? "checked" : ""} />
            <label class="label" for="show-list" style="cursor:pointer;">Mostrar lista</label>
          </div>
        </div>

        <div class="field-inline">
          <div class="field">
            <label class="label" for="height-input">Altura lista (px)</label>
            <input id="height-input" type="number" min="200" max="1000" step="10" value="${parseInt(this._config.max_height) || 380}" />
          </div>

          <div class="field">
            <label class="label">Color de las filas</label>
            <div class="radio-group">
              <label class="row" style="gap:8px;"><input type="radio" name="list-color-mode" value="single" ${this._config.list_color_mode !== "by_price" ? "checked" : ""}> Color fijo</label>
              <label class="row" style="gap:8px;"><input type="radio" name="list-color-mode" value="by_price" ${this._config.list_color_mode === "by_price" ? "checked" : ""}> Por precio (umbrales)</label>
            </div>
            <!-- En móvil, esto baja a múltiples líneas automáticamente -->
            <div class="row" id="list-color-row" style="${this._config.list_color_mode === "by_price" ? "display:none" : ""}; margin-top:8px;">
              <span class="hint" style="min-width:140px;">Color fijo:</span>
              <input id="list-color" type="color" value="${this._config.list_color || '#4CAF50'}">
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Inicializar select con filtro vacío
  renderSelectOptions("");

  // Buscar entidad (con debounce sencillo)
  const filterInput = this.querySelector("#entity-filter");
  if (filterInput) {
    let t = null;
    filterInput.addEventListener("input", (ev) => {
      clearTimeout(t);
      const val = ev.target.value;
      t = setTimeout(() => renderSelectOptions(val), 120);
    });
  }

  // Cambio de entidad
  const entitySelect = this.querySelector("#entity-select");
  if (entitySelect) {
    entitySelect.addEventListener("change", (ev) => {
      this._config.entity = ev.target.value;
      this._fireConfigChanged();
    });
  }

  // Checkboxes mostrar/ocultar
  const showMap = this.querySelector("#show-map");
  const showList = this.querySelector("#show-list");
  if (showMap) {
    showMap.addEventListener("change", (ev) => {
      this._config.show_map = ev.target.checked;
      this._fireConfigChanged();
    });
  }
  if (showList) {
    showList.addEventListener("change", (ev) => {
      this._config.show_list = ev.target.checked;
      this._fireConfigChanged();
    });
  }

  // Gestos (lock_gestures)
  const lockGestures = this.querySelector("#lock-gestures");
  if (lockGestures) {
    lockGestures.addEventListener("change", (ev) => {
      this._config.lock_gestures = ev.target.checked;
      this._fireConfigChanged();
    });
  }

  // Alturas
  const heightInput = this.querySelector("#height-input");
  const mapHeightInput = this.querySelector("#map-height-input");
  if (heightInput) {
    heightInput.addEventListener("input", (ev) => {
      this._config.max_height = ev.target.value + "px";
      this._fireConfigChanged();
    });
  }
  if (mapHeightInput) {
    mapHeightInput.addEventListener("input", (ev) => {
      this._config.map_height = ev.target.value + "px";
      this._fireConfigChanged();
    });
  }

  // Umbrales/colores
  const bindNum = (id, key) => {
    const el = this.querySelector(`#${id}`);
    if (el) el.addEventListener("input", (ev) => {
      const v = Number(ev.target.value);
      this._config[key] = Number.isFinite(v) ? v : this._config[key];
      this._fireConfigChanged();
    });
  };
  const bindColor = (id, key) => {
    const el = this.querySelector(`#${id}`);
    if (el) el.addEventListener("input", (ev) => {
      this._config[key] = ev.target.value;
      this._fireConfigChanged();
    });
  };

  bindNum("price-green-max",  "price_green_max");
  bindNum("price-orange-max", "price_orange_max");
  bindNum("price-red-max",    "price_red_max");

  bindColor("color-green",   "color_green");
  bindColor("color-orange",  "color_orange");
  bindColor("color-red",     "color_red");
  bindColor("color-default", "color_default");

  // Lista: modo color + color fijo
  const listColorRow = this.querySelector("#list-color-row");
  this.querySelectorAll('input[name="list-color-mode"]').forEach((radio) => {
    radio.addEventListener("change", (ev) => {
      this._config.list_color_mode = ev.target.value;
      if (listColorRow) listColorRow.style.display = ev.target.value === "by_price" ? "none" : "";
      this._fireConfigChanged();
    });
  });
  const listColor = this.querySelector("#list-color");
  if (listColor) {
    listColor.addEventListener("input", (ev) => {
      this._config.list_color = ev.target.value;
      this._fireConfigChanged();
    });
  }
}


    _fireConfigChanged() {
      const event = new Event("config-changed", { bubbles: true, composed: true });
      event.detail = { config: this._config };
      this.dispatchEvent(event);
    }
  }

  customElements.define("gas-stations-list-card-editor", GasStationsListCardEditor);

  // Registro de la tarjeta
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "Gas Stations List Card",
    description: "Mapa Leaflet con marcadores por precio; popup: Ver en la lista / Abrir en mapas; bloqueo de swipe del dashboard sobre el mapa.",
  });

  console.info(
    "%c  GAS-STATIONS-LIST-CARD  \n%c  Version 6.3 - bloqueo de swipe del dashboard sobre el mapa (sin romper drag)",
    "color: orange; font-weight: bold; background: black",
    "color: white; font-weight: bold; background: dimgray"
  );
})();
