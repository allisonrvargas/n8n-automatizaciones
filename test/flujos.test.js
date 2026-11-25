import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const carpeta = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'flujos');
const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.json'));
const flujos = Object.fromEntries(archivos.map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(carpeta, f), 'utf8'))]));

// Ejecuta el código del nodo Code como lo hace n8n: dentro de una función, con $input.first().json
function ejecutarNodoCode(flujo, nombreNodo, entrada) {
    const nodo = flujo.nodes.find((n) => n.name === nombreNodo);
    assert.ok(nodo, `no existe el nodo ${nombreNodo}`);
    const fn = vm.runInNewContext(`(function ($input) {\n${nodo.parameters.jsCode}\n})`, {});
    return JSON.parse(JSON.stringify(fn({ first: () => ({ json: entrada }) })))[0].json;
}

test('hay 3 flujos y todos son JSON válido', () => {
    assert.equal(archivos.length, 3);
});

for (const [id, flujo] of Object.entries(flujos)) {
    test(`${id}: estructura (nombres únicos, conexiones válidas, un webhook y respuestas)`, () => {
        const nombres = flujo.nodes.map((n) => n.name);
        assert.equal(new Set(nombres).size, nombres.length, 'hay nombres de nodo repetidos');
        assert.equal(new Set(flujo.nodes.map((n) => n.id)).size, flujo.nodes.length, 'hay ids repetidos');

        for (const [origen, salidas] of Object.entries(flujo.connections)) {
            assert.ok(nombres.includes(origen), `conexión desde un nodo inexistente: ${origen}`);
            for (const destino of salidas.main.flat()) assert.ok(nombres.includes(destino.node), `conexión hacia un nodo inexistente: ${destino.node}`);
        }

        const webhooks = flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook');
        assert.equal(webhooks.length, 1);
        assert.equal(webhooks[0].parameters.httpMethod, 'POST');
        assert.equal(webhooks[0].parameters.responseMode, 'responseNode');
        assert.ok(flujo.nodes.some((n) => n.type === 'n8n-nodes-base.respondToWebhook'), 'ningún nodo responde al webhook');

        // todo nodo (menos el webhook) recibe una conexión: no hay nodos sueltos
        const conectados = new Set(Object.values(flujo.connections).flatMap((s) => s.main.flat().map((d) => d.node)));
        for (const n of flujo.nodes) if (n.type !== 'n8n-nodes-base.webhook') assert.ok(conectados.has(n.name), `nodo sin conexión de entrada: ${n.name}`);
    });
}

test('las rutas de los webhooks no se repiten entre flujos', () => {
    const rutas = Object.values(flujos).map((f) => f.nodes.find((n) => n.type === 'n8n-nodes-base.webhook').parameters.path);
    assert.equal(new Set(rutas).size, rutas.length);
});

test('ningún flujo incluye credenciales ni claves', () => {
    for (const [id, flujo] of Object.entries(flujos)) {
        const texto = JSON.stringify(flujo);
        assert.ok(!/"credentials"/.test(texto), `${id} referencia credenciales`);
        assert.ok(!/(api[_-]?key|secret|token|password)"\s*:/i.test(texto), `${id} parece contener un secreto`);
    }
});

// ---------- clasificar-postulaciones ----------
const clasificar = (d) => ejecutarNodoCode(flujos['clasificar-postulaciones'], 'Calcular puntaje', d);

test('postulaciones: puntaje = años × 10 + habilidades × 5 y su prioridad', () => {
    assert.deepEqual(clasificar({ nombre: 'Ana', vacante: 'Backend', anios_experiencia: 4, habilidades: ['a', 'b', 'c'] }), { valido: true, nombre: 'Ana', vacante: 'Backend', puntaje: 55, prioridad: 'media' });
    assert.equal(clasificar({ nombre: 'Luis', vacante: 'QA', anios_experiencia: 7 }).prioridad, 'alta');
    assert.equal(clasificar({ nombre: 'Eva', vacante: 'QA', anios_experiencia: 1 }).prioridad, 'baja');
});

test('postulaciones: límites de las prioridades (39, 40, 69 y 70) y tope de 100', () => {
    const p = (anios, hab) => clasificar({ nombre: 'X', vacante: 'Y', anios_experiencia: anios, habilidades: Array(hab).fill('h') });
    assert.equal(p(3, 1).prioridad, 'baja');   // 35
    assert.equal(p(4, 0).prioridad, 'media');  // 40
    assert.equal(p(6, 1).prioridad, 'media');  // 65
    assert.equal(p(7, 0).prioridad, 'alta');   // 70
    assert.equal(p(20, 10).puntaje, 100);      // tope
});

test('postulaciones: acepta el cuerpo dentro de "body" (como lo entrega el webhook) y valida campos', () => {
    assert.equal(clasificar({ body: { nombre: 'Ana', vacante: 'Dev', anios_experiencia: 2 } }).puntaje, 20);
    const invalido = clasificar({ vacante: 'Dev' });
    assert.equal(invalido.valido, false);
    assert.match(invalido.error, /nombre y vacante/);
});

// ---------- validar-contacto ----------
const contacto = (d) => ejecutarNodoCode(flujos['validar-contacto'], 'Validar y normalizar', d);

test('contacto: normaliza el nombre y el correo', () => {
    const r = contacto({ nombre: '  maría   josé ', correo: 'MARIA@Correo.com', mensaje: 'Hola, me interesa trabajar con ustedes' });
    assert.equal(r.valido, true);
    assert.equal(r.contacto.nombre, 'María José');
    assert.equal(r.contacto.correo, 'maria@correo.com');
    assert.ok(!Number.isNaN(Date.parse(r.contacto.recibido)));
});

test('contacto: devuelve todos los errores a la vez', () => {
    const r = contacto({ nombre: 'A', correo: 'mal', mensaje: 'corto' });
    assert.equal(r.valido, false);
    assert.equal(r.errores.length, 3);
    assert.deepEqual(contacto({ nombre: 'Ana', correo: 'a@b.co', mensaje: 'x'.repeat(10) }).valido, true);
    assert.equal(contacto({ nombre: 'Ana', correo: 'sin-arroba.com', mensaje: 'x'.repeat(10) }).valido, false);
});

// ---------- resumen-ventas ----------
const resumen = (d) => ejecutarNodoCode(flujos['resumen-ventas'], 'Agrupar por categoría', d);

test('ventas: agrupa por categoría, ordena por total y redondea a 2 decimales', () => {
    const r = resumen({ ventas: [
        { categoria: 'libros', cantidad: 2, precio: 50 },
        { categoria: 'libros', cantidad: 1, precio: 120.5 },
        { categoria: 'cafe', cantidad: 3, precio: 30 }
    ] });
    assert.equal(r.cantidadVentas, 3);
    assert.equal(r.totalGeneral, 310.5);
    assert.equal(r.categoriaTop, 'libros');
    assert.deepEqual(r.categorias, [{ categoria: 'libros', unidades: 3, total: 220.5 }, { categoria: 'cafe', unidades: 3, total: 90 }]);
    assert.equal(resumen({ ventas: [{ categoria: 'x', cantidad: 3, precio: 0.1 }] }).totalGeneral, 0.3);
});

test('ventas: sin ventas o sin categoría no falla', () => {
    const vacio = resumen({ ventas: [] });
    assert.equal(vacio.totalGeneral, 0);
    assert.equal(vacio.categoriaTop, null);
    assert.equal(resumen({}).cantidadVentas, 0);
    assert.equal(resumen({ ventas: [{ cantidad: 1, precio: 5 }] }).categoriaTop, 'sin categoría');
});