function normalize(url: string) {
  return url.replace(/\/+$/, "");
}

export function serverApiUrl() {
  const configured = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured) return normalize(configured);
  return process.env.NODE_ENV === "production"
    ? "https://drishyana-api.onrender.com/api/v1"
    : "http://localhost:4000/api/v1";
}
