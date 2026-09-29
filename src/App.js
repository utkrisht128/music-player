import React from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Library from "./pages/Library";
import Liked from "./pages/Liked";
import Recent from "./pages/Recent";
import Playlist from "./pages/Playlist";
import Album from "./pages/Album";
import Artist from "./pages/Artist";
import LocalMusic from "./pages/LocalMusic";
import NotFound from "./pages/NotFound";
import Mood from "./pages/Mood";
import Stats from "./pages/Stats";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import SharedTrack from "./pages/SharedTrack";
import SharedPlaylist from "./pages/SharedPlaylist";
import JoinPlaylist from "./pages/JoinPlaylist";
import AIPlaylist from "./pages/AIPlaylist";
import Room from "./pages/Room";
import Friends from "./pages/Friends";
import "./styles/app.css";

/**
 * Routes are nested under AppShell so the shell — and with it the audio
 * element inside the player — is never unmounted by navigation.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="library" element={<Library />} />
        <Route path="liked" element={<Liked />} />
        <Route path="recent" element={<Recent />} />
        <Route path="local" element={<LocalMusic />} />
        <Route path="playlist/:id" element={<Playlist />} />
        <Route path="album/:id" element={<Album />} />
        <Route path="artist/:id" element={<Artist />} />
        <Route path="mood/:id" element={<Mood />} />
        <Route path="stats" element={<Stats />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
        <Route path="track/:id" element={<SharedTrack />} />
        <Route path="shared" element={<SharedPlaylist />} />
        <Route path="join/:id" element={<JoinPlaylist />} />
        <Route path="ai" element={<AIPlaylist />} />
        <Route path="room" element={<Room />} />
        <Route path="room/:code" element={<Room />} />
        <Route path="friends" element={<Friends />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
