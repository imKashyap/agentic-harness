import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

interface GetWeatherInput {
  location: string;
  seasonOrMonth?: string;
}

interface ClimateProfile {
  highC: number;
  lowC: number;
  rainfallDays: number;
  condition: string;
  packingList: string[];
  travelTips: string;
}

const WMO_WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

const SEASONAL_DATA: Record<string, Record<string, ClimateProfile>> = {
  kyoto: {
    autumn: {
      highC: 17,
      lowC: 8,
      rainfallDays: 5,
      condition: "Crisp, sunny days with brilliant autumn maple foliage (kōyō).",
      packingList: [
        "Medium coat or trench",
        "Warm scarf for evening temple illuminations",
        "Comfortable slip-on walking shoes",
      ],
      travelTips:
        "Prime autumn foliage season peak in mid-to-late November. Book evening temple garden illuminations in advance.",
    },
    spring: {
      highC: 20,
      lowC: 9,
      rainfallDays: 8,
      condition:
        "Mild and pleasant with cherry blossoms (sakura) in bloom across Philosopher's Path.",
      packingList: [
        "Light layers",
        "Cardigan or light jacket",
        "Walking shoes",
        "Compact umbrella",
      ],
      travelTips:
        "Early April peak for cherry blossoms. Very high visitor volumes at Arashiyama and Kiyomizu-dera.",
    },
    summer: {
      highC: 33,
      lowC: 24,
      rainfallDays: 10,
      condition:
        "Hot and humid with Gion Matsuri festival atmosphere and evening dining over the Kamogawa river.",
      packingList: [
        "Breathable linen or cotton clothing",
        "Sun protection / parasol",
        "Hydration pack / water bottle",
      ],
      travelTips:
        "Midday heat can be intense. Plan temple visits early in the morning and dine on kawayuka river platforms in the evening.",
    },
    winter: {
      highC: 9,
      lowC: 1,
      rainfallDays: 6,
      condition: "Cold, serene, and crisp with occasional light snow dustings on northern temples.",
      packingList: ["Down jacket", "Thermal innerwear (Heattech)", "Gloves and beanie"],
      travelTips:
        "Fewest crowds of the year. Ideal for contemplative zen garden visits and hot onsen baths nearby.",
    },
  },
  tokyo: {
    autumn: {
      highC: 18,
      lowC: 10,
      rainfallDays: 6,
      condition:
        "Clear skies and moderate temperatures with golden ginkgo avenues in Meiji Jingu Gaien.",
      packingList: [
        "Light wool coat or sweater",
        "Comfortable city walking sneakers",
        "Light scarf",
      ],
      travelTips: "November offers ideal walking weather across Shibuya, Ginza, and Yanaka.",
    },
    spring: {
      highC: 19,
      lowC: 10,
      rainfallDays: 9,
      condition:
        "Crisp spring breeze with cherry blossom hanami picnics in Shinjuku Gyoen and Ueno Park.",
      packingList: ["Medium layers", "Light jacket", "Sneakers", "Picnic mat for hanami"],
      travelTips:
        "Cherry blossoms bloom late March to early April. Ueno Park is lively but crowded.",
    },
    summer: {
      highC: 31,
      lowC: 24,
      rainfallDays: 8,
      condition: "Warm and humid with lively summer fireworks (hanabi) over the Sumida River.",
      packingList: ["Light breathable apparel", "Sun hat and sunglasses", "Portable handheld fan"],
      travelTips:
        "Hydrate frequently and take advantage of indoor museums and air-conditioned shopping malls in midday.",
    },
    winter: {
      highC: 10,
      lowC: 2,
      rainfallDays: 4,
      condition: "Dry, cold, and clear with high visibility of Mount Fuji from observation decks.",
      packingList: ["Winter coat", "Warm sweaters", "Gloves"],
      travelTips:
        "Winter illuminations across Roppongi Hills and Marunouchi are at their peak through December and January.",
    },
  },
};

function resolveSeasonKey(inputSeason?: string): "autumn" | "spring" | "summer" | "winter" {
  if (!inputSeason) return "autumn";
  const lower = inputSeason.toLowerCase();
  if (
    lower.includes("nov") ||
    lower.includes("oct") ||
    lower.includes("sep") ||
    lower.includes("fall") ||
    lower.includes("autumn")
  ) {
    return "autumn";
  }
  if (
    lower.includes("mar") ||
    lower.includes("apr") ||
    lower.includes("may") ||
    lower.includes("spring")
  ) {
    return "spring";
  }
  if (
    lower.includes("jun") ||
    lower.includes("jul") ||
    lower.includes("aug") ||
    lower.includes("summer")
  ) {
    return "summer";
  }
  return "winter";
}

/**
 * Fetch real-time weather from Open-Meteo (open-meteo.com)
 * Uses Geocoding API + Forecast API with zero API key required.
 */
async function fetchOpenMeteoWeather(location: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    // 1. Geocoding
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoResponse = await fetch(geoUrl, { signal: controller.signal });
    if (!geoResponse.ok) return null;

    const geoData = (await geoResponse.json()) as {
      results?: Array<{
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        timezone?: string;
      }>;
    };

    const first = geoData.results?.[0];
    if (!first) return null;

    const { latitude, longitude, name: resolvedName, country, timezone } = first;

    // 2. Forecast
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${encodeURIComponent(timezone ?? "auto")}`;
    const forecastResponse = await fetch(forecastUrl, { signal: controller.signal });
    if (!forecastResponse.ok) return null;

    const forecastData = (await forecastResponse.json()) as {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        weather_code: number;
      };
      daily?: {
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
        weather_code: number[];
      };
    };

    if (!forecastData.daily || !forecastData.current) return null;

    const currentC = Math.round(forecastData.current.temperature_2m);
    const currentF = Math.round((currentC * 9) / 5 + 32);

    const highC = Math.round(Math.max(...forecastData.daily.temperature_2m_max));
    const lowC = Math.round(Math.min(...forecastData.daily.temperature_2m_min));
    const highF = Math.round((highC * 9) / 5 + 32);
    const lowF = Math.round((lowC * 9) / 5 + 32);

    const maxRainProb = Math.max(...(forecastData.daily.precipitation_probability_max ?? [0]));
    const currentWeatherDesc =
      WMO_WEATHER_DESCRIPTIONS[forecastData.current.weather_code] ?? "Clear / Moderate";

    const packing: string[] = ["Comfortable walking shoes"];
    if (lowC < 5) {
      packing.push("Heavy winter coat", "Thermal innerwear (Heattech)", "Gloves and scarf");
    } else if (lowC < 14) {
      packing.push("Mid-weight jacket or sweater", "Warm layers for evening");
    } else if (highC > 27) {
      packing.push("Breathable linen/cotton clothes", "Sunscreen and sunglasses", "Hat");
    } else {
      packing.push("Light layers", "Cardigan or light windbreaker");
    }

    if (
      maxRainProb > 30 ||
      [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(forecastData.current.weather_code)
    ) {
      packing.push("Compact umbrella or water-resistant jacket");
    }

    return {
      location: resolvedName + (country ? `, ${country}` : ""),
      source: "open-meteo.com (live forecast)",
      coordinates: { latitude, longitude },
      current: {
        temperatureCelsius: currentC,
        temperatureFahrenheit: currentF,
        humidity: `${forecastData.current.relative_humidity_2m}%`,
        condition: currentWeatherDesc,
      },
      temperature: {
        currentCelsius: currentC,
        currentFahrenheit: currentF,
        highCelsius: highC,
        lowCelsius: lowC,
        highFahrenheit: highF,
        lowFahrenheit: lowF,
      },
      precipitation: {
        maxRainProbability: `${maxRainProb}%`,
        rainLikelihood: maxRainProb > 50 ? "High" : maxRainProb > 25 ? "Moderate" : "Low",
      },
      conditionSummary: `Currently ${currentWeatherDesc} at ${currentC}°C (${currentF}°F). 7-day forecast ranges from ${lowC}°C to ${highC}°C with ${maxRainProb}% max rain probability.`,
      packingRecommendations: packing,
      travelTips:
        maxRainProb > 50
          ? "High chance of rain during the week. Plan indoor cultural spots like museums, covered markets, and culinary dining."
          : "Favorable forecast for outdoor walking, photography, and sightseeing.",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
  const req = (typeof input === "object" && input !== null ? input : {}) as GetWeatherInput;

  const location = typeof req.location === "string" ? req.location.trim() : "";
  if (!location) {
    return {
      success: false,
      output: null,
      error: "Parameter 'location' is required for get_weather",
    };
  }

  // 1. Try real-time Open-Meteo API first
  const openMeteoData = await fetchOpenMeteoWeather(location);
  if (openMeteoData) {
    return {
      success: true,
      output: openMeteoData,
    };
  }

  // 2. Seamless offline / seasonal baseline fallback
  const seasonKey = resolveSeasonKey(req.seasonOrMonth);
  const normalizedLoc = location.toLowerCase();

  let profile: ClimateProfile;

  let foundKey: string | null = null;
  for (const key of Object.keys(SEASONAL_DATA)) {
    if (normalizedLoc.includes(key) || key.includes(normalizedLoc)) {
      foundKey = key;
      break;
    }
  }

  if (foundKey && SEASONAL_DATA[foundKey]?.[seasonKey]) {
    profile = SEASONAL_DATA[foundKey]![seasonKey]!;
  } else {
    const baselines: Record<string, ClimateProfile> = {
      autumn: {
        highC: 16,
        lowC: 8,
        rainfallDays: 5,
        condition: `Moderate, crisp weather in ${location} with clear sightseeing conditions.`,
        packingList: ["Mid-weight layers", "Light jacket or sweater", "Comfortable walking shoes"],
        travelTips: `Pleasant season for outdoor exploration and photography in ${location}.`,
      },
      spring: {
        highC: 18,
        lowC: 9,
        rainfallDays: 7,
        condition: `Mild spring temperatures in ${location} with blooming flora and occasional light showers.`,
        packingList: ["Cardigans or light jackets", "Compact umbrella", "Walking sneakers"],
        travelTips: `Great season to explore city parks and historic landmarks in ${location}.`,
      },
      summer: {
        highC: 28,
        lowC: 19,
        rainfallDays: 6,
        condition: `Warm and sunny in ${location} with extended daylight hours.`,
        packingList: [
          "Breathable light clothing",
          "Sunscreen and sunglasses",
          "Refillable water bottle",
        ],
        travelTips: `Take advantage of long daylight hours for evening walks and outdoor dining in ${location}.`,
      },
      winter: {
        highC: 7,
        lowC: 0,
        rainfallDays: 8,
        condition: `Cold winter temperatures in ${location} with occasional frost.`,
        packingList: ["Insulated winter jacket", "Warm scarf and gloves", "Thermal socks"],
        travelTips: `Fewer tourists and cozy indoor cultural experiences in ${location}.`,
      },
    };
    profile = baselines[seasonKey]!;
  }

  const highF = Math.round((profile.highC * 9) / 5 + 32);
  const lowF = Math.round((profile.lowC * 9) / 5 + 32);

  return {
    success: true,
    output: {
      location,
      source: "seasonal baseline (offline fallback)",
      seasonOrMonth: req.seasonOrMonth ?? seasonKey,
      detectedSeason: seasonKey,
      temperature: {
        highCelsius: profile.highC,
        lowCelsius: profile.lowC,
        highFahrenheit: highF,
        lowFahrenheit: lowF,
      },
      precipitation: {
        averageRainfallDays: profile.rainfallDays,
        rainLikelihood: profile.rainfallDays > 8 ? "Moderate to High" : "Low to Moderate",
      },
      conditionSummary: profile.condition,
      packingRecommendations: profile.packingList,
      travelTips: profile.travelTips,
    },
  };
}
