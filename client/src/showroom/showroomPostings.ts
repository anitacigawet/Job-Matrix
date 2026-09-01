export type FictionalEmployerPosting = {
  id: number;
  title: string;
  company: string;
  location: string;
  pay: string;
  summary: string;
};

export const FICTIONAL_EMPLOYER_PATH = "/showroom/fictional-employer";

export const fictionalEmployerPostings: ReadonlyArray<FictionalEmployerPosting> = [
  {
    id: 101,
    title: "Community Programs Coordinator",
    company: "Juniper Community Works",
    location: "Phoenix, AZ",
    pay: "$54,000–$68,000 a year",
    summary: "Coordinate neighborhood programs, maintain partner calendars, and prepare plain-language progress reports.",
  },
  {
    id: 102,
    title: "Operations Support Specialist",
    company: "Copper Mesa Services",
    location: "Remote — Arizona",
    pay: "$24–$29 an hour",
    summary: "Support a distributed operations team through scheduling, quality checks, documentation, and customer follow-up.",
  },
  {
    id: 103,
    title: "Civic Data Assistant",
    company: "Sonoran Open Records Lab",
    location: "Tempe, AZ · Hybrid",
    pay: "$50,000–$61,000 a year",
    summary: "Review civic records, normalize public datasets, and help publish accessible explainers for community users.",
  },
  {
    id: 104,
    title: "Documentation Coordinator",
    company: "Desert Lantern Cooperative",
    location: "Remote",
    pay: "$48,000–$57,000 a year",
    summary: "Maintain process documentation and turn complex internal notes into concise user-facing guidance.",
  },
  {
    id: 201,
    title: "Member Support Coordinator",
    company: "Palo Verde Mutual Aid",
    location: "Mesa, AZ",
    pay: "$49,000–$59,000 a year",
    summary: "Coordinate member questions, scheduling, referrals, and follow-up for a community support team.",
  },
  {
    id: 202,
    title: "Program Intake Assistant",
    company: "Canyon Family Network",
    location: "Glendale, AZ",
    pay: "$22–$25 an hour",
    summary: "Help applicants complete program intake, organize records, and route requests to the right team.",
  },
];

export function showroomPostingUrl(id: number): string {
  return `${FICTIONAL_EMPLOYER_PATH}?job=${id}`;
}

export function getFictionalEmployerPosting(id: number): FictionalEmployerPosting | undefined {
  return fictionalEmployerPostings.find(posting => posting.id === id);
}
