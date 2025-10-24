/**
 * Gas Stations List Card - v5.1
 * Lista de gasolineras con scroll interno, orden dinamico y
 * apertura de mapas (Google / Apple / Waze segun dispositivo).
 * Compatible con Home Assistant 2025.10+
 * Editor visual FUNCIONAL - Soporte UTF-8
 */

(() => {
  const CARD_TYPE = "gas-stations-list-card";
  if (customElements.get(CARD_TYPE)) return;

  class GasStationsListCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.sortMode = "distancia";
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
            text-decoration:none;
          }
          .distance:hover { opacity:0.9; }
          .list-container::-webkit-scrollbar { width:8px; }
          .list-container::-webkit-scrollbar-thumb {
            background:var(--primary-color); border-radius:4px;
          }
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
          <div id="list" class="list-container"></div>
        </ha-card>
      `;

      this.shadowRoot.getElementById("sort-select")
        .addEventListener("change", (ev) => {
          this.sortMode = ev.target.value;
          this._renderList();
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
      this._renderList();
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

    _renderList() {
      const listEl = this.shadowRoot.getElementById("list");
      if (!this._gasData) {
        this._renderMsg("Sin datos");
        return;
      }

      const data = this._sortGasStations(this._gasData);
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
    }

    _renderMsg(msg) {
      const listEl = this.shadowRoot.getElementById("list");
      listEl.innerHTML = `<div class="empty">${msg}</div>`;
    }

    getCardSize() { return 5; }

    static getConfigElement() {
      return document.createElement("gas-stations-list-card-editor");
    }

    static getStubConfig() {
      return { entity: "", max_height: "380px" };
    }
  }

  customElements.define(CARD_TYPE, GasStationsListCard);

  // -------------------------------------------------------------
  // EDITOR VISUAL FUNCIONAL
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
      if (!this._rendered) {
        this._render();
      }
    }

    _render() {
      if (!this._hass) return;
      this._rendered = true;

      this.innerHTML = `
        <style>
          .editor-container {
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .field {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .field label {
            font-weight: 600;
            font-size: 14px;
            color: var(--primary-text-color);
          }
          .field input,
          .field select {
            padding: 8px 12px;
            border: 1px solid var(--divider-color, #ddd);
            border-radius: 4px;
            background: var(--card-background-color);
            color: var(--primary-text-color);
            font-size: 14px;
          }
          .field input:focus,
          .field select:focus {
            outline: none;
            border-color: var(--primary-color);
          }
          .hint {
            font-size: 12px;
            color: var(--secondary-text-color);
            margin-top: 4px;
          }
        </style>
        <div class="editor-container">
          <div class="field">
            <label for="entity-select">Entidad del sensor</label>
            <select id="entity-select">
              <option value="">-- Selecciona una entidad --</option>
            </select>
            <div class="hint">Selecciona el sensor que contiene los datos de gasolineras</div>
          </div>
          
          <div class="field">
            <label for="height-input">Altura m\u00E1xima (px)</label>
            <input 
              id="height-input" 
              type="number" 
              min="200" 
              max="1000" 
              step="10"
              value="${parseInt(this._config.max_height) || 380}"
            />
            <div class="hint">Altura m\u00E1xima de la lista antes de mostrar scroll</div>
          </div>
        </div>
      `;

      // Poblar el selector con entidades tipo sensor
      const entitySelect = this.querySelector("#entity-select");
      if (entitySelect && this._hass) {
        const sensors = Object.keys(this._hass.states)
          .filter(e => e.startsWith("sensor."))
          .sort();

        sensors.forEach(entityId => {
          const option = document.createElement("option");
          option.value = entityId;
          option.textContent = this._hass.states[entityId].attributes.friendly_name || entityId;
          if (entityId === this._config.entity) {
            option.selected = true;
          }
          entitySelect.appendChild(option);
        });

        entitySelect.addEventListener("change", (ev) => {
          this._config.entity = ev.target.value;
          this._fireConfigChanged();
        });
      }

      // Input de altura
      const heightInput = this.querySelector("#height-input");
      if (heightInput) {
        heightInput.addEventListener("input", (ev) => {
          this._config.max_height = ev.target.value + "px";
          this._fireConfigChanged();
        });
      }
    }

    _fireConfigChanged() {
      const event = new Event("config-changed", {
        bubbles: true,
        composed: true
      });
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
    description: "Lista de gasolineras con scroll, orden y apertura de mapas según dispositivo.",
  });

  console.info(
    "%c  GAS-STATIONS-LIST-CARD  \n%c  Version 5.0 - Editor funcional  ",
    "color: orange; font-weight: bold; background: black",
    "color: white; font-weight: bold; background: dimgray"
  );
})();