import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/accordion.js";
import { Eyebrow, Reveal, Words } from "../components/motion.js";

const faqs: [string, string][] = [
  [
    "Is Socius really free?",
    "Yes. Socius doesn't sell a subscription or bundle a key. You connect your own model provider and pay them directly, or run a local model through Ollama, LM Studio or llama.cpp at no cost.",
  ],
  [
    "Which models can I use?",
    "29 providers, including OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, DeepSeek, Amazon Bedrock, Azure OpenAI, Vertex AI, OpenRouter, the Vercel AI Gateway and any OpenAI-compatible server. Add several accounts, test models, and pick a different one per bot.",
  ],
  [
    "Does my data leave my computer?",
    "Chats, memory and settings are stored locally. The model providers you connect receive the context you send them, and external actions only happen after you approve them. There is no account, analytics or crash reporting.",
  ],
  [
    "What can a bot do without asking me?",
    "Read what you've granted it, like searching a connected Notion workspace or a public web page. Anything that writes or changes the outside world — creating a page, clicking a button, saving a memory a bot proposed — waits for your approval of the exact action.",
  ],
  [
    "What is Dreaming?",
    "An opt-in mode. While Socius is idle, a model you choose consolidates finished conversations into each bot's private memory, citing the messages it drew from. It has no tools and takes no external actions.",
  ],
  [
    "Can I use Socius on my phone?",
    "As a preview: run Socius on your laptop, share it over your private Tailscale network, and pair your phone with a QR code. The phone controls the same running workspace, and you can revoke it at any time.",
  ],
  [
    "Is there an installer?",
    "Not yet. Signed installers and auto-updates are planned. Today you build Socius from source with Node.js 24 on macOS, Windows or Linux.",
  ],
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-paper-2 px-4 py-24 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <Reveal>
            <Eyebrow tone="pink">FAQ</Eyebrow>
          </Reveal>
          <h2 className="mt-4 text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">
            <Words text="Questions, *answered.*" />
          </h2>
        </div>
        <Reveal delay={0.1}>
          <Accordion
            type="single"
            collapsible
            defaultValue="0"
            className="rounded-3xl border border-line bg-paper px-6 shadow-card sm:px-8"
          >
            {faqs.map(([q, a], i) => (
              <AccordionItem key={q} value={String(i)}>
                <AccordionTrigger>{q}</AccordionTrigger>
                <AccordionContent>{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
