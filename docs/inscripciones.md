# Inscripciones y cuotas

El administrador configura temporadas en Gestión económica. Cada temporada guarda una cuota final para la familia, plazos, años de nacimiento por categoría y condiciones. Las reglas sugeridas son editables: el club debe revisarlas para su temporada. El coordinador solo recibe las fichas deportivas de inscripciones confirmadas y puede asignarlas a entrenadores activos de la misma categoría y club.

## Estados y almacenamiento

- `enrollment_campaigns`: borradores o inscripciones abiertas; datos de temporada y condiciones.
- `enrollments`: solicitud pendiente de pago, confirmación al primer pago y equipo asignado. Guarda las condiciones aceptadas y la fecha de aceptación. No crea cuentas familiares.
- `enrollment_dues`: importes y vencimientos inmutables de la solicitud, enlaces aleatorios de 256 bits, sesión de Checkout, cobro y recibo.
- `enrollment_mail`: registro de envíos solicitados por administración. «Enviado» significa aceptado por el proveedor, no garantiza entrega en la bandeja del destinatario.

La ficha llega a la plantilla existente mediante una actualización atómica que conserva sus jugadores y datos. No se copian datos de contacto del representante a la plantilla del entrenador. Las tablas se crean de forma aditiva; el borrado definitivo del club elimina también sus inscripciones por claves foráneas en cascada.

## Activación pendiente de proveedores

Actualmente el proyecto no tiene cuentas de pago ni correo facilitadas. El panel permite preparar temporadas, pero bloquea la apertura y la recepción de inscripciones hasta que estén configuradas ambas conexiones. La presencia de variables indica configuración, no sustituye una prueba real en modo test.

1. Crear Stripe para la plataforma y conectar una cuenta receptora de cada club mediante Stripe Connect. La integración utiliza cargos directos (`Stripe-Account`). Verificar que la cuenta permite cobros y qué entidad responde por estos.
2. Configurar en Vercel `STRIPE_SECRET_KEY` y `STRIPE_CLUB_ACCOUNTS` como JSON `{ "club-id": "acct_..." }`. Nunca introducir claves en el frontend o el repositorio.
3. Registrar el webhook de eventos de cuentas conectadas en `https://convo-preb.vercel.app/api/clubs?section=payment-webhook`; escuchar `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Guardar `STRIPE_WEBHOOK_SECRET`.
4. Crear Resend, verificar el dominio remitente y configurar `RESEND_API_KEY` y `ENROLLMENT_FROM_EMAIL`. Configurar `APP_ORIGIN` con el origen HTTPS público, sin barra final.
5. Realizar un circuito de prueba con datos ficticios y Stripe test: formulario, pago, webhook duplicado, confirmación, recibo, asignación y siguiente plazo. Comprobar destinatario y recepción real del correo antes de activar claves live.

La cuota configurada es el importe final cobrado. Esta primera integración no aplica automáticamente comisiones de Convo ni IVA del simulador anterior: la configuración comercial y fiscal debe acordarse antes de activar cobros. No hay cargos recurrentes; cada plazo necesita un pago voluntario mediante enlace. No se han implementado devoluciones, facturación fiscal, conciliación de disputas ni seguimiento de rebotes del correo. El recibo enviado es un justificante de pago, no una factura fiscal.

## Enlaces y comprobaciones

- Formulario: `/inscripcion/<slug-del-club>`.
- Pago: `/pago#<token>`; el token viaja en el fragmento, no en la URL solicitada al servidor ni en el encabezado Referer. Se manda al API en el cuerpo de una petición POST.
- La confirmación usa firma Stripe sobre el cuerpo original, tolerancia de cinco minutos y coincidencia de sesión, cuenta receptora, moneda e importe almacenado.
- Reabrir el enlace comprueba y reutiliza la sesión vigente. Un pago ya confirmado no genera un nuevo cobro.
- Los envíos se revisan antes de confirmar. Los enlaces pagados se excluyen en el servidor. Los fallos se muestran en Cobros y pueden reintentarse; los recibos fallidos también provocan el reintento del webhook de Stripe.
- Antes de abrir inscripciones, el club debe completar y revisar el texto de condiciones y privacidad que leerá el representante.

Pruebas: `node --import tsx --test tests/enrollment.test.ts`, `npm.cmd run lint`, `npm.cmd run build`. Las pruebas de base de datos se realizan en PGlite local sin utilizar datos reales.

Referencias de integración: [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions), [firmas de webhooks](https://docs.stripe.com/webhooks/signatures), [idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
