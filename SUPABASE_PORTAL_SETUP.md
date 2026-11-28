# Configuración del portal de vídeos y ejercicios

El portal separa la aplicación privada de gestión (datos locales y copia cifrada en Gist) del contenido para alumnos. Supabase guarda los vídeos, los Excel, las entregas, las correcciones y el registro de accesos. GitHub Pages publica las dos páginas estáticas.

## 1. Crear y configurar Supabase

1. Crea un proyecto Supabase. El plan Free cuesta $0, incluye 1 GB de archivos y puede pausar proyectos tras una semana de inactividad. Comprueba los límites y precios actuales en [Supabase Pricing](https://supabase.com/pricing).
2. En **Project Settings → API**, copia el **Project URL** y la **publishable/anon key**. Añádelos a `portal/config.js`:

   ```js
   window.PORTAL_CONFIG = {
     supabaseUrl: 'https://TU-PROJECT-REF.supabase.co',
     supabaseAnonKey: 'TU-PUBLISHABLE-KEY',
   };
   ```

   Esta clave es pública y está limitada por las políticas RLS de la base de datos. **No pongas la `service_role` key en `config.js`, HTML, JavaScript del navegador ni en GitHub.**
3. En **SQL Editor**, ejecuta el contenido de `supabase/migrations/202611250001_portal.sql`.
4. Después, ejecuta `supabase/migrations/202611260001_video_multiple_groups.sql`. Crea la relación de vídeos con varios grupos y conserva las asignaciones existentes. Si el portal ya estaba instalado, no vuelvas a ejecutar la migración inicial.
5. En **Authentication → Sign In / Providers**, habilita Google. Configura el OAuth Client ID y Client Secret en el panel de Supabase; no los incluyas en el repositorio. En Google Cloud, configura como callback URL la dirección que muestra Supabase en la configuración del proveedor.
6. En **Authentication → URL Configuration**, configura:
   - Site URL: `https://elsacq.github.io/clasestic/`
   - Redirect URLs: `https://elsacq.github.io/clasestic/` y `https://elsacq.github.io/clasestic/portal/`
7. Despliega las Edge Functions desde una terminal con Supabase CLI:

   ```text
   supabase login
   supabase link --project-ref TU-PROJECT-REF
   supabase functions deploy manage-students
   supabase functions deploy link-student
   supabase functions deploy record-access
   supabase functions deploy notify-submission
   ```

   Las funciones usan las variables de entorno que Supabase proporciona a Edge Functions, incluida `SUPABASE_SERVICE_ROLE_KEY`. Esa clave solo se usa en servidor.
   Si ya tenías desplegada `record-access`, vuelve a desplegarla después de aplicar la migración para que compruebe el acceso a través de todos los grupos del vídeo.
8. Para los avisos de entregas, crea una cuenta gratuita en Resend, verifica tu correo y crea una API key. En Supabase configura estos secretos (sustituye los valores de ejemplo):

   ```text
   supabase secrets set RESEND_API_KEY=re_TU_API_KEY NOTIFICATION_EMAIL=tu-correo@ejemplo.com
   supabase functions deploy notify-submission
   ```

   `NOTIFICATION_EMAIL` recibe un aviso cada vez que un alumno entrega un Excel y debe ser el correo verificado de tu cuenta de Resend si usas el remitente de prueba predeterminado (`Academia TIC <onboarding@resend.dev>`). No hace falta tener dominio propio para enviar avisos solo a ese correo. Para enviar a otros destinatarios, verifica un dominio en Resend y configura además `RESEND_FROM_EMAIL`, por ejemplo `Academia TIC <avisos@tu-dominio-verificado.es>`. El plan gratuito incluye 3.000 emails al mes y un máximo de 100 al día; consulta [sus límites actuales](https://resend.com/pricing). No guardes la API key en el repositorio ni en archivos del portal.
9. Tras desplegar la función y publicar la aplicación de gestión, inicia sesión como administradora, abre **Vídeos → Ejercicios entregados** y pulsa **Enviar email de prueba**. Esto verifica el envío sin crear una entrega ficticia.

## 2. Publicar en GitHub Pages

1. Confirma los cambios en la rama `main`. El workflow `.github/workflows/pages.yml` publicará la raíz del repositorio y `/portal/`.
2. En GitHub, abre **Settings → Pages** y elige **GitHub Actions** como fuente de publicación.
3. Cuando termine la primera ejecución, la aplicación de gestión estará en `https://elsacq.github.io/clasestic/` y el portal de alumnos en `https://elsacq.github.io/clasestic/portal/`.
4. Abre la aplicación de gestión desde su URL HTTPS para usar Google OAuth. El acceso desde `file://` no sirve como URL de retorno OAuth.

## 3. Autorizar a la administradora

1. Abre la pestaña **Vídeos** en la aplicación publicada e inicia sesión con la cuenta Google que será administradora. El primer inicio crea el usuario en Supabase, pero aún no concede permisos.
2. En **Supabase → Authentication → Users**, copia el UUID de esa cuenta.
3. En SQL Editor ejecuta, sustituyendo el UUID:

   ```sql
   insert into public.portal_admins (user_id)
   values ('UUID-DE-LA-ADMINISTRADORA');
   ```

4. Vuelve a iniciar sesión con esa cuenta Google. Solo los UUID incluidos en `portal_admins` pueden administrar el catálogo, calificar entregas o consultar la actividad.

## 4. Vincular alumnos y usar el portal

1. En la aplicación de gestión, edita cada alumno e introduce en **Correo de Google para el portal de vídeos** el correo exacto de la cuenta Google que usará. El teléfono sigue siendo un dato de contacto y no se utiliza para iniciar sesión.
2. Asigna los alumnos a sus grupos habituales y pulsa **Sincronizar correos y grupos** en la pestaña **Vídeos**. La sincronización actualiza el catálogo de grupos y desactiva accesos de alumnos/grupos eliminados o inactivos.
3. Añade vídeos seleccionando uno o varios grupos, fecha, título, enlace HTTPS, contraseña opcional, Excel opcional y visibilidad.
4. Envía a los alumnos `https://elsacq.github.io/clasestic/portal/`. Inician sesión con Google; el correo debe coincidir con el de su ficha. Solo reciben vídeos de sus grupos activos.
5. Los alumnos pueden abrir vídeos, descargar los Excel y entregar ejercicios `.xls`/`.xlsx` (máximo 25 MB). Cada entrega envía un aviso por email a `NOTIFICATION_EMAIL`. Desde **Vídeos → Ejercicios entregados**, descarga sus archivos y guarda una nota de 0 a 10 y comentarios. Los alumnos ven esas correcciones en el portal.
6. **Actividad de alumnos** muestra hasta los últimos 100 eventos: clic en el botón de vídeo y descargas de Excel o entregas. El clic confirma que pulsaron el enlace, no que hayan visto el vídeo completo.
7. Para probar el portal sin iniciar sesión como alumno, abre **Vídeos → Vista previa del portal de alumnos**, elige un grupo y pulsa **Ver portal como alumno**. Requiere que la sesión de administración esté iniciada en la aplicación de gestión; la vista previa no permite enviar entregas ni ver las entregas de alumnos.

Las contraseñas de los vídeos solo se entregan a usuarios autenticados del grupo correspondiente. Las contraseñas de las cuentas Google las gestiona cada alumno con Google; la academia no puede restablecerlas. Si cambia un correo Google, actualízalo en la ficha y vuelve a sincronizar.

## Límites y privacidad

- Los Excel se guardan en un bucket privado de Supabase Storage. Las descargas usan enlaces temporales; no se publica el bucket.
- Las tablas aplican Row Level Security. El frontend solo lleva la clave pública de Supabase; los permisos de administración se comprueban en servidor y en la base de datos.
- El plan gratuito tiene límites de almacenamiento, transferencia y disponibilidad. Vigila el consumo, sobre todo al subir entregas, y revisa el plan/precios vigentes antes de usarlo con archivos grandes o necesitar disponibilidad continua.
