import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

interface CalculateTripBudgetInput {
  destination: string;
  durationDays: number;
  travelersCount?: number;
  travelStyle: "budget" | "moderate" | "luxury";
  includeFlights?: boolean;
}

interface CostTiers {
  lodgingPerNight: number;
  foodPerDay: number;
  transitPerDay: number;
  activitiesPerDay: number;
  flightPerPerson: number;
}

const BASELINE_TIERS: Record<"budget" | "moderate" | "luxury", CostTiers> = {
  budget: {
    lodgingPerNight: 75,
    foodPerDay: 35,
    transitPerDay: 15,
    activitiesPerDay: 15,
    flightPerPerson: 750,
  },
  moderate: {
    lodgingPerNight: 190,
    foodPerDay: 85,
    transitPerDay: 25,
    activitiesPerDay: 40,
    flightPerPerson: 1100,
  },
  luxury: {
    lodgingPerNight: 550,
    foodPerDay: 220,
    transitPerDay: 60,
    activitiesPerDay: 120,
    flightPerPerson: 2800,
  },
};

export async function execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
  const req = (
    typeof input === "object" && input !== null ? input : {}
  ) as CalculateTripBudgetInput;

  const destination = typeof req.destination === "string" ? req.destination.trim() : "";
  if (!destination) {
    return {
      success: false,
      output: null,
      error: "Parameter 'destination' is required for calculate_trip_budget",
    };
  }

  const durationDays =
    typeof req.durationDays === "number" ? Math.max(1, Math.round(req.durationDays)) : 0;
  if (!durationDays) {
    return {
      success: false,
      output: null,
      error: "Parameter 'durationDays' must be a positive number",
    };
  }

  const travelStyle = req.travelStyle;
  if (!travelStyle || !["budget", "moderate", "luxury"].includes(travelStyle)) {
    return {
      success: false,
      output: null,
      error: "Parameter 'travelStyle' must be one of: 'budget', 'moderate', 'luxury'",
    };
  }

  const travelersCount =
    typeof req.travelersCount === "number" && req.travelersCount > 0
      ? Math.round(req.travelersCount)
      : 1;

  const includeFlights = Boolean(req.includeFlights);

  const tiers = BASELINE_TIERS[travelStyle];

  // Number of hotel rooms needed (assume 2 adults per room)
  const roomsCount = Math.ceil(travelersCount / 2);
  const totalLodging = tiers.lodgingPerNight * roomsCount * durationDays;

  // Per-person daily costs
  const totalFood = tiers.foodPerDay * travelersCount * durationDays;
  const totalTransit = tiers.transitPerDay * travelersCount * durationDays;
  const totalActivities = tiers.activitiesPerDay * travelersCount * durationDays;

  const totalFlights = includeFlights ? tiers.flightPerPerson * travelersCount : 0;

  const subtotal = totalLodging + totalFood + totalTransit + totalActivities + totalFlights;

  // 15% contingency buffer recommended for unexpected travel expenses
  const contingencyBuffer = Math.round(subtotal * 0.15);
  const totalEstimatedCost = subtotal + contingencyBuffer;

  const costPerPerson = Math.round(totalEstimatedCost / travelersCount);
  const dailyAveragePerPerson = Math.round(costPerPerson / durationDays);

  return {
    success: true,
    output: {
      destination,
      durationDays,
      travelersCount,
      travelStyle,
      currency: "USD",
      breakdown: {
        lodging: {
          ratePerNight: tiers.lodgingPerNight,
          roomsCount,
          total: totalLodging,
        },
        dining: {
          ratePerPersonPerDay: tiers.foodPerDay,
          total: totalFood,
        },
        localTransit: {
          ratePerPersonPerDay: tiers.transitPerDay,
          total: totalTransit,
        },
        activitiesAndSightseeing: {
          ratePerPersonPerDay: tiers.activitiesPerDay,
          total: totalActivities,
        },
        flights: {
          included: includeFlights,
          estimatedPerPerson: includeFlights ? tiers.flightPerPerson : 0,
          total: totalFlights,
        },
        contingencyBuffer: {
          percentage: "15%",
          total: contingencyBuffer,
        },
      },
      summary: {
        totalEstimatedCost,
        costPerPerson,
        dailyAveragePerPerson,
      },
      budgetingTip:
        travelStyle === "budget"
          ? "Consider booking business-style hotels near metro stations and dining at local izakayas/noodle bars for exceptional value."
          : travelStyle === "moderate"
            ? "Mix boutique hotels with one special ryokan stay. Reserve sought-after dinner spots at least 3-4 weeks in advance."
            : "Opt for private guided tours with luxury chauffeured transit and multi-course kaiseki dining.",
    },
  };
}
