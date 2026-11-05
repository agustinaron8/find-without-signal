# Progreso

**Estado: MVP completo en el repo. Falta publicarlo en Vercel y probarlo en teléfonos reales antes del lunes 9/11.**

## Bloqueado (necesita a Agustín)
1. **Conectar Vercel** (2 min): https://vercel.com/new/import?s=https://github.com/agustinaron8/find-without-signal
2. **Probar en un iPhone y un Android reales**, idealmente antes del domingo 8/11, con el checklist de abajo. Es el mayor riesgo que queda.

## Hecho
Todas las tareas del plan (1 a 15), más "Hacerme ver" (pantalla que parpadea para que te encuentren).

Probado en Chromium, con GPS y brújula simulados:
- Modo avión real (servidor apagado y DNS bloqueado): abren todas las rutas y el mapa bajado se ve con calles y nombres.
- Sin mapa bajado: el radar funciona igual y el mapa explica qué falta.
- QR de un teléfono a otro, sin red, con video simulado en la cámara.
- Flecha, distancia, llegada, SMS, pegar ubicación, guardar lugar y volver por donde vine.
- 60 tests unitarios.

También probado en WebKit (motor de Safari, emulando iPhone 13): crear grupo, bajar mapa, QR en pantalla, radar, flecha, SMS, y abrir la app con el servidor apagado.

## No probado todavía
- Que los datos sobrevivan a cerrar la app en iPhone: el WebKit de esta PC no guarda el caché en disco, así que esa parte solo se puede ver en un iPhone real. En Chromium sí se probó.
- Escanear QR con la cámara en iPhone.
- Duración real de más de 24 h: el código no tiene vencimientos, pero nadie esperó ese tiempo. Por eso conviene instalar ya y volver a abrir la app el domingo en modo avión.
- Sensores reales: brújula, GPS en la calle, vibración y pantalla siempre prendida.
- Envío real de SMS: solo se verificó el link que abre la app de mensajes.
- Una red saturada de verdad.

## Afuera a propósito
- Última ubicación conocida online (requiere backend, y sirve poco con la red saturada).
- Búsqueda de direcciones (opcional en el spec; se marcan tocando el mapa o pegando un link).
- Compartir el grupo por SMS y exportar el recorrido a GPX.

## Checklist manual
- [ ] iPhone: abrir en Safari → Agregar a inicio → abrir desde inicio → crear grupo → bajar mapa → **modo avión** → cerrar la app por completo → reabrir → el mapa se ve, la flecha apunta y la distancia cambia al caminar.
- [ ] Android (Chrome): lo mismo, con el botón Instalar.
- [ ] Compartir por QR de iPhone a Android y viceversa, los dos sin red.
- [ ] SMS: enviar desde A, pegar en B y navegar hacia ese punto.
- [ ] La pantalla no se apaga en el Modo Encuentro.
- [ ] Brújula: comparar contra la brújula nativa del teléfono (±15°).
- [ ] Instalar ya, cerrar todo, y el domingo abrir en modo avión: grupo, mapa y flecha siguen ahí.
- [ ] Antes del evento: abrir el grupo y confirmar que el checklist "Listo para usar sin señal" está completo, en cada teléfono.
