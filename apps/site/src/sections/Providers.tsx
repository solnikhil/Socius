import type { CSSProperties } from "react";
import {
  PROVIDER_IDS,
  provider,
  type ProviderId,
} from "@socius/contracts/providers";
import { ProviderMark } from "@/components/ProviderMark";
import { cn } from "@/lib/utils";
import { Reveal } from "../components/motion.js";

function Row({
  ids,
  reverse,
}: {
  ids: readonly ProviderId[];
  reverse?: boolean;
}) {
  // The list is doubled so the -50% loop lands exactly where it started.
  const items = [...ids, ...ids];
  return (
    <div className="edge-fade group flex overflow-hidden">
      <div
        className={cn(
          "flex w-max shrink-0 animate-marquee gap-3 py-1.5 pr-3 group-hover:[animation-play-state:paused]",
          reverse && "[animation-direction:reverse]",
        )}
        style={{ "--marquee-time": "60s" } as CSSProperties}
      >
        {items.map((id, i) => (
          <div
            key={`${id}-${i}`}
            aria-hidden={i >= ids.length}
            className="flex items-center gap-2.5 rounded-xl border border-line bg-paper py-2 pl-2 pr-4 text-[14px] font-medium text-ink-2 shadow-card transition-transform hover:-translate-y-0.5"
          >
            <ProviderMark id={id} size={28} />
            {provider(id).name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Providers() {
  const half = Math.ceil(PROVIDER_IDS.length / 2);
  return (
    <section className="py-16">
      <Reveal className="mx-auto max-w-2xl px-4 text-center">
        <p className="text-[15px] font-medium text-ink-3">
          Bring the model you already trust. Socius works with{" "}
          <span className="text-ink">{PROVIDER_IDS.length} providers</span>,
          including fully local ones.
        </p>
      </Reveal>
      <div className="mt-8 space-y-3">
        <Row ids={PROVIDER_IDS.slice(0, half)} />
        <Row ids={PROVIDER_IDS.slice(half)} reverse />
      </div>
    </section>
  );
}
