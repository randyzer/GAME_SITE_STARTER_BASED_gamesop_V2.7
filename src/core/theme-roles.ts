import type { GameConfig } from "../config/schema";

export type ResolvedVisualRoles = Readonly<NonNullable<GameConfig["visualRoles"]>>;

export const DEFAULT_VISUAL_ROLES: ResolvedVisualRoles = Object.freeze({
  font: "editorial",
  density: "comfortable",
  shape: "square",
  state: "lifted",
});

export function resolveVisualRoles(
  visualRoles: GameConfig["visualRoles"],
): ResolvedVisualRoles {
  if (visualRoles === undefined) return DEFAULT_VISUAL_ROLES;
  return Object.freeze({
    font: visualRoles.font,
    density: visualRoles.density,
    shape: visualRoles.shape,
    state: visualRoles.state,
  });
}
