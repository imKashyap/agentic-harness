import { z } from "zod";

import type { ToolContext, ToolResult } from "../../src/capabilities/tools/tool.js";

export const GetWeatherInputSchema = z.object({
  location: z
    .string({ message: "Parameter 'location' is required for get_weather" })
    .trim()
    .min(1, "Parameter 'location' is required for get_weather"),
});

export type GetWeatherInput = z.infer<typeof GetWeatherInputSchema>;

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

/**
 * Fetch real-time weather from Open-Meteo (open-meteo.com)
 * Uses Geocoding API + Forecast API with zero API key required.
 */
async function fetchOpenMeteoWeather(location: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
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
  const parsed = GetWeatherInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      output: null,
      error: parsed.error.issues[0]?.message ?? "Parameter 'location' is required for get_weather",
    };
  }

  const { location } = parsed.data;

  const weather = await fetchOpenMeteoWeather(location);
  if (!weather) {
    return {
      success: false,
      output: null,
      error: `Unable to retrieve live weather for '${location}' from Open-Meteo. Check the location and try again later.`,
    };
  }

  return {
    success: true,
    output: weather,
  };
}
