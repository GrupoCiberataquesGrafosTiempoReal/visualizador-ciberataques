# Visualizador de Tráfico de Red en Tiempo Real - TFM

Este proyecto permite la monitorización en tiempo real de conexiones e incidentes de seguridad mediante un grafo interactivo 2D, utilizando datos estructurados provenientes de **Zeek** y almacenados en una base de datos de grafos **Neo4j**.

Desarrollado como parte del Trabajo Fin de Máster (TFM).

## 🚀 Características Principales

- **Streaming e Ingesta en Tiempo Real:** Actualización constante de la topología de red mediante ventanas de tiempo configurables (5s, 10s, 30s, 1min).
- **Reconciliación Eficiente de Memoria:** El motor de físicas conserva la posición y estado de los nodos existentes entre actualizaciones, evitando parpadeos y garantizando una navegación fluida.
- **Panel de Control SOC con Filtros Rápidos:**
  -  *Solo Ataques:* Aísla instantáneamente el tráfico malicioso ocultando los flujos benignos.
  -  *Ocultar LAN:* Filtra las conexiones internas (LAN a LAN) para centrar la atención en el tráfico perimetral (WAN/Internet).
- **Focus Mode (Atenuación Visual):** Al seleccionar cualquier nodo o relación, el resto de la red se atenúa visualmente y se resalta el camino del flujo para una investigación forense sin distracciones.
- **Inspector de Atributos Zeek (Acordeón):** Panel lateral desplegable que desglosa todas las métricas de red inyectadas por Zeek (UID, bytes, paquetes, protocolos, servicios como HTTP/DNS/SSH y estados de conexión).

##  Código de Colores (Cyberpunk SOC Palette)

Para optimizar la carga cognitiva del analista, se ha implementado una paleta de alto contraste sobre fondo oscuro:
- **Nodos Origen (Iniciador/Atacante):** 🔵 Cian (`#00d8ff`)
- **Nodos Destino (Servidor/Víctima):** 🟡 Amarillo Dorado (`#fbc531`)
- **Nodos con Doble Rol (Mixto):** 🟣 Violeta (`#c56cf0`)
- **Tráfico Benigno:** 🟢 Líneas verdes semi-transparentes (`rgba`) para evitar la saturación visual.
- **Tráfico Malicioso (Ataques):** 🔴 Líneas rojas gruesas para una detección de amenazas inmediata.

##  Tecnologías Utilizadas

- **Frontend:** React (Vite), JavaScript (ES6+), HTML5 Canvas.
- **Visualización de Grafos:** `react-force-graph-2d` (basado en las físicas de D3.js).
- **Base de Datos:** Neo4j Graph Database.
- **Conectividad:** `neo4j-driver` para la comunicación directa desde el cliente web.

##  Instalación y Configuración Local

Sigue estos pasos para clonar y ejecutar el entorno de desarrollo en tu máquina:

### 1. Prerrequisitos
Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior) y una instancia de [Neo4j](https://neo4j.com/) activa con la base de datos configurada.

### 2. Clonar el repositorio
```bash
git clone [https://github.com/GrupoCiberataquesGrafosTiempoReal/visualizador-ciberataques.git](https://github.com/GrupoCiberataquesGrafosTiempoReal/visualizador-ciberataques.git)
cd visualizador-ciberataques
```

### 3. Clonar el repositorio
```bash
npm install
```

### 4. Variables de Entorno
#### 4.1 Copia el archivo de plantilla:
```bash
cp .env.example .env
```
#### 4.2 Abre el nuevo archivo .env y edítalo con las credenciales de tu base de datos de Neo4

### 5. Iniciar la aplicación
Arranca el servidor de desarrollo local de Vite:
```bash
npm run dev
```