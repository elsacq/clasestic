import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Inicia sesión con Google." }, 401);

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const verified = await service.auth.getUser(authorization.slice("Bearer ".length));
  if (verified.error || !verified.data.user) return jsonResponse({ error: "La sesión de Google no es válida." }, 401);

  const user = verified.data.user;
  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : [];
  if (!user.email || !providers.includes("google")) {
    return jsonResponse({ error: "El acceso al portal debe realizarse con una cuenta de Google." }, 403);
  }
  const email = user.email.trim().toLowerCase();
  const existingProfile = await service.from("portal_profiles")
    .select("student_id").eq("user_id", user.id).maybeSingle();
  if (existingProfile.error) return jsonResponse({ error: existingProfile.error.message }, 500);
  if (existingProfile.data) {
    const student = await service.from("portal_students").select("name,enabled")
      .eq("id", existingProfile.data.student_id).maybeSingle();
    if (student.error) return jsonResponse({ error: student.error.message }, 500);
    if (!student.data?.enabled) return jsonResponse({ error: "La cuenta de alumno está desactivada." }, 403);
    return jsonResponse({ ok: true, name: student.data.name, student_id: existingProfile.data.student_id });
  }

  const match = await service.from("portal_students").select("id,name,enabled")
    .eq("google_email", email).maybeSingle();
  if (match.error) return jsonResponse({ error: match.error.message }, 500);
  if (!match.data) {
    return jsonResponse({ error: "Este correo de Google no está asociado a un alumno. Contacta con la academia." }, 403);
  }
  if (!match.data.enabled) return jsonResponse({ error: "La cuenta de alumno está desactivada." }, 403);

  const linkedToAnotherUser = await service.from("portal_profiles")
    .select("user_id").eq("student_id", match.data.id).maybeSingle();
  if (linkedToAnotherUser.error) return jsonResponse({ error: linkedToAnotherUser.error.message }, 500);
  if (linkedToAnotherUser.data && linkedToAnotherUser.data.user_id !== user.id) {
    return jsonResponse({ error: "Este alumno ya está asociado a otra cuenta de Google. Contacta con la academia." }, 409);
  }

  const profile = await service.from("portal_profiles").insert({
    user_id: user.id,
    student_id: match.data.id,
  });
  if (profile.error) return jsonResponse({ error: profile.error.message }, 500);
  return jsonResponse({ ok: true, name: match.data.name, student_id: match.data.id });
});
