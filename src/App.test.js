import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { UIProvider } from "./state/UIContext";
import { LibraryProvider } from "./state/LibraryContext";
import { PlayerProvider } from "./state/PlayerContext";
import { SettingsProvider } from "./state/SettingsContext";

/**
 * Smoke test: the shell mounts, the catalogue resolves through MusicService,
 * and real content replaces the loading skeletons.
 *
 * jsdom implements no media pipeline, so HTMLMediaElement.play is stubbed —
 * without it every construction of AudioManager logs "not implemented".
 */
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = jest.fn();
  window.HTMLMediaElement.prototype.load = jest.fn();
});

beforeEach(() => {
  window.localStorage.clear();
});

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SettingsProvider>
        <UIProvider>
          <LibraryProvider>
            <PlayerProvider>
              <App />
            </PlayerProvider>
          </LibraryProvider>
        </UIProvider>
      </SettingsProvider>
    </MemoryRouter>
  );
}

test("renders the home page with catalogue content", async () => {
  renderApp("/");

  // Both the sidebar and the mobile bar are in the DOM; CSS decides which one
  // is shown, and jsdom applies no CSS, so assert on the pair.
  expect(screen.getAllByRole("navigation", { name: /main/i })).toHaveLength(2);

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /albums/i })).toBeInTheDocument();
  });

  expect(screen.getByText("Hidden Gems")).toBeInTheDocument();
});

test("shows an empty state for a search with no matches", async () => {
  renderApp("/search?q=zzzznotarealsong");

  await waitFor(() => {
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });
});
