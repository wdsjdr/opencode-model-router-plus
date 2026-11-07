import type { PluginLogger } from "./logger";
/**
 * Registration-path agent options.
 *
 * `src/index.ts` turns each tier of the active preset into an opencode agent
 * definition; this module owns the `options` bag on that definition. It is the
 * only place that knows how a tier's provider-agnostic `effort` maps onto the
 * provider-specific knob (`effort` for Anthropic, `reasoningEffort` for
 * OpenAI) and what to do when a tier asks for something the provider cannot do.
 *
 * The display-path builder in `src/commands/output.ts` renders what a tier is
 * configured with; this one decides what is actually sent. They are kept apart
 * on purpose: `/tiers` should not warn, downgrade or drop keys.
 */
import type {
  EffortKnob,
  EffortLevel,
  ProviderFamily,
  ProviderProfile,
  TierConfig,
} from "./config";
import { EFFORT_LEVELS } from "./config";
import { isAdaptiveOnlyClaudeModel, isClaudeModel } from "./protocol";

// ---------------------------------------------------------------------------
// Warn-once
// ---------------------------------------------------------------------------

// Agent registration runs on every `config` hook, so an unqualified
// console.warn would repeat the same line for the life of the session. Keys are
// deliberately tight (tier name + offending value where the value matters), so
// two different mistakes are still two different warnings.
const warnedAgentOptionsEffort = new Set<string>();

export function warnAgentOptionsEffortOnce(
  key: string,
  message: string,
  logger?: PluginLogger,
): void {
  if (warnedAgentOptionsEffort.has(key)) return;
  warnedAgentOptionsEffort.add(key);
  // Optional so this module keeps working for callers that have no client
  // (unit tests, and buildAgentOptions being called directly).
  if (logger) {
    logger.warn(message, { key });
    return;
  }
  console.warn(`[model-router] ${message}`);
}

export function resetAgentOptionsEffortWarnings(): void {
  warnedAgentOptionsEffort.clear();
}

function isEffortLevel(value: unknown): value is (typeof EFFORT_LEVELS)[number] {
  return typeof value === "string" && EFFORT_LEVELS.some((level) => level === value);
}

function isOpenAIModel(model: string): boolean {
  const s = model.toLowerCase();
  return s.startsWith("openai/") || /\bgpt-/.test(s) || /(^|[/\-_])o[134]([/\-_]|$)/.test(s);
}

/**
 * Provider profiles (see `RouterConfig.providers`). Keys may be a provider id
 * (`opencode-go`), a provider-plus-model-prefix (`opencode-go/kimi-`), or a full
 * model reference (`opencode-go/kimi-k2.7-code`), so a gateway serving several
 * upstream model families can be described per family.
 */
export type ProviderProfiles = Record<string, ProviderProfile> | undefined;

/** The part of a `provider/model` ref before the first `/`. */
export function providerIdOf(model: string): string | undefined {
  const i = model.indexOf("/");
  return i > 0 ? model.slice(0, i) : undefined;
}

/**
 * The `providers` key that applies to a full `provider/model` reference, or
 * undefined when nothing matches. First match wins:
 *
 *   1. a key equal to the full reference;
 *   2. the longest key containing `/` that prefixes the reference;
 *   3. a key equal to the provider id;
 *   4. no key (the caller falls back to the model-id heuristics).
 */
export function providerProfileKeyOf(
  model: string,
  providers: ProviderProfiles,
): string | undefined {
  if (providers === undefined) return undefined;

  // 1. The full reference, written out exactly.
  if (Object.hasOwn(providers, model)) return model;

  // 2. The longest `provider/prefix` that the reference starts with. Suffix
  // matching is a raw `startsWith`, so a key must spell the prefix exactly;
  // the slash requirement keeps step 3 from being shadowed by a bare id.
  let longest: string | undefined;
  for (const key of Object.keys(providers)) {
    if (!key.includes("/")) continue;
    if (!model.startsWith(key)) continue;
    if (longest === undefined || key.length > longest.length) longest = key;
  }
  if (longest !== undefined) return longest;

  // 3. The provider id alone.
  const providerId = providerIdOf(model);
  if (providerId !== undefined && Object.hasOwn(providers, providerId)) {
    return providerId;
  }
  return undefined;
}

interface ResolvedProvider {
  providerId: string | undefined;
  /** The `providers` key that matched, when the profile is declared. */
  profileKey: string | undefined;
  family: ProviderFamily;
  effortKnob: EffortKnob | null;
  maxEffort: EffortLevel | null;
  /** True when the profile came from `providers`, false for the heuristics. */
  declared: boolean;
}

/** Cap defaults per family, matching what the old id-guessing hardcoded. */
function defaultMaxEffort(family: ProviderFamily): EffortLevel | null {
  if (family === "anthropic") return "max";
  if (family === "openai") return "high";
  return null;
}

/**
 * The provider profile for a full `provider/model` reference: the matching
 * `providers` key (exact reference > longest `provider/prefix` > provider id)
 * when declared, otherwise today's model-id heuristics. Never warns — the
 * decision to warn belongs to {@link buildAgentOptions}, which knows whether
 * effort was asked for at all.
 */
export function resolveProvider(model: string, providers: ProviderProfiles): ResolvedProvider {
  const providerId = providerIdOf(model);
  const profileKey = providerProfileKeyOf(model, providers);
  const profile = profileKey !== undefined ? providers?.[profileKey] : undefined;
  if (profile !== undefined) {
    return {
      providerId,
      profileKey,
      family: profile.family,
      effortKnob: profile.effortKnob,
      maxEffort:
        profile.maxEffort !== undefined
          ? profile.maxEffort
          : defaultMaxEffort(profile.family),
      declared: true,
    };
  }
  const family: ProviderFamily = isClaudeModel(model)
    ? "anthropic"
    : isOpenAIModel(model)
      ? "openai"
      : "other";
  return {
    providerId,
    profileKey: undefined,
    family,
    effortKnob:
      family === "anthropic" ? "effort" : family === "openai" ? "reasoningEffort" : null,
    maxEffort: defaultMaxEffort(family),
    declared: false,
  };
}

export function effortRank(level: EffortLevel): number {
  return EFFORT_LEVELS.indexOf(level);
}

export function nextEffort(current: EffortLevel, bound: EffortLevel): EffortLevel | null {
  return effortRank(current) < effortRank(bound)
    ? EFFORT_LEVELS[effortRank(current) + 1]!
    : null;
}

export function minEffort(a: EffortLevel, b: EffortLevel): EffortLevel {
  return effortRank(a) <= effortRank(b) ? a : b;
}

export function effortCeilingFor(
  tier: TierConfig,
  providers?: ProviderProfiles,
): EffortLevel | null {
  if (tier.variant || tier.effort === undefined || !isEffortLevel(tier.effort)) return null;
  const provider = resolveProvider(tier.model, providers);
  if (provider.effortKnob === "effort") {
    if (Boolean(tier.thinking?.budgetTokens) && !isAdaptiveOnlyClaudeModel(tier.model)) return null;
    return provider.maxEffort;
  }
  if (provider.effortKnob === "reasoningEffort") {
    if (tier.reasoning?.effort) return null;
    return provider.maxEffort;
  }
  return null;
}

/**
 * Provider-specific agent options for a tier, as registered with opencode.
 *
 * Precedence, highest first: explicit `thinking` with a truthy `budgetTokens`
 * (Anthropic) or explicit `reasoning.effort` (OpenAI), then the
 * provider-agnostic `effort`. A `budgetTokens` of 0 asks for nothing and so
 * loses to `effort`, with a one-time notice per tier.
 *
 * Explicit fields are gated by model: a Claude model never receives
 * `reasoningEffort` / `reasoningSummary`, and an adaptive-only Claude model
 * (`isAdaptiveOnlyClaudeModel`) never receives `thinking` — the budget is
 * then ignored as if unset, so `effort` still applies. Each drop warns once
 * per tier. A key is
 * only ever present when something asked for it — an unset `effort` leaves no
 * trace in the returned object.
 *
 * Which wire key receives `effort` comes from the `providers` profile matching
 * the full model reference — an exact key, the longest `provider/prefix` key,
 * or the provider id, in that order — when the config declares one
 * (`effortKnob`, capped by `maxEffort`); only an undeclared model falls back to
 * the model-id heuristics, with a one-time warning naming the exact reference
 * and the key to declare.
 */
export function buildAgentOptions(
  tier: TierConfig,
  tierName = tier.model,
  logger?: PluginLogger,
  providers?: ProviderProfiles,
): Record<string, unknown> {
  const opts: Record<string, unknown> = {};

  // Anthropic thinking config. A zero budget asks for no extended thinking at
  // all, so it is neither emitted nor treated as an explicit thinking config
  // below — `hasThinkingBudget` is the single notion of "thinking was asked
  // for", shared by the emission and the effort precedence check.
  // An adaptive-only Claude model rejects a manual budget outright, so the
  // budget is dropped and — for the effort precedence below — treated as never
  // having been set, which lets a sibling `effort` through.
  const isClaude = isClaudeModel(tier.model);
  let hasThinkingBudget = Boolean(tier.thinking?.budgetTokens);
  if (hasThinkingBudget && isAdaptiveOnlyClaudeModel(tier.model)) {
    hasThinkingBudget = false;
    warnAgentOptionsEffortOnce(
      `thinking-adaptive-only:${tierName}`,
      `tier ${tierName}: model '${tier.model}' only accepts adaptive thinking and rejects a manual budget, so thinking.budgetTokens is ignored; use effort instead`,
      logger,
    );
  } else if (tier.thinking?.budgetTokens === 0) {
    warnAgentOptionsEffortOnce(
      `thinking-zero:${tierName}`,
      `tier ${tierName}: thinking.budgetTokens: 0 is ignored`,
      logger,
    );
  }

  // OpenAI reasoning config. Claude models have no such parameters, so they
  // are dropped there rather than sent to a provider that cannot read them.
  if (tier.reasoning && isClaude) {
    if (tier.reasoning.effort || tier.reasoning.summary) {
      warnAgentOptionsEffortOnce(
        `reasoning-claude:${tierName}`,
        `tier ${tierName}: reasoning.effort and reasoning.summary are OpenAI parameters and are ignored for Claude model '${tier.model}'; use effort instead`,
        logger,
      );
    }
  } else if (tier.reasoning) {
    if (tier.reasoning.effort) {
      opts.reasoningEffort = tier.reasoning.effort;
    }
  }

  const effort: unknown = tier.effort;
  if (effort !== undefined) {
    if (!isEffortLevel(effort)) {
      // Loading tiers.json rejects this, but an override layer or a
      // programmatic caller can still hand us junk. Ignore it rather than
      // failing registration for the whole preset.
      warnAgentOptionsEffortOnce(
        `invalid:${tierName}:${String(effort)}`,
        `tier ${tierName}: invalid effort '${String(effort)}' ignored`,
        logger,
      );
    } else {
      const provider = resolveProvider(tier.model, providers);
      const providerId = provider.providerId ?? tier.model;
      if (!provider.declared && provider.effortKnob === null) {
        // Today's heuristic already ignored this family; keep its message, now
        // naming the exact model reference that had no match and how to declare
        // the mapping.
        warnAgentOptionsEffortOnce(
          `unknown-provider:${tierName}:${tier.model}`,
          `tier ${tierName}: effort ignored for unknown provider family '${tier.model}' (provider '${providerId}'); declare providers.${providerId} or a prefix key like providers.'${providerId}/<prefix>-' to map it explicitly`,
          logger,
        );
      } else if (!provider.declared) {
        warnAgentOptionsEffortOnce(
          `provider-fallback:${tier.model}`,
          `provider '${providerId}' has no 'providers.${providerId}' profile for model '${tier.model}'; guessing the effort mapping from the model id — declare providers.${providerId} or a prefix key like providers.'${providerId}/<prefix>-' to make it explicit`,
          logger,
        );
      }
      if (provider.effortKnob === null) {
        // Declared `effortKnob: null` = effort is intentionally dropped for this
        // provider. Silence is the contract; the tier asked, the provider has no
        // such knob.
      } else if (provider.effortKnob === "effort") {
        if (hasThinkingBudget) {
          warnAgentOptionsEffortOnce(
            `anthropic-conflict:${tierName}`,
            `tier ${tierName}: both thinking and effort set; explicit thinking wins`,
            logger,
          );
        } else {
          opts.effort = effort;
        }
      } else if (tier.reasoning?.effort) {
        warnAgentOptionsEffortOnce(
          `openai-conflict:${tierName}`,
          `tier ${tierName}: both reasoning.effort and effort set; explicit reasoning wins`,
          logger,
        );
      } else if (
        provider.maxEffort !== null &&
        effortRank(effort) > effortRank(provider.maxEffort)
      ) {
        warnAgentOptionsEffortOnce(
          provider.family === "openai"
            ? `openai-downgrade:${tierName}:${effort}`
            : `effort-downgrade:${tierName}:${effort}`,
          provider.family === "openai"
            ? `tier ${tierName}: downgrading effort '${effort}' to '${provider.maxEffort}' because OpenAI reasoning_effort only supports low, medium, or high`
            : `tier ${tierName}: downgrading effort '${effort}' to '${provider.maxEffort}' because provider '${providerId}' caps effort there`,
          logger,
        );
        opts.reasoningEffort = provider.maxEffort;
      } else {
        opts.reasoningEffort = effort;
      }
    }
  }

  // Preserve the v2.0.0 bridge's insertion order: ordinary options, then
  // reasoningEffort, reasoningSummary, thinking. Only emission moves; the
  // family checks, warning order and explicit-config precedence stay intact.
  if (!isClaude && tier.reasoning?.summary) {
    opts.reasoningSummary = tier.reasoning.summary;
  }
  if (hasThinkingBudget) {
    opts.thinking = { type: "enabled", budgetTokens: tier.thinking?.budgetTokens };
  }
  return opts;
}
