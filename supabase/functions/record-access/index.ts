import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (request: Request) => {
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
  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const verified = await authClient.auth.getUser(token);
  if (verified.error || !verified.data.user) return jsonResponse({ error: "La sesión no es válida." }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const profile = await service.from("portal_profiles")
    .select("student_id").eq("user_id", verified.data.user.id).maybeSingle();
  if (profile.error) return jsonResponse({ error: profile.error.message }, 500);
  if (!profile.data) return jsonResponse({ error: "La cuenta de Google todavía no está vinculada a un alumno." }, 403);
  const student = await service.from("portal_students").select("enabled")
    .eq("id", profile.data.student_id).maybeSingle();
  if (student.error) return jsonResponse({ error: student.error.message }, 500);
  if (!student.data?.enabled) return jsonResponse({ error: "La cuenta está desactivada." }, 403);

  if (body.action === "passwords") {
    const [studentGroups, enabledGroups] = await Promise.all([
      service.from("portal_student_groups").select("group_id").eq("student_id", profile.data.student_id),
      service.from("portal_groups").select("id").eq("enabled", true),
    ]);
    const membershipError = studentGroups.error || enabledGroups.error;
    if (membershipError) return jsonResponse({ error: membershipError.message }, 500);
    const studentGroupIds = new Set((studentGroups.data || []).map(group => group.group_id));
    const activeGroupIds = (enabledGroups.data || [])
      .map(group => group.id)
      .filter(groupId => studentGroupIds.has(groupId));
    if (!activeGroupIds.length) return jsonResponse({ passwords: [] });

    const videoGroups = await service.from("portal_video_groups")
      .select("video_id").in("group_id", activeGroupIds);
    if (videoGroups.error) return jsonResponse({ error: videoGroups.error.message }, 500);
    const assignedVideoIds = [...new Set((videoGroups.data || []).map(group => group.video_id))];
    if (!assignedVideoIds.length) return jsonResponse({ passwords: [] });

    const visibleVideos = await service.from("portal_videos")
      .select("id").in("id", assignedVideoIds).eq("visible", true);
    if (visibleVideos.error) return jsonResponse({ error: visibleVideos.error.message }, 500);
    const visibleVideoIds = (visibleVideos.data || []).map(video => video.id);
    if (!visibleVideoIds.length) return jsonResponse({ passwords: [] });

    const secrets = await service.from("portal_video_secrets")
      .select("video_id,video_password").in("video_id", visibleVideoIds);
    if (secrets.error) return jsonResponse({ error: secrets.error.message }, 500);
    return jsonResponse({ passwords: secrets.data || [] });
  }

  const action = body.action;
  let videoId = typeof body.video_id === "string" ? body.video_id : "";
  let eventType: string;
  let filePath = "";
  let fileName = "";
  if (action === "submission") {
    const submissionId = typeof body.submission_id === "string" ? body.submission_id : "";
    const submission = await service.from("student_submissions")
      .select("id,video_id,file_path,file_name")
      .eq("id", submissionId).eq("student_id", profile.data.student_id).maybeSingle();
    if (submission.error) return jsonResponse({ error: submission.error.message }, 500);
    if (!submission.data) return jsonResponse({ error: "No se encontró el ejercicio entregado." }, 404);
    videoId = submission.data.video_id;
    filePath = submission.data.file_path;
    fileName = submission.data.file_name;
    eventType = "submission_downloaded";
  } else if (action === "video" || action === "exercise" || action === "password") {
    eventType = action === "exercise" ? "exercise_downloaded" : "video_clicked";
  } else {
    return jsonResponse({ error: "Acción de acceso no válida." }, 400);
  }
  if (!videoId) return jsonResponse({ error: "Falta el vídeo solicitado." }, 400);

  const videoResult = await service.from("portal_videos").select(
    "id,group_id,has_exercise,exercise_filename,visible",
  ).eq("id", videoId).maybeSingle();
  if (videoResult.error) return jsonResponse({ error: videoResult.error.message }, 500);
  const video = videoResult.data;
  if (!video || !video.visible) return jsonResponse({ error: "El vídeo no está disponible." }, 404);
  const [videoGroups, studentGroups, enabledGroups] = await Promise.all([
    service.from("portal_video_groups").select("group_id").eq("video_id", videoId),
    service.from("portal_student_groups").select("group_id").eq("student_id", profile.data.student_id),
    service.from("portal_groups").select("id").eq("enabled", true),
  ]);
  const groupError = videoGroups.error || studentGroups.error || enabledGroups.error;
  if (groupError) return jsonResponse({ error: groupError.message }, 500);
  const studentGroupIds = new Set((studentGroups.data || []).map(group => group.group_id));
  const enabledGroupIds = new Set((enabledGroups.data || []).map(group => group.id));
  const hasAccess = (videoGroups.data || []).some(group =>
    studentGroupIds.has(group.group_id) && enabledGroupIds.has(group.group_id)
  );
  if (!hasAccess) return jsonResponse({ error: "No tienes acceso a los grupos asignados a este vídeo." }, 403);

  const secretResult = await service.from("portal_video_secrets")
    .select("video_url,video_password,exercise_path").eq("video_id", videoId).maybeSingle();
  if (secretResult.error) return jsonResponse({ error: secretResult.error.message }, 500);
  if (!secretResult.data) return jsonResponse({ error: "Los datos del vídeo no están disponibles." }, 404);
  const secret = secretResult.data;
  if (action === "password") return jsonResponse({ password: secret.video_password });
  if (action === "exercise") {
    if (!video.has_exercise || !secret.exercise_path) {
      return jsonResponse({ error: "Este vídeo no tiene un Excel adjunto." }, 404);
    }
    filePath = secret.exercise_path;
    fileName = video.exercise_filename || "ejercicios.xlsx";
  }

  const log = await service.from("portal_access_logs").insert({
    user_id: verified.data.user.id,
    student_id: profile.data.student_id,
    video_id: videoId,
    event_type: eventType,
  });
  if (log.error) return jsonResponse({ error: `No se pudo registrar el acceso: ${log.error.message}` }, 500);

  if (action === "video") {
    return jsonResponse({ url: secret.video_url, password: secret.video_password });
  }
  const signedUrl = await service.storage.from("portal-files")
    .createSignedUrl(filePath, 300, { download: fileName });
  if (signedUrl.error) return jsonResponse({ error: signedUrl.error.message }, 500);
  return jsonResponse({ url: signedUrl.data.signedUrl, file_name: fileName });
});
