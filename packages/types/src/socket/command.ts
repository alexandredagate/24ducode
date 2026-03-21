export type CommandName =
  // Auth
  | "auth:login"
  | "auth:logout"
  // Player
  | "player:details"
  | "player:resources"
  // Ship
  | "ship:build"
  | "ship:move";

export interface ClientCommand<T = unknown> {
  command: CommandName;
  payload?: T;
}

export interface ServerResponse<T = unknown> {
  command: CommandName;
  status: "ok" | "error";
  data?: T;
  error?: string;
}
