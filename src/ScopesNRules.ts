export type Rule = ApplicationRule | WindowRule | OtherRule | Scope;
export type Scope = ApplicationScope | WindowScope | OtherScope;

/**
 * A rule targeting an application (or set of applications) by UUID.
 */
export interface ApplicationRule {
  level: "application";
  uuid: string | RegEx;
}
/**
 * JSON representation of a regular expression.
 */
export interface RegEx {
  expression: string;
  flags?: string;
  invert?: boolean;
}
/**
 * A rule targeting a window (or set of windows) by UUID-Name pair.
 */
export interface WindowRule {
  level: "window";
  uuid: string | RegEx;
  name: string | RegEx;
}
export interface OtherRule {
  level: "service" | "desktop";
}
/**
 * A scope targeting a specific OpenFin application and all of its windows
 */
export interface ApplicationScope {
  level: "application";
  uuid: string;
}
/**
 * A scope targeting a specific OpenFin window
 */
export interface WindowScope {
  level: "window";
  uuid: string;
  name: string;
}
/**
 * A scope for all levels with no extra data required (e.g. desktop-level configuration)
 */
export interface OtherScope {
  level: "service" | "desktop";
}
