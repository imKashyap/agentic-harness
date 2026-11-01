import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

interface PlaceItem {
  id: string;
  name: string;
  category: "attraction" | "restaurant" | "hotel";
  rating: number;
  priceLevel: "$" | "$$" | "$$$" | "$$$$";
  area: string;
  summary: string;
  tags: string[];
}

interface SearchPlacesInput {
  location: string;
  category?: "attraction" | "restaurant" | "hotel" | "all";
  query?: string;
  limit?: number;
}

const CURATED_PLACES: Record<string, PlaceItem[]> = {
  tokyo: [
    {
      id: "tokyo-sensoji",
      name: "Sensō-ji Temple",
      category: "attraction",
      rating: 4.8,
      priceLevel: "$",
      area: "Asakusa",
      summary:
        "Tokyo's oldest and most iconic Buddhist temple, founded in 645 AD with vibrant Nakamise shopping street.",
      tags: ["historic", "culture", "temple", "photography"],
    },
    {
      id: "tokyo-shibuya-sky",
      name: "Shibuya Sky Observatory",
      category: "attraction",
      rating: 4.9,
      priceLevel: "$$",
      area: "Shibuya",
      summary:
        "Open-air rooftop observatory offering panoramic 360-degree views of Tokyo and Mount Fuji.",
      tags: ["views", "modern", "skyline", "sunset"],
    },
    {
      id: "tokyo-ginza-sushi",
      name: "Kyubey Ginza",
      category: "restaurant",
      rating: 4.9,
      priceLevel: "$$$$",
      area: "Ginza",
      summary:
        "Legendary Edomae sushi institution serving multi-course omakase prepared with pristine seafood.",
      tags: ["sushi", "fine-dining", "omakase", "traditional"],
    },
    {
      id: "tokyo-fuunji-ramen",
      name: "Fuunji Ramen",
      category: "restaurant",
      rating: 4.7,
      priceLevel: "$",
      area: "Shinjuku",
      summary:
        "Celebrated ramen counter acclaimed for rich, intensely flavorful chicken-and-fish tsukemen dipping noodles.",
      tags: ["ramen", "noodles", "local-favorite", "casual"],
    },
    {
      id: "tokyo-hoshinoya",
      name: "Hoshinoya Tokyo",
      category: "hotel",
      rating: 4.9,
      priceLevel: "$$$$",
      area: "Otemachi",
      summary:
        "A 17-story modern luxury ryokan combining traditional tatami floors and onsen hot spring baths in downtown Tokyo.",
      tags: ["luxury", "ryokan", "onsen", "boutique"],
    },
    {
      id: "tokyo-hotel-claska",
      name: "Trunk Hotel Yoyogi Park",
      category: "hotel",
      rating: 4.7,
      priceLevel: "$$$",
      area: "Tomigaya / Shibuya",
      summary:
        "Chic design-forward boutique hotel overlooking Yoyogi Park with heated rooftop infinity pool and oyster bar.",
      tags: ["design", "boutique", "pool", "modern"],
    },
  ],
  kyoto: [
    {
      id: "kyoto-fushimi-inari",
      name: "Fushimi Inari Taisha",
      category: "attraction",
      rating: 4.9,
      priceLevel: "$",
      area: "Southern Kyoto",
      summary:
        "Famous Shinto shrine renowned for thousands of vermilion torii gates winding up the sacred Mount Inari.",
      tags: ["culture", "hiking", "torii", "spiritual"],
    },
    {
      id: "kyoto-kinkaku-ji",
      name: "Kinkaku-ji (Golden Pavilion)",
      category: "attraction",
      rating: 4.8,
      priceLevel: "$",
      area: "Northern Kyoto",
      summary:
        "Zen Buddhist temple whose top two floors are completely covered in gold leaf, set above a mirror pond.",
      tags: ["zen", "historic", "gardens", "unesco"],
    },
    {
      id: "kyoto-kikunoi",
      name: "Kikunoi Roan",
      category: "restaurant",
      rating: 4.9,
      priceLevel: "$$$$",
      area: "Gion",
      summary:
        "Michelin-starred traditional Kaiseki dining celebrating seasonal Kyoto micro-seasons and artisanal ingredients.",
      tags: ["kaiseki", "michelin", "fine-dining", "traditional"],
    },
    {
      id: "kyoto-gion-udon",
      name: "Gion Okaru",
      category: "restaurant",
      rating: 4.6,
      priceLevel: "$$",
      area: "Gion",
      summary:
        "Historic wooden noodle house beloved by geiko and locals for curry udon and broth dishes.",
      tags: ["noodles", "udon", "cozy", "comfort-food"],
    },
    {
      id: "kyoto-tawaraya",
      name: "Tawaraya Ryokan",
      category: "hotel",
      rating: 5.0,
      priceLevel: "$$$$",
      area: "Central Kyoto",
      summary:
        "One of Japan's oldest and most prestigious traditional ryokans, with private zen gardens and exquisite kaiseki breakfasts.",
      tags: ["ryokan", "traditional", "historic", "zen"],
    },
    {
      id: "kyoto-the-shinmonzen",
      name: "The Shinmonzen",
      category: "hotel",
      rating: 4.8,
      priceLevel: "$$$$",
      area: "Gion Shirakawa",
      summary:
        "Luxury contemporary boutique hotel designed by Tadao Ando set along the picturesque Shirakawa canal.",
      tags: ["boutique", "architecture", "canal", "luxury"],
    },
  ],
  paris: [
    {
      id: "paris-louvre",
      name: "Musée du Louvre",
      category: "attraction",
      rating: 4.9,
      priceLevel: "$$",
      area: "1st Arrondissement",
      summary:
        "The world's largest art museum and historic palace, home to the Mona Lisa and Venus de Milo.",
      tags: ["museum", "art", "historic", "architecture"],
    },
    {
      id: "paris-eiffel",
      name: "Eiffel Tower & Champ de Mars",
      category: "attraction",
      rating: 4.8,
      priceLevel: "$$",
      area: "7th Arrondissement",
      summary:
        "The defining landmark of Paris featuring sweeping city vistas from its summit and glittering evening light shows.",
      tags: ["landmark", "views", "romantic", "iconic"],
    },
    {
      id: "paris-bistrot-paul-bert",
      name: "Bistrot Paul Bert",
      category: "restaurant",
      rating: 4.8,
      priceLevel: "$$$",
      area: "11th Arrondissement",
      summary:
        "Quintessential Parisian bistro famous for steak frites with peppercorn cream sauce and giant soufflé desserts.",
      tags: ["bistro", "french", "steak-frites", "wine"],
    },
    {
      id: "paris-saint-james",
      name: "Saint James Paris",
      category: "hotel",
      rating: 4.9,
      priceLevel: "$$$$",
      area: "16th Arrondissement",
      summary:
        "Neoclassical chateau hotel surrounded by private walled gardens, combining aristocratic elegance with modern luxury.",
      tags: ["chateau", "luxury", "gardens", "boutique"],
    },
  ],
};

export async function execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
  const req = (typeof input === "object" && input !== null ? input : {}) as SearchPlacesInput;

  const location = typeof req.location === "string" ? req.location.trim() : "";
  if (!location) {
    return {
      success: false,
      output: null,
      error: "Parameter 'location' is required for search_places",
    };
  }

  const categoryFilter = req.category && req.category !== "all" ? req.category : undefined;
  const queryFilter = typeof req.query === "string" ? req.query.trim().toLowerCase() : "";
  const limit = typeof req.limit === "number" && req.limit > 0 ? Math.min(req.limit, 20) : 5;

  const normalizedLoc = location.toLowerCase();
  let candidatePlaces: PlaceItem[] = [];

  // Match key in curated list
  for (const [key, places] of Object.entries(CURATED_PLACES)) {
    if (normalizedLoc.includes(key) || key.includes(normalizedLoc)) {
      candidatePlaces = places;
      break;
    }
  }

  // Fallback generation for any destination not explicitly in the curated table
  if (candidatePlaces.length === 0) {
    candidatePlaces = [
      {
        id: `${normalizedLoc}-historic-center`,
        name: `${location} Old Town & Heritage Center`,
        category: "attraction",
        rating: 4.8,
        priceLevel: "$",
        area: "Old Town",
        summary: `Historic cultural district of ${location} featuring preserved architecture, museums, and pedestrian squares.`,
        tags: ["history", "culture", "sightseeing", "walking"],
      },
      {
        id: `${normalizedLoc}-viewpoint`,
        name: `${location} Panoramic Viewpoint & Botanical Gardens`,
        category: "attraction",
        rating: 4.7,
        priceLevel: "$$",
        area: "Hillside District",
        summary: `Scenic viewpoint offering sweeping views of ${location} with manicured botanical trails.`,
        tags: ["nature", "views", "photography", "relaxing"],
      },
      {
        id: `${normalizedLoc}-traditional-bistro`,
        name: `${location} Heritage Tavern`,
        category: "restaurant",
        rating: 4.7,
        priceLevel: "$$",
        area: "Central Market",
        summary: `Highly rated culinary gem known for authentic regional specialties and seasonal ingredients of ${location}.`,
        tags: ["regional", "local-cuisine", "authentic", "seasonal"],
      },
      {
        id: `${normalizedLoc}-boutique-hotel`,
        name: `The Grand Heritage Hotel ${location}`,
        category: "hotel",
        rating: 4.8,
        priceLevel: "$$$",
        area: "Downtown Waterfront",
        summary: `Centrally situated boutique property blending classical regional charm with modern comfort and spa facilities.`,
        tags: ["boutique", "comfort", "central", "spa"],
      },
    ];
  }

  // Filter by category
  let filtered = candidatePlaces;
  if (categoryFilter) {
    filtered = filtered.filter((place) => place.category === categoryFilter);
  }

  // Filter by query if provided
  if (queryFilter) {
    filtered = filtered.filter(
      (place) =>
        place.name.toLowerCase().includes(queryFilter) ||
        place.summary.toLowerCase().includes(queryFilter) ||
        place.tags.some((t) => t.toLowerCase().includes(queryFilter)),
    );
  }

  const results = filtered.slice(0, limit);

  return {
    success: true,
    output: {
      location,
      totalFound: filtered.length,
      limit,
      category: req.category ?? "all",
      places: results,
    },
  };
}
