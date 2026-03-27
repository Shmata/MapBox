import { BaseComponentContext } from "@microsoft/sp-component-base";

export interface IMapProps {
  context?: BaseComponentContext;
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
  caption?: string;
}
