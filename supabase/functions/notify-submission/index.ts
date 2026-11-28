import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

async function sendEmail(
  apiKey: string,
  sender: string,
  recipient: string,
  subject: string,
  text: string,
  html: string,
  idempotencyKey: string,
): Promise<Response> {
  const email = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: sender, to: [recipient], subject, text, html }),
  });
  if (!email.ok) {
    const details = await email.text();
    console.error("Resend no pudo enviar el correo:", email.status, details);
    return jsonResponse({ error: `Resend no pudo enviar el correo (HTTP ${email.status}).` }, 502);
  }
  return jsonResponse({ ok: true });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Sesión requerida." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "La solicitud no contiene JSON válido." }, 400);
  }
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const verified = await service.auth.getUser(authorization.slice("Bearer ".length));
  if (verified.error || !verified.data.user) return jsonResponse({ error: "La sesión no es válida." }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const recipient = Deno.env.get("NOTIFICATION_EMAIL");
  const sender = Deno.env.get("RESEND_FROM_EMAIL") || "Academia TIC <onboarding@resend.dev>";
  if (!apiKey || !recipient) {
    return jsonResponse({ error: "Falta configurar RESEND_API_KEY o NOTIFICATION_EMAIL en Supabase." }, 500);
  }

  if (body.action === "test") {
    const admin = await service.from("portal_admins").select("user_id")
      .eq("user_id", verified.data.user.id).maybeSingle();
    if (admin.error) return jsonResponse({ error: admin.error.message }, 500);
    if (!admin.data) return jsonResponse({ error: "Se requieren permisos de administración." }, 403);
    return sendEmail(
      apiKey,
      sender,
      recipient,
      "Prueba de avisos de entregas · Academia TIC",
      "El envío de avisos por email de Academia TIC está configurado correctamente.",
      "<h2>Prueba de avisos de entregas</h2><p>El envío de avisos por email de Academia TIC está configurado correctamente.</p>",
      `test-email/${crypto.randomUUID()}`,
    );
  }

  if (body.action !== "submission" || typeof body.submission_id !== "string" || !body.submission_id) {
    return jsonResponse({ error: "Acción o identificador de entrega no válidos." }, 400);
  }

  const profile = await service.from("portal_profiles")
    .select("student_id").eq("user_id", verified.data.user.id).maybeSingle();
  if (profile.error) return jsonResponse({ error: profile.error.message }, 500);
  if (!profile.data) return jsonResponse({ error: "La cuenta no está vinculada a un alumno." }, 403);

  const submissionResult = await service.from("student_submissions")
    .select("id,video_id,student_id,file_name,uploaded_at")
    .eq("id", body.submission_id)
    .eq("student_id", profile.data.student_id)
    .maybeSingle();
  if (submissionResult.error) return jsonResponse({ error: submissionResult.error.message }, 500);
  if (!submissionResult.data) return jsonResponse({ error: "No se encontró la entrega del alumno autenticado." }, 404);
  const submission = submissionResult.data;

  const [studentResult, videoResult, membershipsResult, videoGroupsResult, activeGroupsResult] = await Promise.all([
    service.from("portal_students").select("name,enabled").eq("id", submission.student_id).maybeSingle(),
    service.from("portal_videos").select("title,visible").eq("id", submission.video_id).maybeSingle(),
    service.from("portal_student_groups").select("group_id").eq("student_id", submission.student_id),
    service.from("portal_video_groups").select("group_id").eq("video_id", submission.video_id),
    service.from("portal_groups").select("id").eq("enabled", true),
  ]);
  const lookupError = studentResult.error || videoResult.error || membershipsResult.error
    || videoGroupsResult.error || activeGroupsResult.error;
  if (lookupError) return jsonResponse({ error: lookupError.message }, 500);
  if (!studentResult.data?.enabled || !videoResult.data?.visible) {
    return jsonResponse({ error: "El alumno o el vídeo ya no están activos." }, 403);
  }

  const studentGroupIds = new Set((membershipsResult.data || []).map(group => group.group_id));
  const activeGroupIds = new Set((activeGroupsResult.data || []).map(group => group.id));
  const canAccessVideo = (videoGroupsResult.data || []).some(group =>
    studentGroupIds.has(group.group_id) && activeGroupIds.has(group.group_id)
  );
  if (!canAccessVideo) return jsonResponse({ error: "El alumno ya no pertenece a un grupo activo de este vídeo." }, 403);

  const studentName = studentResult.data.name;
  const videoTitle = videoResult.data.title;
  const fileName = submission.file_name;
  const uploadedAt = new Date(submission.uploaded_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" });
  return sendEmail(
    apiKey,
    sender,
    recipient,
    `Nueva entrega para corregir: ${studentName} · ${videoTitle}`,
    [
      `El alumno ${studentName} ha enviado un ejercicio para corregir.`,
      `Clase: ${videoTitle}`,
      `Archivo: ${fileName}`,
      `Fecha: ${uploadedAt}`,
      "",
      "Entra en la aplicación de gestión → Vídeos → Ejercicios entregados para descargarlo y corregirlo.",
    ].join("\n"),
    `<h2>Nueva entrega para corregir</h2>
        <p><strong>Alumno:</strong> ${escapeHtml(studentName)}</p>
        <p><strong>Clase:</strong> ${escapeHtml(videoTitle)}</p>
        <p><strong>Archivo:</strong> ${escapeHtml(fileName)}</p>
        <p><strong>Fecha:</strong> ${escapeHtml(uploadedAt)}</p>
        <p>Entra en la aplicación de gestión → Vídeos → Ejercicios entregados para descargarlo y corregirlo.</p>`,
    `exercise-submission/${submission.id}`,
  );
});
