// DOTS · Servidor de subidas (Cloudflare Worker)
// Recibe fotos/videos desde el editor de la tienda y los guarda en GitHub (dotspowerlifting/dots-media).
// Variables secretas a configurar en Cloudflare (Settings → Variables and Secrets):
//   GITHUB_TOKEN  → token de GitHub con permiso de escritura en dots-media
//   CLAVE         → contraseña que se pide al subir desde el editor
const REPO = "dotspowerlifting/dots-media";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PUT, OPTIONS, GET",
  "Access-Control-Allow-Headers": "content-type, x-dots-clave",
};

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";

    if (req.method === "GET") {
      // Verificación de clave (sin subir nada)
      if (url.searchParams.get("check") === "1") {
        const ok = !!env.CLAVE && req.headers.get("x-dots-clave") === env.CLAVE;
        return new Response(ok ? "ok" : "Clave incorrecta", { status: ok ? 200 : 401, headers: CORS });
      }
      return new Response("DOTS subidas OK", { headers: CORS });
    }
    if (req.method !== "PUT") return new Response("Método no permitido", { status: 405, headers: CORS });

    if (!env.CLAVE || !env.GITHUB_TOKEN) return new Response("Falta configurar CLAVE o GITHUB_TOKEN", { status: 500, headers: CORS });
    if (req.headers.get("x-dots-clave") !== env.CLAVE) return new Response("Clave incorrecta", { status: 401, headers: CORS });
    if (!/^web\/[a-z0-9_\-\/]+\.(mp4|jpg|jpeg|png|webp)$/.test(path) || path.includes(".."))
      return new Response("Ruta no permitida", { status: 400, headers: CORS });

    // El navegador ya manda el JSON listo para la API de GitHub ({message, content(base64), sha?}).
    // Lo reenviamos tal cual, sin procesarlo, para no gastar CPU.
    const gh = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      body: await req.arrayBuffer(),
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "dots-subidas",
      },
    });
    const txt = await gh.text();
    let out = txt.slice(0, 300);
    try { const j = JSON.parse(txt); out = gh.ok ? JSON.stringify({ ok: true, commit: j.commit && j.commit.sha }) : (j.message || out); } catch (e) {}
    return new Response(out, { status: gh.status, headers: CORS });
  },
};
