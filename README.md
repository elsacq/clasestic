# Academia TIC - Gestión de Academia

Aplicación web para gestionar una academia: estudiantes, clases, grupos, cursos y recibos.

## 🎯 Objetivo

Gestionar de forma integral una academia de clases particulares, permitiendo el control de alumnos, horarios, grupos, pagos y sincronización automática entre múltiples dispositivos.

## ✨ Funcionalidades

- **Gestión de Estudiantes**: Alta, edición, eliminación y seguimiento de saldos
- **Gestión de Grupos**: Organización de alumnos en grupos para clases colectivas
- **Gestión de Clases**: Clases individuales y grupales con control de horarios y cuotas
- **Gestión de Cursos**: Etiquetado informativo de alumnos por curso
- **Calendario**: Vista mensual con todas las clases programadas
- **Recibos**: Generación automática de recibos en PDF
- **Sincronización GitHub**: Backup automático cifrado (AES-GCM) en repositorio privado
- **Integración Google Calendar**: Sincronización bidireccional de clases con GCal
- **Dashboard**: Resumen de estadísticas y próximas clases
- **Multi-dispositivo**: Los datos se sincronizan automáticamente vía GitHub

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Vanilla)
- **Almacenamiento**: localStorage (local) + GitHub API (remoto cifrado)
- **Cifrado**: Web Crypto API (AES-GCM 256-bit)
- **Integraciones**: 
  - GitHub REST API para sincronización
  - Google Calendar API para eventos
  - jsPDF para generación de recibos
- **Arquitectura**: SPA modular sin frameworks
- **Compatibilidad**: file:// protocol (funciona sin servidor web)

## 🚀 Uso

1. Abre `index.html` en cualquier navegador moderno
2. Configura tus credenciales en Ajustes (rueda dentada):
   - **GitHub Token**: Para sincronización automática
   - **Google Calendar Client ID**: Para integración con GCal
3. ¡Empieza a gestionar tu academia!

## 🔐 Seguridad

- Los datos se cifran con AES-GCM antes de subirse a GitHub
- El token de GitHub y Client ID de Google se almacenan solo localmente
- La clave de cifrado deriva del token de GitHub mediante PBKDF2 (100k iteraciones)
