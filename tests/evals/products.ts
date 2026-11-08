/**
 * Draft-quality eval set (blocker 03, step 3). Ten fictional products that
 * span the founders Banyan is built for. Each carries only facts a founder
 * would type in; `evidence` is the only material a draft may cite, so any
 * number or testimonial beyond it counts as invented.
 */
export type EvalProduct = {
  id: string;
  profile: { name: string; description: string; valueProp: string; audience: string; positioning?: string };
  campaign: { name: string; objective: string; targetAudience: string; keyMessage: string; evidence: string; cta: string };
  brandVoice: { tone: string; language: string; avoid?: string; cta?: string };
  /** Distinctive words a grounded draft is expected to use (any two). */
  factWords: string[];
};

export const EVAL_PRODUCTS: EvalProduct[] = [
  {
    id: "ledgerline",
    profile: {
      name: "Ledgerline",
      description: "Offline-first invoicing for freelancers: create, send and track invoices with or without signal.",
      valueProp: "Invoices go out automatically the moment you are back online.",
      audience: "Freelance designers and developers who travel",
    },
    campaign: {
      name: "No signal, still paid",
      objective: "first_users",
      targetAudience: "Freelancers who work from trains, planes and co-working spaces abroad",
      keyMessage: "You should not need Wi-Fi to send an invoice.",
      evidence: "Public beta opened in October; invoices queue locally and sync when a connection returns.",
      cta: "Join the public beta",
    },
    brandVoice: { tone: "plain, founder-to-founder", language: "English", avoid: "revolutionary, game-changer" },
    factWords: ["offline", "invoice", "freelancer", "signal", "online", "sync"],
  },
  {
    id: "stackwatch",
    profile: {
      name: "Stackwatch",
      description: "Open-source uptime and certificate monitoring for small SaaS teams, self-hosted in one Docker container.",
      valueProp: "Know your TLS certificate is about to expire before your customers do.",
      audience: "Solo founders and small SaaS teams running their own servers",
    },
    campaign: {
      name: "Certificates expire on weekends",
      objective: "github_stars",
      targetAudience: "Developers who self-host",
      keyMessage: "Expired certificates are a preventable outage.",
      evidence: "MIT licensed; single container; checks HTTP status and certificate expiry every minute.",
      cta: "Star it on GitHub",
    },
    brandVoice: { tone: "dry, technical, no hype", language: "English", avoid: "AI-powered, synergy" },
    factWords: ["certificate", "uptime", "self-host", "docker", "container", "expire", "open-source", "tls"],
  },
  {
    id: "tutorloop",
    profile: {
      name: "TutorLoop",
      description: "Scheduling and payment links for independent tutors, so parents book and pay in one step.",
      valueProp: "No more chasing parents for payment after the lesson.",
      audience: "Independent tutors teaching school subjects",
    },
    campaign: {
      name: "Book and pay in one link",
      objective: "first_users",
      targetAudience: "Tutors who manage bookings over WhatsApp",
      keyMessage: "Booking and payment belong in the same step.",
      evidence: "Free for the first 20 bookings each month; works with card and mobile money.",
      cta: "Create your booking link",
    },
    brandVoice: { tone: "warm, practical", language: "English" },
    factWords: ["tutor", "booking", "book", "payment", "pay", "parents", "lesson", "link"],
  },
  {
    id: "menumint",
    profile: {
      name: "MenuMint",
      description: "Turns a photo of a printed restaurant menu into a mobile menu with QR code and daily specials.",
      valueProp: "Update today's specials from your phone in under a minute.",
      audience: "Owners of small independent restaurants and cafés",
    },
    campaign: {
      name: "Specials without reprinting",
      objective: "first_users",
      targetAudience: "Café owners who reprint menus every season",
      keyMessage: "Your menu should change as fast as your kitchen does.",
      evidence: "Menu import from a single photo; QR code included; free plan for one location.",
      cta: "Snap your menu",
    },
    brandVoice: { tone: "friendly, short sentences", language: "English", avoid: "disrupt" },
    factWords: ["menu", "specials", "qr", "photo", "restaurant", "café", "cafe", "phone"],
  },
  {
    id: "fieldnote",
    profile: {
      name: "FieldNote",
      description: "Voice-first inspection reports for building inspectors: speak findings on site, get a formatted PDF.",
      valueProp: "Finish the report before you leave the site.",
      audience: "Independent building and property inspectors",
    },
    campaign: {
      name: "Report done on site",
      objective: "demo_requests",
      targetAudience: "Inspectors who type reports in the evening",
      keyMessage: "Evenings are for life, not for typing up inspection notes.",
      evidence: "Dictation works offline; photos attach to each finding; exports a PDF.",
      cta: "Book a 15-minute demo",
    },
    brandVoice: { tone: "respectful, trade-aware", language: "English" },
    factWords: ["inspection", "inspector", "report", "voice", "pdf", "site", "photos", "dictation"],
  },
  {
    id: "quietly",
    profile: {
      name: "Quietly",
      description: "A browser extension that hides social media feeds during work hours you choose.",
      valueProp: "Keep messages and search; lose the endless scroll.",
      audience: "Remote knowledge workers who lose focus to feeds",
    },
    campaign: {
      name: "Feeds off, work on",
      objective: "installs",
      targetAudience: "Remote workers who open a social tab without noticing",
      keyMessage: "You do not need less internet, just fewer feeds.",
      evidence: "Works on Chrome and Firefox; schedules per weekday; no account needed.",
      cta: "Add it to your browser",
    },
    brandVoice: { tone: "calm, a little wry", language: "English", avoid: "dopamine, detox" },
    factWords: ["feed", "feeds", "extension", "browser", "focus", "scroll", "work hours", "chrome", "firefox"],
  },
  {
    id: "harvestlog",
    profile: {
      name: "HarvestLog",
      description: "SMS-based harvest and sales records for smallholder farmer cooperatives, no smartphone required.",
      valueProp: "Cooperatives see what every member delivered, from any basic phone.",
      audience: "Managers of smallholder farmer cooperatives",
    },
    campaign: {
      name: "Records from any phone",
      objective: "pilot_partners",
      targetAudience: "Cooperative managers still using paper ledgers",
      keyMessage: "A paper ledger cannot tell you who delivered what last season.",
      evidence: "Runs over SMS; members need no smartphone; managers get a weekly summary.",
      cta: "Apply for the pilot",
    },
    brandVoice: { tone: "clear, respectful, no jargon", language: "English" },
    factWords: ["sms", "cooperative", "farmer", "harvest", "phone", "ledger", "members", "delivered"],
  },
  {
    id: "patchnote",
    profile: {
      name: "PatchNote",
      description: "Generates customer-facing release notes from merged pull requests, in your product's voice.",
      valueProp: "Ship the changelog the same day you ship the code.",
      audience: "Product engineers at early-stage startups",
    },
    campaign: {
      name: "Changelog on ship day",
      objective: "first_users",
      targetAudience: "Engineers who write release notes at the end of a sprint",
      keyMessage: "Customers notice the changelog more than you think.",
      evidence: "GitHub app; drafts notes from pull request titles and descriptions; a human approves each one.",
      cta: "Install the GitHub app",
    },
    brandVoice: { tone: "engineer-to-engineer", language: "English", avoid: "10x" },
    factWords: ["release notes", "changelog", "pull request", "github", "merged", "ship", "notes"],
  },
  {
    id: "carecircle",
    profile: {
      name: "CareCircle",
      description: "A shared calendar and task list for families coordinating care for an elderly parent.",
      valueProp: "Everyone knows who is visiting, driving or picking up medicine this week.",
      audience: "Adult children sharing care for a parent",
    },
    campaign: {
      name: "Who is on this week",
      objective: "first_users",
      targetAudience: "Siblings coordinating care in a group chat",
      keyMessage: "Care is easier to share when everyone can see the plan.",
      evidence: "Free for one family; invite by link; reminders by email.",
      cta: "Start your family's plan",
    },
    brandVoice: { tone: "gentle, plain", language: "English", avoid: "burden" },
    factWords: ["care", "family", "calendar", "parent", "visiting", "medicine", "siblings", "plan"],
  },
  {
    id: "lumen-fr",
    profile: {
      name: "Lumen",
      description: "Suivi des factures d'énergie pour les petits commerces, avec alerte quand la consommation dérive.",
      valueProp: "Repérez une dérive de consommation avant la facture suivante.",
      audience: "Gérants de petits commerces en France",
    },
    campaign: {
      name: "Plus de surprise sur la facture",
      objective: "first_users",
      targetAudience: "Boulangers et épiciers qui découvrent la hausse sur la facture",
      keyMessage: "Une dérive se voit en jours, pas en mois.",
      evidence: "Lecture du compteur Linky; alerte par SMS; essai gratuit d'un mois.",
      cta: "Essayez un mois gratuitement",
    },
    brandVoice: { tone: "direct, concret", language: "French" },
    factWords: ["facture", "énergie", "consommation", "commerce", "linky", "alerte", "dérive"],
  },
];
