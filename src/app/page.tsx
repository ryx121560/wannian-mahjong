import { routes } from "./routes";

export default function Page() {
  return (
    <iframe
      src={routes.game}
      title="万年麻将"
      className="game-frame"
      allow="fullscreen"
    />
  );
}
