# BranCode Social Studio (prototipo)

Plataforma para organizar el contenido de varias marcas: calendario, ideas y borradores,
versiones por red, estados, revisión y aprobación. **No publica ni programa nada en las redes**:
la programación se hace desde cada red; aquí se organiza y se marca el avance.

Vive en esta carpeta, con su propio `package.json`, separada de la plantilla de la raíz del repositorio.

## Qué incluye el prototipo

- Marcas (BranCode, Ana Laura Sanchez) con color y redes; cambio de marca sin mezclar datos.
- Cinco redes: Instagram, Facebook, TikTok, LinkedIn y YouTube.
- Calendario **mensual y semanal por horas** (lista por días en teléfono) con filtros de marca, red y estado.
  Desde cualquier día u hora se puede crear una publicación con esa fecha ya puesta.
- Tablero de contenido por estado.
- Editor con una versión por red (Instagram, Facebook, TikTok, LinkedIn): texto, hashtags, fecha y estado propios.
- Flujo: idea → borrador → en revisión → (cambios solicitados) → aprobada → programada → publicada.
  - No se puede aprobar sin pasar por revisión, ni programar sin fecha, ni pedir cambios sin nota.
  - Si cambias el texto de una versión aprobada, vuelve a borrador.
- Historial de cada cambio de estado; botón "Copiar texto y abrir [red]".
- **Tablas personalizadas (estilo Monday/Notion):** crea tablas por marca (o generales) y agrega tus propias columnas.
  - Tipos de columna: texto, número, selección (con colores), selección múltiple, fecha, casilla y enlace.
  - Editas las celdas directamente; puedes renombrar, reordenar y eliminar columnas, ordenar por una columna y buscar.
  - Límites: 100 tablas, 30 columnas por tabla, 1000 filas por tabla.
  - El tipo de una columna no se puede cambiar después (se crea otra columna). Quitar una opción la borra de las filas que la usaban.
- **Papelera:** "Mover a la papelera" es reversible (publicaciones y tablas); se restaura o se elimina para siempre desde Ajustes.
- **Ajustes:** zona horaria (por defecto America/New_York) y primer día de la semana (por defecto domingo).
- Respaldo: `GET /api/v1/export` (JSON), también desde Ajustes.

**Fuera del prototipo:** biblioteca de enlaces, perfil completo de marca (audiencia, tono, pilares, referencias),
buscador de publicaciones, vista de lista, arrastrar para reprogramar, filtros y fórmulas en las tablas,
vincular filas de una tabla con publicaciones, importar/exportar CSV, roles, publicación automática, métricas
(incluidas las "mejores horas", que necesitan conectar las redes).

## Probarlo en tu computadora

```bash
cd social-studio
npm install
cp .dev.vars.example .dev.vars        # modo desarrollo: sin login
npm run db:migrate:local
npm run db:seed:brands:local          # BranCode y Ana Laura Sanchez
npm run db:seed:demo:local            # opcional: publicaciones de ejemplo
npm run dev
npm test                              # reglas del flujo
```

## Publicarlo en Cloudflare (social.brancode.io)

1. `npx wrangler d1 create brancode-social-studio` y pega el `database_id` en `wrangler.jsonc`.
2. `npm run db:migrate:remote` y `npm run db:seed:brands:remote`.
3. `npm run deploy`. (Si la base ya existe, aplica también las migraciones nuevas con `npm run db:migrate:remote`.)
4. En Cloudflare, agrega `social.brancode.io` como dominio personalizado del Worker `brancode-social-studio`.
5. Protege el acceso (Zero Trust → Access → Applications → Self-hosted) para `social.brancode.io`
   con una política que permita solo tu correo.
6. Copia el **Application Audience (AUD) tag** de esa aplicación y tu dominio de equipo
   (`xxxx.cloudflareaccess.com`) a `ACCESS_AUD` y `ACCESS_TEAM_DOMAIN` en `wrangler.jsonc`, y vuelve a desplegar.

Mientras `ACCESS_AUD`/`ACCESS_TEAM_DOMAIN` estén vacíos, la API responde 503: no hay datos
expuestos por error. Desactiva también el dominio `workers.dev` del Worker.

## Pensado para integrarse con BranCode OS (aún no implementado)

- API versionada en `/api/v1`; BranCode OS la consumiría por HTTP, sin tocar la base de datos.
- `brands.external_ref` y `posts.external_ref` reservados para enlazar con registros de BranCode OS.
- Tabla `events`: cada alta y cambio de estado queda registrado, lista para convertirse en webhooks.
- Falta, para esa etapa: tokens de API con permisos limitados (distintos del login humano).

## Notas

- Las fechas de publicación se guardan como hora local sin zona horaria (`2026-11-25T10:00`). La zona horaria de
  Ajustes define qué día es "hoy" y se muestra en el editor; cambiarla no convierte las horas ya guardadas.
- Los enlaces de "Abrir en [red]" apuntan a la página de creación de cada red y están por confirmar
  (`NETWORK_URL` en `src/components/PostEditor.tsx`).
