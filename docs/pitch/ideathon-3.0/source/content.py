import sys, copy
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

src, out = sys.argv[1], sys.argv[2]
p = Presentation(src)
S = list(p.slides)

def shp(slide, sid):
    for sh in slide.shapes:
        if sh.shape_id == sid: return sh
    raise KeyError(sid)

def set_text(sh, text, size=None, color=None):
    tf = sh.text_frame
    paras = tf.paragraphs
    first = paras[0]
    for extra in paras[1:]:
        extra._p.getparent().remove(extra._p)
    runs = first.runs
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    runs[0].text = text
    if size: runs[0].font.size = Pt(size)
    if color: runs[0].font.color.rgb = RGBColor.from_string(color)

def fill(slide, mapping):
    for sid, txt in mapping.items():
        set_text(shp(slide, sid), txt)

def clone(src_shape, dst_slide, x, y, w, h, text, size=None, color=None, name=None):
    el = copy.deepcopy(src_shape._element)
    tree = dst_slide.shapes._spTree
    new_id = max(s.shape_id for s in dst_slide.shapes) + 1
    cnv = el.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}cNvPr')
    cnv.set('id', str(new_id)); cnv.set('name', name or text[:40])
    for ext in cnv.findall('{http://schemas.openxmlformats.org/drawingml/2006/main}extLst'):
        cnv.remove(ext)
    tree.append(el)
    sh = shp(dst_slide, new_id)
    sh.left, sh.top, sh.width, sh.height = Inches(x), Inches(y), Inches(w), Inches(h)
    set_text(sh, text, size, color)
    return sh

def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text

# ---------- Slide 1: title ----------
set_text(shp(S[0], 8), "Socius: your open AI ally")
notes(S[0], "Hi, we're California Burrito, and this is Socius. Socius is Latin for 'ally'. "
      "In one line: Socius is your open AI ally. It runs on your own device, works with any model, "
      "and does whatever skills you give it.")

# ---------- Slide 2: problem ----------
fill(S[1], {
    138: "Personal AI agents are here. They aren't built for India.",
    128: "Closed: they only do what their makers ship",
    129: "Grok Bot, Muse and Dots remember you and act for you, but nobody else can add a skill. "
         "Your college portal or GST filing will never make their roadmap.",
    131: "Priced in dollars, locked to one cloud",
    132: "USD subscriptions, one company's model, and your personal data on someone else's server.",
    134: "Blind to how India actually works",
    135: "24 billion UPI payments a month, college portals, GST, Tamil or Hindi replies: none supported.",
    137: "Students, freelancers, small businesses. Most haven't heard of AI agents yet.",
})
notes(S[1], "2025 and 2026 gave us real personal AI agents: Grok Bot, Meta's Muse, OpenAI's Dots. "
      "They remember you, act for you and keep working in the background. But they have three problems for us. "
      "One, they're closed: you get the features the company decides to build, and nobody can add a skill for an SRM portal or a GST return. "
      "Two, they're priced in dollars and tied to one company's cloud, so your data and your model choice belong to them. "
      "Three, they ignore how India runs: UPI now does about 24 billion payments a month (NPCI, Sept 2026), "
      "and we live on college portals, GST and Tamil or Hindi WhatsApp replies. "
      "So the students, freelancers and small businesses who'd gain the most mostly haven't even heard of these agents.")

# ---------- Slide 3: solution ----------
fill(S[2], {
    141: "Socius: an open AI ally that runs on your own device",
    127: "Lives on your laptop, takes orders from your phone, runs any model (free local Ollama to OpenAI "
         "or Anthropic) and learns any skill from an open marketplace.",
    135: "Meta Muse", 138: "Remembers you",
    136: "Grok Bot", 139: "Teams of bots",
    137: "OpenAI Dots", 140: "Works in the background",
})
clone(shp(S[2], 137), S[2], 9.55, 5.71, 2.64, 0.36, "Socius", color="FF2BD6", name="Socius label")
clone(shp(S[2], 140), S[2], 9.40, 6.08, 2.94, 0.28, "Open, local, India-first", name="Socius sublabel")
notes(S[2], "Socius takes the best of all three. Muse's memory of you, Grok Bot's teams of bots, "
      "Dots' habit of working in the background, and packages it as an open, local-first ally, like Baymax. "
      "It runs on your laptop, so your files and memory stay with you. You control it from your phone. "
      "You choose the model: free local models through Ollama, or OpenAI and Anthropic if you want more power. "
      "And instead of a fixed feature list, it learns skills from an open marketplace.")

# ---------- Slide 4: innovation ----------
fill(S[3], {
    139: "An app store for your AI",
    127: "Anyone can publish skills, connectors and bot templates; the community sets the limits.",
    128: "Any model, any provider",
    129: "Free local models via Ollama, or OpenAI and Anthropic. Switch per bot, anytime.",
    130: "Memory you can see and edit",
    131: "Plain Markdown files on your disk. Read, correct or delete anything it knows.",
    132: "A team of bots, not one chatbot",
    133: "A main bot that builds specialists (researcher, writer) on demand, with your approval.",
    134: "You stay in control",
    135: "Hard stops on money, passwords and deletes. Approve each action; full activity log.",
    136: "Built for India",
    137: "Tamil and Hindi voice, UPI reminders, DigiLocker, GST and college-portal skills.",
    138: "Already working in our prototype: marketplace installs, model switching, editable memory and approvals.",
})
notes(S[3], "What makes Socius original is that it's a platform, not a product. "
      "Other assistants have a fixed set of features; Socius has a marketplace of skills, MCP connectors and bot templates that anyone can publish to, "
      "like a college attendance skill or a Zerodha connector. "
      "Any model, switchable per bot. Memory stored as plain files you can open and edit, so nothing is hidden. "
      "A main bot that creates specialist bots when you need them. Hard safety stops: it never touches money, passwords or deletes without you. "
      "And it's India-first: Indian-language voice, UPI, DigiLocker, GST. The first four already run in our prototype.")

# ---------- Slide 5: technical approach ----------
lbl = shp(S[5], 138); body = shp(S[5], 139)
clone(lbl, S[4], 1.08, 5.40, 6.25, 0.25, "WORKING PROTOTYPE   SOLID = BUILT, DASHED = NEXT", name="Prototype label")
from pptx.enum.dml import MSO_LINE
for sid in (127, 129, 136, 137, 138):  # phone, Tailscale, MCP tools, browser worker, local files: not built yet
    shp(S[4], sid).line.dash_style = MSO_LINE.DASH
clone(body, S[4], 1.08, 5.70, 6.25, 0.85,
      "Electron app + local runtime, streaming AI SDK chat (Ollama, OpenAI, Anthropic), "
      "verified marketplace installs, Markdown + SQLite memory, approvals that survive restarts, encrypted keys.",
      size=14, name="Prototype body")
notes(S[4], "Here's the architecture. The same web UI runs on the laptop inside Electron and on the phone through Tailscale, "
      "both talking to an authenticated local API. The agent runtime runs tasks and bots, using swappable model adapters, local editable memory, "
      "and a policy layer that every tool call passes through: approvals plus an activity log. Tools are MCP connectors, a browser worker and approved local files. "
      "Marketplace items go through a reviewed install before the runtime can use them. "
      "This isn't just a diagram: the Electron app, local runtime, streaming chat across Ollama, OpenAI and Anthropic, verified marketplace installs, "
      "Markdown plus SQLite memory, restart-safe approvals and encrypted keys are built and tested in our repo. "
      "Solid boxes are built; dashed boxes are next: phone access through Tailscale, MCP connectors, the browser worker and local file access.")

# ---------- Slide 6: feasibility ----------
fill(S[5], {
    140: "Built on proven open tech",
    128: "Already running",
    129: "Electron + React app with a local runtime, AI SDK chat, SQLite memory and end-to-end tests.",
    130: "Open standards, no lock-in",
    131: "MCP connectors, Agent Skills (SKILL.md), Ollama for local models, Tailscale for the phone.",
    132: "Demand is proven",
    133: "Open agents like OpenClaw and Hermes Agent have huge followings. None is India-first.",
    127: "Business model",
    134: "Free, open-source core",
    135: "Earn from paid-skill commissions, rupee cloud plans and team plans for colleges and SMBs.",
    136: "Risks we've planned for",
    137: "Laptop asleep: jobs pause (cloud option later). Data stays local, ready for DPDP rules (May 2027).",
    138: "DEMO",
    139: "Attach notes, get a summary, save it to memory, then switch from Ollama to a cloud model live.",
})
notes(S[5], "Is it feasible? We've already built the core, on proven open tools: Electron and React, the AI SDK, SQLite, with end-to-end tests. "
      "We use open standards, MCP for connectors and Agent Skills for skills, so skills from other agents work in Socius on day one. "
      "Demand is proven: open personal agents like OpenClaw and Hermes Agent have huge communities, but none is built for India. "
      "Business model: the core stays free and open source. We earn a commission on paid skills, with creators paid over UPI through Razorpay Route, "
      "plus optional cloud sync and hosted models priced in rupees, and team plans for colleges and small businesses. "
      "Risks: a sleeping laptop pauses jobs, so an always-on cloud computer is on the roadmap; and local-first storage puts us ahead of the DPDP Rules, which apply from May 2027. "
      "Vision demo: from a phone, 'summarise the PDFs in Downloads and remind me about the deadline', then switch models live, and the data never left the laptop.")

# ---------- Slide 7: impact ----------
fill(S[6], {
    137: "Who wins, and how Socius scales",
    127: "Students",
    128: "College-portal deadlines tracked, notes summarised, all free on a local model.",
    129: "Freelancers",
    130: "Research, client follow-ups and replies drafted in their own voice.",
    131: "Small businesses",
    132: "GST reminders, inbox and invoices handled, with approval before anything goes out.",
    133: "Developers",
    134: "India has the most open-source contributors on GitHub. Here, they earn from skills.",
    135: "HOW IT SCALES",
    136: "Each skill a developer publishes works for every user; the community sets the ceiling.",
})
notes(S[6], "Who benefits? Students get deadlines and notes handled for free on a local model. Freelancers get research and replies in their own voice. "
      "Small businesses get GST reminders and inbox work done, with approval before anything is sent. "
      "And developers: GitHub's Octoverse 2025 shows India now has more open-source contributors than any other country, and Socius gives them a marketplace to earn from. "
      "That's how it scales: every skill one developer publishes works for every user, so the community, not our team, sets the ceiling. "
      "Roadmap: desktop agent and skill SDK, then the marketplace and phone control, then Indian-language voice and India Stack. "
      "Socius: your open AI ally. Thank you.")

p.save(out)
print("saved", out)
