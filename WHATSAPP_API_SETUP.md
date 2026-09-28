# Configuración de WhatsApp Business Cloud API

## 📋 Requisitos previos
- Cuenta de Facebook Business
- Número de teléfono dedicado para WhatsApp Business (no puede ser el mismo que uses personalmente)

## 🚀 Pasos para configurar la API

### 1. Crear una app en Meta for Developers

1. Ve a [Meta for Developers](https://developers.facebook.com/)
2. Haz clic en **"My Apps"** > **"Create App"**
3. Selecciona **"Business"** como tipo de app
4. Rellena los datos:
   - **Display name**: Nombre de tu academia (ej: "Academia ClasesTIC")
   - **Contact email**: Tu email
5. Haz clic en **"Create App"**

### 2. Añadir WhatsApp a tu app

1. En el panel de la app, busca **"WhatsApp"** en los productos disponibles
2. Haz clic en **"Set up"**
3. Selecciona tu **Business Account** (o crea uno nuevo)

### 3. Obtener las credenciales necesarias

Necesitas 3 valores para configurar ClasesTIC:

#### A) Phone Number ID
1. Ve a **WhatsApp** > **Getting Started**
2. En la sección **"Send and receive messages"**, verás:
   ```
   From phone number ID: 123456789012345
   ```
3. **Copia este número** (es el Phone Number ID)

#### B) Access Token (Temporal - solo para pruebas)
1. En la misma página, verás un **"Temporary access token"**
2. Copia este token **SOLO PARA PRUEBAS INICIALES**
3. ⚠️ **IMPORTANTE**: Este token expira en 24 horas

#### C) Access Token (Permanente - para producción)
1. Ve a **Configuración** > **Básico** (Settings > Basic)
2. Busca **"Token de acceso de la app"** (App Token)
3. Si no existe, genera uno nuevo:
   - Ve a **Business Settings** > **System Users**
   - Crea un nuevo System User
   - Genera un token con permisos de WhatsApp Business
   - Guarda este token de forma segura (solo se muestra una vez)

#### D) Business Account ID (opcional pero recomendado)
1. Ve a **Business Settings** > **Business Info**
2. Copia el **Business ID**

### 4. Verificar el número de teléfono

1. En **WhatsApp** > **Getting Started**
2. Sigue el proceso de verificación del número:
   - Introduce tu número de teléfono
   - Recibirás un código por SMS o llamada
   - Introduce el código para verificar

### 5. Añadir números de destino de prueba (Testing)

Para hacer pruebas ANTES de activar el número en producción:

1. Ve a **WhatsApp** > **API Setup**
2. En **"To"**, añade números de teléfono de prueba:
   - Haz clic en **"Add phone number"**
   - Introduce el número (con código de país, ej: +34666777888)
   - Envía el código de verificación
3. Solo estos números podrán recibir mensajes durante las pruebas

### 6. Configurar ClasesTIC

1. Abre tu aplicación ClasesTIC
2. Ve a **⚙️ Ajustes**
3. En la sección **"WhatsApp Business API"**, introduce:
   - **Phone Number ID**: El número de 15 dígitos que copiaste en el paso 3A
   - **Access Token**: El token permanente del paso 3C
   - **Business Account ID**: El ID del paso 3D (opcional)
4. Haz clic en **"Guardar Ajustes"**

### 7. Probar el envío

1. Asegúrate de tener un alumno con:
   - Número de teléfono válido (añadido como número de prueba en el paso 5)
   - Recibos en estado "Pendiente"
2. Ve a **📧 Recibos**
3. Haz clic en **"Enviar por WhatsApp"**
4. Confirma el envío
5. El alumno debería recibir el mensaje con el PDF adjunto automáticamente

## 🔧 Solución de problemas

### Error: "WhatsApp Business API no configurada"
- Verifica que hayas introducido los 3 campos en Ajustes
- Comprueba que no haya espacios al principio o final de los valores

### Error: "Error uploading media"
- El token puede haber expirado (si usas el temporal)
- Genera un token permanente (paso 3C)
- Verifica que el token tenga permisos de WhatsApp Business

### Error: "Error sending message"
- Comprueba que el número de destino esté en formato internacional (ej: 34666777888, sin +)
- Si estás en modo prueba, verifica que el número esté añadido como "número de prueba" (paso 5)
- Revisa que el Phone Number ID sea correcto

### El mensaje se envía pero no llega
- Verifica que el número de teléfono del alumno sea correcto
- En modo prueba, el número DEBE estar verificado como número de prueba
- Comprueba el estado del mensaje en el panel de Meta for Developers > WhatsApp > Insights

### Límites de envío
- **Modo prueba**: 50 mensajes/día, solo a números verificados
- **Modo producción**: Tras la aprobación de Meta, límites mucho mayores
- Si necesitas más volumen, solicita la aprobación del Business Account

## 📚 Documentación oficial

- [WhatsApp Cloud API - Getting Started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Enviar mensajes con documentos](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#document)
- [Límites de envío](https://developers.facebook.com/docs/whatsapp/messaging-limits)

## 🔐 Seguridad

- **NUNCA compartas tu Access Token** públicamente
- No subas el token a GitHub ni repositorios públicos
- Rota el token periódicamente
- Si crees que el token está comprometido, revócalo inmediatamente desde Meta for Developers

## 💡 Consejos

1. **Usa el token temporal solo para pruebas iniciales**
2. **Verifica los números de prueba antes de enviar en producción**
3. **Guarda el Access Token en un lugar seguro** (gestor de contraseñas)
4. **Solicita la aprobación de Meta** cuando estés listo para producción
5. **Monitoriza el uso** en el panel de Meta para evitar límites

---

¿Necesitas ayuda? Revisa la [documentación oficial de WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
