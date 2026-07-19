"use client";

import { useEffect, useState } from "react";
import { subscribeRequestLoader } from "@/lib/request-loader";

export function GlobalLoader() {
  const [pending, setPending] = useState(0);
  useEffect(() => subscribeRequestLoader(setPending), []);
  if (!pending) return null;
  return (
    <div className="global-loader" role="status" aria-live="polite">
      <div>
        <i />
        <span>
          <b>Please wait</b>
          <small>Working on your request…</small>
        </span>
      </div>
    </div>
  );
}
