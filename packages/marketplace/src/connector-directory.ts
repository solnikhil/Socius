/** Discovery listings are not installable releases and confer no tools or access. */
export interface PlannedConnector {
  id: string;
  kind: "connector";
  name: string;
  category:
    | "payments"
    | "travel"
    | "food"
    | "documents"
    | "government"
    | "telecom"
    | "work"
    | "health";
  description: string;
  availability: "planned";
}

/**
 * Indian services people asked for. These are searchable listings only.
 * Razorpay and Cashfree publish hosted MCP servers, but those sign-in with an
 * API key. Socius connectors complete account sign-in through OAuth, so none
 * of these listings can connect, charge, book or read an account yet.
 */
export const plannedConnectors: readonly PlannedConnector[] = [
  {
    id: "socius/razorpay",
    kind: "connector",
    name: "Razorpay",
    category: "payments",
    description: "UPI, cards, payment links and settlements.",
    availability: "planned",
  },
  {
    id: "socius/cashfree",
    kind: "connector",
    name: "Cashfree",
    category: "payments",
    description: "Payments, settlements and reconciliation.",
    availability: "planned",
  },
  {
    id: "socius/phonepe",
    kind: "connector",
    name: "PhonePe",
    category: "payments",
    description: "UPI payments and merchant collections.",
    availability: "planned",
  },
  {
    id: "socius/paytm",
    kind: "connector",
    name: "Paytm",
    category: "payments",
    description: "Wallet, UPI and merchant payments.",
    availability: "planned",
  },
  {
    id: "socius/irctc",
    kind: "connector",
    name: "IRCTC",
    category: "travel",
    description: "Train search, PNR status and rail booking.",
    availability: "planned",
  },
  {
    id: "socius/redbus",
    kind: "connector",
    name: "redBus",
    category: "travel",
    description: "Intercity bus search and tickets.",
    availability: "planned",
  },
  {
    id: "socius/makemytrip",
    kind: "connector",
    name: "MakeMyTrip",
    category: "travel",
    description: "Flights, hotels and trip planning.",
    availability: "planned",
  },
  {
    id: "socius/indigo",
    kind: "connector",
    name: "IndiGo",
    category: "travel",
    description: "IndiGo flight search and trip details.",
    availability: "planned",
  },
  {
    id: "socius/air-india",
    kind: "connector",
    name: "Air India",
    category: "travel",
    description: "Air India flight search and trip details.",
    availability: "planned",
  },
  {
    id: "socius/ola",
    kind: "connector",
    name: "Ola",
    category: "travel",
    description: "City cabs and outstation rides.",
    availability: "planned",
  },
  {
    id: "socius/zomato",
    kind: "connector",
    name: "Zomato",
    category: "food",
    description: "Restaurant discovery and food orders.",
    availability: "planned",
  },
  {
    id: "socius/swiggy",
    kind: "connector",
    name: "Swiggy",
    category: "food",
    description: "Food delivery and restaurant orders.",
    availability: "planned",
  },
  {
    id: "socius/blinkit",
    kind: "connector",
    name: "Blinkit",
    category: "food",
    description: "Quick grocery delivery.",
    availability: "planned",
  },
  {
    id: "socius/zepto",
    kind: "connector",
    name: "Zepto",
    category: "food",
    description: "Quick grocery delivery.",
    availability: "planned",
  },
  {
    id: "socius/digilocker",
    kind: "connector",
    name: "DigiLocker",
    category: "documents",
    description: "Issued documents saved in DigiLocker.",
    availability: "planned",
  },
  {
    id: "socius/india-post",
    kind: "connector",
    name: "India Post",
    category: "documents",
    description: "PIN codes and parcel tracking.",
    availability: "planned",
  },
  {
    id: "socius/gst",
    kind: "connector",
    name: "GST",
    category: "government",
    description: "GSTIN lookup for a business.",
    availability: "planned",
  },
  {
    id: "socius/umang",
    kind: "connector",
    name: "UMANG",
    category: "government",
    description: "Central and state government services.",
    availability: "planned",
  },
  {
    id: "socius/airtel",
    kind: "connector",
    name: "Airtel",
    category: "telecom",
    description: "Mobile and broadband account details.",
    availability: "planned",
  },
  {
    id: "socius/jio",
    kind: "connector",
    name: "Jio",
    category: "telecom",
    description: "Mobile and broadband account details.",
    availability: "planned",
  },
  {
    id: "socius/vi",
    kind: "connector",
    name: "Vi",
    category: "telecom",
    description: "Mobile account details.",
    availability: "planned",
  },
  {
    id: "socius/zoho",
    kind: "connector",
    name: "Zoho",
    category: "work",
    description: "Zoho CRM contacts, deals and tasks.",
    availability: "planned",
  },
  {
    id: "socius/practo",
    kind: "connector",
    name: "Practo",
    category: "health",
    description: "Doctor search and appointments.",
    availability: "planned",
  },
];

export const connectorCategories: {
  id: PlannedConnector["category"];
  title: string;
}[] = [
  { id: "payments", title: "Payments" },
  { id: "travel", title: "Travel" },
  { id: "food", title: "Food and delivery" },
  { id: "documents", title: "Documents" },
  { id: "government", title: "Government" },
  { id: "telecom", title: "Telecom" },
  { id: "work", title: "Work" },
  { id: "health", title: "Health" },
];
