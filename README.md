# n8n · Automatizaciones

[![CI](https://github.com/allisonrvargas/n8n-automatizaciones/actions/workflows/ci.yml/badge.svg)](https://github.com/allisonrvargas/n8n-automatizaciones/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)

Flujos de automatización con [n8n](https://n8n.io) para practicar integración de servicios, validación de datos y respuestas por webhook.

## Flujos

| Flujo | Qué hace |
| --- | --- |
| [`clasificar-postulaciones`](flujos/clasificar-postulaciones.json) | Recibe una postulación por webhook, calcula un puntaje y devuelve su prioridad (alta, media o baja). Si faltan datos responde `400`. |
| [`validar-contacto`](flujos/validar-contacto.json) | Valida nombre, correo y mensaje de un formulario de contacto, normaliza los datos (nombre con mayúsculas, correo en minúsculas) y responde `200` o `400` con la lista de errores. |
| [`resumen-ventas`](flujos/resumen-ventas.json) | Recibe una lista de ventas, las agrupa por categoría y devuelve unidades, total por categoría, total general y la categoría con más ventas. |

### Clasificar postulaciones

```
Webhook (POST /postulacion) → Code (puntaje) → IF (¿datos válidos?) ─┬─ sí → Respond (200 + prioridad)
                                                                    └─ no → Respond (400 + error)
```

**Regla de puntaje:** `años de experiencia × 10 + cantidad de habilidades × 5`, con tope de 100.

| Puntaje | Prioridad |
| --- | --- |
| 70 o más | alta |
| 40 a 69 | media |
| menos de 40 | baja |

Está pensado como complemento de [api-postulaciones](https://github.com/allisonrvargas/api-postulaciones), que hace un cálculo parecido en el backend.

## Cómo usarlo

1. En n8n: **Workflows → Import from file** y elige `flujos/clasificar-postulaciones.json`.
2. Abre el nodo **Webhook postulación** y copia la URL de prueba.
3. Envía una postulación:

```bash
curl -X POST "<URL-del-webhook>" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","vacante":"Backend","anios_experiencia":4,"habilidades":["node","sql","docker"]}'
```

Respuesta esperada (`200`):

```json
{ "nombre": "Ana", "vacante": "Backend", "puntaje": 55, "prioridad": "media" }
```

Sin `nombre` o `vacante` responde `400` con el mensaje de error.

## Pruebas

Además de probarlos a mano en una instancia local de n8n 2.49.6, los flujos tienen pruebas automáticas que se ejecutan en el CI:

```bash
npm test
```

13 pruebas con `node:test`, sin instalar nada:
- **Estructura:** nombres e ids únicos, conexiones que apuntan a nodos existentes, un webhook POST por flujo, nodos de respuesta, ningún nodo suelto y rutas de webhook sin repetir.
- **Seguridad:** ningún flujo referencia credenciales ni contiene claves.
- **Lógica:** el código de cada nodo *Code* se ejecuta con entradas reales: el puntaje y los límites de prioridad (39/40, 69/70 y tope de 100), la normalización de contactos y el agrupado de ventas con redondeo.

Ejemplo de petición al flujo de contactos:

```bash
curl -X POST "<URL>/webhook/contacto" -H "Content-Type: application/json" \
  -d '{"nombre":"maría josé","correo":"MARIA@Correo.com","mensaje":"Hola, me interesa trabajar con ustedes"}'
# -> {"ok":true,"contacto":{"nombre":"María José","correo":"maria@correo.com", ...}}
```
## Licencia

MIT