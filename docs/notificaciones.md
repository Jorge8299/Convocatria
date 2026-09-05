# Avisos de partidos en el móvil

El entrenador abre Convo con su propia cuenta y pulsa **Activar avisos** en Inicio. En iPhone debe añadir Convo a la pantalla de inicio y abrirla desde ese icono (iOS 16.4 o posterior). En Android necesita un navegador compatible y aceptar el permiso.

Cuando coordinación crea un partido manualmente, el servidor envía un aviso a los dispositivos registrados del entrenador asignado. El nombre del coordinador se obtiene de la sesión autenticada. Tocar el aviso abre el partido en la agenda de esa cuenta.

## Aislamiento

- La API obtiene el propietario de la sesión, nunca de un `accountId` enviado por el móvil.
- Un endpoint de navegador solo puede estar vinculado a una cuenta a la vez.
- Cada suscripción referencia una sesión; al cerrar sesión se elimina por cascada. Solo se envía a entrenadores activos con sesiones vigentes y sin suplantación.
- El navegador conserva una vinculación independiente de la caché de recursos. El service worker comprueba cuenta y generación de vinculación, y vuelve a comprobar la sesión online antes de mostrar detalles.
- Cambiar de usuario borra la vinculación local y las notificaciones visibles, y cancela la suscripción. Hay que activar los avisos de nuevo al volver a entrar.
- Solo se aceptan endpoints HTTPS de proveedores de Web Push conocidos; las suscripciones y claves no se incluyen en logs.

## Configuración

Variables solo de servidor: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (URL pública de contacto o `mailto:`). Generar una pareja con `web-push.generateVAPIDKeys()` y conservarla; rotarla requiere volver a suscribir los móviles. Nunca usar el prefijo `VITE_` para la clave privada.

La tabla aditiva `club_push_subscriptions` se crea al registrar el primer dispositivo o intentar un envío configurado. No cambia partidos ni cuentas existentes. Claves externas hacia cuentas y sesiones con borrado en cascada.

Los endpoints caducados (404/410) se eliminan. Los fallos temporales quedan registrados sin datos privados y no revierten el partido. En esta versión no hay reintento automático ni avisos para importaciones masivas, entrenamientos, ediciones o cancelaciones. La entrega depende del proveedor, la conexión y los ajustes del móvil. TTL: una hora.

## Verificación

`node --import tsx --test tests/push.test.ts`

Prueba SQL real en PostgreSQL en memoria (PGlite): dos entrenadores, varios dispositivos, cuentas inactivas, sesiones caducadas, suplantación, cambio de propietario, cascada al cerrar sesión y bajas del proveedor. Prueba además el service worker: descarta otras cuentas/vinculaciones, comprueba sesión y abre el enlace correcto.

Prueba manual final: activar en dos cuentas de entrenador distintas, cerrar Convo, asignar un partido solo a una de ellas desde coordinación y comprobar que solo sus dispositivos reciben el aviso. Tocar el aviso y verificar el detalle. Cerrar sesión y comprobar que no aparecen detalles de nuevos avisos. No crear partidos ficticios en producción para realizar esta prueba.
