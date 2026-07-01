import { loadCookies } from "./utils";

export async function getStreamUrl(dlink: string): Promise<string | null> {
  const cookies = loadCookies();
  const cookieString = `ndus=${cookies["ndus"]}`;

  try {
    const response = await fetch(dlink, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
        Cookie: cookieString,
      },
    });

    // 302 redirect — final CDN URL
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location");
      console.log("[DEBUG] Stream URL (redirect):", location);
      return location;
    }

    // Kuch servers 200 ke saath direct serve karte hain
    if (response.status === 200) {
      console.log("[DEBUG] dlink already direct, no redirect");
      return dlink;
    }

    console.log("[DEBUG] Unexpected status for stream URL:", response.status);
    return null;
  } catch (error: any) {
    console.error("[DEBUG] Error in getStreamUrl:", error);
    return null;
  }
}

export async function tera(surl: string): Promise<any> {
  let short_url = surl;
  if (surl.startsWith("1")) {
    short_url = surl.substring(1);
  }

  const cookies = loadCookies();
  let ndusCookie = cookies["ndus"];
  console.log("[DEBUG] Loaded ndus cookie:", ndusCookie);

  const cookieString = `ndus=${ndusCookie}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    Cookie: cookieString,
  };

  const first_url = `https://dm.terabox.app/sharing/link?surl=${surl}`;
  console.log("[DEBUG] Fetching first_url:", first_url);
  console.log("[DEBUG] First request headers:", headers);

  try {
    const response = await fetch(first_url, { headers });
    console.log("[DEBUG] First response status:", response.status);
    const text = await response.text();
    console.log("[DEBUG] First response text snippet:", text.substring(0, 200));

    const match = text.match(/fn%28%22(.*?)%22%29/);
    if (!match) {
      console.log("[DEBUG] Failed to match jsToken in text.");
      return {
        error:
          "Failed to extract jsToken. Verification might be required or Cloudflare blocked the request.",
      };
    }
    const jsToken = match[1];
    console.log("[DEBUG] Extracted jsToken:", jsToken);

    const api_url = new URL("https://dm.terabox.app/share/list");
    api_url.searchParams.append("app_id", "250528");
    api_url.searchParams.append("jsToken", jsToken);
    api_url.searchParams.append("site_referer", "https://www.terabox.app/");
    api_url.searchParams.append("shorturl", short_url);
    api_url.searchParams.append("root", "1");

    const api_headers = {
      Host: "dm.terabox.app",
      "User-Agent": headers["User-Agent"],
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://dm.terabox.app/sharing/link?surl=${short_url}&clearCache=1`,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://dm.terabox.app",
      Cookie: cookieString,
    };

    console.log("[DEBUG] Fetching api_url:", api_url.toString());
    console.log("[DEBUG] API headers:", api_headers);

    const api_response = await fetch(api_url.toString(), {
      headers: api_headers,
    });
    console.log("[DEBUG] API response status:", api_response.status);
    const data = await api_response.json();
    console.log(
      "[DEBUG] API response data:",
      JSON.stringify(data).substring(0, 300),
    );

    return data;
  } catch (error: any) {
    console.error("[DEBUG] Error caught in tera():", error);
    return { error: String(error) };
  }
}
