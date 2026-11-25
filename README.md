# n8n · Automatizaciones

Flujos de automatización con [n8n](https://n8n.io) para practicar integración de servicios, validación de datos y respuestas por webhook.

## Flujos

| Flujo | Qué hace |
| --- | --- |
| [`clasificar-postulaciones`](flujos/clasificar-postulaciones.json) | Recibe una postulación por webhook, calcula un puntaje y devuelve su prioridad (alta, media o baja). Si faltan datos responde `400`. |

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

## Nota

No usa credenciales ni servicios externos, así que se puede importar y probar sin configurar nada.

## Licencia

MIT