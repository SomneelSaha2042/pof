import * as React from "react";
import type { SVGProps } from "react";

export const furious5IconNames = [
  "create-room",
  "join-room",
  "room-code",
  "start-game",
  "deck",
  "draw-card",
  "drop-card",
  "combo-pair",
  "combo-straight",
  "call-five",
  "showdown",
  "timer",
  "table-felt",
  "chip-stack",
  "player-hand",
  "reconnect",
  "socket-live",
  "lobby",
  "theme-toggle",
  "settings"
] as const;
export type Furious5IconName = typeof furious5IconNames[number];
type Furious5IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: Furious5IconName;
  title?: string;
};
type Furious5IconOnlyProps = Omit<SVGProps<SVGSVGElement>, "name">;

const paths: Record<Furious5IconName, string> = {
  "create-room": ("<rect x=\"4\" y=\"5\" width=\"11\" height=\"14\" rx=\"2\"/><path d=\"M15 8h2a3 3 0 0 1 3 3v1\"/><path d=\"M18 15v6\"/><path d=\"M15 18h6\"/><path d=\"M8 9h3\"/><path d=\"M8 13h3\"/>"),
  "join-room": ("<path d=\"M9 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z\"/><path d=\"M2.5 21a6.8 6.8 0 0 1 13 0\"/><path d=\"M15 8h3.5l-1.6-1.8\"/><path d=\"M18.5 8l-1.6 1.8\"/><path d=\"M15 14h3.5l-1.6 1.8\"/><path d=\"M18.5 14l-1.6-1.8\"/>"),
  "room-code": ("<path d=\"M5 5h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 1 2-2Z\"/><path d=\"M9 9h6\"/><path d=\"M9 15h6\"/><path d=\"M17 8v8\"/>"),
  "start-game": ("<rect x=\"3\" y=\"6\" width=\"11\" height=\"15\" rx=\"2\" transform=\"rotate(-7 3 6)\"/><rect x=\"10\" y=\"3\" width=\"11\" height=\"15\" rx=\"2\" transform=\"rotate(8 10 3)\"/><path d=\"M10 10.5v6l5-3Z\" fill=\"currentColor\" stroke=\"none\"/>"),
  "deck": ("<rect x=\"6\" y=\"4\" width=\"12\" height=\"16\" rx=\"2\"/><path d=\"M8 2h10a2 2 0 0 1 2 2v12\"/><path d=\"M4 8v10a2 2 0 0 0 2 2h10\"/><path d=\"M10 8h4\"/><path d=\"M10 12h4\"/>"),
  "draw-card": ("<rect x=\"5\" y=\"3\" width=\"12\" height=\"16\" rx=\"2\"/><path d=\"M19 8v9a3 3 0 0 1-3 3h-4\"/><path d=\"M12 20l2-2\"/><path d=\"M12 20l2 2\"/><path d=\"M9 7h4\"/><path d=\"M9 11h4\"/>"),
  "drop-card": ("<rect x=\"6\" y=\"3\" width=\"12\" height=\"15\" rx=\"2\"/><path d=\"M12 8v10\"/><path d=\"M9 15l3 3 3-3\"/><path d=\"M4 21h16\"/>"),
  "combo-pair": ("<rect x=\"4\" y=\"7\" width=\"10\" height=\"14\" rx=\"2\" transform=\"rotate(-8 4 7)\"/><rect x=\"10\" y=\"3\" width=\"10\" height=\"14\" rx=\"2\" transform=\"rotate(8 10 3)\"/><path d=\"M8 12h3\"/><path d=\"M14 8h3\"/>"),
  "combo-straight": ("<rect x=\"3\" y=\"10\" width=\"7\" height=\"10\" rx=\"1.5\"/><rect x=\"9\" y=\"7\" width=\"7\" height=\"10\" rx=\"1.5\"/><rect x=\"15\" y=\"4\" width=\"7\" height=\"10\" rx=\"1.5\"/><path d=\"M5 14h3M11 11h3M17 8h3\"/>"),
  "call-five": ("<path d=\"M7 12V5a2 2 0 0 1 4 0v5\"/><path d=\"M11 11V4a2 2 0 0 1 4 0v8\"/><path d=\"M15 13V7a2 2 0 0 1 4 0v8\"/><path d=\"M7 12 5.8 9.5a2 2 0 0 0-3.6 1.7L5.5 18A6 6 0 0 0 11 21h2a6 6 0 0 0 6-6\"/><path d=\"M9 17h4.7a1.8 1.8 0 0 0 0-3.6H11\"/>"),
  "showdown": ("<path d=\"M12 2l1.6 4.1L18 4.8l-1.8 4.1 4 2.1-4.3 1.2 1 4.3-3.6-2.5-3.6 2.5 1-4.3L6.4 11l4-2.1L8.6 4.8l4.4 1.3Z\"/><path d=\"M4 17l5 4\"/><path d=\"M20 17l-5 4\"/>"),
  "timer": ("<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M9 2h6\"/><path d=\"M12 5V3\"/><path d=\"M12 13l3-3\"/><path d=\"M12 13h-4\"/>"),
  "table-felt": ("<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"7\"/><ellipse cx=\"12\" cy=\"12\" rx=\"6\" ry=\"3.2\"/><path d=\"M6 9c3 2 9 2 12 0\"/><path d=\"M6 15c3-2 9-2 12 0\"/>"),
  "chip-stack": ("<ellipse cx=\"12\" cy=\"6\" rx=\"7\" ry=\"3\"/><path d=\"M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6\"/><path d=\"M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3\"/><path d=\"M9 6h6\"/>"),
  "player-hand": ("<path d=\"M3 18c2.2-3.5 5.2-5.2 9-5.2s6.8 1.7 9 5.2\"/><rect x=\"5\" y=\"4\" width=\"5\" height=\"8\" rx=\"1.2\" transform=\"rotate(-15 5 4)\"/><rect x=\"10\" y=\"3\" width=\"5\" height=\"8\" rx=\"1.2\"/><rect x=\"15\" y=\"4\" width=\"5\" height=\"8\" rx=\"1.2\" transform=\"rotate(15 15 4)\"/>"),
  "reconnect": ("<path d=\"M20 12a8 8 0 0 0-14-5\"/><path d=\"M4 12a8 8 0 0 0 14 5\"/><path d=\"M6 3v4h4\"/><path d=\"M18 21v-4h-4\"/><circle cx=\"12\" cy=\"12\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/>"),
  "socket-live": ("<path d=\"M7 7h10v5a5 5 0 0 1-10 0Z\"/><path d=\"M9 3v4\"/><path d=\"M15 3v4\"/><path d=\"M12 17v4\"/><path d=\"M17.5 17.5 20 20\"/><path d=\"M6.5 17.5 4 20\"/>"),
  "lobby": ("<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 8h10\"/><path d=\"M7 12h5\"/><path d=\"M16 12h1\"/><path d=\"M7 16h2\"/><path d=\"M12 16h5\"/>"),
  "theme-toggle": ("<path d=\"M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 1 0 9.8 9.8Z\"/><path d=\"M18 3v3\"/><path d=\"M16.5 4.5h3\"/>"),
  "settings": ("<path d=\"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z\"/><path d=\"M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .3l-.1.1A2 2 0 1 1 4 16.9l.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 1 1 0-4h-.2a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.3-2L4 6.7A2 2 0 1 1 6.8 4l.1.1a1.8 1.8 0 0 0 2 .3 1.8 1.8 0 0 0 1-1.6V3a2 2 0 1 1 4 0v-.2a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.3l.1-.1A2 2 0 1 1 20 6.8l-.1.1a1.8 1.8 0 0 0-.3 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.8 1.8 0 0 0-1.4 1.2Z\"/>")
};

export function Furious5Icon({ name, title, ...props }: Furious5IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <g dangerouslySetInnerHTML={{ __html: paths[name] }} />
    </svg>
  );
}

export const CreateRoomIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="create-room" {...props} />;
export const JoinRoomIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="join-room" {...props} />;
export const RoomCodeIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="room-code" {...props} />;
export const StartGameIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="start-game" {...props} />;
export const DeckIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="deck" {...props} />;
export const DrawCardIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="draw-card" {...props} />;
export const DropCardIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="drop-card" {...props} />;
export const ComboPairIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="combo-pair" {...props} />;
export const ComboStraightIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="combo-straight" {...props} />;
export const CallFiveIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="call-five" {...props} />;
export const ShowdownIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="showdown" {...props} />;
export const TimerIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="timer" {...props} />;
export const TableFeltIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="table-felt" {...props} />;
export const ChipStackIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="chip-stack" {...props} />;
export const PlayerHandIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="player-hand" {...props} />;
export const ReconnectIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="reconnect" {...props} />;
export const SocketLiveIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="socket-live" {...props} />;
export const LobbyIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="lobby" {...props} />;
export const ThemeToggleIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="theme-toggle" {...props} />;
export const SettingsIcon = (props: Furious5IconOnlyProps) => <Furious5Icon name="settings" {...props} />;
