import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ToolContext } from "../../src/capabilities/tools/tool.js";
import { execute as executeCalculateTripBudget } from "../../tools/calculate_trip_budget/handler.js";
import { execute as executeGetWeather } from "../../tools/get_weather/handler.js";
import { execute as executeSearchPlaces } from "../../tools/search_places/handler.js";

const mockContext: ToolContext = {
  runId: "test-run-123",
  agentId: "travel-planner",
};

describe("Travel Tools Handlers", () => {
  describe("search_places", () => {
    it("returns curated places for known destinations like Kyoto", async () => {
      const result = await executeSearchPlaces({ location: "Kyoto", limit: 5 }, mockContext);
      assert.equal(result.success, true);

      const output = result.output as {
        location: string;
        places: Array<{ name: string; category: string; rating: number }>;
      };
      assert.equal(output.location, "Kyoto");
      assert.ok(output.places.length > 0);
      assert.ok(output.places.some((p) => p.name.includes("Fushimi Inari")));
    });

    it("filters places by category (e.g. restaurant)", async () => {
      const result = await executeSearchPlaces(
        { location: "Tokyo", category: "restaurant" },
        mockContext,
      );
      assert.equal(result.success, true);

      const output = result.output as {
        places: Array<{ category: string }>;
      };
      assert.ok(output.places.length > 0);
      assert.ok(output.places.every((p) => p.category === "restaurant"));
    });

    it("generates deterministic fallback places for unlisted worldwide destinations", async () => {
      const result = await executeSearchPlaces({ location: "Zurich" }, mockContext);
      assert.equal(result.success, true);

      const output = result.output as {
        places: Array<{ name: string }>;
      };
      assert.ok(output.places.length > 0);
      assert.ok(output.places.some((p) => p.name.includes("Zurich")));
    });

    it("returns an error if location is missing", async () => {
      const result = await executeSearchPlaces({}, mockContext);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("location"));
    });
  });

  describe("get_weather", () => {
    it("returns live weather data from Open-Meteo", async () => {
      const originalFetch = globalThis.fetch;
      const requestedUrls: string[] = [];
      globalThis.fetch = async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.startsWith("https://geocoding-api.open-meteo.com/")) {
          return Response.json({
            results: [
              {
                name: "Kyoto",
                country: "Japan",
                latitude: 35.01,
                longitude: 135.77,
                timezone: "Asia/Tokyo",
              },
            ],
          });
        }

        return Response.json({
          current: {
            temperature_2m: 18,
            relative_humidity_2m: 62,
            weather_code: 2,
          },
          daily: {
            temperature_2m_max: [20, 22],
            temperature_2m_min: [12, 14],
            precipitation_probability_max: [10, 30],
            weather_code: [2, 1],
          },
        });
      };

      try {
        const result = await executeGetWeather({ location: "Kyoto" }, mockContext);
        assert.equal(result.success, true);

        const output = result.output as {
          source: string;
          current: { temperatureCelsius: number; condition: string };
          temperature: { highCelsius: number; lowCelsius: number; highFahrenheit: number };
          packingRecommendations: string[];
        };
        assert.equal(output.source, "open-meteo.com (live forecast)");
        assert.equal(output.current.temperatureCelsius, 18);
        assert.equal(output.current.condition, "Partly cloudy");
        assert.equal(output.temperature.highCelsius, 22);
        assert.equal(output.temperature.lowCelsius, 12);
        assert.equal(output.temperature.highFahrenheit, 72);
        assert.ok(output.packingRecommendations.length > 0);
        assert.equal(requestedUrls.length, 2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns an error when Open-Meteo is unavailable instead of using estimates", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network unavailable");
      };

      try {
        const result = await executeGetWeather({ location: "Kyoto" }, mockContext);
        assert.equal(result.success, false);
        assert.equal(result.output, null);
        assert.match(result.error ?? "", /Unable to retrieve live weather/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("returns an error if location is missing", async () => {
      const result = await executeGetWeather({}, mockContext);
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("location"));
    });
  });

  describe("calculate_trip_budget", () => {
    it("calculates accurate itemized budget for a 5-day moderate trip for 2 travelers", async () => {
      const result = await executeCalculateTripBudget(
        {
          destination: "Kyoto",
          durationDays: 5,
          travelersCount: 2,
          travelStyle: "moderate",
          includeFlights: false,
        },
        mockContext,
      );
      assert.equal(result.success, true);

      const output = result.output as {
        currency: string;
        breakdown: {
          lodging: { ratePerNight: number; roomsCount: number; total: number };
          dining: { total: number };
          contingencyBuffer: { total: number };
        };
        summary: { totalEstimatedCost: number; costPerPerson: number };
      };

      assert.equal(output.currency, "USD");
      // 1 room for 2 travelers @ $190/night for 5 nights = $950
      assert.equal(output.breakdown.lodging.roomsCount, 1);
      assert.equal(output.breakdown.lodging.total, 950);
      // 2 travelers @ $85/day for 5 days = $850
      assert.equal(output.breakdown.dining.total, 850);
      // Includes 15% buffer
      assert.ok(output.breakdown.contingencyBuffer.total > 0);
      assert.ok(output.summary.totalEstimatedCost > 0);
      assert.equal(output.summary.costPerPerson, Math.round(output.summary.totalEstimatedCost / 2));
    });

    it("includes flight costs when includeFlights is true", async () => {
      const resultWithFlights = await executeCalculateTripBudget(
        {
          destination: "Tokyo",
          durationDays: 7,
          travelersCount: 1,
          travelStyle: "budget",
          includeFlights: true,
        },
        mockContext,
      );
      const resultWithoutFlights = await executeCalculateTripBudget(
        {
          destination: "Tokyo",
          durationDays: 7,
          travelersCount: 1,
          travelStyle: "budget",
          includeFlights: false,
        },
        mockContext,
      );

      const costWith = (resultWithFlights.output as { summary: { totalEstimatedCost: number } })
        .summary.totalEstimatedCost;
      const costWithout = (
        resultWithoutFlights.output as { summary: { totalEstimatedCost: number } }
      ).summary.totalEstimatedCost;

      assert.ok(costWith > costWithout, "Cost with flights should exceed cost without flights");
    });

    it("returns error on missing required parameters", async () => {
      const result = await executeCalculateTripBudget(
        { destination: "Paris" } as unknown as {
          destination: string;
          durationDays: number;
          travelStyle: "budget";
        },
        mockContext,
      );
      assert.equal(result.success, false);
      assert.ok(result.error?.includes("durationDays"));
    });
  });
});
