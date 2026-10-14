/** Discovery listings are not installable releases and confer no tools or access. */
export interface PlannedConnector {
  id: string;
  kind: "connector";
  name: string;
  category: "travel" | "documents" | "food" | "telecom";
  description: string;
  availability: "planned";
}

/** Requested services awaiting an implemented and reviewed account integration. */
export const plannedConnectors: readonly PlannedConnector[] = [
  {
    id: "socius/irctc",
    kind: "connector",
    name: "IRCTC",
    category: "travel",
    description: "Rail travel and booking assistance.",
    availability: "planned",
  },
  {
    id: "socius/digilocker",
    kind: "connector",
    name: "DigiLocker",
    category: "documents",
    description: "Personal document assistance.",
    availability: "planned",
  },
  {
    id: "socius/makemytrip",
    kind: "connector",
    name: "MakeMyTrip",
    category: "travel",
    description: "Trip planning and booking assistance.",
    availability: "planned",
  },
  {
    id: "socius/air-india",
    kind: "connector",
    name: "Air India",
    category: "travel",
    description: "Flight and trip assistance.",
    availability: "planned",
  },
  {
    id: "socius/indigo",
    kind: "connector",
    name: "IndiGo",
    category: "travel",
    description: "Flight and trip assistance.",
    availability: "planned",
  },
  {
    id: "socius/zomato",
    kind: "connector",
    name: "Zomato",
    category: "food",
    description: "Food and restaurant assistance.",
    availability: "planned",
  },
  {
    id: "socius/swiggy",
    kind: "connector",
    name: "Swiggy",
    category: "food",
    description: "Food and delivery assistance.",
    availability: "planned",
  },
  {
    id: "socius/airtel",
    kind: "connector",
    name: "Airtel",
    category: "telecom",
    description: "Mobile and broadband account assistance.",
    availability: "planned",
  },
  {
    id: "socius/jio",
    kind: "connector",
    name: "Jio",
    category: "telecom",
    description: "Mobile and broadband account assistance.",
    availability: "planned",
  },
];
