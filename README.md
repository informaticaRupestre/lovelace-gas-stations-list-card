# 🛢️ Gas Stations List Card

**Versión:** v5.1  
**Compatibilidad:** Home Assistant 2025.10+  
**Tipo:** Custom Lovelace Card  
**Autor:** informaticaRupestre(https://github.com/informaticaRupestre)

Una tarjeta Lovelace para Home Assistant que muestra una lista de **gasolineras cercanas** con desplazamiento interno, orden dinámico por distancia o precio, y apertura directa en Google Maps, Apple Maps o Waze según el dispositivo.

![screenshot](https://github.com/tuusuario/lovelace-gas-stations-list-card/assets/demo.png)

---

## ✨ Características

- 🧭 Orden dinámico: por **distancia** o **precio**.  
- 🗺️ Apertura directa del mapa compatible con Android, iOS y navegador.  
- 📱 Diseño adaptable con scroll interno y encabezado fijo.  
- 🎨 Estilos integrados compatibles con el tema actual de Home Assistant.  
- ⚙️ Editor visual funcional (no requiere YAML).  
- 🔤 Total soporte UTF-8 para nombres y ubicaciones con acentos.

---

## ⚙️ Requisitos

Esta tarjeta requiere la integración personalizada  
➡️ [github.com/informaticaRupestre/geoportal_gasolineras](https://github.com/informaticaRupestre/geoportal_gasolineras)

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

1. Abre **HACS → Frontend → Repositorios personalizados**  
2. Añade el repo:  
   ```
   https://github.com/informaticaRupestre/lovelace-gas-stations-list-card
   ```
   Tipo: `Plugin`
3. Busca la tarjeta en HACS y pulsa **Instalar**.  
4. En **Recursos de Lovelace**, verifica que se haya añadido automáticamente:  
   ```
   /hacsfiles/gas-stations-list-card.js
   ```

---

## 🚀 Uso

### 📋 Configuración desde la interfaz (recomendada)

1. En Lovelace → “Editar dashboard” → “+ Añadir tarjeta”
2. Selecciona **Gas Stations List Card**
3. Completa:
   - **Entidad:** el sensor con la lista de gasolineras.
   - **Altura máxima:** altura visible antes de mostrar scroll.

---

### 🧾 Ejemplo YAML

```yaml
type: custom:gas-stations-list-card
entity: sensor.geoportal_gasolineras
max_height: 400px
```

---

## ⚙️ Parámetros

| Parámetro     | Tipo   | Requerido | Descripción |
|----------------|--------|------------|--------------|
| `entity`       | string | ✅ Sí | Sensor que contiene la lista de gasolineras. |
| `max_height`   | string | ❌ No | Altura máxima del contenedor antes de mostrar scroll. Por defecto: `380px`. |

---

## 💡 Consejos

- Para un rendimiento óptimo, limita la lista a ~50 gasolineras.  
- Los clics sobre la distancia abren el mapa según tu dispositivo.  
- Cambia el modo de orden usando el selector del encabezado.

---

## 🧠 Créditos

Desarrollado por **TuNombre**  
Basado en datos del **Geoportal del Ministerio para la Transición Ecológica (España)**  
Licencia: MIT

---

## 🧩 Sugerencias de mejora (ideas futuras)

### 🧱 Estructura y rendimiento
- **Renderizado selectivo:** optimizar `_renderList()` para no regenerar todo el `innerHTML` cada vez.  
- **Variables CSS dinámicas:** manejar `max_height` mediante `--max-height` para mejor integración con temas.  
- **Accesibilidad (A11y):** añadir `role="button"` y `aria-label` en elementos interactivos.  
- **Soporte de temas oscuros personalizados:** permitir un parámetro `accent_color`.

### 🎨 Interfaz / UX
- Mostrar logotipos o colores por marca (Repsol, Cepsa, etc.).  
- Filtros avanzados (precio máximo, tipo de combustible).  
- Modo compacto para móviles (`compact: true`).  
- Animaciones de entrada suaves con `opacity` o `transform`.  
- Abrir el mapa también al hacer clic en el nombre.
