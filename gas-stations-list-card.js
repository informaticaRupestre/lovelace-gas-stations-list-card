/**
 * Gas Stations Card - v6.3
 * Combina mapa Leaflet + lista de gasolineras con scroll, orden dinámico
 * y apertura en Google/Apple/Waze según el dispositivo.
 * Compatible con Home Assistant 2025.10+
 * Editor visual funcional - Soporte UTF-8
 */

(() => {
  const CARD_TYPE = "gas-stations-card";
  if (customElements.get(CARD_TYPE)) return;

  class GasStationsCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.sortMode = "distancia";
      this.map = null;
    }

    async connectedCallback() {
      await customElements.whenDefined("ha-icon");
    }

    setConfig(config) {
      if (!config?.entity) {
        throw new Error("Debes definir la entidad del sensor con las gasolineras.");
      }

      this.config = config;
      this.maxHeight = config.max_height || "380px";
      this.showMap = config.show_map !== false;
      this.showList = config.show_list !== false;
      this.zoom = config.zoom || 12;

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
          .list-container {
            flex:1; overflow-y:auto; max-height:${this.maxHeight};
            padding:12px 16px 16px;
          }
          .item {
            padding:12px; margin-bottom:12px; border-radius:8px;
            background:var(--secondary-background-color,#f5f5f5);
            border-left:4px solid var(--primary-color);
            transition:transform .2s ease, box-shadow .2s ease;
          }
          .item:hover { transform:translateX(4px); box-shadow:0 2px 6px rgba(0,0,0,0.15); }
          .name { font-weight:700; color:var(--primary-color); font-size:16px; display:flex; align-items:center; gap:6px; }
          .address { font-size:13px; color:var(--secondary-text-color); margin:4px 0 8px; }
          .details { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
          .price { font-size:18px; font-weight:700; color:#4CAF50; display:flex; align-items:center; gap:4px; }
          .distance {
            background:var(--primary-color); color:#fff;
            padding:4px 10px; border-radius:12px;
            font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px;
          }
          .distance:hover { opacity:0.9; }
          .list-container::-webkit-scrollbar { width:8px; }
          .list-container::-webkit-scrollbar-thumb {
            background:var(--primary-color); border-radius:4px;
          }
          #map {
            height:300px;
            width:100%;
            border-bottom:1px solid var(--divider-color,#ddd);
            border-radius:8px;
            overflow:hidden;
          }
          .empty { text-align:center; padding:24px; color:var(--secondary-text-color); }
        </style>

        <ha-card>
          <div class="header">
            <div class="title"><ha-icon icon="mdi:gas-station"></ha-icon> Gasolineras</div>
            <select id="sort-select">
              <option value="distancia">Por cercan\u00EDa</option>
              <option value="precio">Por precio</option>
            </select>
          </div>
          <div id="content"></div>
        </ha-card>
      `;

      this.shadowRoot.getElementById("sort-select")
        .addEventListener("change", (ev) => {
          this.sortMode = ev.target.value;
          this._render();
        });
    }

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
      this._render();
    }

    _sortGasStations(gasolineras) {
      const sorted = [...gasolineras];
      if (this.sortMode === "precio") {
        sorted.sort((a, b) => parseFloat(a.precio) - parseFloat(b.precio));
      } else {
        sorted.sort((a, b) => parseFloat(a.distancia_km) - parseFloat(b.distancia_km));
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

    _render() {
      const contentEl = this.shadowRoot.getElementById("content");
      contentEl.innerHTML = "";

      if (!this._gasData) {
        this._renderMsg("Sin datos");
        return;
      }

      const data = this._sortGasStations(this._gasData);

      // ---- MAPA (Leaflet) ----
      if (this.showMap) {
        const mapContainer = document.createElement("div");
        mapContainer.id = "map";
        contentEl.appendChild(mapContainer);

        setTimeout(() => {
          if (!window.L) {
            this._renderMsg("Leaflet no disponible en este entorno.");
            return;
          }

          if (this.map) {
            this.map.remove();
            this.map = null;
          }

          const L = window.L;
          const first = data.find(g => g.latitud && g.longitud);
          if (!first) {
            this._renderMsg("No hay coordenadas válidas.");
            return;
          }

          this.map = L.map(mapContainer).setView(
            [parseFloat(first.latitud), parseFloat(first.longitud)],
            this.zoom
          );

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
            maxZoom: 19,
          }).addTo(this.map);

          const markers = [];

          data.forEach((g) => {
            if (!g.latitud || !g.longitud) return;
            const marker = L.marker([parseFloat(g.latitud), parseFloat(g.longitud)]).addTo(this.map);
            marker.bindPopup(`
              <strong>${g.nombre ?? "Gasolinera"}</strong><br>
              ${g.direccion ?? ""}${g.localidad ? ", " + g.localidad : ""}<br>
              <b>${g.precio ?? "-"} €/L</b>
            `);
            markers.push(marker);
          });

          if (markers.length > 1) {
            const group = L.featureGroup(markers);
            this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
          }

          // 🔧 Corregir tamaño al renderizar
          setTimeout(() => this.map.invalidateSize(), 300);
        }, 50);
      }

      // ---- LISTA ----
      if (this.showList) {
        const listEl = document.createElement("div");
        listEl.classList.add("list-container");
        listEl.innerHTML = data.map(
          (g, i) => `
            <div class="item" data-i="${i}">
              <div class="name">
                <ha-icon icon="mdi:gas-station"></ha-icon>
                ${g.nombre ?? "Gasolinera"}
              </div>
              <div class="address">${g.direccion ?? ""}${g.localidad ? ", " + g.localidad : ""}</div>
              <div class="details">
                <div class="price">
                  <ha-icon icon="mdi:currency-eur"></ha-icon>
                  ${g.precio ?? "-"} €/L
                </div>
                <div class="distance" data-lat="${g.latitud}" data-lon="${g.longitud}">
                  <ha-icon icon="mdi:map-marker"></ha-icon>
                  ${g.distancia_km ?? "-"} km
                </div>
              </div>
            </div>`
        ).join("");

        listEl.querySelectorAll(".distance").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            const lat = ev.currentTarget.dataset.lat;
            const lon = ev.currentTarget.dataset.lon;
            if (lat && lon) this._openMap(lat, lon);
          });
        });

        contentEl.appendChild(listEl);
      }
    }

    _renderMsg(msg) {
      const contentEl = this.shadowRoot.getElementById("content");
      contentEl.innerHTML = `<div class="empty">${msg}</div>`;
    }

    getCardSize() {
      return this.showMap && this.showList ? 7 : 5;
    }

    static getConfigElement() {
      return document.createElement("gas-stations-card-editor");
    }

    static getStubConfig() {
      return { entity: "", show_map: true, show_list: true, max_height: "380px" };
    }
  }

  customElements.define(CARD_TYPE, GasStationsCard);

  // -------------------------------------------------------------
  // EDITOR VISUAL FUNCIONAL
  // -------------------------------------------------------------
  class GasStationsCardEditor extends HTMLElement {
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

      this.innerHTML = `
        <style>
          .editor-container { padding:16px; display:flex; flex-direction:column; gap:20px; }
          .field { display:flex; flex-direction:column; gap:8px; }
          .field label { font-weight:600; font-size:14px; color:var(--primary-text-color); }
          input, select {
            padding:8px 12px; border:1px solid var(--divider-color,#ddd);
            border-radius:4px; background:var(--card-background-color);
            color:var(--primary-text-color); font-size:14px;
          }
          input:focus, select:focus { outline:none; border-color:var(--primary-color); }
          .checkbox { display:flex; align-items:center; gap:8px; }
        </style>
        <div class="editor-container">
          <div class="field">
            <label>Entidad del sensor</label>
            <select id="entity-select"></select>
          </div>

          <div class="checkbox">
            <input type="checkbox" id="show-map" ${this._config.show_map !== false ? "checked" : ""}/>
            <label for="show-map">Mostrar mapa</label>
          </div>

          <div class="checkbox">
            <input type="checkbox" id="show-list" ${this._config.show_list !== false ? "checked" : ""}/>
            <label for="show-list">Mostrar lista</label>
          </div>

          <div class="field">
            <label>Altura máxima lista (px)</label>
            <input id="height-input" type="number" value="${parseInt(this._config.max_height) || 380}" />
          </div>

          <div class="field">
            <label>Zoom inicial del mapa</label>
            <input id="zoom-input" type="number" value="${parseInt(this._config.zoom) || 12}" />
          </div>
        </div>
      `;

      const entitySelect = this.querySelector("#entity-select");
      Object.keys(this._hass.states)
        .filter(e => e.startsWith("sensor."))
        .forEach(entityId => {
          const option = document.createElement("option");
          option.value = entityId;
          option.textContent = this._hass.states[entityId].attributes.friendly_name || entityId;
          if (entityId === this._config.entity) option.selected = true;
          entitySelect.appendChild(option);
        });

      entitySelect.addEventListener("change", e => {
        this._config.entity = e.target.value;
        this._fireConfigChanged();
      });

      ["show-map", "show-list", "height-input", "zoom-input"].forEach(id => {
        this.querySelector(`#${id}`).addEventListener("input", e => {
          if (id.includes("show")) {
            this._config[id.replace("-", "_")] = e.target.checked;
          } else if (id === "height-input") {
            this._config.max_height = e.target.value + "px";
          } else if (id === "zoom-input") {
            this._config.zoom = parseInt(e.target.value);
          }
          this._fireConfigChanged();
        });
      });
    }

    _fireConfigChanged() {
      const ev = new Event("config-changed", { bubbles: true, composed: true });
      ev.detail = { config: this._config };
      this.dispatchEvent(ev);
    }
  }

  customElements.define("gas-stations-card-editor", GasStationsCardEditor);

  // Registro
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "Gas Stations Card",
    description: "Muestra gasolineras en mapa y lista con orden dinámico.",
  });

  console.info(
    "%c GAS-STATIONS-CARD %c v6.3 - Mapa Leaflet + Lista funcional",
    "color: orange; font-weight: bold; background: black",
    "color: white; font-weight: bold; background: dimgray"
  );
})();
