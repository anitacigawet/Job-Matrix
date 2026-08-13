/**
 * Work-style Quick Fill — curated job-title starter packs.
 *
 * Solves the first-run cold-start problem: many users (career-changers,
 * non-technical job-seekers, "I just need a job" job-seekers) honestly
 * don't know what job titles to type into the search. This file holds
 * hand-picked starter packs they can grab as a baseline.
 *
 * Architecture (DECISIONS.md D-021):
 *  - Single static dataset, no LLM, no API call.
 *  - Categories × levels (Low / Medium / High) × 8 titles each.
 *  - Per-level descriptions framed by *the work*, not the person.
 *  - Job titles chosen to actually return hits on real job-board APIs
 *    (Indeed, Adzuna, LinkedIn) — no whimsy.
 *  - Adding a category is a one-paragraph diff to this file; no UI or
 *    schema change needed.
 *
 * Tone guide:
 *  - Descriptions describe the work, not the user. "Roles that lean toward
 *    focused, independent work" — not "Best for introverts."
 *  - Entry-level descriptions stay respectful — these are honest jobs.
 *  - The user picks the category; the level slider modulates intensity
 *    within it.
 */

export type WorkStyleLevelId = "low" | "medium" | "high";

export interface WorkStyleLevel {
  id: WorkStyleLevelId;
  /** Short, friendly framing of what this level represents. */
  description: string;
  /** Pre-curated job titles. All pre-checked by default in the UI. */
  titles: string[];
}

export interface WorkStyleCategory {
  /** Stable id used in URLs, hooks, and analytics. Kebab-case. */
  id: string;
  /** Display label on the category button. */
  label: string;
  /** Short tagline shown under the label in the picker. */
  tagline: string;
  /**
   * Visual accent — keys mapped to subtle Tailwind classes in the
   * component. Kept abstract here so the data file has no UI dependency.
   */
  accent: "blue" | "amber" | "green" | "slate";
  /** Three levels in order: low, medium, high. */
  levels: [WorkStyleLevel, WorkStyleLevel, WorkStyleLevel];
}

export const WORK_STYLE_CATEGORIES: WorkStyleCategory[] = [
  {
    id: "introvert-friendly",
    label: "Introvert-friendly",
    tagline: "Roles that lean toward focused, independent work.",
    accent: "blue",
    levels: [
      {
        id: "low",
        description: "Focused work with regular team check-ins — some collaboration, mostly heads-down.",
        titles: [
          "QA Tester",
          "Junior Accountant",
          "Administrative Assistant",
          "Junior Data Analyst",
          "Pharmacy Technician",
          "Library Assistant",
          "Lab Technician",
          "Bookkeeping Assistant",
        ],
      },
      {
        id: "medium",
        description: "Deeper focused work with lighter day-to-day interaction.",
        titles: [
          "Backend Software Engineer",
          "Data Analyst",
          "Copywriter",
          "Technical Writer",
          "Medical Coder",
          "Accountant",
          "Statistician",
          "Quality Assurance Analyst",
        ],
      },
      {
        id: "high",
        description: "Roles where independent, deep work is the whole job.",
        titles: [
          "Freelance Editor",
          "Bookkeeper",
          "Night Auditor",
          "Translator",
          "Archivist",
          "Data Scientist",
          "Research Analyst",
          "Web Developer",
        ],
      },
    ],
  },

  {
    id: "extrovert-friendly",
    label: "Extrovert-friendly",
    tagline: "Roles built around working with people.",
    accent: "amber",
    levels: [
      {
        id: "low",
        description: "Steady customer contact without being out front — comfortable, regular interaction.",
        titles: [
          "Cashier",
          "Receptionist",
          "Retail Associate",
          "Coffee Shop Barista",
          "Banking Teller",
          "Front Desk Associate",
          "Restaurant Host",
          "Visitor Services Representative",
        ],
      },
      {
        id: "medium",
        description: "Working with people is most of the job — coordinating, hosting, light sales.",
        titles: [
          "Restaurant Server",
          "Inside Sales Representative",
          "Shift Supervisor",
          "Event Coordinator",
          "Client Success Associate",
          "Outbound Customer Service",
          "Personal Trainer",
          "Recruiter",
        ],
      },
      {
        id: "high",
        description: "High-energy people work where presence and pitch are the product.",
        titles: [
          "Bartender",
          "Account Executive",
          "Real Estate Agent",
          "Outside Sales Representative",
          "Insurance Agent",
          "Business Development Representative",
          "Wedding Planner",
          "Brand Ambassador",
        ],
      },
    ],
  },

  {
    id: "hands-on",
    label: "Hands-on / physical",
    tagline: "Active work where you're using your body, not a keyboard.",
    accent: "green",
    levels: [
      {
        id: "low",
        description: "Active, on-your-feet work without heavy physical demand.",
        titles: [
          "Stock Clerk",
          "Mail Carrier",
          "Delivery Driver",
          "Hotel Housekeeper",
          "Warehouse Associate",
          "Grocery Stocker",
          "Pharmacy Technician",
          "Receiving Clerk",
        ],
      },
      {
        id: "medium",
        description: "Full physical work with some technique — trades-adjacent, regular tool use.",
        titles: [
          "Forklift Operator",
          "Landscaper",
          "HVAC Apprentice",
          "Carpenter Apprentice",
          "Auto Mechanic Assistant",
          "Plumber Helper",
          "Welder Helper",
          "Electrician Apprentice",
        ],
      },
      {
        id: "high",
        description: "Heavy physical labor or certified trade work — physical skill is the job.",
        titles: [
          "Construction Worker",
          "Carpenter",
          "Plumber",
          "Electrician",
          "Welder",
          "HVAC Technician",
          "Heavy Equipment Operator",
          "Diesel Mechanic",
        ],
      },
    ],
  },

  {
    id: "entry-level",
    label: "Entry-level / no degree",
    tagline: "Strong paths forward without a four-year degree.",
    accent: "slate",
    levels: [
      {
        id: "low",
        description: "Apply today, start tomorrow — no prior experience needed.",
        titles: [
          "Cashier",
          "Fast Food Crew Member",
          "Retail Sales Associate",
          "Warehouse Worker",
          "Delivery Driver",
          "Hotel Housekeeper",
          "Stock Clerk",
          "Mover",
        ],
      },
      {
        id: "medium",
        description: "Roles that train you on the job — short learning curve, no degree required.",
        titles: [
          "Bank Teller",
          "Pharmacy Technician",
          "Veterinary Assistant",
          "Medical Assistant",
          "Insurance Agent",
          "Bartender",
          "Hairstylist",
          "Property Manager Assistant",
        ],
      },
      {
        id: "high",
        description: "Strong-paying trades and certifications — no four-year degree needed.",
        titles: [
          "Electrician",
          "Plumber",
          "HVAC Technician",
          "Welder",
          "Wind Turbine Technician",
          "Commercial Driver",
          "Solar Installer",
          "Court Reporter",
        ],
      },
    ],
  },
];

/** Helper: get a category by id. */
export function getWorkStyleCategory(id: string): WorkStyleCategory | undefined {
  return WORK_STYLE_CATEGORIES.find((c) => c.id === id);
}

/** Helper: get one specific level by category id + level id. */
export function getWorkStyleLevel(
  categoryId: string,
  levelId: WorkStyleLevelId,
): WorkStyleLevel | undefined {
  return getWorkStyleCategory(categoryId)?.levels.find((l) => l.id === levelId);
}

/**
 * Normalise a job title to a kebab-case slug for parameterised agent
 * hooks (e.g. `toggle-suggested-title-backend-software-engineer`).
 * NOT used for the stored job title itself — `user_job_titles.title`
 * keeps the original casing.
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
