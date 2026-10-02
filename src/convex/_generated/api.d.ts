/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authCheck from "../authCheck.js";
import type * as householdAccess from "../householdAccess.js";
import type * as householdIdentity from "../householdIdentity.js";
import type * as householdLifecycle from "../householdLifecycle.js";
import type * as householdMembers from "../householdMembers.js";
import type * as householdOwner from "../householdOwner.js";
import type * as householdSkips from "../householdSkips.js";
import type * as http from "../http.js";
import type * as importAlerts from "../importAlerts.js";
import type * as meals from "../meals.js";
import type * as pantry from "../pantry.js";
import type * as plans from "../plans.js";
import type * as recipeImport from "../recipeImport.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as shopping from "../shopping.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authCheck: typeof authCheck;
  householdAccess: typeof householdAccess;
  householdIdentity: typeof householdIdentity;
  householdLifecycle: typeof householdLifecycle;
  householdMembers: typeof householdMembers;
  householdOwner: typeof householdOwner;
  householdSkips: typeof householdSkips;
  http: typeof http;
  importAlerts: typeof importAlerts;
  meals: typeof meals;
  pantry: typeof pantry;
  plans: typeof plans;
  recipeImport: typeof recipeImport;
  recipes: typeof recipes;
  seed: typeof seed;
  shopping: typeof shopping;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
