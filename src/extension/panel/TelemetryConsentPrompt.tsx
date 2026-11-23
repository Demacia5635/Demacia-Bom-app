import { useEffect, useState } from "react";
import { declineTelemetryConsent, requestTelemetryConsent, shouldAskTelemetryConsent } from "../telemetryConsent";

/**
 * Firefox only, once: asks whether usage statistics may be sent to the
 * team's server (telemetryConsent.ts). Nothing is sent until the user allows
 * it, here, at install, or in the add-on's settings.
 */
export default function TelemetryConsentPrompt() {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void shouldAskTelemetryConsent().then((yes) => {
      if (!cancelled) setAsk(yes);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ask) return null;
  return (
    <div
      role="dialog"
      aria-label="Usage statistics"
      className="telemetry-consent m-2 rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-xs"
    >
      <p className="mb-2">
        Share anonymous-ish usage statistics with the team's server? Includes your Onshape name, the operations and
        their timings.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500"
          onClick={() => {
            // Firefox's permission prompt needs this click (a user action).
            void requestTelemetryConsent().finally(() => setAsk(false));
          }}
        >
          Allow
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-3 py-1 hover:bg-zinc-800"
          onClick={() => {
            declineTelemetryConsent();
            setAsk(false);
          }}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
