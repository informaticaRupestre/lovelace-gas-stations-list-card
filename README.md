
# 🛢️ Gas Stations List Card

**Versión:** v6.3  
**Compatibilidad:** Home Assistant 2025.10+  
**Tipo:** Custom Lovelace Card  
**Autor:** [informaticaRupestre](https://github.com/informaticaRupestre)

Tarjeta Lovelace para Home Assistant que muestra **gasolineras cercanas** con **mapa Leaflet**, **marcadores coloreados por precio**, **lista ordenable**, y acciones rápidas tanto en la lista como en el popup del mapa.

---

## 📸 Capturas de pantalla

[//]: # (> Sube tus imágenes a `assets/` del repositorio y ajusta las rutas aquí.)
[//]: # (>)
[//]: # (> Ejemplo de estructura:)
[//]: # (> ```)
[//]: # (> assets/)
[//]: # (> ├── screenshot-list.png)
[//]: # (> └── screenshot-map.png)
[//]: # (> ```)

| Tarjeta                                                | Editor Tarjeta                                                                                                                                                                                                                           |
|--------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ![Editor de entidad](/assets/screenshot-card.png)<br/> | Fuente de datos<br/>![Editor Fuente de datos](/assets/screenshot-editor-card-entity.png)<br/>Mapa<br/>![Editor mapa](/assets/screenshot-editor-card-map.png)<br/>Lista<br/>![Editor lista](/assets/screenshot-editor-card-list.png)<br/> |

---

## ✅ Estado del proyecto (Checklist)

### Hecho
- [x] Orden dinámico por **distancia** o **precio**.  
- [x] **Mapa Leaflet** (CDN) con altura configurable.  
- [x] **Marcadores SVG** con color según **umbrales de precio** configurables.  
- [x] **Popup** con acciones: **Ver en la lista** (scroll + highlight) y **Abrir en mapas** (Android/iOS/Escritorio).  
- [x] **Botón "Ver en mapa"** en la lista (centra, zoom y abre popup).  
- [x] Editor visual estructurado (Mapa / Lista / Umbrales & colores).  
- [x] **Buscador de entidades** en el editor (filtra por nombre o *entity_id*).  
- [x] Editor **responsive** para móvil (campos en una columna; número+color alineados).  
- [x] Soporte UTF-8 y estilos compatibles con temas de Home Assistant.  

### Próximas mejoras
- [ ] **Clustering** de marcadores con muchas gasolineras.  
- [ ] **Centrar en mi ubicación** si existe `device_tracker`/coordenadas del usuario.  
- [ ] **Leyenda** de colores en cabecera.  
- [ ] **Filtros** (municipio, rango de precio, tipo de combustible).  
- [ ] **Soporte multi-combustible** (95/98/diésel).  
- [ ] Modo **compacto** móvil.  
- [ ] **Accesibilidad (A11y)** y tests.  

> Si quieres votar o proponer nuevas features, abre un **issue** o un **discussion** en el repo.

---

## ✨ Características clave

- 🗺️ **Mapa Leaflet (CDN)** con altura fija configurable: `map_height`.  
- 📍 **Marcadores SVG** tipo gota con color **por umbrales de precio**.  
- 🧭 **Orden dinámico**: por **distancia** o **precio**.  
- 🧷 **Popup del mapa** con:  
  - **Ver en la lista** → hace scroll a la gasolinera y la resalta.  
  - **Abrir en mapas** → Android (`geo:`), iOS (`maps://`) o Google Maps web.  
- 📋 **Lista** con:  
  - Botón **Ver en mapa** (centra+zoom+popup).  
  - Botón **Distancia** que abre la app de mapas nativa.  
- 🧩 **Editor visual**: Mapa/Lista/Umbrales & colores, **buscador de entidades**, y **layout responsive**.  
- 🎨 **Colores configurables** para marcadores y para el borde de cada item en la lista.  

---

## ⚙️ Requisitos

Esta tarjeta requiere la integración personalizada:  
➡️ **Geoportal Gasolineras** — <https://github.com/informaticaRupestre/geoportal_gasolineras>

La integración debe exponer un **sensor** con un atributo `gasolineras` que contenga una lista de objetos con las propiedades:

```yaml
gasolineras:
  - nombre: "Repsol Madrid Norte"
    direccion: "Av. de Burgos, 89"
    localidad: "Madrid"
    precio: 1.529
    distancia_km: 2.4
    latitud: 40.484
    longitud: -3.686
```

---

## 📦 Instalación (HACS)

1. Abre **HACS → Frontend → Repositorios personalizados**.  
2. Añade el repo:  
   ```
   https://github.com/informaticaRupestre/lovelace-gas-stations-list-card
   ```
   Tipo: `Plugin`  
3. Busca **Gas Stations List Card** en HACS y pulsa **Instalar**.  
4. Verifica el recurso en **Ajustes → Paneles → Recursos**:  
   ```
   /hacsfiles/gas-stations-list-card.js
   ```

> Instalación manual: copia `gas-stations-list-card.js` en `/www/` y añade el recurso desde **Ajustes → Paneles → Recursos**.

---

## 🚀 Uso

### Configuración desde la interfaz (recomendada)

1. Lovelace → “Editar dashboard” → “+ Añadir tarjeta”.  
2. Selecciona **Gas Stations List Card**.  
3. Completa las secciones **Mapa**, **Lista** y **Umbrales & colores**.  

### Ejemplo YAML mínimo

```yaml
type: custom:gas-stations-list-card
entity: sensor.geoportal_gasolineras
```

### Ejemplo YAML avanzado

```yaml
type: custom:gas-stations-list-card
entity: sensor.geoportal_gasolineras
show_map: true
show_list: true
max_height: 420px        # altura de la lista
map_height: 320px        # altura del mapa
focus_zoom: 16           # zoom al enfocar una gasolinera desde la lista
lock_gestures: true      # evita swipe de dashboard al arrastrar el mapa

# Colores y umbrales para marcadores (y opcionalmente lista)
price_green_max: 1.24
price_orange_max: 1.45
price_red_max: 1.80
color_green: "#2e7d32"
color_orange: "#fb8c00"
color_red: "#d32f2f"
color_default: "#6e6e6e"

# Color de filas en la lista
list_color_mode: by_price  # "by_price" (por umbrales) | "single" (color fijo)
list_color: "#4CAF50"      # usado si list_color_mode = single
```

---

## 🔧 Parámetros

| Clave               | Tipo     | Por defecto | Descripción |
|---------------------|----------|-------------|-------------|
| `entity`            | string   | —           | **Requerido.** Sensor con atributo `gasolineras`. |
| `show_map`          | boolean  | `true`      | Mostrar mapa Leaflet. |
| `show_list`         | boolean  | `true`      | Mostrar lista. |
| `max_height`        | string   | `380px`     | Altura máxima visible de la lista (scroll interno). |
| `map_height`        | string   | `300px`     | Altura del mapa. |
| `focus_zoom`        | number   | `15`        | Zoom al centrar una gasolinera. |
| `lock_gestures`     | boolean  | `true`      | Evita cambiar de dashboard al arrastrar el mapa. |
| `price_green_max`   | number   | `1.24`      | Precio (€/L) inferior a este valor → **verde**. |
| `price_orange_max`  | number   | `1.45`      | Precio (€/L) inferior a este valor → **naranja**. |
| `price_red_max`     | number   | `1.80`      | Precio (€/L) inferior a este valor → **rojo**. |
| `color_green`       | string   | `#2e7d32`   | Color para rango verde. |
| `color_orange`      | string   | `#fb8c00`   | Color para rango naranja. |
| `color_red`         | string   | `#d32f2f`   | Color para rango rojo. |
| `color_default`     | string   | `#6e6e6e`   | Color por defecto (≥ rojo o sin precio válido). |
| `list_color_mode`   | string   | `single`    | `single` o `by_price` (usa umbrales). |
| `list_color`        | string   | `#4CAF50`   | Usado si `list_color_mode` = `single`. |

---

## 🧭 Acciones

- **Lista → Ver en mapa**: centra/zoomea el mapa y abre el popup del marcador.  
- **Lista → Distancia**: abre la app de mapas del dispositivo:  
  - Android: `geo:LAT,LON?q=LAT,LON`  
  - iOS: `maps://maps.apple.com/?q=LAT,LON`  
  - Escritorio: Google Maps Web  
- **Popup → Ver en la lista**: scroll a la tarjeta de esa gasolinera y **resaltado temporal**.  
- **Popup → Abrir en mapas**: misma lógica que el botón de **distancia** de la lista.

---

## 🐞 Problemas y soporte

- Limpia la caché de Home Assistant/navegador tras actualizar (`Ctrl+F5`).  
- Si el mapa se ve “cortado”, revisa `map_height` y que el contenedor no tenga `display:none` al inicializar.  
- Abre un **issue** si encuentras bugs o tienes propuestas.

---

## 🧠 Créditos y licencia

Desarrollado por **informaticaRupestre**  
Basado en datos del **Geoportal del Ministerio para la Transición Ecológica (España)**  
Licencia: **MIT**
