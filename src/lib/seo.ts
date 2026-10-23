// Per-page title, description, canonical link, Open Graph tags and JSON-LD.
import { useEffect } from "react";
import { BASE, SITE_URL } from "./api";
const ROOT = () => SITE_URL || window.location.origin + BASE.replace(/\/$/, "");
const routePath = () => { const b = BASE.replace(/\/$/, ""); const p = window.location.pathname; return b && p.startsWith(b) ? p.slice(b.length) || "/" : p; };

interface Seo {
  title: string;
  description?: string;
  path?: string;          // canonical path, e.g. "/product/lint-brush"
  image?: string;
  noindex?: boolean;
  jsonLd?: object | null;
}

function meta(attr: "name" | "property", key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) { el?.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.content = content;
}

export const absoluteUrl = (path: string) => (/^https?:/.test(path) ? path : ROOT() + path);

export function useSeo({ title, description, path, image, noindex, jsonLd }: Seo) {
  useEffect(() => {
    document.title = title;
    if (description) { meta("name", "description", description); meta("property", "og:description", description); }
    meta("property", "og:title", title);
    meta("name", "robots", noindex ? "noindex, nofollow" : null);
    const url = absoluteUrl(path ?? routePath());
    meta("property", "og:url", url);
    meta("property", "og:image", absoluteUrl(image ?? "/og-image.png"));
    meta("name", "twitter:card", "summary_large_image");
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = url;
    const id = "page-jsonld";
    document.getElementById(id)?.remove();
    if (jsonLd) {
      const s = document.createElement("script");
      s.type = "application/ld+json"; s.id = id; s.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(s);
    }
  }, [title, description, path, image, noindex, jsonLd]);
}
