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
          <b>Drishyana is working</b>
          <small>Please wait until this action completes…</small>
        </span>
      </div>
    </div>
  );
}
