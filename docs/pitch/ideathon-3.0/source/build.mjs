import fs from 'node:fs/promises';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const p=Presentation.create({slideSize:{width:1280,height:720}}),s=Array.from({length:7},()=>p.slides.add());
const C={cyan:'#00E5FF',pink:'#FF2BD6',white:'#FFFFFF',muted:'#AEB6CC',navy:'#0B1020'};
function t(sl,txt,x,y,w,h,size=24,color=C.white,bold=false,align='left'){
 const q=sl.shapes.add({geometry:'textbox',name:txt.slice(0,60),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 q.text=txt;q.text.style={typeface:'Calibri',fontSize:size,color,bold,alignment:align,verticalAlignment:'top',wrap:'word',insets:0};return q;
}
function pair(sl,title,body,x,y,w=476,bs=23){t(sl,title,x,y,w,36,26,C.cyan,true);t(sl,body,x,y+41,w,78,bs)}
async function img(sl,file,x,y,w,h,alt){const b=await fs.readFile(file);sl.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',alt,fit:'contain',position:{left:x,top:y,width:w,height:h}})}
const source='Project source, updated 14 October 2026: https://app.notion.com/p/Socius-Ideathon-3-0-3f910c43ad3e81198b7bdf7be7bf6b06 . Socius is a proposed personal AI platform. The updated Third-party tools and frameworks section explicitly says nothing listed is implemented yet. Recommended foundations are proposed selections, not completed integrations. Candidate frameworks and India-specific integrations require evaluation. No measured traction, time-saving, revenue or market-size figures are asserted.';
s[0].speakerNotes.text=source+'\nTeam: California Burrito. Recommended track: AI Automation. The main outcome is end-to-end automation of user tasks across tools, local files and browser workflows. Open source, model choice and the marketplace differentiate the automation platform; Open Innovation is a broader fallback if event organisers direct general agent platforms there.';
// 2. Problem only: pains, affected people and consequences.
t(s[1],'Everyday digital work requires too much manual coordination',104,197,1055,45,30,C.white,true);
const pains=[
 ['01','Repetitive administration','Deadlines, inbox follow-ups and document handling require repeated steps across disconnected apps.'],
 ['02','Control, cost and privacy trade-offs','Provider ecosystems and cloud usage create decisions about model access, recurring cost and where data goes.'],
 ['03','Gaps in local workflows','College portals, GST tasks and communication in Indian languages often need task-specific support.']
];
for(let i=0;i<3;i++){const y=275+i*101;t(s[1],pains[i][0],104,y,54,44,35,C.pink,true);t(s[1],pains[i][1],178,y,990,35,27,C.cyan,true);t(s[1],pains[i][2],178,y+39,990,57,24)}
t(s[1],'WHO FEELS IT',104,591,180,28,18,C.pink,true);t(s[1],'Students, freelancers and small businesses lose time coordinating routine work.',288,588,886,34,22,C.muted);
s[1].speakerNotes.text=source+'\nThis slide states the problem and target users only. Treat audience pains as hypotheses to validate in interviews. Concrete examples include collecting deadlines across college portals and email, summarising documents, following up on client invoices and tracking routine business administration. Avoid claiming all competing assistants lack extensibility or charge in dollars: product features and access differ. Socius’s intended opportunity is the combination of local execution, provider choice and community-built skills for local workflows.';
// 3. Solution: definition, access model, capability inspirations, companion metaphor.
t(s[2],'Socius: an open personal AI agent on your laptop',104,195,1065,43,31,C.cyan,true);
t(s[2],'Use the same interface from your laptop or phone to run tasks, install skills and choose local or cloud models.',104,246,1060,62,24,C.white);
await img(s[2],'assets/Muse_Transparent.png',103,342,166,188,'Meta Muse mascot, transparent cutout from the selected reference');
await img(s[2],'assets/Grok_Bot_Transparent.png',329,354,172,172,'Grok Bot face, transparent cutout from the selected reference');
await img(s[2],'assets/Dots_Characters_Transparent.png',554,342,280,188,'Four dots characters only, with all wordmarks removed');
await img(s[2],'assets/Baymax_High_Quality_Transparent.png',917,321,253,222,'Original Baymax holding a red lollipop, with transparent background and no banner');
t(s[2],'+',277,411,43,53,41,C.pink,true,'center');t(s[2],'+',509,411,40,53,41,C.pink,true,'center');t(s[2],'=',850,411,55,53,46,C.cyan,true,'center');
t(s[2],'Meta Muse',103,548,166,35,25,C.white,true,'center');t(s[2],'Grok Bot',329,548,172,35,25,C.white,true,'center');t(s[2],'OpenAI dots',554,548,280,35,25,C.white,true,'center');
t(s[2],'Personal assistance',91,584,190,27,18,C.muted,false,'center');t(s[2],'Teams of agents',318,584,195,27,18,C.muted,false,'center');t(s[2],'Ongoing work',554,584,280,27,18,C.muted,false,'center');
s[2].speakerNotes.text=source+'\nSocius brings personal assistance, teams of bots and ongoing responsibilities into one open platform. The phone controls the same local runtime through authenticated access, rather than running a second independent agent. Images describe product inspirations and the desired friendly companion experience; they do not imply partnerships, product integration or verified feature parity. Baymax is the user-selected visual metaphor, not an original Socius character. Local-first describes storage and execution. Cloud models and hosted tools receive the context routed to them, and the laptop must remain awake and reachable.\nVisual sources: Muse image selected from Google Images/Instagram, https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8gwfSd-W2bzOvTpeic2ETHjTcfSfJwpD1j1gWVdvByBq-Umytk7Mna8w&s=10 ; Grok Bot from https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=2,background=white,quality=75,width=400,height=400/uploads/2v/d138a593-2147-414c-9933-c9a312a4b5ac.png ; dots artwork from https://cdn.mos.cms.futurecdn.net/v2/t:0,l:365,cw:941,ch:941,q:80,w:941/8VTccbXzN6iSXcm5UXhMGY.png . Transparent cutouts of these references were edited with the image tool. Baymax source: high-resolution original poster from FilmVandaag.nl, https://static.filmvandaag.nl/shows/original/8000/8142.jpg?v=1; original Disney artwork, https://press.disneyplus.com/disney-plus/baymax/logos . The original character pixels and lollipop pose are retained in a transparent PNG cutout. No banner is attached to the character. Character and product artwork belong to the respective owners.';
// 4. Features and innovation: distinct mechanisms, no market claims.
pair(s[3],'Skills and bot marketplace','Build, share and install reusable skills, MCP connectors and ready-made bot templates.',104,201,476,23);
pair(s[3],'Model choice','Switch between Ollama and direct cloud providers through a common model interface.',658,201,476,23);
pair(s[3],'Editable memory','Inspect remembered preferences and facts, correct them, export them or delete them.',104,333,476,23);
pair(s[3],'Bots, goals and routines','Delegate work to specialist bots, track goals and schedule recurring tasks or watchers.',658,333,476,23);
pair(s[3],'Actions under your control','Use action-level approvals, human login handoffs and an inspectable activity history.',104,465,476,23);
pair(s[3],'India-focused roadmap','Indian-language voice, UPI reminders, college portals, GST and DigiLocker skills.',658,465,476,23);
t(s[3],'Planned capabilities. Initial connector packages and the plugin sandbox remain to be selected.',104,606,1060,23,18,C.muted);
s[3].speakerNotes.text=source+'\nThe marketplace is the main extension mechanism. Socius owns the permissions, credential handling and approval boundary. MCP supplies a connector protocol, not a sandbox. All tools, scheduled jobs and delegated bots must use the same policy boundary. India-focused candidates include Sarvam AI and AI4Bharat for voice, Razorpay Route for payments/creator payouts and Setu for DigiLocker/Account Aggregator. These are roadmap candidates, not adopted or implemented integrations. Initial connector evaluation prioritises email/calendar and Notion. Paid marketplace processing and always-on cloud machines remain later decisions.\nCandidate documentation supplied in the brief: https://docs.sarvam.ai/api/getting-started/models ; https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual ; https://razorpay.com/docs/payments/route/integration-guide/ ; https://docs.setu.co/data/digilocker/quickstart .';
// 5. User-provided architecture: all 13 nodes, all 12 directed edges, editable.
const nodes={};
function box(key,txt,x,y,w,h,size=19,color=C.cyan){const q=s[4].shapes.add({geometry:'rect',name:key,position:{left:x,top:y,width:w,height:h},fill:C.navy,line:{fill:color,width:1.4}});q.text=txt;q.text.style={typeface:'Calibri',fontSize:size,color:C.white,bold:true,alignment:'center',verticalAlignment:'middle',insets:4};nodes[key]=q;return q;}
function edge(a,b,from='bottom',to='top',kind='elbow',col=C.cyan){s[4].shapes.connect(nodes[a],nodes[b],{kind,fromSide:from,toSide:to,line:{fill:col,width:1.7},tail:{type:'triangle',width:'sm',length:'sm'}});}
box('Desktop','Laptop: web UI\nor Electron',180,194,280,54,19);
box('Phone','Phone: same\nresponsive web UI',780,194,280,54,19);
box('API','Authenticated\nlocal API',180,274,280,54,20);
box('Tailscale','Tailscale Serve',780,274,280,54,20);
box('Runtime','Agent runtime:\ntasks, bots, schedules',180,354,280,56,19,C.pink);
box('Install','Reviewed installation',650,354,230,56,19);
box('Registry','Marketplace registry',945,354,230,56,19);
box('Models','Model adapters:\nlocal or cloud',104,442,270,50,18);
box('Memory','Editable memory',430,442,240,50,19);
box('Policy','Policy, approvals\nand activity log',730,442,445,50,18,C.pink);
box('Tools','Tools and MCP connectors',730,516,445,42,19);
box('Browser','Browser worker',730,586,210,38,18);
box('Files','Approved local files',965,586,210,38,18);
edge('Desktop','API');edge('Phone','Tailscale');edge('Tailscale','API','left','right','straight');edge('API','Runtime');
edge('Runtime','Models');edge('Runtime','Memory');edge('Runtime','Policy');edge('Policy','Tools');edge('Tools','Browser');edge('Tools','Files');
edge('Registry','Install','left','right','straight');edge('Install','Runtime','left','right','straight');
s[4].speakerNotes.text=source+'\nArchitecture supplied by the team, preserved as 13 editable nodes and 12 directed connections. Laptop web UI or Electron connects to the authenticated local API. Phone responsive UI connects through Tailscale Serve to the same API. The API connects to the agent runtime for tasks, bots and schedules. Runtime connects to model adapters, editable memory and policy/approvals/activity log. Policy connects to tools and MCP connectors. Tools connect to the browser worker and approved local files. The marketplace registry connects through reviewed installation to the runtime.\nProposed implementation: React + TypeScript + Vite, Tailwind CSS + shadcn/ui for one shared UI; Tailscale Serve over private HTTPS, tailnet restrictions and Socius device pairing/authentication; AI SDK behind a Socius-owned model interface with direct cloud and Ollama adapters; SQLite for local task/approval/settings/schedule/installation/activity state, distinct from semantic memory and framework workflow storage; Playwright with a dedicated visible browser profile; a Socius connector host for MCP. Keep credentials out of the frontend and redact secrets from logs.\nCurrent foundation references in the brief: https://tailscale.com/docs/reference/tailscale-cli/serve ; https://ai-sdk.dev/docs/foundations/providers-and-models ; https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context .';
// 6. Feasibility, open decisions and commercial viability.
t(s[5],'Proposed V1 foundations',104,197,500,36,27,C.cyan,true);
t(s[5],'Business model',658,197,480,36,27,C.cyan,true);
pair(s[5],'Shared UI and remote access','React, TypeScript and Vite, with Tailwind/shadcn and Tailscale Serve.',104,252,476,22);
pair(s[5],'Local execution and tools','AI SDK, Ollama, SQLite, Playwright and MCP. Validate model/tool support on real devices.',104,363,476,22);
pair(s[5],'Candidates to evaluate','Eve for runtime, Supermemory local for memory, Electron/Forge for desktop packaging.',104,474,476,22);
pair(s[5],'Free, open-source core','Proposed revenue: paid-skill commission, optional INR cloud plans and team/enterprise plans.',658,252,476,22);
pair(s[5],'Feasibility checks','Laptop awake and connected, local hardware capacity, reliable tools and one approval boundary.',658,387,476,22);
t(s[5],'MVP DEMO',658,524,150,24,18,C.pink,true);
t(s[5],'Phone request, local PDF summary, a deadline reminder and a live model switch.',658,556,480,62,22,C.white);
s[5].speakerNotes.text=source+'\nThe newer third-party selection takes priority over older LiteLLM/Cloudflare/Telegram examples elsewhere on the page. Start with the responsive web UI and local runtime. Electron packaging is a separate deliverable and should not block the web interface.\nEve must demonstrate direct cloud and Ollama adapters, restart recovery, cancellation, approval enforcement across tools/subagents and local packaging. Supermemory local must demonstrate edit/delete propagation, provenance, export/backup, licensing and acceptable resource use; native Windows support needs investigation. Electron/Forge must pass secure IPC/preload, renderer sandboxing, credential storage, installers, signing and update checks. Plugin sandbox, registry hosting, email provider and connector packages remain open selections. A child process and permission manifest alone do not establish a safe plugin sandbox.\nThe core is free/open source. Paid skills and payment processing are later commercial decisions. Optional cloud plans have compute/support costs. Validate repeat use and willingness to pay through pilots. Demo target is proposed, not a claim of completion. Use local inference to demonstrate that source PDF content stays on the laptop.\nCandidate documentation: https://github.com/vercel/eve/blob/main/docs/concepts/execution-model-and-durability.mdx ; https://github.com/supermemoryai/supermemory/blob/main/apps/docs/self-hosting/quickstart.mdx ; https://www.electronjs.org/docs/latest/tutorial/security ; https://www.electronforge.io/guides/code-signing .';
// 7. Expected benefit and how to validate it.
t(s[6],'Expected benefits for users and skill creators',104,197,1060,44,31,C.white,true);
pair(s[6],'Students','Collect deadlines, summarise study files and reduce repeat work in college workflows.',104,272,476,24);
pair(s[6],'Freelancers','Prepare research, draft replies in their own voice and track client follow-ups.',658,272,476,24);
pair(s[6],'Small businesses','Reuse routines for inbox and document administration, with approvals for consequential actions.',104,417,476,24);
pair(s[6],'Developers','Build, publish and maintain reusable skills that address local needs.',658,417,476,24);
t(s[6],'PILOT MEASURES',104,578,230,25,18,C.pink,true);
t(s[6],'Task completion, time saved, repeat use and correct approval decisions.',104,608,1060,28,23,C.cyan,true);
s[6].speakerNotes.text=source+'\nExpected impact, not measured results. Pilot with students, freelancers and small businesses. Measure end-to-end completion against an agreed task outcome, compare assisted time with the existing workflow, track return use, and inspect approval decisions including unwanted sends or changes. Ask skill creators whether the SDK and registry reduce the effort to distribute a reliable integration. Expand to Indian-language voice and India Stack integrations after validating the core automation experience.';
await (await PresentationFile.exportPptx(p)).save('source/overlay.pptx');
console.log('Authored corrected seven-slide content and exact architecture graph');
