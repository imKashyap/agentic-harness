/**
 * Progressive message generator: formats human-friendly, conversational progress updates
 * during tool execution, sub-agent delegation, and task planning.
 */
export function formatProgressMessage(
  capability: string,
  input?: unknown,
  customMessage?: string | ((input: unknown) => string),
): string {
  if (customMessage) {
    if (typeof customMessage === "function") {
      try {
        const result = customMessage(input);
        if (result && result.trim().length > 0) return result.trim();
      } catch {
        // Fallback to default formatting if custom function throws
      }
    } else if (typeof customMessage === "string" && customMessage.trim().length > 0) {
      let interpolated = customMessage.trim();
      if (input && typeof input === "object") {
        for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
          if (typeof val === "string" || typeof val === "number") {
            interpolated = interpolated.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
          }
        }
      }
      return interpolated;
    }
  }

  const rawId = capability.replace(/^(tool|agent)\./, "");
  const inputObj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  // Travel Tools & Agents
  if (rawId === "search_places") {
    if (typeof inputObj.location === "string" && inputObj.location.trim().length > 0) {
      return `Searching places in ${inputObj.location.trim()}...`;
    }
    return `Searching places...`;
  }

  if (rawId === "get_weather") {
    if (typeof inputObj.location === "string" && inputObj.location.trim().length > 0) {
      return `Checking weather in ${inputObj.location.trim()}...`;
    }
    return `Checking weather conditions...`;
  }

  if (rawId === "calculate_trip_budget") {
    if (typeof inputObj.destination === "string" && inputObj.destination.trim().length > 0) {
      return `Calculating trip budget for ${inputObj.destination.trim()}...`;
    }
    return `Calculating trip budget...`;
  }

  if (rawId === "travel-planner") {
    const task =
      typeof inputObj.task === "string"
        ? inputObj.task
        : typeof inputObj.message === "string"
          ? inputObj.message
          : "";
    if (task && task.length < 50) {
      return `Consulting Travel Planner on "${task}"...`;
    }
    return `Consulting Travel Planner...`;
  }

  if (rawId === "destination-researcher") {
    return `Researching destination details...`;
  }

  // Sub-agent delegation
  if (capability.startsWith("agent.") || capability.startsWith("subagent.")) {
    const task =
      typeof inputObj.task === "string"
        ? inputObj.task
        : typeof inputObj.message === "string"
          ? inputObj.message
          : "";
    if (task && task.length < 50) {
      return `Consulting specialist agent '${rawId}' on "${task}"...`;
    }
    return `Consulting specialist agent '${rawId}'...`;
  }

  // GitHub
  if (rawId.startsWith("github")) {
    if (typeof inputObj.action === "string") {
      return `GitHub: ${inputObj.action}...`;
    }
    if (typeof inputObj.query === "string" || typeof inputObj.repo === "string") {
      return `Querying GitHub repository (${inputObj.repo ?? inputObj.query})...`;
    }
    return `Interacting with GitHub...`;
  }

  // Slack
  if (rawId.startsWith("slack")) {
    if (typeof inputObj.channel === "string") {
      return `Posting message to Slack #${inputObj.channel}...`;
    }
    return `Sending Slack notification...`;
  }

  // Jira
  if (rawId.startsWith("jira")) {
    if (typeof inputObj.issueKey === "string") {
      return `Fetching Jira issue ${inputObj.issueKey}...`;
    }
    return `Querying Jira...`;
  }

  // Search
  if (rawId.includes("search")) {
    if (typeof inputObj.query === "string" && inputObj.query.trim().length > 0) {
      return `Searching for "${inputObj.query}"...`;
    }
    return `Searching knowledge sources...`;
  }

  // Generic formatting: convert camelCase or snake_case to readable words
  const humanized = rawId
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();

  return `Running ${humanized}...`;
}
