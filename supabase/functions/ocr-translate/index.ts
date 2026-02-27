// supabase/functions/ocr-translate/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

type ReqBody = {
  imageDataUrl: string; // "data:image/png;base64,...."
  targetLanguages?: string[]; // optional override, default ["english"]
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  if (!dataUrl.startsWith("data:")) {
    throw new Error("imageDataUrl must be a valid data URL (data:image/...;base64,...)");
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL format (expected base64 data URL).");

  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const authHeader = req.headers.get("Authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
  
  // Parse body ONCE — used by both debug mode and the normal pipeline.
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  // POST debug mode: { debug: true }
  if (body?.debug === true) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("authorization") ?? "";
    const hasAuth = authHeader.toLowerCase().startsWith("bearer ");

    const debugClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data, error } = await debugClient.auth.getUser();

    return json({
      ok: !error,
      hasAuth,
      authHeaderPrefix: hasAuth ? authHeader.slice(0, 16) + "…" : null,
      userId: data?.user?.id ?? null,
      authError: error?.message ?? null,
    });
  }

  // Normal pipeline — uses the already-parsed body (no second req.json() call).
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
    const APIFY_ACTOR_ID = Deno.env.get("APIFY_ACTOR_ID");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    if (!APIFY_TOKEN || !APIFY_ACTOR_ID) {
      return json({ error: "Missing APIFY_TOKEN or APIFY_ACTOR_ID" }, 500);
    }

    const typed = body as ReqBody;
    if (!typed?.imageDataUrl) return json({ error: "Missing imageDataUrl" }, 400);

    const targetLanguages = typed.targetLanguages?.length
      ? typed.targetLanguages
      : ["english"];

    // 1) Decode imageDataUrl
    const { mime, bytes } = parseDataUrl(typed.imageDataUrl);
    const ext = extFromMime(mime);

    // 2) Upload to Supabase Storage (temporary)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // You must create this bucket in Supabase Storage:
    // Bucket name: "ocr-temp"
    const bucket = "ocr-temp";
    const objectPath = `apify/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(objectPath, bytes, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      return json({ error: "Storage upload failed", details: uploadError.message }, 500);
    }

    // 3) Create a signed URL (Apify needs a URL, not base64)
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60 * 10); // 10 minutes

    if (signError || !signed?.signedUrl) {
      // best-effort cleanup
      await supabaseAdmin.storage.from(bucket).remove([objectPath]);
      return json(
        { error: "Signed URL creation failed", details: signError?.message ?? "No URL" },
        500,
      );
    }

    const imageUrl = signed.signedUrl;

    // 4) Run Apify actor (wait for finish)
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?waitForFinish=60`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${APIFY_TOKEN}`,
        },
        body: JSON.stringify({
          enableLingoTranslationEnhancer: false,
          imageUrls: [imageUrl],
          originalLanguage: "japanese",
          targetLanguages,
        }),
      },
    );

    if (!runRes.ok) {
      const text = await runRes.text();
      // best-effort cleanup
      await supabaseAdmin.storage.from(bucket).remove([objectPath]);
      return json(
        { error: "Apify run failed", status: runRes.status, details: text },
        502,
      );
    }

    const runJson = await runRes.json();

    // Apify response shape: { data: { defaultDatasetId, ... }, ... }
    const datasetId: string | undefined = runJson?.data?.defaultDatasetId;
    if (!datasetId) {
      await supabaseAdmin.storage.from(bucket).remove([objectPath]);
      return json({ error: "Apify run returned no defaultDatasetId", details: runJson }, 502);
    }

    // 5) Fetch dataset items
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`,
      {
        headers: { Authorization: `Bearer ${APIFY_TOKEN}` },
      },
    );

    if (!itemsRes.ok) {
      const text = await itemsRes.text();
      await supabaseAdmin.storage.from(bucket).remove([objectPath]);
      return json(
        { error: "Apify dataset fetch failed", status: itemsRes.status, details: text },
        502,
      );
    }

    const items = (await itemsRes.json()) as Array<Record<string, unknown>>;

    // 6) Map to Mekai response
    const ocrParts: string[] = [];
    const enParts: string[] = [];

    for (const item of items) {
      const originalText = (item?.originalText as string | undefined)?.trim();
      if (originalText) ocrParts.push(originalText);

      // Your verified key for English:
      const translatedEn = (item?.translatedTextEnglish as string | undefined)?.trim();
      if (translatedEn) enParts.push(translatedEn);
    }

    // Optional: cleanup uploaded image
    await supabaseAdmin.storage.from(bucket).remove([objectPath]);

    return json({
      ocrText: ocrParts.join("\n\n"),
      translated: enParts.join("\n\n"),
      romaji: null, // actor output has no romaji
      meta: {
        itemCount: items.length,
        targetLanguages,
      },
    });
  } catch (err) {
    return json({ error: "Unhandled error", details: String(err?.message ?? err) }, 500);
  }
});