import type { RouterConfig } from "./config";

// ---------------------------------------------------------------------------
// Professional branches: the capability axis (plan: animator/eyes/ears)
//
// Cost tiers (fast/medium/heavy) answer "how expensive is this". Branches answer
// "what you cannot do yourself" — vision, audio, motion. They are ordinary
// preset tiers (so the plugin registers them as subagents automatically) plus
// this small declarative table that tells the orchestrator when to use them.
// Branches never take part in cost auto-routing.
// ---------------------------------------------------------------------------

export interface BranchConfig {
  /** Tier key in the active preset. */
  tier: string;
  /** Capability the branch supplies, e.g. "frontend" | "vision" | "audio" | "ocr". */
  capability: string;
  /** When the orchestrator MUST dispatch here. */
  trigger: string;
  /**
   * Required reply contract. A string renders inline; an array renders as an
   * ordered checklist, which is how multi-section audits (facts / quotes /
   * problems / fixes / missing) stay explicit instead of collapsing to one line.
   */
  returns: string | string[];
  /** Per-turn dispatch cap. */
  cap?: number;
  readOnly?: boolean;
  /** Tier(s) to try if the branch model is unavailable. */
  fallback?: string;
}

/** Capabilities whose absence forces a preflight dispatch before any planning. */
const PREFLIGHT_CAPABILITIES: ReadonlySet<string> = new Set(["vision", "audio"]);

const DEFAULT_TRIGGER = "the task needs a capability you do not have yourself";
const DEFAULT_RETURNS = "conclusions + files changed + anything unresolved";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`tiers.json: '${field}' must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`tiers.json: '${field}' must be a string`);
  }
  return value;
}

/** Reply contract: a single string, or an ordered list of sections. */
function parseReturns(value: unknown, field: string): string | string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`tiers.json: '${field}' must not be an empty array`);
    }
    return value.map((item, i) => requireNonEmptyString(item, `${field}[${i}]`));
  }
  return optionalString(value, field);
}

/**
 * Validate the top-level `branches` object. Absent (or null) ⇒ undefined; a
 * present object is validated entry by entry so a typo fails loudly at load
 * time rather than producing a half-working capability menu.
 */
export function parseBranches(raw: unknown): Record<string, BranchConfig> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) {
    throw new Error("tiers.json: 'branches' must be an object");
  }

  const out: Record<string, BranchConfig> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      throw new Error(`tiers.json: 'branches.${name}' must be an object`);
    }
    const branch: BranchConfig = {
      tier: requireNonEmptyString(value.tier, `branches.${name}.tier`),
      capability: requireNonEmptyString(value.capability, `branches.${name}.capability`),
      trigger: optionalString(value.trigger, `branches.${name}.trigger`) ?? "",
      returns: parseReturns(value.returns, `branches.${name}.returns`) ?? "",
    };
    if (value.cap !== undefined) {
      if (typeof value.cap !== "number" || !Number.isFinite(value.cap) || value.cap < 0) {
        throw new Error(`tiers.json: 'branches.${name}.cap' must be a non-negative number`);
      }
      branch.cap = value.cap;
    }
    if (value.readOnly !== undefined) {
      if (typeof value.readOnly !== "boolean") {
        throw new Error(`tiers.json: 'branches.${name}.readOnly' must be a boolean`);
      }
      branch.readOnly = value.readOnly;
    }
    const fallback = optionalString(value.fallback, `branches.${name}.fallback`);
    if (fallback !== undefined) branch.fallback = fallback;
    out[name] = branch;
  }
  return out;
}

/** Cost-tier names of the active preset, branch tiers excluded (defaults to the shipped three). */
function costTierNames(cfg: RouterConfig, branches: Record<string, BranchConfig>): string {
  const preset = cfg.presets?.[cfg.activePreset];
  const names = preset ? Object.keys(preset).filter((name) => !(name in branches)) : [];
  return names.length > 0 ? names.join("/") : "fast/medium/heavy";
}

/**
 * The "Professional Branches" system-prompt section, or null when the config
 * declares no branches. Compact on purpose: it ships in every request.
 */
export function buildBranchesProtocol(cfg: RouterConfig): string | null {
  const branches = cfg.branches;
  if (!branches) return null;
  const entries = Object.entries(branches);
  if (entries.length === 0) return null;

  const tierNames = costTierNames(cfg, branches);
  const lines: string[] = [
    "## Professional Branches (capability axis)",
    "",
    `Cost tiers (${tierNames}) answer "how expensive is this"; branches answer "what you cannot do yourself". Branches never participate in cost auto-routing — dispatch them by name or by the triggers below.`,
    "",
  ];

  for (const [name, branch] of entries) {
    const trigger = branch.trigger || DEFAULT_TRIGGER;
    const cap = branch.cap != null ? `Cap: ${branch.cap}/turn.` : "";
    const failure = branch.fallback
      ? `If it fails on quota/variant/model unavailable: ${branch.fallback} once, then report.`
      : "";
    const tail = [cap, failure].filter(Boolean).join(" ");
    const head = `- @${name} [${branch.capability}] — Dispatch when: ${trigger}`;

    if (Array.isArray(branch.returns)) {
      lines.push(head, `  Reply with every section below, in order:`);
      for (const section of branch.returns) lines.push(`  - ${section}`);
      if (tail) lines.push(`  ${tail}`);
    } else {
      const contract = branch.returns || DEFAULT_RETURNS;
      lines.push(`${head} Reply contract: ${contract}.${tail ? ` ${tail}` : ""}`);
    }
  }

  const needsPreflight = entries.some(([, branch]) =>
    PREFLIGHT_CAPABILITIES.has(branch.capability),
  );
  if (needsPreflight) {
    lines.push(
      "",
      `CAPABILITY PREFLIGHT (MANDATORY): if the task involves images, screenshots, PDFs, video or audio and you are a text-only model, dispatch the vision/audio branch FIRST with absolute paths, before choosing an implementation path. Never infer media content from filenames, dimensions, or the user's description.`,
      `Report contracts are binding: a media branch must state what it actually observed (with frame/page numbers), what differs from the goal, and what is missing — "not seen" is a valid answer, guessing is not. An implementation branch must self-verify (build + screenshot + read its own screenshot) and return conclusions + changed files + residual issues, not a code essay.`,
    );
  }

  return lines.join("\n");
}
