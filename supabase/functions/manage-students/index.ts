import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function requireAdmin(request: Request, service: ReturnType<typeof createClient>) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sesión requerida. Inicia sesión de nuevo." }, 401);
  }
  const user = await service.auth.getUser(authorization.slice("Bearer ".length));
  if (user.error || !user.data.user) {
    return jsonResponse({ error: "La sesión de Google ha caducado o no es válida. Cierra sesión y vuelve a entrar." }, 401);
  }
  const role = await service.from("portal_admins").select("user_id")
    .eq("user_id", user.data.user.id).maybeSingle();
  if (role.error) {
    return jsonResponse({ error: `No se pudieron comprobar los permisos de administración: ${role.error.message}` }, 500);
  }
  if (!role.data) {
    const email = user.data.user.email ? ` (${user.data.user.email})` : "";
    return jsonResponse({
      error: `La cuenta autenticada${email} no está autorizada en portal_admins. Comprueba que sea la misma cuenta Google que verificaste en Supabase.`,
    }, 403);
  }
  return user.data.user;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método no permitido." }, 405);

  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const admin = await requireAdmin(request, service);
  if (admin instanceof Response) return admin;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "La solicitud no contiene JSON válido." }, 400);
  }
  if (body.action !== "sync" || !Array.isArray(body.students) || !Array.isArray(body.groups)) {
    return jsonResponse({ error: "Acción o datos de sincronización no válidos." }, 400);
  }
  const students = body.students as Array<Record<string, unknown>>;
  const groups = body.groups as Array<Record<string, unknown>>;
  if (students.length > 2000 || groups.length > 500) {
    return jsonResponse({ error: "El lote supera el tamaño permitido." }, 413);
  }

  const results: Array<{ id: string; name: string; status: string; message?: string }> = [];
  const normalizedEmails = new Map<string, string>();
  for (const student of students) {
    const id = typeof student.id === "string" ? student.id : "";
    const name = typeof student.name === "string" ? student.name.trim() : "";
    const email = typeof student.email === "string" ? student.email.trim().toLowerCase() : "";
    if (!id || !name) return jsonResponse({ error: "Hay alumnos sin identificador o nombre." }, 400);
    if (student.active === false || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (normalizedEmails.has(email)) {
      return jsonResponse({ error: `El correo ${email} está duplicado en ${normalizedEmails.get(email)} y ${name}.` }, 400);
    }
    normalizedEmails.set(email, name);
  }
  const studentRows = students.map(student => {
    const id = typeof student.id === "string" ? student.id : "";
    const name = typeof student.name === "string" ? student.name.trim() : "";
    const rawEmail = typeof student.email === "string" ? student.email.trim().toLowerCase() : "";
    if (!id || !name) throw new Error("Hay alumnos sin identificador o nombre.");
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    if (student.active !== false && rawEmail) {
      if (!validEmail) {
        results.push({ id, name, status: "error", message: "El correo no tiene un formato válido." });
      }
    } else if (student.active !== false) {
      results.push({ id, name, status: "error", message: "Añade el correo de Google del alumno en su ficha." });
    }
    return {
      id,
      name,
      google_email: validEmail ? rawEmail : null,
      enabled: student.active !== false,
      updated_at: new Date().toISOString(),
    };
  });
  const groupRows = groups.map(group => ({
    id: typeof group.id === "string" ? group.id : "",
    name: typeof group.name === "string" ? group.name.trim() : "",
    enabled: group.active !== false,
    updated_at: new Date().toISOString(),
  }));
  if (groupRows.some(group => !group.id || !group.name)) {
    return jsonResponse({ error: "Hay grupos sin identificador o nombre." }, 400);
  }

  try {
    if (groupRows.length) {
      const upsertGroups = await service.from("portal_groups").upsert(groupRows, { onConflict: "id" });
      if (upsertGroups.error) return jsonResponse({ error: upsertGroups.error.message }, 500);
    }
    if (studentRows.length) {
      const upsertStudents = await service.from("portal_students").upsert(studentRows, { onConflict: "id" });
      if (upsertStudents.error) return jsonResponse({ error: upsertStudents.error.message }, 500);
    }
    const clearMemberships = await service.from("portal_student_groups").delete().neq("student_id", "");
    if (clearMemberships.error) return jsonResponse({ error: clearMemberships.error.message }, 500);
    const memberships = groups.flatMap(group => {
      const groupId = String(group.id);
      const studentIds = Array.isArray(group.studentIds) ? group.studentIds : [];
      return studentIds.filter((id): id is string => typeof id === "string" && students.some(student => student.id === id))
        .map(studentId => ({ group_id: groupId, student_id: studentId }));
    });
    if (memberships.length) {
      const insertMemberships = await service.from("portal_student_groups").insert(memberships);
      if (insertMemberships.error) return jsonResponse({ error: insertMemberships.error.message }, 500);
    }

    const currentGroups = await service.from("portal_groups").select("id");
    if (currentGroups.error) return jsonResponse({ error: currentGroups.error.message }, 500);
    const incomingGroupIds = new Set(groupRows.map(group => group.id));
    const staleGroupIds = (currentGroups.data || []).map(group => group.id).filter(id => !incomingGroupIds.has(id));
    if (staleGroupIds.length) {
      const disableMissingGroups = await service.from("portal_groups")
        .update({ enabled: false, updated_at: new Date().toISOString() }).in("id", staleGroupIds);
      if (disableMissingGroups.error) return jsonResponse({ error: disableMissingGroups.error.message }, 500);
    }

    const currentStudents = await service.from("portal_students").select("id");
    if (currentStudents.error) return jsonResponse({ error: currentStudents.error.message }, 500);
    const incomingStudentIds = new Set(studentRows.map(student => student.id));
    const staleStudentIds = (currentStudents.data || []).map(student => student.id).filter(id => !incomingStudentIds.has(id));
    if (staleStudentIds.length) {
      const disableMissingStudents = await service.from("portal_students")
        .update({ enabled: false, updated_at: new Date().toISOString() }).in("id", staleStudentIds);
      if (disableMissingStudents.error) return jsonResponse({ error: disableMissingStudents.error.message }, 500);
    }

    for (const student of studentRows) {
      const result = results.find(item => item.id === student.id);
      const profile = await service.from("portal_profiles").select("user_id")
        .eq("student_id", student.id).maybeSingle();
      if (profile.error) {
        results.push({ id: student.id, name: student.name, status: "error", message: profile.error.message });
        continue;
      }
      if (profile.data) {
        const authUser = await service.auth.admin.getUserById(profile.data.user_id);
        if (authUser.error) {
          results.push({ id: student.id, name: student.name, status: "error", message: authUser.error.message });
          continue;
        }
        if (authUser.data.user.email?.toLowerCase() !== student.google_email) {
          const unlink = await service.from("portal_profiles").delete().eq("student_id", student.id);
          if (unlink.error) {
            results.push({ id: student.id, name: student.name, status: "error", message: unlink.error.message });
            continue;
          }
        }
      }
      if (result?.status === "error") continue;
      results.push({ id: student.id, name: student.name, status: "synced" });
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Error al sincronizar." }, 400);
  }

  return jsonResponse({ ok: true, results });
});
