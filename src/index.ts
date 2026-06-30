import { tera } from "./lib/terabox";
import { isValidShareUrl, extractSurl, formatBytes } from "./lib/utils";

const port = process.env.PORT || 5000;

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_DURATION = 2 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (pathname === "/") {
      return Response.json(
        {
          name: "TeraBox API",
          version: "3.0",
          status: "operational",
          endpoints: {
            "/api": "Fetch files from Terabox link",
          },
          timestamp: new Date().toISOString(),
        },
        { headers: corsHeaders },
      );
    }

    if (pathname === "/dl") {
      try {
        const target = url.searchParams.get("url");
        if (!target) {
          return Response.json(
            { status: "error", message: "Missing required parameter: url" },
            { status: 400, headers: corsHeaders },
          );
        }

        const upstream = await fetch(target, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
            Cookie: `ndus=${JSON.parse(process.env.COOKIE_JSON || "{}")["ndus"]}`,
          },
        });

        if (!upstream.ok || !upstream.body) {
          return Response.json(
            {
              status: "error",
              message: "Failed to fetch file from TeraBox",
              upstream_status: upstream.status,
            },
            { status: 502, headers: corsHeaders },
          );
        }

        const headers = new Headers(corsHeaders);
        const cd = upstream.headers.get("content-disposition");
        const ct = upstream.headers.get("content-type");
        const cl = upstream.headers.get("content-length");
        if (cd) headers.set("Content-Disposition", cd);
        if (ct) headers.set("Content-Type", ct);
        if (cl) headers.set("Content-Length", cl);

        return new Response(upstream.body, { headers });
      } catch (error: any) {
        return Response.json(
          { status: "error", message: String(error) },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    if (pathname === "/api") {
      try {
        const startTime = Date.now();
        const targetUrlRaw = url.searchParams.get("url");

        if (!targetUrlRaw || !targetUrlRaw.trim()) {
          return Response.json(
            {
              status: "error",
              message: "Missing required parameter: url",
              example: "/api?url=https://terabox.app/s/1HSEb8PZRUE7Z1Tvd3ZtT0g",
            },
            { status: 400, headers: corsHeaders },
          );
        }

        const targetUrl = targetUrlRaw.trim();

        if (!targetUrl.startsWith("http") || !isValidShareUrl(targetUrl)) {
          return Response.json(
            {
              status: "error",
              url: targetUrl,
              message: "Invalid TeraBox share URL",
            },
            { status: 400, headers: corsHeaders },
          );
        }

        const surl = extractSurl(targetUrl);
        if (!surl) {
          return Response.json(
            {
              status: "error",
              url: targetUrl,
              message: "Could not extract surl from URL",
            },
            { status: 400, headers: corsHeaders },
          );
        }

        let data;
        const cached = cache.get(surl);
        if (cached && Date.now() < cached.expiry) {
          data = cached.data;
        } else {
          data = await tera(surl);
          cache.set(surl, { data, expiry: Date.now() + CACHE_DURATION });
        }
        const responseTime = ((Date.now() - startTime) / 1000).toFixed(3) + "s";

        if (data && data.error) {
          return Response.json(
            {
              status: "error",
              url: targetUrl,
              surl: surl,
              error: data.error,
              response_time: responseTime,
              timestamp: new Date().toISOString(),
            },
            { status: 400, headers: corsHeaders },
          );
        }

        let filename;
        let size;
        let download;
        let thumbs;

        if (data && data.list && data.list.length > 0) {
          const firstItem = data.list[0];
          filename = firstItem.server_filename;
          size = formatBytes(firstItem.size);
          download = firstItem.dlink;
          thumbs = firstItem.thumbs;
        }

        return Response.json(
          {
            status: "success",
            response_time: responseTime,
            url: targetUrl,
            ...(filename && { filename }),
            ...(size && { size }),
            ...(download && { download }),
            ...(download && {
              proxy_download: `${url.origin}/dl?url=${encodeURIComponent(download)}`,
            }),
            ...(thumbs && { thumbs }),
          },
          { headers: corsHeaders },
        );
      } catch (error: any) {
        return Response.json(
          {
            status: "error",
            message: String(error),
            url: url.searchParams.get("url"),
          },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    return Response.json(
      { error: "Not Found" },
      { status: 404, headers: corsHeaders },
    );
  },
});

console.log(`Bun server running on port ${port}`);
