import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { UIProvider } from "./state/UIContext";
import { AuthProvider } from "./state/AuthContext";
import { LibraryProvider } from "./state/LibraryContext";
import { PlayerProvider } from "./state/PlayerContext";
import { RoomProvider } from "./state/RoomContext";
import { SettingsProvider } from "./state/SettingsContext";
import reportWebVitals from "./reportWebVitals";
import "./styles/global.css";

/**
 * Provider order matters: PlayerProvider reads from both LibraryContext
 * (to record plays) and UIContext (to raise playback toasts), so it must sit
 * inside them. RoomProvider drives the player, so it sits inside PlayerProvider.
 */
const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <UIProvider>
          <AuthProvider>
            <LibraryProvider>
              <PlayerProvider>
                <RoomProvider>
                  <App />
                </RoomProvider>
              </PlayerProvider>
            </LibraryProvider>
          </AuthProvider>
        </UIProvider>
      </SettingsProvider>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
