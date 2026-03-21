export type CommandName =
  | "auth:login"
  | "auth:logout"
  | "auth:refresh"
  // Player
  | "player:details"
  | "player:resources"
  | "ship:build"
  | "ship:move"
  | "ship:location"
  | "ship:next-level"
  | "ship:upgrade"
  | "tax:list"
  | "tax:pay"
  | "storage:next-level"
  | "storage:upgrade"
  | "marketplace:offers"
  | "marketplace:offer"
  | "marketplace:create-offer"
  | "marketplace:update-offer"
  | "marketplace:delete-offer"
  | "marketplace:purchase"
  | "theft:list"
  | "theft:attack"
  | "map:grid";

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
