import { apiInitializer } from "discourse/lib/api";

/**
 * Theme component: "Custom Flag Display".
 *
 * Purely client-side. When the flag modal opens, some flag types can be
 * removed from the list ("subtractive" only - nothing is ever added):
 *
 *   - `own_posts_hidden_flag_types`   -> used when flagging your own post
 *   - `other_posts_hidden_flag_types` -> used when flagging somebody else's post
 *
 * Both settings are empty by default, so out of the box the modal is untouched.
 * Hiding a flag here only removes it from the modal: it does not change any
 * server-side permission, so a hidden flag still exists (and can still be
 * submitted by other clients/API).
 */

const OWN_POSTS_SETTING = "own_posts_hidden_flag_types";
const OTHER_POSTS_SETTING = "other_posts_hidden_flag_types";

const SETTING_SEPARATOR = "|";
const CUSTOM_FLAG_KEY_PREFIX = "custom_";

const THEME_SETTINGS_MODEL = "discourse/admin/models/theme-settings";

// Flag types every Discourse site has. They are offered as ready-made choices
// in the two settings so admins do not have to type them by hand. Custom flag
// identifiers/names can still be typed in.
const BUILT_IN_FLAG_KEYS = Object.freeze([
  "spam",
  "off_topic",
  "inappropriate",
  "notify_user",
  "notify_moderators",
  "illegal",
]);

const SETTINGS_WITH_BUILT_IN_CHOICES = new Set([
  OWN_POSTS_SETTING,
  OTHER_POSTS_SETTING,
]);

// `choices` values that may have been provided by other sources (e.g. a future
// core version serializing list choices), merged with the built-in ones.
const configuredChoices = new WeakMap();

function lookupAdminModuleDefault(moduleName) {
  try {
    return window.moduleBroker?.lookup?.(moduleName, true)?.default;
  } catch {
    return undefined;
  }
}

/**
 * Theme `list` settings cannot declare `choices` in settings.yml (only `enum`
 * settings can), and the theme settings editor will not offer any predefined
 * value for them. To avoid making admins type the built-in flag keys, they are
 * injected into the admin theme settings model, which is what the editor reads
 * `choices` from.
 *
 * This only changes the admin UI. The stored value is still a plain
 * `|`-separated list and typing a custom flag identifier/name keeps working.
 * If the admin model is not available (e.g. non-staff users), nothing happens.
 */
function installBuiltInFlagChoices() {
  const prototype = lookupAdminModuleDefault(THEME_SETTINGS_MODEL)?.prototype;

  if (
    !prototype ||
    Object.prototype.hasOwnProperty.call(prototype, "choices")
  ) {
    return;
  }

  try {
    Object.defineProperty(prototype, "choices", {
      configurable: true,
      get() {
        const configured = configuredChoices.get(this);

        if (!SETTINGS_WITH_BUILT_IN_CHOICES.has(this.setting)) {
          return configured;
        }

        const choices = [...BUILT_IN_FLAG_KEYS];

        for (const choice of configured ?? []) {
          if (!choices.includes(choice)) {
            choices.push(choice);
          }
        }

        return choices;
      },
      set(value) {
        configuredChoices.set(this, value);
      },
    });
  } catch {
    // Never break the flag filtering because this optional UI enhancement
    // could not be installed.
  }
}

/**
 * Reads a `list` theme setting. Theme list settings are usually shipped to the
 * client as a `|`-separated string, but object/array shaped values are handled
 * as well so the component keeps working if that representation changes.
 *
 * @param {string} settingName
 * @returns {string[]}
 */
function entriesForSetting(settingName) {
  const value = settings?.[settingName];

  if (Array.isArray(value)) {
    return value;
  }

  return String(value ?? "").split(SETTING_SEPARATOR);
}

/**
 * @param {boolean} isOwnPost
 * @returns {Set<string>} normalized flag identifiers configured by the admin
 */
function hiddenTokensFor(isOwnPost) {
  const settingName = isOwnPost ? OWN_POSTS_SETTING : OTHER_POSTS_SETTING;

  return new Set(
    entriesForSetting(settingName)
      .map((entry) => String(entry).trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * The identifiers an admin can reasonably type for a flag:
 *
 *   - `name_key`                     e.g. `spam`, `off_topic`, `custom_vote`
 *   - `name_key` without `custom_`   e.g. `vote` for `custom_vote`
 *   - the flag's displayed name      e.g. a custom flag named "Vote" or "投票"
 *
 * `name_key` is stable; the displayed name is matched as a convenience because
 * the admin UI shows flag names but not their keys.
 *
 * @param {object} flag
 * @returns {Set<string>}
 */
function tokensForFlag(flag) {
  const tokens = new Set();

  const key = String(flag?.name_key ?? "").trim().toLowerCase();
  if (key) {
    tokens.add(key);

    if (key.startsWith(CUSTOM_FLAG_KEY_PREFIX)) {
      tokens.add(key.slice(CUSTOM_FLAG_KEY_PREFIX.length));
    }
  }

  const name = String(flag?.name ?? "").trim().toLowerCase();
  if (name) {
    tokens.add(name);
  }

  return tokens;
}

/**
 * @param {object} flagModel the flagged Post/Topic (whatever the flag target gets)
 * @returns {string|number|null} the author of the flagged content, when known
 */
function authorIdFor(flagModel) {
  const id = flagModel?.user_id ?? flagModel?.user?.id;
  return id === undefined || id === null ? null : id;
}

/**
 * These settings are about posts, so only apply them where the flag target is a
 * post or a topic. Other flag targets (chat messages, voice rooms, ...) keep
 * their full list of flags.
 *
 * @param {object} flagTarget
 * @param {object} flagModel
 * @returns {boolean}
 */
function targetsPostOrTopic(flagTarget, flagModel) {
  if (!flagTarget || !flagModel) {
    return false;
  }

  if (
    typeof flagTarget.targetsTopic === "function" &&
    flagTarget.targetsTopic()
  ) {
    return true;
  }

  return flagModel.post_number !== undefined;
}

/**
 * @param {Array} flags flags offered by the flag modal
 * @param {object} flagTarget
 * @param {object} flagModel
 * @param {object|null} currentUser
 * @returns {Array} flags minus the ones configured to be hidden
 */
function withoutHiddenFlags(flags, flagTarget, flagModel, currentUser) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return flags;
  }

  if (!targetsPostOrTopic(flagTarget, flagModel)) {
    return flags;
  }

  const authorId = authorIdFor(flagModel);
  const currentUserId = currentUser?.id ?? null;

  // If ownership cannot be determined, leave the flag list untouched.
  if (authorId === null || currentUserId === null) {
    return flags;
  }

  const hiddenTokens = hiddenTokensFor(
    String(authorId) === String(currentUserId)
  );

  if (hiddenTokens.size === 0) {
    return flags;
  }

  return flags.filter((flag) => {
    for (const token of tokensForFlag(flag)) {
      if (hiddenTokens.has(token)) {
        return false;
      }
    }

    return true;
  });
}

export default apiInitializer((api) => {
  api.modifyClass("component:modal/flag", (Superclass) =>
    class extends Superclass {
      get flagsAvailable() {
        const flags = super.flagsAvailable;
        const { flagTarget, flagModel } = this.args.model ?? {};

        return withoutHiddenFlags(
          flags,
          flagTarget,
          flagModel,
          this.currentUser
        );
      }
    }
  );

  installBuiltInFlagChoices();
});
